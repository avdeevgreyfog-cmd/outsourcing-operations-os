BEGIN;

CREATE TABLE IF NOT EXISTS object_operational_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  fact_key text NOT NULL,
  section text NOT NULL,
  label text NOT NULL,
  value_text text NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('proposed','confirmed','issue')),
  category text NOT NULL DEFAULT 'operations',
  audiences text[] NOT NULL DEFAULT ARRAY['operations']::text[],
  source_kind text NOT NULL DEFAULT 'manual' CHECK (source_kind IN ('request','site_visit','manual','system')),
  source_id uuid,
  confirmed_by_user_id uuid REFERENCES app_users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(object_id,fact_key)
);

ALTER TABLE object_operational_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_operational_facts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON object_operational_facts
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

CREATE TRIGGER audit_object_operational_facts
AFTER INSERT OR UPDATE OR DELETE ON object_operational_facts
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE INDEX IF NOT EXISTS idx_object_operational_facts_object
  ON object_operational_facts(organization_id,object_id,section);

CREATE INDEX IF NOT EXISTS idx_object_operational_facts_audiences
  ON object_operational_facts USING gin(audiences);

COMMIT;
