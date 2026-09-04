BEGIN;

-- Commercial request lifecycle keeps the original request as the stable business entity.
ALTER TABLE requests
  ALTER COLUMN client_company_id DROP NOT NULL,
  ADD COLUMN source text NOT NULL DEFAULT 'manual',
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by_user_id uuid REFERENCES app_users(id),
  ADD COLUMN won_at timestamptz,
  ADD COLUMN lost_at timestamptz;

-- A role may have several historically approved scenarios over time. Only the current
-- accepted scenario remains active; previous accepted versions become superseded.
ALTER TABLE calculation_scenarios DROP CONSTRAINT IF EXISTS calculation_scenarios_status_check;
ALTER TABLE calculation_scenarios ADD CONSTRAINT calculation_scenarios_status_check
  CHECK (status IN ('draft','review','accepted','rejected','superseded'));

ALTER TABLE proposals
  ADD COLUMN content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN supersedes_proposal_id uuid REFERENCES proposals(id),
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN sent_at timestamptz,
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN rejected_at timestamptz,
  ADD COLUMN launched_at timestamptz,
  ADD COLUMN client_decision_note text;

ALTER TABLE objects
  ADD COLUMN source_proposal_id uuid REFERENCES proposals(id);
CREATE UNIQUE INDEX idx_objects_source_proposal_unique ON objects(source_proposal_id) WHERE source_proposal_id IS NOT NULL;

CREATE TABLE approval_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('calculation_scenario','proposal')),
  subject_id uuid NOT NULL,
  process_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_by_user_id uuid NOT NULL REFERENCES app_users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  approval_id uuid NOT NULL REFERENCES approval_instances(id) ON DELETE CASCADE,
  step_order integer NOT NULL DEFAULT 1 CHECK (step_order > 0),
  step_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','skipped')),
  approver_membership_id uuid REFERENCES organization_memberships(id),
  approver_user_id uuid REFERENCES app_users(id),
  decided_by_user_id uuid REFERENCES app_users(id),
  decision_comment text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (approval_id, step_order)
);

CREATE UNIQUE INDEX idx_approval_one_pending_subject
  ON approval_instances(organization_id,subject_type,subject_id) WHERE status='pending';
CREATE INDEX idx_approval_steps_approver ON approval_steps(organization_id,approver_user_id,status,created_at DESC);
CREATE INDEX idx_approval_subject ON approval_instances(organization_id,subject_type,subject_id,created_at DESC);

ALTER TABLE approval_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_instances FORCE ROW LEVEL SECURITY;
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_steps FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON approval_instances
  USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE POLICY tenant_isolation ON approval_steps
  USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());

