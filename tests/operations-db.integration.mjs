import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required for operations integration tests");
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
const org="00000000-0000-4000-8000-000000000001";
const director="10000000-0000-4000-8000-000000000001";

try{
  const migrations=await sql`SELECT filename FROM schema_migrations ORDER BY filename`;
  assert.ok(migrations.some(row=>row.filename==="0034_operations_workforce_core.sql"),"operations workforce migration must be applied");
  assert.ok(migrations.some(row=>row.filename==="0035_operations_offboarding_and_supply_approval.sql"),"offboarding/supply approval migration must be applied");
  assert.ok(migrations.some(row=>row.filename==="0039_object_worker_manager_integrity.sql"),"object/worker manager integrity migration must be applied");
  assert.ok(migrations.some(row=>row.filename==="0041_object_contacts.sql"),"object contacts migration must be applied");
  assert.ok(migrations.some(row=>row.filename==="0047_workforce_rehire_and_supply_norms.sql"),"repeat recruiting/supply norm migration must be applied");
  await sql`SELECT set_config('app.organization_id',${org},false),set_config('app.user_id',${director},false)`;

  const [object]=await sql`SELECT id,owner_user_id,client_company_id FROM objects WHERE organization_id=${org}::uuid ORDER BY created_at LIMIT 1`;
  const [specialty]=await sql`SELECT id FROM specialties WHERE organization_id=${org}::uuid ORDER BY name LIMIT 1`;
  const [need]=await sql`SELECT id FROM needs WHERE organization_id=${org}::uuid AND object_id=${object?.id??null}::uuid ORDER BY created_at LIMIT 1`;
  assert.ok(object?.id&&specialty?.id&&need?.id,"seed must provide object, specialty and need");

  const [managerMismatch]=await sql`
    SELECT count(*)::int count
    FROM worker_object_assignments a
    JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
    JOIN objects o ON o.id=a.object_id
    WHERE a.organization_id=${org}::uuid
      AND a.effective_from<=current_date
      AND (a.effective_to IS NULL OR a.effective_to>=current_date)
      AND a.manager_user_id IS DISTINCT FROM o.owner_user_id
  `;
  assert.equal(managerMismatch.count,0,"every active worker assignment must inherit the current object manager");

  const [managerlessObject]=await sql`
    SELECT count(*)::int count
    FROM objects o
    WHERE o.organization_id=${org}::uuid
      AND o.owner_user_id IS NULL
      AND EXISTS(
        SELECT 1 FROM worker_object_assignments a
        JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
        WHERE a.object_id=o.id
          AND a.effective_from<=current_date
          AND (a.effective_to IS NULL OR a.effective_to>=current_date)
      )
  `;
  assert.equal(managerlessObject.count,0,"staffed objects must always have a manager");

  const [contactMismatch]=await sql`
    SELECT count(*)::int count
    FROM object_contact_assignments a
    JOIN objects o ON o.id=a.object_id
    JOIN contacts c ON c.id=a.contact_id
    WHERE a.organization_id=${org}::uuid AND a.active
      AND o.client_company_id IS DISTINCT FROM c.client_company_id
  `;
  assert.equal(contactMismatch.count,0,"object contacts must belong to the same client as the object");

  const validContact=randomUUID();
  await sql`
    INSERT INTO contacts(id,organization_id,client_company_id,full_name,phone,communication_preference,created_by_user_id)
    VALUES(${validContact}::uuid,${org}::uuid,${object.client_company_id}::uuid,'Integration object contact','+7 900 000-00-01','phone',${director}::uuid)
  `;
  const validAssignment=randomUUID();
  await sql`
    INSERT INTO object_contact_assignments(id,organization_id,object_id,contact_id,roles,note,created_by_user_id)
    VALUES(${validAssignment}::uuid,${org}::uuid,${object.id}::uuid,${validContact}::uuid,ARRAY['operations','timesheet'],'Integration valid contact',${director}::uuid)
  `;
  const [validLink]=await sql`SELECT active,roles FROM object_contact_assignments WHERE id=${validAssignment}::uuid`;
  assert.equal(validLink.active,true,"same-client object contact must be accepted");
  assert.deepEqual(validLink.roles,["operations","timesheet"]);

  const foreignClient=randomUUID();
  await sql`
    INSERT INTO client_companies(id,organization_id,name,status,created_by_user_id)
    VALUES(${foreignClient}::uuid,${org}::uuid,'Integration foreign client','active',${director}::uuid)
  `;
  const foreignContact=randomUUID();
  await sql`
    INSERT INTO contacts(id,organization_id,client_company_id,full_name,phone,communication_preference,created_by_user_id)
    VALUES(${foreignContact}::uuid,${org}::uuid,${foreignClient}::uuid,'Integration foreign contact','+7 900 000-00-02','phone',${director}::uuid)
  `;
  await assert.rejects(
    sql`
      INSERT INTO object_contact_assignments(organization_id,object_id,contact_id,roles,created_by_user_id)
      VALUES(${org}::uuid,${object.id}::uuid,${foreignContact}::uuid,ARRAY['operations'],${director}::uuid)
    `,
    /same client/i,
    "database must reject a contact belonging to another client"
  );

  const repeatCandidate=randomUUID();
  await sql`
    INSERT INTO candidates(id,organization_id,full_name,phone,status,created_by_user_id)
    VALUES(${repeatCandidate}::uuid,${org}::uuid,'Repeat recruiting integration candidate','+7 900 000-09-99','available',${director}::uuid)
  `;
  await sql`
    INSERT INTO candidate_applications(organization_id,candidate_id,need_id,object_id,stage,created_by_user_id)
    VALUES(${org}::uuid,${repeatCandidate}::uuid,${need.id}::uuid,${object.id}::uuid,'rejected',${director}::uuid)
  `;
  await sql`
    INSERT INTO candidate_applications(organization_id,candidate_id,need_id,object_id,stage,created_by_user_id)
    VALUES(${org}::uuid,${repeatCandidate}::uuid,${need.id}::uuid,${object.id}::uuid,'new',${director}::uuid)
  `;
  const [repeatCycle]=await sql`
    SELECT count(*)::int count,count(*) FILTER (WHERE stage='new')::int active
    FROM candidate_applications WHERE candidate_id=${repeatCandidate}::uuid AND need_id=${need.id}::uuid
  `;
  assert.equal(repeatCycle.count,2,"same person must keep historical and new recruiting cycles for one need");
  assert.equal(repeatCycle.active,1,"only one active repeat recruiting cycle is allowed");

  const worker=randomUUID();
  await sql`
    INSERT INTO worker_profiles(id,organization_id,full_name,status,source,created_by_user_id)
    VALUES(${worker}::uuid,${org}::uuid,'Operations integration worker','active','integration',${director}::uuid)
  `;
  await sql`
    INSERT INTO employment_relations(organization_id,worker_id,relation_type,effective_from,created_by_user_id)
    VALUES(${org}::uuid,${worker}::uuid,'employment',current_date,${director}::uuid)
  `;
  await sql`
    INSERT INTO worker_object_assignments(organization_id,worker_id,object_id,specialty_id,effective_from,manager_user_id,created_by_user_id)
    VALUES(${org}::uuid,${worker}::uuid,${object.id}::uuid,${specialty.id}::uuid,current_date,${director}::uuid,${director}::uuid)
  `;
  const [workerManager]=await sql`
    SELECT manager_user_id FROM worker_object_assignments
    WHERE worker_id=${worker}::uuid AND effective_to IS NULL
  `;
  assert.equal(workerManager.manager_user_id,object.owner_user_id,"worker assignment trigger must override an arbitrary manager with the object manager");

  const location=randomUUID();
  const item=randomUUID();
  await sql`
    INSERT INTO storage_locations(id,organization_id,name,kind,object_id,responsible_user_id,created_by_user_id)
    VALUES(${location}::uuid,${org}::uuid,'Integration object stock','object',${object.id}::uuid,${director}::uuid,${director}::uuid)
  `;
  await sql`
    INSERT INTO inventory_items(id,organization_id,code,name,category,unit,returnable,tracks_variant,created_by_user_id)
    VALUES(${item}::uuid,${org}::uuid,${"TEST-"+item.slice(0,8)},'Integration boots','workwear','пар',true,true,${director}::uuid)
  `;
  await sql`
    INSERT INTO inventory_stock_limits(organization_id,location_id,item_id,variant,min_quantity,updated_by_user_id)
    VALUES(${org}::uuid,${location}::uuid,${item}::uuid,'43',5,${director}::uuid)
  `;
  await sql`
    INSERT INTO inventory_movements(organization_id,item_id,variant,movement_type,quantity,to_location_id,created_by_user_id)
    VALUES(${org}::uuid,${item}::uuid,'43','receipt',3,${location}::uuid,${director}::uuid)
  `;
  await sql`
    INSERT INTO inventory_movements(organization_id,item_id,variant,movement_type,quantity,from_location_id,worker_id,created_by_user_id)
    VALUES(${org}::uuid,${item}::uuid,'43','issue',1,${location}::uuid,${worker}::uuid,${director}::uuid)
  `;
  await sql`
    INSERT INTO inventory_movements(organization_id,item_id,variant,movement_type,quantity,to_location_id,worker_id,item_condition,created_by_user_id)
    VALUES(${org}::uuid,${item}::uuid,'43','return',1,${location}::uuid,${worker}::uuid,'damaged',${director}::uuid)
  `;
  await sql`
    INSERT INTO inventory_movements(organization_id,item_id,variant,movement_type,quantity,from_location_id,item_condition,note,created_by_user_id)
    VALUES(${org}::uuid,${item}::uuid,'43','writeoff',1,${location}::uuid,'damaged','Integration return writeoff',${director}::uuid)
  `;
  const [stock]=await sql`
    WITH deltas AS (
      SELECT quantity delta FROM inventory_movements WHERE item_id=${item}::uuid AND variant='43' AND to_location_id=${location}::uuid AND movement_type IN ('opening','receipt','transfer','return','adjustment_in')
      UNION ALL
      SELECT -quantity delta FROM inventory_movements WHERE item_id=${item}::uuid AND variant='43' AND from_location_id=${location}::uuid AND movement_type IN ('transfer','issue','writeoff','adjustment_out')
    ) SELECT COALESCE(sum(delta),0)::numeric quantity FROM deltas
  `;
  assert.equal(Number(stock.quantity),2,"receipt → issue → return → writeoff must leave correct stock");
  const [workerOutstanding]=await sql`
    SELECT COALESCE(sum(CASE WHEN movement_type='issue' THEN quantity WHEN movement_type='return' THEN -quantity WHEN movement_type='writeoff' AND from_location_id IS NULL THEN -quantity ELSE 0 END),0)::numeric quantity
    FROM inventory_movements WHERE worker_id=${worker}::uuid AND item_id=${item}::uuid AND variant='43'
  `;
  assert.equal(Number(workerOutstanding.quantity),0,"returned item must no longer remain assigned to worker");

  const housing=randomUUID();
  const unit=randomUUID();
  await sql`
    INSERT INTO housing_sites(id,organization_id,name,primary_object_id,responsible_user_id,rate_model,rate_amount,created_by_user_id)
    VALUES(${housing}::uuid,${org}::uuid,'Integration housing',${object.id}::uuid,${director}::uuid,'room_month',45000,${director}::uuid)
  `;
  await sql`INSERT INTO housing_units(id,organization_id,site_id,name,capacity) VALUES(${unit}::uuid,${org}::uuid,${housing}::uuid,'Room 1',2)`;
  await sql`
    INSERT INTO housing_stays(organization_id,worker_id,object_id,site_id,unit_id,check_in,status,created_by_user_id)
    VALUES(${org}::uuid,${worker}::uuid,${object.id}::uuid,${housing}::uuid,${unit}::uuid,current_date,'active',${director}::uuid)
  `;

  const supply=randomUUID();
  await sql`
    INSERT INTO supply_requests(id,organization_id,object_id,request_type,title,item_id,location_id,quantity,unit,status,created_by_user_id)
    VALUES(${supply}::uuid,${org}::uuid,${object.id}::uuid,'purchase','Integration replenishment',${item}::uuid,${location}::uuid,3,'пар','submitted',${director}::uuid)
  `;
  const approval=randomUUID();
  await sql`
    INSERT INTO approval_instances(id,organization_id,subject_type,subject_id,process_code,status,requested_by_user_id)
    VALUES(${approval}::uuid,${org}::uuid,'supply_request',${supply}::uuid,'supply_request','pending',${director}::uuid)
  `;
  const [approvalRow]=await sql`SELECT subject_type,status FROM approval_instances WHERE id=${approval}::uuid`;
  assert.equal(approvalRow.subject_type,"supply_request");
  assert.equal(approvalRow.status,"pending");

  const exit=randomUUID();
  await sql`
    INSERT INTO worker_exit_processes(id,organization_id,worker_id,object_id,effective_date,reason_code,status,created_by_user_id)
    VALUES(${exit}::uuid,${org}::uuid,${worker}::uuid,${object.id}::uuid,current_date+14,'project_end','planned',${director}::uuid)
  `;
  const [plannedExit]=await sql`SELECT status,effective_date>current_date future,return_to_recruiting FROM worker_exit_processes WHERE id=${exit}::uuid`;
  assert.equal(plannedExit.status,"planned");
  assert.equal(plannedExit.future,true);
  assert.equal(plannedExit.return_to_recruiting,true,"planned exit should default to repeat recruiting handoff");

  const audited=await sql`
    SELECT count(*)::int count FROM audit_events
    WHERE resource_type IN ('storage_locations','inventory_items','inventory_movements','supply_requests','housing_sites','housing_stays','worker_exit_processes')
      AND organization_id=${org}::uuid
  `;
  assert.ok(audited[0].count>=7,"operations mutations must be present in system audit");

  await sql.unsafe("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='operations_test_runtime') THEN CREATE ROLE operations_test_runtime NOLOGIN; END IF; END $$");
  await sql.unsafe("GRANT USAGE ON SCHEMA public TO operations_test_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO operations_test_runtime; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO operations_test_runtime");
  await sql.begin(async tx=>{
    await tx.unsafe("SET LOCAL ROLE operations_test_runtime");
    await tx`SELECT set_config('app.organization_id',${org},true),set_config('app.user_id',${director},true)`;
    const visible=await tx`SELECT DISTINCT organization_id FROM supply_requests`;
    assert.deepEqual(visible.map(row=>row.organization_id),[org]);
  });

  console.log("Operations PostgreSQL integration passed: worker lifecycle, distributed stock, return/writeoff, housing, supply approval, audit and tenant isolation.");
}finally{
  await sql.end();
}
