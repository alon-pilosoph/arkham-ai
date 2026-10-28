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

// On globalThis, not in a module variable: Next loads server pages and route handlers as
// separate copies of this module, and with PGlite in memory each copy would open a database of
// its own.
const shared = globalThis as { arkhamDb?: Promise<Db> | null };

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
  shared.arkhamDb ??= open().catch((e) => {
    shared.arkhamDb = null;
    throw e;
  });
  return shared.arkhamDb;
}

/** A fresh in-memory database: for tests. */
export function resetDb(): void {
  shared.arkhamDb = null;
}
