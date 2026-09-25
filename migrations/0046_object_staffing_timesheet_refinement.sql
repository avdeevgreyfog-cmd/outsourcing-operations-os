BEGIN;

-- Replacement workflow stays inside existing needs + offboarding entities.
ALTER TABLE worker_exit_processes
  ADD COLUMN IF NOT EXISTS replacement_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS replacement_need_id uuid REFERENCES needs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replacement_worker_id uuid REFERENCES worker_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_worker_exit_replacement_need ON worker_exit_processes(organization_id,replacement_need_id) WHERE replacement_need_id IS NOT NULL;

ALTER TABLE needs ADD COLUMN IF NOT EXISTS replacement_exit_id uuid REFERENCES worker_exit_processes(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_need_replacement_exit ON needs(replacement_exit_id) WHERE replacement_exit_id IS NOT NULL;

-- Object/specialty equipment template. Actual issue/return remains in inventory_movements.
CREATE TABLE IF NOT EXISTS object_ppe_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  specialty_id uuid NOT NULL REFERENCES specialties(id),
  name text NOT NULL DEFAULT 'Основной комплект',
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_object_ppe_template_active ON object_ppe_templates(object_id,specialty_id) WHERE active;

CREATE TABLE IF NOT EXISTS object_ppe_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES object_ppe_templates(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id),
  quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK (quantity>0),
  size_source text NOT NULL DEFAULT 'none' CHECK (size_source IN ('none','clothing','shoe','manual')),
  variant text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id,item_id,variant)
);
CREATE INDEX IF NOT EXISTS idx_object_ppe_templates_scope ON object_ppe_templates(organization_id,object_id,specialty_id,active);
ALTER TABLE object_ppe_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_ppe_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE object_ppe_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_ppe_template_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON object_ppe_templates;
CREATE POLICY tenant_isolation ON object_ppe_templates USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
DROP POLICY IF EXISTS tenant_isolation ON object_ppe_template_items;
CREATE POLICY tenant_isolation ON object_ppe_template_items USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
DROP TRIGGER IF EXISTS audit_object_ppe_templates ON object_ppe_templates;
CREATE TRIGGER audit_object_ppe_templates AFTER INSERT OR UPDATE OR DELETE ON object_ppe_templates FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_object_ppe_template_items ON object_ppe_template_items;
CREATE TRIGGER audit_object_ppe_template_items AFTER INSERT OR UPDATE OR DELETE ON object_ppe_template_items FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Planner override: plan code and day/night are one source for shifts + timesheet.
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS planned_shift_kind text;
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_planned_shift_kind_check;
ALTER TABLE time_entries ADD CONSTRAINT time_entries_planned_shift_kind_check CHECK (planned_shift_kind IS NULL OR planned_shift_kind IN ('day','night','mixed'));

-- Existing rate model already contains day_night, but overlap validation must permit separate day/night rates.
CREATE OR REPLACE FUNCTION prevent_overlapping_worker_rates() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM worker_rates wr
    WHERE wr.worker_id = NEW.worker_id
      AND COALESCE(wr.object_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(NEW.object_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND wr.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (wr.day_night='any' OR NEW.day_night='any' OR wr.day_night=NEW.day_night)
      AND daterange(wr.effective_from, COALESCE(wr.effective_to, 'infinity'::date), '[]') && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
  ) THEN
    RAISE EXCEPTION 'Worker rate periods overlap for the same worker/object and shift kind';
  END IF;
  RETURN NEW;
END $$;

-- Managers may record the fact of a payment on their object without gaining full finance administration.
INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
('finance.object_payment.record','finance','object_payment','record',true,'Record employee payments for assigned objects')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,'finance.object_payment.record','allow',CASE WHEN r.code='director' THEN 'all_org' ELSE 'assigned_to_me' END,'{}'::uuid[]
FROM role_templates r WHERE r.code IN ('director','object_manager','operations_head','regional_manager')
ON CONFLICT DO NOTHING;

INSERT INTO position_permission_grants(organization_id,position_id,capability,effect,scope_type,scope_ids)
SELECT p.organization_id,p.id,'finance.object_payment.record','allow','assigned_to_me','{}'::uuid[]
FROM positions p WHERE p.code IN ('object-manager','object_manager','operations-head','operations_head','regional-manager','regional_manager')
ON CONFLICT DO NOTHING;

COMMIT;