BEGIN;

-- Исторические версии потребности: условия и ключевые параметры не перезаписываются бесследно.
CREATE TABLE need_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  need_id uuid NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL,
  specialty_id uuid NOT NULL REFERENCES specialties(id),
  object_id uuid REFERENCES objects(id),
  region_id uuid REFERENCES regions(id),
  count_required integer NOT NULL CHECK (count_required > 0),
  deadline date,
  status text NOT NULL,
  priority text NOT NULL,
  conditions_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_user_id uuid REFERENCES app_users(id),
  manager_user_id uuid REFERENCES app_users(id),
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  UNIQUE (need_id, version)
);

ALTER TABLE need_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE need_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON need_versions
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_need_versions AFTER INSERT OR UPDATE OR DELETE ON need_versions
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE INDEX idx_need_versions_need ON need_versions(organization_id,need_id,version DESC);

INSERT INTO need_versions(
  organization_id,need_id,version,title,specialty_id,object_id,region_id,count_required,deadline,status,priority,
  conditions_snapshot,owner_user_id,manager_user_id,effective_from,created_by_user_id
)
SELECT n.organization_id,n.id,1,COALESCE(n.title,s.name),n.specialty_id,n.object_id,n.region_id,n.count_required,n.deadline,n.status,n.priority,
       n.conditions_snapshot,n.owner_user_id,n.manager_user_id,n.created_at,n.created_by_user_id
FROM needs n
JOIN specialties s ON s.id=n.specialty_id
WHERE NOT EXISTS (SELECT 1 FROM need_versions nv WHERE nv.need_id=n.id);

CREATE OR REPLACE FUNCTION capture_need_version() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  next_version integer;
BEGIN
  IF TG_OP='UPDATE' AND NOT (
    OLD.title IS DISTINCT FROM NEW.title OR
    OLD.specialty_id IS DISTINCT FROM NEW.specialty_id OR
    OLD.object_id IS DISTINCT FROM NEW.object_id OR
    OLD.region_id IS DISTINCT FROM NEW.region_id OR
    OLD.count_required IS DISTINCT FROM NEW.count_required OR
    OLD.deadline IS DISTINCT FROM NEW.deadline OR
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.priority IS DISTINCT FROM NEW.priority OR
    OLD.conditions_snapshot IS DISTINCT FROM NEW.conditions_snapshot OR
    OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id OR
    OLD.manager_user_id IS DISTINCT FROM NEW.manager_user_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version),0)+1 INTO next_version FROM need_versions WHERE need_id=NEW.id;
  INSERT INTO need_versions(
    organization_id,need_id,version,title,specialty_id,object_id,region_id,count_required,deadline,status,priority,
    conditions_snapshot,owner_user_id,manager_user_id,effective_from,created_by_user_id
  ) VALUES (
    NEW.organization_id,NEW.id,next_version,COALESCE(NEW.title,(SELECT name FROM specialties WHERE id=NEW.specialty_id)),NEW.specialty_id,
    NEW.object_id,NEW.region_id,NEW.count_required,NEW.deadline,NEW.status,NEW.priority,NEW.conditions_snapshot,
    NEW.owner_user_id,NEW.manager_user_id,now(),COALESCE(app_current_user_id(),NEW.created_by_user_id)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS needs_version_history ON needs;
CREATE TRIGGER needs_version_history AFTER INSERT OR UPDATE ON needs
  FOR EACH ROW EXECUTE FUNCTION capture_need_version();

COMMIT;
