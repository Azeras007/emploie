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
    // 10 caractères suffisent : ces adresses sont publiques par destination
    // (elles finissent sur une vitrine), et un jeton plus court allège le QR —
    // 41×41 modules au lieu de 45×45, donc des modules plus gros à taille
    // d'impression égale, lisibles de plus loin.
    token: makeToken(10),
    label: (parsed.data.label ?? "").trim() || "Lien de candidature",
    createdAt: new Date().toISOString(),
    uses: 0,
    active: true,
  };

  await saveInvite(invite);
  return NextResponse.json({ ok: true, invite }, { status: 201 });
}

/** DELETE ?id=… — supprime un lien. */
const patchSchema = z.object({
  id: z.string().min(1),
  printed: z.boolean().optional(),
  active: z.boolean().optional(),
});

/** Marque un lien comme imprimé — ou revient dessus. */
export async function PATCH(req: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Modification invalide." }, { status: 400 });
  }

  const invites = await listInvites();
  const invite = invites.find((i) => i.id === parsed.data.id);
  if (!invite) {
    return NextResponse.json({ error: "Lien introuvable." }, { status: 404 });
  }

  const updated = {
    ...invite,
    ...(parsed.data.printed !== undefined ? { printed: parsed.data.printed } : {}),
    ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
  };
  await saveInvite(updated);
  return NextResponse.json({ ok: true, invite: updated });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Identifiant du lien manquant." }, { status: 400 });
  }

  const invites = await listInvites();
  const invite = invites.find((i) => i.id === id);
  if (!invite) {
    return NextResponse.json({ error: "Lien introuvable." }, { status: 404 });
  }

  // Un lien imprimé vit sur une devanture, un flyer, une affiche : son adresse
  // ne peut plus être reprise. On refuse de le supprimer tant qu'il est marqué
  // comme tel — le désactiver reste possible, et le questionnaire général
  // continuera de répondre à son adresse.
  if (invite.printed) {
    return NextResponse.json(
      {
        error:
          "Ce lien est marqué comme imprimé : son QR code circule déjà. " +
          "Retirez d'abord la mention « imprimé » si vous êtes certain qu'aucun " +
          "support ne le porte plus.",
      },
      { status: 409 }
    );
  }

  await deleteInvite(id);
  return NextResponse.json({ ok: true });
}
