import Elysia from "elysia";
import * as authService from "@/services/auth.service";

export const authHandler = new Elysia({ prefix: "/auth" })
  .post("/register", async ({ body, set }) => {
    const { email, password, display_name } = body as any;
    if (!email || !password) {
      set.status = 400;
      return { error: { code: "VALIDATION_ERROR", message: "email and password are required" } };
    }
    try {
      const user = await authService.register(email, password, display_name || "");
      return {
        user: {
          id: user.id,
          email: user.email,
          display_name: user.displayName,
          role: user.role,
          created_at: user.createdAt,
          updated_at: user.updatedAt,
        },
      };
    } catch (e: any) {
      if (e.message?.includes("duplicate") || e.message?.includes("unique")) {
        set.status = 409;
        return { error: { code: "CONFLICT", message: "email already registered" } };
      }
      throw e;
    }
  })
  .post("/login", async ({ body, set }) => {
    const { email, password } = body as any;
    if (!email || !password) {
      set.status = 400;
      return { error: { code: "VALIDATION_ERROR", message: "email and password are required" } };
    }
    try {
      const { pair, user } = await authService.login(email, password);
      return {
        access_token: pair.accessToken,
        refresh_token: pair.refreshToken,
        expires_in: pair.expiresIn,
        user: {
          id: user.id,
          email: user.email,
          display_name: user.displayName,
          role: user.role,
        },
      };
    } catch {
      set.status = 401;
      return { error: { code: "INVALID_CREDENTIALS", message: "invalid credentials" } };
    }
  })
  .post("/refresh", async ({ body, set }) => {
    const { refresh_token } = body as any;
    if (!refresh_token) {
      set.status = 400;
      return { error: { code: "VALIDATION_ERROR", message: "refresh_token is required" } };
    }
    try {
      const { pair, user } = await authService.refresh(refresh_token);
      return {
        access_token: pair.accessToken,
        refresh_token: pair.refreshToken,
        expires_in: pair.expiresIn,
        user: {
          id: user.id,
          email: user.email,
          display_name: user.displayName,
          role: user.role,
        },
      };
    } catch (e: any) {
      set.status = 401;
      return { error: { code: "INVALID_TOKEN", message: e.message } };
    }
  })
  .post("/logout", async ({ body }) => {
    const { refresh_token } = body as any;
    if (refresh_token) {
      await authService.logout(refresh_token);
    }
    return { message: "logged out" };
  })
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
  });
