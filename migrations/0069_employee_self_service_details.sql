-- Self-service supplements existing worker, object and timesheet entities.
-- No destructive changes. Requirements can be customized by object and employment type.
CREATE TABLE IF NOT EXISTS object_worker_document_requirements (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
 relation_type text NOT NULL CHECK (relation_type IN ('employment','gph','npd','custom')),
 document_code text NOT NULL CHECK (document_code IN ('passport','snils','inn','bank_details','military','medical_book','photo','application','contract')),
 required boolean NOT NULL DEFAULT true,
 updated_by_user_id uuid REFERENCES app_users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(object_id,relation_type,document_code)
);
CREATE TABLE IF NOT EXISTS worker_document_checklist (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
 object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
 document_code text NOT NULL,
 employee_reported_at timestamptz,
 manager_verified_at timestamptz,
 manager_verified_by_user_id uuid REFERENCES app_users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(worker_id,object_id,document_code)
);
CREATE INDEX IF NOT EXISTS worker_document_checklist_scope ON worker_document_checklist(organization_id,object_id,worker_id);
-- Individual schedule correction; never mutate a shared shift definition.
CREATE TABLE IF NOT EXISTS worker_shift_time_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
 object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
 work_date date NOT NULL,
 start_time time NOT NULL,
 end_time time NOT NULL,
 ends_next_day boolean NOT NULL DEFAULT false,
 applies_to text NOT NULL DEFAULT 'single' CHECK(applies_to IN ('single','regular')),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','rejected')),
 source_link_id uuid NOT NULL REFERENCES worker_timesheet_links(id),
 reviewed_by_user_id uuid REFERENCES app_users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(worker_id,object_id,work_date)
);
CREATE INDEX IF NOT EXISTS worker_shift_time_changes_scope ON worker_shift_time_changes(organization_id,object_id,work_date,status);
ALTER TABLE object_shift_reporting_settings ADD COLUMN IF NOT EXISTS manager_phone text;
ALTER TABLE object_worker_document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_worker_document_requirements FORCE ROW LEVEL SECURITY;
ALTER TABLE worker_document_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_document_checklist FORCE ROW LEVEL SECURITY;
ALTER TABLE worker_shift_time_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_shift_time_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON object_worker_document_requirements USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE POLICY tenant_isolation ON worker_document_checklist USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE POLICY tenant_isolation ON worker_shift_time_changes USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_object_worker_document_requirements AFTER INSERT OR UPDATE OR DELETE ON object_worker_document_requirements FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_worker_document_checklist AFTER INSERT OR UPDATE OR DELETE ON worker_document_checklist FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_worker_shift_time_changes AFTER INSERT OR UPDATE OR DELETE ON worker_shift_time_changes FOR EACH ROW EXECUTE FUNCTION audit_row_change();
