BEGIN;

ALTER TABLE permission_grants DROP CONSTRAINT IF EXISTS permission_grants_scope_type_check;
ALTER TABLE user_permission_overrides DROP CONSTRAINT IF EXISTS user_permission_overrides_scope_type_check;
ALTER TABLE permission_grants ADD CONSTRAINT permission_grants_scope_type_check
  CHECK (scope_type IN ('self','own_created','assigned_to_me','team','org_unit','region','objects','clients','all_org'));
ALTER TABLE user_permission_overrides ADD CONSTRAINT user_permission_overrides_scope_type_check
  CHECK (scope_type IS NULL OR scope_type IN ('self','own_created','assigned_to_me','team','org_unit','region','objects','clients','all_org'));

CREATE TABLE legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  short_name text,
  inn text,
  kpp text,
  is_primary boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE organization_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES organization_units(id) ON DELETE RESTRICT,
  region_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  manager_membership_id uuid REFERENCES organization_memberships(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('company','department','region','branch','direction','team','project_group')),
  description text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  purpose text,
  duties text[] NOT NULL DEFAULT '{}',
  responsibilities text[] NOT NULL DEFAULT '{}',
  process_participation text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE process_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  responsibility text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE position_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  capability text NOT NULL REFERENCES permission_definitions(capability) ON DELETE CASCADE,
  effect text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  scope_type text NOT NULL DEFAULT 'all_org' CHECK (scope_type IN ('self','own_created','assigned_to_me','team','org_unit','region','objects','clients','all_org')),
  scope_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (position_id, capability, effect, scope_type)
);

CREATE TABLE process_role_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  process_role_id uuid NOT NULL REFERENCES process_roles(id) ON DELETE CASCADE,
  capability text NOT NULL REFERENCES permission_definitions(capability) ON DELETE CASCADE,
  effect text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  scope_type text NOT NULL DEFAULT 'all_org' CHECK (scope_type IN ('self','own_created','assigned_to_me','team','org_unit','region','objects','clients','all_org')),
  scope_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_role_id, capability, effect, scope_type)
);

ALTER TABLE organization_memberships
  ADD COLUMN position_id uuid REFERENCES positions(id) ON DELETE SET NULL,
  ADD COLUMN primary_org_unit_id uuid REFERENCES organization_units(id) ON DELETE SET NULL,
  ADD COLUMN manager_membership_id uuid REFERENCES organization_memberships(id) ON DELETE SET NULL,
  ADD COLUMN phone text,
  ADD COLUMN responsibility_summary text;

CREATE TABLE membership_process_roles (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
  process_role_id uuid NOT NULL REFERENCES process_roles(id) ON DELETE CASCADE,
  org_unit_id uuid REFERENCES organization_units(id) ON DELETE SET NULL,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  assigned_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, process_role_id, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE responsibility_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
  process_role_id uuid REFERENCES process_roles(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  resource_label text NOT NULL,
  responsibility_type text NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
  ('organization.read','organization','organization','read',false,'Просмотр структуры и каталога компании'),
  ('organization.manage','organization','organization','manage',true,'Изменение настроек организации'),
  ('organization.unit.manage','organization','unit','manage',true,'Управление подразделениями и структурой'),
  ('organization.position.manage','organization','position','manage',true,'Управление должностями и процессными ролями'),
  ('organization.employee.manage','organization','employee','manage',true,'Управление сотрудниками компании'),
  ('organization.access.manage','organization','access','manage',true,'Управление наследуемыми правами')
ON CONFLICT (capability) DO NOTHING;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'legal_entities','organization_units','positions','process_roles',
    'position_permission_grants','process_role_permission_grants',
    'membership_process_roles','responsibility_assignments'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id())',table_name);
  END LOOP;
END $$;

CREATE INDEX idx_org_units_parent ON organization_units(organization_id,parent_id,sort_order,name);
CREATE INDEX idx_org_memberships_unit ON organization_memberships(organization_id,primary_org_unit_id,status);
CREATE INDEX idx_membership_process_roles_active ON membership_process_roles(organization_id,membership_id,effective_to);
CREATE INDEX idx_responsibility_resource ON responsibility_assignments(organization_id,resource_type,resource_id,effective_to);

CREATE TRIGGER audit_organization_units AFTER INSERT OR UPDATE OR DELETE ON organization_units FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_positions AFTER INSERT OR UPDATE OR DELETE ON positions FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_process_roles AFTER INSERT OR UPDATE OR DELETE ON process_roles FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_position_grants AFTER INSERT OR UPDATE OR DELETE ON position_permission_grants FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_process_role_grants AFTER INSERT OR UPDATE OR DELETE ON process_role_permission_grants FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_membership_process_roles AFTER INSERT OR UPDATE OR DELETE ON membership_process_roles FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_responsibility_assignments AFTER INSERT OR UPDATE OR DELETE ON responsibility_assignments FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
