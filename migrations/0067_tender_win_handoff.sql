BEGIN;

ALTER TABLE contracts
  ALTER COLUMN request_id DROP NOT NULL,
  ADD COLUMN tender_id uuid REFERENCES tenders(id);

ALTER TABLE contracts
  ADD CONSTRAINT contracts_source_exactly_one CHECK (num_nonnulls(request_id,tender_id)=1),
  ADD CONSTRAINT contracts_tender_has_no_proposal CHECK (tender_id IS NULL OR proposal_id IS NULL);

CREATE INDEX idx_contracts_tender ON contracts(organization_id,tender_id,updated_at DESC) WHERE tender_id IS NOT NULL;
CREATE UNIQUE INDEX idx_contract_primary_tender
  ON contracts(organization_id,tender_id)
  WHERE tender_id IS NOT NULL AND parent_contract_id IS NULL;

ALTER TABLE objects
  ADD COLUMN source_tender_id uuid REFERENCES tenders(id);

ALTER TABLE objects
  ADD CONSTRAINT objects_tender_source_exclusive
  CHECK (source_tender_id IS NULL OR (source_request_id IS NULL AND source_proposal_id IS NULL));

CREATE INDEX idx_objects_source_tender ON objects(organization_id,source_tender_id) WHERE source_tender_id IS NOT NULL;

ALTER TABLE needs
  ADD COLUMN source_tender_role_id uuid REFERENCES tender_roles(id);

ALTER TABLE needs
  ADD CONSTRAINT needs_source_role_exclusive
  CHECK (num_nonnulls(source_request_role_id,source_tender_role_id)<=1);

CREATE INDEX idx_needs_source_tender_role ON needs(organization_id,source_tender_role_id) WHERE source_tender_role_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_contract_reference_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  proposal_request uuid;
  object_request uuid;
  object_tender uuid;
  tender_client uuid;
BEGIN
  IF organization_reference_org('client_companies',NEW.client_company_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'contract client belongs to another organization' USING ERRCODE='23514';
  END IF;

  IF NEW.request_id IS NOT NULL AND organization_reference_org('requests',NEW.request_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'contract request belongs to another organization' USING ERRCODE='23514';
  END IF;

  IF NEW.tender_id IS NOT NULL THEN
    IF organization_reference_org('tenders',NEW.tender_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'contract tender belongs to another organization' USING ERRCODE='23514';
    END IF;
    SELECT client_company_id INTO tender_client FROM tenders WHERE id=NEW.tender_id;
    IF tender_client IS NULL OR tender_client IS DISTINCT FROM NEW.client_company_id THEN
      RAISE EXCEPTION 'contract client does not match tender client' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.proposal_id IS NOT NULL THEN
    IF NEW.request_id IS NULL OR NEW.tender_id IS NOT NULL THEN
      RAISE EXCEPTION 'contract proposal requires request source' USING ERRCODE='23514';
    END IF;
    IF organization_reference_org('proposals',NEW.proposal_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'contract proposal belongs to another organization' USING ERRCODE='23514';
    END IF;
    SELECT request_id INTO proposal_request FROM proposals WHERE id=NEW.proposal_id;
    IF proposal_request IS DISTINCT FROM NEW.request_id THEN
      RAISE EXCEPTION 'contract proposal belongs to another request' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.object_id IS NOT NULL THEN
    IF organization_reference_org('objects',NEW.object_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'contract object belongs to another organization' USING ERRCODE='23514';
    END IF;
    SELECT source_request_id,source_tender_id INTO object_request,object_tender FROM objects WHERE id=NEW.object_id;
    IF NEW.request_id IS NOT NULL AND object_request IS NOT NULL AND object_request IS DISTINCT FROM NEW.request_id THEN
      RAISE EXCEPTION 'contract object belongs to another request' USING ERRCODE='23514';
    END IF;
    IF NEW.tender_id IS NOT NULL AND object_tender IS DISTINCT FROM NEW.tender_id THEN
      RAISE EXCEPTION 'contract object must originate from the same tender' USING ERRCODE='23514';
    END IF;
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

CREATE OR REPLACE FUNCTION validate_tender_launch_reference_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tender_client uuid;
  role_tender uuid;
  role_specialty uuid;
  object_tender uuid;
BEGIN
  IF TG_TABLE_NAME='objects' THEN
    IF NEW.source_tender_id IS NOT NULL THEN
      IF organization_reference_org('tenders',NEW.source_tender_id) IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'object tender belongs to another organization' USING ERRCODE='23514';
      END IF;
      SELECT client_company_id INTO tender_client FROM tenders WHERE id=NEW.source_tender_id;
      IF tender_client IS NULL OR tender_client IS DISTINCT FROM NEW.client_company_id THEN
        RAISE EXCEPTION 'object client does not match tender client' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='needs' THEN
    IF NEW.source_tender_role_id IS NOT NULL THEN
      IF organization_reference_org('tender_roles',NEW.source_tender_role_id) IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'need tender role belongs to another organization' USING ERRCODE='23514';
      END IF;
      SELECT tender_id,specialty_id INTO role_tender,role_specialty FROM tender_roles WHERE id=NEW.source_tender_role_id;
      SELECT source_tender_id INTO object_tender FROM objects WHERE id=NEW.object_id;
      IF object_tender IS NULL OR role_tender IS DISTINCT FROM object_tender THEN
        RAISE EXCEPTION 'need tender role does not belong to object tender' USING ERRCODE='23514';
      END IF;
      IF role_specialty IS NULL OR role_specialty IS DISTINCT FROM NEW.specialty_id THEN
        RAISE EXCEPTION 'need specialty does not match tender role' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER objects_tender_source_integrity
BEFORE INSERT OR UPDATE ON objects
FOR EACH ROW EXECUTE FUNCTION validate_tender_launch_reference_integrity();

CREATE TRIGGER needs_tender_source_integrity
BEFORE INSERT OR UPDATE ON needs
FOR EACH ROW EXECUTE FUNCTION validate_tender_launch_reference_integrity();

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive)
VALUES ('sales.tender.launch','sales','tender','launch',false)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,'sales.tender.launch','all_org'
FROM role_templates r
WHERE r.code='director'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,'sales.tender.launch','team'
FROM role_templates r
WHERE r.code='sales_manager'
ON CONFLICT DO NOTHING;

COMMIT;
