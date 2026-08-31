BEGIN;

-- Commercial request identity and lifecycle. Client is intentionally optional until known.
ALTER TABLE requests ALTER COLUMN client_company_id DROP NOT NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS request_number text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'new';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'open';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS archived_by_user_id uuid REFERENCES app_users(id);
ALTER TABLE requests ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS closed_by_user_id uuid REFERENCES app_users(id);
ALTER TABLE requests ADD COLUMN IF NOT EXISTS close_reason text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS close_comment text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS next_action_text text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS next_action_at timestamptz;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS source_kind text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS source_reference text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS contact_position text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS customer_inn text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS site_name text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS transport_access text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS nearest_transport text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS logistics_comment text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS project_indefinite boolean NOT NULL DEFAULT false;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS commercial_limits_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS provision_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS staffing_requirements_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS selected_scenario_id uuid;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS accepted_proposal_id uuid;

UPDATE requests
SET request_number = 'З-' || to_char(created_at, 'YYMM') || '-' || upper(substr(replace(id::text,'-',''),1,6))
WHERE request_number IS NULL;

ALTER TABLE requests ALTER COLUMN request_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_org_number ON requests(organization_id, request_number);
CREATE INDEX IF NOT EXISTS idx_requests_org_stage ON requests(organization_id, stage, archived_at);

ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS qualification text;
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS experience_text text;
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS salary_target numeric(14,2);
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS salary_unit text;
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS schedule_type text;
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS starts_at time;
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS ends_at time;
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS presence_hours numeric(7,2);
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS paid_hours numeric(7,2);
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS lunch_minutes integer;
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS lunch_paid boolean;
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS night_hours numeric(7,2);
ALTER TABLE request_roles ADD COLUMN IF NOT EXISTS overtime_rule text;

-- Standalone calculations are first-class and may be linked to a request later.
ALTER TABLE calculations ALTER COLUMN request_id DROP NOT NULL;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS calculation_number text;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'request';
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS linked_at timestamptz;

UPDATE calculations
SET calculation_number = 'Р-' || to_char(created_at, 'YYMM') || '-' || upper(substr(replace(id::text,'-',''),1,6))
WHERE calculation_number IS NULL;
ALTER TABLE calculations ALTER COLUMN calculation_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_calculations_org_number ON calculations(organization_id, calculation_number);
CREATE INDEX IF NOT EXISTS idx_calculations_origin_request ON calculations(organization_id, origin, request_id);

-- A scenario can represent an aggregate calculation, therefore request role is optional.
ALTER TABLE calculation_scenarios ALTER COLUMN request_role_id DROP NOT NULL;
ALTER TABLE calculation_scenarios ADD COLUMN IF NOT EXISTS scenario_number integer NOT NULL DEFAULT 1;
ALTER TABLE calculation_scenarios ADD COLUMN IF NOT EXISTS parent_scenario_id uuid REFERENCES calculation_scenarios(id);
ALTER TABLE calculation_scenarios ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE calculation_scenarios ADD COLUMN IF NOT EXISTS lock_reason text;
ALTER TABLE calculation_scenarios ADD COLUMN IF NOT EXISTS calculation_mode text NOT NULL DEFAULT 'target_margin';
ALTER TABLE calculation_scenarios ADD COLUMN IF NOT EXISTS client_limit numeric(14,2);
ALTER TABLE calculation_scenarios ADD COLUMN IF NOT EXISTS client_limit_vat_mode text;
ALTER TABLE calculation_scenarios ADD COLUMN IF NOT EXISTS risk_notes text;
DROP INDEX IF EXISTS one_accepted_scenario_per_role;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scenario_version ON calculation_scenarios(calculation_id, scenario_number);

CREATE TABLE calculation_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid REFERENCES requests(id) ON DELETE CASCADE,
  scenario_id uuid NOT NULL REFERENCES calculation_scenarios(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revision_requested')),
  requested_by_user_id uuid NOT NULL REFERENCES app_users(id),
  assigned_to_user_id uuid REFERENCES app_users(id),
  decided_by_user_id uuid REFERENCES app_users(id),
  comment text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calculation_approvals_request ON calculation_approvals(organization_id, request_id, created_at DESC);

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS proposal_number text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS valid_until date;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sent_by_user_id uuid REFERENCES app_users(id);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS client_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS parent_proposal_id uuid REFERENCES proposals(id);
UPDATE proposals SET proposal_number = 'КП-' || to_char(created_at, 'YYMM') || '-' || upper(substr(replace(id::text,'-',''),1,6)) WHERE proposal_number IS NULL;
ALTER TABLE proposals ALTER COLUMN proposal_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_proposals_org_number ON proposals(organization_id, proposal_number);

ALTER TABLE comments ADD COLUMN IF NOT EXISTS comment_type text NOT NULL DEFAULT 'comment';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client'));

CREATE TABLE request_public_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid REFERENCES requests(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('create','complete')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commercial_rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  version integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  rules_json jsonb NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name, version)
);

