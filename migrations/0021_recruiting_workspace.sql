BEGIN;

-- Потребность остаётся единой сущностью независимо от источника: коммерция, объект или ручной набор.
ALTER TABLE needs ALTER COLUMN object_id DROP NOT NULL;
ALTER TABLE needs ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id);
ALTER TABLE needs ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'object';
ALTER TABLE needs ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE needs ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE needs ADD COLUMN IF NOT EXISTS conditions_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE needs ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES app_users(id);
ALTER TABLE needs ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE needs DROP CONSTRAINT IF EXISTS needs_source_kind_check;
ALTER TABLE needs ADD CONSTRAINT needs_source_kind_check CHECK (source_kind IN ('commercial','object','manual','replacement','reserve','other'));
ALTER TABLE needs DROP CONSTRAINT IF EXISTS needs_priority_check;
ALTER TABLE needs ADD CONSTRAINT needs_priority_check CHECK (priority IN ('low','normal','high','critical'));
ALTER TABLE needs ADD CONSTRAINT needs_location_check CHECK (object_id IS NOT NULL OR region_id IS NOT NULL);

UPDATE needs n
SET region_id=COALESCE(n.region_id,(SELECT o.region_id FROM objects o WHERE o.id=n.object_id)),
    title=COALESCE(n.title,(SELECT s.name FROM specialties s WHERE s.id=n.specialty_id)),
    source_kind=CASE WHEN n.source_request_role_id IS NOT NULL THEN 'commercial' ELSE n.source_kind END;

-- Единая карточка человека: персональные контакты и атрибуция источника не зависят от конкретной вакансии.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_channel text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS telegram text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source_channel text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source_campaign text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source_reference text;
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_preferred_channel_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_preferred_channel_check CHECK (preferred_channel IS NULL OR preferred_channel IN ('phone','whatsapp','telegram','email','other'));

-- Заявка кандидата хранит его прохождение по конкретной потребности и snapshot условий на момент назначения.
ALTER TABLE candidate_applications ALTER COLUMN object_id DROP NOT NULL;
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS planned_start_date date;
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS actual_start_at timestamptz;
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES app_users(id);
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS manager_decision_at timestamptz;
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS conditions_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- История коммуникаций отделена от системной истории этапов.
CREATE TABLE candidate_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  application_id uuid REFERENCES candidate_applications(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('phone','whatsapp','telegram','email','meeting','note','other')),
  direction text NOT NULL DEFAULT 'internal' CHECK (direction IN ('inbound','outbound','internal')),
  summary text NOT NULL,
  happened_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE candidate_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_communications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_communications
  USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_candidate_communications AFTER INSERT OR UPDATE OR DELETE ON candidate_communications FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE INDEX idx_needs_source_status ON needs(organization_id,source_kind,status,deadline);
