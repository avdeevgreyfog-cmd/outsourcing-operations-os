import test from "node:test";
import assert from "node:assert/strict";
import { buildCalculationQueue } from "../lib/commercial/calculation-queue.mjs";

const req=(id,stage,more={})=>({
  id,title:"Заявка "+id,client:"Заказчик",status:"draft",workflowStageCode:stage,
  archivedAt:null,closedAt:null,updatedAt:"2026-10-01T12:00:00Z",start:null,
  roles:[{name:"Комплектовщик",count:5},{name:"Грузчик",count:3}],...more,
});
const tender=(id,stage,decision="participate")=>({
  id,title:"Тендер "+id,customer:"Клиент",stage,decision,roleCount:1,
  updatedAt:"2026-10-01T12:00:00Z",submissionDeadline:"2026-10-20T11:00:00+03:00",
});
const scenario=(sourceType,sourceId,calculationId,version,status,role)=>({
  sourceType,sourceId,calculationId,calculationVersion:version,status,sourceRoleId:role,
});
test("calculation queue includes ready requests and approved tender participation without creating new entities",()=>{
  const rows=buildCalculationQueue([
    req("1","ready_calc"),req("2","new"),req("3","ready_calc",{archivedAt:"2026-10-01"}),
    req("4","negotiation"),req("5","calculation",{status:"accepted"}),
  ],[
    tender("10","calculation"),tender("11","analysis","no_bid"),tender("12","completed"),
  ],[]);
  assert.deepEqual(new Set(rows.map(item=>item.id)),new Set(["request:1","tender:10"]));
  assert.equal(rows.find(item=>item.sourceId==="1").state,"not_started");
  assert.equal(rows.find(item=>item.sourceId==="10").dateKind,"Подача заявки");
});
test("calculation queue uses latest version and excludes completely accepted positions",()=>{
  const rows=buildCalculationQueue([req("1","ready_calc"),req("2","ready_calc"),req("3","negotiation")],[],[
    scenario("request","1","calc-old",1,"accepted","a"),
    scenario("request","1","calc-old",1,"accepted","b"),
    scenario("request","1","calc-new",2,"accepted","a"),
    scenario("request","1","calc-new",2,"draft","b"),
    scenario("request","2","calc-complete",1,"accepted","a"),
    scenario("request","2","calc-complete",1,"accepted","b"),
    scenario("request","3","calc-rework",1,"rejected","a"),
  ]);
  assert.equal(rows.find(row=>row.sourceId==="1").acceptedRoles,1);
  assert.equal(rows.find(row=>row.sourceId==="1").calculationId,"calc-new");
  assert.ok(!rows.some(row=>row.sourceId==="2"));
  assert.ok(rows.some(row=>row.sourceId==="3"));
});
