import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getTheme, oublierTheme, saveTheme } from "@/lib/db";
import { estHex } from "@/lib/couleurs";
import type { JetonCouleur, Theme } from "@/lib/theme";

export const dynamic = "force-dynamic";

const hex = z
  .string()
  .refine((v) => estHex(v), "Couleur attendue au format #rrggbb.");

const schema = z.object({
  nom: z.string().min(1, "Le nom de l'enseigne est nécessaire.").max(60),
  couleurs: z.object({
    primaire: hex,
    accent: hex,
    retenu: hex,
    encre: hex,
  }),
  ajustements: z.record(z.string(), z.string()).default({}),
  polices: z.object({
    titre: z.string().max(60),
    texte: z.string().max(60),
  }),
  rayons: z.object({
    champ: z.coerce.number().min(0).max(40),
    carte: z.coerce.number().min(0).max(48),
  }),
  // Le logotype importé ne transite pas ici : ses octets sont écrits par
  // /api/admin/marque/logo et conservés tels quels d'un enregistrement à
  // l'autre. Un aller-retour de 256 Ko en base64 à chaque réglage de couleur
  // serait du gaspillage, et un formulaire mal recalé pourrait l'effacer.
  logo: z.object({
    fichier: z.string().max(300),
    mot: z.string().max(60),
    capitales: z.boolean(),
  }),
  /** Efface le logotype importé — la seule façon de s'en débarrasser. */
  supprimerLogo: z.boolean().optional(),
});

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const chemin = issue.path.join(".");
    return NextResponse.json(
      { error: `Thème invalide${chemin ? ` (${chemin})` : ""} : ${issue.message}` },
      { status: 400 }
    );
  }

  // Le chemin du logotype est servi tel quel dans un <img src> : on n'accepte
  // qu'un chemin absolu du même site. Une adresse externe ferait sortir une
  // requête du navigateur du candidat vers un domaine tiers, et « javascript: »
  // serait une injection.
  const fichier = parsed.data.logo.fichier.trim();
  if (fichier && !fichier.startsWith("/")) {
    return NextResponse.json(
      { error: "Le logotype doit être un chemin local, commençant par « / »." },
      { status: 400 }
    );
  }

  const ajustements: Partial<Record<JetonCouleur, string>> = {};
  for (const [jeton, valeur] of Object.entries(parsed.data.ajustements)) {
    if (valeur && estHex(valeur)) ajustements[jeton as JetonCouleur] = valeur;
  }

  // Les octets du logotype survivent à l'enregistrement, sauf demande contraire.
  const actuel = await getTheme();
  const conserve = parsed.data.supprimerLogo
    ? { donnees: "", type: "", version: "" }
    : { donnees: actuel.logo.donnees, type: actuel.logo.type, version: actuel.logo.version };

  const theme: Theme = {
    nom: parsed.data.nom,
    couleurs: parsed.data.couleurs,
    ajustements,
    polices: parsed.data.polices,
    rayons: parsed.data.rayons,
    logo: { ...parsed.data.logo, fichier, ...conserve },
  };

  try {
    const enregistre = await saveTheme(theme);
    oublierTheme();
    return NextResponse.json({ ok: true, theme: enregistre });
  } catch (err) {
    return NextResponse.json(
      { error: `Enregistrement impossible : ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
