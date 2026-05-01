import Elysia from "elysia";
import * as searchService from "@/services/search.service";
import * as fileService from "@/services/file.service";

export const searchHandler = new Elysia()
  .get("/search", async ({ query }) => {
    const q = query as any;
    const result = await searchService.searchFiles({
      query: q.q || q.query,
      fileType: q.file_type,
      projectId: q.project_id,
      branchId: q.branch_id,
      ownerId: q.owner_id,
      tags: q.tags ? (Array.isArray(q.tags) ? q.tags : [q.tags]) : undefined,
      page: parseInt(q.page || "1"),
      limit: Math.min(parseInt(q.limit || "20"), 100),
      sortBy: q.sort_by || "updated_at",
      sortOrder: q.sort_order || "desc",
    });
    return result;
  })
  .post("/files/:fileId/tags", async ({ params, body, set }) => {
    const { name } = body as any;
    if (!name) {
      set.status = 400;
      return { error: { code: "VALIDATION_ERROR", message: "tag name is required" } };
    }
    const tag = await searchService.addFileTag(params.fileId as string, name);
    set.status = 201;
    return { tag_id: tag.tagId, name: tag.name };
  })
  .delete("/files/:fileId/tags/:tagId", async ({ params }) => {
    await searchService.removeFileTag(params.fileId as string, params.tagId as string);
    return { message: "tag removed" };
  });
