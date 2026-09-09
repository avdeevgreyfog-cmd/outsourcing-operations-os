BEGIN;

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive) VALUES
  ('sales.tender.read','sales','tender','read',false),
  ('sales.tender.create','sales','tender','create',false),
  ('sales.tender.edit','sales','tender','edit',false),
  ('sales.tender.import','sales','tender','import',false),
  ('sales.tender.submit','sales','tender','submit',false),
  ('sales.tender.result','sales','tender','result',false),
  ('company.document.read','organization','company_document','read',false),
  ('company.document.manage','organization','company_document','manage',false)
ON CONFLICT (capability) DO NOTHING;

CREATE TABLE tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_company_id uuid REFERENCES client_companies(id),
  legal_entity_id uuid REFERENCES legal_entities(id),
  title text NOT NULL,
  customer_name text,
  platform text,
  procedure_number text,
  source_url text,
  source_name text,
  publication_date date,
  submission_deadline timestamptz,
  initial_price numeric(16,2),
  billing_unit text NOT NULL DEFAULT 'unknown' CHECK (billing_unit IN ('unknown','hour','shift','worker_month','unit','piecework','project','mixed')),
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new','analysis','clarification','calculation','approval','preparation','submitted','awaiting_result','completed')),
  decision text NOT NULL DEFAULT 'undecided' CHECK (decision IN ('undecided','participate','needs_clarification','no_bid')),
  result text CHECK (result IS NULL OR result IN ('won','lost','no_bid','cancelled','failed')),
  close_reason text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  potential text NOT NULL DEFAULT 'medium' CHECK (potential IN ('low','medium','high')),
  analysis_summary text,
  conditions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_action_text text,
  next_action_at timestamptz,
  owner_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  assigned_team_id uuid REFERENCES teams(id),
  region_id uuid REFERENCES regions(id),
  submitted_at timestamptz,
  submitted_by_user_id uuid REFERENCES app_users(id),
  final_bid_value numeric(16,2),
  bid_reference text,
  submission_note text,
  submission_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_tender_platform_procedure_unique
  ON tenders(organization_id,lower(platform),lower(procedure_number))
  WHERE platform IS NOT NULL AND procedure_number IS NOT NULL AND archived_at IS NULL;
CREATE INDEX idx_tenders_stage_deadline ON tenders(organization_id,stage,submission_deadline);
CREATE INDEX idx_tenders_owner ON tenders(organization_id,owner_user_id,stage);
CREATE INDEX idx_tenders_client ON tenders(organization_id,client_company_id);

CREATE TABLE tender_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  specialty_id uuid REFERENCES specialties(id),
  title text NOT NULL,
  count_required integer CHECK (count_required IS NULL OR count_required > 0),
  volume numeric(16,3),
  billing_unit text NOT NULL DEFAULT 'unknown' CHECK (billing_unit IN ('unknown','hour','shift','worker_month','unit','piecework','project','mixed')),
  target_client_rate numeric(14,2),
  schedule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  requirements_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tender_roles_tender ON tender_roles(organization_id,tender_id);

CREATE TABLE tender_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  role_code text NOT NULL CHECK (role_code IN ('owner','analyst','calculator','documents','legal','approver','submission')),
  user_id uuid NOT NULL REFERENCES app_users(id),
  assigned_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tender_id,role_code,user_id)
);
CREATE INDEX idx_tender_assignments_user ON tender_assignments(organization_id,user_id,role_code);

CREATE TABLE tender_source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  file_asset_id uuid REFERENCES file_assets(id),
  name text NOT NULL,
  document_type text NOT NULL DEFAULT 'other',
  source_url text,
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tender_source_documents_tender ON tender_source_documents(organization_id,tender_id,created_at DESC);

CREATE TABLE company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  legal_entity_id uuid REFERENCES legal_entities(id),
  file_asset_id uuid REFERENCES file_assets(id),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  document_number text,
  source_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','needs_update','missing','archived')),
  valid_from date,
  expires_at date,
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_documents_entity ON company_documents(organization_id,legal_entity_id,status,expires_at);

CREATE TABLE tender_document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  company_document_id uuid REFERENCES company_documents(id),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'prepare' CHECK (status IN ('available','update_needed','prepare','requested','ready','not_required')),
  owner_user_id uuid REFERENCES app_users(id),
  due_at timestamptz,
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tender_document_requirements ON tender_document_requirements(organization_id,tender_id,status);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tenders','tender_roles','tender_assignments','tender_source_documents','company_documents','tender_document_requirements']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id())',table_name);
  END LOOP;
END $$;

CREATE TRIGGER audit_tenders AFTER INSERT OR UPDATE OR DELETE ON tenders FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_tender_roles AFTER INSERT OR UPDATE OR DELETE ON tender_roles FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_tender_assignments AFTER INSERT OR UPDATE OR DELETE ON tender_assignments FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_tender_document_requirements AFTER INSERT OR UPDATE OR DELETE ON tender_document_requirements FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_company_documents AFTER INSERT OR UPDATE OR DELETE ON company_documents FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Calculations are a shared economic instrument: a saved calculation belongs either
-- to a direct client request or to a tender. Tender calculations do not create a hidden request.
ALTER TABLE calculations ALTER COLUMN request_id DROP NOT NULL;
ALTER TABLE calculations ADD COLUMN tender_id uuid REFERENCES tenders(id) ON DELETE CASCADE;
ALTER TABLE calculations ADD CONSTRAINT calculations_source_exactly_one CHECK (num_nonnulls(request_id,tender_id)=1);
CREATE INDEX idx_calculations_tender ON calculations(organization_id,tender_id,created_at DESC) WHERE tender_id IS NOT NULL;

