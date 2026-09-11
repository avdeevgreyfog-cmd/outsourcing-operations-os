BEGIN;

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS prelaunch_at timestamptz;
ALTER TABLE launches ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'preparation';
ALTER TABLE launches DROP CONSTRAINT IF EXISTS launches_phase_check;
ALTER TABLE launches ADD CONSTRAINT launches_phase_check CHECK (phase IN ('preparation','ready','active','completed','cancelled'));

CREATE TABLE contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_company_id uuid NOT NULL REFERENCES client_companies(id),
  request_id uuid NOT NULL REFERENCES requests(id),
  proposal_id uuid REFERENCES proposals(id),
  object_id uuid REFERENCES objects(id),
  parent_contract_id uuid REFERENCES contracts(id),
  kind text NOT NULL DEFAULT 'master' CHECK (kind IN ('master','framework','specification','addendum')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','negotiation','internal_review','approved','signing','signed','rejected','terminated','expired')),
  title text NOT NULL,
  number text,
  owner_user_id uuid REFERENCES app_users(id),
  current_version_id uuid,
  launch_gate text NOT NULL DEFAULT 'blocked' CHECK (launch_gate IN ('blocked','ready','exception')),
  launch_exception_reason text,
  launch_exception_by_user_id uuid REFERENCES app_users(id),
  launch_exception_at timestamptz,
  signed_at timestamptz,
  effective_from date,
  effective_to date,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE TABLE contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','superseded','signed')),
  terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_reference text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  signed_by_user_id uuid REFERENCES app_users(id),
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, version)
);

ALTER TABLE contracts
  ADD CONSTRAINT contracts_current_version_fk FOREIGN KEY (current_version_id) REFERENCES contract_versions(id);

ALTER TABLE objects ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES contracts(id);

CREATE UNIQUE INDEX idx_contract_primary_proposal
  ON contracts(organization_id,proposal_id)
  WHERE proposal_id IS NOT NULL AND parent_contract_id IS NULL;
CREATE INDEX idx_contracts_client_status ON contracts(organization_id,client_company_id,status,updated_at DESC);
CREATE INDEX idx_contracts_request ON contracts(organization_id,request_id,updated_at DESC);
CREATE INDEX idx_contract_versions_contract ON contract_versions(organization_id,contract_id,version DESC);
CREATE INDEX idx_objects_contract ON objects(organization_id,contract_id) WHERE contract_id IS NOT NULL;

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contracts
  USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE POLICY tenant_isolation ON contract_versions
  USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());

CREATE OR REPLACE FUNCTION validate_contract_reference_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE proposal_request uuid; object_request uuid;
BEGIN
  IF organization_reference_org('client_companies',NEW.client_company_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'contract client belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF organization_reference_org('requests',NEW.request_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'contract request belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NEW.proposal_id IS NOT NULL THEN
    IF organization_reference_org('proposals',NEW.proposal_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'contract proposal belongs to another organization' USING ERRCODE='23514'; END IF;
    SELECT request_id INTO proposal_request FROM proposals WHERE id=NEW.proposal_id;
    IF proposal_request IS DISTINCT FROM NEW.request_id THEN RAISE EXCEPTION 'contract proposal belongs to another request' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.object_id IS NOT NULL THEN
    IF organization_reference_org('objects',NEW.object_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'contract object belongs to another organization' USING ERRCODE='23514'; END IF;
    SELECT source_request_id INTO object_request FROM objects WHERE id=NEW.object_id;
    IF object_request IS NOT NULL AND object_request IS DISTINCT FROM NEW.request_id THEN RAISE EXCEPTION 'contract object belongs to another request' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.parent_contract_id IS NOT NULL AND organization_reference_org('contracts',NEW.parent_contract_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'parent contract belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.owner_user_id)
     OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.created_by_user_id)
     OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.launch_exception_by_user_id) THEN
    RAISE EXCEPTION 'contract user belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_contract_version_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF organization_reference_org('contracts',NEW.contract_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'contract version belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.created_by_user_id)
     OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.signed_by_user_id) THEN
    RAISE EXCEPTION 'contract version user belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER contracts_tenant_integrity BEFORE INSERT OR UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION validate_contract_reference_integrity();
CREATE TRIGGER contract_versions_tenant_integrity BEFORE INSERT OR UPDATE ON contract_versions FOR EACH ROW EXECUTE FUNCTION validate_contract_version_integrity();
CREATE TRIGGER audit_contracts AFTER INSERT OR UPDATE OR DELETE ON contracts FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_contract_versions AFTER INSERT OR UPDATE OR DELETE ON contract_versions FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE OR REPLACE FUNCTION prevent_signed_contract_version_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='signed' AND (NEW.terms_snapshot IS DISTINCT FROM OLD.terms_snapshot OR NEW.document_reference IS DISTINCT FROM OLD.document_reference) THEN
    RAISE EXCEPTION 'Signed contract version is immutable; create an addendum or new version instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contract_signed_version_immutable BEFORE UPDATE ON contract_versions FOR EACH ROW EXECUTE FUNCTION prevent_signed_contract_version_mutation();

ALTER TABLE approval_instances DROP CONSTRAINT IF EXISTS approval_instances_subject_type_check;
ALTER TABLE approval_instances ADD CONSTRAINT approval_instances_subject_type_check
  CHECK (subject_type IN ('calculation_scenario','proposal','tender','contract'));

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive) VALUES
  ('contract.read','contract','contract','read',false),
  ('contract.create','contract','contract','create',false),
  ('contract.edit','contract','contract','edit',false),
  ('contract.submit','contract','contract','submit',false),
  ('contract.sign','contract','contract','sign',false),
  ('contract.launch_exception','contract','contract','launch_exception',false)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'all_org'
FROM role_templates r CROSS JOIN (VALUES
  ('contract.read'),('contract.create'),('contract.edit'),('contract.submit'),('contract.sign'),('contract.launch_exception')
) p(capability)
WHERE r.code='director'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'all_org'
FROM role_templates r CROSS JOIN (VALUES
  ('contract.read'),('contract.create'),('contract.edit'),('contract.submit')
) p(capability)
WHERE r.code='sales_manager'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,'contract.read','all_org'
FROM role_templates r
WHERE r.code IN ('finance','economist')
ON CONFLICT DO NOTHING;

COMMIT;
