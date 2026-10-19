-- Keep the effective date separate from the individual cycle origin.
-- Existing versions retain their previous effective_from-based behavior.
ALTER TABLE worker_schedule_pattern_changes ADD COLUMN IF NOT EXISTS anchor_date date;
