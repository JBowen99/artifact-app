import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from "jose";
import * as fs from "node:fs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { redis } from "@/lib/redis";
import { config } from "@/config/env";
import { logger } from "@/lib/logger";

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

let privateKey: CryptoKey | null = null;
let publicKey: CryptoKey | null = null;

export async function loadJWTKeys(): Promise<void> {
  const privPem = fs.readFileSync(config.jwt.privateKeyPath, "utf-8");
  const pubPem = fs.readFileSync(config.jwt.publicKeyPath, "utf-8");
  privateKey = await importPKCS8(privPem, "RS256");
  publicKey = await importSPKI(pubPem, "RS256");
  logger.info("Loaded JWT key pair");
}

function getPrivateKey(): CryptoKey {
  if (!privateKey) throw new Error("JWT private key not loaded");
  return privateKey;
}

function getPublicKey(): CryptoKey {
  if (!publicKey) throw new Error("JWT public key not loaded");
  return publicKey;
}

export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<UserRow> {
  const hash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: hash,
      displayName,
      role: "contributor",
    })
    .returning();

  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function login(
  email: string,
  password: string,
): Promise<{ pair: TokenPair; user: UserRow }> {
  const user = await getUserByEmail(email);
  if (!user) {
    throw new Error("invalid credentials");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error("invalid credentials");
  }

  const pair = await generateTokenPair(user.id, user.role);
  return { pair, user };
}

export async function refresh(
  refreshToken: string,
): Promise<{ pair: TokenPair; user: UserRow }> {
  const claims = await parseToken(refreshToken);

  const jti = claims.jti as string;
  if (!jti) throw new Error("invalid refresh token: missing jti");

  const blocked = await redis.exists(`refresh_blocklist:${jti}`);
  if (blocked > 0) throw new Error("refresh token revoked");

  const sub = claims.sub as string;
  if (!sub) throw new Error("invalid token: missing sub");

  const user = await getUserById(sub);
  if (!user) throw new Error("user not found");

  await revokeRefreshToken(jti, claims);

  const pair = await generateTokenPair(user.id, user.role);
  return { pair, user };
}

export async function logout(refreshToken: string): Promise<void> {
  try {
    const claims = await parseToken(refreshToken);
    const jti = claims.jti as string;
    if (jti) {
      await revokeRefreshToken(jti, claims);
    }
  } catch {}
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function updateUser(
  id: string,
  displayName?: string,
  email?: string,
): Promise<UserRow> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (displayName !== undefined) updates.displayName = displayName;
  if (email !== undefined) updates.email = email;

  const [user] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning();

  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function getUserByEmail(email: string): Promise<UserRow | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function generateTokenPair(
  userId: string,
  role: string,
): Promise<TokenPair> {
  const now = Math.floor(Date.now() / 1000);

  const accessToken = await new SignJWT({
    sub: userId,
    role,
    iss: "artifact",
    iat: now,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setExpirationTime(now + Math.floor(config.jwt.accessTTL / 1000))
    .sign(getPrivateKey());

  const refreshJti = crypto.randomUUID();
  const refreshToken = await new SignJWT({
    sub: userId,
    jti: refreshJti,
    iss: "artifact",
    iat: now,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setExpirationTime(now + Math.floor(config.jwt.refreshTTL / 1000))
    .sign(getPrivateKey());

  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(config.jwt.accessTTL / 1000),
  };
}

interface TokenClaims {
  sub?: string;
  jti?: string;
  iss?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

async function parseToken(token: string): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, getPublicKey(), {
    issuer: "artifact",
  });
  return payload as TokenClaims;
}

async function revokeRefreshToken(
  jti: string,
  claims: TokenClaims,
): Promise<void> {
  const exp = claims.exp;
  if (!exp) return;

  const ttlMs = exp * 1000 - Date.now();
  if (ttlMs <= 0) return;

  await redis.set(`refresh_blocklist:${jti}`, "1", "PX", ttlMs);
}
