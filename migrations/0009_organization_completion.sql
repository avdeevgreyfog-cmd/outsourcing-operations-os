BEGIN;

-- Structural writes can arrive through CRUD routes, imports or atomic change sets.
-- Keep acyclicity and dated-seat invariants in PostgreSQL so every entry point is safe.
CREATE OR REPLACE FUNCTION validate_organization_hierarchy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE cycle_found boolean;
BEGIN
  IF TG_TABLE_NAME = 'organization_units' AND NEW.parent_id IS NOT NULL THEN
    WITH RECURSIVE ancestors AS (
      SELECT id,parent_id FROM organization_units WHERE id=NEW.parent_id
      UNION ALL
      SELECT ou.id,ou.parent_id FROM organization_units ou JOIN ancestors a ON ou.id=a.parent_id
    ) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=NEW.id) INTO cycle_found;
  ELSIF TG_TABLE_NAME = 'staff_positions' AND NEW.reports_to_position_id IS NOT NULL THEN
    WITH RECURSIVE ancestors AS (
      SELECT id,reports_to_position_id FROM staff_positions WHERE id=NEW.reports_to_position_id
      UNION ALL
      SELECT sp.id,sp.reports_to_position_id FROM staff_positions sp JOIN ancestors a ON sp.id=a.reports_to_position_id
    ) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=NEW.id) INTO cycle_found;
  ELSE
    cycle_found := false;
  END IF;
  IF cycle_found THEN RAISE EXCEPTION 'organization hierarchy cycle detected' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER organization_units_no_cycles BEFORE INSERT OR UPDATE OF parent_id ON organization_units
FOR EACH ROW EXECUTE FUNCTION validate_organization_hierarchy();
CREATE TRIGGER staff_positions_no_cycles BEFORE INSERT OR UPDATE OF reports_to_position_id ON staff_positions
FOR EACH ROW EXECUTE FUNCTION validate_organization_hierarchy();

CREATE OR REPLACE FUNCTION validate_position_assignment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  position_capacity numeric; position_status text; position_from date; position_to date;
  occupied numeric; employee_fte numeric; primary_overlap integer;
BEGIN
  IF NEW.status='ended' THEN RETURN NEW; END IF;
  SELECT capacity,status,effective_from,effective_to
    INTO position_capacity,position_status,position_from,position_to
    FROM staff_positions WHERE id=NEW.staff_position_id FOR UPDATE;
  IF position_capacity IS NULL THEN RAISE EXCEPTION 'staff position not found' USING ERRCODE='23503'; END IF;
  IF position_status IN ('closed','frozen') THEN RAISE EXCEPTION 'staff position is not assignable' USING ERRCODE='23514'; END IF;
  IF NEW.effective_from < position_from OR (position_to IS NOT NULL AND COALESCE(NEW.effective_to,NEW.effective_from)>position_to)
    OR (NEW.effective_to IS NULL AND position_to IS NOT NULL) THEN
    RAISE EXCEPTION 'assignment is outside staff position effective dates' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(sum(fte),0) INTO occupied FROM position_assignments
    WHERE staff_position_id=NEW.staff_position_id AND id<>NEW.id AND status<>'ended'
      AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange(NEW.effective_from,COALESCE(NEW.effective_to,'infinity'::date),'[]');
  IF occupied+NEW.fte>position_capacity AND NOT NEW.allow_overallocation THEN RAISE EXCEPTION 'staff position capacity exceeded' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum(fte),0) INTO employee_fte FROM position_assignments
    WHERE membership_id=NEW.membership_id AND id<>NEW.id AND status<>'ended'
      AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange(NEW.effective_from,COALESCE(NEW.effective_to,'infinity'::date),'[]');
  IF employee_fte+NEW.fte>1 AND NOT NEW.allow_overallocation THEN RAISE EXCEPTION 'employee allocation exceeds 1 FTE' USING ERRCODE='23514'; END IF;
  IF NEW.assignment_type='primary' THEN
    SELECT count(*) INTO primary_overlap FROM position_assignments
      WHERE membership_id=NEW.membership_id AND id<>NEW.id AND assignment_type='primary' AND status<>'ended'
        AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange(NEW.effective_from,COALESCE(NEW.effective_to,'infinity'::date),'[]');
    IF primary_overlap>0 THEN RAISE EXCEPTION 'primary assignment overlaps another primary assignment' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE INDEX idx_membership_process_roles_effective ON membership_process_roles
  (organization_id,membership_id,effective_from,effective_to);
CREATE INDEX idx_change_items_order ON organization_change_items(change_set_id,sort_order,id);

-- Stable integration endpoints for tasks, workflow and approvals.
CREATE OR REPLACE FUNCTION current_position_assignment(p_membership_id uuid,p_on_date date DEFAULT current_date)
RETURNS TABLE(assignment_id uuid,staff_position_id uuid,job_profile_id uuid,organization_unit_id uuid,region_id uuid,fte numeric)
LANGUAGE sql STABLE AS $$
  SELECT pa.id,sp.id,sp.job_profile_id,sp.organization_unit_id,COALESCE(sp.region_id,ou.region_id),pa.fte
  FROM position_assignments pa JOIN staff_positions sp ON sp.id=pa.staff_position_id
  JOIN organization_units ou ON ou.id=sp.organization_unit_id
  WHERE pa.organization_id=app_current_organization_id() AND pa.membership_id=p_membership_id
    AND pa.assignment_type='primary' AND pa.status<>'ended' AND pa.effective_from<=p_on_date
    AND (pa.effective_to IS NULL OR pa.effective_to>=p_on_date)
    AND sp.effective_from<=p_on_date AND (sp.effective_to IS NULL OR sp.effective_to>=p_on_date)
  ORDER BY pa.effective_from DESC,pa.created_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION resolve_employee_manager(p_membership_id uuid,p_on_date date DEFAULT current_date)
RETURNS uuid LANGUAGE sql STABLE AS $$
  WITH current_seat AS (SELECT * FROM current_position_assignment(p_membership_id,p_on_date)),
  positional AS (
    SELECT pa.membership_id FROM current_seat cs JOIN staff_positions child ON child.id=cs.staff_position_id
    JOIN position_assignments pa ON pa.staff_position_id=child.reports_to_position_id AND pa.status<>'ended'
      AND pa.effective_from<=p_on_date AND (pa.effective_to IS NULL OR pa.effective_to>=p_on_date)
    ORDER BY pa.assignment_type='primary' DESC,pa.fte DESC LIMIT 1
  ), unit_lead AS (
    SELECT oul.membership_id FROM current_seat cs JOIN organization_unit_leads oul ON oul.organization_unit_id=cs.organization_unit_id
    WHERE oul.effective_from<=p_on_date AND (oul.effective_to IS NULL OR oul.effective_to>=p_on_date)
    ORDER BY oul.lead_type='primary' DESC,oul.effective_from DESC LIMIT 1
  )
  SELECT membership_id FROM positional UNION ALL SELECT membership_id FROM unit_lead
  UNION ALL SELECT manager_membership_id FROM organization_memberships WHERE id=p_membership_id
  LIMIT 1
$$;

COMMIT;
