import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

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

for (const filename of files) {
  const [exists] = await sql`SELECT 1 AS ok FROM schema_migrations WHERE filename=${filename}`;
  if (exists) continue;
  const body = await fs.readFile(path.join(dir, filename), "utf8");

  const destructive=/\b(?:DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|DROP\s+(?:TABLE|SCHEMA))\b/i.test(body);
  if(destructive && process.env.ALLOW_PROTECTED_TENANT_DESTRUCTIVE_MIGRATION!=="1"){
    const protectedTenants=await sql`
      SELECT id::text id,slug
      FROM organizations
      WHERE settings->>'dataProtection'='persistent'
    `;
    const protectedTarget=protectedTenants.find((tenant)=>body.includes(tenant.id)||body.includes(tenant.slug));
    if(protectedTarget){
      throw new Error(
        `Refusing destructive migration ${filename}: it targets persistent workspace ${protectedTarget.slug}. `+
        "Customer data resets must never run as normal schema migrations."
      );
    }
  }

  console.log(`Applying ${filename}`);
  await sql.unsafe(body);
  await sql`INSERT INTO schema_migrations(filename) VALUES (${filename})`;
}

await sql.end();
console.log("Migrations complete.");
