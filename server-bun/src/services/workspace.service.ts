import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { workspaces, branches, workspaceFiles, files, pendingChanges, locks, users } from "@/db/schema";
import * as projectService from "./project.service";

export interface WorkspaceRow {
  id: string;
  projectId: string;
  userId: string;
  branchId: string;
  name: string;
  rootPath: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function createWorkspace(
  projectID: string,
  userID: string,
  name: string,
  branch: string,
  rootPath: string,
): Promise<WorkspaceRow> {
  if (!name) throw new Error("workspace name is required");
  if (!branch) branch = "main";

  await projectService.getProject(projectID);
  const branchRow = await projectService.getBranchByName(projectID, branch);
  if (!branchRow) throw new Error("branch not found");

  if (!rootPath) rootPath = "/";

  const [ws] = await db
    .insert(workspaces)
    .values({
      projectId: projectID,
      userId: userID,
      branchId: branchRow.id,
      name,
      rootPath,
    })
    .returning();

  return mapWorkspace(ws);
}

export async function listWorkspacesByProject(projectID: string): Promise<WorkspaceRow[]> {
  const rows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.projectId, projectID))
    .orderBy(sql`${workspaces.updatedAt} DESC`);
  return rows.map(mapWorkspace);
}

export async function getWorkspace(workspaceID: string): Promise<WorkspaceRow> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceID)).limit(1);
  if (!ws) throw new Error("workspace not found");
  return mapWorkspace(ws);
}

export async function updateWorkspace(
  workspaceID: string,
  updates: { name?: string; rootPath?: string; branch?: string },
): Promise<WorkspaceRow> {
  const setValues: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.branch) {
    const ws = await getWorkspace(workspaceID);
    const branchRow = await projectService.getBranchByName(ws.projectId, updates.branch);
    if (!branchRow) throw new Error("branch not found");
    setValues.branchId = branchRow.id;
  }

  if (updates.name !== undefined) setValues.name = updates.name;
  if (updates.rootPath !== undefined) setValues.rootPath = updates.rootPath;

  const [ws] = await db
    .update(workspaces)
    .set(setValues)
    .where(eq(workspaces.id, workspaceID))
    .returning();

  if (!ws) throw new Error("workspace not found");
  return mapWorkspace(ws);
}

export async function deleteWorkspace(workspaceID: string): Promise<void> {
  const result = await db.delete(workspaces).where(eq(workspaces.id, workspaceID)).returning();
  if (!result.length) throw new Error("workspace not found");
}

export async function getWorkspaceStatus(workspaceID: string): Promise<{
  workspace: WorkspaceRow;
  branchName: string;
  syncedFileCount: number;
  pendingChanges: { id: string; fileId: string; path: string; changeType: string; detectedAt: Date }[];
  locks: { fileId: string; path: string; lockedBy: string }[];
}> {
  const ws = await getWorkspace(workspaceID);

  const [branchRow] = await db
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.id, ws.branchId))
    .limit(1);

  const branchName = branchRow?.name || "unknown";

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceFiles)
    .where(eq(workspaceFiles.workspaceId, workspaceID));

  const pendingRows = await db
    .select({
      id: pendingChanges.id,
      fileId: pendingChanges.fileId,
      path: files.path,
      changeType: pendingChanges.changeType,
      detectedAt: pendingChanges.detectedAt,
    })
    .from(pendingChanges)
    .innerJoin(files, eq(pendingChanges.fileId, files.id))
    .where(eq(pendingChanges.workspaceId, workspaceID));

  const lockRows = await db
    .select({
      fileId: locks.fileId,
      path: files.path,
      lockedBy: users.displayName,
    })
    .from(locks)
    .innerJoin(files, eq(locks.fileId, files.id))
    .innerJoin(users, eq(locks.userId, users.id))
    .innerJoin(
      workspaceFiles,
      and(eq(workspaceFiles.fileId, locks.fileId), eq(workspaceFiles.workspaceId, workspaceID)),
    );

  return {
    workspace: ws,
    branchName,
    syncedFileCount: count,
    pendingChanges: pendingRows.map((r) => ({
      id: r.id,
      fileId: r.fileId,
      path: r.path,
      changeType: r.changeType,
      detectedAt: r.detectedAt,
    })),
    locks: lockRows.map((r) => ({
      fileId: r.fileId,
      path: r.path,
      lockedBy: r.lockedBy,
    })),
  };
}

