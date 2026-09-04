BEGIN;

DROP TRIGGER IF EXISTS organization_units_no_cycles ON organization_units;
DROP TRIGGER IF EXISTS staff_positions_no_cycles ON staff_positions;
DROP FUNCTION IF EXISTS validate_organization_hierarchy();

CREATE FUNCTION validate_organization_unit_hierarchy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE cycle_found boolean;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  WITH RECURSIVE ancestors AS (
    SELECT id,parent_id FROM organization_units WHERE id=NEW.parent_id
    UNION ALL
    SELECT ou.id,ou.parent_id FROM organization_units ou JOIN ancestors a ON ou.id=a.parent_id
  ) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=NEW.id) INTO cycle_found;
  IF cycle_found THEN RAISE EXCEPTION 'organization hierarchy cycle detected' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION validate_staff_position_hierarchy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE cycle_found boolean;
BEGIN
  IF NEW.reports_to_position_id IS NULL THEN RETURN NEW; END IF;
  WITH RECURSIVE ancestors AS (
    SELECT id,reports_to_position_id FROM staff_positions WHERE id=NEW.reports_to_position_id
    UNION ALL
    SELECT sp.id,sp.reports_to_position_id FROM staff_positions sp JOIN ancestors a ON sp.id=a.reports_to_position_id
  ) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=NEW.id) INTO cycle_found;
  IF cycle_found THEN RAISE EXCEPTION 'organization hierarchy cycle detected' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER organization_units_no_cycles BEFORE INSERT OR UPDATE OF parent_id ON organization_units
FOR EACH ROW EXECUTE FUNCTION validate_organization_unit_hierarchy();
CREATE TRIGGER staff_positions_no_cycles BEFORE INSERT OR UPDATE OF reports_to_position_id ON staff_positions
FOR EACH ROW EXECUTE FUNCTION validate_staff_position_hierarchy();

COMMIT;
