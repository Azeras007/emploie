import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, endSession, startSession, isSecretConfigured, MISSING_SECRET_MESSAGE } from "@/lib/auth";
import { StorageError, storageStatus } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && !isSecretConfigured()) {
    return NextResponse.json({ error: MISSING_SECRET_MESSAGE }, { status: 503 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiants incomplets." }, { status: 400 });
  }

  try {
    const user = await authenticate(parsed.data.username, parsed.data.password);
    if (!user) {
      // Slow the loop down a little without leaking which half was wrong.
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json({ error: "Identifiant ou mot de passe incorrect." }, { status: 401 });
    }

    await startSession(user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Connexion impossible", err);
    const storage = await storageStatus();
    return NextResponse.json(
      {
        error:
          !storage.ok
            ? storage.problem
            : err instanceof StorageError
              ? err.message
              : "La connexion a échoué. Détail dans les journaux du serveur.",
      },
      { status: 503 }
    );
  }
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
