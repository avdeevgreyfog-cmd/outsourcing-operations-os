BEGIN;

CREATE TABLE calculation_expense_standard_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  group_name text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  base text NOT NULL CHECK (base IN ('per_hour','per_shift','per_worker_month','per_worker_period','percent_of_worker_pay','role_month','role_fixed','project_month','project_fixed','per_unit')),
  scope text NOT NULL CHECK (scope IN ('worker','role','project')),
  amortization_months numeric(8,2) CHECK (amortization_months IS NULL OR amortization_months > 0),
  default_enabled boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date,
  notes text,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code, version),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX calculation_expense_standard_active_idx ON calculation_expense_standard_versions(organization_id,code,effective_from DESC) WHERE active;

CREATE TABLE calculation_schedule_standard_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  pattern text NOT NULL,
  shift_hours numeric(8,2) NOT NULL CHECK (shift_hours > 0),
  break_hours numeric(8,2) NOT NULL DEFAULT 0 CHECK (break_hours >= 0),
  break_paid boolean NOT NULL DEFAULT false,
  shifts_per_month numeric(8,2) NOT NULL CHECK (shifts_per_month > 0),
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date,
  notes text,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code, version),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX calculation_schedule_standard_active_idx ON calculation_schedule_standard_versions(organization_id,code,effective_from DESC) WHERE active;

ALTER TABLE calculation_expense_standard_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_expense_standard_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON calculation_expense_standard_versions
  USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
ALTER TABLE calculation_schedule_standard_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_schedule_standard_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON calculation_schedule_standard_versions
  USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());

CREATE TRIGGER audit_calculation_expense_standards AFTER INSERT OR UPDATE OR DELETE ON calculation_expense_standard_versions FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_calculation_schedule_standards AFTER INSERT OR UPDATE OR DELETE ON calculation_schedule_standard_versions FOR EACH ROW EXECUTE FUNCTION audit_row_change();

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
  ('calculation.rules.read','calculation','rules','read',false,'Просмотр нормативов расчёта'),
  ('calculation.rules.manage','calculation','rules','manage',false,'Управление нормативами и версиями правил')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'all_org'
FROM role_templates r CROSS JOIN (VALUES ('calculation.rules.read'),('calculation.rules.manage')) p(capability)
WHERE r.code IN ('director','economist')
ON CONFLICT DO NOTHING;

COMMIT;
