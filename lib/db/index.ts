// One database handle per server. Deployed, it is Neon's Postgres, already migrated by the build.
// Without DATABASE_URL (local runs, tests, end-to-end tests) it is PGlite, Postgres in this
// process, migrated on open: in memory for unit tests, on disk under .data/ otherwise.

import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-serverless";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Db = ReturnType<typeof pgliteDrizzle<typeof schema>>;

export const MIGRATIONS = path.join(process.cwd(), "drizzle");

let opened: Promise<Db> | null = null;

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  // both are drizzle's Postgres database; only their drivers differ
  if (url) return neonDrizzle({ client: new Pool({ connectionString: url }), schema }) as unknown as Db;
  const dir = process.env.ARKHAM_DB_DIR ?? (process.env.VITEST ? undefined : path.join(process.cwd(), ".data", "pglite"));
  const db = pgliteDrizzle({ client: new PGlite(dir), schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export function getDb(): Promise<Db> {
  opened ??= open().catch((e) => {
    opened = null;
    throw e;
  });
  return opened;
}

/** A fresh in-memory database: for tests. */
export function resetDb(): void {
  opened = null;
}
