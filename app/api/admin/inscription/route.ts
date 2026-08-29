import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdmin, hasAdmin, startSession, isSecretConfigured, MISSING_SECRET_MESSAGE } from "@/lib/auth";
import { StorageError, storageStatus } from "@/lib/db";

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

  const storage = await storageStatus();
  if (!storage.ok) {
    return NextResponse.json({ error: storage.problem }, { status: 503 });
  }

  if (await hasAdmin()) {
    return NextResponse.json({ error: "Un compte existe déjà." }, { status: 409 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const user = await createAdmin(parsed.data.username, parsed.data.password);
    await startSession(user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Création du compte administrateur impossible", err);
    return NextResponse.json(
      {
        error:
          err instanceof StorageError
            ? err.message
            : "Le compte n'a pas pu être enregistré. Détail dans les journaux du serveur.",
      },
      { status: 500 }
    );
  }
}
