import { getSession } from "@/lib/auth";
import { getSettings, listApplicants, listStores } from "@/lib/db";
import { filtrerParPortee, peut } from "@/lib/permissions";
import { scoreApplicant } from "@/lib/scoring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Export CSV des candidatures.
 *
 * Une colonne par question, dans l'ordre du questionnaire : le tableur reste
 * lisible, et un tri par réponse redevient possible. L'export respecte la
 * portée du compte — un responsable de magasin n'exporte que le sien, sans
 * quoi le bouton d'export serait le trou dans la cloison.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!peut(session, "donnees")) {
    return new Response("Non autorisé", { status: 401 });
  }

  const [dossiers, settings, magasins] = await Promise.all([
    listApplicants(),
    getSettings(),
    listStores(),
  ]);
  const visibles = filtrerParPortee(dossiers, session);
  const nomMagasin = new Map(magasins.map((m) => [m.id, m.name]));

  const entetes = [
    "Référence",
    "Reçu le",
    "Prénom",
    "Nom",
    "E-mail",
    "Téléphone",
    "Ville",
    "Magasin",
    "Statut",
    "Score",
    "Écarté",
    "Documents",
    "Notes",
    ...settings.questions.map((q) => q.label),
  ];

  const lignes = visibles.map((d) => {
    const score = scoreApplicant(d, settings);
    return [
      d.ref,
      d.createdAt,
      d.identity.firstName,
      d.identity.lastName,
      d.identity.email,
      d.identity.phone,
      d.identity.city,
      d.storeId ? (nomMagasin.get(d.storeId) ?? "") : "",
      d.status,
      String(score.percent),
      score.disqualified ? "oui" : "non",
      d.files.map((f) => f.name).join(" | "),
      d.notes,
      ...settings.questions.map((q) => {
        const valeur = d.answers[q.id];
        if (valeur === null || valeur === undefined) return "";
        return Array.isArray(valeur) ? valeur.join(" | ") : String(valeur);
      }),
    ];
  });

  const csv = [entetes, ...lignes].map((ligne) => ligne.map(champ).join(";")).join("\r\n");

  // Point-virgule et BOM : c'est ce qu'attend Excel en configuration française.
  // Un CSV à virgules s'y ouvre en une seule colonne, et sans BOM les accents
  // arrivent en mojibake — deux façons sûres de faire douter du produit.
  const octets = new TextEncoder().encode(`﻿${csv}`);
  const jour = new Date().toISOString().slice(0, 10);

  return new Response(octets, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="candidatures-${jour}.csv"`,
      "cache-control": "no-store",
    },
  });
}

/** Échappement CSV : guillemets doublés, champ encadré dès qu'il le faut. */
function champ(valeur: string): string {
  const texte = (valeur ?? "").replace(/\r?\n/g, " ").trim();
  // Un champ qui commence par =, +, - ou @ est interprété comme une formule par
  // Excel et LibreOffice. Un candidat qui écrit « =1+1 » dans un champ libre
  // ne doit pas pouvoir faire exécuter quoi que ce soit au recruteur.
  const sur = /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
  return /[";\r\n]/.test(sur) ? `"${sur.replace(/"/g, '""')}"` : sur;
}
