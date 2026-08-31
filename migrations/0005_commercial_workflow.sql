BEGIN;

-- Commercial requests remain the central entity, but a known company is no longer required.
ALTER TABLE requests ALTER COLUMN client_company_id DROP NOT NULL;

CREATE SEQUENCE IF NOT EXISTS request_human_number_seq;

ALTER TABLE requests
  ADD COLUMN request_number text,
  ADD COLUMN commercial_stage text NOT NULL DEFAULT 'new',
  ADD COLUMN business_result text NOT NULL DEFAULT 'open',
  ADD COLUMN company_name_text text,
  ADD COLUMN inn_text text,
  ADD COLUMN contact_name text,
  ADD COLUMN contact_position text,
  ADD COLUMN contact_phone text,
  ADD COLUMN contact_email text,
  ADD COLUMN source text,
  ADD COLUMN site_name text,
  ADD COLUMN address_text text,
  ADD COLUMN city text,
  ADD COLUMN transport_access text,
  ADD COLUMN nearest_transport text,
  ADD COLUMN logistics_comment text,
  ADD COLUMN desired_client_rate numeric(14,2),
  ADD COLUMN max_client_rate numeric(14,2),
  ADD COLUMN client_rate_vat_mode text,
  ADD COLUMN proposed_worker_pay numeric(14,2),
  ADD COLUMN total_budget numeric(14,2),
  ADD COLUMN monthly_limit numeric(14,2),
  ADD COLUMN commercial_constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN agreed_client_rate numeric(14,2),
  ADD COLUMN next_action text,
  ADD COLUMN next_action_at timestamptz,
  ADD COLUMN close_reason text,
  ADD COLUMN close_comment text,
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by_user_id uuid REFERENCES app_users(id),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by_user_id uuid REFERENCES app_users(id),
  ADD COLUMN restored_at timestamptz,
  ADD COLUMN restored_by_user_id uuid REFERENCES app_users(id);

UPDATE requests
SET request_number = 'З-' || to_char(created_at, 'YYYY') || '-' || lpad(nextval('request_human_number_seq')::text, 6, '0')
WHERE request_number IS NULL;

UPDATE requests SET commercial_stage = CASE status
  WHEN 'draft' THEN 'new'
  WHEN 'calculated' THEN 'calculation'
  WHEN 'review' THEN 'approval'
  WHEN 'accepted' THEN 'accepted'
  ELSE 'new'
END;

ALTER TABLE requests ALTER COLUMN request_number SET NOT NULL;
ALTER TABLE requests
  ADD CONSTRAINT requests_org_number_unique UNIQUE (organization_id, request_number),
  ADD CONSTRAINT requests_commercial_stage_check CHECK (commercial_stage IN ('new','clarification','ready_for_calculation','calculation','approval','proposal_prepared','proposal_sent','negotiation','accepted')),
  ADD CONSTRAINT requests_business_result_check CHECK (business_result IN ('open','won','lost','paused')),
  ADD CONSTRAINT requests_nonnegative_commercial_values CHECK (
    COALESCE(desired_client_rate,0) >= 0 AND COALESCE(max_client_rate,0) >= 0 AND
    COALESCE(proposed_worker_pay,0) >= 0 AND COALESCE(total_budget,0) >= 0 AND
    COALESCE(monthly_limit,0) >= 0 AND COALESCE(agreed_client_rate,0) >= 0
  );

