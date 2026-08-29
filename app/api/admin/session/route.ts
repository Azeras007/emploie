import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, endSession, startSession } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiants incomplets." }, { status: 400 });
  }

  const user = await authenticate(parsed.data.username, parsed.data.password);
  if (!user) {
    // Slow the loop down a little without leaking which half was wrong.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Identifiant ou mot de passe incorrect." }, { status: 401 });
  }

  await startSession(user);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
