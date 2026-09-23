import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

await migrate(db, { migrationsFolder: "./migrations" });
await pool.end();
