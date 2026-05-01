import Elysia from "elysia";
import * as lockService from "@/services/lock.service";

export const lockHandler = new Elysia()
  .post("/files/:fileId/lock", async ({ userId, params, body, set }) => {
    const { workspace_id, expires_at } = body as any;
    try {
      const lock = await lockService.lockFile(
        params.fileId as string,
        userId!,
        workspace_id,
        expires_at ? new Date(expires_at) : undefined,
      );
      set.status = 201;
      return {
        lock_id: lock.id,
        file_id: lock.fileId,
        user_id: lock.userId,
        locked_at: lock.lockedAt,
        expires_at: lock.expiresAt,
      };
    } catch (e: any) {
      set.status = 409;
      return { error: { code: "LOCKED", message: e.message } };
    }
  })
  .delete("/files/:fileId/lock", async ({ userId, params, set }) => {
    try {
      await lockService.unlockFile(params.fileId as string, userId!);
      return { message: "file unlocked" };
    } catch (e: any) {
      set.status = e.message?.includes("not locked") ? 404 : 403;
      return { error: { code: "ERROR", message: e.message } };
    }
  })
  .get("/projects/:projectId/locks", async ({ params }) => {
    const locks = await lockService.listLocksByProject(params.projectId as string);
    return {
      data: locks.map((l) => ({
        lock_id: l.id,
        file_id: l.fileId,
        user_id: l.userId,
        file_path: l.filePath,
        user_name: l.userName,
        locked_at: l.lockedAt,
        expires_at: l.expiresAt,
      })),
    };
  });
