BEGIN;

-- Recruiting workspace v2:
-- configurable organization labels/order for stable workflow stages,
-- organization source directory, need quantity history and document checklist.

CREATE TABLE recruiting_funnel_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  system_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code),
  CHECK (code IN ('new','interview','documents','preparation','first_shift','retention_7','retention_30')),
  CHECK (system_type IN ('intake','qualification','documents','preparation','start','retention','retention_final'))
);

INSERT INTO recruiting_funnel_stages(organization_id,code,label,sort_order,system_type)
SELECT o.id,v.code,v.label,v.sort_order,v.system_type
FROM organizations o
CROSS JOIN (VALUES
  ('new','Новый контакт',10,'intake'),
  ('interview','Интервью',20,'qualification'),
  ('documents','Документы',30,'documents'),
  ('preparation','Подготовка к выходу',40,'preparation'),
  ('first_shift','Первый выход',50,'start'),
  ('retention_7','7 дней',60,'retention'),
  ('retention_30','30 дней',70,'retention_final')
) AS v(code,label,sort_order,system_type)
ON CONFLICT (organization_id,code) DO NOTHING;

CREATE TABLE recruiting_candidate_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code),
  CHECK (kind IN ('job_site','social','referral','partner','offline','internal','other'))
);

INSERT INTO recruiting_candidate_sources(organization_id,code,name,kind,sort_order)
SELECT o.id,v.code,v.name,v.kind,v.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('avito','Авито','job_site',10),
  ('hh','hh.ru','job_site',20),
  ('telegram','Telegram','social',30),
  ('referral','Рекомендация','referral',40),
  ('partner','Партнёр / подрядчик','partner',50),
  ('other','Другое','other',999)
) AS v(code,name,kind,sort_order)
ON CONFLICT (organization_id,code) DO NOTHING;

CREATE TABLE need_quantity_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  need_id uuid NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  old_count integer,
  new_count integer NOT NULL CHECK (new_count > 0),
  delta integer NOT NULL,
  reason text,
  changed_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO need_quantity_changes(organization_id,need_id,old_count,new_count,delta,reason,changed_by_user_id,created_at)
SELECT n.organization_id,n.id,NULL,n.count_required,n.count_required,'Исходный объём потребности',
       COALESCE(n.created_by_user_id,(SELECT m.user_id FROM organization_memberships m WHERE m.organization_id=n.organization_id AND m.status='active' ORDER BY m.created_at LIMIT 1)),
       n.created_at
FROM needs n
WHERE NOT EXISTS (SELECT 1 FROM need_quantity_changes q WHERE q.need_id=n.id);

CREATE TABLE recruiting_document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code)
);

INSERT INTO recruiting_document_types(organization_id,code,name,sort_order)
SELECT o.id,v.code,v.name,v.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('passport','Паспорт',10),
  ('snils','СНИЛС',20),
  ('inn','ИНН',30),
  ('bank_details','Банковские реквизиты',40),
  ('medical','Медицинские документы',50),
  ('qualification','Удостоверение / допуск',60)
) AS v(code,name,sort_order)
ON CONFLICT (organization_id,code) DO NOTHING;

CREATE TABLE need_document_requirements (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  need_id uuid NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES recruiting_document_types(id) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true,
  note text,
  PRIMARY KEY(need_id,document_type_id)
);

CREATE TABLE candidate_application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES recruiting_document_types(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'missing' CHECK (status IN ('missing','requested','received','verified','rejected','not_required')),
  note text,
  updated_by_user_id uuid REFERENCES app_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(application_id,document_type_id)
);

-- Convert current active state to the new stable stage taxonomy.
UPDATE candidate_applications SET stage='interview' WHERE stage='contact';
UPDATE candidate_applications SET stage='documents' WHERE stage IN ('manager_review','approved');
UPDATE candidate_applications SET stage='preparation' WHERE stage='ready';
UPDATE candidate_applications SET stage='first_shift' WHERE stage='started';

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
  ('recruiting.pipeline.configure','recruiting','pipeline','configure',false,'Настройка этапов воронки подбора'),
  ('recruiting.sources.manage','recruiting','source_directory','manage',false,'Управление справочником источников кандидатов')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type)
SELECT r.organization_id,r.id,p.capability,'allow','all_org'
FROM role_templates r
CROSS JOIN (VALUES ('recruiting.pipeline.configure'),('recruiting.sources.manage')) p(capability)
WHERE r.code IN ('director','recruiting_manager')
ON CONFLICT DO NOTHING;

INSERT INTO process_role_permission_grants(organization_id,process_role_id,capability,effect,scope_type)
SELECT pr.organization_id,pr.id,p.capability,'allow','all_org'
FROM process_roles pr
CROSS JOIN (VALUES ('recruiting.pipeline.configure'),('recruiting.sources.manage')) p(capability)
WHERE pr.code='recruiting-manager'
ON CONFLICT (process_role_id,capability,effect,scope_type) DO NOTHING;

ALTER TABLE recruiting_funnel_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiting_funnel_stages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON recruiting_funnel_stages USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE recruiting_candidate_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiting_candidate_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON recruiting_candidate_sources USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE need_quantity_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE need_quantity_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON need_quantity_changes USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE recruiting_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiting_document_types FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON recruiting_document_types USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE need_document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE need_document_requirements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON need_document_requirements USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE candidate_application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_application_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_application_documents USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());

CREATE TRIGGER audit_recruiting_funnel_stages AFTER INSERT OR UPDATE OR DELETE ON recruiting_funnel_stages FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_recruiting_candidate_sources AFTER INSERT OR UPDATE OR DELETE ON recruiting_candidate_sources FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_need_quantity_changes AFTER INSERT OR UPDATE OR DELETE ON need_quantity_changes FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_need_document_requirements AFTER INSERT OR UPDATE OR DELETE ON need_document_requirements FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_candidate_application_documents AFTER INSERT OR UPDATE OR DELETE ON candidate_application_documents FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE INDEX idx_recruiting_funnel_stages_order ON recruiting_funnel_stages(organization_id,active,sort_order);
CREATE INDEX idx_recruiting_candidate_sources_active ON recruiting_candidate_sources(organization_id,active,sort_order,name);
CREATE INDEX idx_need_quantity_changes_need ON need_quantity_changes(need_id,created_at DESC);
CREATE INDEX idx_candidate_application_documents_application ON candidate_application_documents(application_id,status);

COMMIT;
