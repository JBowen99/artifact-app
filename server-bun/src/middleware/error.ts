import Elysia from "elysia";
import { logger } from "@/lib/logger";

export const errorPlugin = new Elysia({ name: "error" })
  .onError(({ code, error, set }) => {
    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        error: {
          code: "NOT_FOUND",
          message: "Resource not found",
        },
      };
    }

    if (code === "VALIDATION") {
      set.status = 400;
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: error.message,
        },
      };
    }

    logger.error({ err: error, code }, "Unhandled error");

    set.status = 500;
    return {
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred",
      },
    };
  });
