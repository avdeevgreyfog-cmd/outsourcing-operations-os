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
