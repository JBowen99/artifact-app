import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { commits, commitFiles, files, branches, users, workspaces, pendingChanges } from "@/db/schema";
import * as projectService from "./project.service";
import * as fileService from "./file.service";
import * as lockService from "./lock.service";
import * as authService from "./auth.service";
import * as gitLib from "@/lib/git";
import { logger } from "@/lib/logger";

export interface CommitRow {
  id: string;
  projectId: string;
  branchId: string;
  gitCommitHash: string;
  message: string;
  authorId: string;
  createdAt: Date;
}

interface SubmitFileInput {
  fileId: string;
  path: string;
  action: string;
  uploadSessionId?: string;
  message?: string;
}

export async function submit(
  projectID: string,
  userID: string,
  workspaceID: string | undefined,
  branchName: string,
  message: string,
  filesInput: SubmitFileInput[],
  releaseLocks: boolean,
): Promise<CommitRow> {
  if (!message) throw new Error("commit message is required");
  if (!filesInput.length) throw new Error("at least one file is required");

  await projectService.getProject(projectID);
  if (!branchName) branchName = "main";
  const branchRow = await projectService.getBranchByName(projectID, branchName);
  if (!branchRow) throw new Error("branch not found");

  const author = await authService.getUserById(userID);
  if (!author) throw new Error("author not found");

  for (const f of filesInput) {
    if (f.action === "add" || f.action === "modify") {
      const locked = await lockService.isFileLockedByUser(f.fileId, userID);
      if (!locked) {
        throw new Error(`file ${f.path} must be locked by you before submitting`);
      }
    }
  }

  const parentHash = branchRow.headCommit || undefined;

  for (const f of filesInput) {
    if (f.uploadSessionId) {
      const completed = await fileService.completeUpload(f.uploadSessionId);
      f.fileId = completed.id;
    }
  }

  const pointerEntries: { filepath: string; oid: string }[] = [];
  for (const f of filesInput) {
    const file = await fileService.getFile(f.fileId);
    const oid = await gitLib.writePointerBlob(projectID, file.contentHash, file.sizeBytes);
    pointerEntries.push({
      filepath: `.artifact/pointers/${file.id}`,
      oid,
    });
  }

  const gitCommitHash = await gitLib.createCommit(
    projectID,
    pointerEntries,
    message,
    author.displayName,
    author.email,
    parentHash,
  );

  const result = await db.transaction(async (tx) => {
    const [commit] = await tx
      .insert(commits)
      .values({
        projectId: projectID,
        branchId: branchRow.id,
        gitCommitHash,
        message,
        authorId: userID,
      })
      .returning();

    for (const f of filesInput) {
      const action = (f.action || "modify") as "add" | "modify" | "delete";
      await tx.insert(commitFiles).values({
        commitId: commit.id,
        fileId: f.fileId,
        action,
        message: f.message || "",
      });

      if (action === "add" || action === "modify") {
        await tx
          .update(files)
          .set({
            version: sql`${files.version} + 1`,
            pointerFilePath: `.artifact/pointers/${f.fileId}`,
            updatedAt: new Date(),
          })
          .where(eq(files.id, f.fileId));
      } else if (action === "delete") {
        await tx.delete(files).where(eq(files.id, f.fileId));
      }
    }

    await tx
      .update(branches)
      .set({ headCommit: gitCommitHash })
      .where(eq(branches.id, branchRow.id));

    if (workspaceID) {
      await tx.delete(pendingChanges).where(eq(pendingChanges.workspaceId, workspaceID));
      await tx
        .update(workspaces)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceID));
    }

    return commit;
  });

  if (releaseLocks) {
    for (const f of filesInput) {
      if (f.action !== "delete") {
        await lockService.unlockFile(f.fileId, userID).catch(() => {});
      }
    }
  }

  return {
    id: result.id,
    projectId: result.projectId,
    branchId: result.branchId,
    gitCommitHash: result.gitCommitHash,
    message: result.message,
    authorId: result.authorId,
    createdAt: result.createdAt,
  };
}

export async function listCommits(
  projectID: string,
  branchName: string,
  page: number,
  limit: number,
): Promise<{ data: (CommitRow & { authorName: string })[]; total: number }> {
  if (!branchName) branchName = "main";

  const branchRow = await projectService.getBranchByName(projectID, branchName);
  if (!branchRow) throw new Error("branch not found");

  const offset = (page - 1) * limit;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commits)
    .where(and(eq(commits.projectId, projectID), eq(commits.branchId, branchRow.id)));

  const rows = await db
    .select({
      id: commits.id,
      projectId: commits.projectId,
      branchId: commits.branchId,
      gitCommitHash: commits.gitCommitHash,
      message: commits.message,
      authorId: commits.authorId,
      createdAt: commits.createdAt,
      authorName: users.displayName,
    })
    .from(commits)
    .innerJoin(users, eq(commits.authorId, users.id))
    .where(and(eq(commits.projectId, projectID), eq(commits.branchId, branchRow.id)))
    .orderBy(sql`${commits.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  return {
    data: rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      branchId: r.branchId,
      gitCommitHash: r.gitCommitHash,
      message: r.message,
      authorId: r.authorId,
      createdAt: r.createdAt,
      authorName: r.authorName,
    })),
    total: count,
  };
}

export async function getCommit(commitID: string): Promise<{
  commit: CommitRow & { authorName: string };
  files: { commitId: string; fileId: string; action: string; path: string; fileName: string; message: string }[];
}> {
  const [row] = await db
    .select({
      id: commits.id,
      projectId: commits.projectId,
      branchId: commits.branchId,
      gitCommitHash: commits.gitCommitHash,
      message: commits.message,
      authorId: commits.authorId,
      createdAt: commits.createdAt,
      authorName: users.displayName,
    })
    .from(commits)
    .innerJoin(users, eq(commits.authorId, users.id))
    .where(eq(commits.id, commitID))
    .limit(1);

  if (!row) throw new Error("commit not found");

  const fileRows = await db
    .select({
      commitId: commitFiles.commitId,
      fileId: commitFiles.fileId,
      action: commitFiles.action,
      path: files.path,
      fileName: files.fileName,
      message: commitFiles.message,
    })
    .from(commitFiles)
    .innerJoin(files, eq(commitFiles.fileId, files.id))
    .where(eq(commitFiles.commitId, commitID));

  return {
    commit: {
      id: row.id,
      projectId: row.projectId,
      branchId: row.branchId,
      gitCommitHash: row.gitCommitHash,
      message: row.message,
      authorId: row.authorId,
      createdAt: row.createdAt,
      authorName: row.authorName,
    },
    files: fileRows,
  };
}
