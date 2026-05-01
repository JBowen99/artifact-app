import Elysia from "elysia";
import * as fileService from "@/services/file.service";

export const fileHandler = new Elysia({ prefix: "/files" })
  .post("/upload", async ({ userId, body, set }) => {
    const { project_id, branch, path, file_name, file_size, content_hash } = body as any;
    try {
      const result = await fileService.initUpload(
        userId!,
        project_id,
        branch || "main",
        path,
        file_name,
        file_size,
        content_hash,
      );
      set.status = 201;
      return {
        session_id: result.sessionId,
        chunk_size: result.chunkSize,
        total_chunks: result.totalChunks,
      };
    } catch (e: any) {
      set.status = 400;
      return { error: { code: "ERROR", message: e.message } };
    }
  })
  .put("/upload/:sessionId", async ({ params, body, set }) => {
    try {
      const chunkIndex = parseInt((body as any).chunk_index ?? "0");
      const data = (body as any).data;
      const buffer = typeof data === "string" ? Buffer.from(data, "base64") : Buffer.from(data as ArrayBuffer);
      await fileService.uploadChunk(params.sessionId as string, chunkIndex, buffer);
      return { message: "chunk uploaded" };
    } catch (e: any) {
      set.status = 400;
      return { error: { code: "ERROR", message: e.message } };
    }
  })
  .post("/upload/:sessionId/complete", async ({ params, set }) => {
    try {
      const file = await fileService.completeUpload(params.sessionId as string);
      return {
        file_id: file.id,
        content_hash: file.contentHash,
        size_bytes: file.sizeBytes,
        pointer_file: file.pointerFilePath,
      };
    } catch (e: any) {
      set.status = 400;
      return { error: { code: "ERROR", message: e.message } };
    }
  })
  .get("/:fileId", async ({ params, set }) => {
    try {
      const file = await fileService.getFile(params.fileId as string);
      return mapFileResponse(file);
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "file not found" } };
    }
  })
  .get("/:fileId/download", async ({ params, set }) => {
    try {
      const { stream, file } = await fileService.downloadFile(params.fileId as string);
      set.headers["Content-Type"] = "application/octet-stream";
      set.headers["Content-Disposition"] = `attachment; filename="${file.fileName}"`;
      return stream;
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "file not found" } };
    }
  })
  .delete("/:fileId", async ({ params, set }) => {
    try {
      await fileService.deleteFile(params.fileId as string);
      return { message: "file deleted" };
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "file not found" } };
    }
  });

function mapFileResponse(f: fileService.FileRow) {
  return {
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
  };
}