export async function getWorkspaceFiles(workspaceID: string): Promise<
  {
    workspaceId: string;
    fileId: string;
    syncedVersion: number;
    localPath: string;
    syncedAt: Date;
    path: string;
    fileName: string;
    latestVersion: number;
  }[]
> {
  const rows = await db
    .select({
      workspaceId: workspaceFiles.workspaceId,
      fileId: workspaceFiles.fileId,
      syncedVersion: workspaceFiles.syncedVersion,
      localPath: workspaceFiles.localPath,
      syncedAt: workspaceFiles.syncedAt,
      path: files.path,
      fileName: files.fileName,
      latestVersion: files.version,
    })
    .from(workspaceFiles)
    .innerJoin(files, eq(workspaceFiles.fileId, files.id))
    .where(eq(workspaceFiles.workspaceId, workspaceID))
    .orderBy(files.path);

  return rows;
}

export async function syncWorkspace(
  workspaceID: string,
  userID: string,
  localVersions: Record<string, string>,
): Promise<
  {
    type: string;
    path: string;
    version?: string;
    sizeBytes?: number;
    contentHash?: string;
    downloadUrl?: string;
  }[]
> {
  const ws = await getWorkspace(workspaceID);
  if (ws.userId !== userID) throw new Error("workspace does not belong to this user");

  const serverRows = await db
    .select({
      id: files.id,
      path: files.path,
      version: files.version,
      sizeBytes: files.sizeBytes,
      contentHash: files.contentHash,
    })
    .from(files)
    .where(and(eq(files.projectId, ws.projectId), eq(files.branchId, ws.branchId)));

  const serverFileMap = new Map(serverRows.map((r) => [r.path, r]));

  const actions: {
    type: string;
    path: string;
    version?: string;
    sizeBytes?: number;
    contentHash?: string;
    downloadUrl?: string;
    fileId?: string;
  }[] = [];

  for (const [path, sf] of serverFileMap) {
    const localVer = localVersions[path];
    if (!localVer || localVer === "") {
      actions.push({
        type: "download",
        path,
        version: `v${sf.version}`,
        sizeBytes: Number(sf.sizeBytes),
        contentHash: sf.contentHash,
        downloadUrl: `/api/v1/files/${sf.id}/download`,
        fileId: sf.id,
      });
    }
  }

  for (const path of Object.keys(localVersions)) {
    if (!serverFileMap.has(path)) {
      actions.push({ type: "delete", path });
    }
  }

  if (actions.length > 0) {
    await db.transaction(async (tx) => {
      for (const action of actions) {
        if (action.type === "download" && action.fileId) {
          await tx
            .insert(workspaceFiles)
            .values({
              workspaceId: workspaceID,
              fileId: action.fileId,
              syncedVersion: 0,
              localPath: action.path,
            })
            .onConflictDoUpdate({
              target: [workspaceFiles.workspaceId, workspaceFiles.fileId],
              set: { syncedAt: new Date() },
            });
        } else if (action.type === "delete") {
          await tx
            .delete(workspaceFiles)
            .where(and(eq(workspaceFiles.workspaceId, workspaceID), eq(workspaceFiles.localPath, action.path)));
        }
      }
      await tx
        .update(workspaces)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceID));
    });
  } else {
    await db
      .update(workspaces)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceID));
  }

  return actions;
}

function mapWorkspace(row: typeof workspaces.$inferSelect): WorkspaceRow {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    branchId: row.branchId,
    name: row.name,
    rootPath: row.rootPath,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
