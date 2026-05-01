import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, branches, projectPermissions } from "@/db/schema";
import * as gitLib from "@/lib/git";
import { logger } from "@/lib/logger";

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  repoPath: string;
  ownerId: string;
  teamId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BranchRow {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  headCommit: string | null;
  createdAt: Date;
}

export async function createProject(
  ownerID: string,
  name: string,
  description: string,
  teamID?: string,
): Promise<{ project: ProjectRow; branch: BranchRow }> {
  if (!name) throw new Error("project name is required");

  const projectID = crypto.randomUUID();
  const repoPath = projectID;

  await gitLib.initBareRepo(projectID);

  const headHash = await gitLib.getBranchHash(projectID, "main");

  const result = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        id: projectID,
        name,
        description,
        repoPath,
        ownerId: ownerID,
        teamId: teamID || null,
      })
      .returning();

    const [branch] = await tx
      .insert(branches)
      .values({
        projectId: projectID,
        name: "main",
        isDefault: true,
        headCommit: headHash || null,
      })
      .returning();

    await tx.insert(projectPermissions).values({
      projectId: projectID,
      userId: ownerID,
      role: "admin",
    });

    return { project, branch };
  });

  return {
    project: mapProject(result.project),
    branch: mapBranch(result.branch),
  };
}

export async function getProject(projectID: string): Promise<ProjectRow> {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectID)).limit(1);
  if (!row) throw new Error("project not found");
  return mapProject(row);
}

export async function listProjects(
  userID: string,
  page: number,
  limit: number,
): Promise<{ data: ProjectRow[]; total: number }> {
  const offset = (page - 1) * limit;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(
      sql`${projects.ownerId} = ${userID} OR ${projects.id} IN (
        SELECT ${projectPermissions.projectId} FROM ${projectPermissions} WHERE ${projectPermissions.userId} = ${userID}
      )`,
    );

  const rows = await db
    .select()
    .from(projects)
    .where(
      sql`${projects.ownerId} = ${userID} OR ${projects.id} IN (
        SELECT ${projectPermissions.projectId} FROM ${projectPermissions} WHERE ${projectPermissions.userId} = ${userID}
      )`,
    )
    .orderBy(sql`${projects.updatedAt} DESC`)
    .limit(limit)
    .offset(offset);

  return { data: rows.map(mapProject), total: count };
}

export async function updateProject(
  projectID: string,
  name?: string,
  description?: string,
): Promise<ProjectRow> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;

  const [row] = await db
    .update(projects)
    .set(updates)
    .where(eq(projects.id, projectID))
    .returning();

  if (!row) throw new Error("project not found");
  return mapProject(row);
}

export async function deleteProject(projectID: string): Promise<void> {
  const [row] = await db.delete(projects).where(eq(projects.id, projectID)).returning();
  if (!row) throw new Error("project not found");
}

export async function createBranch(
  projectID: string,
  name: string,
  sourceBranch: string,
): Promise<BranchRow> {
  if (!name) throw new Error("branch name is required");
  if (!sourceBranch) throw new Error("source branch is required");

  await getProject(projectID);

  const source = await getBranchByName(projectID, sourceBranch);
  if (!source) throw new Error(`source branch "${sourceBranch}" not found`);

  await gitLib.createBranch(projectID, name, source.headCommit || "");

  const [row] = await db
    .insert(branches)
    .values({
      projectId: projectID,
      name,
      isDefault: false,
      headCommit: source.headCommit,
    })
    .returning();

  return mapBranch(row);
}

export async function getBranch(
  projectID: string,
  branchID: string,
): Promise<BranchRow> {
  const [row] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, branchID), eq(branches.projectId, projectID)))
    .limit(1);
  if (!row) throw new Error("branch not found");
  return mapBranch(row);
}

export async function listBranches(projectID: string): Promise<BranchRow[]> {
  const rows = await db
    .select()
    .from(branches)
    .where(eq(branches.projectId, projectID))
    .orderBy(sql`${branches.isDefault} DESC, ${branches.name}`);
  return rows.map(mapBranch);
}

export async function deleteBranch(
  projectID: string,
  branchID: string,
): Promise<void> {
  const branch = await getBranch(projectID, branchID);
  if (branch.isDefault) throw new Error("cannot delete the default branch");

  await db.delete(branches).where(eq(branches.id, branchID));
  await gitLib.deleteBranch(projectID, branch.name);
}

export async function getBranchByName(
  projectID: string,
  branchName: string,
): Promise<BranchRow | null> {
  const [row] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.projectId, projectID), eq(branches.name, branchName)))
    .limit(1);
  if (!row) return null;
  return mapBranch(row);
}

function mapProject(row: typeof projects.$inferSelect): ProjectRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    repoPath: row.repoPath,
    ownerId: row.ownerId,
    teamId: row.teamId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapBranch(row: typeof branches.$inferSelect): BranchRow {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    isDefault: row.isDefault,
    headCommit: row.headCommit,
    createdAt: row.createdAt,
  };
}
