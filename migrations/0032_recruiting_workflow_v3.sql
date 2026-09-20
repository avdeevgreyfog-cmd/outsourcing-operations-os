BEGIN;

-- Recruiting workflow v3:
-- stage-specific actions, editable organization document standards,
-- separate clearance stage, arrival/housing preparation and structured action analytics.

ALTER TABLE recruiting_funnel_stages DROP CONSTRAINT IF EXISTS recruiting_funnel_stages_code_check;
ALTER TABLE recruiting_funnel_stages ADD CONSTRAINT recruiting_funnel_stages_code_check
  CHECK (code IN ('new','interview','documents','clearance','preparation','first_shift','retention_7','retention_30'));
ALTER TABLE recruiting_funnel_stages DROP CONSTRAINT IF EXISTS recruiting_funnel_stages_system_type_check;
ALTER TABLE recruiting_funnel_stages ADD CONSTRAINT recruiting_funnel_stages_system_type_check
  CHECK (system_type IN ('intake','qualification','documents','clearance','preparation','start','retention','retention_final'));

UPDATE recruiting_funnel_stages
SET label='Документы для оформления'
WHERE code='documents' AND label='Документы';

UPDATE recruiting_funnel_stages SET sort_order=50 WHERE code='preparation';
UPDATE recruiting_funnel_stages SET sort_order=60 WHERE code='first_shift';
UPDATE recruiting_funnel_stages SET sort_order=70 WHERE code='retention_7';
UPDATE recruiting_funnel_stages SET sort_order=80 WHERE code='retention_30';

INSERT INTO recruiting_funnel_stages(organization_id,code,label,sort_order,system_type)
SELECT o.id,'clearance','Оформление и допуски',40,'clearance'
FROM organizations o
ON CONFLICT (organization_id,code) DO NOTHING;

ALTER TABLE recruiting_document_types
  ADD COLUMN IF NOT EXISTS group_type text NOT NULL DEFAULT 'employment',
  ADD COLUMN IF NOT EXISTS default_provider text NOT NULL DEFAULT 'candidate',
  ADD COLUMN IF NOT EXISTS default_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE recruiting_document_types DROP CONSTRAINT IF EXISTS recruiting_document_types_group_type_check;
ALTER TABLE recruiting_document_types ADD CONSTRAINT recruiting_document_types_group_type_check
  CHECK (group_type IN ('employment','clearance'));
ALTER TABLE recruiting_document_types DROP CONSTRAINT IF EXISTS recruiting_document_types_default_provider_check;
ALTER TABLE recruiting_document_types ADD CONSTRAINT recruiting_document_types_default_provider_check
  CHECK (default_provider IN ('candidate','company','client'));

UPDATE recruiting_document_types SET group_type='employment',default_provider='candidate'
WHERE code IN ('passport','snils','inn','bank_details');
UPDATE recruiting_document_types SET group_type='clearance',default_provider='company'
WHERE code='medical';
UPDATE recruiting_document_types SET group_type='clearance',default_provider='candidate'
WHERE code='qualification';

INSERT INTO recruiting_document_types(organization_id,code,name,group_type,default_provider,default_required,sort_order)
SELECT o.id,v.code,v.name,v.group_type,v.provider,v.required,v.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('registration','Регистрация','employment','candidate',false,45),
  ('military_id','Военный билет / документ воинского учёта','employment','candidate',false,46),
  ('medical_book','Медицинская книжка','clearance','company',false,55),
  ('medical_exam','Медицинская комиссия','clearance','company',false,56),
  ('training','Обучение / аттестация','clearance','company',false,70),
  ('site_pass','Пропуск на объект','clearance','client',false,80)
) AS v(code,name,group_type,provider,required,sort_order)
ON CONFLICT (organization_id,code) DO NOTHING;

ALTER TABLE need_document_requirements
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'candidate';
ALTER TABLE need_document_requirements DROP CONSTRAINT IF EXISTS need_document_requirements_provider_check;
ALTER TABLE need_document_requirements ADD CONSTRAINT need_document_requirements_provider_check
  CHECK (provider IN ('candidate','company','client'));
UPDATE need_document_requirements ndr
SET provider=dt.default_provider
FROM recruiting_document_types dt
WHERE dt.id=ndr.document_type_id AND ndr.provider='candidate' AND dt.default_provider<>'candidate';

ALTER TABLE candidate_application_documents DROP CONSTRAINT IF EXISTS candidate_application_documents_status_check;
ALTER TABLE candidate_application_documents ADD CONSTRAINT candidate_application_documents_status_check
  CHECK (status IN ('missing','requested','received','verified','rejected','not_required','to_prepare','in_progress','ready'));

ALTER TABLE candidate_applications
  ADD COLUMN IF NOT EXISTS planned_arrival_at timestamptz;

CREATE TABLE candidate_action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  stage text NOT NULL,
  action_code text NOT NULL,
  outcome_code text,
  comment text,
  next_action_at timestamptz,
  performed_by_user_id uuid NOT NULL REFERENCES app_users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE candidate_action_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_action_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_action_events
  USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_candidate_action_events AFTER INSERT OR UPDATE OR DELETE ON candidate_action_events
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE INDEX idx_candidate_action_events_application ON candidate_action_events(application_id,created_at DESC);
CREATE INDEX idx_candidate_action_events_code ON candidate_action_events(organization_id,stage,action_code,created_at DESC);

INSERT INTO candidate_exit_reasons(organization_id,code,name,kind,sort_order,is_system)
SELECT o.id,v.code,v.name,v.kind,v.sort_order,true
FROM organizations o
CROSS JOIN (VALUES
  ('invalid_contact','Некорректный контакт','rejected',140),
  ('duplicate','Дубликат контакта','rejected',150),
  ('alternative_need','Переведён на другую вакансию','rejected',160),
  ('not_admitted','Не допущен к работе','no_show',170),
  ('intoxication','Не допущен: признаки опьянения','no_show',180),
  ('medical_restriction','Не допущен по медицинским ограничениям','no_show',190)
) AS v(code,name,kind,sort_order)
ON CONFLICT (organization_id,code) DO NOTHING;

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description)
VALUES ('recruiting.documents.manage','recruiting','document_standard','manage',false,'Настройка базового набора документов подбора')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type)
SELECT r.organization_id,r.id,'recruiting.documents.manage','allow','all_org'
FROM role_templates r
WHERE r.code IN ('director','recruiting_manager')
ON CONFLICT DO NOTHING;

INSERT INTO process_role_permission_grants(organization_id,process_role_id,capability,effect,scope_type)
SELECT pr.organization_id,pr.id,'recruiting.documents.manage','allow','all_org'
FROM process_roles pr
WHERE pr.code='recruiting-manager'
ON CONFLICT (process_role_id,capability,effect,scope_type) DO NOTHING;

COMMIT;
