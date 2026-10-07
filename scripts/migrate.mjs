import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import {isDestructiveMigration} from "./migration-safety.mjs";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for migrations.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const dir = path.resolve("migrations");
const files = (await fs.readdir(dir))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name) && !/^9\d{3}_/.test(name))
  .sort();

const destructiveSafetyBaseline="0058_launch_readiness_gate.sql";

for (const filename of files) {
  const [exists] = await sql`SELECT 1 AS ok FROM schema_migrations WHERE filename=${filename}`;
  if (exists) continue;
  const body = await fs.readFile(path.join(dir, filename), "utf8");

  const destructive=isDestructiveMigration(body);
  const protectedByCurrentPolicy=filename>destructiveSafetyBaseline;
  if(destructive&&protectedByCurrentPolicy){
    const protectedTenants=await sql`
      SELECT id::text id,slug
      FROM organizations
      WHERE settings->>'dataProtection'='persistent'
      ORDER BY slug
    `;

    if(process.env.ALLOW_DESTRUCTIVE_MIGRATION!=="1"){
      throw new Error(
        `Refusing destructive migration ${filename}. `+
        "Destructive production migrations require ALLOW_DESTRUCTIVE_MIGRATION=1 and must run as an explicit release step."
      );
    }

    if(protectedTenants.length && process.env.ALLOW_PROTECTED_TENANT_DESTRUCTIVE_MIGRATION!=="1"){
      throw new Error(
        `Refusing destructive migration ${filename}: persistent customer workspaces exist (${protectedTenants.map(row=>row.slug).join(", ")}). `+
        "Set ALLOW_PROTECTED_TENANT_DESTRUCTIVE_MIGRATION=1 only after backup and explicit review."
      );
    }
  }

  console.log(`Applying ${filename}`);
  await sql.begin(async tx=>{
    await tx.unsafe(body);
    await tx`INSERT INTO schema_migrations(filename) VALUES (${filename})`;
  });
}

await sql.end();
console.log("Migrations complete.");
