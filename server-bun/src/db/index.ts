import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";
import { config } from "@/config/env";

export const db = drizzle(config.database.url, { schema });
export type Database = typeof db;
