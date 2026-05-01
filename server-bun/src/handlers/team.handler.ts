import Elysia from "elysia";
import * as teamService from "@/services/team.service";

export const teamHandler = new Elysia({ prefix: "/teams" })
  .post("/", async ({ userId, body, set }) => {
    const { name, description } = body as any;
    try {
      const team = await teamService.createTeam(name, description || "", userId!);
      set.status = 201;
      return {
        id: team.id,
        name: team.name,
        description: team.description,
        created_at: team.createdAt,
        updated_at: team.updatedAt,
      };
    } catch (e: any) {
      set.status = 400;
      return { error: { code: "ERROR", message: e.message } };
    }
  })
  .get("/", async ({ userId }) => {
    const teams = await teamService.listTeams(userId!);
    return {
      data: teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        created_at: t.createdAt,
        updated_at: t.updatedAt,
      })),
    };
  })
  .get("/:teamId", async ({ params, set }) => {
    try {
      const team = await teamService.getTeam(params.teamId as string);
      return {
        id: team.id,
        name: team.name,
        description: team.description,
        created_at: team.createdAt,
        updated_at: team.updatedAt,
      };
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "team not found" } };
    }
  })
  .put("/:teamId", async ({ params, body }) => {
    const { name, description } = body as any;
    const team = await teamService.updateTeam(params.teamId as string, name, description);
    return {
      id: team.id,
      name: team.name,
      description: team.description,
      created_at: team.createdAt,
      updated_at: team.updatedAt,
    };
  })
  .delete("/:teamId", async ({ params, set }) => {
    try {
      await teamService.deleteTeam(params.teamId as string);
      return { message: "team deleted" };
    } catch {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "team not found" } };
    }
  })
  .post("/:teamId/members", async ({ params, body, set }) => {
    const { user_id, role } = body as any;
    try {
      const member = await teamService.addMember(params.teamId as string, user_id, role);
      set.status = 201;
      return {
        user_id: member.userId,
        role: member.role,
        display_name: member.displayName,
        email: member.email,
        joined_at: member.joinedAt,
      };
    } catch (e: any) {
      if (e.message?.includes("already")) {
        set.status = 409;
        return { error: { code: "CONFLICT", message: e.message } };
      }
      throw e;
    }
  })
  .delete("/:teamId/members/:userId", async ({ params }) => {
    await teamService.removeMember(params.teamId as string, params.userId as string);
    return { message: "member removed" };
  })
  .put("/:teamId/members/:userId", async ({ params, body }) => {
    const { role } = body as any;
    const member = await teamService.updateMemberRole(
      params.teamId as string,
      params.userId as string,
      role,
    );
    return {
      user_id: member.userId,
      role: member.role,
      display_name: member.displayName,
      email: member.email,
      joined_at: member.joinedAt,
    };
  });
