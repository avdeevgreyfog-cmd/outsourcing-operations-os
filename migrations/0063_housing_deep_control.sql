BEGIN;

-- Deeper housing control: multi-object usage, separate planned/actual checkout,
-- room metadata, housing documents and audit-friendly operational details.

ALTER TABLE housing_sites
  ADD COLUMN IF NOT EXISTS site_type text NOT NULL DEFAULT 'dormitory'
    CHECK (site_type IN ('dormitory','hostel','apartment','hotel','company_housing','other')),
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS check_in_rules text,
  ADD COLUMN IF NOT EXISTS check_out_rules text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS housing_site_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES housing_sites(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'service' CHECK (relation_type IN ('primary','service')),
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id,object_id)
);

INSERT INTO housing_site_objects(organization_id,site_id,object_id,relation_type,created_by_user_id)
SELECT hs.organization_id,hs.id,hs.primary_object_id,'primary',hs.created_by_user_id
FROM housing_sites hs
WHERE hs.primary_object_id IS NOT NULL
ON CONFLICT (site_id,object_id) DO UPDATE SET relation_type='primary',active=true,updated_at=now();

ALTER TABLE housing_units
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'room'
    CHECK (unit_type IN ('room','block','floor','other')),
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE housing_stays
  ADD COLUMN IF NOT EXISTS planned_check_out date,
  ADD COLUMN IF NOT EXISTS actual_check_in date,
  ADD COLUMN IF NOT EXISTS actual_check_out date,
  ADD COLUMN IF NOT EXISTS exit_process_id uuid REFERENCES worker_exit_processes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checkout_note text,
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

UPDATE housing_stays
SET planned_check_out=COALESCE(planned_check_out,check_out)
WHERE check_out IS NOT NULL AND planned_check_out IS NULL;

UPDATE housing_stays
SET actual_check_in=COALESCE(actual_check_in,check_in)
WHERE status IN ('active','completed') AND actual_check_in IS NULL;

UPDATE housing_stays
SET actual_check_out=COALESCE(actual_check_out,check_out)
WHERE status='completed' AND check_out IS NOT NULL AND actual_check_out IS NULL;

ALTER TABLE housing_stays
  DROP CONSTRAINT IF EXISTS housing_stays_planned_checkout_check;
ALTER TABLE housing_stays
  ADD CONSTRAINT housing_stays_planned_checkout_check
  CHECK (planned_check_out IS NULL OR planned_check_out >= check_in);

ALTER TABLE housing_stays
  DROP CONSTRAINT IF EXISTS housing_stays_actual_checkout_check;
ALTER TABLE housing_stays
  ADD CONSTRAINT housing_stays_actual_checkout_check
  CHECK (actual_check_out IS NULL OR actual_check_in IS NULL OR actual_check_out >= actual_check_in);

CREATE TABLE IF NOT EXISTS housing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES housing_sites(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES housing_contracts(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('contract','additional_agreement','act','invoice','rules','other')),
  document_number text,
  document_date date,
  source_url text,
  valid_from date,
  expires_at date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','needs_update','archived')),
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR valid_from IS NULL OR expires_at >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_housing_site_objects_site
  ON housing_site_objects(organization_id,site_id,active);
CREATE INDEX IF NOT EXISTS idx_housing_site_objects_object
  ON housing_site_objects(organization_id,object_id,active);
CREATE INDEX IF NOT EXISTS idx_housing_stays_planned_checkout
  ON housing_stays(organization_id,status,planned_check_out);
CREATE INDEX IF NOT EXISTS idx_housing_documents_site
  ON housing_documents(organization_id,site_id,status,expires_at);

ALTER TABLE housing_site_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE housing_site_objects FORCE ROW LEVEL SECURITY;
CREATE POLICY housing_site_objects_tenant_isolation ON housing_site_objects
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE housing_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE housing_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY housing_documents_tenant_isolation ON housing_documents
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

CREATE TRIGGER audit_housing_site_objects
  AFTER INSERT OR UPDATE OR DELETE ON housing_site_objects
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE TRIGGER audit_housing_documents
  AFTER INSERT OR UPDATE OR DELETE ON housing_documents
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
