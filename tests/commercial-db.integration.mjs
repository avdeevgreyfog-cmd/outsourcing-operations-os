import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for commercial integration tests");

const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
const org="00000000-0000-4000-8000-000000000001";
const director="10000000-0000-4000-8000-000000000001";
const request="73000000-0000-4000-8000-000000000001";
const role="74000000-0000-4000-8000-000000000001";
const calculation="78000000-0000-4000-8000-000000000001";
const model="76000000-0000-4000-8000-000000000001";
const rule="77000000-0000-4000-8000-000000000001";
const client="70000000-0000-4000-8000-000000000001";
const region="30000000-0000-4000-8000-000000000001";

try{
  const migrations=await sql`SELECT filename FROM schema_migrations ORDER BY filename`;
  assert.ok(migrations.some(row=>row.filename==="0011_commercial_golden_path.sql"),"commercial migration must be applied");
  await sql`SELECT set_config('app.organization_id',${org},false),set_config('app.user_id',${director},false)`;

  const clientlessRequest=randomUUID();
  await sql`
    INSERT INTO requests(id,organization_id,client_company_id,title,status,source,location_text,region_id,owner_user_id,created_by_user_id)
    VALUES(${clientlessRequest}::uuid,${org}::uuid,NULL,'Clientless integration request','draft','manual','Москва',${region}::uuid,${director}::uuid,${director}::uuid)
  `;
  const [clientless]=await sql`SELECT client_company_id,status,source FROM requests WHERE id=${clientlessRequest}::uuid`;
  assert.equal(clientless.client_company_id,null);
  assert.equal(clientless.status,"draft");
  assert.equal(clientless.source,"manual");

  const scenario=randomUUID();
  await sql`
    INSERT INTO calculation_scenarios(id,organization_id,calculation_id,request_role_id,model_id,rule_version_id,name,status,inputs_snapshot,cost_snapshot,result_snapshot,created_by_user_id)
    VALUES(${scenario}::uuid,${org}::uuid,${calculation}::uuid,${role}::uuid,${model}::uuid,${rule}::uuid,'Commercial integration scenario','review',
      '{"workerNetHourly":410,"workers":24,"hoursPerWorker":242}'::jsonb,'{"employeeHourly":150}'::jsonb,
      '{"totalCostHourly":560,"clientRateHourly":700,"marginPct":20}'::jsonb,${director}::uuid)
  `;
  await sql`UPDATE calculation_scenarios SET status='superseded' WHERE request_role_id=${role}::uuid AND status='accepted'`;
  await sql`UPDATE calculation_scenarios SET status='accepted',accepted_by_user_id=${director}::uuid,accepted_at=now() WHERE id=${scenario}::uuid`;
  const [currentAccepted]=await sql`SELECT id FROM calculation_scenarios WHERE request_role_id=${role}::uuid AND status='accepted'`;
  assert.equal(currentAccepted.id,scenario,"new accepted scenario must replace current version without deleting history");
  const historical=await sql`SELECT count(*)::int count FROM calculation_scenarios WHERE request_role_id=${role}::uuid AND status='superseded'`;
  assert.ok(historical[0].count>=1,"previous accepted scenario must remain as superseded history");
  await assert.rejects(
    ()=>sql`UPDATE calculation_scenarios SET result_snapshot='{"clientRateHourly":1}'::jsonb WHERE id=${scenario}::uuid`,
    error=>/immutable/.test(error?.message??""),
  );

  const proposal=randomUUID();
  const proposalContent={requestId:request,roles:[{role:"Комплектовщик",count:24,rate:700,unit:"hour",scenarioId:scenario}]};
  await sql`
    INSERT INTO proposals(id,organization_id,request_id,version,status,scenario_ids,total_value,content_snapshot,created_by_user_id)
    VALUES(${proposal}::uuid,${org}::uuid,${request}::uuid,99,'draft',ARRAY[${scenario}::uuid],4065600,${sql.json(proposalContent)},${director}::uuid)
  `;
  await sql`UPDATE proposals SET status='approved',approved_by_user_id=${director}::uuid,approved_at=now() WHERE id=${proposal}::uuid`;
  await assert.rejects(
    ()=>sql`UPDATE proposals SET total_value=1 WHERE id=${proposal}::uuid`,
    error=>/immutable/.test(error?.message??""),
  );

  const approval=randomUUID();
  const step=randomUUID();
  await sql`
    INSERT INTO approval_instances(id,organization_id,subject_type,subject_id,process_code,status,requested_by_user_id)
    VALUES(${approval}::uuid,${org}::uuid,'proposal',${proposal}::uuid,'commercial_proposal','pending',${director}::uuid)
  `;
  await sql`
    INSERT INTO approval_steps(id,organization_id,approval_id,step_order,step_code,status,approver_user_id)
    VALUES(${step}::uuid,${org}::uuid,${approval}::uuid,1,'proposal_approval','pending',${director}::uuid)
  `;
  const audit=await sql`SELECT count(*)::int count FROM audit_events WHERE resource_type IN ('approval_instances','approval_steps') AND resource_id IN (${approval}::uuid,${step}::uuid)`;
  assert.ok(audit[0].count>=2,"approval mutations must be audited");

  const [launchOwner]=await sql`SELECT * FROM resolve_organization_responsibility('object_launch','owner','region',${region}::uuid,current_date)`;
  assert.equal(launchOwner?.user_id,"10000000-0000-4000-8000-000000000003","launch owner must come from Organization Core responsibility rule");

  const object1=randomUUID();
  await sql`
    INSERT INTO objects(id,organization_id,client_company_id,source_request_id,source_proposal_id,name,code,status,region_id,owner_user_id,created_by_user_id)
    VALUES(${object1}::uuid,${org}::uuid,${client}::uuid,${request}::uuid,${proposal}::uuid,'Commercial integration object',${`TEST-${object1.slice(0,8)}`},'launch',${region}::uuid,${director}::uuid,${director}::uuid)
  `;
  await assert.rejects(
    ()=>sql`
      INSERT INTO objects(organization_id,client_company_id,source_request_id,source_proposal_id,name,code,status,region_id,owner_user_id,created_by_user_id)
      VALUES(${org}::uuid,${client}::uuid,${request}::uuid,${proposal}::uuid,'Duplicate proposal object',${`DUP-${randomUUID().slice(0,8)}`},'launch',${region}::uuid,${director}::uuid,${director}::uuid)
    `,
    error=>error?.code==="23505",
  );

  await sql.unsafe("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='commercial_test_runtime') THEN CREATE ROLE commercial_test_runtime NOLOGIN; END IF; END $$");
  await sql.unsafe("GRANT USAGE ON SCHEMA public TO commercial_test_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO commercial_test_runtime; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO commercial_test_runtime");
  await sql.begin(async tx=>{
    await tx.unsafe("SET LOCAL ROLE commercial_test_runtime");
    await tx`SELECT set_config('app.organization_id',${org},true),set_config('app.user_id',${director},true)`;
    const visible=await tx`SELECT DISTINCT organization_id FROM approval_instances`;
    assert.deepEqual(visible.map(row=>row.organization_id),[org]);
  });

  console.log("Commercial Golden Path PostgreSQL integration passed: clientless request, calculation history, immutable proposal, approval audit, responsibility resolver and source-proposal uniqueness.");
}finally{
  await sql.end();
}
