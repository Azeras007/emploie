import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdmin, hasAdmin, startSession, isSecretConfigured, MISSING_SECRET_MESSAGE } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Le nom d'utilisateur doit faire au moins 3 caractères.")
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Lettres, chiffres, point, tiret et souligné uniquement."),
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères.").max(200),
});

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && !isSecretConfigured()) {
    return NextResponse.json({ error: MISSING_SECRET_MESSAGE }, { status: 503 });
  }

  if (await hasAdmin()) {
    return NextResponse.json({ error: "Un compte existe déjà." }, { status: 409 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const user = await createAdmin(parsed.data.username, parsed.data.password);
  await startSession(user);
  return NextResponse.json({ ok: true });
}
