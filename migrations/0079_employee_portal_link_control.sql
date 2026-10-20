-- Employee portal configuration is versioned by the issued link snapshot.
-- All additions are non-destructive; existing links and reports remain.
CREATE TABLE IF NOT EXISTS employee_portal_config_overrides (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('organization','object','worker')),
  scope_id uuid NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config)='object'),
  updated_by_user_id uuid REFERENCES app_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,scope,scope_id)
);
ALTER TABLE employee_portal_config_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_portal_config_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY employee_portal_config_tenant ON employee_portal_config_overrides
 USING (organization_id=app_current_organization_id())
 WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_employee_portal_config_overrides
 AFTER INSERT OR UPDATE OR DELETE ON employee_portal_config_overrides
 FOR EACH ROW EXECUTE FUNCTION audit_row_change();

ALTER TABLE worker_timesheet_links
 ADD COLUMN IF NOT EXISTS portal_config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS expires_at timestamptz,
 ADD COLUMN IF NOT EXISTS auto_revoke_at timestamptz,
 ADD COLUMN IF NOT EXISTS replaced_by_link_id uuid REFERENCES worker_timesheet_links(id),
 ADD COLUMN IF NOT EXISTS changed_by_user_id uuid REFERENCES app_users(id),
 ADD COLUMN IF NOT EXISTS changed_at timestamptz;

-- Freeze a safe snapshot of legacy links; never retroactively apply new preferences.
UPDATE worker_timesheet_links l SET portal_config_snapshot=jsonb_build_object(
 'managerName',NULL,
 'managerPhone',s.manager_phone,
 'contactMethod',NULL,
 'instruction','',
 'timezone',COALESCE(s.timezone,'Europe/Moscow'),
 'validDays',30,
 'autoRevokeOnExit',true,
 'sections',jsonb_build_object(
    'shifts',true,'confirm',true,'decline',true,'scheduleChanges',true,
    'hours',true,'timesheet',true,
    'documents',COALESCE(s.show_employee_documents,true),
    'employment',true,'workwear',COALESCE(s.show_employee_workwear,true),
    'contacts',true,'objectInfo',true))
FROM objects o LEFT JOIN object_shift_reporting_settings s ON s.object_id=o.id
WHERE l.object_id=o.id AND l.portal_config_snapshot='{}'::jsonb;

ALTER TABLE worker_shift_reports
 ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending'
 CHECK(review_status IN ('pending','approved','rejected')),
 ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
 ADD COLUMN IF NOT EXISTS reviewed_by_user_id uuid REFERENCES app_users(id),
 ADD COLUMN IF NOT EXISTS approved_hours numeric(5,2)
 CHECK(approved_hours IS NULL OR (approved_hours>=0 AND approved_hours<=24)),
 ADD COLUMN IF NOT EXISTS review_comment text;
UPDATE worker_shift_reports SET review_status='approved',approved_hours=reported_hours,reviewed_at=hours_reconciled_at,reviewed_by_user_id=hours_reconciled_by_user_id
 WHERE hours_reconciled_at IS NOT NULL AND review_status='pending';
CREATE INDEX IF NOT EXISTS idx_employee_portal_pending_review ON worker_shift_reports
 (organization_id,object_id,work_date)
 WHERE reported_hours IS NOT NULL AND review_status='pending';
