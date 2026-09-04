BEGIN;

-- A request can have only one client-accepted commercial proposal. Historical
-- rejected/revision versions remain available and are never overwritten.
CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_one_accepted_per_request
  ON proposals(request_id) WHERE status='accepted';

-- Calculation scenarios point to a concrete rule version. Once a rule version was
-- used by any scenario its economic content becomes historical evidence. Closing
-- the effective period is still allowed; rewriting the actual rules is not.
CREATE OR REPLACE FUNCTION protect_used_calculation_rule_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM calculation_scenarios WHERE rule_version_id=OLD.id) THEN
      RAISE EXCEPTION 'Used calculation rule version cannot be deleted; create a new version instead';
    END IF;
    RETURN OLD;
  END IF;

  IF EXISTS(SELECT 1 FROM calculation_scenarios WHERE rule_version_id=OLD.id) AND (
    NEW.calculation_model_id IS DISTINCT FROM OLD.calculation_model_id OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.effective_from IS DISTINCT FROM OLD.effective_from OR
    NEW.rules_json IS DISTINCT FROM OLD.rules_json OR
    NEW.source IS DISTINCT FROM OLD.source
  ) THEN
    RAISE EXCEPTION 'Used calculation rule version is immutable; create a new version instead';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS calculation_rule_version_immutable ON calculation_rule_versions;
CREATE TRIGGER calculation_rule_version_immutable
BEFORE UPDATE OR DELETE ON calculation_rule_versions
FOR EACH ROW EXECUTE FUNCTION protect_used_calculation_rule_version();

COMMIT;
