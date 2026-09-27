BEGIN;

UPDATE launch_tasks
SET blocks_launch=false,
    is_critical=false,
    updated_at=now()
WHERE lower(title)='готовность к первому выходу';

COMMIT;