ALTER TABLE calculation_rule_versions ADD COLUMN IF NOT EXISTS commercial_rule_set_id uuid REFERENCES commercial_rule_sets(id);
ALTER TABLE rate_reference_entries ADD COLUMN IF NOT EXISTS staffing_mode text;
ALTER TABLE rate_reference_entries ADD COLUMN IF NOT EXISTS schedule_type text;
ALTER TABLE rate_reference_entries ADD COLUMN IF NOT EXISTS housing_included boolean;
ALTER TABLE rate_reference_entries ADD COLUMN IF NOT EXISTS client_offer_rate numeric(14,2);
ALTER TABLE rate_reference_entries ADD COLUMN IF NOT EXISTS object_fact_rate numeric(14,2);
ALTER TABLE rate_reference_entries ADD COLUMN IF NOT EXISTS object_fact_margin_pct numeric(7,3);
ALTER TABLE rate_reference_entries ADD COLUMN IF NOT EXISTS season text;

ALTER TABLE objects ADD COLUMN IF NOT EXISTS accepted_proposal_id uuid REFERENCES proposals(id);
ALTER TABLE objects ADD COLUMN IF NOT EXISTS accepted_scenario_id uuid REFERENCES calculation_scenarios(id);
ALTER TABLE objects ADD COLUMN IF NOT EXISTS source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE requests ADD CONSTRAINT requests_selected_scenario_fk FOREIGN KEY (selected_scenario_id) REFERENCES calculation_scenarios(id);
ALTER TABLE requests ADD CONSTRAINT requests_accepted_proposal_fk FOREIGN KEY (accepted_proposal_id) REFERENCES proposals(id);

-- Tenant policies for new tables.
ALTER TABLE calculation_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON calculation_approvals USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id());
ALTER TABLE request_public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_public_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON request_public_links USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id());
ALTER TABLE commercial_rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_rule_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commercial_rule_sets USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id());

-- Significant commercial changes join the existing system audit mechanism.
CREATE TRIGGER audit_requests AFTER INSERT OR UPDATE OR DELETE ON requests FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_calculation_approvals AFTER INSERT OR UPDATE OR DELETE ON calculation_approvals FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_proposals AFTER INSERT OR UPDATE OR DELETE ON proposals FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_commercial_rule_sets AFTER INSERT OR UPDATE OR DELETE ON commercial_rule_sets FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- New capabilities are additive; existing role grants remain intact.
INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
('sales.request.edit','sales','request','edit',false,'Изменение заявки'),
('sales.request.archive','sales','request','archive',false,'Архивирование и восстановление заявки'),
('sales.request.delete_draft','sales','request','delete_draft',false,'Удаление пустого ошибочного черновика'),
('sales.request.margin.read','sales','request','margin.read',true,'Просмотр внутренней маржи заявки'),
('sales.request.public_link.manage','sales','request','public_link.manage',false,'Управление публичными ссылками заявки'),
('calculation.approval.read','calculation','approval','read',false,'Просмотр согласований расчёта'),
('calculation.approval.decide','calculation','approval','decide',true,'Решение по согласованию расчёта'),
('sales.proposal.read','sales','proposal','read',false,'Просмотр коммерческих предложений'),
('sales.proposal.create','sales','proposal','create',false,'Создание версии коммерческого предложения'),
('sales.proposal.send','sales','proposal','send',false,'Отправка коммерческого предложения'),
('sales.proposal.accept','sales','proposal','accept',true,'Фиксация принятого коммерческого предложения'),
('calculation.rules.manage','calculation','rules','manage',true,'Управление нормативами и правилами')
ON CONFLICT (capability) DO NOTHING;

-- System role templates receive conservative defaults matching their existing responsibility.
INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type)
SELECT rt.organization_id,rt.id,p.capability,'allow','all_org'
FROM role_templates rt
CROSS JOIN (VALUES
 ('sales.request.edit'),('sales.request.archive'),('sales.request.margin.read'),('sales.request.public_link.manage'),
 ('calculation.approval.read'),('sales.proposal.read'),('sales.proposal.create'),('sales.proposal.send')
) p(capability)
WHERE rt.code IN ('admin','owner','commercial_manager','sales_manager')
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type)
SELECT rt.organization_id,rt.id,p.capability,'allow','all_org'
FROM role_templates rt
CROSS JOIN (VALUES ('calculation.approval.decide'),('sales.proposal.accept'),('calculation.rules.manage'),('sales.request.delete_draft')) p(capability)
WHERE rt.code IN ('admin','owner','commercial_director','director')
ON CONFLICT DO NOTHING;

COMMIT;
