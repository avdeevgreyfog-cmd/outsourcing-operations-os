BEGIN;
-- Resolve on the work date. No default date/rate is invented and no historic rows are backfilled.
CREATE OR REPLACE FUNCTION resolve_time_entry_compensation(org uuid, worker uuid, obj uuid, work_day date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE assignment worker_object_assignments%ROWTYPE; rate_row worker_rates%ROWTYPE; condition_row object_specialty_conditions%ROWTYPE;
 segment text; result jsonb := jsonb_build_object('capturedAt',now(),'workDate',work_day); value jsonb;
BEGIN
 SELECT * INTO assignment FROM worker_object_assignments a WHERE a.organization_id=org AND a.worker_id=worker AND a.object_id=obj
 AND (a.effective_from IS NULL OR a.effective_from<=work_day) AND(a.effective_to IS NULL OR a.effective_to>=work_day)
 ORDER BY a.effective_from DESC NULLS LAST,a.created_at DESC LIMIT 1;
 FOREACH segment IN ARRAY ARRAY['day','night'] LOOP
  SELECT * INTO rate_row FROM worker_rates r WHERE r.organization_id=org AND r.worker_id=worker AND(r.object_id=obj OR r.object_id IS NULL)
   AND (r.specialty_id IS NULL OR r.specialty_id=assignment.specialty_id)
   AND r.day_night IN(segment,'any') AND r.effective_from<=work_day AND(r.effective_to IS NULL OR r.effective_to>=work_day)
   ORDER BY (r.object_id=obj) DESC,(r.day_night=segment) DESC,r.effective_from DESC,r.created_at DESC LIMIT 1;
  SELECT * INTO condition_row FROM object_specialty_conditions c WHERE c.organization_id=org AND c.object_id=obj AND c.specialty_id=assignment.specialty_id
   AND c.shift_kind IN(segment,'mixed') AND c.status='active' AND(c.effective_from IS NULL OR c.effective_from<=work_day) AND(c.effective_to IS NULL OR c.effective_to>=work_day)
   ORDER BY (c.shift_kind=segment) DESC,c.effective_from DESC NULLS LAST,c.created_at DESC LIMIT 1;
  value:=jsonb_build_object('amount',COALESCE(rate_row.amount,condition_row.base_rate),'unit',COALESCE(rate_row.unit,condition_row.payment_unit),
   'paidHours',CASE WHEN assignment.source_condition_id IS NOT NULL AND NOT assignment.paid_hours_override THEN COALESCE(condition_row.paid_hours,assignment.paid_hours_per_shift) ELSE COALESCE(assignment.paid_hours_per_shift,condition_row.paid_hours) END,'durationHours',condition_row.shift_duration_hours,
   'source',CASE WHEN rate_row.id IS NOT NULL THEN 'worker_rate' WHEN condition_row.id IS NOT NULL THEN 'object_condition' ELSE NULL END,
   'sourceId',COALESCE(rate_row.id,condition_row.id));
  result:=result||jsonb_build_object(segment,value);
 END LOOP;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION freeze_time_entry_compensation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.compensation_snapshot IS NOT NULL THEN
  NEW.compensation_snapshot:=OLD.compensation_snapshot;
 ELSIF NEW.fact_hours>0 THEN
  NEW.compensation_snapshot:=resolve_time_entry_compensation(NEW.organization_id,NEW.worker_id,NEW.object_id,NEW.work_date);
 ELSE
  NEW.compensation_snapshot:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER freeze_time_entry_compensation BEFORE INSERT OR UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION freeze_time_entry_compensation();
COMMIT;
