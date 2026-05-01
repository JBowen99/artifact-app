import Elysia from "elysia";
import * as projectService from "@/services/project.service";

export const projectHandler = new Elysia({ prefix: "/projects" })
  .post("/", async ({ userId, body, set }) => {
    const { name, description, team_id } = body as any;
    try {
      const { project, branch } = await projectService.createProject(
        userId!,
        name,
        description || "",
        team_id,
      );
      set.status = 201;
      return {
        project: mapProjectResponse(project),
        branch: mapBranchResponse(branch),
      };
    } catch (e: any) {
      if (e.message?.includes("duplicate")) {
        set.status = 409;
        return { error: { code: "CONFLICT", message: e.message } };
      }
      throw e;
    }
  })
  .get("/", async ({ userId, query }) => {
    const page = parseInt((query as any).page || "1");
    const limit = Math.min(parseInt((query as any).limit || "20"), 100);
    const { data, total } = await projectService.listProjects(userId!, page, limit);
    return {
      data: data.map(mapProjectResponse),
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  })
  .get("/:projectId", async ({ params, set }) => {
    try {
      const project = await projectService.getProject(params.projectId as string);
      return mapProjectResponse(project);
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "project not found" } };
    }
  })
  .put("/:projectId", async ({ params, body }) => {
    const { name, description } = body as any;
    const project = await projectService.updateProject(
      params.projectId as string,
      name,
      description,
    );
    return mapProjectResponse(project);
  })
  .delete("/:projectId", async ({ params, set }) => {
    try {
      await projectService.deleteProject(params.projectId as string);
      return { message: "project deleted" };
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "project not found" } };
    }
  })
  .post("/:projectId/branches", async ({ userId, params, body, set }) => {
    const { name, source_branch } = body as any;
    try {
      const branch = await projectService.createBranch(
        params.projectId as string,
        name,
        source_branch,
      );
      set.status = 201;
      return mapBranchResponse(branch);
    } catch (e: any) {
      if (e.message?.includes("already exists")) {
        set.status = 409;
        return { error: { code: "CONFLICT", message: e.message } };
      }
      throw e;
    }
  })
  .get("/:projectId/branches", async ({ params }) => {
    const branches = await projectService.listBranches(params.projectId as string);
    return { data: branches.map(mapBranchResponse) };
  })
  .get("/:projectId/branches/:branchId", async ({ params, set }) => {
    try {
      const branch = await projectService.getBranch(
        params.projectId as string,
        params.branchId as string,
      );
      return mapBranchResponse(branch);
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "branch not found" } };
    }
  })
  .delete("/:projectId/branches/:branchId", async ({ params, set }) => {
    try {
      await projectService.deleteBranch(
        params.projectId as string,
        params.branchId as string,
      );
      return { message: "branch deleted" };
    } catch (e: any) {
      set.status = e.message?.includes("default") ? 400 : 404;
      return { error: { code: "ERROR", message: e.message } };
    }
  });

function mapProjectResponse(p: projectService.ProjectRow) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    repo_path: p.repoPath,
    owner_id: p.ownerId,
    team_id: p.teamId,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function mapBranchResponse(b: projectService.BranchRow) {
  return {
    id: b.id,
    project_id: b.projectId,
    name: b.name,
    is_default: b.isDefault,
    head_commit: b.headCommit,
    created_at: b.createdAt,
  };
}