ALTER TABLE calculation_scenarios ALTER COLUMN request_role_id DROP NOT NULL;
ALTER TABLE calculation_scenarios ADD COLUMN tender_role_id uuid REFERENCES tender_roles(id) ON DELETE CASCADE;
ALTER TABLE calculation_scenarios ADD CONSTRAINT calculation_scenario_role_exactly_one CHECK (num_nonnulls(request_role_id,tender_role_id)=1);
CREATE UNIQUE INDEX one_accepted_scenario_per_tender_role ON calculation_scenarios(tender_role_id) WHERE status='accepted' AND tender_role_id IS NOT NULL;

DROP TRIGGER IF EXISTS calculations_tenant_integrity ON calculations;
CREATE OR REPLACE FUNCTION validate_calculation_source_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.request_id IS NOT NULL AND organization_reference_org('requests',NEW.request_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'calculation request belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NEW.tender_id IS NOT NULL AND organization_reference_org('tenders',NEW.tender_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'calculation tender belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.owner_user_id)
    OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.created_by_user_id)
    OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.approved_by_user_id) THEN
    RAISE EXCEPTION 'calculation user reference belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER calculations_tenant_integrity BEFORE INSERT OR UPDATE ON calculations FOR EACH ROW EXECUTE FUNCTION validate_calculation_source_integrity();

DROP TRIGGER IF EXISTS calculation_scenarios_tenant_integrity ON calculation_scenarios;
CREATE OR REPLACE FUNCTION validate_calculation_scenario_source_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE calc_request uuid; calc_tender uuid; role_request uuid; role_tender uuid;
BEGIN
  IF organization_reference_org('calculations',NEW.calculation_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'calculation scenario calculation belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF organization_reference_org('calculation_models',NEW.model_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'calculation model belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NEW.rule_version_id IS NOT NULL AND organization_reference_org('calculation_rule_versions',NEW.rule_version_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'calculation rule version belongs to another organization' USING ERRCODE='23514';
  END IF;
  SELECT request_id,tender_id INTO calc_request,calc_tender FROM calculations WHERE id=NEW.calculation_id;
  IF NEW.request_role_id IS NOT NULL THEN
    IF organization_reference_org('request_roles',NEW.request_role_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'request role belongs to another organization' USING ERRCODE='23514'; END IF;
    SELECT request_id INTO role_request FROM request_roles WHERE id=NEW.request_role_id;
    IF calc_request IS NULL OR calc_tender IS NOT NULL OR role_request IS DISTINCT FROM calc_request THEN RAISE EXCEPTION 'scenario role does not belong to calculation request' USING ERRCODE='23514'; END IF;
  ELSE
    IF organization_reference_org('tender_roles',NEW.tender_role_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'tender role belongs to another organization' USING ERRCODE='23514'; END IF;
    SELECT tender_id INTO role_tender FROM tender_roles WHERE id=NEW.tender_role_id;
    IF calc_tender IS NULL OR calc_request IS NOT NULL OR role_tender IS DISTINCT FROM calc_tender THEN RAISE EXCEPTION 'scenario role does not belong to calculation tender' USING ERRCODE='23514'; END IF;
  END IF;
  IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.created_by_user_id)
    OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.accepted_by_user_id) THEN
    RAISE EXCEPTION 'calculation scenario user belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER calculation_scenarios_tenant_integrity BEFORE INSERT OR UPDATE ON calculation_scenarios FOR EACH ROW EXECUTE FUNCTION validate_calculation_scenario_source_integrity();

ALTER TABLE approval_instances DROP CONSTRAINT IF EXISTS approval_instances_subject_type_check;
ALTER TABLE approval_instances ADD CONSTRAINT approval_instances_subject_type_check CHECK (subject_type IN ('calculation_scenario','proposal','tender'));

DROP TRIGGER IF EXISTS approval_instances_tenant_integrity ON approval_instances;
CREATE OR REPLACE FUNCTION validate_approval_instance_source_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subject_type='calculation_scenario' AND organization_reference_org('calculation_scenarios',NEW.subject_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'approval subject belongs to another organization' USING ERRCODE='23514'; END IF;
  IF NEW.subject_type='proposal' AND organization_reference_org('proposals',NEW.subject_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'approval subject belongs to another organization' USING ERRCODE='23514'; END IF;
  IF NEW.subject_type='tender' AND organization_reference_org('tenders',NEW.subject_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'approval tender belongs to another organization' USING ERRCODE='23514'; END IF;
  IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.requested_by_user_id) THEN RAISE EXCEPTION 'approval requester belongs to another organization' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approval_instances_tenant_integrity BEFORE INSERT OR UPDATE ON approval_instances FOR EACH ROW EXECUTE FUNCTION validate_approval_instance_source_integrity();

-- Sensible grants for existing tenants. Scope-aware server checks still apply.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'all_org'
FROM role_templates r CROSS JOIN (VALUES
 ('sales.tender.read'),('sales.tender.create'),('sales.tender.edit'),('sales.tender.import'),('sales.tender.submit'),('sales.tender.result'),
 ('company.document.read'),('company.document.manage')
) p(capability)
WHERE r.code='director'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'team'
FROM role_templates r CROSS JOIN (VALUES
 ('sales.tender.read'),('sales.tender.create'),('sales.tender.edit'),('sales.tender.import'),('sales.tender.submit'),('sales.tender.result')
) p(capability)
WHERE r.code='sales_manager'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,'company.document.read','all_org' FROM role_templates r WHERE r.code IN ('sales_manager','economist','regional_manager')
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,'sales.tender.read',CASE WHEN r.code='regional_manager' THEN 'region' ELSE 'all_org' END
FROM role_templates r WHERE r.code IN ('regional_manager','economist')
ON CONFLICT DO NOTHING;

COMMIT;
