import Elysia from "elysia";
import * as workspaceService from "@/services/workspace.service";

export const workspaceHandler = new Elysia()
  .post("/projects/:projectId/workspaces", async ({ userId, params, body, set }) => {
    const { name, branch, root_path } = body as any;
    try {
      const ws = await workspaceService.createWorkspace(
        params.projectId as string,
        userId!,
        name,
        branch || "main",
        root_path || "/",
      );
      set.status = 201;
      return mapWorkspaceResponse(ws);
    } catch (e: any) {
      set.status = 400;
      return { error: { code: "ERROR", message: e.message } };
    }
  })
  .get("/projects/:projectId/workspaces", async ({ params }) => {
    const workspaces = await workspaceService.listWorkspacesByProject(params.projectId as string);
    return { data: workspaces.map(mapWorkspaceResponse) };
  })
  .get("/workspaces/:workspaceId", async ({ params, set }) => {
    try {
      const ws = await workspaceService.getWorkspace(params.workspaceId as string);
      return mapWorkspaceResponse(ws);
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "workspace not found" } };
    }
  })
  .put("/workspaces/:workspaceId", async ({ params, body }) => {
    const { name, root_path, branch } = body as any;
    const ws = await workspaceService.updateWorkspace(params.workspaceId as string, {
      name,
      rootPath: root_path,
      branch,
    });
    return mapWorkspaceResponse(ws);
  })
  .delete("/workspaces/:workspaceId", async ({ params, set }) => {
    try {
      await workspaceService.deleteWorkspace(params.workspaceId as string);
      return { message: "workspace deleted" };
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "workspace not found" } };
    }
  })
  .get("/workspaces/:workspaceId/status", async ({ params, set }) => {
    try {
      const status = await workspaceService.getWorkspaceStatus(params.workspaceId as string);
      return {
        workspace_id: status.workspace.id,
        branch: status.branchName,
        last_synced_at: status.workspace.lastSyncedAt,
        synced_file_count: status.syncedFileCount,
        pending_changes: status.pendingChanges.map((p) => ({
          file_id: p.fileId,
          path: p.path,
          change_type: p.changeType,
          detected_at: p.detectedAt,
        })),
        locks: status.locks.map((l) => ({
          file_id: l.fileId,
          path: l.path,
          locked_by: l.lockedBy,
        })),
      };
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "workspace not found" } };
    }
  })
  .get("/workspaces/:workspaceId/files", async ({ params, set }) => {
    try {
      const files = await workspaceService.getWorkspaceFiles(params.workspaceId as string);
      return {
        data: files.map((f) => ({
          file_id: f.fileId,
          path: f.path,
          file_name: f.fileName,
          synced_version: f.syncedVersion,
          latest_version: f.latestVersion,
          local_path: f.localPath,
          synced_at: f.syncedAt,
        })),
      };
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "workspace not found" } };
    }
  })
  .post("/workspaces/:workspaceId/sync", async ({ userId, params, body, set }) => {
    const { local_versions } = body as any;
    try {
      const actions = await workspaceService.syncWorkspace(
        params.workspaceId as string,
        userId!,
        local_versions || {},
      );
      return {
        actions: actions.map((a) => ({
          type: a.type,
          path: a.path,
          version: a.version,
          size_bytes: a.sizeBytes,
          content_hash: a.contentHash,
          download_url: a.downloadUrl,
        })),
      };
    } catch (e: any) {
      set.status = 403;
      return { error: { code: "ERROR", message: e.message } };
    }
  });

function mapWorkspaceResponse(ws: workspaceService.WorkspaceRow) {
  return {
    id: ws.id,
    project_id: ws.projectId,
    user_id: ws.userId,
    branch_id: ws.branchId,
    name: ws.name,
    root_path: ws.rootPath,
    last_synced_at: ws.lastSyncedAt,
    created_at: ws.createdAt,
    updated_at: ws.updatedAt,
  };
}
