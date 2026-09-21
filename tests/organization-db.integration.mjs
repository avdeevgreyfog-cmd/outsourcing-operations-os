import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Organization Core integration tests");

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const org1 = "00000000-0000-4000-8000-000000000001";
const user1 = "10000000-0000-4000-8000-000000000001";
const member1 = "50000000-0000-4000-8000-000000000001";
const member2 = "50000000-0000-4000-8000-000000000002";
const profile1 = "41000000-0000-4000-8000-000000000004";
const unit1 = "21000000-0000-4000-8000-000000000008";
const role1 = "42000000-0000-4000-8000-000000000001";

async function rejectsConstraint(action, pattern) {
  await assert.rejects(action, (error) => error?.code === "23514" && pattern.test(error.message));
}

try {
  const migrations = await sql`SELECT filename FROM schema_migrations ORDER BY filename`;
  assert.ok(
    migrations.some((row) => row.filename === "0013_request_intake_public_form.sql"),
    "request intake migration must be applied",
  );
  assert.ok(
    migrations.some((row) => row.filename === "0030_access_foundation.sql"),
    "access foundation migration must be applied",
  );

  await sql`SELECT set_config('app.organization_id',${org1},false),set_config('app.user_id',${user1},false)`;

  const personalOrg = "00000000-0000-4000-8000-000000000002";
  const personalUser = "10000000-0000-4000-8000-000000000101";
  await sql`SELECT set_config(\'app.organization_id\',${personalOrg},false),set_config(\'app.user_id\',${personalUser},false)`;
  const [personalWorkspace] = await sql`
    SELECT o.name,o.slug,u.email,m.status,r.code role_code,m.position_id::text position_id,
           (SELECT count(*)::int FROM permission_grants pg WHERE pg.role_template_id=r.id) grant_count,
           (SELECT count(*)::int FROM permission_definitions WHERE capability<>'admin.system_access.manage') legacy_definition_count,
           EXISTS(SELECT 1 FROM organization_owners oo WHERE oo.organization_id=o.id AND oo.membership_id=m.id) is_owner,
           (SELECT count(*)::int FROM candidates c WHERE c.organization_id=o.id) candidate_count,
           (SELECT count(*)::int FROM client_companies c WHERE c.organization_id=o.id) client_count
    FROM organizations o
    JOIN organization_memberships m ON m.organization_id=o.id
    JOIN app_users u ON u.id=m.user_id
    JOIN role_templates r ON r.id=m.role_template_id
    WHERE o.id=${personalOrg}::uuid AND lower(u.email::text)='avdeevgreyfog@gmail.com'
    LIMIT 1
  `;
  assert.equal(personalWorkspace?.name,"Моя организация","personal workspace must be provisioned");
  assert.equal(personalWorkspace?.slug,"sergey-work");
  assert.equal(personalWorkspace?.status,"active");
  assert.equal(personalWorkspace?.role_code,"director");
  assert.equal(personalWorkspace?.position_id,"41000000-0000-4000-8000-000000000101");
  assert.equal(personalWorkspace?.grant_count,personalWorkspace?.legacy_definition_count,"legacy director grants must retain existing business capabilities");
  assert.equal(personalWorkspace?.is_owner,true,"personal workspace creator must be organization owner");
  assert.equal(personalWorkspace?.candidate_count,0,"personal workspace starts without demo candidates");
  assert.equal(personalWorkspace?.client_count,0,"personal workspace starts without demo clients");
  await sql`SELECT set_config(\'app.organization_id\',${org1},false),set_config(\'app.user_id\',${user1},false)`;

  const org2 = randomUUID();
  const org2User = randomUUID();
  const org2Member = randomUUID();
  const org2RoleTemplate = randomUUID();
  const org2Unit = randomUUID();
  const org2Region = randomUUID();
  const org2Profile = randomUUID();
  const org2Role = randomUUID();
  await sql`INSERT INTO organizations(id,name,slug) VALUES(${org2}::uuid,'Tenant B',${`tenant-${org2}`})`;
  await sql`INSERT INTO app_users(id,display_name,email) VALUES(${org2User}::uuid,'Tenant B User',${`${org2User}@test.local`})`;
  await sql`INSERT INTO role_templates(id,organization_id,code,name) VALUES(${org2RoleTemplate}::uuid,${org2}::uuid,'manager','Manager')`;
  await sql`INSERT INTO organization_memberships(id,organization_id,user_id,role_template_id) VALUES(${org2Member}::uuid,${org2}::uuid,${org2User}::uuid,${org2RoleTemplate}::uuid)`;
  await sql`INSERT INTO regions(id,organization_id,code,name) VALUES(${org2Region}::uuid,${org2}::uuid,'T2','Tenant B Region')`;
  await sql`INSERT INTO positions(id,organization_id,code,name) VALUES(${org2Profile}::uuid,${org2}::uuid,'profile','Tenant B Profile')`;
  await sql`INSERT INTO process_roles(id,organization_id,code,name) VALUES(${org2Role}::uuid,${org2}::uuid,'role','Tenant B Role')`;
  await sql`INSERT INTO organization_units(id,organization_id,code,name,kind) VALUES(${org2Unit}::uuid,${org2}::uuid,'root','Tenant B','company')`;

  await sql`INSERT INTO position_permission_grants(organization_id,position_id,capability,effect,scope_type,scope_ids)
    VALUES(${org2}::uuid,${org2Profile}::uuid,'organization.read','allow','org_unit_subtree',ARRAY[${org2Unit}::uuid])`;
  const [subtreeGrant]=await sql`SELECT scope_type,scope_ids FROM position_permission_grants WHERE position_id=${org2Profile}::uuid AND capability='organization.read'`;
  assert.equal(subtreeGrant?.scope_type,"org_unit_subtree","hierarchical scope must persist");

  await sql`SELECT set_config('app.organization_id',${org1},false),set_config('app.user_id',${user1},false)`;
  const [demoOwner]=await sql`SELECT membership_id FROM organization_owners WHERE organization_id=${org1}::uuid`;
  assert.equal(demoOwner?.membership_id,member1,"demo seed must designate an organization owner");

  await sql`INSERT INTO membership_system_grants(organization_id,membership_id,capability,granted_by_user_id,reason)
    VALUES(${org1}::uuid,${member2}::uuid,'organization.employee.manage',${user1}::uuid,'Integration test')`;
  const [systemGrant]=await sql`SELECT capability FROM membership_system_grants WHERE membership_id=${member2}::uuid AND valid_to IS NULL`;
  assert.equal(systemGrant?.capability,"organization.employee.manage","administrative capability can be delegated independently from position");

  await rejectsConstraint(
    () => sql`INSERT INTO membership_system_grants(organization_id,membership_id,capability,granted_by_user_id,reason)
      VALUES(${org1}::uuid,${member2}::uuid,'recruiting.candidate.read',${user1}::uuid,'Invalid system grant')`,
    /administrative capability/,
  );

  await rejectsConstraint(
    () => sql`INSERT INTO organization_units(organization_id,parent_id,code,name,kind) VALUES(${org1}::uuid,${org2Unit}::uuid,${`bad-${randomUUID()}`},'Cross tenant','team')`,
    /another organization/,
  );
  await rejectsConstraint(
    () => sql`INSERT INTO staff_positions(organization_id,code,name,job_profile_id,organization_unit_id,region_id) VALUES(${org1}::uuid,${`bad-${randomUUID()}`},'Cross tenant',${profile1}::uuid,${unit1}::uuid,${org2Region}::uuid)`,
    /region belongs/,
  );
  await rejectsConstraint(
    () => sql`INSERT INTO membership_process_roles(organization_id,membership_id,process_role_id,org_unit_id) VALUES(${org1}::uuid,${member2}::uuid,${role1}::uuid,${org2Unit}::uuid)`,
    /scope belongs/,
  );

  const childUnit=randomUUID();
  await sql`INSERT INTO organization_units(id,organization_id,parent_id,code,name,kind) VALUES(${childUnit}::uuid,${org1}::uuid,${unit1}::uuid,${`child-${childUnit}`},'Cycle test','team')`;
  await rejectsConstraint(()=>sql`UPDATE organization_units SET parent_id=${childUnit}::uuid WHERE id=${unit1}::uuid`,/hierarchy cycle/);

  const allocationUser=randomUUID();
  const allocationMember=randomUUID();
  const [allocationRole]=await sql`SELECT role_template_id FROM organization_memberships WHERE id=${member1}::uuid`;
  await sql`INSERT INTO app_users(id,display_name,email) VALUES(${allocationUser}::uuid,'Allocation Test',${`${allocationUser}@test.local`})`;
  await sql`INSERT INTO organization_memberships(id,organization_id,user_id,role_template_id) VALUES(${allocationMember}::uuid,${org1}::uuid,${allocationUser}::uuid,${allocationRole.role_template_id}::uuid)`;

  const seat1 = randomUUID();
  const seat2 = randomUUID();
  await sql`INSERT INTO staff_positions(id,organization_id,code,name,job_profile_id,organization_unit_id,status,capacity) VALUES
    (${seat1}::uuid,${org1}::uuid,${`seat-${seat1}`},'Seat 1',${profile1}::uuid,${unit1}::uuid,'open',1),
    (${seat2}::uuid,${org1}::uuid,${`seat-${seat2}`},'Seat 2',${profile1}::uuid,${unit1}::uuid,'open',1)`;
  await sql`UPDATE staff_positions SET reports_to_position_id=${seat1}::uuid WHERE id=${seat2}::uuid`;
  await rejectsConstraint(()=>sql`UPDATE staff_positions SET reports_to_position_id=${seat2}::uuid WHERE id=${seat1}::uuid`,/hierarchy cycle/);
  await sql`INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,reason,created_by_user_id)
    VALUES(${org1}::uuid,${seat1}::uuid,${allocationMember}::uuid,'primary',0.6,'Integration test',${user1}::uuid)`;

  await rejectsConstraint(
    () => sql`INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,reason,created_by_user_id) VALUES(${org1}::uuid,${seat2}::uuid,${allocationMember}::uuid,'additional',0.5,'Integration test',${user1}::uuid)`,
    /allocation exceeds/,
  );
  await rejectsConstraint(
    () => sql`INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,reason,created_by_user_id) VALUES(${org1}::uuid,${seat1}::uuid,${member2}::uuid,'additional',0.5,'Integration test',${user1}::uuid)`,
    /capacity exceeded/,
  );
  await rejectsConstraint(
    () => sql`INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,reason,created_by_user_id) VALUES(${org1}::uuid,${seat2}::uuid,${allocationMember}::uuid,'primary',0.4,'Integration test',${user1}::uuid)`,
    /primary assignment overlaps/,
  );
  await sql`INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,reason,allow_overallocation,created_by_user_id)
    VALUES(${org1}::uuid,${seat2}::uuid,${allocationMember}::uuid,'additional',0.5,'Approved overallocation',true,${user1}::uuid)`;

  const closedSeat=randomUUID();
  await sql`INSERT INTO staff_positions(id,organization_id,code,name,job_profile_id,organization_unit_id,status,capacity) VALUES(${closedSeat}::uuid,${org1}::uuid,${`seat-${closedSeat}`},'Closed seat',${profile1}::uuid,${unit1}::uuid,'closed',1)`;
  await rejectsConstraint(()=>sql`INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,reason,created_by_user_id) VALUES(${org1}::uuid,${closedSeat}::uuid,${member2}::uuid,'additional',0.5,'Invalid closed seat',${user1}::uuid)`,/not assignable/);
  const currentAssignment=await sql`SELECT * FROM current_position_assignment(${allocationMember}::uuid,current_date)`;
  assert.equal(currentAssignment[0]?.staff_position_id,seat1);

  const auditRows = await sql`SELECT action FROM audit_events WHERE organization_id=${org1}::uuid AND resource_type='position_assignments'`;
  assert.ok(auditRows.some((row) => row.action === "insert"), "assignment mutation must be audited");

  const directRule = randomUUID();
  await sql`INSERT INTO responsibility_rules(id,organization_id,process_code,process_name,step_code,step_name,responsibility_type,subject_type,subject_id,created_by_user_id)
    VALUES(${directRule}::uuid,${org1}::uuid,'sales','Продажи','qualification','Квалификация','executor','process_role',${role1}::uuid,${user1}::uuid)`;
  const direct = await sql`SELECT * FROM resolve_organization_responsibility('sales','qualification')`;
  assert.equal(direct[0]?.membership_id, member2);
  assert.equal(direct[0]?.is_fallback, false);

  const emptyRole = randomUUID();
  await sql`INSERT INTO process_roles(id,organization_id,code,name) VALUES(${emptyRole}::uuid,${org1}::uuid,${`empty-${emptyRole}`},'Empty role')`;
  await sql`INSERT INTO responsibility_rules(organization_id,process_code,process_name,step_code,step_name,responsibility_type,subject_type,subject_id,fallback_subject_type,fallback_subject_id,created_by_user_id)
    VALUES(${org1}::uuid,'operations','Операции','launch','Запуск','executor','process_role',${emptyRole}::uuid,'membership',${member1}::uuid,${user1}::uuid)`;
  const fallback = await sql`SELECT * FROM resolve_organization_responsibility('operations','launch')`;
  assert.equal(fallback[0]?.membership_id, member1);
  assert.equal(fallback[0]?.is_fallback, true);

  await sql.unsafe("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='organization_test_runtime') THEN CREATE ROLE organization_test_runtime NOLOGIN; END IF; END $$");
  await sql.unsafe("GRANT USAGE ON SCHEMA public TO organization_test_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO organization_test_runtime; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO organization_test_runtime");
  await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE organization_test_runtime");
    await tx`SELECT set_config('app.organization_id',${org1},true),set_config('app.user_id',${user1},true)`;
    const visible = await tx`SELECT DISTINCT organization_id FROM organization_units`;
    assert.deepEqual(visible.map((row) => row.organization_id), [org1]);
  });
  await assert.rejects(
    () => sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE organization_test_runtime");
      await tx`SELECT set_config('app.organization_id',${org1},true),set_config('app.user_id',${user1},true)`;
      await tx`INSERT INTO organization_units(organization_id,code,name,kind) VALUES(${org2}::uuid,${`rls-${randomUUID()}`},'Blocked by RLS','team')`;
    }),
    (error) => /row-level security/.test(error?.message ?? ""),
  );

  console.log("Organization Core PostgreSQL integration passed: migrations, RLS, tenant integrity, assignments, audit and responsibility resolver.");
} finally {
  await sql.end();
}
