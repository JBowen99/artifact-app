import Elysia from "elysia";
import * as authService from "@/services/auth.service";

export const userHandler = new Elysia({ prefix: "/users" })
  .get("/me", async ({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      return { error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" } };
    }
    const user = await authService.getUserById(userId);
    if (!user) {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "user not found" } };
    }
    return {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      role: user.role,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  })
  .put("/me", async ({ userId, body, set }) => {
    if (!userId) {
      set.status = 401;
      return { error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" } };
    }
    const { display_name, email } = body as any;
    const user = await authService.updateUser(userId, display_name, email);
    return {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      role: user.role,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  });
