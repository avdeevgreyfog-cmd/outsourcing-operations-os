import fs from "node:fs/promises";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for seed.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const [existing] = await sql`SELECT 1 AS ok FROM organizations WHERE id='00000000-0000-4000-8000-000000000001'::uuid`;
if (existing) {
  console.log("Demo organization already exists; seed skipped.");
  await sql.end();
  process.exit(0);
}

const body = await fs.readFile("migrations/9000_demo_seed.sql", "utf8");
await sql.unsafe(body);
await sql.end();
console.log("Demo seed complete. Login password for demo users: demo1234");
