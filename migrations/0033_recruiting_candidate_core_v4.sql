BEGIN;

-- Recruiting candidate core v4:
-- one person card, dynamic contacts, document deadlines/blocking rules,
-- company database source, and worker linkage integrity.

ALTER TABLE need_document_requirements
  ADD COLUMN IF NOT EXISTS required_by_stage text NOT NULL DEFAULT 'first_shift',
  ADD COLUMN IF NOT EXISTS blocks_progress boolean NOT NULL DEFAULT true;

ALTER TABLE need_document_requirements DROP CONSTRAINT IF EXISTS need_document_requirements_required_by_stage_check;
ALTER TABLE need_document_requirements ADD CONSTRAINT need_document_requirements_required_by_stage_check
  CHECK (required_by_stage IN ('documents','preparation','first_shift','retention_7','retention_30','none'));

UPDATE need_document_requirements ndr
SET required_by_stage=CASE WHEN dt.group_type='employment' THEN 'documents' ELSE 'first_shift' END,
    blocks_progress=CASE WHEN dt.group_type='employment' THEN true ELSE false END
FROM recruiting_document_types dt
WHERE dt.id=ndr.document_type_id;

CREATE TABLE candidate_contact_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  channel text NOT NULL,
  value text NOT NULL,
  label text,
  is_preferred boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (channel IN ('phone','email','telegram','whatsapp','max','other')),
  UNIQUE(candidate_id,channel,value)
);

ALTER TABLE candidate_contact_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_contact_methods FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_contact_methods
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

CREATE TRIGGER audit_candidate_contact_methods
AFTER INSERT OR UPDATE OR DELETE ON candidate_contact_methods
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE INDEX idx_candidate_contact_methods_candidate ON candidate_contact_methods(candidate_id,active,channel);
CREATE INDEX idx_candidate_contact_methods_lookup ON candidate_contact_methods(organization_id,channel,lower(value));

INSERT INTO candidate_contact_methods(organization_id,candidate_id,channel,value,is_preferred,created_by_user_id)
SELECT c.organization_id,c.id,'phone',c.phone,COALESCE(c.preferred_channel='phone',false),c.created_by_user_id
FROM candidates c WHERE NULLIF(trim(c.phone),'') IS NOT NULL
ON CONFLICT(candidate_id,channel,value) DO NOTHING;

INSERT INTO candidate_contact_methods(organization_id,candidate_id,channel,value,is_preferred,created_by_user_id)
SELECT c.organization_id,c.id,'email',c.email,COALESCE(c.preferred_channel='email',false),c.created_by_user_id
FROM candidates c WHERE NULLIF(trim(c.email),'') IS NOT NULL
ON CONFLICT(candidate_id,channel,value) DO NOTHING;

INSERT INTO candidate_contact_methods(organization_id,candidate_id,channel,value,is_preferred,created_by_user_id)
SELECT c.organization_id,c.id,'telegram',c.telegram,COALESCE(c.preferred_channel='telegram',false),c.created_by_user_id
FROM candidates c WHERE NULLIF(trim(c.telegram),'') IS NOT NULL
ON CONFLICT(candidate_id,channel,value) DO NOTHING;

INSERT INTO candidate_contact_methods(organization_id,candidate_id,channel,value,is_preferred,created_by_user_id)
SELECT c.organization_id,c.id,'whatsapp',c.whatsapp,COALESCE(c.preferred_channel='whatsapp',false),c.created_by_user_id
FROM candidates c WHERE NULLIF(trim(c.whatsapp),'') IS NOT NULL
ON CONFLICT(candidate_id,channel,value) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_profiles_origin_candidate
ON worker_profiles(organization_id,origin_candidate_id)
WHERE origin_candidate_id IS NOT NULL;

INSERT INTO recruiting_candidate_sources(organization_id,code,name,kind,sort_order)
SELECT o.id,'company_database','База компании / импорт','internal',60
FROM organizations o
ON CONFLICT (organization_id,code) DO UPDATE SET
  name=EXCLUDED.name,kind=EXCLUDED.kind,active=true,sort_order=EXCLUDED.sort_order;

UPDATE recruiting_candidate_sources
SET name='Рекомендация сотрудника / кандидата'
WHERE code='referral' AND name='Рекомендация';

COMMIT;
