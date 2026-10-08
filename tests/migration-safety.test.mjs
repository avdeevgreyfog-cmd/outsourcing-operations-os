import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("../migrations/",import.meta.url));
const historicalAllowlist=new Set(["0052_personal_workspace_owner_repair.sql","0053_clean_personal_workspace.sql"]);
const protectedIdentifiers=[
  "00000000-0000-4000-8000-000000000002",
  "sergey-work",
];
const destructive=/\b(?:DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|DROP\s+(?:TABLE|SCHEMA))\b/i;

test("new migrations cannot reset a persistent customer workspace",()=>{
  const violations=[];
  for(const name of readdirSync(root).filter(value=>value.endsWith(".sql")).sort()){
    if(historicalAllowlist.has(name))continue;
    const sql=readFileSync(join(root,name),"utf8");
    if(!destructive.test(sql))continue;
    if(protectedIdentifiers.some(identifier=>sql.includes(identifier)))violations.push(basename(name));
  }
  assert.deepEqual(
    violations,
    [],
    "Persistent customer workspaces must never be targets of destructive schema migrations. Use a demo-only reset path instead.",
  );
});


test("migration runner is fail-closed for destructive changes",()=>{
  const runner=readFileSync(fileURLToPath(new URL("../scripts/migrate.mjs",import.meta.url)),"utf8");
  assert.match(runner,/ALLOW_DESTRUCTIVE_MIGRATION/);
  assert.match(runner,/ALLOW_PROTECTED_TENANT_DESTRUCTIVE_MIGRATION/);
  assert.match(runner,/persistent customer workspaces exist/);
  assert.match(runner,/sql\.begin/,"each migration must be recorded atomically with its SQL");
});

test("application build never runs database migrations",()=>{
  const build=readFileSync(fileURLToPath(new URL("../scripts/build.mjs",import.meta.url)),"utf8");
  assert.doesNotMatch(build,/migrate\.mjs|db:migrate/);
});


test("staging migrations are blocked until production and staging database identities are verified",()=>{
  const workflow=readFileSync(fileURLToPath(new URL("../.github/workflows/staging-database.yml",import.meta.url)),"utf8");
  assert.match(workflow,/production-database-identity:/);
  assert.match(workflow,/PRODUCTION_DATABASE_URL/);
  assert.match(workflow,/verify-database-boundary:/);
  assert.match(workflow,/needs:\s*\[staging-database-identity, production-database-identity\]/);
  assert.match(workflow,/migrate-staging:[\s\S]*needs:\s*\[verify-database-boundary\]/);
  assert.match(workflow,/Staging and production resolve to the same PostgreSQL database/);
});

test("release readiness reports an unavailable database identity as a failure instead of skipping boundary verification",()=>{
  const workflow=readFileSync(fileURLToPath(new URL("../.github/workflows/release-readiness.yml",import.meta.url)),"utf8");
  assert.match(workflow,/verify-database-boundary:[\s\S]*if:\s*\$\{\{ always\(\) \}\}/);
  assert.match(workflow,/PRODUCTION_RESULT/);
  assert.match(workflow,/Production database identity was not verified/);
});


test("staging smoke uses independent beta and main schema baselines",()=>{
  const workflow=readFileSync(fileURLToPath(new URL("../.github/workflows/staging-smoke.yml",import.meta.url)),"utf8");
  assert.match(workflow,/STAGING_EXPECTED_SCHEMA/);
  assert.match(workflow,/PRODUCTION_EXPECTED_SCHEMA/);
  assert.match(workflow,/git fetch --no-tags --depth=1 origin main/);
  assert.match(workflow,/production schema drifted from main/);
  assert.doesNotMatch(workflow,/production\.schemaVersion!==process\.env\.EXPECTED_SCHEMA/);
});


test("staging smoke only requires a new deployment for runtime-affecting beta changes",()=>{
  const workflow=readFileSync(fileURLToPath(new URL("../.github/workflows/staging-smoke.yml",import.meta.url)),"utf8");
  assert.match(workflow,/Determine whether this commit requires a new staging deployment/);
  assert.match(workflow,/migrations\/\*\|scripts\/migrate\.mjs\|scripts\/migration-safety\.mjs/);
  assert.match(workflow,/REQUIRE_DEPLOYMENT/);
  assert.match(workflow,/require_deployment=\$require_deployment/);
});

test("staging smoke waits for the beta schema independently of Vercel deployment SHA",()=>{
  const workflow=readFileSync(fileURLToPath(new URL("../.github/workflows/staging-smoke.yml",import.meta.url)),"utf8");
  assert.match(workflow,/schema_ready=false/);
  assert.match(workflow,/Staging schema did not reach the beta baseline in time/);
  assert.match(workflow,/staging_schema.*staging_expected_schema/);
});


test("staging smoke resolves the production schema baseline from main with extended regex",()=>{
  const workflow=readFileSync(fileURLToPath(new URL("../.github/workflows/staging-smoke.yml",import.meta.url)),"utf8");
  assert.match(workflow,/git ls-tree -r --name-only FETCH_HEAD migrations \| grep -E/);
  assert.match(workflow,/\^migrations\/\[0-8\]\[0-9\]\{3\}_\.\+\\\.sql\$/);
});
