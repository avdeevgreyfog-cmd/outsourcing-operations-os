BEGIN;

ALTER TABLE objects
  ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS recruiting_routing_mode text NOT NULL DEFAULT 'company_rules';

ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_recruiting_routing_mode_check;
ALTER TABLE objects ADD CONSTRAINT objects_recruiting_routing_mode_check
  CHECK (recruiting_routing_mode IN ('company_rules','object_team'));

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE RESTRICT;

UPDATE objects o
SET legal_entity_id=(
  SELECT le.id
  FROM legal_entities le
  WHERE le.organization_id=o.organization_id AND le.active
  ORDER BY le.is_primary DESC,le.created_at,le.id
  LIMIT 1
)
WHERE o.legal_entity_id IS NULL;

UPDATE contracts c
SET legal_entity_id=COALESCE(
  (SELECT o.legal_entity_id FROM objects o WHERE o.id=c.object_id),
  (
    SELECT le.id
    FROM legal_entities le
    WHERE le.organization_id=c.organization_id AND le.active
    ORDER BY le.is_primary DESC,le.created_at,le.id
    LIMIT 1
  )
)
WHERE c.legal_entity_id IS NULL;

CREATE OR REPLACE FUNCTION validate_business_legal_entity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.legal_entity_id IS NOT NULL
     AND organization_reference_org('legal_entities',NEW.legal_entity_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'legal entity belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS objects_legal_entity_integrity ON objects;
CREATE TRIGGER objects_legal_entity_integrity
BEFORE INSERT OR UPDATE OF organization_id,legal_entity_id ON objects
FOR EACH ROW EXECUTE FUNCTION validate_business_legal_entity();

DROP TRIGGER IF EXISTS contracts_legal_entity_integrity ON contracts;
CREATE TRIGGER contracts_legal_entity_integrity
BEFORE INSERT OR UPDATE OF organization_id,legal_entity_id ON contracts
FOR EACH ROW EXECUTE FUNCTION validate_business_legal_entity();

CREATE INDEX IF NOT EXISTS idx_objects_legal_entity
  ON objects(organization_id,legal_entity_id,status);
CREATE INDEX IF NOT EXISTS idx_object_assignments_responsibility
  ON object_assignments(organization_id,object_id,responsibility_type,effective_to);
CREATE INDEX IF NOT EXISTS idx_contracts_legal_entity
  ON contracts(organization_id,legal_entity_id,status);

-- Existing objects get an explicit current object-manager assignment without rewriting history.
INSERT INTO object_assignments(organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id)
SELECT o.organization_id,o.id,o.owner_user_id,'object_manager',current_date,NULL
FROM objects o
WHERE o.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM object_assignments oa
    WHERE oa.object_id=o.id AND oa.user_id=o.owner_user_id AND oa.responsibility_type='object_manager'
      AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)
  );

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description)
VALUES ('operations.object.create','operations','object','create',false,'Ручное создание объекта вне коммерческого перехода')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,'operations.object.create','allow','all_org','{}'::uuid[]
FROM role_templates r
WHERE r.code IN ('director','regional_manager','operations_head')
ON CONFLICT DO NOTHING;

INSERT INTO position_permission_grants(organization_id,position_id,capability,effect,scope_type,scope_ids)
SELECT p.organization_id,p.id,'operations.object.create','allow','all_org','{}'::uuid[]
FROM positions p
WHERE p.code IN ('ceo','operations-head','operations_head','regional-manager','regional_manager')
ON CONFLICT DO NOTHING;

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description)
VALUES ('operations.object.assign','operations','object','assign',false,'Назначение и передача менеджеров объекта, настройка маршрута подбора и юридического лица')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,'operations.object.assign','allow','all_org','{}'::uuid[]
FROM role_templates r
WHERE r.code IN ('director','regional_manager','operations_head')
ON CONFLICT DO NOTHING;

INSERT INTO position_permission_grants(organization_id,position_id,capability,effect,scope_type,scope_ids)
SELECT p.organization_id,p.id,'operations.object.assign','allow','all_org','{}'::uuid[]
FROM positions p
WHERE p.code IN ('ceo','operations-head','operations_head','regional-manager','regional_manager')
ON CONFLICT DO NOTHING;

COMMIT;
