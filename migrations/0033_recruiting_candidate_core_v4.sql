BEGIN;

-- Recruiting candidate core v4:
-- one person card, dynamic contacts, document deadlines/blocking rules,
-- company database source, and worker linkage integrity.

ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_preferred_channel_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_preferred_channel_check
  CHECK (preferred_channel IS NULL OR preferred_channel IN ('phone','whatsapp','telegram','max','email','other'));

ALTER TABLE candidate_communications DROP CONSTRAINT IF EXISTS candidate_communications_channel_check;
ALTER TABLE candidate_communications ADD CONSTRAINT candidate_communications_channel_check
  CHECK (channel IN ('phone','whatsapp','telegram','max','email','meeting','note','other'));

INSERT INTO recruiting_document_types(organization_id,code,name,group_type,default_provider,default_required,sort_order)
SELECT o.id,'employment_record','Трудовая книжка / СТД','employment','candidate',true,42
FROM organizations o
ON CONFLICT (organization_id,code) DO UPDATE SET
  name=EXCLUDED.name,group_type='employment',default_provider='candidate';

UPDATE recruiting_document_types
SET default_required=true
WHERE code IN ('passport','snils','inn','bank_details','employment_record','military_id');

UPDATE recruiting_document_types
SET default_required=false
WHERE group_type='clearance';

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

-- Preserve explicitly configured historical needs. Only needs with no employment
-- requirements receive the current organization baseline automatically.
INSERT INTO need_document_requirements(
  organization_id,need_id,document_type_id,required,provider,required_by_stage,blocks_progress
)
SELECT n.organization_id,n.id,dt.id,true,dt.default_provider,'documents',true
FROM needs n
JOIN recruiting_document_types dt
  ON dt.organization_id=n.organization_id
 AND dt.active
 AND dt.group_type='employment'
 AND dt.default_required
WHERE NOT EXISTS(
  SELECT 1
  FROM need_document_requirements existing
  JOIN recruiting_document_types edt ON edt.id=existing.document_type_id
  WHERE existing.need_id=n.id AND existing.required AND edt.group_type='employment'
)
ON CONFLICT(need_id,document_type_id) DO NOTHING;

ALTER TABLE candidate_application_documents
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_candidate_application_documents_task
ON candidate_application_documents(task_id)
WHERE task_id IS NOT NULL;

CREATE TABLE candidate_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES recruiting_document_types(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'missing',
  note text,
  updated_by_user_id uuid REFERENCES app_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('missing','requested','received','verified','rejected','not_required','to_prepare','in_progress','ready')),
  UNIQUE(candidate_id,document_type_id)
);

ALTER TABLE candidate_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_documents
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

CREATE TRIGGER audit_candidate_documents
AFTER INSERT OR UPDATE OR DELETE ON candidate_documents
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE INDEX idx_candidate_documents_candidate ON candidate_documents(candidate_id,status);

INSERT INTO candidate_documents(organization_id,candidate_id,document_type_id,status,note,updated_by_user_id,updated_at)
SELECT DISTINCT ON (ca.candidate_id,cad.document_type_id)
  cad.organization_id,ca.candidate_id,cad.document_type_id,cad.status,cad.note,cad.updated_by_user_id,cad.updated_at
FROM candidate_application_documents cad
JOIN candidate_applications ca ON ca.id=cad.application_id
JOIN recruiting_document_types dt ON dt.id=cad.document_type_id
WHERE dt.group_type='employment'
ORDER BY ca.candidate_id,cad.document_type_id,
  CASE cad.status WHEN 'verified' THEN 6 WHEN 'received' THEN 5 WHEN 'ready' THEN 4 WHEN 'requested' THEN 3 WHEN 'missing' THEN 2 ELSE 1 END DESC,
  cad.updated_at DESC
ON CONFLICT(candidate_id,document_type_id) DO NOTHING;

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
