BEGIN;

ALTER TABLE launches
  ADD COLUMN IF NOT EXISTS stabilization_days integer NOT NULL DEFAULT 7 CHECK (stabilization_days BETWEEN 0 AND 60),
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE launches l
SET actual_start_date=o.actual_start_date
FROM objects o
WHERE o.id=l.object_id AND l.actual_start_date IS NULL AND o.actual_start_date IS NOT NULL;

ALTER TABLE launch_tasks
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'task',
  ADD COLUMN IF NOT EXISTS blocks_launch boolean NOT NULL DEFAULT false;

ALTER TABLE launch_tasks DROP CONSTRAINT IF EXISTS launch_tasks_task_kind_check;
ALTER TABLE launch_tasks ADD CONSTRAINT launch_tasks_task_kind_check
  CHECK (task_kind IN ('task','milestone','site_visit','staffing_wave'));

UPDATE launch_tasks SET
  category=CASE
    WHEN lower(title) LIKE '%договор%' OR lower(title) LIKE '%коммер%' THEN 'contracts'
    WHEN lower(title) LIKE '%комплект%' OR lower(title) LIKE '%персонал%' OR lower(title) LIKE '%числен%' THEN 'staffing'
    WHEN lower(title) LIKE '%жиль%' OR lower(title) LIKE '%общеж%' THEN 'housing'
    WHEN lower(title) LIKE '%логист%' OR lower(title) LIKE '%развоз%' OR lower(title) LIKE '%транспорт%' THEN 'transport'
    WHEN lower(title) LIKE '%питан%' THEN 'meals'
    WHEN lower(title) LIKE '%сиз%' OR lower(title) LIKE '%форма%' OR lower(title) LIKE '%инструмент%' THEN 'supply'
    WHEN lower(title) LIKE '%пропуск%' OR lower(title) LIKE '%допуск%' OR lower(title) LIKE '%документ%' THEN 'access'
    WHEN lower(title) LIKE '%смен%' OR lower(title) LIKE '%табел%' OR lower(title) LIKE '%старт%' OR lower(title) LIKE '%стабилиз%' THEN 'operations'
    ELSE category
  END,
  task_kind=CASE WHEN is_milestone THEN 'milestone' ELSE task_kind END,
  blocks_launch=CASE WHEN is_critical THEN true ELSE blocks_launch END;

CREATE TABLE IF NOT EXISTS launch_staffing_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  launch_id uuid NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_date date NOT NULL,
  planned_count integer NOT NULL CHECK (planned_count > 0),
  specialty_id uuid REFERENCES specialties(id),
  note text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS launch_site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  launch_id uuid NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  visit_type text NOT NULL DEFAULT 'primary' CHECK (visit_type IN ('primary','launch_control','audit','other')),
  scheduled_date date,
  owner_user_id uuid REFERENCES app_users(id),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  checklist_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  completed_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE launch_staffing_waves ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_staffing_waves FORCE ROW LEVEL SECURITY;
ALTER TABLE launch_site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_site_visits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON launch_staffing_waves;
CREATE POLICY tenant_isolation ON launch_staffing_waves
  USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());

DROP POLICY IF EXISTS tenant_isolation ON launch_site_visits;
CREATE POLICY tenant_isolation ON launch_site_visits
  USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());

DROP TRIGGER IF EXISTS audit_launch_staffing_waves ON launch_staffing_waves;
CREATE TRIGGER audit_launch_staffing_waves AFTER INSERT OR UPDATE OR DELETE ON launch_staffing_waves
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS audit_launch_site_visits ON launch_site_visits;
CREATE TRIGGER audit_launch_site_visits AFTER INSERT OR UPDATE OR DELETE ON launch_site_visits
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE INDEX IF NOT EXISTS idx_launch_staffing_waves_launch_date
  ON launch_staffing_waves(organization_id,launch_id,target_date);
CREATE INDEX IF NOT EXISTS idx_launch_site_visits_launch_date
  ON launch_site_visits(organization_id,launch_id,scheduled_date);
CREATE INDEX IF NOT EXISTS idx_launch_tasks_category
  ON launch_tasks(organization_id,launch_id,category,status);

COMMIT;
