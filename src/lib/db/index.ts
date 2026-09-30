import "server-only";
import { createDb, type Db } from "./client";

// Reuse one connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { sinksDb?: Db };

export const db: Db = globalForDb.sinksDb ?? createDb(process.env.DATABASE_PATH ?? "data/sinks.db");
if (process.env.NODE_ENV !== "production") globalForDb.sinksDb = db;

export * as schema from "./schema";
