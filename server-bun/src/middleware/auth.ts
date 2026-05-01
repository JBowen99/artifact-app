import Elysia from "elysia";
import { jwtVerify, importSPKI } from "jose";
import * as fs from "node:fs";
import { config } from "@/config/env";
import { logger } from "@/lib/logger";

let publicKey: CryptoKey | null = null;

export async function loadPublicKey(): Promise<CryptoKey> {
  if (publicKey) return publicKey;
  const pem = fs.readFileSync(config.jwt.publicKeyPath, "utf-8");
  publicKey = await importSPKI(pem, "RS256");
  logger.info("Loaded JWT public key");
  return publicKey;
}

export async function validateAccessToken(token: string): Promise<string> {
  const key = await loadPublicKey();
  const { payload } = await jwtVerify(token, key, {
    issuer: "artifact",
  });

  const sub = payload.sub;
  if (!sub) {
    throw new Error("invalid token: missing sub");
  }

  return sub;
}

export const authPlugin = new Elysia({ name: "auth" })
  .derive(async ({ request }): Promise<{ userId: string | null }> => {    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return { userId: null };
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      return { userId: null };
    }

    const token = parts[1];
    if (!token) {
      return { userId: null };
    }

    try {
      const userId = await validateAccessToken(token);
      return { userId };
    } catch {
      return { userId: null };
    }
  });

export const requireAuth = new Elysia({ name: "require-auth" })
  .use(authPlugin)
  .onBeforeHandle(({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      return {
        error: {
          code: "INVALID_TOKEN",
          message: "Token is invalid or expired",
        },
      };
    }
  });
