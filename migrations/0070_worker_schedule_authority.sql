-- Expand employee portal planning without changing existing object/timesheet identifiers.
-- Legacy 'client' meant employee self-planning: rename data conservatively.
DO $$
DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN
  SELECT conname FROM pg_constraint WHERE conrelid='object_shift_reporting_settings'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%schedule_owner%'
 LOOP EXECUTE format('ALTER TABLE object_shift_reporting_settings DROP CONSTRAINT %I',constraint_name); END LOOP;
END $;
UPDATE object_shift_reporting_settings SET schedule_owner='worker' WHERE schedule_owner='client';
ALTER TABLE object_shift_reporting_settings
 ADD CONSTRAINT object_shift_reporting_settings_owner_valid CHECK(schedule_owner IN ('manager','worker')),
 ADD COLUMN IF NOT EXISTS planning_horizon_days integer NOT NULL DEFAULT 7
  CHECK(planning_horizon_days BETWEEN 2 AND 31);
-- Overrides are exceptional: object-level settings are authoritative by default.
CREATE TABLE IF NOT EXISTS worker_schedule_authorities (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
 worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
 schedule_owner text NOT NULL CHECK(schedule_owner IN ('manager','worker')),
 updated_by_user_id uuid NOT NULL REFERENCES app_users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(object_id,worker_id)
);
CREATE TABLE IF NOT EXISTS worker_shift_plan_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
 worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
 work_date date NOT NULL,
 requested_kind text NOT NULL CHECK(requested_kind IN ('day','night','off')),
 status text NOT NULL CHECK(status IN ('proposed','accepted','rejected')),
 requested_by_link_id uuid NOT NULL REFERENCES worker_timesheet_links(id),
 reviewed_by_user_id uuid REFERENCES app_users(id),
 reviewed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(worker_id,object_id,work_date)
);
CREATE INDEX IF NOT EXISTS idx_worker_shift_plan_changes_attention
 ON worker_shift_plan_changes(organization_id,object_id,work_date,status);
ALTER TABLE worker_schedule_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_schedule_authorities FORCE ROW LEVEL SECURITY;
ALTER TABLE worker_shift_plan_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_shift_plan_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON worker_schedule_authorities USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE POLICY tenant_isolation ON worker_shift_plan_changes USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_worker_schedule_authorities AFTER INSERT OR UPDATE OR DELETE ON worker_schedule_authorities FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_worker_shift_plan_changes AFTER INSERT OR UPDATE OR DELETE ON worker_shift_plan_changes FOR EACH ROW EXECUTE FUNCTION audit_row_change();
