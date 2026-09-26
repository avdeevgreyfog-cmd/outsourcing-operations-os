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

-- Bootstrap organization defaults from the first existing object-specific norm for each specialty.
WITH source AS (
  SELECT DISTINCT ON (t.organization_id,t.specialty_id)
    t.id source_id,t.organization_id,t.specialty_id,t.created_by_user_id,t.updated_by_user_id
  FROM object_ppe_templates t
  WHERE t.active AND t.object_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM object_ppe_templates g
      WHERE g.organization_id=t.organization_id
        AND g.specialty_id=t.specialty_id
        AND g.object_id IS NULL
        AND g.active
    )
  ORDER BY t.organization_id,t.specialty_id,t.updated_at DESC,t.created_at DESC
), inserted AS (
  INSERT INTO object_ppe_templates(
    organization_id,object_id,specialty_id,name,active,created_by_user_id,updated_by_user_id
  )
  SELECT organization_id,NULL,specialty_id,'Базовая норма',true,created_by_user_id,updated_by_user_id
  FROM source
  RETURNING id,organization_id,specialty_id
)
INSERT INTO object_ppe_template_items(
  organization_id,template_id,item_id,quantity,size_source,variant,replacement_cycle_days
)
SELECT s.organization_id,i.id,src.item_id,src.quantity,src.size_source,src.variant,src.replacement_cycle_days
FROM source s
JOIN inserted i ON i.organization_id=s.organization_id AND i.specialty_id=s.specialty_id
JOIN object_ppe_template_items src ON src.template_id=s.source_id
ON CONFLICT(template_id,item_id,variant) DO NOTHING;

COMMIT;
