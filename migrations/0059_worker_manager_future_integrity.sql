BEGIN;

-- Complement 0039 without rewriting its historical object-assignment logic.
-- Current assignments are already synchronized by 0039; this trigger covers
-- assignments that are scheduled for a future effective date.

UPDATE worker_object_assignments a
SET manager_user_id=o.owner_user_id
FROM objects o
WHERE a.object_id=o.id
  AND o.owner_user_id IS NOT NULL
  AND a.effective_from>current_date
  AND (a.effective_to IS NULL OR a.effective_to>=current_date)
  AND a.manager_user_id IS DISTINCT FROM o.owner_user_id;

CREATE OR REPLACE FUNCTION sync_future_worker_manager_responsibility() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_user_id IS NOT DISTINCT FROM OLD.owner_user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_user_id IS NULL AND EXISTS(
    SELECT 1
    FROM worker_object_assignments a
    JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
    WHERE a.object_id=NEW.id
      AND a.effective_from>current_date
      AND (a.effective_to IS NULL OR a.effective_to>=current_date)
  ) THEN
    RAISE EXCEPTION 'Cannot clear object manager while future workers are assigned';
  END IF;

  IF NEW.owner_user_id IS NOT NULL THEN
    UPDATE worker_object_assignments
    SET manager_user_id=NEW.owner_user_id
    WHERE object_id=NEW.id
      AND effective_from>current_date
      AND (effective_to IS NULL OR effective_to>=current_date)
      AND manager_user_id IS DISTINCT FROM NEW.owner_user_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS objects_sync_future_worker_manager ON objects;
CREATE TRIGGER objects_sync_future_worker_manager
AFTER UPDATE OF owner_user_id ON objects
FOR EACH ROW EXECUTE FUNCTION sync_future_worker_manager_responsibility();

COMMIT;
