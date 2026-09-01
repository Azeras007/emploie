import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { findUser, getUser, listUsers, saveUser } from "./db";
import { peut, type Permission } from "./permissions";
import { uid } from "./ids";
import type { User } from "./types";

export const SESSION_COOKIE = "kiabi_recrutement_session";

/** Vrai quand le secret de signature des sessions est configuré. */
export function isSecretConfigured(): boolean {
  return Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
}

export const MISSING_SECRET_MESSAGE =
  "Configuration incomplète : la variable d'environnement AUTH_SECRET est absente. " +
  "Ajoutez-la (openssl rand -base64 32) puis redéployez.";

const MAX_AGE = 60 * 60 * 24 * 7;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET est absent. Sans lui, les sessions administrateur seraient falsifiables. " +
          "Ajoutez une variable d'environnement AUTH_SECRET (32 caractères aléatoires) et redéployez."
      );
    }
    return new TextEncoder().encode("developpement-local-uniquement".padEnd(32, "."));
  }
  return new TextEncoder().encode(value.padEnd(32, "."));
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hasAdmin(): Promise<boolean> {
  const users = await listUsers();
  return users.length > 0;
}

/**
 * Le tout premier compte. Il est propriétaire : c'est celui qui installe, et il
 * doit pouvoir tout régler, la marque comprise. Les comptes suivants se créent
 * depuis les réglages, avec le rôle qu'on leur choisit.
 */
export async function createAdmin(username: string, password: string): Promise<User> {
  const user: User = {
    id: uid(),
    username: username.trim(),
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
    role: "proprietaire",
    displayName: username.trim(),
    email: "",
    storeId: null,
    active: true,
    lastLoginAt: null,
  };
  await saveUser(user);
  return user;
}

/**
 * Vérifie un couple identifiant / mot de passe.
 *
 * Un compte désactivé passe par la vérification du mot de passe avant d'être
 * refusé : répondre plus tôt permettrait à un curieux de distinguer « compte
 * désactivé » de « mot de passe faux » au chronomètre.
 */
export async function authenticate(username: string, password: string): Promise<User | null> {
  const user = await findUser(username);
  if (!user) {
    // Un haché jeté pour rien : sans lui, un identifiant inexistant répondrait
    // instantanément, et la liste des comptes se devinerait au temps de réponse.
    await verifyPassword(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin");
    return null;
  }
  const bon = await verifyPassword(password, user.passwordHash);
  if (!bon || !user.active) return null;

  // La dernière connexion sert à repérer les comptes dormants au moment de
  // faire le ménage. L'échec d'écriture ne doit pas empêcher de se connecter.
  saveUser({ ...user, lastLoginAt: new Date().toISOString() }).catch((err: unknown) => {
    console.error("Horodatage de connexion impossible", err);
  });
  return user;
}

export async function startSession(user: User): Promise<void> {
  // Le jeton ne porte que l'identifiant. Le rôle, le magasin et l'état du
  // compte sont relus en base à chaque requête : un compte rétrogradé ou
  // désactivé perd ses droits immédiatement, sans attendre l'expiration d'un
  // jeton vieux d'une semaine.
  const jwt = await new SignJWT({ uid: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export interface Session {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  role: User["role"];
  storeId: string | null;
}

/**
 * La session en cours, ou null.
 *
 * Enveloppée dans `cache` : une page peut l'appeler cinq fois — la garde du
 * layout, la page elle-même, deux composants — et la base n'est interrogée
 * qu'une seule fois par requête.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  let uid: string;
  try {
    const { payload } = await jwtVerify(raw, secret());
    uid = String(payload.uid);
  } catch {
    return null;
  }

  const user = await getUser(uid);
  // Compte supprimé ou désactivé : le jeton reste valide, la session non.
  if (!user || !user.active) return null;

  return {
    uid: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    email: user.email,
    role: user.role,
    storeId: user.storeId,
  };
});

/**
 * La session, à condition qu'elle porte la permission demandée.
 *
 * Rend null dans les deux cas — pas de session, ou session sans le droit. Les
 * routes répondent 401 dans les deux cas : distinguer « non connecté » de
 * « connecté mais interdit » renseigne un curieux sur ce qui existe.
 */
export async function sessionAvec(permission: Permission): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;
  return peut(session, permission) ? session : null;
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}
