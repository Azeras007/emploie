import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { peut, voitDossier } from "@/lib/permissions";
import { deleteApplicant, getApplicant, saveApplicant } from "@/lib/db";
import { deleteFile } from "@/lib/storage";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["nouveau", "en_revue", "entretien", "retenu", "refuse"]).optional(),
  rating: z.number().int().min(0).max(5).optional(),
  notes: z.string().max(20000).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!peut(session, "traiter")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const applicant = await getApplicant(id);
  if (!applicant) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  // Hors de la portée du compte : « introuvable », et non « interdit ». Un
  // responsable de magasin n'a pas à apprendre qu'un dossier existe ailleurs.
  if (!voitDossier(applicant, session)) {
    return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Modification invalide." }, { status: 400 });
  }

  const updated = {
    ...applicant,
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };
  await saveApplicant(updated);
  return NextResponse.json({ ok: true, applicant: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Supprimer relève de « donnees », pas de « traiter » : un recruteur change
  // un statut, il n'efface pas un dossier — ni les fichiers qui vont avec.
  const session = await getSession();
  if (!peut(session, "donnees")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const applicant = await getApplicant(id);
  if (!applicant) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  if (!voitDossier(applicant, session)) {
    return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  }

  await Promise.all(applicant.files.map((f) => deleteFile(f.key)));
  await deleteApplicant(id);
  return NextResponse.json({ ok: true });
}
