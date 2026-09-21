import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function moduleUrl(path){
  const source=ts.transpileModule(fs.readFileSync(new URL("../"+path,import.meta.url),"utf8"),{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
  }).outputText;
  return "data:text/javascript;base64,"+Buffer.from(source).toString("base64");
}

const demo=await import(moduleUrl("lib/demo/data.ts"));
const organization=await import(moduleUrl("lib/demo/organization.ts"));

test("beta company fixture covers all operating modules",()=>{
  assert.equal(demo.clients.length,5);
  assert.equal(demo.requests.length,5);
  assert.equal(demo.objects.length,5);
  assert.equal(demo.proposals.length,5);
  assert.equal(demo.needs.length,21);
  assert.equal(demo.candidates.length,50);
  assert.ok(demo.workers.length>=40);

  const objectIds=new Set(demo.objects.map(row=>row.id));
  assert.deepEqual(new Set(demo.needs.map(row=>row.objectId)),objectIds);
  assert.deepEqual(new Set(demo.proposals.map(row=>row.clientId)),new Set(demo.clients.map(row=>row.id)));
  assert.ok(demo.needs.every(row=>objectIds.has(row.objectId)));
  assert.ok(demo.candidates.every(row=>objectIds.has(row.objectId)));
  assert.ok(demo.workers.every(row=>objectIds.has(row.objectId)));
  assert.ok(demo.objects.some(row=>row.status==="launch"));
  assert.ok(demo.objects.filter(row=>row.status==="active").length>=4);
});

test("beta organization is a filled working company",()=>{
  assert.equal(organization.companyEmployees.length,14);
  assert.equal(organization.staffPositions.length,14);
  assert.equal(organization.positionAssignments.length,14);
  assert.ok(organization.organizationUnits.length>=8);
  assert.ok(organization.processRoles.length>=8);

  const memberships=new Set(organization.companyEmployees.map(row=>row.id));
  const positions=new Set(organization.staffPositions.map(row=>row.id));
  assert.ok(organization.companyEmployees.every(row=>!row.managerMembershipId||memberships.has(row.managerMembershipId)));
  assert.ok(organization.positionAssignments.every(row=>memberships.has(row.membershipId)&&positions.has(row.staffPositionId)));
  assert.ok(organization.staffPositions.every(row=>row.status==="filled"&&row.open===0));
  assert.equal(organization.companyEmployees.filter(row=>row.position==="Менеджер объекта").length,2);
  assert.equal(organization.companyEmployees.filter(row=>row.position==="Менеджер по подбору").length,3);
  assert.equal(organization.companyEmployees.filter(row=>row.position==="Менеджер по клиентским заявкам").length,2);
});
