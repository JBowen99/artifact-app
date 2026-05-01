import { createHash } from "node:crypto";
import { extname } from "node:path";
import { eq, and, sql, like } from "drizzle-orm";
import { Readable } from "node:stream";
import { db } from "@/db";
import { files } from "@/db/schema";
import * as projectService from "./project.service";
import { redis } from "@/lib/redis";
import { config } from "@/config/env";
import { minioClient, contentAddressableKey, BUCKET } from "@/lib/s3";

export interface FileRow {
  id: string;
  projectId: string;
  branchId: string;
  path: string;
  fileName: string;
  fileType: string;
  isBinary: boolean;
  contentHash: string;
  sizeBytes: number;
  pointerFilePath: string;
  version: number;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UploadSession {
  projectId: string;
  branch: string;
  path: string;
  fileName: string;
  fileSize: number;
  contentHash: string;
  userId: string;
  totalChunks: number;
  receivedChunks: number[];
  createdAt: number;
}

export async function initUpload(
  userId: string,
  projectId: string,
  branch: string,
  path: string,
  fileName: string,
  fileSize: number,
  contentHash: string,
): Promise<{ sessionId: string; chunkSize: number; totalChunks: number }> {
  await projectService.getProject(projectId);
  const branchRow = await projectService.getBranchByName(projectId, branch);
  if (!branchRow) throw new Error("branch not found");
  if (!path || !fileName) throw new Error("path and file_name are required");
  if (fileSize <= 0) throw new Error("file_size must be positive");

  const chunkSize = config.storage.uploadChunkSize;
  const totalChunks = Math.ceil(fileSize / chunkSize);

  const session: UploadSession = {
    projectId,
    branch,
    path,
    fileName,
    fileSize,
    contentHash,
    userId,
    totalChunks,
    receivedChunks: [],
    createdAt: Math.floor(Date.now() / 1000),
  };

  const sessionId = crypto.randomUUID();
  await redis.set(
    `upload_session:${sessionId}`,
    JSON.stringify(session),
    "EX",
    86400,
  );

  return { sessionId, chunkSize, totalChunks };
}

export async function uploadChunk(
  sessionId: string,
  chunkIndex: number,
  data: Buffer,
): Promise<void> {
  const raw = await redis.get(`upload_session:${sessionId}`);
  if (!raw) throw new Error("session not found or expired");

  const session: UploadSession = JSON.parse(raw);

  if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
    throw new Error(`chunk_index ${chunkIndex} out of range [0, ${session.totalChunks})`);
  }

  if (session.receivedChunks.includes(chunkIndex)) {
    throw new Error(`chunk ${chunkIndex} already received`);
  }

  const chunkKey = `uploads/${sessionId}/chunk_${chunkIndex}`;
  await minioClient.putObject(
    BUCKET,
    chunkKey,
    data,
    data.length,
  );

  session.receivedChunks.push(chunkIndex);
  await redis.set(
    `upload_session:${sessionId}`,
    JSON.stringify(session),
    "EX",
    86400,
  );
}

