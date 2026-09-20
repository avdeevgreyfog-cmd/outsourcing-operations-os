BEGIN;

-- Recruiting Core v4:
-- one candidate profile, reusable contacts/documents, milestone-based requirement deadlines,
-- candidate archive/import source and deduplication helpers.

ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_preferred_channel_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_preferred_channel_check
  CHECK (preferred_channel IS NULL OR preferred_channel IN ('phone','whatsapp','telegram','max','email','other'));

ALTER TABLE candidate_communications DROP CONSTRAINT IF EXISTS candidate_communications_channel_check;
ALTER TABLE candidate_communications ADD CONSTRAINT candidate_communications_channel_check
  CHECK (channel IN ('phone','whatsapp','telegram','max','email','meeting','note','other'));

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE candidate_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('phone','telegram','whatsapp','max','email','other')),
  value text NOT NULL,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  is_preferred boolean NOT NULL DEFAULT false,
  normalized_value text,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(candidate_id,kind,value)
);

CREATE UNIQUE INDEX candidate_contacts_one_primary
  ON candidate_contacts(candidate_id,kind) WHERE is_primary;
CREATE UNIQUE INDEX candidate_contacts_one_preferred
  ON candidate_contacts(candidate_id) WHERE is_preferred;
CREATE INDEX candidate_contacts_normalized
  ON candidate_contacts(organization_id,kind,normalized_value)
  WHERE normalized_value IS NOT NULL;

INSERT INTO candidate_contacts(organization_id,candidate_id,kind,value,label,is_primary,is_preferred,normalized_value,created_by_user_id)
SELECT c.organization_id,c.id,'phone',c.phone,'Основной телефон',true,c.preferred_channel='phone',
       regexp_replace(c.phone,'\D','','g'),c.created_by_user_id
FROM candidates c
WHERE c.phone IS NOT NULL AND btrim(c.phone)<>''
ON CONFLICT DO NOTHING;

INSERT INTO candidate_contacts(organization_id,candidate_id,kind,value,label,is_primary,is_preferred,normalized_value,created_by_user_id)
SELECT c.organization_id,c.id,'email',c.email,'Email',true,c.preferred_channel='email',
       lower(btrim(c.email)),c.created_by_user_id
FROM candidates c
WHERE c.email IS NOT NULL AND btrim(c.email)<>''
ON CONFLICT DO NOTHING;

INSERT INTO candidate_contacts(organization_id,candidate_id,kind,value,label,is_primary,is_preferred,normalized_value,created_by_user_id)
SELECT c.organization_id,c.id,'telegram',c.telegram,'Telegram',true,c.preferred_channel='telegram',
       lower(regexp_replace(btrim(c.telegram),'^@','','g')),c.created_by_user_id
FROM candidates c
WHERE c.telegram IS NOT NULL AND btrim(c.telegram)<>''
ON CONFLICT DO NOTHING;

INSERT INTO candidate_contacts(organization_id,candidate_id,kind,value,label,is_primary,is_preferred,normalized_value,created_by_user_id)
SELECT c.organization_id,c.id,'whatsapp',c.whatsapp,'WhatsApp',true,c.preferred_channel='whatsapp',
       regexp_replace(c.whatsapp,'\D','','g'),c.created_by_user_id
FROM candidates c
WHERE c.whatsapp IS NOT NULL AND btrim(c.whatsapp)<>''
ON CONFLICT DO NOTHING;

CREATE TABLE candidate_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES recruiting_document_types(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'missing'
    CHECK (status IN ('missing','requested','received','verified','rejected','not_required')),
  note text,
  updated_by_user_id uuid REFERENCES app_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(candidate_id,document_type_id)
);

-- Promote reusable employment documents from application-level checklists into the person dossier.
INSERT INTO candidate_documents(organization_id,candidate_id,document_type_id,status,note,updated_by_user_id,updated_at)
SELECT DISTINCT ON (ca.candidate_id,cad.document_type_id)
       cad.organization_id,ca.candidate_id,cad.document_type_id,cad.status,cad.note,cad.updated_by_user_id,cad.updated_at
