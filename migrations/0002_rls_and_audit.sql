BEGIN;

CREATE OR REPLACE FUNCTION app_current_organization_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- Organization isolation is enforced in PostgreSQL. Fine-grained capability/scope
-- authorization is additionally enforced in server code before queries/actions.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'teams','regions','role_templates','organization_memberships','membership_teams','membership_regions',
    'permission_grants','user_permission_overrides','specialties','client_companies','contacts',
    'leads','requests','request_roles','rate_reference_entries','calculation_models','calculation_rule_versions',
    'calculations','calculation_scenarios','proposals','objects','object_assignments','launches','needs','need_assignments',
    'candidates','candidate_applications','candidate_stage_history','candidate_assignment_history','worker_profiles',
    'employment_relations','worker_rates','worker_object_assignments','shifts','shift_assignments','attendance_events',
    'time_entries','timesheet_snapshots','reconciliation_issues','worker_accruals','pay_adjustments','discipline_events',
    'advance_payments','worker_payments','client_rates','client_revenue_lines','object_expenses','pnl_snapshots',
    'tasks','file_assets','comments','activity_events','audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id())',
      table_name
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  org_id uuid;
  actor_id uuid;
  resource uuid;
BEGIN
  org_id := COALESCE((to_jsonb(NEW)->>'organization_id')::uuid, (to_jsonb(OLD)->>'organization_id')::uuid);
  actor_id := app_current_user_id();
  resource := COALESCE((to_jsonb(NEW)->>'id')::uuid, (to_jsonb(OLD)->>'id')::uuid);

  INSERT INTO audit_events(organization_id, actor_user_id, resource_type, resource_id, action, before_json, after_json)
  VALUES (
    org_id,
    actor_id,
    TG_TABLE_NAME,
    resource,
    lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END $$;

-- High-risk rows receive automatic before/after audit in addition to explicit business events.
CREATE TRIGGER audit_permission_grants AFTER INSERT OR UPDATE OR DELETE ON permission_grants FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_permission_overrides AFTER INSERT OR UPDATE OR DELETE ON user_permission_overrides FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_calculation_scenarios AFTER INSERT OR UPDATE OR DELETE ON calculation_scenarios FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_worker_rates AFTER INSERT OR UPDATE OR DELETE ON worker_rates FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_client_rates AFTER INSERT OR UPDATE OR DELETE ON client_rates FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_time_entries AFTER INSERT OR UPDATE OR DELETE ON time_entries FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_timesheet_snapshots AFTER INSERT OR UPDATE OR DELETE ON timesheet_snapshots FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_worker_accruals AFTER INSERT OR UPDATE OR DELETE ON worker_accruals FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_worker_payments AFTER INSERT OR UPDATE OR DELETE ON worker_payments FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
