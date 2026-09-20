BEGIN;

-- Configurable recruiting pipeline labels/order without changing historical stage codes.
CREATE TABLE recruiting_pipeline_stage_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stage_code text NOT NULL,
  label text NOT NULL,
  stage_kind text NOT NULL CHECK (stage_kind IN ('new_contact','interview','documents','approval','preparation','first_shift','retention','custom')),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  virtual boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,stage_code)
);

ALTER TABLE recruiting_pipeline_stage_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiting_pipeline_stage_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON recruiting_pipeline_stage_settings
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_recruiting_pipeline_stage_settings
AFTER INSERT OR UPDATE OR DELETE ON recruiting_pipeline_stage_settings
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

INSERT INTO recruiting_pipeline_stage_settings(organization_id,stage_code,label,stage_kind,sort_order,active,virtual,is_system)
SELECT o.id,v.code,v.label,v.kind,v.sort_order,v.active,v.virtual,true
FROM organizations o
CROSS JOIN (VALUES
  ('new','Новый контакт','new_contact',10,true,false),
  ('contact','Интервью','interview',20,true,false),
  ('interview','Документы','documents',30,true,false),
  ('manager_review','Согласование','approval',35,false,false),
  ('approved','Согласован','approval',36,false,false),
  ('preparation','Подготовка к выходу','preparation',40,true,false),
  ('ready','Готов к выходу','preparation',45,false,false),
  ('started','Первый выход','first_shift',50,true,false),
  ('retention_7','7 дней','retention',60,true,true),
  ('retention_30','30 дней','retention',70,true,true)
) AS v(code,label,kind,sort_order,active,virtual)
ON CONFLICT (organization_id,stage_code) DO NOTHING;

-- Organization-specific source catalog. Historical source snapshots remain unchanged.
CREATE TABLE candidate_source_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('job_board','messenger','social','referral','partner','offline','internal','other')),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,name)
);
ALTER TABLE candidate_source_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_source_catalog FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_source_catalog
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_candidate_source_catalog
AFTER INSERT OR UPDATE OR DELETE ON candidate_source_catalog
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

INSERT INTO candidate_source_catalog(organization_id,name,kind,sort_order)
SELECT o.id,v.name,v.kind,v.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('Авито','job_board',10),
  ('hh.ru','job_board',20),
  ('Telegram','messenger',30),
  ('Рекомендация','referral',40),
  ('Партнёр / агентство','partner',50),
  ('Ручной ввод','other',100)
) AS v(name,kind,sort_order)
ON CONFLICT (organization_id,name) DO NOTHING;

INSERT INTO candidate_source_catalog(organization_id,name,kind,sort_order)
SELECT DISTINCT c.organization_id,btrim(c.source),'other',90
FROM candidates c
WHERE c.source IS NOT NULL AND btrim(c.source)<>''
ON CONFLICT (organization_id,name) DO NOTHING;

-- Headcount changes are explicit business events in addition to normal need versioning.
CREATE TABLE need_headcount_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  need_id uuid NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  previous_count integer NOT NULL CHECK (previous_count > 0),
  new_count integer NOT NULL CHECK (new_count > 0),
  delta integer NOT NULL,
  responsible_user_id uuid REFERENCES app_users(id),
  reason text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (delta = new_count - previous_count)
);
ALTER TABLE need_headcount_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE need_headcount_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON need_headcount_changes
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_need_headcount_changes
AFTER INSERT OR UPDATE OR DELETE ON need_headcount_changes
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE INDEX idx_need_headcount_changes_need ON need_headcount_changes(organization_id,need_id,created_at DESC);

-- Per-application responsibility is distinct from the original recruiter.
ALTER TABLE candidate_applications
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES app_users(id);
UPDATE candidate_applications
SET responsible_user_id=COALESCE(responsible_user_id,owner_user_id)
WHERE responsible_user_id IS NULL;

CREATE TABLE candidate_application_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES app_users(id),
  to_user_id uuid REFERENCES app_users(id),
  reason text,
  changed_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE candidate_application_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_application_assignment_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_application_assignment_history
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_candidate_application_assignment_history
AFTER INSERT OR UPDATE OR DELETE ON candidate_application_assignment_history
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Checklist metadata only; uploaded files stay in the shared document layer when connected.
CREATE TABLE candidate_application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  document_name text NOT NULL,
  status text NOT NULL DEFAULT 'missing' CHECK (status IN ('missing','requested','received','verified','not_required')),
  required boolean NOT NULL DEFAULT true,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by_user_id uuid REFERENCES app_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id,document_name)
);
ALTER TABLE candidate_application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_application_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_application_documents
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_candidate_application_documents
AFTER INSERT OR UPDATE OR DELETE ON candidate_application_documents
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE INDEX idx_candidate_application_documents_app ON candidate_application_documents(organization_id,application_id,sort_order);

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description)
VALUES
  ('recruiting.pipeline.configure','recruiting','pipeline','configure',false,'Настройка этапов воронки подбора'),
  ('recruiting.sources.configure','recruiting','source_catalog','configure',false,'Настройка источников кандидатов')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,p.capability,'allow','all_org','{}'::uuid[]
FROM role_templates r
CROSS JOIN (VALUES ('recruiting.pipeline.configure'),('recruiting.sources.configure')) p(capability)
WHERE r.code IN ('director','recruiting_manager')
ON CONFLICT DO NOTHING;

INSERT INTO process_role_permission_grants(organization_id,process_role_id,capability,effect,scope_type,scope_ids)
SELECT pr.organization_id,pr.id,p.capability,'allow','all_org','{}'::uuid[]
FROM process_roles pr
CROSS JOIN (VALUES ('recruiting.pipeline.configure'),('recruiting.sources.configure')) p(capability)
WHERE pr.code='recruiting-manager'
ON CONFLICT DO NOTHING;

COMMIT;
