BEGIN;

-- Unknown legacy facts stay NULL. This migration never rewrites existing data.
ALTER TABLE objects ALTER COLUMN client_company_id DROP NOT NULL;
ALTER TABLE objects ALTER COLUMN region_id DROP NOT NULL;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS onboarding_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE worker_object_assignments ALTER COLUMN work_mode DROP NOT NULL;
ALTER TABLE worker_object_assignments ALTER COLUMN work_mode DROP DEFAULT;

CREATE OR REPLACE FUNCTION validate_worker_onboarding_metadata() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF jsonb_typeof(NEW.onboarding_metadata) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'onboarding metadata must be an object' USING ERRCODE='23514';
  END IF;
  IF NULLIF(NEW.onboarding_metadata->>'objectId','') IS NOT NULL AND
     organization_reference_org('objects',(NEW.onboarding_metadata->>'objectId')::uuid) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'pending object belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NULLIF(NEW.onboarding_metadata->>'specialtyId','') IS NOT NULL AND
     organization_reference_org('specialties',(NEW.onboarding_metadata->>'specialtyId')::uuid) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'pending specialty belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER worker_onboarding_metadata_integrity
BEFORE INSERT OR UPDATE OF organization_id,onboarding_metadata ON worker_profiles
FOR EACH ROW EXECUTE FUNCTION validate_worker_onboarding_metadata();

-- Keep all commercial tenant checks; only an absent object client is optional.
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
    IF NEW.client_company_id IS NOT NULL AND organization_reference_org('client_companies',NEW.client_company_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'object client belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.source_request_id IS NOT NULL AND organization_reference_org('requests',NEW.source_request_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'object request belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.source_proposal_id IS NOT NULL THEN
      IF organization_reference_org('proposals',NEW.source_proposal_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'object proposal belongs to another organization' USING ERRCODE='23514'; END IF;
      SELECT request_id INTO proposal_request FROM proposals WHERE id=NEW.source_proposal_id;
      IF NEW.source_request_id IS NOT NULL AND proposal_request IS DISTINCT FROM NEW.source_request_id THEN RAISE EXCEPTION 'object proposal belongs to another request' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.region_id IS NOT NULL AND organization_reference_org('regions',NEW.region_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'object region belongs to another organization' USING ERRCODE='23514'; END IF;
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

COMMIT;
