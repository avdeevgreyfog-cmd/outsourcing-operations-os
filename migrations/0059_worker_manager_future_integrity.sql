BEGIN;

-- Keep all non-historical worker assignments aligned with the current object manager.
-- This includes future assignments: a manager can change after a worker is scheduled
-- but before the assignment effective date.

UPDATE worker_object_assignments a
SET manager_user_id=o.owner_user_id
FROM objects o
WHERE a.object_id=o.id
  AND o.owner_user_id IS NOT NULL
  AND (a.effective_to IS NULL OR a.effective_to>=current_date)
  AND a.manager_user_id IS DISTINCT FROM o.owner_user_id;

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
      AND (a.effective_to IS NULL OR a.effective_to>=current_date)
  ) THEN
    RAISE EXCEPTION 'Cannot clear object manager while current or future workers are assigned';
  END IF;

  UPDATE worker_object_assignments
  SET manager_user_id=NEW.owner_user_id
  WHERE object_id=NEW.id
    AND NEW.owner_user_id IS NOT NULL
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

COMMIT;