export async function completeUpload(sessionId: string): Promise<FileRow> {
  const raw = await redis.get(`upload_session:${sessionId}`);
  if (!raw) throw new Error("session not found or expired");

  const session: UploadSession = JSON.parse(raw);

  if (session.receivedChunks.length !== session.totalChunks) {
    throw new Error(
      `not all chunks received: got ${session.receivedChunks.length}, expected ${session.totalChunks}`,
    );
  }

  const chunks: Buffer[] = [];
  const hasher = createHash("sha256");

  for (let i = 0; i < session.totalChunks; i++) {
    const chunkKey = `uploads/${sessionId}/chunk_${i}`;
    const dataStream = await minioClient.getObject(BUCKET, chunkKey);
    const buf = await streamToBuffer(dataStream);
    chunks.push(buf);
    hasher.update(buf);
  }

  const computedHash = hasher.digest("hex");
  if (session.contentHash && session.contentHash !== computedHash) {
    throw new Error(
      `content hash mismatch: expected ${session.contentHash}, got ${computedHash}`,
    );
  }

  const contentKey = contentAddressableKey(computedHash);
  try {
    await minioClient.statObject(BUCKET, contentKey);
  } catch {
    const fullContent = Buffer.concat(chunks);
    await minioClient.putObject(
      BUCKET,
      contentKey,
      fullContent,
      fullContent.length,
    );
  }

  for (let i = 0; i < session.totalChunks; i++) {
    const chunkKey = `uploads/${sessionId}/chunk_${i}`;
    await minioClient.removeObject(BUCKET, chunkKey).catch(() => {});
  }
  await redis.del(`upload_session:${sessionId}`);

  const branchRow = await projectService.getBranchByName(
    session.projectId,
    session.branch,
  );
  if (!branchRow) throw new Error("branch not found");

  const fileType = extname(session.fileName).slice(1);

  const [file] = await db
    .insert(files)
    .values({
      projectId: session.projectId,
      branchId: branchRow.id,
      path: session.path,
      fileName: session.fileName,
      fileType,
      isBinary: true,
      contentHash: computedHash,
      sizeBytes: session.fileSize,
      pointerFilePath: "",
      version: 1,
      ownerId: session.userId,
    })
    .returning();

  return mapFile(file);
}

export async function getFile(fileID: string): Promise<FileRow> {
  const [row] = await db.select().from(files).where(eq(files.id, fileID)).limit(1);
  if (!row) throw new Error("file not found");
  return mapFile(row);
}

export async function browseFiles(
  projectId: string,
  branchName: string,
  pathPrefix: string,
  page: number,
  limit: number,
): Promise<{ data: FileRow[]; total: number }> {
  if (!branchName) branchName = "main";
  if (!pathPrefix) pathPrefix = "/";

  const branchRow = await projectService.getBranchByName(projectId, branchName);
  if (!branchRow) throw new Error("branch not found");

  const offset = (page - 1) * limit;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(files)
    .where(
      and(
        eq(files.projectId, projectId),
        eq(files.branchId, branchRow.id),
        like(files.path, `${pathPrefix}%`),
      ),
    );

  const rows = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.projectId, projectId),
        eq(files.branchId, branchRow.id),
        like(files.path, `${pathPrefix}%`),
      ),
    )
    .orderBy(files.path, files.fileName)
    .limit(limit)
    .offset(offset);

  return { data: rows.map(mapFile), total: count };
}

export async function downloadFile(
  fileID: string,
): Promise<{ stream: NodeJS.ReadableStream; file: FileRow }> {
  const file = await getFile(fileID);
  const contentKey = contentAddressableKey(file.contentHash);
  const stream = await minioClient.getObject(BUCKET, contentKey);
  return { stream: stream as unknown as NodeJS.ReadableStream, file };
}

export async function deleteFile(fileID: string): Promise<void> {
  const result = await db.delete(files).where(eq(files.id, fileID)).returning();
  if (!result.length) throw new Error("file not found");
}

export async function createFolder(
  userId: string,
  projectId: string,
  branchName: string,
  folderPath: string,
): Promise<FileRow> {
  if (!folderPath || folderPath === "/") throw new Error("folder path is required");

  await projectService.getProject(projectId);
  const branchRow = await projectService.getBranchByName(projectId, branchName);
  if (!branchRow) throw new Error("branch not found");

  let normalized = folderPath.replace(/\/+$/, "");
  if (!normalized.startsWith("/")) normalized = "/" + normalized;

  const [file] = await db
    .insert(files)
    .values({
      projectId,
      branchId: branchRow.id,
      path: normalized,
      fileName: ".artifact-folder",
      fileType: "",
      isBinary: false,
      contentHash: "",
      sizeBytes: 0,
      pointerFilePath: "",
      version: 1,
      ownerId: userId,
    })
    .returning();

  return mapFile(file);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function mapFile(row: typeof files.$inferSelect): FileRow {
  return {
    id: row.id,
    projectId: row.projectId,
    branchId: row.branchId,
    path: row.path,
    fileName: row.fileName,
    fileType: row.fileType,
    isBinary: row.isBinary,
    contentHash: row.contentHash,
    sizeBytes: Number(row.sizeBytes),
    pointerFilePath: row.pointerFilePath,
    version: row.version,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
