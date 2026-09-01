BEGIN;

-- `positions` from 0005 remains the reusable job profile for backwards compatibility.
-- A staff position is a concrete, budgeted seat that can remain open when an employee leaves.
CREATE TABLE staff_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  job_profile_id uuid NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  organization_unit_id uuid NOT NULL REFERENCES organization_units(id) ON DELETE RESTRICT,
  legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE SET NULL,
  region_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  reports_to_position_id uuid REFERENCES staff_positions(id) ON DELETE SET NULL,
  capacity numeric(6,2) NOT NULL DEFAULT 1 CHECK (capacity > 0),
  level integer NOT NULL DEFAULT 0 CHECK (level >= 0),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','open','filled','frozen','closed')),
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  CHECK (reports_to_position_id IS NULL OR reports_to_position_id <> id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_position_id uuid NOT NULL REFERENCES staff_positions(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE RESTRICT,
  assignment_type text NOT NULL DEFAULT 'primary' CHECK (assignment_type IN ('primary','additional','acting')),
  fte numeric(5,2) NOT NULL DEFAULT 1 CHECK (fte > 0 AND fte <= 1),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','ended')),
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  reason text,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE membership_organization_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
  organization_unit_id uuid NOT NULL REFERENCES organization_units(id) ON DELETE RESTRICT,
  assignment_type text NOT NULL DEFAULT 'primary' CHECK (assignment_type IN ('primary','additional','project')),
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_id, organization_unit_id, assignment_type, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE organization_unit_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  organization_unit_id uuid NOT NULL REFERENCES organization_units(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE RESTRICT,
  lead_type text NOT NULL DEFAULT 'primary' CHECK (lead_type IN ('primary','functional','project')),
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_unit_id, membership_id, lead_type, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE organization_change_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','scheduled','applied','cancelled')),
  effective_date date NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  approved_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_change_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  change_set_id uuid NOT NULL REFERENCES organization_change_sets(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('create','move','update','close','assign','unassign')),
  entity_type text NOT NULL CHECK (entity_type IN ('organization_unit','job_profile','staff_position','position_assignment','unit_lead','process_role','responsibility_rule')),
  entity_id uuid,
  previous_value jsonb,
  proposed_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  impact_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE responsibility_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  process_code text NOT NULL,
  process_name text NOT NULL,
  step_code text NOT NULL,
  step_name text NOT NULL,
  responsibility_type text NOT NULL CHECK (responsibility_type IN ('owner','executor','approver','observer','fallback')),
  subject_type text NOT NULL CHECK (subject_type IN ('process_role','staff_position','org_unit','membership')),
  subject_id uuid NOT NULL,
  scope_type text NOT NULL DEFAULT 'all_org' CHECK (scope_type IN ('self','team','org_unit','region','objects','clients','all_org')),
  scope_ids uuid[] NOT NULL DEFAULT '{}',
  fallback_subject_type text CHECK (fallback_subject_type IN ('process_role','staff_position','org_unit','membership')),
  fallback_subject_id uuid,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, process_code, step_code, responsibility_type, subject_type, subject_id, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK ((fallback_subject_type IS NULL) = (fallback_subject_id IS NULL))
);

ALTER TABLE user_permission_overrides
  ADD COLUMN effective_from date,
  ADD COLUMN effective_to date,
  ADD COLUMN reason text,
  ADD COLUMN approved_by_user_id uuid REFERENCES app_users(id),
  ADD CONSTRAINT user_permission_overrides_effective_dates CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from);

INSERT INTO membership_organization_units(organization_id,membership_id,organization_unit_id,assignment_type,effective_from)
SELECT organization_id,id,primary_org_unit_id,'primary',current_date
FROM organization_memberships
WHERE primary_org_unit_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO organization_unit_leads(organization_id,organization_unit_id,membership_id,lead_type,effective_from)
SELECT organization_id,id,manager_membership_id,'primary',current_date
FROM organization_units
WHERE manager_membership_id IS NOT NULL
ON CONFLICT DO NOTHING;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'staff_positions','position_assignments','membership_organization_units','organization_unit_leads',
    'organization_change_sets','organization_change_items','responsibility_rules'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id())',table_name);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row_change()','audit_' || table_name,table_name);
  END LOOP;
END $$;

CREATE INDEX idx_staff_positions_tree ON staff_positions(organization_id,reports_to_position_id,status,effective_from,effective_to);
CREATE INDEX idx_staff_positions_unit ON staff_positions(organization_id,organization_unit_id,status);
CREATE INDEX idx_position_assignments_active ON position_assignments(organization_id,staff_position_id,status,effective_from,effective_to);
CREATE INDEX idx_membership_units_active ON membership_organization_units(organization_id,membership_id,effective_from,effective_to);
CREATE INDEX idx_unit_leads_active ON organization_unit_leads(organization_id,organization_unit_id,lead_type,effective_from,effective_to);
CREATE INDEX idx_change_sets_effective ON organization_change_sets(organization_id,status,effective_date);
CREATE INDEX idx_responsibility_resolver ON responsibility_rules(organization_id,process_code,step_code,active,effective_from,effective_to);
CREATE INDEX idx_permission_overrides_effective ON user_permission_overrides(organization_id,membership_id,effective_from,effective_to);

COMMIT;
