BEGIN;

ALTER TABLE proposals
  ADD CONSTRAINT proposals_exported_file_fk FOREIGN KEY (exported_file_id) REFERENCES file_assets(id) DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION prevent_accepted_scenario_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'accepted' AND (
    NEW.inputs_snapshot IS DISTINCT FROM OLD.inputs_snapshot OR
    NEW.cost_snapshot IS DISTINCT FROM OLD.cost_snapshot OR
    NEW.result_snapshot IS DISTINCT FROM OLD.result_snapshot OR
    NEW.model_id IS DISTINCT FROM OLD.model_id OR
    NEW.rule_version_id IS DISTINCT FROM OLD.rule_version_id
  ) THEN
    RAISE EXCEPTION 'Accepted calculation scenario is immutable; create a new scenario/version instead';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER accepted_scenario_immutable
BEFORE UPDATE ON calculation_scenarios
FOR EACH ROW EXECUTE FUNCTION prevent_accepted_scenario_mutation();

CREATE OR REPLACE FUNCTION prevent_overlapping_worker_rates() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM worker_rates wr
    WHERE wr.worker_id = NEW.worker_id
      AND COALESCE(wr.object_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(NEW.object_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND wr.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND daterange(wr.effective_from, COALESCE(wr.effective_to, 'infinity'::date), '[]') && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
  ) THEN
    RAISE EXCEPTION 'Worker rate periods overlap for the same worker/object';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER worker_rate_no_overlap
BEFORE INSERT OR UPDATE ON worker_rates
FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_worker_rates();

COMMIT;
