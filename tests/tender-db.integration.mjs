import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import postgres from "postgres";

if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required for Tender Core integration tests");
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
const org="00000000-0000-4000-8000-000000000001";
const director="10000000-0000-4000-8000-000000000001";
const model="76000000-0000-4000-8000-000000000001";
try{
  const migrations=await sql`SELECT filename FROM schema_migrations ORDER BY filename`;
  assert.ok(migrations.some(row=>row.filename==="0016_tender_core.sql"),"Tender Core migration must be applied");
  await sql`SELECT set_config('app.organization_id',${org},false),set_config('app.user_id',${director},false)`;

  const tender=randomUUID();
  await sql`INSERT INTO tenders(id,organization_id,title,customer_name,platform,procedure_number,submission_deadline,stage,decision,owner_user_id,created_by_user_id) VALUES(${tender}::uuid,${org}::uuid,'Tender Core integration','Test customer','Test ETP',${`TEST-${tender.slice(0,8)}`},now()+interval '5 day','analysis','participate',${director}::uuid,${director}::uuid)`;
  const [savedTender]=await sql`SELECT stage,decision FROM tenders WHERE id=${tender}::uuid`;
  assert.equal(savedTender.stage,"analysis");assert.equal(savedTender.decision,"participate");

  const tenderRole=randomUUID();
  await sql`INSERT INTO tender_roles(id,organization_id,tender_id,title,count_required,billing_unit) VALUES(${tenderRole}::uuid,${org}::uuid,${tender}::uuid,'Комплектовщик',20,'hour')`;
  const calculation=randomUUID();
  await sql`INSERT INTO calculations(id,organization_id,request_id,tender_id,status,owner_user_id,created_by_user_id) VALUES(${calculation}::uuid,${org}::uuid,NULL,${tender}::uuid,'draft',${director}::uuid,${director}::uuid)`;
  const scenario=randomUUID();
  await sql`INSERT INTO calculation_scenarios(id,organization_id,calculation_id,request_role_id,tender_role_id,model_id,name,status,inputs_snapshot,cost_snapshot,result_snapshot,created_by_user_id) VALUES(${scenario}::uuid,${org}::uuid,${calculation}::uuid,NULL,${tenderRole}::uuid,${model}::uuid,'Tender scenario','draft','{}'::jsonb,'[]'::jsonb,'{"clientRateNet":700,"marginPct":18}'::jsonb,${director}::uuid)`;
  const [linked]=await sql`SELECT c.request_id,c.tender_id,cs.request_role_id,cs.tender_role_id FROM calculations c JOIN calculation_scenarios cs ON cs.calculation_id=c.id WHERE cs.id=${scenario}::uuid`;
  assert.equal(linked.request_id,null);assert.equal(linked.tender_id,tender);assert.equal(linked.request_role_id,null);assert.equal(linked.tender_role_id,tenderRole);

  const document=randomUUID();
  await sql`INSERT INTO company_documents(id,organization_id,name,category,status,created_by_user_id) VALUES(${document}::uuid,${org}::uuid,'Integration company document','corporate','active',${director}::uuid)`;
  const requirement=randomUUID();
  await sql`INSERT INTO tender_document_requirements(id,organization_id,tender_id,company_document_id,name,category,status,created_by_user_id) VALUES(${requirement}::uuid,${org}::uuid,${tender}::uuid,${document}::uuid,'Устав','corporate','available',${director}::uuid)`;
  const [ready]=await sql`SELECT status FROM tender_document_requirements WHERE id=${requirement}::uuid`;
  assert.equal(ready.status,"available");

  const approval=randomUUID();
  await sql`INSERT INTO approval_instances(id,organization_id,subject_type,subject_id,process_code,status,requested_by_user_id) VALUES(${approval}::uuid,${org}::uuid,'tender',${tender}::uuid,'tender_participation','pending',${director}::uuid)`;
  const [approvalRow]=await sql`SELECT subject_type,subject_id FROM approval_instances WHERE id=${approval}::uuid`;
  assert.equal(approvalRow.subject_type,"tender");assert.equal(approvalRow.subject_id,tender);
  const audit=await sql`SELECT count(*)::int count FROM audit_events WHERE resource_type='tenders' AND resource_id=${tender}::uuid`;
  assert.ok(audit[0].count>=1,"Tender mutations must be audited");

  await assert.rejects(()=>sql`INSERT INTO calculations(organization_id,status,owner_user_id,created_by_user_id) VALUES(${org}::uuid,'draft',${director}::uuid,${director}::uuid)`,error=>error?.code==="23514");
  console.log("Tender Core PostgreSQL integration passed: parallel source, tender role scenario, company document checklist, approvals and audit.");
}finally{await sql.end();}
