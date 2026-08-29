import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { deleteInvite, listInvites, saveInvite } from "@/lib/db";
import { token as makeToken, uid } from "@/lib/ids";
import type { Invite } from "@/lib/types";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  label: z.string().max(120, "Libellé trop long (120 caractères maximum).").nullish(),
});

/** Chaque appel renvoie sa propre réponse : on ne réutilise pas un objet Response. */
function unauthorized() {
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}

/** GET — la liste des liens d'invitation, du plus récent au plus ancien. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const invites = await listInvites();
  return NextResponse.json({ invites });
}

/** POST — crée un lien de candidature. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const invite: Invite = {
    id: uid(),
    token: makeToken(18),
    label: (parsed.data.label ?? "").trim() || "Lien de candidature",
    createdAt: new Date().toISOString(),
    uses: 0,
    active: true,
  };

  await saveInvite(invite);
  return NextResponse.json({ ok: true, invite }, { status: 201 });
}

/** DELETE ?id=… — supprime un lien. */
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Identifiant du lien manquant." }, { status: 400 });
  }

  const invites = await listInvites();
  if (!invites.some((i) => i.id === id)) {
    return NextResponse.json({ error: "Lien introuvable." }, { status: 404 });
  }

  await deleteInvite(id);
  return NextResponse.json({ ok: true });
}