-- RLS protects rows from another tenant. These triggers additionally prevent a row
-- belonging to one tenant from pointing at related entities of another tenant.
CREATE OR REPLACE FUNCTION commercial_user_belongs_to_org(p_org uuid,p_user uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_user IS NULL OR EXISTS(
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id=p_org AND m.user_id=p_user
  )
$$;

CREATE OR REPLACE FUNCTION validate_commercial_reference_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  request_org uuid;
  role_request uuid;
  calculation_request uuid;
  proposal_request uuid;
  scenario_id uuid;
BEGIN
  IF TG_TABLE_NAME='requests' THEN
    IF NEW.client_company_id IS NOT NULL AND organization_reference_org('client_companies',NEW.client_company_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'request client belongs to another organization' USING ERRCODE='23514';
    END IF;
    IF NEW.contact_id IS NOT NULL AND organization_reference_org('contacts',NEW.contact_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'request contact belongs to another organization' USING ERRCODE='23514';
    END IF;
    IF NEW.lead_id IS NOT NULL AND organization_reference_org('leads',NEW.lead_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'request lead belongs to another organization' USING ERRCODE='23514';
    END IF;
    IF NEW.region_id IS NOT NULL AND organization_reference_org('regions',NEW.region_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'request region belongs to another organization' USING ERRCODE='23514';
    END IF;
    IF NEW.assigned_team_id IS NOT NULL AND organization_reference_org('teams',NEW.assigned_team_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'request team belongs to another organization' USING ERRCODE='23514';
    END IF;
    IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.owner_user_id) OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.created_by_user_id) OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.archived_by_user_id) THEN
      RAISE EXCEPTION 'request user reference belongs to another organization' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='request_roles' THEN
    IF organization_reference_org('requests',NEW.request_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'request role request belongs to another organization' USING ERRCODE='23514'; END IF;
    IF organization_reference_org('specialties',NEW.specialty_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'request role specialty belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='calculations' THEN
    IF organization_reference_org('requests',NEW.request_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'calculation request belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.owner_user_id) OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.created_by_user_id) OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.approved_by_user_id) THEN
      RAISE EXCEPTION 'calculation user reference belongs to another organization' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='calculation_scenarios' THEN
    IF organization_reference_org('calculations',NEW.calculation_id) IS DISTINCT FROM NEW.organization_id OR organization_reference_org('request_roles',NEW.request_role_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'calculation scenario relation belongs to another organization' USING ERRCODE='23514';
    END IF;
    IF organization_reference_org('calculation_models',NEW.model_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'calculation model belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.rule_version_id IS NOT NULL AND organization_reference_org('calculation_rule_versions',NEW.rule_version_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'calculation rule version belongs to another organization' USING ERRCODE='23514'; END IF;
    SELECT request_id INTO calculation_request FROM calculations WHERE id=NEW.calculation_id;
    SELECT request_id INTO role_request FROM request_roles WHERE id=NEW.request_role_id;
    IF calculation_request IS DISTINCT FROM role_request THEN RAISE EXCEPTION 'calculation scenario role belongs to another request' USING ERRCODE='23514'; END IF;
    IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.created_by_user_id) OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.accepted_by_user_id) THEN RAISE EXCEPTION 'calculation scenario user belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='proposals' THEN
    IF organization_reference_org('requests',NEW.request_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'proposal request belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.supersedes_proposal_id IS NOT NULL THEN
      IF organization_reference_org('proposals',NEW.supersedes_proposal_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'superseded proposal belongs to another organization' USING ERRCODE='23514'; END IF;
      SELECT request_id INTO proposal_request FROM proposals WHERE id=NEW.supersedes_proposal_id;
      IF proposal_request IS DISTINCT FROM NEW.request_id THEN RAISE EXCEPTION 'proposal version supersedes another request' USING ERRCODE='23514'; END IF;
    END IF;
    FOREACH scenario_id IN ARRAY NEW.scenario_ids LOOP
      IF organization_reference_org('calculation_scenarios',scenario_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'proposal scenario belongs to another organization' USING ERRCODE='23514'; END IF;
      SELECT c.request_id INTO calculation_request FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id WHERE cs.id=scenario_id;
      IF calculation_request IS DISTINCT FROM NEW.request_id THEN RAISE EXCEPTION 'proposal scenario belongs to another request' USING ERRCODE='23514'; END IF;
    END LOOP;
    IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.created_by_user_id) OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.approved_by_user_id) THEN RAISE EXCEPTION 'proposal user belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='objects' THEN
    IF organization_reference_org('client_companies',NEW.client_company_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'object client belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.source_request_id IS NOT NULL AND organization_reference_org('requests',NEW.source_request_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'object request belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.source_proposal_id IS NOT NULL THEN
      IF organization_reference_org('proposals',NEW.source_proposal_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'object proposal belongs to another organization' USING ERRCODE='23514'; END IF;
      SELECT request_id INTO proposal_request FROM proposals WHERE id=NEW.source_proposal_id;
      IF NEW.source_request_id IS NOT NULL AND proposal_request IS DISTINCT FROM NEW.source_request_id THEN RAISE EXCEPTION 'object proposal belongs to another request' USING ERRCODE='23514'; END IF;
    END IF;
    IF organization_reference_org('regions',NEW.region_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'object region belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.owner_user_id) OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.created_by_user_id) THEN RAISE EXCEPTION 'object user belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='approval_instances' THEN
    IF NEW.subject_type='calculation_scenario' AND organization_reference_org('calculation_scenarios',NEW.subject_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'approval subject belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.subject_type='proposal' AND organization_reference_org('proposals',NEW.subject_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'approval subject belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.requested_by_user_id) THEN RAISE EXCEPTION 'approval requester belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='approval_steps' THEN
    IF organization_reference_org('approval_instances',NEW.approval_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'approval step belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.approver_membership_id IS NOT NULL AND organization_reference_org('organization_memberships',NEW.approver_membership_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'approval membership belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.approver_user_id) OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.decided_by_user_id) THEN RAISE EXCEPTION 'approval user belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.approver_membership_id IS NOT NULL AND NEW.approver_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM organization_memberships m WHERE m.id=NEW.approver_membership_id AND m.user_id=NEW.approver_user_id) THEN RAISE EXCEPTION 'approval membership and user do not match' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER requests_tenant_integrity BEFORE INSERT OR UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION validate_commercial_reference_integrity();
CREATE TRIGGER request_roles_tenant_integrity BEFORE INSERT OR UPDATE ON request_roles FOR EACH ROW EXECUTE FUNCTION validate_commercial_reference_integrity();
CREATE TRIGGER calculations_tenant_integrity BEFORE INSERT OR UPDATE ON calculations FOR EACH ROW EXECUTE FUNCTION validate_commercial_reference_integrity();
CREATE TRIGGER calculation_scenarios_tenant_integrity BEFORE INSERT OR UPDATE ON calculation_scenarios FOR EACH ROW EXECUTE FUNCTION validate_commercial_reference_integrity();
CREATE TRIGGER proposals_tenant_integrity BEFORE INSERT OR UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION validate_commercial_reference_integrity();
CREATE TRIGGER objects_tenant_integrity BEFORE INSERT OR UPDATE ON objects FOR EACH ROW EXECUTE FUNCTION validate_commercial_reference_integrity();
CREATE TRIGGER approval_instances_tenant_integrity BEFORE INSERT OR UPDATE ON approval_instances FOR EACH ROW EXECUTE FUNCTION validate_commercial_reference_integrity();
CREATE TRIGGER approval_steps_tenant_integrity BEFORE INSERT OR UPDATE ON approval_steps FOR EACH ROW EXECUTE FUNCTION validate_commercial_reference_integrity();

-- Commercial records are auditable from creation through launch.
CREATE TRIGGER audit_requests AFTER INSERT OR UPDATE OR DELETE ON requests FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_proposals AFTER INSERT OR UPDATE OR DELETE ON proposals FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_objects AFTER INSERT OR UPDATE OR DELETE ON objects FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_approval_instances AFTER INSERT OR UPDATE OR DELETE ON approval_instances FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_approval_steps AFTER INSERT OR UPDATE OR DELETE ON approval_steps FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE OR REPLACE FUNCTION prevent_non_draft_proposal_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
    NEW.scenario_ids IS DISTINCT FROM OLD.scenario_ids OR
    NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot OR
    NEW.total_value IS DISTINCT FROM OLD.total_value
  ) THEN
    RAISE EXCEPTION 'Approved/sent proposal content is immutable; create a new proposal version instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER proposal_content_immutable
BEFORE UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION prevent_non_draft_proposal_mutation();

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive) VALUES
  ('approval.read','workflow','approval','read',false),
  ('approval.decide','workflow','approval','decide',false),
  ('sales.proposal.read','sales','proposal','read',false),
  ('sales.proposal.create','sales','proposal','create',false),
  ('sales.proposal.edit','sales','proposal','edit',false),
  ('sales.proposal.submit','sales','proposal','submit',false),
  ('sales.proposal.client_decision','sales','proposal','client_decision',false),
  ('sales.proposal.launch','sales','proposal','launch',false),
  ('sales.request.archive','sales','request','archive',false)
ON CONFLICT (capability) DO NOTHING;

-- Existing tenants receive sensible defaults. Fresh demo installs receive the same
-- grants from 9000_demo_seed.sql after migrations are applied.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'all_org'
FROM role_templates r CROSS JOIN (VALUES
 ('approval.read'),('approval.decide'),('sales.proposal.read'),('sales.proposal.create'),('sales.proposal.edit'),
 ('sales.proposal.submit'),('sales.proposal.client_decision'),('sales.proposal.launch'),('sales.request.archive')
) p(capability)
WHERE r.code='director'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'team'
FROM role_templates r CROSS JOIN (VALUES
 ('approval.read'),('sales.proposal.read'),('sales.proposal.create'),('sales.proposal.edit'),('sales.proposal.submit'),
 ('sales.proposal.client_decision'),('sales.proposal.launch'),('sales.request.archive')
) p(capability)
WHERE r.code='sales_manager'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'all_org'
FROM role_templates r CROSS JOIN (VALUES ('approval.read'),('approval.decide')) p(capability)
WHERE r.code IN ('economist','finance')
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'region'
FROM role_templates r CROSS JOIN (VALUES ('approval.read'),('approval.decide')) p(capability)
WHERE r.code='regional_manager'
ON CONFLICT DO NOTHING;

COMMIT;
