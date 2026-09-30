BEGIN;

CREATE TABLE IF NOT EXISTS staffing_plan_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  specialty_id uuid NOT NULL REFERENCES specialties(id),
  shift_kind text NOT NULL DEFAULT 'mixed' CHECK (shift_kind IN ('day','night','mixed')),
  planned_count integer NOT NULL CHECK (planned_count >= 0),
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  source_kind text NOT NULL DEFAULT 'manual' CHECK (source_kind IN ('manual','legacy_need','launch','contract','system')),
  source_id uuid,
  note text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_staffing_plan_targets_scope
  ON staffing_plan_targets(organization_id,object_id,specialty_id,shift_kind,effective_from DESC,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_staffing_plan_targets_active
  ON staffing_plan_targets(organization_id,object_id,effective_from,effective_to);

ALTER TABLE staffing_plan_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing_plan_targets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON staffing_plan_targets;
CREATE POLICY tenant_isolation ON staffing_plan_targets
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

DROP TRIGGER IF EXISTS audit_staffing_plan_targets ON staffing_plan_targets;
CREATE TRIGGER audit_staffing_plan_targets
AFTER INSERT OR UPDATE OR DELETE ON staffing_plan_targets
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Existing installations historically used active non-replacement needs as the
-- staffing baseline. Preserve those numbers as an initial version without
-- changing or closing the needs themselves.
INSERT INTO staffing_plan_targets(
  organization_id,object_id,specialty_id,shift_kind,planned_count,effective_from,
  source_kind,note,created_by_user_id
)
SELECT
  o.organization_id,n.object_id,n.specialty_id,'mixed',sum(n.count_required)::int,current_date,
  'legacy_need','Начальный план перенесён из действующих потребностей',o.created_by_user_id
FROM needs n
JOIN objects o ON o.id=n.object_id
WHERE n.object_id IS NOT NULL
  AND n.source_kind<>'replacement'
  AND n.status NOT IN ('cancelled','archived','closed')
  AND NOT EXISTS (
    SELECT 1 FROM staffing_plan_targets t
    WHERE t.object_id=n.object_id AND t.specialty_id=n.specialty_id
  )
GROUP BY o.organization_id,n.object_id,n.specialty_id,o.created_by_user_id;

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
('operations.staffing_plan.edit','operations','staffing_plan','edit',false,'Edit staffing plan targets for accessible objects')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,'operations.staffing_plan.edit','allow',
  CASE WHEN r.code='director' THEN 'all_org' ELSE
    CASE WHEN r.code='regional_manager' THEN 'region' ELSE 'assigned_to_me' END
  END,
  '{}'::uuid[]
FROM role_templates r
WHERE r.code IN ('director','object_manager','regional_manager','operations_head')
ON CONFLICT DO NOTHING;

INSERT INTO position_permission_grants(organization_id,position_id,capability,effect,scope_type,scope_ids)
SELECT p.organization_id,p.id,'operations.staffing_plan.edit','allow',
  CASE WHEN p.code IN ('regional-manager','regional_manager','operations-head','operations_head') THEN 'region' ELSE 'assigned_to_me' END,
  '{}'::uuid[]
FROM positions p
WHERE p.code IN ('object-manager','object_manager','regional-manager','regional_manager','operations-head','operations_head')
ON CONFLICT DO NOTHING;

COMMIT;
