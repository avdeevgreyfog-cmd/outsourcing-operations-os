BEGIN;

-- Rate references evolve from a simple market hint into auditable company memory.
ALTER TABLE rate_reference_entries
  ALTER COLUMN amount_min DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS price_zone text,
  ADD COLUMN IF NOT EXISTS schedule_label text,
  ADD COLUMN IF NOT EXISTS housing_included boolean,
  ADD COLUMN IF NOT EXISTS shuttle_included boolean,
  ADD COLUMN IF NOT EXISTS full_cost_min numeric(14,2),
  ADD COLUMN IF NOT EXISTS full_cost_max numeric(14,2),
  ADD COLUMN IF NOT EXISTS client_rate_min numeric(14,2),
  ADD COLUMN IF NOT EXISTS client_rate_max numeric(14,2),
  ADD COLUMN IF NOT EXISTS margin_min numeric(8,3),
  ADD COLUMN IF NOT EXISTS margin_max numeric(8,3),
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_status text NOT NULL DEFAULT 'reference',
  ADD COLUMN IF NOT EXISTS source_entity_type text,
  ADD COLUMN IF NOT EXISTS source_entity_id uuid,
  ADD COLUMN IF NOT EXISTS conditions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

ALTER TABLE rate_reference_entries DROP CONSTRAINT IF EXISTS rate_reference_entries_has_rate;
ALTER TABLE rate_reference_entries ADD CONSTRAINT rate_reference_entries_has_rate
  CHECK (amount_min IS NOT NULL OR amount_max IS NOT NULL OR client_rate_min IS NOT NULL OR client_rate_max IS NOT NULL);
ALTER TABLE rate_reference_entries DROP CONSTRAINT IF EXISTS rate_reference_entries_source_type_check;
ALTER TABLE rate_reference_entries ADD CONSTRAINT rate_reference_entries_source_type_check
  CHECK (source_type IN ('manual','import','calculation','proposal','object','reference'));

CREATE INDEX IF NOT EXISTS rate_reference_lookup_idx
  ON rate_reference_entries(organization_id,specialty_id,region_id,source_date DESC);
CREATE INDEX IF NOT EXISTS rate_reference_source_idx
  ON rate_reference_entries(organization_id,source_type,source_status,source_date DESC);

-- Commercial policy is versioned independently from employment/payment models.
CREATE TABLE IF NOT EXISTS commercial_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  policy_json jsonb NOT NULL,
  notes text,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,version),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
ALTER TABLE commercial_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_policy_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON commercial_policy_versions;
CREATE POLICY tenant_isolation ON commercial_policy_versions
  USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_commercial_policy_versions AFTER INSERT OR UPDATE OR DELETE ON commercial_policy_versions FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