CREATE OR REPLACE FUNCTION assign_request_human_number() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.request_number IS NULL OR btrim(NEW.request_number) = '' THEN
    NEW.request_number := 'З-' || to_char(COALESCE(NEW.created_at, now()), 'YYYY') || '-' || lpad(nextval('request_human_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER request_human_number_before_insert
BEFORE INSERT ON requests FOR EACH ROW EXECUTE FUNCTION assign_request_human_number();

-- One request can contain multiple specialties and incomplete positions during the first call.
ALTER TABLE request_roles ALTER COLUMN specialty_id DROP NOT NULL;
ALTER TABLE request_roles
  ADD COLUMN specialty_name text,
  ADD COLUMN qualification text,
  ADD COLUMN experience_text text,
  ADD COLUMN salary_target numeric(14,2),
  ADD COLUMN schedule_type text,
  ADD COLUMN shift_start time,
  ADD COLUMN shift_end time,
  ADD COLUMN presence_hours numeric(7,2),
  ADD COLUMN paid_hours numeric(7,2),
  ADD COLUMN lunch_minutes integer,
  ADD COLUMN lunch_paid boolean,
  ADD COLUMN night_hours numeric(7,2),
  ADD COLUMN overtime_rule text,
  ADD CONSTRAINT request_roles_specialty_present CHECK (specialty_id IS NOT NULL OR NULLIF(btrim(specialty_name),'') IS NOT NULL),
  ADD CONSTRAINT request_roles_hours_nonnegative CHECK (
    COALESCE(presence_hours,0) >= 0 AND COALESCE(paid_hours,0) >= 0 AND COALESCE(night_hours,0) >= 0 AND COALESCE(lunch_minutes,0) >= 0
  );

-- Fast three-state provision matrix: client / us / not required. Economic parameters are structured.
CREATE TABLE request_provisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  code text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('client','ours','not_required')),
  amount numeric(14,2),
  unit text,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  comment text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, code),
  CHECK (amount IS NULL OR amount >= 0)
);

-- Human comments stay separate from system activity/audit and may attach to any commercial entity.
ALTER TABLE comments
  ADD COLUMN comment_type text NOT NULL DEFAULT 'comment',
  ADD COLUMN visibility text NOT NULL DEFAULT 'internal',
  ADD CONSTRAINT comments_type_check CHECK (comment_type IN ('comment','call','client_clarification','decision','internal_note')),
  ADD CONSTRAINT comments_visibility_check CHECK (visibility IN ('internal','client'));

-- A calculation may be created independently and linked to a request later.
ALTER TABLE calculations ALTER COLUMN request_id DROP NOT NULL;
ALTER TABLE calculations
  ADD COLUMN title text,
  ADD COLUMN source_kind text NOT NULL DEFAULT 'request',
  ADD COLUMN client_company_id uuid REFERENCES client_companies(id),
  ADD COLUMN region_id uuid REFERENCES regions(id),
  ADD CONSTRAINT calculations_source_kind_check CHECK (source_kind IN ('request','standalone')),
  ADD CONSTRAINT calculations_request_source_consistency CHECK (source_kind <> 'request' OR request_id IS NOT NULL);

UPDATE calculations c
SET title = COALESCE(r.title, 'Расчёт'), client_company_id = r.client_company_id, region_id = r.region_id
FROM requests r WHERE r.id = c.request_id;

ALTER TABLE calculation_scenarios ALTER COLUMN request_role_id DROP NOT NULL;
ALTER TABLE calculation_scenarios
  ADD COLUMN scenario_number integer,
  ADD COLUMN parent_scenario_id uuid REFERENCES calculation_scenarios(id),
  ADD COLUMN approval_comment text,
  ADD COLUMN purpose text;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY calculation_id ORDER BY created_at,id)::int AS n
  FROM calculation_scenarios
)
UPDATE calculation_scenarios cs SET scenario_number = ranked.n FROM ranked WHERE ranked.id = cs.id;
ALTER TABLE calculation_scenarios ALTER COLUMN scenario_number SET NOT NULL;
CREATE UNIQUE INDEX calculation_scenario_number_unique ON calculation_scenarios(calculation_id,scenario_number);

