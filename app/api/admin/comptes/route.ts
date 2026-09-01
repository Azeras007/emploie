import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, hashPassword, sessionAvec } from "@/lib/auth";
import { deleteUser, getUser, listUsers, saveUser } from "@/lib/db";
import { uid } from "@/lib/ids";
import { ROLES, type Role, type User } from "@/lib/types";

export const dynamic = "force-dynamic";

const roleEnum = z.enum(ROLES.map((r) => r.value) as [Role, ...Role[]]);

const schema = z.object({
  id: z.string().optional(),
  username: z
    .string()
    .trim()
    .min(3, "L'identifiant fait au moins 3 caractères.")
    .max(40)
    .regex(/^[a-z0-9._-]+$/i, "Lettres, chiffres, point, tiret et souligné uniquement."),
  displayName: z.string().trim().max(80).default(""),
  email: z.string().trim().max(160).default(""),
  role: roleEnum,
  storeId: z.string().nullable().default(null),
  active: z.boolean().default(true),
  /** Seulement à la création, ou pour réinitialiser. */
  password: z.string().min(8, "Le mot de passe fait au moins 8 caractères.").max(200).optional(),
});

/** Ce qu'on renvoie au navigateur : jamais le haché du mot de passe. */
function public_(user: User) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    storeId: user.storeId,
    active: user.active,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function GET() {
  if (!(await sessionAvec("comptes"))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, comptes: (await listUsers()).map(public_) });
}

export async function PUT(request: Request) {
  const session = await sessionAvec("comptes");
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const entree = parsed.data;

  // Un administrateur ne fabrique pas un propriétaire : ce serait s'accorder
  // soi-même l'accès à la marque et aux réglages techniques par personne
  // interposée.
  if (entree.role === "proprietaire" && session.role !== "proprietaire") {
    return NextResponse.json(
      { error: "Seul un propriétaire peut créer ou promouvoir un propriétaire." },
      { status: 403 }
    );
  }
  if (entree.role === "magasin" && !entree.storeId) {
    return NextResponse.json(
      { error: "Un responsable de magasin doit être rattaché à un magasin." },
      { status: 400 }
    );
  }

  const tous = await listUsers();
  const ancien = entree.id ? tous.find((u) => u.id === entree.id) : undefined;
  if (entree.id && !ancien) {
    return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  }

  const doublon = tous.find(
    (u) => u.id !== ancien?.id && u.username.toLowerCase() === entree.username.toLowerCase()
  );
  if (doublon) {
    return NextResponse.json({ error: "Cet identifiant est déjà pris." }, { status: 409 });
  }

  if (!ancien && !entree.password) {
    return NextResponse.json({ error: "Un mot de passe est nécessaire." }, { status: 400 });
  }

  // Le dernier propriétaire actif ne peut ni se rétrograder ni se désactiver :
  // l'installation deviendrait impossible à administrer, et le seul recours
  // serait une intervention en base.
  if (ancien?.role === "proprietaire" && (entree.role !== "proprietaire" || !entree.active)) {
    const autres = tous.filter(
      (u) => u.id !== ancien.id && u.role === "proprietaire" && u.active
    );
    if (autres.length === 0) {
      return NextResponse.json(
        { error: "C'est le dernier propriétaire actif : nommez-en un autre d'abord." },
        { status: 409 }
      );
    }
  }

  const user: User = {
    id: ancien?.id ?? uid(),
    username: entree.username,
    passwordHash: entree.password
      ? await hashPassword(entree.password)
      : (ancien?.passwordHash as string),
    createdAt: ancien?.createdAt ?? new Date().toISOString(),
    role: entree.role,
    displayName: entree.displayName || entree.username,
    email: entree.email,
    storeId: entree.role === "magasin" ? entree.storeId : null,
    active: entree.active,
    lastLoginAt: ancien?.lastLoginAt ?? null,
  };

  await saveUser(user);
  return NextResponse.json({ ok: true, compte: public_(user) });
}

export async function DELETE(request: Request) {
  const session = await sessionAvec("comptes");
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id") ?? "";
  const cible = id ? await getUser(id) : null;
  if (!cible) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });

  // Se supprimer soi-même déconnecte au milieu de l'opération et laisse
  // l'écran dans un état incompréhensible.
  const moi = await getSession();
  if (moi?.uid === cible.id) {
    return NextResponse.json({ error: "On ne supprime pas son propre compte." }, { status: 409 });
  }
  if (cible.role === "proprietaire" && session.role !== "proprietaire") {
    return NextResponse.json(
      { error: "Seul un propriétaire peut supprimer un propriétaire." },
      { status: 403 }
    );
  }

  const restants = (await listUsers()).filter(
    (u) => u.id !== cible.id && u.role === "proprietaire" && u.active
  );
  if (cible.role === "proprietaire" && restants.length === 0) {
    return NextResponse.json(
      { error: "C'est le dernier propriétaire actif : nommez-en un autre d'abord." },
      { status: 409 }
    );
  }

  await deleteUser(cible.id);
  return NextResponse.json({ ok: true });
}
