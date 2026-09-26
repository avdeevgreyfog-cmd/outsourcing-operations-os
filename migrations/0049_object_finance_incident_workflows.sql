BEGIN;

-- Preserve the source of a payment fact entered from an object and whether it has
-- been reconciled with the financial/accounting contour. Existing records remain
-- valid and are treated as confirmed historical finance data.
ALTER TABLE worker_payments
  ADD COLUMN IF NOT EXISTS record_source text NOT NULL DEFAULT 'finance',
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE worker_payments DROP CONSTRAINT IF EXISTS worker_payments_record_source_check;
ALTER TABLE worker_payments ADD CONSTRAINT worker_payments_record_source_check
  CHECK (record_source IN ('finance','object_manager','integration','legacy'));
ALTER TABLE worker_payments DROP CONSTRAINT IF EXISTS worker_payments_reconciliation_status_check;
ALTER TABLE worker_payments ADD CONSTRAINT worker_payments_reconciliation_status_check
  CHECK (reconciliation_status IN ('unreconciled','confirmed','conflict'));
ALTER TABLE worker_payments DROP CONSTRAINT IF EXISTS worker_payments_payment_method_check;
ALTER TABLE worker_payments ADD CONSTRAINT worker_payments_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('transfer','cash','other'));

ALTER TABLE advance_payments
  ADD COLUMN IF NOT EXISTS record_source text NOT NULL DEFAULT 'finance',
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE advance_payments DROP CONSTRAINT IF EXISTS advance_payments_record_source_check;
ALTER TABLE advance_payments ADD CONSTRAINT advance_payments_record_source_check
  CHECK (record_source IN ('finance','object_manager','integration','legacy'));
ALTER TABLE advance_payments DROP CONSTRAINT IF EXISTS advance_payments_reconciliation_status_check;
ALTER TABLE advance_payments ADD CONSTRAINT advance_payments_reconciliation_status_check
  CHECK (reconciliation_status IN ('unreconciled','confirmed','conflict'));
ALTER TABLE advance_payments DROP CONSTRAINT IF EXISTS advance_payments_payment_method_check;
ALTER TABLE advance_payments ADD CONSTRAINT advance_payments_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('transfer','cash','other'));

-- Financial effect keeps the incident itself as the source of truth. Applying an
-- approved effect creates a linked existing finance entity instead of mutating pay.
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS financial_effect_kind text;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_financial_effect_kind_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_financial_effect_kind_check
  CHECK (financial_effect_kind IS NULL OR financial_effect_kind IN ('worker_adjustment','company_expense','client_claim'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_adjustments_incident
  ON pay_adjustments(organization_id,incident_id)
  WHERE incident_id IS NOT NULL;

ALTER TABLE object_expenses ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_object_expenses_incident
  ON object_expenses(organization_id,incident_id)
  WHERE incident_id IS NOT NULL;

COMMIT;
