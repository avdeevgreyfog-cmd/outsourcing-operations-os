BEGIN;

-- Operations lifecycle completion: worker offboarding and supply approvals.

CREATE TABLE IF NOT EXISTS worker_exit_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  object_id uuid REFERENCES objects(id) ON DELETE SET NULL,
  effective_date date NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN ('employee_request','employer_decision','project_end','transfer_out','no_show','medical','other')),
  reason text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('planned','completed','cancelled')),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  completed_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_exit_open
  ON worker_exit_processes(worker_id)
  WHERE status='planned';

ALTER TABLE worker_exit_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_exit_processes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON worker_exit_processes;
CREATE POLICY tenant_isolation ON worker_exit_processes
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

DROP TRIGGER IF EXISTS audit_worker_exit_processes ON worker_exit_processes;
CREATE TRIGGER audit_worker_exit_processes
  AFTER INSERT OR UPDATE OR DELETE ON worker_exit_processes
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE INDEX IF NOT EXISTS idx_worker_exit_history
  ON worker_exit_processes(organization_id,worker_id,effective_date DESC);

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
  ('worker.offboarding.manage','worker','offboarding','manage',false,'Завершение работы сотрудника и закрытие операционных связей')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,'worker.offboarding.manage','allow',
  CASE WHEN r.code='director' THEN 'all_org' WHEN r.code='regional_manager' THEN 'region' ELSE 'assigned_to_me' END,
  '{}'::uuid[]
FROM role_templates r
WHERE r.code IN ('director','regional_manager','object_manager')
ON CONFLICT DO NOTHING;

ALTER TABLE approval_instances DROP CONSTRAINT IF EXISTS approval_instances_subject_type_check;
ALTER TABLE approval_instances ADD CONSTRAINT approval_instances_subject_type_check
  CHECK (subject_type IN ('calculation_scenario','proposal','tender','contract','supply_request'));

CREATE OR REPLACE FUNCTION validate_supply_approval_subject() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subject_type='supply_request'
     AND organization_reference_org('supply_requests',NEW.subject_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'supply approval subject belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS approval_supply_tenant_integrity ON approval_instances;
CREATE TRIGGER approval_supply_tenant_integrity
  BEFORE INSERT OR UPDATE ON approval_instances
  FOR EACH ROW EXECUTE FUNCTION validate_supply_approval_subject();

COMMIT;
