BEGIN;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS telegram text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS max_contact text;

CREATE TABLE IF NOT EXISTS object_contact_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  roles text[] NOT NULL DEFAULT '{}'::text[],
  note text,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(object_id,contact_id)
);

CREATE OR REPLACE FUNCTION enforce_object_contact_client() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_object_client uuid;
  v_contact_client uuid;
BEGIN
  SELECT client_company_id INTO v_object_client FROM objects WHERE id=NEW.object_id;
  SELECT client_company_id INTO v_contact_client FROM contacts WHERE id=NEW.contact_id;
  IF v_object_client IS NULL OR v_contact_client IS NULL OR v_object_client<>v_contact_client THEN
    RAISE EXCEPTION 'Object contact must belong to the same client as the object';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS object_contact_client_guard ON object_contact_assignments;
CREATE TRIGGER object_contact_client_guard
BEFORE INSERT OR UPDATE OF object_id,contact_id ON object_contact_assignments
FOR EACH ROW EXECUTE FUNCTION enforce_object_contact_client();

ALTER TABLE object_contact_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_contact_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON object_contact_assignments;
CREATE POLICY tenant_isolation ON object_contact_assignments
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

DROP TRIGGER IF EXISTS audit_object_contact_assignments ON object_contact_assignments;
CREATE TRIGGER audit_object_contact_assignments
AFTER INSERT OR UPDATE OR DELETE ON object_contact_assignments
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE INDEX IF NOT EXISTS idx_object_contact_assignments_object
  ON object_contact_assignments(organization_id,object_id,active);
CREATE INDEX IF NOT EXISTS idx_object_contact_assignments_contact
  ON object_contact_assignments(organization_id,contact_id,active);

COMMIT;
