BEGIN;

-- Internal requests extend the existing supply request workflow into one cross-functional
-- entry point for purchases, services, reimbursements and payments.
ALTER TABLE supply_requests
  ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS organization_unit_id uuid REFERENCES organization_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_code text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS urgency_reason text,
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS approved_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS actual_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS fulfilled_quantity numeric(14,3),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_reference text;

ALTER TABLE supply_requests DROP CONSTRAINT IF EXISTS supply_requests_category_code_check;
ALTER TABLE supply_requests ADD CONSTRAINT supply_requests_category_code_check CHECK (category_code IN (
  'workwear_ppe','tools_equipment','housing','transport','recruiting_advertising',
  'software_subscriptions','communications','medical','training','office_household',
  'rent','services','other'
));
ALTER TABLE supply_requests DROP CONSTRAINT IF EXISTS supply_requests_priority_check;
ALTER TABLE supply_requests ADD CONSTRAINT supply_requests_priority_check
  CHECK (priority IN ('normal','urgent','critical'));
ALTER TABLE supply_requests DROP CONSTRAINT IF EXISTS supply_requests_payment_status_check;
ALTER TABLE supply_requests ADD CONSTRAINT supply_requests_payment_status_check
  CHECK (payment_status IN ('not_required','pending','paid','cancelled'));
ALTER TABLE supply_requests DROP CONSTRAINT IF EXISTS supply_requests_amounts_check;
ALTER TABLE supply_requests ADD CONSTRAINT supply_requests_amounts_check CHECK (
  (approved_amount IS NULL OR approved_amount >= 0)
  AND (actual_amount IS NULL OR actual_amount >= 0)
  AND (fulfilled_quantity IS NULL OR fulfilled_quantity >= 0)
);
ALTER TABLE supply_requests DROP CONSTRAINT IF EXISTS supply_requests_urgency_reason_check;
ALTER TABLE supply_requests ADD CONSTRAINT supply_requests_urgency_reason_check CHECK (
  priority='normal' OR urgency_reason IS NOT NULL
);

UPDATE supply_requests r
SET legal_entity_id=o.legal_entity_id
FROM objects o
WHERE r.object_id=o.id AND r.legal_entity_id IS NULL AND o.legal_entity_id IS NOT NULL;

UPDATE supply_requests r
SET legal_entity_id=(
  SELECT le.id FROM legal_entities le
  WHERE le.organization_id=r.organization_id AND le.active
  ORDER BY le.is_primary DESC,le.name
  LIMIT 1
)
WHERE r.legal_entity_id IS NULL;

UPDATE supply_requests r
SET organization_unit_id=m.primary_org_unit_id
FROM organization_memberships m
WHERE m.organization_id=r.organization_id
  AND m.user_id=r.created_by_user_id
  AND m.status='active'
  AND r.organization_unit_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_supply_requests_internal_queue
  ON supply_requests(organization_id,status,payment_status,needed_by);
CREATE INDEX IF NOT EXISTS idx_supply_requests_legal_entity
  ON supply_requests(organization_id,legal_entity_id,status);
CREATE INDEX IF NOT EXISTS idx_supply_requests_org_unit
  ON supply_requests(organization_id,organization_unit_id,status);
CREATE INDEX IF NOT EXISTS idx_supply_requests_category
  ON supply_requests(organization_id,category_code,status);

-- The existing expense ledger becomes capable of holding company/department costs
-- that are not attributable to a single customer object (for example recruiting ads).
ALTER TABLE object_expenses
  ALTER COLUMN object_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS organization_unit_id uuid REFERENCES organization_units(id) ON DELETE SET NULL;

UPDATE object_expenses e
SET legal_entity_id=o.legal_entity_id
FROM objects o
WHERE e.object_id=o.id AND e.legal_entity_id IS NULL AND o.legal_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_object_expenses_context
  ON object_expenses(organization_id,legal_entity_id,organization_unit_id,expense_date DESC);

CREATE OR REPLACE FUNCTION validate_internal_request_context() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.object_id IS NOT NULL
     AND organization_reference_org('objects',NEW.object_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'object belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NEW.legal_entity_id IS NOT NULL
     AND organization_reference_org('legal_entities',NEW.legal_entity_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'legal entity belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NEW.organization_unit_id IS NOT NULL
     AND organization_reference_org('organization_units',NEW.organization_unit_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'organization unit belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supply_requests_context_integrity ON supply_requests;
CREATE TRIGGER supply_requests_context_integrity
BEFORE INSERT OR UPDATE OF organization_id,object_id,legal_entity_id,organization_unit_id ON supply_requests
FOR EACH ROW EXECUTE FUNCTION validate_internal_request_context();

CREATE OR REPLACE FUNCTION validate_expense_context() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.object_id IS NOT NULL
     AND organization_reference_org('objects',NEW.object_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'expense object belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NEW.legal_entity_id IS NOT NULL
     AND organization_reference_org('legal_entities',NEW.legal_entity_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'expense legal entity belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NEW.organization_unit_id IS NOT NULL
     AND organization_reference_org('organization_units',NEW.organization_unit_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'expense organization unit belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS object_expenses_context_integrity ON object_expenses;
CREATE TRIGGER object_expenses_context_integrity
BEFORE INSERT OR UPDATE OF organization_id,object_id,legal_entity_id,organization_unit_id ON object_expenses
FOR EACH ROW EXECUTE FUNCTION validate_expense_context();

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
  ('procurement.create','operations','supply_request','create',false,'Создание собственных внутренних заявок'),
  ('procurement.finance','finance','supply_request','pay',true,'Проведение оплаты внутренних заявок и фиксация фактического расхода')
ON CONFLICT (capability) DO NOTHING;

-- Preserve existing operational roles: anyone who could manage procurement can still create requests.
INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,'procurement.create','allow',
  CASE
    WHEN r.code IN ('director','operations_head','supply_specialist') THEN 'all_org'
    ELSE 'assigned_to_me'
  END,
  '{}'::uuid[]
FROM role_templates r
WHERE r.code IN ('director','operations_head','regional_manager','object_manager','supply_specialist')
ON CONFLICT DO NOTHING;

-- Regular office roles can create and follow their own requests without gaining execution rights.
INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,p.capability,'allow','own_created','{}'::uuid[]
FROM role_templates r
JOIN permission_definitions p ON p.capability IN ('procurement.read','procurement.create')
WHERE r.code IN ('commercial_lead','client_manager','recruitment_head','recruiter')
ON CONFLICT DO NOTHING;

-- Finance sees the cross-functional queue and records payment facts, but creating a request
-- does not grant authority over another employee's request.
INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,p.capability,'allow','all_org','{}'::uuid[]
FROM role_templates r
JOIN permission_definitions p ON p.capability IN ('procurement.read','procurement.finance')
WHERE r.code IN ('finance','finance_economist')
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,'procurement.create','allow','own_created','{}'::uuid[]
FROM role_templates r
WHERE r.code IN ('finance','finance_economist')
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,'procurement.finance','allow','all_org','{}'::uuid[]
FROM role_templates r
WHERE r.code='director'
ON CONFLICT DO NOTHING;

COMMIT;
