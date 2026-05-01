import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as git from "isomorphic-git";
import { config } from "@/config/env";
import { logger } from "@/lib/logger";

export async function ensureReposDir(): Promise<void> {
  await fs.mkdir(config.storage.repoBasePath, { recursive: true });
}

function repoDir(repoPath: string): string {
  return path.join(config.storage.repoBasePath, repoPath);
}

export async function initBareRepo(repoPath: string): Promise<string> {
  const dir = repoDir(repoPath);
  await fs.mkdir(dir, { recursive: true });
  await git.init({ fs, dir, bare: true });
  logger.info({ repoPath }, "Initialized bare git repo");
  return repoPath;
}

export async function createInitialCommit(
  repoPath: string,
  message: string,
  authorName: string,
  authorEmail: string,
): Promise<string> {
  const dir = repoDir(repoPath);
  const dummyContent = "# Artifact Project\n";
  const dummyPath = ".artifact";

  const blobOid = await git.writeBlob({
    fs,
    dir,
    blob: new TextEncoder().encode(dummyContent),
  });

  await git.updateIndex({
    fs,
    dir,
    filepath: dummyPath,
    oid: blobOid,
    add: true,
  });

  const treeOid = await git.writeTree({ fs, dir });

  const commitOid = await git.writeCommit({
    fs,
    dir,
    commit: {
      tree: treeOid,
      parent: [] as string[],
      message,
      author: {
        name: authorName,
        email: authorEmail,
        timestamp: Math.floor(Date.now() / 1000),
        timezoneOffset: 0,
      },
      committer: {
        name: authorName,
        email: authorEmail,
        timestamp: Math.floor(Date.now() / 1000),
        timezoneOffset: 0,
      },
    } as any,
  });

  await git.writeRef({
    fs,
    dir,
    ref: "refs/heads/main",
    value: commitOid,
    force: true,
  });

  logger.info({ repoPath, commitOid }, "Created initial commit");
  return commitOid;
}

export async function createBranch(
  repoPath: string,
  name: string,
  startPoint: string,
): Promise<void> {
  const dir = repoDir(repoPath);
  await git.writeRef({
    fs,
    dir,
    ref: `refs/heads/${name}`,
    value: startPoint,
    force: false,
  });
}

export async function deleteBranch(
  repoPath: string,
  name: string,
): Promise<void> {
  const dir = repoDir(repoPath);
  await git.deleteRef({ fs, dir, ref: `refs/heads/${name}` });
}

export async function getBranchHash(
  repoPath: string,
  name: string,
): Promise<string | undefined> {
  const dir = repoDir(repoPath);
  try {
    const ref = await git.resolveRef({ fs, dir, ref: `refs/heads/${name}` });
    return ref;
  } catch {
    return undefined;
  }
}

export async function createCommit(
  repoPath: string,
  entries: { filepath: string; oid: string }[],
  message: string,
  authorName: string,
  authorEmail: string,
  parentHash?: string,
): Promise<string> {
  const dir = repoDir(repoPath);

  for (const entry of entries) {
    await git.updateIndex({
      fs,
      dir,
      filepath: entry.filepath,
      oid: entry.oid,
      add: true,
    });
  }

  const treeOid = await git.writeTree({ fs, dir });

  const parents = parentHash ? [parentHash] : [];

  const commitOid = await git.writeCommit({
    fs,
    dir,
    commit: {
      tree: treeOid,
      parent: parents,
      message,
      author: {
        name: authorName,
        email: authorEmail,
        timestamp: Math.floor(Date.now() / 1000),
        timezoneOffset: 0,
      },
      committer: {
        name: authorName,
        email: authorEmail,
        timestamp: Math.floor(Date.now() / 1000),
        timezoneOffset: 0,
      },
    } as any,
  });

  return commitOid;
}

export async function writePointerBlob(
  repoPath: string,
  contentHash: string,
  sizeBytes: number,
): Promise<string> {
  const dir = repoDir(repoPath);
  const content = `version=1\noid=sha256:${contentHash}\nsize=${sizeBytes}\n`;
  const blobOid = await git.writeBlob({
    fs,
    dir,
    blob: new TextEncoder().encode(content),
  });
  return blobOid;
}

export async function deleteRepo(repoPath: string): Promise<void> {
  const dir = repoDir(repoPath);
  await fs.rm(dir, { recursive: true, force: true });
}