CREATE INDEX idx_needs_region_status ON needs(organization_id,region_id,status) WHERE region_id IS NOT NULL;
CREATE INDEX idx_candidate_phone ON candidates(organization_id,phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_candidate_source ON candidates(organization_id,source,source_channel,created_at DESC);
CREATE INDEX idx_candidate_app_stage ON candidate_applications(organization_id,stage,updated_at DESC);
CREATE INDEX idx_candidate_app_candidate ON candidate_applications(organization_id,candidate_id,updated_at DESC);
CREATE INDEX idx_candidate_communications_candidate ON candidate_communications(organization_id,candidate_id,happened_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS one_worker_profile_per_candidate ON worker_profiles(origin_candidate_id) WHERE origin_candidate_id IS NOT NULL;

-- Коммерческая потребность автоматически получает именно те условия, с которыми рекрутер должен работать.
-- Клиентская цена сюда намеренно не попадает: сохраняется только worker-facing snapshot.
CREATE OR REPLACE FUNCTION enrich_recruiting_need_context() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_region uuid;
  v_manager uuid;
  v_specialty text;
  v_request record;
  v_role record;
  v_worker_pay jsonb;
BEGIN
  SELECT name INTO v_specialty FROM specialties WHERE id=NEW.specialty_id;
  NEW.title := COALESCE(NULLIF(NEW.title,''),v_specialty);

  IF NEW.object_id IS NOT NULL THEN
    SELECT region_id,owner_user_id INTO v_region,v_manager FROM objects WHERE id=NEW.object_id;
    NEW.region_id := COALESCE(NEW.region_id,v_region);
    NEW.manager_user_id := COALESCE(NEW.manager_user_id,v_manager);
  END IF;

  IF NEW.source_request_role_id IS NOT NULL THEN
    SELECT rr.schedule_json,rr.requirements_json,rr.request_id INTO v_role
    FROM request_roles rr WHERE rr.id=NEW.source_request_role_id;
    SELECT r.region_id,r.location_text,r.expected_start_date,r.duration_text,r.schedule_json,r.housing_rule,r.travel_rule,r.shuttle_rule,
           r.ppe_rule,r.medical_rule,r.citizenship_rule,r.tools_rule,r.comments
      INTO v_request
    FROM requests r WHERE r.id=v_role.request_id;
    SELECT COALESCE(cs.inputs_snapshot->'workerNetHourly',cs.inputs_snapshot->'workerNet',cs.result_snapshot->'workerNetHourly',cs.result_snapshot->'workerNet')
      INTO v_worker_pay
    FROM calculation_scenarios cs
    JOIN calculations c ON c.id=cs.calculation_id
    WHERE cs.request_role_id=NEW.source_request_role_id AND c.request_id=v_role.request_id AND cs.status='accepted'
    ORDER BY cs.accepted_at DESC NULLS LAST,cs.created_at DESC LIMIT 1;

    NEW.source_kind := 'commercial';
    NEW.region_id := COALESCE(NEW.region_id,v_request.region_id);
    NEW.conditions_snapshot := COALESCE(NEW.conditions_snapshot,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'location',v_request.location_text,
      'expectedStartDate',v_request.expected_start_date,
      'duration',v_request.duration_text,
      'schedule',CASE WHEN v_role.schedule_json<>'{}'::jsonb THEN v_role.schedule_json ELSE v_request.schedule_json END,
      'requirements',v_role.requirements_json,
      'workerPay',v_worker_pay,
      'housing',v_request.housing_rule,
      'travel',v_request.travel_rule,
      'shuttle',v_request.shuttle_rule,
      'ppe',v_request.ppe_rule,
      'medical',v_request.medical_rule,
      'citizenship',v_request.citizenship_rule,
      'tools',v_request.tools_rule,
      'comment',v_request.comments
    ));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS needs_recruiting_context ON needs;
CREATE TRIGGER needs_recruiting_context BEFORE INSERT OR UPDATE ON needs FOR EACH ROW EXECUTE FUNCTION enrich_recruiting_need_context();

CREATE OR REPLACE FUNCTION validate_recruiting_reference_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='needs' THEN
    IF NEW.object_id IS NOT NULL AND organization_reference_org('objects',NEW.object_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'need object belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.region_id IS NOT NULL AND organization_reference_org('regions',NEW.region_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'need region belongs to another organization' USING ERRCODE='23514'; END IF;
    IF organization_reference_org('specialties',NEW.specialty_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'need specialty belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='candidate_applications' THEN
    IF organization_reference_org('candidates',NEW.candidate_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'candidate belongs to another organization' USING ERRCODE='23514'; END IF;
    IF organization_reference_org('needs',NEW.need_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'candidate need belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.object_id IS NOT NULL AND organization_reference_org('objects',NEW.object_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'candidate object belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='candidate_communications' THEN
    IF organization_reference_org('candidates',NEW.candidate_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'communication candidate belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.application_id IS NOT NULL AND organization_reference_org('candidate_applications',NEW.application_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'communication application belongs to another organization' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS needs_recruiting_integrity ON needs;
CREATE TRIGGER needs_recruiting_integrity BEFORE INSERT OR UPDATE ON needs FOR EACH ROW EXECUTE FUNCTION validate_recruiting_reference_integrity();
DROP TRIGGER IF EXISTS candidate_applications_recruiting_integrity ON candidate_applications;
CREATE TRIGGER candidate_applications_recruiting_integrity BEFORE INSERT OR UPDATE ON candidate_applications FOR EACH ROW EXECUTE FUNCTION validate_recruiting_reference_integrity();
CREATE TRIGGER candidate_communications_recruiting_integrity BEFORE INSERT OR UPDATE ON candidate_communications FOR EACH ROW EXECUTE FUNCTION validate_recruiting_reference_integrity();

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive) VALUES
  ('operations.need.create','operations','need','create',false),
  ('recruiting.candidate.convert','recruiting','candidate','convert',false)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'all_org'
FROM role_templates r CROSS JOIN (VALUES ('operations.need.create'),('recruiting.candidate.convert')) p(capability)
WHERE r.code='director'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,'operations.need.create',
  CASE WHEN r.code='recruiter' THEN 'assigned_to_me' ELSE 'region' END
FROM role_templates r
WHERE r.code IN ('recruiter','regional_manager','object_manager')
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,'recruiting.candidate.convert',
  CASE WHEN r.code='recruiter' THEN 'assigned_to_me' ELSE 'region' END
FROM role_templates r
WHERE r.code IN ('recruiter','regional_manager','object_manager')
ON CONFLICT DO NOTHING;

COMMIT;
