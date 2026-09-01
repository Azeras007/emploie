import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionAvec } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { raisonSilence, rendre } from "@/lib/courriel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  to: z.string().trim().email("Indiquez une adresse valide."),
});

/**
 * Envoie un message d'essai.
 *
 * Sans ce bouton, la première vérification d'une configuration SMTP serait une
 * vraie candidature — et son échec, un candidat qui n'a rien reçu.
 */
export async function POST(request: Request) {
  const session = await sessionAvec("marque");
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const settings = await getSettings();
  const silence = raisonSilence(settings);
  if (silence) return NextResponse.json({ error: silence }, { status: 400 });

  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(process.env.SMTP_URL as string);
    await transport.sendMail({
      from: settings.emails.from,
      to: parsed.data.to,
      replyTo: settings.emails.replyTo || undefined,
      subject: rendre("Essai d'envoi — {{enseigne}}", { enseigne: settings.companyName }),
      text:
        "Ce message confirme que le serveur d'envoi est correctement configuré.\n\n" +
        `Expéditeur : ${settings.emails.from}\n` +
        `Réponse à  : ${settings.emails.replyTo || "(non renseigné)"}\n`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Le message brut du serveur SMTP : « 535 authentication failed » se
    // corrige, « envoi impossible » n'apprend rien.
    return NextResponse.json(
      { error: `Le serveur d'envoi a refusé : ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
