BEGIN;

-- An operating object may have an incomplete profile. Preserve unknown manager
-- as NULL, never infer the creator as a manager and never change closed history.
-- Existing synchronization on assigning/changing a manager remains in place.
CREATE OR REPLACE FUNCTION enforce_worker_assignment_object_manager() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_manager uuid;
BEGIN
  IF NEW.effective_to IS NULL OR NEW.effective_to>=current_date THEN
    SELECT owner_user_id INTO v_manager FROM objects
    WHERE id=NEW.object_id AND organization_id=NEW.organization_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Assignment object belongs to another organization' USING ERRCODE='23514';
    END IF;
    NEW.manager_user_id:=v_manager;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
