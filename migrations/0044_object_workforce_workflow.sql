BEGIN;

-- Object workforce workflow: operational defaults are snapshotted to each worker assignment.
-- Historical assignments keep their own schedule/payment/adaptation settings when object defaults change later.
ALTER TABLE objects
  ADD COLUMN IF NOT EXISTS default_transition_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS default_daily_payment_shifts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_schedule_work_days integer,
  ADD COLUMN IF NOT EXISTS default_schedule_rest_days integer,
  ADD COLUMN IF NOT EXISTS default_shift_kind text NOT NULL DEFAULT 'mixed',
  ADD COLUMN IF NOT EXISTS ppe_task_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ppe_task_due_days integer;

ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_default_transition_days_check;
ALTER TABLE objects ADD CONSTRAINT objects_default_transition_days_check CHECK (default_transition_days BETWEEN 0 AND 90);
ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_default_daily_payment_shifts_check;
ALTER TABLE objects ADD CONSTRAINT objects_default_daily_payment_shifts_check CHECK (default_daily_payment_shifts BETWEEN 0 AND 31);
ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_default_schedule_work_days_check;
ALTER TABLE objects ADD CONSTRAINT objects_default_schedule_work_days_check CHECK (default_schedule_work_days IS NULL OR default_schedule_work_days BETWEEN 1 AND 31);
ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_default_schedule_rest_days_check;
ALTER TABLE objects ADD CONSTRAINT objects_default_schedule_rest_days_check CHECK (default_schedule_rest_days IS NULL OR default_schedule_rest_days BETWEEN 0 AND 31);
ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_default_schedule_pair_check;
ALTER TABLE objects ADD CONSTRAINT objects_default_schedule_pair_check CHECK ((default_schedule_work_days IS NULL)=(default_schedule_rest_days IS NULL));
ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_default_shift_kind_check;
ALTER TABLE objects ADD CONSTRAINT objects_default_shift_kind_check CHECK (default_shift_kind IN ('day','night','mixed'));
ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_ppe_task_due_days_check;
ALTER TABLE objects ADD CONSTRAINT objects_ppe_task_due_days_check CHECK (ppe_task_due_days IS NULL OR ppe_task_due_days BETWEEN 0 AND 90);

ALTER TABLE worker_object_assignments
  ADD COLUMN IF NOT EXISTS transition_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS daily_payment_shifts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schedule_work_days integer,
  ADD COLUMN IF NOT EXISTS schedule_rest_days integer,
  ADD COLUMN IF NOT EXISTS schedule_shift_kind text NOT NULL DEFAULT 'mixed',
  ADD COLUMN IF NOT EXISTS schedule_anchor_date date;

ALTER TABLE worker_object_assignments DROP CONSTRAINT IF EXISTS worker_assignment_transition_days_check;
ALTER TABLE worker_object_assignments ADD CONSTRAINT worker_assignment_transition_days_check CHECK (transition_days BETWEEN 0 AND 90);
ALTER TABLE worker_object_assignments DROP CONSTRAINT IF EXISTS worker_assignment_daily_payment_shifts_check;
ALTER TABLE worker_object_assignments ADD CONSTRAINT worker_assignment_daily_payment_shifts_check CHECK (daily_payment_shifts BETWEEN 0 AND 31);
ALTER TABLE worker_object_assignments DROP CONSTRAINT IF EXISTS worker_assignment_schedule_work_days_check;
ALTER TABLE worker_object_assignments ADD CONSTRAINT worker_assignment_schedule_work_days_check CHECK (schedule_work_days IS NULL OR schedule_work_days BETWEEN 1 AND 31);
ALTER TABLE worker_object_assignments DROP CONSTRAINT IF EXISTS worker_assignment_schedule_rest_days_check;
ALTER TABLE worker_object_assignments ADD CONSTRAINT worker_assignment_schedule_rest_days_check CHECK (schedule_rest_days IS NULL OR schedule_rest_days BETWEEN 0 AND 31);
ALTER TABLE worker_object_assignments DROP CONSTRAINT IF EXISTS worker_assignment_schedule_pair_check;
ALTER TABLE worker_object_assignments ADD CONSTRAINT worker_assignment_schedule_pair_check CHECK ((schedule_work_days IS NULL)=(schedule_rest_days IS NULL));
ALTER TABLE worker_object_assignments DROP CONSTRAINT IF EXISTS worker_assignment_shift_kind_check;
ALTER TABLE worker_object_assignments ADD CONSTRAINT worker_assignment_shift_kind_check CHECK (schedule_shift_kind IN ('day','night','mixed'));

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS employment_documents_status text NOT NULL DEFAULT 'not_received';
ALTER TABLE worker_profiles DROP CONSTRAINT IF EXISTS worker_profiles_employment_documents_status_check;
ALTER TABLE worker_profiles ADD CONSTRAINT worker_profiles_employment_documents_status_check
  CHECK (employment_documents_status IN ('not_received','collecting','received','submitted','processing','completed','problem'));

ALTER TABLE candidate_applications
  ADD COLUMN IF NOT EXISTS planned_shift_kind text;
ALTER TABLE candidate_applications DROP CONSTRAINT IF EXISTS candidate_applications_planned_shift_kind_check;
ALTER TABLE candidate_applications ADD CONSTRAINT candidate_applications_planned_shift_kind_check
  CHECK (planned_shift_kind IS NULL OR planned_shift_kind IN ('day','night','mixed'));

-- Existing active assignments inherit the current object defaults once. Future changes do not rewrite them.
UPDATE worker_object_assignments a
SET transition_days=o.default_transition_days,
    daily_payment_shifts=o.default_daily_payment_shifts,
    schedule_work_days=COALESCE(a.schedule_work_days,o.default_schedule_work_days),
    schedule_rest_days=COALESCE(a.schedule_rest_days,o.default_schedule_rest_days),
    schedule_shift_kind=CASE WHEN a.schedule_shift_kind='mixed' THEN o.default_shift_kind ELSE a.schedule_shift_kind END,
    schedule_anchor_date=COALESCE(a.schedule_anchor_date,a.effective_from)
FROM objects o
WHERE o.id=a.object_id AND a.effective_to IS NULL;

-- If a formal employment relation already exists, operational documents are treated as completed.
UPDATE worker_profiles w
SET employment_documents_status='completed'
WHERE EXISTS (
  SELECT 1 FROM employment_relations er
  WHERE er.worker_id=w.id AND er.effective_from<=current_date AND (er.effective_to IS NULL OR er.effective_to>=current_date)
);

CREATE INDEX IF NOT EXISTS idx_worker_assignments_schedule
  ON worker_object_assignments(organization_id,object_id,schedule_shift_kind,effective_to);
CREATE INDEX IF NOT EXISTS idx_candidate_app_planned_start
  ON candidate_applications(organization_id,object_id,planned_start_date,stage)
  WHERE planned_start_date IS NOT NULL;

COMMIT;
