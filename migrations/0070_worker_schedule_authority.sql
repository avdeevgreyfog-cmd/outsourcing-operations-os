-- Expand employee portal planning without changing existing object/timesheet identifiers.
-- No changes to existing schedule_owner values or constraints: new settings
-- take precedence and legacy 'client' is interpreted as employee self-planning.
ALTER TABLE object_shift_reporting_settings
 ADD COLUMN IF NOT EXISTS schedule_authority text
   CHECK(schedule_authority IS NULL OR schedule_authority IN ('manager','worker')),
 ADD COLUMN IF NOT EXISTS planning_horizon_days integer NOT NULL DEFAULT 14
   CHECK(planning_horizon_days BETWEEN 2 AND 31);
ALTER TABLE worker_shift_time_changes ADD COLUMN IF NOT EXISTS shift_kind text CHECK(shift_kind IS NULL OR shift_kind IN ('day','night'));
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
