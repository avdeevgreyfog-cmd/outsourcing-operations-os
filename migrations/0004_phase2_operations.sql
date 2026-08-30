BEGIN;
CREATE TABLE launch_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 launch_id uuid NOT NULL REFERENCES launches(id) ON DELETE CASCADE, parent_task_id uuid REFERENCES launch_tasks(id) ON DELETE CASCADE,
 title text NOT NULL, owner_user_id uuid REFERENCES app_users(id), start_date date NOT NULL, end_date date NOT NULL,
 baseline_start date, baseline_end date, forecast_end date, progress_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK(progress_pct BETWEEN 0 AND 100),
 status text NOT NULL DEFAULT 'planned', risk_level text NOT NULL DEFAULT 'normal', is_milestone boolean NOT NULL DEFAULT false,
 is_critical boolean NOT NULL DEFAULT false, slack_days numeric(8,2), checklist_json jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_by_user_id uuid NOT NULL REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date >= start_date)
);
CREATE TABLE launch_task_dependencies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 predecessor_task_id uuid NOT NULL REFERENCES launch_tasks(id) ON DELETE CASCADE, successor_task_id uuid NOT NULL REFERENCES launch_tasks(id) ON DELETE CASCADE,
 dependency_type text NOT NULL DEFAULT 'finish_to_start', lag_days integer NOT NULL DEFAULT 0, created_by_user_id uuid NOT NULL REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(predecessor_task_id,successor_task_id), CHECK(predecessor_task_id<>successor_task_id)
);
CREATE TABLE incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 object_id uuid NOT NULL REFERENCES objects(id), worker_id uuid REFERENCES worker_profiles(id), shift_id uuid REFERENCES shifts(id),
 incident_type text NOT NULL, severity text NOT NULL DEFAULT 'normal', status text NOT NULL DEFAULT 'open', title text NOT NULL,
 description text NOT NULL, occurred_at timestamptz NOT NULL, responsible_user_id uuid REFERENCES app_users(id), resolution text,
 resolved_at timestamptz, created_by_user_id uuid NOT NULL REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['launch_tasks','launch_task_dependencies','incidents'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id())',table_name);
 END LOOP; END $$;
CREATE TRIGGER audit_launch_tasks AFTER INSERT OR UPDATE OR DELETE ON launch_tasks FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_incidents AFTER INSERT OR UPDATE OR DELETE ON incidents FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE INDEX idx_launch_tasks_launch_dates ON launch_tasks(organization_id,launch_id,start_date,end_date);
CREATE INDEX idx_incidents_object_status ON incidents(organization_id,object_id,status,occurred_at DESC);
COMMIT;
