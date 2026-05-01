import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { locks, files, users } from "@/db/schema";
import { redis } from "@/lib/redis";
import { config } from "@/config/env";
import { logger } from "@/lib/logger";

export interface LockRow {
  id: string;
  fileId: string;
  userId: string;
  workspaceId: string | null;
  lockedAt: Date;
  expiresAt: Date | null;
}

export interface LockWithDetails extends LockRow {
  filePath: string;
  userName: string;
}

export async function lockFile(
  fileID: string,
  userID: string,
  workspaceID?: string,
  expiresAt?: Date,
): Promise<LockRow> {
  const redisKey = `lock:${fileID}`;
  const existing = await redis.get(redisKey);
  if (existing) {
    try {
      const data = JSON.parse(existing);
      if (!data.expires_at || data.expires_at > Date.now() / 1000) {
        throw new Error("file is locked by another user");
      }
    } catch (e) {
      if (e instanceof Error && e.message === "file is locked by another user") throw e;
    }
  }

  const expiresAtValue = expiresAt || new Date(Date.now() + config.lock.defaultTTL);

  const [lock] = await db
    .insert(locks)
    .values({
      fileId: fileID,
      userId: userID,
      workspaceId: workspaceID || null,
      expiresAt: expiresAtValue,
    })
    .returning();

  const redisData = {
    lock_id: lock.id,
    user_id: userID,
    expires_at: lock.expiresAt ? lock.expiresAt.getTime() / 1000 : 0,
  };

  const ttl = expiresAtValue.getTime() - Date.now();
  if (ttl > 0) {
    await redis.set(redisKey, JSON.stringify(redisData), "PX", ttl);
  }

  return mapLock(lock);
}

export async function unlockFile(fileID: string, userID: string): Promise<void> {
  const [lock] = await db.select().from(locks).where(eq(locks.fileId, fileID)).limit(1);
  if (!lock) throw new Error("file is not locked");

  if (lock.userId !== userID) throw new Error("lock is owned by another user");

  await db.delete(locks).where(eq(locks.id, lock.id));
  await redis.del(`lock:${fileID}`);
}

export async function getLock(fileID: string): Promise<LockRow | null> {
  const [lock] = await db.select().from(locks).where(eq(locks.fileId, fileID)).limit(1);
  if (!lock) return null;

  if (lock.expiresAt && lock.expiresAt < new Date()) {
    await db.delete(locks).where(eq(locks.id, lock.id));
    await redis.del(`lock:${fileID}`);
    return null;
  }

  return mapLock(lock);
}

export async function isFileLockedByUser(
  fileID: string,
  userID: string,
): Promise<boolean> {
  const lock = await getLock(fileID);
  if (!lock) return false;
  return lock.userId === userID;
}

export async function listLocksByProject(projectID: string): Promise<LockWithDetails[]> {
  const rows = await db
    .select({
      id: locks.id,
      fileId: locks.fileId,
      userId: locks.userId,
      workspaceId: locks.workspaceId,
      lockedAt: locks.lockedAt,
      expiresAt: locks.expiresAt,
      filePath: files.path,
      userName: users.displayName,
    })
    .from(locks)
    .innerJoin(files, eq(locks.fileId, files.id))
    .innerJoin(users, eq(locks.userId, users.id))
    .where(eq(files.projectId, projectID))
    .orderBy(sql`${locks.lockedAt} DESC`);

  return rows.map((r) => ({
    id: r.id,
    fileId: r.fileId,
    userId: r.userId,
    workspaceId: r.workspaceId,
    lockedAt: r.lockedAt,
    expiresAt: r.expiresAt,
    filePath: r.filePath,
    userName: r.userName,
  }));
}

export function startSweeper(): ReturnType<typeof setInterval> {
  const interval = setInterval(async () => {
    try {
      const result = await db
        .delete(locks)
        .where(sql`${locks.expiresAt} IS NOT NULL AND ${locks.expiresAt} < now()`)
        .returning();

      if (result.length > 0) {
        logger.info({ removed: result.length }, "swept expired locks");
      }
    } catch (err) {
      logger.error({ err }, "failed to sweep expired locks");
    }
  }, config.lock.sweepInterval);

  logger.info({ interval: config.lock.sweepInterval }, "lock sweeper started");
  return interval;
}

function mapLock(row: typeof locks.$inferSelect): LockRow {
  return {
    id: row.id,
    fileId: row.fileId,
    userId: row.userId,
    workspaceId: row.workspaceId,
    lockedAt: row.lockedAt,
    expiresAt: row.expiresAt,
  };
}
