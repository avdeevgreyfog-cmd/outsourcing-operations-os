BEGIN;

ALTER TABLE launches
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE launches l
SET actual_start_date=o.actual_start_date
FROM objects o
WHERE o.id=l.object_id
  AND l.actual_start_date IS NULL
  AND o.actual_start_date IS NOT NULL;

ALTER TABLE launch_staffing_waves
  ADD COLUMN IF NOT EXISTS need_id uuid REFERENCES needs(id);

CREATE INDEX IF NOT EXISTS idx_launch_staffing_waves_need
  ON launch_staffing_waves(organization_id,need_id,target_date)
  WHERE need_id IS NOT NULL;

UPDATE launch_tasks
SET blocks_launch=false,
    is_critical=false,
    updated_at=now()
WHERE lower(title) IN ('первый выход','старт объекта');

UPDATE launch_tasks t
SET status='done',
    progress_pct=100,
    updated_at=now()
WHERE t.category='contracts'
  AND t.status NOT IN ('done','cancelled')
  AND EXISTS (
    SELECT 1
    FROM launches l
    JOIN objects o ON o.id=l.object_id
    JOIN contracts c ON c.id=o.contract_id
    WHERE l.id=t.launch_id
      AND c.launch_gate IN ('ready','exception')
  );

COMMIT;
