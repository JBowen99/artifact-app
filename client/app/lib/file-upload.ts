import { api } from "./api";
import type { InitUploadResponseSchema, CompleteUploadResponseSchema } from "./api-types";
import type { z } from "zod";

type InitUploadResponse = z.infer<typeof InitUploadResponseSchema>;
type CompleteUploadResponse = z.infer<typeof CompleteUploadResponseSchema>;

export interface UploadResult {
  fileId: string;
  contentHash: string;
  sizeBytes: number;
  sessionId: string;
}

async function computeHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function uploadFile(
  projectId: string,
  branch: string,
  parentPath: string,
  file: File,
  onProgress?: (uploadedBytes: number, totalBytes: number) => void,
): Promise<UploadResult> {
  const fullPath = parentPath === "/" ? "/" + file.name : parentPath + "/" + file.name;
  const contentHash = await computeHash(file);
  const fileSize = file.size;

  const init = await api.files.initUpload(
    projectId,
    branch,
    fullPath,
    file.name,
    fileSize,
    contentHash,
  ) as InitUploadResponse;

  const sessionId = init.session_id;
  const chunkSize = init.chunk_size;
  const totalChunks = init.total_chunks;

  let uploadedBytes = 0;
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, fileSize);
    const blob = file.slice(start, end);

    await api.files.uploadChunk(sessionId, i, blob);

    uploadedBytes += end - start;
    onProgress?.(uploadedBytes, fileSize);
  }

  const completed = await api.files.completeUpload(sessionId) as CompleteUploadResponse;

  return {
    fileId: completed.file_id,
    contentHash: completed.content_hash,
    sizeBytes: completed.size_bytes,
    sessionId,
  };
}
