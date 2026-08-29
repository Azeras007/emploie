import { NextResponse } from "next/server";
import { z } from "zod";
import { getInviteByToken, getSettings, saveApplicant, saveInvite } from "@/lib/db";
import { makeRef, token as makeToken, uid } from "@/lib/ids";
import { verifyFile } from "@/lib/signing";
import type { Applicant, AnswerValue, StoredFile } from "@/lib/types";

export const runtime = "nodejs";

const fileSchema = z.object({
  file: z.object({
    id: z.string(),
    kind: z.enum(["cv", "lettre", "autre"]),
    name: z.string(),
    mime: z.string(),
    size: z.number(),
    key: z.string(),
    uploadedAt: z.string(),
  }),
  signature: z.string(),
});

const bodySchema = z.object({
  identity: z.object({
    firstName: z.string().trim().min(1, "Le prénom est obligatoire.").max(80),
    lastName: z.string().trim().min(1, "Le nom est obligatoire.").max(80),
    email: z.string().trim().email("Cette adresse e-mail n'est pas valide.").max(160),
    phone: z.string().trim().max(40).default(""),
    city: z.string().trim().max(120).default(""),
  }),
  answers: z.record(z.union([z.string(), z.number(), z.array(z.string()), z.null()])),
  files: z.array(fileSchema).max(12),
  inviteToken: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." },
      { status: 400 }
    );
  }
  const { identity, answers, files, inviteToken } = parsed.data;

  const settings = await getSettings();

  // Required questions must actually carry an answer.
  for (const question of settings.questions) {
    if (!question.required) continue;
    const value = answers[question.id] as AnswerValue;
    const empty =
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);
    if (empty) {
      return NextResponse.json(
        { error: `Une réponse est attendue : « ${question.label} »` },
        { status: 400 }
      );
    }
  }

  // Only keep descriptors this server actually issued.
  const accepted: StoredFile[] = [];
  for (const entry of files) {
    if (verifyFile(entry.file as StoredFile, entry.signature)) accepted.push(entry.file as StoredFile);
  }
  if (accepted.length !== files.length) {
    return NextResponse.json(
      { error: "Un document n'a pas pu être vérifié. Renvoyez-le puis réessayez." },
      { status: 400 }
    );
  }

  // Drop answers that no longer match a question.
  const known = new Set(settings.questions.map((q) => q.id));
  const cleanAnswers: Record<string, AnswerValue> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (known.has(key)) cleanAnswers[key] = value as AnswerValue;
  }

  const now = new Date();
  const applicant: Applicant = {
    id: uid(),
    ref: makeRef(now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    identity,
    answers: cleanAnswers,
    files: accepted,
    status: "nouveau",
    rating: 0,
    notes: "",
    inviteToken: inviteToken || null,
    shareToken: makeToken(20),
  };

  await saveApplicant(applicant);

  if (inviteToken) {
    const invite = await getInviteByToken(inviteToken);
    if (invite) await saveInvite({ ...invite, uses: invite.uses + 1 });
  }

  return NextResponse.json({ ok: true, ref: applicant.ref });
}
