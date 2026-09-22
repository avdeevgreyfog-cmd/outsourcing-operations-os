BEGIN;

-- Operational responsibility follows the factual organization hierarchy:
-- object manager -> manager of that employee -> higher managers.
-- Managers only receive object-scoped access to the objects of their reporting chain.

ALTER TABLE worker_object_assignments
  ADD COLUMN IF NOT EXISTS work_mode text NOT NULL DEFAULT 'local'
    CHECK (work_mode IN ('local','rotation')),
  ADD COLUMN IF NOT EXISTS paid_hours_per_shift numeric(5,2)
    CHECK (paid_hours_per_shift IS NULL OR (paid_hours_per_shift > 0 AND paid_hours_per_shift <= 24));

CREATE OR REPLACE FUNCTION refresh_object_supervisor_assignments(p_object_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid;
  v_owner uuid;
  v_owner_membership uuid;
  v_actor uuid;
  v_supervisor record;
BEGIN
  SELECT organization_id,owner_user_id INTO v_org,v_owner
  FROM objects WHERE id=p_object_id;
  IF v_org IS NULL THEN RETURN; END IF;

  v_actor:=NULLIF(current_setting('app.user_id',true),'')::uuid;

  -- Same-day generated rows can be safely replaced; older rows are closed to keep history.
  DELETE FROM object_assignments
  WHERE object_id=p_object_id
    AND responsibility_type='operations_head'
    AND effective_from=current_date
    AND (effective_to IS NULL OR effective_to>=current_date);

  UPDATE object_assignments
  SET effective_to=current_date-1
  WHERE object_id=p_object_id
    AND responsibility_type='operations_head'
    AND effective_from<current_date
    AND (effective_to IS NULL OR effective_to>=current_date);

  IF v_owner IS NULL THEN RETURN; END IF;

  SELECT id INTO v_owner_membership
  FROM organization_memberships
  WHERE organization_id=v_org AND user_id=v_owner AND status='active'
  LIMIT 1;
  IF v_owner_membership IS NULL THEN RETURN; END IF;

  FOR v_supervisor IN
    WITH RECURSIVE manager_chain(membership_id,depth) AS (
      SELECT resolve_employee_manager(v_owner_membership,current_date),1
      UNION ALL
      SELECT resolve_employee_manager(mc.membership_id,current_date),mc.depth+1
      FROM manager_chain mc
      WHERE mc.membership_id IS NOT NULL AND mc.depth<12
    )
    SELECT DISTINCT m.user_id
    FROM manager_chain mc
    JOIN organization_memberships m ON m.id=mc.membership_id
    WHERE mc.membership_id IS NOT NULL
      AND m.organization_id=v_org
      AND m.status='active'
      AND m.user_id<>v_owner
  LOOP
    INSERT INTO object_assignments(
      organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id
    )
    VALUES(v_org,p_object_id,v_supervisor.user_id,'operations_head',current_date,v_actor)
    ;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION refresh_object_supervisors_on_object_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refresh_object_supervisor_assignments(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS objects_refresh_supervisors ON objects;
CREATE TRIGGER objects_refresh_supervisors
AFTER INSERT OR UPDATE OF owner_user_id ON objects
FOR EACH ROW EXECUTE FUNCTION refresh_object_supervisors_on_object_change();

CREATE OR REPLACE FUNCTION refresh_object_supervisors_on_org_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid;
  v_object record;
BEGIN
  v_org:=CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  FOR v_object IN SELECT id FROM objects WHERE organization_id=v_org LOOP
    PERFORM refresh_object_supervisor_assignments(v_object.id);
  END LOOP;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS position_assignments_refresh_object_supervisors ON position_assignments;
CREATE TRIGGER position_assignments_refresh_object_supervisors
AFTER INSERT OR UPDATE OR DELETE ON position_assignments
FOR EACH ROW EXECUTE FUNCTION refresh_object_supervisors_on_org_change();

DROP TRIGGER IF EXISTS staff_positions_refresh_object_supervisors ON staff_positions;
CREATE TRIGGER staff_positions_refresh_object_supervisors
AFTER UPDATE OF reports_to_position_id ON staff_positions
FOR EACH ROW EXECUTE FUNCTION refresh_object_supervisors_on_org_change();

DROP TRIGGER IF EXISTS organization_unit_leads_refresh_object_supervisors ON organization_unit_leads;
CREATE TRIGGER organization_unit_leads_refresh_object_supervisors
AFTER INSERT OR UPDATE OR DELETE ON organization_unit_leads
FOR EACH ROW EXECUTE FUNCTION refresh_object_supervisors_on_org_change();

DROP TRIGGER IF EXISTS organization_memberships_refresh_object_supervisors ON organization_memberships;
CREATE TRIGGER organization_memberships_refresh_object_supervisors
AFTER UPDATE OF manager_membership_id,status ON organization_memberships
FOR EACH ROW EXECUTE FUNCTION refresh_object_supervisors_on_org_change();

DO $$
DECLARE
  v_object record;
BEGIN
  FOR v_object IN SELECT id FROM objects LOOP
    PERFORM refresh_object_supervisor_assignments(v_object.id);
  END LOOP;
END $$;

-- A direction/operations head sees only the objects inherited from subordinate managers.
UPDATE permission_grants g
SET scope_type='assigned_to_me',scope_ids='{}'::uuid[]
FROM role_templates r
WHERE g.role_template_id=r.id
  AND r.code IN ('operations_head','regional_manager')
  AND g.capability IN (
    'operations.object.read','operations.object.edit',
    'operations.need.read','operations.need.create','operations.need.edit',
    'operations.shift.read','operations.shift.edit',
    'operations.crew.read','operations.crew.manage',
    'assets.read','assets.manage','procurement.read','procurement.manage',
    'supply.housing.read','supply.housing.manage',
    'recruiting.candidate.read','recruiting.candidate.create','recruiting.candidate.edit',
    'worker.read','worker.edit','worker.offboarding.manage',
    'time.time_entry.read','time.time_entry.edit',
    'time.timesheet.read','time.timesheet.edit','time.timesheet.submit','time.timesheet.review',
    'finance.pnl.read','analytics.portfolio.read'
  );

UPDATE position_permission_grants g
SET scope_type='assigned_to_me',scope_ids='{}'::uuid[]
FROM positions p
WHERE g.position_id=p.id
  AND p.code IN ('operations-head','operations_head','regional-manager','regional_manager')
  AND g.capability IN (
    'operations.object.read','operations.object.edit',
    'operations.need.read','operations.need.create','operations.need.edit',
    'operations.shift.read','operations.shift.edit',
    'operations.crew.read','operations.crew.manage',
    'assets.read','assets.manage','procurement.read','procurement.manage',
    'supply.housing.read','supply.housing.manage',
    'recruiting.candidate.read','recruiting.candidate.create','recruiting.candidate.edit',
    'worker.read','worker.edit','worker.offboarding.manage',
    'time.time_entry.read','time.time_entry.edit',
    'time.timesheet.read','time.timesheet.edit','time.timesheet.submit','time.timesheet.review',
    'finance.pnl.read','analytics.portfolio.read'
  );

COMMIT;
