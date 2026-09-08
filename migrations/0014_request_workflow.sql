BEGIN;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS workflow_stage_code text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS loss_reason text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE TABLE IF NOT EXISTS request_stage_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL,
  color text NOT NULL DEFAULT 'neutral',
  active boolean NOT NULL DEFAULT true,
  terminal_kind text NOT NULL DEFAULT 'active' CHECK (terminal_kind IN ('active','agreed','not_agreed')),
  system_locked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,code)
);

CREATE TABLE IF NOT EXISTS request_observers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  added_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id,user_id)
);

CREATE TABLE IF NOT EXISTS request_intake_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  last_opened_at timestamptz,
  submission_count integer NOT NULL DEFAULT 0 CHECK (submission_count>=0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_request_intake_one_active_org_link
  ON request_intake_links(organization_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_requests_workflow_stage
  ON requests(organization_id,workflow_stage_code,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_observers_user
  ON request_observers(organization_id,user_id,request_id);

INSERT INTO request_stage_definitions(organization_id,code,label,sort_order,color,terminal_kind,system_locked)
SELECT o.id,v.code,v.label,v.sort_order,v.color,v.terminal_kind,true
FROM organizations o CROSS JOIN (VALUES
  ('new','Новая',10,'neutral','active'),
  ('clarification','Уточнение условий',20,'blue','active'),
  ('ready_calc','Готова к расчёту',30,'cyan','active'),
  ('calculation','Расчёт',40,'violet','active'),
  ('proposal_prep','Подготовка КП',50,'amber','active'),
  ('proposal_client','КП у заказчика',60,'orange','active'),
  ('negotiation','Переговоры / доработка',70,'pink','active'),
  ('agreed','Согласовано',80,'green','agreed'),
  ('not_agreed','Не согласовано',90,'red','not_agreed')
) v(code,label,sort_order,color,terminal_kind)
ON CONFLICT (organization_id,code) DO NOTHING;

UPDATE requests SET workflow_stage_code=CASE
  WHEN status IN ('accepted','launched') THEN 'agreed'
  WHEN lost_at IS NOT NULL THEN 'not_agreed'
  ELSE COALESCE(NULLIF(workflow_stage_code,''),'new')
END;

ALTER TABLE request_stage_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_stage_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE request_observers ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_observers FORCE ROW LEVEL SECURITY;
ALTER TABLE request_intake_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON request_stage_definitions;
CREATE POLICY tenant_isolation ON request_stage_definitions
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());
DROP POLICY IF EXISTS tenant_isolation ON request_observers;
CREATE POLICY tenant_isolation ON request_observers
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());
DROP POLICY IF EXISTS tenant_isolation ON request_intake_links;
CREATE POLICY tenant_isolation ON request_intake_links
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

DROP TRIGGER IF EXISTS audit_request_roles ON request_roles;
CREATE TRIGGER audit_request_roles AFTER INSERT OR UPDATE OR DELETE ON request_roles FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_request_observers ON request_observers;
CREATE TRIGGER audit_request_observers AFTER INSERT OR UPDATE OR DELETE ON request_observers FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_request_stage_definitions ON request_stage_definitions;
CREATE TRIGGER audit_request_stage_definitions AFTER INSERT OR UPDATE OR DELETE ON request_stage_definitions FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
