import fs from "node:fs/promises";
import path from "node:path";
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

const dir=path.resolve("migrations");
const files=(await fs.readdir(dir)).filter((name)=>/^9\d{3}_.+\.sql$/.test(name)).sort();
for(const filename of files){
  console.log(`Applying seed ${filename}`);
  const body=await fs.readFile(path.join(dir,filename),"utf8");
  await sql.unsafe(body);
}
await sql.end();
console.log("Demo seed complete. Login password for demo users: demo1234");
