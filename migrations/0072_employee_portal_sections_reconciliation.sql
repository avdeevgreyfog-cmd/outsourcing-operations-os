-- Object-managed employee portal sections and explicit, per-shift hours reconciliation.
-- Additive migration: existing documents, PPE records and timesheets are unchanged.
ALTER TABLE object_shift_reporting_settings
  ADD COLUMN IF NOT EXISTS show_employee_documents boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_employee_workwear boolean NOT NULL DEFAULT true;

ALTER TABLE worker_shift_reports
  ADD COLUMN IF NOT EXISTS hours_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS hours_reconciled_by_user_id uuid REFERENCES app_users(id);

-- Reconciliation status lives alongside the original employee report, not in
-- a second timesheet. Updated self-reports must be sent for review again.
CREATE INDEX IF NOT EXISTS idx_worker_shift_reports_hours_review
  ON worker_shift_reports(organization_id,object_id,work_date)
  WHERE reported_hours IS NOT NULL AND hours_reconciled_at IS NULL;
