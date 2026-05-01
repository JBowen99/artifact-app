import Elysia from "elysia";
import { logger } from "@/lib/logger";

export const loggerPlugin = new Elysia({ name: "request-logger" })
  .derive(({ request }) => {
    return { _start: performance.now() };
  })
  .onAfterResponse(({ request, set, _start }) => {
    const duration = performance.now() - (_start as number);
    logger.info(
      {
        method: request.method,
        path: new URL(request.url).pathname,
        status: set.status,
        duration: Math.round(duration),
        ip: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
      "request",
    );
  });
