BEGIN;
ALTER TABLE staffing_plan_targets ALTER COLUMN effective_from DROP NOT NULL;
ALTER TABLE staffing_plan_targets ALTER COLUMN effective_from DROP DEFAULT;
ALTER TABLE staffing_plan_targets ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','closed'));
ALTER TABLE needs ADD COLUMN IF NOT EXISTS staffing_plan_target_id uuid REFERENCES staffing_plan_targets(id);
ALTER TABLE needs ADD COLUMN IF NOT EXISTS shift_kind text NOT NULL DEFAULT 'mixed' CHECK(shift_kind IN ('day','night','mixed'));
ALTER TABLE needs ADD COLUMN IF NOT EXISTS closure_reason text;
CREATE TABLE object_specialty_conditions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 object_id uuid NOT NULL REFERENCES objects(id), specialty_id uuid NOT NULL REFERENCES specialties(id),
 shift_kind text NOT NULL CHECK(shift_kind IN ('day','night','mixed')), schedule text,
 start_time time, end_time time, shift_duration_hours numeric(5,2), paid_hours numeric(5,2),
 payment_unit text CHECK(payment_unit IN ('hour','shift')), base_rate numeric(12,2),
 effective_from date, effective_to date, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','closed')),
 note text, created_by_user_id uuid NOT NULL REFERENCES app_users(id), updated_by_user_id uuid REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to>=effective_from),
 CHECK(shift_duration_hours IS NULL OR shift_duration_hours>0 AND shift_duration_hours<=24),
 CHECK(paid_hours IS NULL OR paid_hours>0 AND paid_hours<=24),
 CHECK(paid_hours IS NULL OR shift_duration_hours IS NULL OR paid_hours<=shift_duration_hours),
 CHECK(base_rate IS NULL OR base_rate>0), CHECK((base_rate IS NULL)=(payment_unit IS NULL))
);
CREATE INDEX object_specialty_conditions_scope ON object_specialty_conditions(organization_id,object_id,specialty_id,shift_kind,effective_from DESC);
ALTER TABLE object_specialty_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_specialty_conditions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON object_specialty_conditions USING(organization_id=app_current_organization_id()) WITH CHECK(organization_id=app_current_organization_id());
CREATE TRIGGER audit_object_specialty_conditions AFTER INSERT OR UPDATE OR DELETE ON object_specialty_conditions FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE OR REPLACE FUNCTION check_object_specialty_condition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM objects WHERE id=NEW.object_id AND organization_id=NEW.organization_id) OR NOT EXISTS(SELECT 1 FROM specialties WHERE id=NEW.specialty_id AND organization_id=NEW.organization_id) THEN
  RAISE EXCEPTION 'Condition reference belongs to another organization' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text||':'||NEW.object_id::text||':'||NEW.specialty_id::text||':'||NEW.shift_kind,76));
 IF NEW.status='active' AND EXISTS(SELECT 1 FROM object_specialty_conditions c WHERE c.organization_id=NEW.organization_id AND c.object_id=NEW.object_id AND c.specialty_id=NEW.specialty_id AND c.shift_kind=NEW.shift_kind AND c.status='active' AND c.id<>NEW.id AND daterange(c.effective_from,c.effective_to,'[]')&&daterange(NEW.effective_from,NEW.effective_to,'[]')) THEN
  RAISE EXCEPTION 'Периоды активных условий пересекаются' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER object_specialty_condition_integrity BEFORE INSERT OR UPDATE ON object_specialty_conditions FOR EACH ROW EXECUTE FUNCTION check_object_specialty_condition();
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS compensation_snapshot jsonb;
ALTER TABLE worker_object_assignments ALTER COLUMN effective_from DROP NOT NULL;
ALTER TABLE object_contact_assignments ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX object_contact_one_primary ON object_contact_assignments(organization_id,object_id) WHERE is_primary AND active;
ALTER TABLE worker_object_assignments ADD COLUMN IF NOT EXISTS source_condition_id uuid REFERENCES object_specialty_conditions(id);
ALTER TABLE worker_object_assignments ADD COLUMN IF NOT EXISTS paid_hours_override boolean NOT NULL DEFAULT false;
ALTER TABLE worker_object_assignments ADD COLUMN IF NOT EXISTS individual_schedule boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION sync_object_manager_responsibility() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF NEW.owner_user_id IS NOT DISTINCT FROM OLD.owner_user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_user_id IS NULL AND EXISTS(
    SELECT 1
    FROM worker_object_assignments a
    JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
    WHERE a.object_id=NEW.id
      AND (a.effective_from IS NULL OR a.effective_from<=current_date)
      AND (a.effective_to IS NULL OR a.effective_to>=current_date)
  ) THEN
    RAISE EXCEPTION 'Cannot clear object manager while active workers are assigned';
  END IF;

  UPDATE worker_object_assignments
  SET manager_user_id=NEW.owner_user_id
  WHERE object_id=NEW.id
    AND NEW.owner_user_id IS NOT NULL
    AND (effective_from IS NULL OR effective_from<=current_date)
    AND (effective_to IS NULL OR effective_to>=current_date)
    AND manager_user_id IS DISTINCT FROM NEW.owner_user_id;

  -- Preserve object-manager assignment history while keeping current access aligned.
  DELETE FROM object_assignments
  WHERE object_id=NEW.id
    AND responsibility_type='object_manager'
    AND effective_from=current_date
    AND (effective_to IS NULL OR effective_to>=current_date);

  UPDATE object_assignments
  SET effective_to=current_date-1
  WHERE object_id=NEW.id
    AND responsibility_type='object_manager'
    AND effective_from<current_date
    AND (effective_to IS NULL OR effective_to>=current_date);

  IF NEW.owner_user_id IS NOT NULL THEN
    v_actor:=NULLIF(current_setting('app.user_id',true),'')::uuid;
    INSERT INTO object_assignments(
      organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id
    )
    VALUES(
      NEW.organization_id,NEW.id,NEW.owner_user_id,'object_manager',current_date,v_actor
    );
  END IF;

  RETURN NEW;
