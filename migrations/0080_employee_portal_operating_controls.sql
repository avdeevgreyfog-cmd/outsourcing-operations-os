-- 0080: non-destructive employee portal evolution; existing issued tokens remain valid.
ALTER TABLE worker_timesheet_links
 ADD COLUMN IF NOT EXISTS link_config_override jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(link_config_override)='object'),
 ADD COLUMN IF NOT EXISTS last_manager_preview_at timestamptz,
 ADD COLUMN IF NOT EXISTS block_reason text CHECK (block_reason IS NULL OR block_reason IN ('manual','dismissal','expired','rotated'));

-- Audit actions without ever serializing bearer tokens or encrypted bearer credentials.
CREATE TABLE IF NOT EXISTS worker_portal_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 worker_id uuid NOT NULL REFERENCES worker_profiles(id),
 object_id uuid NOT NULL REFERENCES objects(id),
 link_id uuid REFERENCES worker_timesheet_links(id),
 actor_user_id uuid REFERENCES app_users(id),
 event_type text NOT NULL CHECK (event_type IN ('issued','copied','opened_by_employee','previewed_by_manager','paused','resumed','revoked','rotated','blocked_on_exit')),
 details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_worker_portal_events_link ON worker_portal_events(organization_id,link_id,created_at DESC);
ALTER TABLE worker_portal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_portal_events FORCE ROW LEVEL SECURITY;
CREATE POLICY worker_portal_events_tenant ON worker_portal_events
 USING (organization_id=app_current_organization_id())
 WITH CHECK (organization_id=app_current_organization_id());

-- The old generic audit trigger included token_hash and token_ciphertext in audit JSON.
-- Redact credentials for all subsequent events. Do not mutate existing historical audit.
CREATE OR REPLACE FUNCTION audit_worker_portal_links_redacted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
 source jsonb;
 before_safe jsonb;
 after_safe jsonb;
 org_id uuid;
 resource uuid;
BEGIN
 source := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 org_id := (source->>'organization_id')::uuid;
 resource := (source->>'id')::uuid;
 before_safe := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD)-'token_hash'-'token_ciphertext' ELSE NULL END;
 after_safe := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW)-'token_hash'-'token_ciphertext' ELSE NULL END;
 INSERT INTO audit_events(organization_id,actor_user_id,resource_type,resource_id,action,before_json,after_json)
 VALUES(org_id,app_current_user_id(),'worker_timesheet_links',resource,lower(TG_OP),before_safe,after_safe);
 RETURN COALESCE(NEW,OLD);
END;
$$;
CREATE OR REPLACE TRIGGER audit_worker_timesheet_links
 AFTER INSERT OR UPDATE OR DELETE ON worker_timesheet_links FOR EACH ROW EXECUTE FUNCTION audit_worker_portal_links_redacted();

-- Preserve existing status-trigger behavior; also record why access was blocked.
CREATE OR REPLACE FUNCTION revoke_worker_portal_access_on_status_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='active' AND NEW.status<>'active' THEN
  INSERT INTO worker_portal_events(organization_id,worker_id,object_id,link_id,event_type,details)
   SELECT l.organization_id,l.worker_id,l.object_id,l.id,'blocked_on_exit',jsonb_build_object('workerStatus',NEW.status)
   FROM worker_timesheet_links l
   WHERE l.organization_id=NEW.organization_id AND l.worker_id=NEW.id AND l.status IN ('active','paused');
  UPDATE worker_timesheet_links
    SET status='revoked',revoked_at=now(),changed_at=now(),block_reason='dismissal'
    WHERE organization_id=NEW.organization_id AND worker_id=NEW.id
      AND status IN ('active','paused');
 END IF;
 RETURN NEW;
END;
$$;

