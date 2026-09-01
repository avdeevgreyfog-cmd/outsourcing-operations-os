BEGIN;

-- Organization Core hardening: neutral unit taxonomy, dated assignments and
-- database-level invariants. Server validation remains useful for friendly
-- errors, but integrity must not depend on a particular UI or API route.
ALTER TABLE organization_units DROP CONSTRAINT IF EXISTS organization_units_kind_check;
ALTER TABLE organization_units ADD CONSTRAINT organization_units_kind_check
  CHECK (kind IN ('company','department','region','branch','direction','team','project_group','object_team','other'));

ALTER TABLE position_assignments
  ADD COLUMN allow_overallocation boolean NOT NULL DEFAULT false,
  ADD COLUMN ended_by_user_id uuid REFERENCES app_users(id),
  ADD COLUMN ended_at timestamptz;

CREATE OR REPLACE FUNCTION validate_organization_reference_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE related_org uuid;
BEGIN
  IF TG_TABLE_NAME = 'staff_positions' THEN
    SELECT organization_id INTO related_org FROM positions WHERE id=NEW.job_profile_id;
    IF related_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'job profile belongs to another organization' USING ERRCODE='23514'; END IF;
    SELECT organization_id INTO related_org FROM organization_units WHERE id=NEW.organization_unit_id;
    IF related_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'organization unit belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.reports_to_position_id IS NOT NULL THEN
      SELECT organization_id INTO related_org FROM staff_positions WHERE id=NEW.reports_to_position_id;
      IF related_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'manager position belongs to another organization' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'position_assignments' THEN
    SELECT organization_id INTO related_org FROM staff_positions WHERE id=NEW.staff_position_id;
    IF related_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'staff position belongs to another organization' USING ERRCODE='23514'; END IF;
    SELECT organization_id INTO related_org FROM organization_memberships WHERE id=NEW.membership_id;
    IF related_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'employee belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'membership_process_roles' THEN
    SELECT organization_id INTO related_org FROM organization_memberships WHERE id=NEW.membership_id;
    IF related_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'employee belongs to another organization' USING ERRCODE='23514'; END IF;
    SELECT organization_id INTO related_org FROM process_roles WHERE id=NEW.process_role_id;
    IF related_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'process role belongs to another organization' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER staff_positions_tenant_integrity BEFORE INSERT OR UPDATE ON staff_positions
FOR EACH ROW EXECUTE FUNCTION validate_organization_reference_integrity();
CREATE TRIGGER position_assignments_tenant_integrity BEFORE INSERT OR UPDATE ON position_assignments
FOR EACH ROW EXECUTE FUNCTION validate_organization_reference_integrity();
CREATE TRIGGER membership_process_roles_tenant_integrity BEFORE INSERT OR UPDATE ON membership_process_roles
FOR EACH ROW EXECUTE FUNCTION validate_organization_reference_integrity();

CREATE OR REPLACE FUNCTION validate_position_assignment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE position_capacity numeric; occupied numeric; employee_fte numeric; primary_overlap integer;
BEGIN
  IF NEW.status='ended' THEN RETURN NEW; END IF;
  SELECT capacity INTO position_capacity FROM staff_positions WHERE id=NEW.staff_position_id FOR UPDATE;
  SELECT COALESCE(sum(fte),0) INTO occupied FROM position_assignments
    WHERE staff_position_id=NEW.staff_position_id AND id<>NEW.id AND status<>'ended'
      AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange(NEW.effective_from,COALESCE(NEW.effective_to,'infinity'::date),'[]');
  IF occupied+NEW.fte>position_capacity AND NOT NEW.allow_overallocation THEN
    RAISE EXCEPTION 'staff position capacity exceeded' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(sum(fte),0) INTO employee_fte FROM position_assignments
    WHERE membership_id=NEW.membership_id AND id<>NEW.id AND status<>'ended'
      AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange(NEW.effective_from,COALESCE(NEW.effective_to,'infinity'::date),'[]');
  IF employee_fte+NEW.fte>1 AND NOT NEW.allow_overallocation THEN
    RAISE EXCEPTION 'employee allocation exceeds 1 FTE' USING ERRCODE='23514';
  END IF;
  IF NEW.assignment_type='primary' THEN
    SELECT count(*) INTO primary_overlap FROM position_assignments
      WHERE membership_id=NEW.membership_id AND id<>NEW.id AND assignment_type='primary' AND status<>'ended'
        AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange(NEW.effective_from,COALESCE(NEW.effective_to,'infinity'::date),'[]');
    IF primary_overlap>0 THEN RAISE EXCEPTION 'primary assignment overlaps another primary assignment' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER position_assignment_capacity BEFORE INSERT OR UPDATE ON position_assignments
FOR EACH ROW EXECUTE FUNCTION validate_position_assignment();

CREATE INDEX idx_position_assignments_member_date ON position_assignments
  (organization_id,membership_id,effective_from,effective_to) WHERE status<>'ended';
CREATE INDEX idx_org_units_region_kind ON organization_units(organization_id,region_id,kind,active);
CREATE INDEX idx_audit_org_core ON audit_events(organization_id,resource_type,created_at DESC)
  WHERE resource_type IN ('organization_units','positions','staff_positions','position_assignments','process_roles','membership_process_roles','responsibility_rules','organization_change_sets');

-- Stable resolver used by workflow/task modules. It returns the current factual
-- executor, the rule that selected them and the fallback when no assignment exists.
CREATE OR REPLACE FUNCTION resolve_organization_responsibility(
  p_process_code text,p_step_code text,p_scope_type text DEFAULT 'all_org',p_scope_id uuid DEFAULT NULL,p_on_date date DEFAULT current_date
) RETURNS TABLE(rule_id uuid,membership_id uuid,user_id uuid,source_type text,source_id uuid,is_fallback boolean)
LANGUAGE sql STABLE AS $$
  WITH rules AS (
    SELECT rr.*, row_number() OVER (ORDER BY rr.effective_from DESC,rr.created_at DESC) priority
    FROM responsibility_rules rr
    WHERE rr.organization_id=app_current_organization_id() AND rr.process_code=p_process_code AND rr.step_code=p_step_code
      AND rr.active AND rr.effective_from<=p_on_date AND (rr.effective_to IS NULL OR rr.effective_to>=p_on_date)
      AND (rr.scope_type='all_org' OR rr.scope_type=p_scope_type)
  ), candidates AS (
    SELECT r.id rule_id,m.id membership_id,m.user_id,r.subject_type source_type,r.subject_id source_id,false is_fallback,r.priority
    FROM rules r
    LEFT JOIN membership_process_roles mpr ON r.subject_type='process_role' AND mpr.process_role_id=r.subject_id
      AND mpr.effective_from<=p_on_date AND (mpr.effective_to IS NULL OR mpr.effective_to>=p_on_date)
    LEFT JOIN position_assignments pa ON r.subject_type='staff_position' AND pa.staff_position_id=r.subject_id
      AND pa.status<>'ended' AND pa.effective_from<=p_on_date AND (pa.effective_to IS NULL OR pa.effective_to>=p_on_date)
    JOIN organization_memberships m ON m.id=COALESCE(mpr.membership_id,pa.membership_id,CASE WHEN r.subject_type='membership' THEN r.subject_id END)
    WHERE m.status='active' AND (p_scope_id IS NULL OR r.scope_ids='{}' OR p_scope_id=ANY(r.scope_ids))
  )
  SELECT rule_id,membership_id,user_id,source_type,source_id,is_fallback FROM candidates ORDER BY priority LIMIT 1
$$;

COMMIT;