END $$;


CREATE UNIQUE INDEX time_entries_unshifted_fact_unique ON time_entries(organization_id,worker_id,object_id,work_date) WHERE shift_id IS NULL;
CREATE OR REPLACE FUNCTION check_staffing_plan_target_contour() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM objects WHERE id=NEW.object_id AND organization_id=NEW.organization_id) OR NOT EXISTS(SELECT 1 FROM specialties WHERE id=NEW.specialty_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Staffing reference belongs to another organization' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text||':'||NEW.object_id::text,77));
 IF NEW.status='active' AND EXISTS(SELECT 1 FROM staffing_plan_targets t WHERE t.organization_id=NEW.organization_id AND t.object_id=NEW.object_id AND t.specialty_id=NEW.specialty_id AND t.shift_kind=NEW.shift_kind AND t.status='active' AND t.id<>NEW.id AND daterange(t.effective_from,t.effective_to,'[]')&&daterange(NEW.effective_from,NEW.effective_to,'[]')) THEN RAISE EXCEPTION 'Периоды активных строк плана пересекаются' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER staffing_plan_target_contour BEFORE INSERT OR UPDATE ON staffing_plan_targets FOR EACH ROW EXECUTE FUNCTION check_staffing_plan_target_contour();
CREATE OR REPLACE FUNCTION check_need_contour_references() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.staffing_plan_target_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM staffing_plan_targets t WHERE t.id=NEW.staffing_plan_target_id AND t.organization_id=NEW.organization_id AND t.object_id=NEW.object_id AND t.specialty_id=NEW.specialty_id AND t.shift_kind=NEW.shift_kind) THEN RAISE EXCEPTION 'Потребность не соответствует строке плана' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER need_contour_references BEFORE INSERT OR UPDATE ON needs FOR EACH ROW EXECUTE FUNCTION check_need_contour_references();
CREATE OR REPLACE FUNCTION check_assignment_condition_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source_condition_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM object_specialty_conditions c WHERE c.id=NEW.source_condition_id AND c.organization_id=NEW.organization_id AND c.object_id=NEW.object_id AND c.specialty_id=NEW.specialty_id) THEN RAISE EXCEPTION 'Условия не соответствуют организации, объекту или специальности назначения' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assignment_condition_reference BEFORE INSERT OR UPDATE OF source_condition_id,object_id,specialty_id,organization_id ON worker_object_assignments FOR EACH ROW EXECUTE FUNCTION check_assignment_condition_reference();
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_object_id uuid REFERENCES objects(id);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_specialty_id uuid REFERENCES specialties(id);
CREATE OR REPLACE FUNCTION check_candidate_preferred_references() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.preferred_object_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM objects WHERE id=NEW.preferred_object_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Объект кандидата принадлежит другой организации' USING ERRCODE='23514'; END IF;
 IF NEW.preferred_specialty_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM specialties WHERE id=NEW.preferred_specialty_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Специальность кандидата принадлежит другой организации' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER candidate_preferred_references BEFORE INSERT OR UPDATE OF preferred_object_id,preferred_specialty_id,organization_id ON candidates FOR EACH ROW EXECUTE FUNCTION check_candidate_preferred_references();
COMMIT;
