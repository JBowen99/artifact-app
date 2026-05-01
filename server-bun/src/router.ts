import Elysia from "elysia";
import { authPlugin } from "@/middleware/auth";
import { authHandler } from "@/handlers/auth.handler";
import { userHandler } from "@/handlers/user.handler";
import { projectHandler } from "@/handlers/project.handler";
import { fileHandler } from "@/handlers/file.handler";
import { lockHandler } from "@/handlers/lock.handler";
import { workspaceHandler } from "@/handlers/workspace.handler";
import { teamHandler } from "@/handlers/team.handler";
import { searchHandler } from "@/handlers/search.handler";

import * as commitService from "@/services/commit.service";
import * as projectService from "@/services/project.service";
import * as fileService from "@/services/file.service";

export const router = new Elysia({ prefix: "/api/v1" })
  .use(authPlugin)
  .use(authHandler)
  .use(userHandler)
  .use(projectHandler)
  .use(fileHandler)
  .use(lockHandler)
  .use(workspaceHandler)
  .use(teamHandler)
  .use(searchHandler)
  .get("/projects/:projectId/files", async ({ params, query }) => {
    const q = query as any;
    const branch = q.branch || "main";
    const path = q.path || "/";
    const page = parseInt(q.page || "1");
    const limit = Math.min(parseInt(q.limit || "20"), 100);
    const result = await fileService.browseFiles(
      params.projectId as string,
      branch,
      path,
      page,
      limit,
    );
    return {
      data: result.data.map((f) => ({
        id: f.id,
        project_id: f.projectId,
        branch_id: f.branchId,
        path: f.path,
        file_name: f.fileName,
        file_type: f.fileType,
        is_binary: f.isBinary,
        content_hash: f.contentHash,
        size_bytes: f.sizeBytes,
        pointer_file_path: f.pointerFilePath,
        version: f.version,
        owner_id: f.ownerId,
        created_at: f.createdAt,
        updated_at: f.updatedAt,
      })),
      total: result.total,
      page,
      limit,
      total_pages: Math.ceil(result.total / limit),
    };
  })
  .post("/projects/:projectId/folders", async ({ userId, params, body, set }) => {
    const { path: folderPath, branch } = body as any;
    try {
      const file = await fileService.createFolder(
        userId!,
        params.projectId as string,
        branch || "main",
        folderPath,
      );
      set.status = 201;
      return { id: file.id, path: file.path, created_at: file.createdAt };
    } catch (e: any) {
      set.status = 400;
      return { error: { code: "ERROR", message: e.message } };
    }
  })
  .get("/projects/:projectId/commits", async ({ params, query }) => {
    const q = query as any;
    const branch = q.branch || "main";
    const page = parseInt(q.page || "1");
    const limit = Math.min(parseInt(q.limit || "20"), 100);
    const result = await commitService.listCommits(
      params.projectId as string,
      branch,
      page,
      limit,
    );
    return {
      data: result.data.map((c) => ({
        id: c.id,
        project_id: c.projectId,
        branch_id: c.branchId,
        git_commit_hash: c.gitCommitHash,
        message: c.message,
        author_id: c.authorId,
        author_name: c.authorName,
        created_at: c.createdAt,
      })),
      total: result.total,
      page,
      limit,
      total_pages: Math.ceil(result.total / limit),
    };
  })
  .post("/projects/:projectId/submit", async ({ userId, params, body, set }) => {
    const { workspace_id, branch, message, files, release_locks } = body as any;
    try {
      const commit = await commitService.submit(
        params.projectId as string,
        userId!,
        workspace_id,
        branch || "main",
        message,
        files || [],
        release_locks || false,
      );
      set.status = 201;
      return {
        commit_id: commit.id,
        git_commit_hash: commit.gitCommitHash,
        branch: branch || "main",
        message: commit.message,
        created_at: commit.createdAt,
      };
    } catch (e: any) {
      set.status = 400;
      return { error: { code: "ERROR", message: e.message } };
    }
  })
  .get("/commits/:commitId", async ({ params, set }) => {
    try {
      const { commit, files } = await commitService.getCommit(params.commitId as string);
      return {
        id: commit.id,
        project_id: commit.projectId,
        branch_id: commit.branchId,
        git_commit_hash: commit.gitCommitHash,
        message: commit.message,
        author_id: commit.authorId,
        author_name: commit.authorName,
        created_at: commit.createdAt,
        files: files.map((f) => ({
          file_id: f.fileId,
          action: f.action,
          path: f.path,
          file_name: f.fileName,
          message: f.message,
        })),
      };
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "commit not found" } };
    }
  })
  .get("/", () => ({
    name: "artifact-api",
    version: "1.0.0",
  }));
