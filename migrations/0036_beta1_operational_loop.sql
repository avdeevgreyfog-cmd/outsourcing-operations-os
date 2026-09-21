BEGIN;

-- Beta 1 operational loop:
-- recurring shift plans, explicit timesheet workflow/versioning and deduplicated process tasks.

CREATE TABLE IF NOT EXISTS shift_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  need_id uuid REFERENCES needs(id) ON DELETE SET NULL,
  specialty_id uuid NOT NULL REFERENCES specialties(id),
  name text NOT NULL,
  pattern_code text NOT NULL DEFAULT 'custom',
  work_days integer NOT NULL DEFAULT 6 CHECK (work_days BETWEEN 1 AND 31),
  rest_days integer NOT NULL DEFAULT 1 CHECK (rest_days BETWEEN 0 AND 31),
  start_date date NOT NULL,
  end_date date NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  shift_kind text NOT NULL CHECK (shift_kind IN ('day','night','mixed')),
  demand_count integer NOT NULL DEFAULT 1 CHECK (demand_count > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','cancelled')),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

ALTER TABLE shift_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_series FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON shift_series;
CREATE POLICY tenant_isolation ON shift_series
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES shift_series(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shift_series_object_period
  ON shift_series(organization_id,object_id,start_date,end_date,status);
CREATE INDEX IF NOT EXISTS idx_shifts_series
  ON shifts(organization_id,series_id,shift_date);

DROP TRIGGER IF EXISTS audit_shift_series ON shift_series;
CREATE TRIGGER audit_shift_series
  AFTER INSERT OR UPDATE OR DELETE ON shift_series
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

ALTER TABLE timesheet_snapshots
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_snapshot_id uuid REFERENCES timesheet_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_comment text,
  ADD COLUMN IF NOT EXISTS checked_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_sent_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_timesheet_snapshots_period_version
  ON timesheet_snapshots(organization_id,object_id,view_type,period_start,period_end,version DESC);
CREATE INDEX IF NOT EXISTS idx_timesheet_snapshots_supersedes
  ON timesheet_snapshots(organization_id,supersedes_snapshot_id);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS automation_key text,
  ADD COLUMN IF NOT EXISTS process_code text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_open_automation_key
  ON tasks(organization_id,automation_key)
  WHERE automation_key IS NOT NULL AND status NOT IN ('done','cancelled');

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
  ('time.timesheet.review','time','timesheet','review',false,'Внутренняя проверка табеля перед отправкой клиенту')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,'time.timesheet.review','allow',
  CASE
    WHEN r.code='regional_manager' THEN 'region'
    ELSE 'all_org'
  END,
  '{}'::uuid[]
FROM role_templates r
WHERE r.code IN ('director','regional_manager','finance')
ON CONFLICT DO NOTHING;

INSERT INTO position_permission_grants(organization_id,position_id,capability,effect,scope_type,scope_ids)
SELECT pg.organization_id,pg.position_id,'time.timesheet.review','allow',pg.scope_type,pg.scope_ids
FROM position_permission_grants pg
WHERE pg.capability='finance.pnl.read' AND pg.effect='allow'
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS audit_timesheet_snapshots ON timesheet_snapshots;
CREATE TRIGGER audit_timesheet_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON timesheet_snapshots
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
