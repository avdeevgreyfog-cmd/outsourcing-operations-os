BEGIN;

-- Supply norms have one organization-wide default per specialty.
-- Object templates stay as explicit overrides; actual stock and issue/return remain in inventory.
ALTER TABLE object_ppe_templates ALTER COLUMN object_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_global_ppe_template_active
  ON object_ppe_templates(organization_id,specialty_id)
  WHERE object_id IS NULL AND active;

CREATE INDEX IF NOT EXISTS idx_global_ppe_templates_scope
  ON object_ppe_templates(organization_id,specialty_id,active)
  WHERE object_id IS NULL;

-- Existing object-specific norms remain explicit overrides.
-- Company defaults are created deliberately from the central supply workspace,
-- so introducing inheritance does not silently change requirements on other objects.

COMMIT;
