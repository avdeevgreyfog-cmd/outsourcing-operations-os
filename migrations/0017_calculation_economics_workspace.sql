BEGIN;

-- Calculations are versioned commercial workspaces. Historical versions stay immutable by convention;
-- a negotiation/recalculation cycle creates a new calculation that points to the previous one.
ALTER TABLE calculations ADD COLUMN version integer;
ALTER TABLE calculations ADD COLUMN supersedes_calculation_id uuid REFERENCES calculations(id) ON DELETE SET NULL;
ALTER TABLE calculations ADD COLUMN economics_date date;
ALTER TABLE calculations ADD COLUMN project_costs_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE calculations ADD COLUMN allocation_mode text NOT NULL DEFAULT 'headcount';
ALTER TABLE calculations ADD CONSTRAINT calculations_allocation_mode_check CHECK (allocation_mode IN ('headcount','labor_hours'));

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id, COALESCE(request_id,tender_id)
           ORDER BY created_at,id
         )::int AS next_version,
         lag(id) OVER (
           PARTITION BY organization_id, COALESCE(request_id,tender_id)
           ORDER BY created_at,id
         ) AS previous_id
  FROM calculations
)
UPDATE calculations c
SET version=r.next_version,
    supersedes_calculation_id=COALESCE(c.supersedes_calculation_id,r.previous_id)
FROM ranked r
WHERE r.id=c.id;

UPDATE calculations c
SET economics_date=COALESCE(r.expected_start_date,c.created_at::date)
FROM requests r
WHERE c.request_id=r.id AND c.economics_date IS NULL;

UPDATE calculations
SET economics_date=created_at::date
WHERE tender_id IS NOT NULL AND economics_date IS NULL;

ALTER TABLE calculations ALTER COLUMN version SET DEFAULT 1;
ALTER TABLE calculations ALTER COLUMN version SET NOT NULL;
-- Legacy import/seed paths may omit this new field. Runtime calculation creation writes the
-- business economics date explicitly; current_date is only the safe compatibility fallback.
ALTER TABLE calculations ALTER COLUMN economics_date SET DEFAULT current_date;
ALTER TABLE calculations ALTER COLUMN economics_date SET NOT NULL;

CREATE UNIQUE INDEX calculations_request_version_uq
  ON calculations(organization_id,request_id,version)
  WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX calculations_tender_version_uq
  ON calculations(organization_id,tender_id,version)
  WHERE tender_id IS NOT NULL;
CREATE INDEX calculations_supersedes_idx
  ON calculations(organization_id,supersedes_calculation_id)
  WHERE supersedes_calculation_id IS NOT NULL;

-- Scenarios are immutable snapshots too. New edits become a new scenario version and may point to
-- the scenario that was used as their source.
ALTER TABLE calculation_scenarios ADD COLUMN version integer;
ALTER TABLE calculation_scenarios ADD COLUMN supersedes_scenario_id uuid REFERENCES calculation_scenarios(id) ON DELETE SET NULL;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY calculation_id, COALESCE(request_role_id,tender_role_id)
           ORDER BY created_at,id
         )::int AS next_version,
         lag(id) OVER (
           PARTITION BY calculation_id, COALESCE(request_role_id,tender_role_id)
           ORDER BY created_at,id
         ) AS previous_id
  FROM calculation_scenarios
)
UPDATE calculation_scenarios cs
SET version=r.next_version,
    supersedes_scenario_id=COALESCE(cs.supersedes_scenario_id,r.previous_id)
FROM ranked r
WHERE r.id=cs.id;

ALTER TABLE calculation_scenarios ALTER COLUMN version SET DEFAULT 1;
ALTER TABLE calculation_scenarios ALTER COLUMN version SET NOT NULL;
CREATE INDEX calculation_scenarios_version_idx
  ON calculation_scenarios(organization_id,calculation_id,request_role_id,tender_role_id,version DESC);
CREATE INDEX calculation_scenarios_supersedes_idx
  ON calculation_scenarios(organization_id,supersedes_scenario_id)
  WHERE supersedes_scenario_id IS NOT NULL;

-- Keep the tenant-integrity checks aware of version links.
CREATE OR REPLACE FUNCTION validate_calculation_source_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.request_id IS NOT NULL AND organization_reference_org('requests',NEW.request_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'calculation request belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NEW.tender_id IS NOT NULL AND organization_reference_org('tenders',NEW.tender_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'calculation tender belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NEW.supersedes_calculation_id IS NOT NULL AND organization_reference_org('calculations',NEW.supersedes_calculation_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'superseded calculation belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.owner_user_id)
    OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.created_by_user_id)
    OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.approved_by_user_id) THEN
    RAISE EXCEPTION 'calculation user reference belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_calculation_scenario_source_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE calc_request uuid; calc_tender uuid; role_request uuid; role_tender uuid;
BEGIN
  IF organization_reference_org('calculations',NEW.calculation_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'calculation scenario calculation belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF organization_reference_org('calculation_models',NEW.model_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'calculation model belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NEW.rule_version_id IS NOT NULL AND organization_reference_org('calculation_rule_versions',NEW.rule_version_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'calculation rule version belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NEW.supersedes_scenario_id IS NOT NULL AND organization_reference_org('calculation_scenarios',NEW.supersedes_scenario_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'superseded scenario belongs to another organization' USING ERRCODE='23514';
  END IF;
  SELECT request_id,tender_id INTO calc_request,calc_tender FROM calculations WHERE id=NEW.calculation_id;
  IF NEW.request_role_id IS NOT NULL THEN
    IF organization_reference_org('request_roles',NEW.request_role_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'request role belongs to another organization' USING ERRCODE='23514';
    END IF;
    SELECT request_id INTO role_request FROM request_roles WHERE id=NEW.request_role_id;
    IF calc_request IS NULL OR calc_tender IS NOT NULL OR role_request IS DISTINCT FROM calc_request THEN
      RAISE EXCEPTION 'scenario role does not belong to calculation request' USING ERRCODE='23514';
    END IF;
  ELSE
    IF organization_reference_org('tender_roles',NEW.tender_role_id) IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'tender role belongs to another organization' USING ERRCODE='23514';
    END IF;
    SELECT tender_id INTO role_tender FROM tender_roles WHERE id=NEW.tender_role_id;
    IF calc_tender IS NULL OR calc_request IS NOT NULL OR role_tender IS DISTINCT FROM calc_tender THEN
      RAISE EXCEPTION 'scenario role does not belong to calculation tender' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.created_by_user_id)
    OR NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.accepted_by_user_id) THEN
    RAISE EXCEPTION 'calculation scenario user belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
