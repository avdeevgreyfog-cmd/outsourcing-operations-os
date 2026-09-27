BEGIN;

ALTER TABLE objects
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS actual_end_date date;

ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_actual_period_check;
ALTER TABLE objects ADD CONSTRAINT objects_actual_period_check
  CHECK (actual_end_date IS NULL OR actual_start_date IS NULL OR actual_end_date >= actual_start_date);

-- Legacy records used target_start_date as the only available start marker.
-- Prefer the earliest factual worker assignment when it exists; otherwise preserve
-- the previous behaviour by using the stored target date as the initial actual date.
UPDATE objects o
SET actual_start_date=COALESCE(
  (
    SELECT min(woa.effective_from)
    FROM worker_object_assignments woa
    WHERE woa.object_id=o.id
  ),
  o.target_start_date
)
WHERE o.actual_start_date IS NULL
  AND o.status IN ('active','paused','completed','archived');

COMMIT;
