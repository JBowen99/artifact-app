import { eq, and, or, like, sql, desc, asc } from "drizzle-orm";
import { db } from "@/db";
import { files, projects, fileTags, tags, users } from "@/db/schema";

interface SearchFilters {
  query?: string;
  fileType?: string;
  projectId?: string;
  branchId?: string;
  ownerId?: string;
  tags?: string[];
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export async function searchFiles(filters: SearchFilters): Promise<{
  results: {
    fileId: string;
    path: string;
    project: string;
    version: number;
    sizeBytes: number;
    owner: string;
    tags: string[];
    updatedAt: Date;
  }[];
  total: number;
  page: number;
  limit: number;
}> {
  const conditions = [];

  if (filters.query) {
    conditions.push(
      or(
        like(files.path, `%${filters.query}%`),
        like(files.fileName, `%${filters.query}%`),
      )!,
    );
  }
  if (filters.fileType) conditions.push(eq(files.fileType, filters.fileType));
  if (filters.projectId) conditions.push(eq(files.projectId, filters.projectId));
  if (filters.branchId) conditions.push(eq(files.branchId, filters.branchId));
  if (filters.ownerId) conditions.push(eq(files.ownerId, filters.ownerId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const offset = (filters.page - 1) * filters.limit;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(files)
    .where(where);

  const sortColumn =
    filters.sortBy === "name"
      ? files.fileName
      : filters.sortBy === "size"
        ? files.sizeBytes
        : filters.sortBy === "created"
          ? files.createdAt
          : files.updatedAt;

  const orderBy = filters.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

  const rows = await db
    .select({
      fileId: files.id,
      path: files.path,
      projectId: files.projectId,
      version: files.version,
      sizeBytes: files.sizeBytes,
      ownerId: files.ownerId,
      updatedAt: files.updatedAt,
    })
    .from(files)
    .where(where)
    .orderBy(orderBy)
    .limit(filters.limit)
    .offset(offset);

  const results = [];
  for (const row of rows) {
    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, row.projectId))
      .limit(1);

    const ownerName = row.ownerId
      ? ((await db.select({ name: users.displayName }).from(users).where(eq(users.id, row.ownerId)).limit(1))[0]?.name) || ""
      : "";

    const tagRows = await db
      .select({ name: tags.name })
      .from(fileTags)
      .innerJoin(tags, eq(fileTags.tagId, tags.id))
      .where(eq(fileTags.fileId, row.fileId));

    results.push({
      fileId: row.fileId,
      path: row.path,
      project: project?.name || "",
      version: row.version,
      sizeBytes: Number(row.sizeBytes),
      owner: ownerName,
      tags: tagRows.map((t) => t.name),
      updatedAt: row.updatedAt,
    });
  }

  return {
    results,
    total: count,
    page: filters.page,
    limit: filters.limit,
  };
}

export async function addFileTag(fileID: string, tagName: string): Promise<{ tagId: string; name: string }> {
  let [tag] = await db.select().from(tags).where(eq(tags.name, tagName)).limit(1);

  if (!tag) {
    [tag] = await db.insert(tags).values({ name: tagName }).returning();
  }

  await db.insert(fileTags).values({ fileId: fileID, tagId: tag.id }).onConflictDoNothing();

  return { tagId: tag.id, name: tag.name };
}

export async function removeFileTag(fileID: string, tagID: string): Promise<void> {
  await db
    .delete(fileTags)
    .where(and(eq(fileTags.fileId, fileID), eq(fileTags.tagId, tagID)));
}
