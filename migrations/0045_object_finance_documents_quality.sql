BEGIN;

-- Managers need read-only visibility into employee accruals/payments for assigned objects,
-- while daily first-shift confirmations use a narrower capability than full finance editing.
INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
('finance.daily_payment.confirm','finance','daily_payment','confirm',true,'Confirm daily first-shift payments for workers on assigned objects')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,c.capability,'allow',CASE WHEN r.code='director' THEN 'all_org' ELSE 'assigned_to_me' END,'{}'::uuid[]
FROM role_templates r
CROSS JOIN (VALUES
  ('worker.compensation.read'),
  ('finance.worker_accrual.read'),
  ('finance.payments.read'),
  ('finance.daily_payment.confirm')
) c(capability)
WHERE r.code IN ('director','object_manager','operations_head','regional_manager')
ON CONFLICT DO NOTHING;

INSERT INTO position_permission_grants(organization_id,position_id,capability,effect,scope_type,scope_ids)
SELECT p.organization_id,p.id,c.capability,'allow','assigned_to_me','{}'::uuid[]
FROM positions p
CROSS JOIN (VALUES
  ('worker.compensation.read'),
  ('finance.worker_accrual.read'),
  ('finance.payments.read'),
  ('finance.daily_payment.confirm')
) c(capability)
WHERE p.code IN ('object-manager','object_manager','operations-head','operations_head','regional-manager','regional_manager')
ON CONFLICT DO NOTHING;

ALTER TABLE advance_payments
  ADD COLUMN IF NOT EXISTS payment_purpose text NOT NULL DEFAULT 'advance',
  ADD COLUMN IF NOT EXISTS work_date date,
  ADD COLUMN IF NOT EXISTS confirmed_by_user_id uuid REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE advance_payments DROP CONSTRAINT IF EXISTS advance_payments_payment_purpose_check;
ALTER TABLE advance_payments ADD CONSTRAINT advance_payments_payment_purpose_check
  CHECK (payment_purpose IN ('advance','daily_shift','other'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_shift_payment
  ON advance_payments(worker_id,object_id,work_date)
  WHERE payment_purpose='daily_shift' AND work_date IS NOT NULL;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS financial_effect_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS financial_effect_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS financial_effect_basis text;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_financial_effect_status_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_financial_effect_status_check
  CHECK (financial_effect_status IN ('none','proposed','approved','rejected','applied'));
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_financial_effect_amount_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_financial_effect_amount_check
  CHECK (financial_effect_amount IS NULL OR financial_effect_amount>=0);
ALTER TABLE pay_adjustments ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES incidents(id);
CREATE INDEX IF NOT EXISTS idx_pay_adjustments_incident ON pay_adjustments(organization_id,incident_id) WHERE incident_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS object_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  file_asset_id uuid REFERENCES file_assets(id),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  document_number text,
  source_url text,
  status text NOT NULL DEFAULT 'active',
  valid_from date,
  expires_at date,
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT object_documents_category_check CHECK (category IN ('client_instruction','access','ppe','safety','act','template','client','other')),
  CONSTRAINT object_documents_status_check CHECK (status IN ('active','needs_update','archived'))
);
CREATE INDEX IF NOT EXISTS idx_object_documents_object ON object_documents(organization_id,object_id,status,expires_at);
ALTER TABLE object_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON object_documents;
CREATE POLICY tenant_isolation ON object_documents
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());
DROP TRIGGER IF EXISTS audit_object_documents ON object_documents;
CREATE TRIGGER audit_object_documents AFTER INSERT OR UPDATE OR DELETE ON object_documents FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;