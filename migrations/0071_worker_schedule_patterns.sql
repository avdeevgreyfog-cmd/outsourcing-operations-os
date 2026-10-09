-- Preserve original assignment schedule and historical timesheets.
-- Effective-dated changes apply to future plans only and remain auditable.
CREATE TABLE IF NOT EXISTS worker_schedule_pattern_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
 worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
 effective_from date NOT NULL,
 work_days integer NOT NULL CHECK(work_days BETWEEN 1 AND 30),
 rest_days integer NOT NULL CHECK(rest_days BETWEEN 0 AND 30),
 shift_kind text NOT NULL CHECK(shift_kind IN ('day','night')),
 floating_days_off boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','rejected')),
 source_link_id uuid REFERENCES worker_timesheet_links(id),
 reviewed_by_user_id uuid REFERENCES app_users(id),
 reviewed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(worker_id,object_id,effective_from)
);
CREATE INDEX IF NOT EXISTS idx_worker_schedule_patterns_scope
 ON worker_schedule_pattern_changes(organization_id,object_id,worker_id,effective_from,status);
ALTER TABLE worker_schedule_pattern_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_schedule_pattern_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON worker_schedule_pattern_changes
 USING (organization_id=app_current_organization_id()) WITH CHECK(organization_id=app_current_organization_id());
CREATE TRIGGER audit_worker_schedule_pattern_changes
 AFTER INSERT OR UPDATE OR DELETE ON worker_schedule_pattern_changes
 FOR EACH ROW EXECUTE FUNCTION audit_row_change();
