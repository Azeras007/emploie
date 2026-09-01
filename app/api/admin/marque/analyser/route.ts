import { NextResponse } from "next/server";
import { z } from "zod";
import { analyserSite, UrlRefusee } from "@/lib/aspiration";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
// L'analyse tire une page et jusqu'à six feuilles de style : la valeur par
// défaut de Next serait courte pour un site lent.
export const maxDuration = 60;

const schema = z.object({
  url: z.string().min(3, "Indiquez l'adresse du site de l'enseigne."),
});

export async function POST(request: Request) {
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
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Une adresse sans schéma est le cas courant : « kiabi.com » plutôt que
  // « https://kiabi.com ». On complète, on ne renvoie pas l'opérateur à sa copie.
  const brut = parsed.data.url.trim();
  const adresse = /^https?:\/\//i.test(brut) ? brut : `https://${brut}`;

  try {
    const proposition = await analyserSite(adresse);
    return NextResponse.json({ ok: true, proposition });
  } catch (err) {
    if (err instanceof UrlRefusee) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Le message brut plutôt qu'un « analyse impossible » : c'est presque
    // toujours un détail réseau que l'opérateur peut corriger lui-même.
    return NextResponse.json(
      { error: `Analyse impossible : ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
