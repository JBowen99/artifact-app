import * as Minio from "minio";
import { config } from "@/config/env";
import { logger } from "@/lib/logger";

const endpointParts = config.s3.endpoint.split(":");
const endPoint = endpointParts[0];
const port = parseInt(endpointParts[1] || "9000", 10);

export const minioClient = new Minio.Client({
  endPoint,
  port,
  accessKey: config.s3.accessKey,
  secretKey: config.s3.secretKey,
  useSSL: config.s3.useSSL,
});

export const BUCKET = config.s3.bucket;

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET);
    logger.info({ bucket: BUCKET }, "Created S3 bucket");
  }
}

export function contentAddressableKey(hash: string): string {
  return `${hash.slice(0, 2)}/${hash}`;
}
