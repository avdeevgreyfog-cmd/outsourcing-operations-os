BEGIN;

CREATE TABLE proposal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'operis' CHECK (kind IN ('operis','docx')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  is_default boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_file_name text,
  source_docx bytea,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='docx' AND source_docx IS NOT NULL AND source_file_name IS NOT NULL) OR kind='operis')
);

CREATE UNIQUE INDEX proposal_templates_name_version_unique
  ON proposal_templates(organization_id,lower(name),version);
CREATE UNIQUE INDEX proposal_templates_one_default
  ON proposal_templates(organization_id) WHERE is_default AND status='active';
CREATE INDEX proposal_templates_org_status_idx
  ON proposal_templates(organization_id,status,updated_at DESC);

ALTER TABLE proposal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON proposal_templates
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

CREATE TRIGGER audit_proposal_templates
AFTER INSERT OR UPDATE OR DELETE ON proposal_templates
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Existing tenants receive a neutral price-led default. New tenants can create the same
-- default lazily through the application if no template exists yet.
INSERT INTO proposal_templates(
  organization_id,name,kind,version,status,is_default,config_json,created_by_user_id
)
SELECT o.id,'Стандартное КП OPERIS','operis',1,'active',true,
  jsonb_build_object(
    'documentTitle','Предоставление линейного персонала',
    'intro','Предлагаем ставки на предоставление персонала. Условия объекта, график, численность и дата запуска согласовываются отдельно.',
    'priceDisplay','both',
    'showIncluded',false,
    'showClientProvides',false,
    'showTerms',false,
    'showManager',true,
    'showCta',true,
    'cta','Готовы приступить к выводу персонала после согласования условий.',
    'accent','#183d34'
  ),
  COALESCE((SELECT m.user_id FROM organization_memberships m WHERE m.organization_id=o.id AND m.status='active' ORDER BY m.created_at LIMIT 1),
           (SELECT u.id FROM app_users u ORDER BY u.created_at LIMIT 1))
FROM organizations o
WHERE EXISTS(SELECT 1 FROM app_users)
  AND NOT EXISTS(SELECT 1 FROM proposal_templates pt WHERE pt.organization_id=o.id);

COMMIT;
