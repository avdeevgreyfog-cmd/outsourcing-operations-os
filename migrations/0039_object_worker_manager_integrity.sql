BEGIN;

-- Current worker responsibility follows the current object manager.
-- Closed historical assignments keep the manager that was recorded at the time.
UPDATE worker_object_assignments a
SET manager_user_id=o.owner_user_id
FROM objects o
WHERE a.object_id=o.id
  AND o.owner_user_id IS NOT NULL
  AND (a.effective_to IS NULL OR a.effective_to>=current_date)
  AND a.manager_user_id IS DISTINCT FROM o.owner_user_id;

CREATE OR REPLACE FUNCTION enforce_worker_assignment_object_manager() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_manager uuid;
BEGIN
  IF NEW.effective_to IS NULL OR NEW.effective_to>=current_date THEN
    SELECT owner_user_id INTO v_manager FROM objects WHERE id=NEW.object_id;
    IF v_manager IS NULL THEN
      RAISE EXCEPTION 'Object manager must be assigned before worker assignment';
    END IF;
    NEW.manager_user_id:=v_manager;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS worker_assignment_object_manager ON worker_object_assignments;
CREATE TRIGGER worker_assignment_object_manager
BEFORE INSERT OR UPDATE OF object_id,effective_from,effective_to,manager_user_id
ON worker_object_assignments
FOR EACH ROW EXECUTE FUNCTION enforce_worker_assignment_object_manager();

CREATE OR REPLACE FUNCTION sync_object_manager_responsibility() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF NEW.owner_user_id IS NOT DISTINCT FROM OLD.owner_user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_user_id IS NULL AND EXISTS(
    SELECT 1
    FROM worker_object_assignments a
    JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
    WHERE a.object_id=NEW.id
      AND a.effective_from<=current_date
      AND (a.effective_to IS NULL OR a.effective_to>=current_date)
  ) THEN
    RAISE EXCEPTION 'Cannot clear object manager while active workers are assigned';
  END IF;

  UPDATE worker_object_assignments
  SET manager_user_id=NEW.owner_user_id
  WHERE object_id=NEW.id
    AND NEW.owner_user_id IS NOT NULL
    AND effective_from<=current_date
    AND (effective_to IS NULL OR effective_to>=current_date)
    AND manager_user_id IS DISTINCT FROM NEW.owner_user_id;

  -- Preserve object-manager assignment history while keeping current access aligned.
  DELETE FROM object_assignments
  WHERE object_id=NEW.id
    AND responsibility_type='object_manager'
    AND effective_from=current_date
    AND (effective_to IS NULL OR effective_to>=current_date);

  UPDATE object_assignments
  SET effective_to=current_date-1
  WHERE object_id=NEW.id
    AND responsibility_type='object_manager'
    AND effective_from<current_date
    AND (effective_to IS NULL OR effective_to>=current_date);

  IF NEW.owner_user_id IS NOT NULL THEN
    v_actor:=NULLIF(current_setting('app.user_id',true),'')::uuid;
    INSERT INTO object_assignments(
      organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id
    )
    VALUES(
      NEW.organization_id,NEW.id,NEW.owner_user_id,'object_manager',current_date,v_actor
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS objects_sync_manager_responsibility ON objects;
CREATE TRIGGER objects_sync_manager_responsibility
AFTER UPDATE OF owner_user_id ON objects
FOR EACH ROW EXECUTE FUNCTION sync_object_manager_responsibility();

COMMIT;
