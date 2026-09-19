BEGIN;

-- Generic analytics metric preferences. The metric definition/formula stays in code;
-- managers only control visibility, order, display label and an optional target.
CREATE TABLE analytics_metric_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_code text NOT NULL,
  scope_type text NOT NULL DEFAULT 'organization' CHECK (scope_type IN ('organization','team','user')),
  scope_id uuid NOT NULL,
  metric_key text NOT NULL,
  display_label text,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  visible boolean NOT NULL DEFAULT true,
  target_value numeric,
  updated_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,module_code,scope_type,scope_id,metric_key)
);

ALTER TABLE analytics_metric_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_metric_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics_metric_preferences
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_analytics_metric_preferences
  AFTER INSERT OR UPDATE OR DELETE ON analytics_metric_preferences
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE INDEX idx_analytics_metric_preferences_scope
  ON analytics_metric_preferences(organization_id,module_code,scope_type,scope_id,position);

-- Normalized candidate exit reasons. Free-text comment remains available separately.
CREATE TABLE candidate_exit_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'both' CHECK (kind IN ('rejected','no_show','both')),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,code)
);

ALTER TABLE candidate_exit_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_exit_reasons FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_exit_reasons
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_candidate_exit_reasons
  AFTER INSERT OR UPDATE OR DELETE ON candidate_exit_reasons
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE INDEX idx_candidate_exit_reasons_active
  ON candidate_exit_reasons(organization_id,kind,active,sort_order);

ALTER TABLE candidate_applications
  ADD COLUMN IF NOT EXISTS rejection_reason_code text;
ALTER TABLE candidate_stage_history
  ADD COLUMN IF NOT EXISTS reason_code text;

INSERT INTO candidate_exit_reasons(organization_id,code,name,kind,sort_order,is_system)
SELECT o.id,v.code,v.name,v.kind,v.sort_order,true
FROM organizations o
CROSS JOIN (VALUES
  ('pay','Не устроила зарплата','rejected',10),
  ('schedule','Не устроил график','rejected',20),
  ('housing','Не устроило проживание','rejected',30),
  ('location','Не устроила локация','rejected',40),
  ('other_offer','Нашёл другую работу','rejected',50),
  ('security','Не прошёл проверку / СБ','rejected',60),
  ('documents','Проблемы с документами','rejected',70),
  ('no_contact','Не выходит на связь','both',80),
  ('changed_mind','Передумал','both',90),
  ('client_rejected','Отказ клиента / объекта','rejected',100),
  ('transport','Проблема с проездом / логистикой','no_show',110),
  ('shift_confirm','Не подтвердил выход / смену','no_show',120),
  ('no_show','Не вышел без предупреждения','no_show',130),
  ('other','Другое','both',999)
) AS v(code,name,kind,sort_order)
ON CONFLICT (organization_id,code) DO NOTHING;

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description)
VALUES ('recruiting.analytics.configure','recruiting','analytics','configure',false,'Настройка витрины метрик аналитики подбора')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,'recruiting.analytics.configure','all_org'
FROM role_templates r
WHERE r.code IN ('director','recruiting_manager')
ON CONFLICT DO NOTHING;

COMMIT;
