BEGIN;

-- Access foundation: hierarchy-aware scopes plus system administration that is
-- independent from a person's job profile or process role.

ALTER TABLE permission_grants DROP CONSTRAINT IF EXISTS permission_grants_scope_type_check;
ALTER TABLE permission_grants ADD CONSTRAINT permission_grants_scope_type_check
  CHECK (scope_type IN ('self','own_created','assigned_to_me','team','org_unit','org_unit_subtree','region','objects','clients','all_org'));

ALTER TABLE user_permission_overrides DROP CONSTRAINT IF EXISTS user_permission_overrides_scope_type_check;
ALTER TABLE user_permission_overrides ADD CONSTRAINT user_permission_overrides_scope_type_check
  CHECK (scope_type IS NULL OR scope_type IN ('self','own_created','assigned_to_me','team','org_unit','org_unit_subtree','region','objects','clients','all_org'));

ALTER TABLE position_permission_grants DROP CONSTRAINT IF EXISTS position_permission_grants_scope_type_check;
ALTER TABLE position_permission_grants ADD CONSTRAINT position_permission_grants_scope_type_check
  CHECK (scope_type IN ('self','own_created','assigned_to_me','team','org_unit','org_unit_subtree','region','objects','clients','all_org'));

ALTER TABLE process_role_permission_grants DROP CONSTRAINT IF EXISTS process_role_permission_grants_scope_type_check;
ALTER TABLE process_role_permission_grants ADD CONSTRAINT process_role_permission_grants_scope_type_check
  CHECK (scope_type IN ('self','own_created','assigned_to_me','team','org_unit','org_unit_subtree','region','objects','clients','all_org'));

ALTER TABLE responsibility_rules DROP CONSTRAINT IF EXISTS responsibility_rules_scope_type_check;
ALTER TABLE responsibility_rules ADD CONSTRAINT responsibility_rules_scope_type_check
  CHECK (scope_type IN ('self','team','org_unit','org_unit_subtree','region','objects','clients','all_org'));

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description)
VALUES ('admin.system_access.manage','admin','system_access','manage',true,'Делегирование системных полномочий')
ON CONFLICT (capability) DO NOTHING;

CREATE TABLE organization_owners (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL UNIQUE REFERENCES organization_memberships(id) ON DELETE RESTRICT,
  assigned_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE membership_system_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
  capability text NOT NULL REFERENCES permission_definitions(capability) ON DELETE CASCADE,
  granted_by_user_id uuid REFERENCES app_users(id),
  reason text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX membership_system_grants_active_unique
  ON membership_system_grants(membership_id,capability)
  WHERE valid_to IS NULL;
CREATE INDEX membership_system_grants_active
  ON membership_system_grants(organization_id,membership_id,valid_to);

-- Existing installations get an owner only when the choice is unambiguous:
-- a single active member or exactly one legacy director.
WITH ranked AS (
  SELECT
    m.organization_id,
    m.id membership_id,
    count(*) OVER (PARTITION BY m.organization_id) active_count,
    count(*) FILTER (WHERE rt.code='director') OVER (PARTITION BY m.organization_id) director_count,
    row_number() OVER (
      PARTITION BY m.organization_id
      ORDER BY CASE WHEN rt.code='director' THEN 0 ELSE 1 END,m.created_at,m.id
    ) rn
  FROM organization_memberships m
  LEFT JOIN role_templates rt ON rt.id=m.role_template_id
  WHERE m.status='active'
)
INSERT INTO organization_owners(organization_id,membership_id)
SELECT organization_id,membership_id
FROM ranked
WHERE rn=1 AND (active_count=1 OR director_count=1)
ON CONFLICT (organization_id) DO NOTHING;

-- New employees use a deterministic compatibility baseline. Business access is
-- intentionally inherited from the assigned job profile/process roles instead.
INSERT INTO role_templates(organization_id,code,name,description,is_system)
SELECT id,'member','Сотрудник','Базовый системный профиль без бизнес-доступа',true
FROM organizations
ON CONFLICT (organization_id,code) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT rt.organization_id,rt.id,'home.command.read','allow','all_org','{}'::uuid[]
FROM role_templates rt
WHERE rt.code='member'
  AND EXISTS (SELECT 1 FROM permission_definitions d WHERE d.capability='home.command.read')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION validate_access_foundation_reference_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  membership_org uuid;
  capability_domain text;
BEGIN
  SELECT organization_id INTO membership_org
  FROM organization_memberships
  WHERE id=NEW.membership_id;

  IF membership_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'access membership belongs to another organization' USING ERRCODE='23514';
  END IF;

  IF TG_TABLE_NAME='membership_system_grants' THEN
    SELECT domain INTO capability_domain
    FROM permission_definitions
    WHERE capability=NEW.capability;

    IF capability_domain NOT IN ('admin','organization') THEN
      RAISE EXCEPTION 'system grant must use an administrative capability' USING ERRCODE='23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER organization_owners_tenant_integrity
BEFORE INSERT OR UPDATE ON organization_owners
FOR EACH ROW EXECUTE FUNCTION validate_access_foundation_reference_integrity();

CREATE TRIGGER membership_system_grants_tenant_integrity
BEFORE INSERT OR UPDATE ON membership_system_grants
FOR EACH ROW EXECUTE FUNCTION validate_access_foundation_reference_integrity();

ALTER TABLE organization_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_owners FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organization_owners
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE membership_system_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_system_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON membership_system_grants
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

CREATE TRIGGER audit_organization_owners
AFTER INSERT OR UPDATE OR DELETE ON organization_owners
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE TRIGGER audit_membership_system_grants
AFTER INSERT OR UPDATE OR DELETE ON membership_system_grants
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
