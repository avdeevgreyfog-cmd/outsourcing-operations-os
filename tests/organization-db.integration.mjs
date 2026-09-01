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
  assert.equal(migrations.at(-1)?.filename, "0008_organization_tenant_integrity.sql");

  await sql`SELECT set_config('app.organization_id',${org1},false),set_config('app.user_id',${user1},false)`;

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

  const seat1 = randomUUID();
  const seat2 = randomUUID();
  await sql`INSERT INTO staff_positions(id,organization_id,code,name,job_profile_id,organization_unit_id,status,capacity) VALUES
    (${seat1}::uuid,${org1}::uuid,${`seat-${seat1}`},'Seat 1',${profile1}::uuid,${unit1}::uuid,'open',1),
    (${seat2}::uuid,${org1}::uuid,${`seat-${seat2}`},'Seat 2',${profile1}::uuid,${unit1}::uuid,'open',1)`;
  await sql`INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,reason,created_by_user_id)
    VALUES(${org1}::uuid,${seat1}::uuid,${member1}::uuid,'primary',0.6,'Integration test',${user1}::uuid)`;

  await rejectsConstraint(
    () => sql`INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,reason,created_by_user_id) VALUES(${org1}::uuid,${seat2}::uuid,${member1}::uuid,'additional',0.5,'Integration test',${user1}::uuid)`,
    /allocation exceeds/,
  );
  await rejectsConstraint(
    () => sql`INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,reason,created_by_user_id) VALUES(${org1}::uuid,${seat1}::uuid,${member2}::uuid,'additional',0.5,'Integration test',${user1}::uuid)`,
    /capacity exceeded/,
  );
  await rejectsConstraint(
    () => sql`INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,reason,created_by_user_id) VALUES(${org1}::uuid,${seat2}::uuid,${member1}::uuid,'primary',0.4,'Integration test',${user1}::uuid)`,
    /primary assignment overlaps/,
  );
  await sql`INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,reason,allow_overallocation,created_by_user_id)
    VALUES(${org1}::uuid,${seat2}::uuid,${member1}::uuid,'additional',0.5,'Approved overallocation',true,${user1}::uuid)`;

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