FROM candidate_application_documents cad
JOIN candidate_applications ca ON ca.id=cad.application_id
JOIN recruiting_document_types dt ON dt.id=cad.document_type_id
WHERE dt.group_type='employment'
ORDER BY ca.candidate_id,cad.document_type_id,
  CASE cad.status WHEN 'verified' THEN 5 WHEN 'received' THEN 4 WHEN 'requested' THEN 3 WHEN 'missing' THEN 2 ELSE 1 END DESC,
  cad.updated_at DESC
ON CONFLICT (candidate_id,document_type_id) DO UPDATE SET
  status=EXCLUDED.status,note=COALESCE(EXCLUDED.note,candidate_documents.note),
  updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=GREATEST(candidate_documents.updated_at,EXCLUDED.updated_at);

ALTER TABLE need_document_requirements
  ADD COLUMN IF NOT EXISTS required_by text NOT NULL DEFAULT 'first_shift';

ALTER TABLE need_document_requirements DROP CONSTRAINT IF EXISTS need_document_requirements_required_by_check;
ALTER TABLE need_document_requirements ADD CONSTRAINT need_document_requirements_required_by_check
  CHECK (required_by IN ('employment','first_shift','day7','day30','non_blocking'));

UPDATE need_document_requirements ndr
SET required_by=CASE WHEN dt.group_type='employment' THEN 'employment' ELSE 'first_shift' END
FROM recruiting_document_types dt
WHERE dt.id=ndr.document_type_id;

-- Standard employment dossier for new needs. Company can edit the active/default set.
UPDATE recruiting_document_types
SET default_required=true,group_type='employment',default_provider='candidate'
WHERE code IN ('passport','snils','inn');

UPDATE recruiting_document_types
SET name='Трудовая книжка / сведения о трудовой деятельности',
    group_type='employment',default_provider='candidate',default_required=true
WHERE code='bank_details' AND false;

INSERT INTO recruiting_document_types(organization_id,code,name,group_type,default_provider,default_required,sort_order)
SELECT o.id,v.code,v.name,'employment','candidate',v.required,v.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('employment_record','Трудовая книжка / СТД-Р / СТД-СФР',true,35),
  ('military_record','Документ воинского учёта',false,36)
) AS v(code,name,required,sort_order)
ON CONFLICT (organization_id,code) DO UPDATE SET
  name=EXCLUDED.name,group_type='employment',default_provider='candidate';

INSERT INTO recruiting_candidate_sources(organization_id,code,name,kind,sort_order)
SELECT o.id,'company_database','База компании / импорт','database',80
FROM organizations o
ON CONFLICT (organization_id,code) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind;

UPDATE recruiting_candidate_sources
SET name='Рекомендация сотрудника / кандидата'
WHERE code='referral' AND name='Рекомендация';

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description)
VALUES ('recruiting.candidate.import','recruiting','candidate','import',false,'Массовая загрузка кандидатов')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type)
SELECT r.organization_id,r.id,'recruiting.candidate.import','allow','all_org'
FROM role_templates r
WHERE r.code IN ('director','recruiting_manager')
ON CONFLICT DO NOTHING;

INSERT INTO process_role_permission_grants(organization_id,process_role_id,capability,effect,scope_type)
SELECT pr.organization_id,pr.id,'recruiting.candidate.import','allow','all_org'
FROM process_roles pr
WHERE pr.code='recruiting-manager'
ON CONFLICT (process_role_id,capability,effect,scope_type) DO NOTHING;

ALTER TABLE candidate_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_contacts
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE candidate_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_documents
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

CREATE TRIGGER audit_candidate_contacts
  AFTER INSERT OR UPDATE OR DELETE ON candidate_contacts
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_candidate_documents
  AFTER INSERT OR UPDATE OR DELETE ON candidate_documents
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