-- Approval is a workflow record around a calculation scenario, not a parallel CRM.
CREATE TABLE calculation_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  calculation_scenario_id uuid NOT NULL REFERENCES calculation_scenarios(id) ON DELETE CASCADE,
  round integer NOT NULL DEFAULT 1 CHECK (round > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','rework')),
  requested_by_user_id uuid NOT NULL REFERENCES app_users(id),
  assigned_to_user_id uuid REFERENCES app_users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by_user_id uuid REFERENCES app_users(id),
  decided_at timestamptz,
  comment text,
  decision_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (calculation_scenario_id, round)
);

-- Proposal versions retain a client-safe immutable payload once sent.
ALTER TABLE proposals
  ADD COLUMN client_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN valid_until date,
  ADD COLUMN sent_at timestamptz,
  ADD COLUMN sent_by_user_id uuid REFERENCES app_users(id),
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN accepted_by_user_id uuid REFERENCES app_users(id),
  ADD COLUMN supersedes_proposal_id uuid REFERENCES proposals(id),
  ADD COLUMN client_note text,
  ADD COLUMN internal_note text;

CREATE OR REPLACE FUNCTION prevent_sent_proposal_payload_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.sent_at IS NOT NULL OR OLD.status IN ('sent','accepted')) AND (
    NEW.scenario_ids IS DISTINCT FROM OLD.scenario_ids OR
    NEW.client_payload IS DISTINCT FROM OLD.client_payload OR
    NEW.total_value IS DISTINCT FROM OLD.total_value OR
    NEW.valid_until IS DISTINCT FROM OLD.valid_until
  ) THEN
    RAISE EXCEPTION 'Sent proposal payload is immutable; create a new proposal version instead';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER sent_proposal_payload_immutable
BEFORE UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION prevent_sent_proposal_payload_mutation();

-- Link the accepted commercial snapshot back to the request only after scenario/proposal tables exist.
ALTER TABLE requests
  ADD COLUMN selected_scenario_id uuid REFERENCES calculation_scenarios(id),
  ADD COLUMN accepted_proposal_id uuid REFERENCES proposals(id);

-- Safe public links are resolved before tenant context, like sessions. Only a hash is stored.
CREATE TABLE request_public_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid REFERENCES requests(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('new','supplement')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CHECK ((mode='supplement' AND request_id IS NOT NULL) OR mode='new')
);
CREATE INDEX idx_request_public_links_request ON request_public_links(organization_id,request_id,created_at DESC);

-- Central effective-dated commercial norms complement model-specific calculation_rule_versions.
CREATE TABLE commercial_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category text NOT NULL,
  version integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  rules_json jsonb NOT NULL,
  source text,
  verified boolean NOT NULL DEFAULT false,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, category, version),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Extend the rate knowledge base without deleting legacy columns.
ALTER TABLE rate_reference_entries
  ADD COLUMN gross_net text,
  ADD COLUMN comment text,
  ADD COLUMN source_kind text NOT NULL DEFAULT 'market',
  ADD COLUMN schedule_code text,
  ADD COLUMN workforce_mode text,
  ADD COLUMN housing_included boolean,
  ADD COLUMN seasonality text,
  ADD COLUMN worker_pay numeric(14,2),
  ADD COLUMN client_offer_rate numeric(14,2),
  ADD COLUMN actual_object_rate numeric(14,2),
  ADD COLUMN actual_margin_pct numeric(7,3),
  ADD COLUMN source_calculation_scenario_id uuid REFERENCES calculation_scenarios(id),
  ADD COLUMN source_object_id uuid REFERENCES objects(id),
  ADD CONSTRAINT rate_reference_source_kind_check CHECK (source_kind IN ('market','calculation','object_fact'));
UPDATE rate_reference_entries
SET gross_net = CASE pay_semantics WHEN 'net' THEN 'net' WHEN 'gross' THEN 'gross' ELSE pay_semantics END,
    comment = notes
WHERE gross_net IS NULL OR comment IS NULL;

-- New tenant tables receive the same RLS contract as the existing data model.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['request_provisions','calculation_approvals','commercial_rule_versions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id())', table_name);
  END LOOP;
END $$;

