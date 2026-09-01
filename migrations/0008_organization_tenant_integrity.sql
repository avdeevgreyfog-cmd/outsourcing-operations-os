BEGIN;

-- Every Organization Core reference must belong to the same tenant as the row
-- that owns it. Plain UUID foreign keys do not enforce this invariant.
CREATE OR REPLACE FUNCTION organization_reference_org(p_table regclass, p_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE result uuid;
BEGIN
  IF p_id IS NULL THEN RETURN NULL; END IF;
  EXECUTE format('SELECT organization_id FROM %s WHERE id=$1', p_table) INTO result USING p_id;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION validate_organization_reference_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE related_org uuid; subject_table regclass;
BEGIN
  IF TG_TABLE_NAME = 'organization_units' THEN
    IF NEW.parent_id IS NOT NULL AND organization_reference_org('organization_units',NEW.parent_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'parent organization unit belongs to another organization' USING ERRCODE='23514';
    END IF;
    IF NEW.region_id IS NOT NULL AND organization_reference_org('regions',NEW.region_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'region belongs to another organization' USING ERRCODE='23514';
    END IF;
    IF NEW.manager_membership_id IS NOT NULL AND organization_reference_org('organization_memberships',NEW.manager_membership_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'unit manager belongs to another organization' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'staff_positions' THEN
    IF organization_reference_org('positions',NEW.job_profile_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'job profile belongs to another organization' USING ERRCODE='23514'; END IF;
    IF organization_reference_org('organization_units',NEW.organization_unit_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'organization unit belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.legal_entity_id IS NOT NULL AND organization_reference_org('legal_entities',NEW.legal_entity_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'legal entity belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.region_id IS NOT NULL AND organization_reference_org('regions',NEW.region_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'region belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.reports_to_position_id IS NOT NULL AND organization_reference_org('staff_positions',NEW.reports_to_position_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'manager position belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'position_assignments' THEN
    IF organization_reference_org('staff_positions',NEW.staff_position_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'staff position belongs to another organization' USING ERRCODE='23514'; END IF;
    IF organization_reference_org('organization_memberships',NEW.membership_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'employee belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'membership_organization_units' THEN
    IF organization_reference_org('organization_memberships',NEW.membership_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'employee belongs to another organization' USING ERRCODE='23514'; END IF;
    IF organization_reference_org('organization_units',NEW.organization_unit_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'organization unit belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'organization_unit_leads' THEN
    IF organization_reference_org('organization_units',NEW.organization_unit_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'organization unit belongs to another organization' USING ERRCODE='23514'; END IF;
    IF organization_reference_org('organization_memberships',NEW.membership_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'unit lead belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'membership_process_roles' THEN
    IF organization_reference_org('organization_memberships',NEW.membership_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'employee belongs to another organization' USING ERRCODE='23514'; END IF;
    IF organization_reference_org('process_roles',NEW.process_role_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'process role belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.org_unit_id IS NOT NULL AND organization_reference_org('organization_units',NEW.org_unit_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'process role scope belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'position_permission_grants' THEN
    IF organization_reference_org('positions',NEW.position_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'job profile belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'process_role_permission_grants' THEN
    IF organization_reference_org('process_roles',NEW.process_role_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'process role belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'organization_change_items' THEN
    IF organization_reference_org('organization_change_sets',NEW.change_set_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'change set belongs to another organization' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'responsibility_rules' THEN
    subject_table := CASE NEW.subject_type WHEN 'process_role' THEN 'process_roles'::regclass WHEN 'staff_position' THEN 'staff_positions'::regclass WHEN 'org_unit' THEN 'organization_units'::regclass WHEN 'membership' THEN 'organization_memberships'::regclass END;
    IF organization_reference_org(subject_table,NEW.subject_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'responsibility subject belongs to another organization' USING ERRCODE='23514'; END IF;
    IF NEW.fallback_subject_id IS NOT NULL THEN
      subject_table := CASE NEW.fallback_subject_type WHEN 'process_role' THEN 'process_roles'::regclass WHEN 'staff_position' THEN 'staff_positions'::regclass WHEN 'org_unit' THEN 'organization_units'::regclass WHEN 'membership' THEN 'organization_memberships'::regclass END;
      IF organization_reference_org(subject_table,NEW.fallback_subject_id) IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'responsibility fallback belongs to another organization' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER organization_units_tenant_integrity BEFORE INSERT OR UPDATE ON organization_units FOR EACH ROW EXECUTE FUNCTION validate_organization_reference_integrity();
CREATE TRIGGER membership_units_tenant_integrity BEFORE INSERT OR UPDATE ON membership_organization_units FOR EACH ROW EXECUTE FUNCTION validate_organization_reference_integrity();
CREATE TRIGGER organization_unit_leads_tenant_integrity BEFORE INSERT OR UPDATE ON organization_unit_leads FOR EACH ROW EXECUTE FUNCTION validate_organization_reference_integrity();
CREATE TRIGGER position_grants_tenant_integrity BEFORE INSERT OR UPDATE ON position_permission_grants FOR EACH ROW EXECUTE FUNCTION validate_organization_reference_integrity();
CREATE TRIGGER process_role_grants_tenant_integrity BEFORE INSERT OR UPDATE ON process_role_permission_grants FOR EACH ROW EXECUTE FUNCTION validate_organization_reference_integrity();
CREATE TRIGGER organization_change_items_tenant_integrity BEFORE INSERT OR UPDATE ON organization_change_items FOR EACH ROW EXECUTE FUNCTION validate_organization_reference_integrity();
CREATE TRIGGER responsibility_rules_tenant_integrity BEFORE INSERT OR UPDATE ON responsibility_rules FOR EACH ROW EXECUTE FUNCTION validate_organization_reference_integrity();

-- Resolve the factual executor from a process role, staff position, unit lead,
-- direct membership or the rule's fallback. Executor rules take precedence over
-- owner rules; approver/observer rules are intentionally resolved separately.
CREATE OR REPLACE FUNCTION resolve_organization_responsibility(
  p_process_code text,p_step_code text,p_scope_type text DEFAULT 'all_org',p_scope_id uuid DEFAULT NULL,p_on_date date DEFAULT current_date
) RETURNS TABLE(rule_id uuid,membership_id uuid,user_id uuid,source_type text,source_id uuid,is_fallback boolean)
LANGUAGE sql STABLE AS $$
  WITH rules AS (
    SELECT rr.*,row_number() OVER (ORDER BY CASE rr.responsibility_type WHEN 'executor' THEN 0 ELSE 1 END,rr.effective_from DESC,rr.created_at DESC) priority
    FROM responsibility_rules rr
    WHERE rr.organization_id=app_current_organization_id() AND rr.process_code=p_process_code AND rr.step_code=p_step_code
      AND rr.responsibility_type IN ('executor','owner') AND rr.active AND rr.effective_from<=p_on_date
      AND (rr.effective_to IS NULL OR rr.effective_to>=p_on_date)
      AND (rr.scope_type='all_org' OR rr.scope_type=p_scope_type)
      AND (p_scope_id IS NULL OR rr.scope_ids='{}' OR p_scope_id=ANY(rr.scope_ids))
  ), subjects AS (
    SELECT id rule_id,subject_type,subject_id,false is_fallback,priority FROM rules
    UNION ALL
    SELECT id,fallback_subject_type,fallback_subject_id,true,priority FROM rules WHERE fallback_subject_id IS NOT NULL
  ), candidates AS (
    SELECT s.rule_id,m.id membership_id,m.user_id,s.subject_type source_type,s.subject_id source_id,s.is_fallback,s.priority
    FROM subjects s
    LEFT JOIN membership_process_roles mpr ON s.subject_type='process_role' AND mpr.process_role_id=s.subject_id
      AND mpr.effective_from<=p_on_date AND (mpr.effective_to IS NULL OR mpr.effective_to>=p_on_date)
    LEFT JOIN position_assignments pa ON s.subject_type='staff_position' AND pa.staff_position_id=s.subject_id
      AND pa.status<>'ended' AND pa.effective_from<=p_on_date AND (pa.effective_to IS NULL OR pa.effective_to>=p_on_date)
    LEFT JOIN organization_unit_leads oul ON s.subject_type='org_unit' AND oul.organization_unit_id=s.subject_id
      AND oul.lead_type='primary' AND oul.effective_from<=p_on_date AND (oul.effective_to IS NULL OR oul.effective_to>=p_on_date)
    JOIN organization_memberships m ON m.id=COALESCE(mpr.membership_id,pa.membership_id,oul.membership_id,CASE WHEN s.subject_type='membership' THEN s.subject_id END)
    WHERE m.organization_id=app_current_organization_id() AND m.status='active'
  ), ranked AS (
    SELECT *,row_number() OVER (PARTITION BY rule_id ORDER BY is_fallback,membership_id) subject_rank FROM candidates
  )
  SELECT rule_id,membership_id,user_id,source_type,source_id,is_fallback
  FROM ranked ORDER BY priority,subject_rank LIMIT 1
$$;

COMMIT;
