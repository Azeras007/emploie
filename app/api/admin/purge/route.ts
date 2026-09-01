import { NextResponse } from "next/server";
import { sessionAvec } from "@/lib/auth";
import { deleteApplicant, listApplicants } from "@/lib/db";
import { deleteFile } from "@/lib/storage";
import type { Applicant } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Purge des dossiers arrivés à échéance.
 *
 * Chaque candidature porte sa propre date de péremption, figée au dépôt : on
 * n'applique jamais rétroactivement une durée de conservation que le candidat
 * n'a pas connue. Les dossiers sans date — déposés avant que la conservation
 * ne soit réglée — ne sont jamais purgés.
 *
 * Les fichiers partent avec le dossier. Un CV orphelin sur le disque, c'est
 * précisément la donnée personnelle qu'on croyait avoir effacée.
 */
function echus(dossiers: Applicant[], maintenant = Date.now()): Applicant[] {
  return dossiers.filter((d) => {
    if (!d.purgeAt) return false;
    const echeance = Date.parse(d.purgeAt);
    return Number.isFinite(echeance) && echeance <= maintenant;
  });
}

/** GET — combien de dossiers sont à purger, sans rien supprimer. */
export async function GET() {
  if (!(await sessionAvec("donnees"))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const dossiers = await listApplicants();
  const cibles = echus(dossiers);
  return NextResponse.json({
    ok: true,
    total: dossiers.length,
    echus: cibles.length,
    prochaine: prochaineEcheance(dossiers),
  });
}

export async function POST() {
  if (!(await sessionAvec("donnees"))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const cibles = echus(await listApplicants());
  let fichiers = 0;
  const echecs: string[] = [];

  for (const dossier of cibles) {
    try {
      for (const fichier of dossier.files) {
        await deleteFile(fichier.key);
        fichiers += 1;
      }
      await deleteApplicant(dossier.id);
    } catch (err) {
      // On continue : un dossier récalcitrant ne doit pas bloquer les autres.
      echecs.push(`${dossier.ref} (${err instanceof Error ? err.message : "erreur"})`);
    }
  }

  return NextResponse.json({
    ok: true,
    supprimes: cibles.length - echecs.length,
    fichiers,
    echecs,
  });
}

function prochaineEcheance(dossiers: Applicant[]): string | null {
  const dates = dossiers
    .map((d) => (d.purgeAt ? Date.parse(d.purgeAt) : NaN))
    .filter((n) => Number.isFinite(n) && n > Date.now())
    .sort((a, b) => a - b);
  return dates.length > 0 ? new Date(dates[0]).toISOString() : null;
}
