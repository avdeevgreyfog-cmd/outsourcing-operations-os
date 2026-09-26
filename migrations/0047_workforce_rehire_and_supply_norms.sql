BEGIN;

-- Workforce lifecycle refinement:
-- planned exits can hand a former worker back to recruiting without creating a second person card.
ALTER TABLE worker_exit_processes
  ADD COLUMN IF NOT EXISTS return_to_recruiting boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recruiting_candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recruiting_handoff_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_worker_exit_recruiting_handoff
  ON worker_exit_processes(organization_id,return_to_recruiting,status,effective_date)
  WHERE return_to_recruiting;

CREATE INDEX IF NOT EXISTS idx_candidates_status_updated
  ON candidates(organization_id,status,updated_at DESC);

-- Object equipment norms remain object-specific. Actual stock and movement stay in inventory.
ALTER TABLE object_ppe_template_items
  ADD COLUMN IF NOT EXISTS replacement_cycle_days integer;

ALTER TABLE object_ppe_template_items DROP CONSTRAINT IF EXISTS object_ppe_template_items_replacement_cycle_days_check;
ALTER TABLE object_ppe_template_items ADD CONSTRAINT object_ppe_template_items_replacement_cycle_days_check
  CHECK (replacement_cycle_days IS NULL OR replacement_cycle_days BETWEEN 1 AND 3650);

COMMIT;
