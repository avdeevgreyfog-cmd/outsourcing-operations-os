BEGIN;

CREATE TABLE tender_bid_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  round_number integer NOT NULL CHECK (round_number > 0),
  bid_value numeric(16,2) NOT NULL CHECK (bid_value > 0),
  price_vat_mode text NOT NULL DEFAULT 'unknown' CHECK (price_vat_mode IN ('unknown','with_vat','without_vat','not_applicable')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'auction' CHECK (source IN ('submission','auction','correction','manual')),
  reference text,
  note text,
  economics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tender_id,round_number)
);

CREATE INDEX idx_tender_bid_rounds_history
  ON tender_bid_rounds(organization_id,tender_id,occurred_at DESC,round_number DESC);

-- Preserve the price already recorded by existing submitted tenders. Historical VAT/economics
-- are deliberately not reconstructed because the old model did not keep those facts.
INSERT INTO tender_bid_rounds(
  organization_id,tender_id,round_number,bid_value,price_vat_mode,occurred_at,source,
  reference,note,economics_snapshot,recorded_by_user_id
)
SELECT
  t.organization_id,t.id,1,t.final_bid_value,'unknown',
  COALESCE(t.submitted_at,t.updated_at,t.created_at),'submission',
  t.bid_reference,t.submission_note,
  jsonb_build_object(
    'status','incomplete',
    'revenueNet',NULL,
    'totalCostNet',NULL,
    'marginPct',NULL,
    'vatPct',NULL,
    'missing',jsonb_build_array('Историческая цена перенесена без снимка экономики'),
    'sources','[]'::jsonb
  ),
  COALESCE(t.submitted_by_user_id,t.owner_user_id,t.created_by_user_id)
FROM tenders t
WHERE t.final_bid_value IS NOT NULL AND t.final_bid_value > 0
ON CONFLICT (tender_id,round_number) DO NOTHING;

ALTER TABLE tender_bid_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_bid_rounds FORCE ROW LEVEL SECURITY;
CREATE POLICY tender_bid_rounds_tenant_isolation ON tender_bid_rounds
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

CREATE OR REPLACE FUNCTION validate_tender_bid_round_context() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF organization_reference_org('tenders',NEW.tender_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'tender bid round belongs to another organization' USING ERRCODE='23514';
  END IF;
  IF NOT commercial_user_belongs_to_org(NEW.organization_id,NEW.recorded_by_user_id) THEN
    RAISE EXCEPTION 'tender bid round user belongs to another organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tender_bid_round_context_integrity
BEFORE INSERT ON tender_bid_rounds
FOR EACH ROW EXECUTE FUNCTION validate_tender_bid_round_context();

CREATE OR REPLACE FUNCTION prevent_tender_bid_round_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tender bid rounds are immutable; append a correction round instead' USING ERRCODE='55000';
END $$;

CREATE TRIGGER tender_bid_round_immutable
BEFORE UPDATE ON tender_bid_rounds
FOR EACH ROW EXECUTE FUNCTION prevent_tender_bid_round_update();

CREATE TRIGGER audit_tender_bid_rounds
AFTER INSERT OR DELETE ON tender_bid_rounds
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
