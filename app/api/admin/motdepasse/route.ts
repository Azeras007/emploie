import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { listUsers, saveUser } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1, "Le mot de passe actuel est requis."),
  newPassword: z.string().min(8, "Le nouveau mot de passe doit faire au moins 8 caractères."),
});

/** PUT — change le mot de passe du compte connecté. */
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

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

  const { currentPassword, newPassword } = parsed.data;

  const users = await listUsers();
  const user = users.find((u) => u.id === session.uid);
  if (!user) {
    return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  }

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Le mot de passe actuel est incorrect." }, { status: 400 });
  }

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit être différent de l'actuel." },
      { status: 400 }
    );
  }

  await saveUser({ ...user, passwordHash: await hashPassword(newPassword) });

  return NextResponse.json({ ok: true });
}
