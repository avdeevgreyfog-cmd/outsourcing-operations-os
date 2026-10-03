BEGIN;

-- Internal warehouse refinement: canonical variants, condition-aware stock and historical prices.
-- Existing inventory movements remain immutable; new metadata is additive and legacy rows are backfilled.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS size_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS default_replacement_cycle_days integer,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_size_mode_check;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_size_mode_check
  CHECK (size_mode IN ('none','clothing','shoe','manual'));

ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_default_replacement_cycle_days_check;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_default_replacement_cycle_days_check
  CHECK (default_replacement_cycle_days IS NULL OR default_replacement_cycle_days BETWEEN 1 AND 3650);

UPDATE inventory_items
SET size_mode=CASE WHEN tracks_variant THEN 'manual' ELSE 'none' END
WHERE tracks_variant AND size_mode='none';

CREATE TABLE IF NOT EXISTS inventory_item_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  code text,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id,label)
);

CREATE INDEX IF NOT EXISTS idx_inventory_item_variants_item
  ON inventory_item_variants(organization_id,item_id,active,sort_order,label);

CREATE TABLE IF NOT EXISTS inventory_item_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES inventory_item_variants(id) ON DELETE SET NULL,
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost >= 0),
  effective_from date NOT NULL,
  effective_to date,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','purchase','supplier','opening')),
  partner_id uuid REFERENCES supply_partners(id) ON DELETE SET NULL,
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_inventory_item_prices_lookup
  ON inventory_item_prices(organization_id,item_id,variant_id,effective_from DESC,created_at DESC);

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES inventory_item_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_condition text,
  ADD COLUMN IF NOT EXISTS target_condition text;

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_source_condition_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_source_condition_check
  CHECK (source_condition IS NULL OR source_condition IN ('new','good','worn','damaged','unusable'));

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_target_condition_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_target_condition_check
  CHECK (target_condition IS NULL OR target_condition IN ('new','good','worn','damaged','unusable'));

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('opening','receipt','transfer','issue','return','writeoff','adjustment_in','adjustment_out','recondition'));

UPDATE inventory_movements
SET source_condition=CASE
      WHEN movement_type IN ('transfer','issue','writeoff','adjustment_out') THEN COALESCE(item_condition,'good')
      ELSE source_condition
    END,
    target_condition=CASE
      WHEN movement_type IN ('opening','receipt') THEN COALESCE(item_condition,'new')
      WHEN movement_type IN ('transfer','return','adjustment_in') THEN COALESCE(item_condition,'good')
      ELSE target_condition
    END
WHERE source_condition IS NULL OR target_condition IS NULL;

INSERT INTO inventory_item_variants(organization_id,item_id,label,created_by_user_id)
SELECT DISTINCT x.organization_id,x.item_id,x.variant,x.created_by_user_id
FROM (
  SELECT m.organization_id,m.item_id,trim(m.variant) variant,m.created_by_user_id
  FROM inventory_movements m
  WHERE trim(COALESCE(m.variant,''))<>''
  UNION
  SELECT l.organization_id,l.item_id,trim(l.variant) variant,
    COALESCE(i.created_by_user_id,(
      SELECT u.id FROM app_users u WHERE u.organization_id=l.organization_id ORDER BY u.created_at LIMIT 1
    )) created_by_user_id
  FROM inventory_stock_limits l
  JOIN inventory_items i ON i.id=l.item_id
  WHERE trim(COALESCE(l.variant,''))<>''
) x
WHERE x.created_by_user_id IS NOT NULL
ON CONFLICT (item_id,label) DO NOTHING;

UPDATE inventory_movements m
SET variant_id=v.id
FROM inventory_item_variants v
WHERE m.variant_id IS NULL
  AND v.organization_id=m.organization_id
  AND v.item_id=m.item_id
  AND v.label=trim(m.variant)
  AND trim(COALESCE(m.variant,''))<>'';

ALTER TABLE inventory_item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_item_variants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_item_variants_tenant_isolation ON inventory_item_variants;
CREATE POLICY inventory_item_variants_tenant_isolation ON inventory_item_variants
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE inventory_item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_item_prices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_item_prices_tenant_isolation ON inventory_item_prices;
CREATE POLICY inventory_item_prices_tenant_isolation ON inventory_item_prices
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

DROP TRIGGER IF EXISTS audit_inventory_item_variants ON inventory_item_variants;
CREATE TRIGGER audit_inventory_item_variants
  AFTER INSERT OR UPDATE OR DELETE ON inventory_item_variants
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS audit_inventory_item_prices ON inventory_item_prices;
CREATE TRIGGER audit_inventory_item_prices
  AFTER INSERT OR UPDATE OR DELETE ON inventory_item_prices
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
