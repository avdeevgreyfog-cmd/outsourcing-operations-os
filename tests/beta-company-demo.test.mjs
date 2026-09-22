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
  assert.equal(demo.workers.length,44);

  const objectIds=new Set(demo.objects.map(row=>row.id));
  assert.deepEqual(new Set(demo.needs.map(row=>row.objectId)),objectIds);
  assert.deepEqual(new Set(demo.proposals.map(row=>row.clientId)),new Set(demo.clients.map(row=>row.id)));
  assert.ok(demo.needs.every(row=>objectIds.has(row.objectId)));
  assert.ok(demo.candidates.every(row=>objectIds.has(row.objectId)));
  assert.ok(demo.workers.every(row=>objectIds.has(row.objectId)));
  assert.equal(demo.objects.filter(row=>row.status==="active").length,5);
  const recruiterByObject=new Map([
    ["80000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000012"],
    ["80000000-0000-4000-8000-000000000002","10000000-0000-4000-8000-000000000013"],
    ["80000000-0000-4000-8000-000000000003","10000000-0000-4000-8000-000000000014"],
    ["80000000-0000-4000-8000-000000000004","10000000-0000-4000-8000-000000000012"],
    ["80000000-0000-4000-8000-000000000005","10000000-0000-4000-8000-000000000014"],
  ]);
  for(const object of demo.objects){
    const objectWorkers=demo.workers.filter(row=>row.objectId===object.id);
    const objectNeeds=demo.needs.filter(row=>row.objectId===object.id);
    assert.ok(objectWorkers.length>0,object.name+" must have active workers");
    assert.equal(objectWorkers.length,object.filled,object.name+" filled");
    assert.equal(objectNeeds.reduce((sum,row)=>sum+row.filled,0),object.filled,object.name+" need staffing");
    assert.equal(object.sourceRequestId,object.id.replace("80000000","73000000"));
    assert.equal(object.sourceProposalId,object.id.replace("80000000","7a000000"));
    assert.ok(demo.candidates.filter(row=>row.objectId===object.id).every(row=>row.ownerUserId===recruiterByObject.get(object.id)),object.name+" candidate recruiter");
    assert.ok(objectWorkers.every(row=>row.startDate&&row.specialty&&row.specialtyId),object.name+" worker assignment metadata");
    assert.ok(object.ownerUserId&&object.ownerName,object.name+" manager must be visible");
    assert.ok((object.assigneeUserIds??[]).includes(object.ownerUserId),object.name+" manager must be an object assignee");
    assert.ok(objectWorkers.every(row=>row.ownerUserId===object.ownerUserId),object.name+" worker manager id");
    assert.ok(objectWorkers.every(row=>row.managerName===object.ownerName),object.name+" worker manager name");
  }
  assert.ok(new Set(demo.workers.map(row=>row.startDate)).size>=20);
});

test("beta organization is a filled working company",()=>{
  assert.equal(organization.companyEmployees.length,13);
  assert.equal(organization.staffPositions.length,13);
  assert.equal(organization.positionAssignments.length,13);
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
  assert.equal(organization.companyEmployees.filter(row=>row.position==="Экономист / финансовый менеджер").length,1);
  const finance=organization.companyEmployees.find(row=>row.position==="Экономист / финансовый менеджер");
  const supply=organization.companyEmployees.find(row=>row.position==="Специалист по снабжению и документообороту");
  assert.equal(finance?.manager,"Анна Лебедева");
  assert.equal(supply?.manager,"Анна Лебедева");
  assert.deepEqual(finance?.roles.map(row=>row.code).sort(),["calculation-economist","finance-controller"]);
  const commercial=organization.companyEmployees.find(row=>row.name==="Михаил Соколов");
  assert.equal(commercial?.position,"Руководитель коммерческого направления");
  assert.equal(commercial?.orgUnit,"Коммерция");
  assert.equal(commercial?.manager,"Анна Лебедева");
  assert.equal(commercial?.roles[0]?.code,"commercial-owner");
  assert.equal(commercial?.objectCount,5);
});
