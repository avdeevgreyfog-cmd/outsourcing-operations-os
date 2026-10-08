-- Employee self-reporting is an extension of objects, shifts and timesheets.
-- It never removes or overwrites historical time entries.
CREATE TABLE IF NOT EXISTS object_shift_reporting_settings (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 object_id uuid PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
 schedule_owner text NOT NULL DEFAULT 'manager' CHECK(schedule_owner IN ('manager','client')),
 reporting_enabled boolean NOT NULL DEFAULT true,
 confirmation_deadline time NOT NULL DEFAULT '22:00',
 timezone text NOT NULL DEFAULT 'Europe/Moscow',
 updated_by_user_id uuid REFERENCES app_users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS worker_timesheet_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
 object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 token_ciphertext text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','revoked')),
 created_by_user_id uuid NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_opened_at timestamptz,
 revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_timesheet_link_active ON worker_timesheet_links(worker_id,object_id) WHERE status IN ('active','paused');
CREATE INDEX IF NOT EXISTS idx_worker_timesheet_links_object ON worker_timesheet_links(organization_id,object_id);
CREATE TABLE IF NOT EXISTS worker_shift_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
 object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
 work_date date NOT NULL,
 shift_kind text CHECK(shift_kind IN ('day','night','off')),
 response text NOT NULL CHECK(response IN ('working','day_off','cannot_work')),
 reason text,
 reported_hours numeric(5,2) CHECK(reported_hours IS NULL OR (reported_hours >= 0 AND reported_hours<=24)),
 confirmed_at timestamptz,
 hours_submitted_at timestamptz,
 source_link_id uuid NOT NULL REFERENCES worker_timesheet_links(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(worker_id,object_id,work_date)
);
CREATE INDEX IF NOT EXISTS idx_worker_shift_reports_object_day ON worker_shift_reports(organization_id,object_id,work_date);
-- This hash directory is the RLS tenant locator for unauthenticated public URLs.
-- Never store or log raw employee link tokens.
CREATE TABLE IF NOT EXISTS public_worker_timesheet_tokens (
 token_hash text PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 actor_user_id uuid NOT NULL REFERENCES app_users(id),
 link_id uuid NOT NULL UNIQUE REFERENCES worker_timesheet_links(id) ON DELETE CASCADE
);
ALTER TABLE object_shift_reporting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_shift_reporting_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE worker_timesheet_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_timesheet_links FORCE ROW LEVEL SECURITY;
ALTER TABLE worker_shift_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_shift_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON object_shift_reporting_settings USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE POLICY tenant_isolation ON worker_timesheet_links USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE POLICY tenant_isolation ON worker_shift_reports USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_object_shift_reporting_settings AFTER INSERT OR UPDATE OR DELETE ON object_shift_reporting_settings FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_worker_timesheet_links AFTER INSERT OR UPDATE OR DELETE ON worker_timesheet_links FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_worker_shift_reports AFTER INSERT OR UPDATE OR DELETE ON worker_shift_reports FOR EACH ROW EXECUTE FUNCTION audit_row_change();