-- Independent review requests. Approved hours and historical time entries remain immutable.
CREATE TABLE IF NOT EXISTS worker_hours_disputes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 worker_id uuid NOT NULL REFERENCES worker_profiles(id),
 object_id uuid NOT NULL REFERENCES objects(id),
 work_date date NOT NULL,
 source_link_id uuid NOT NULL REFERENCES worker_timesheet_links(id),
 reason text NOT NULL CHECK (reason IN ('hours','missing_shift','wrong_shift','other')),
 comment text NOT NULL CHECK (char_length(comment) BETWEEN 1 AND 500),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_review','resolved','rejected')),
 resolved_by_user_id uuid REFERENCES app_users(id),
 resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_worker_hours_disputes_scope ON worker_hours_disputes(organization_id,object_id,work_date,status);
ALTER TABLE worker_hours_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_hours_disputes FORCE ROW LEVEL SECURITY;
CREATE POLICY worker_hours_disputes_tenant ON worker_hours_disputes
 USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_worker_hours_disputes AFTER INSERT OR UPDATE OR DELETE ON worker_hours_disputes
 FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Onboarding state is separate from employment relation and private document content.
CREATE TABLE IF NOT EXISTS worker_onboarding_status (
 organization_id uuid NOT NULL REFERENCES organizations(id),
 worker_id uuid PRIMARY KEY REFERENCES worker_profiles(id),
 object_id uuid NOT NULL REFERENCES objects(id),
 stage text NOT NULL DEFAULT 'not_started' CHECK(stage IN ('not_started','requested','partial','review','completed','correction')),
 show_after_completed boolean NOT NULL DEFAULT false,
 employee_comment text,
 updated_by_user_id uuid REFERENCES app_users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(employee_comment IS NULL OR char_length(employee_comment)<=1200)
);
ALTER TABLE worker_onboarding_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_onboarding_status FORCE ROW LEVEL SECURITY;
CREATE POLICY worker_onboarding_status_tenant ON worker_onboarding_status
 USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_worker_onboarding_status AFTER INSERT OR UPDATE OR DELETE ON worker_onboarding_status
 FOR EACH ROW EXECUTE FUNCTION audit_row_change();

ALTER TABLE worker_document_checklist
 ADD COLUMN IF NOT EXISTS document_status text CHECK(document_status IS NULL OR document_status IN ('not_requested','awaiting','received','accepted','resubmit')),
 ADD COLUMN IF NOT EXISTS employee_comment text;

-- An optional and financially non-posting employee-facing register.
CREATE TABLE IF NOT EXISTS worker_pay_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 worker_id uuid NOT NULL REFERENCES worker_profiles(id),
 object_id uuid NOT NULL REFERENCES objects(id),
 period_start date NOT NULL,
 period_end date NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount>=0),
 adjustment_type text NOT NULL CHECK(adjustment_type IN ('deduction','damage','advance','other')),
 reason text NOT NULL,
 employee_description text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','confirmed','accounted','cancelled')),
 reference_text text,
 created_by_user_id uuid NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_start<=period_end)
);
ALTER TABLE worker_pay_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_pay_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY worker_pay_adjustments_tenant ON worker_pay_adjustments
 USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE INDEX IF NOT EXISTS idx_worker_pay_adjustments_worker_period ON worker_pay_adjustments(organization_id,worker_id,period_start DESC);
CREATE TRIGGER audit_worker_pay_adjustments AFTER INSERT OR UPDATE OR DELETE ON worker_pay_adjustments
 FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TABLE IF NOT EXISTS worker_pay_adjustment_questions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 adjustment_id uuid NOT NULL REFERENCES worker_pay_adjustments(id),
 worker_id uuid NOT NULL REFERENCES worker_profiles(id),
 source_link_id uuid NOT NULL REFERENCES worker_timesheet_links(id),
 question text NOT NULL CHECK(char_length(question) BETWEEN 1 AND 500),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE worker_pay_adjustment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_pay_adjustment_questions FORCE ROW LEVEL SECURITY;
CREATE POLICY worker_pay_adjustment_questions_tenant ON worker_pay_adjustment_questions
 USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_worker_pay_adjustment_questions AFTER INSERT OR UPDATE OR DELETE ON worker_pay_adjustment_questions
 FOR EACH ROW EXECUTE FUNCTION audit_row_change();