-- Business-critical commercial changes are auditable before/after in addition to human-readable activity events.
CREATE TRIGGER audit_requests AFTER INSERT OR UPDATE OR DELETE ON requests FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_request_roles AFTER INSERT OR UPDATE OR DELETE ON request_roles FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_request_provisions AFTER INSERT OR UPDATE OR DELETE ON request_provisions FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_calculation_approvals AFTER INSERT OR UPDATE OR DELETE ON calculation_approvals FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_proposals AFTER INSERT OR UPDATE OR DELETE ON proposals FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_commercial_rule_versions AFTER INSERT OR UPDATE OR DELETE ON commercial_rule_versions FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE INDEX idx_requests_commercial_stage ON requests(organization_id,archived_at,commercial_stage,updated_at DESC);
CREATE INDEX idx_requests_next_action ON requests(organization_id,owner_user_id,next_action_at) WHERE archived_at IS NULL;
CREATE INDEX idx_request_roles_request ON request_roles(organization_id,request_id);
CREATE INDEX idx_request_provisions_request ON request_provisions(organization_id,request_id);
CREATE INDEX idx_calculations_source ON calculations(organization_id,source_kind,request_id,created_at DESC);
CREATE INDEX idx_calculation_approvals_status ON calculation_approvals(organization_id,status,assigned_to_user_id,requested_at DESC);
CREATE INDEX idx_proposals_request_version ON proposals(organization_id,request_id,version DESC);
CREATE INDEX idx_commercial_rules_effective ON commercial_rule_versions(organization_id,category,effective_from DESC);
CREATE INDEX idx_rate_reference_source_kind ON rate_reference_entries(organization_id,source_kind,source_date DESC);

-- Explicit commercial capabilities. Existing request/calculation permissions remain valid.
INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive) VALUES
  ('sales.request.archive','sales','request','archive',false),
  ('sales.request.duplicate','sales','request','duplicate',false),
  ('sales.request.delete','sales','request','delete',false),
  ('sales.proposal.read','sales','proposal','read',false),
  ('sales.proposal.create','sales','proposal','create',false),
  ('sales.proposal.send','sales','proposal','send',false),
  ('sales.public_form.manage','sales','public_form','manage',false),
  ('calculation.rules.read','calculation','rules','read',false),
  ('calculation.rules.edit','calculation','rules','edit',false),
  ('operations.object.create','operations','object','create',false)
ON CONFLICT (capability) DO NOTHING;

-- Director receives all new capabilities organization-wide.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT rt.organization_id,rt.id,p.capability,'all_org'
FROM role_templates rt
CROSS JOIN (VALUES
 ('sales.request.archive'),('sales.request.duplicate'),('sales.request.delete'),('sales.proposal.read'),('sales.proposal.create'),('sales.proposal.send'),('sales.public_form.manage'),('calculation.rules.read'),('calculation.rules.edit'),('operations.object.create')
) p(capability)
WHERE rt.code='director'
ON CONFLICT DO NOTHING;

-- Sales owns the commercial workflow; destructive physical deletion stays director-only.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT rt.organization_id,rt.id,p.capability,'team'
FROM role_templates rt
CROSS JOIN (VALUES
 ('sales.request.archive'),('sales.request.duplicate'),('sales.proposal.read'),('sales.proposal.create'),('sales.proposal.send'),('sales.public_form.manage'),('calculation.rules.read'),('operations.object.create')
) p(capability)
WHERE rt.code='sales_manager'
ON CONFLICT DO NOTHING;

-- Economist sees proposals and owns economic rules; approval stays on the existing calculation.scenario.approve capability.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT rt.organization_id,rt.id,p.capability,'all_org'
FROM role_templates rt
CROSS JOIN (VALUES ('sales.proposal.read'),('calculation.rules.read'),('calculation.rules.edit')) p(capability)
WHERE rt.code='economist'
ON CONFLICT DO NOTHING;

COMMIT;
