import pino from "pino";
import { config } from "@/config/env";

export const logger = pino({
  level: config.log.level,
  transport:
    config.log.format === "text"
      ? {
          target: "pino-pretty",
        }
      : undefined,
});
