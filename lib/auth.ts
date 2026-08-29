import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { findUser, listUsers, saveUser } from "./db";
import { uid } from "./ids";
import type { User } from "./types";

export const SESSION_COOKIE = "emploie_session";

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

export async function createAdmin(username: string, password: string): Promise<User> {
  const user: User = {
    id: uid(),
    username: username.trim(),
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  await saveUser(user);
  return user;
}

export async function authenticate(username: string, password: string): Promise<User | null> {
  const user = await findUser(username);
  if (!user) return null;
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

export async function startSession(user: User): Promise<void> {
  const jwt = await new SignJWT({ uid: user.id, username: user.username })
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
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    return { uid: String(payload.uid), username: String(payload.username) };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}
