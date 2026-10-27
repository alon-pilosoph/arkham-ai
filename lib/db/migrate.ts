// npm run db:migrate: applies drizzle/ to the database at DATABASE_URL. Runs before every
// deployed build, so a deployment never starts on an older schema; Vercel gives each preview its
// own Neon branch, so a preview's migration never touches production. Without DATABASE_URL there
// is nothing to do: PGlite migrates itself when it opens.

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { MIGRATIONS } from "./index";

const url = process.env.DATABASE_URL;
if (!url) console.log("db:migrate: no DATABASE_URL, nothing to migrate");
else {
  const pool = new Pool({ connectionString: url });
  await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS });
  await pool.end();
  console.log("db:migrate: up to date");
}
