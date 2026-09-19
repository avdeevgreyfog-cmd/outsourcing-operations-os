BEGIN;

CREATE TABLE IF NOT EXISTS request_loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,code)
);

ALTER TABLE request_loss_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_loss_reasons FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON request_loss_reasons;
CREATE POLICY tenant_isolation ON request_loss_reasons
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

DROP TRIGGER IF EXISTS audit_request_loss_reasons ON request_loss_reasons;
CREATE TRIGGER audit_request_loss_reasons
  AFTER INSERT OR UPDATE OR DELETE ON request_loss_reasons
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

INSERT INTO request_loss_reasons(organization_id,code,name,sort_order,is_system)
SELECT o.id,v.code,v.name,v.sort_order,true
FROM organizations o
CROSS JOIN (VALUES
  ('price','Цена / экономика',10),
  ('competitor','Выбран другой подрядчик',20),
  ('cancelled','Потребность отменена',30),
  ('timing','Не устроили сроки',40),
  ('terms','Не устроили условия',50),
  ('no_response','Нет ответа заказчика',60),
  ('staffing_failure','Не смогли обеспечить персонал',70),
  ('other','Другое',999)
) AS v(code,name,sort_order)
ON CONFLICT (organization_id,code) DO NOTHING;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS loss_reason_code text;

UPDATE requests
SET loss_reason_code=loss_reason
WHERE loss_reason_code IS NULL
  AND loss_reason IN ('price','competitor','cancelled','timing','terms','no_response','staffing_failure','other');

CREATE INDEX IF NOT EXISTS idx_requests_loss_reason_code
  ON requests(organization_id,loss_reason_code) WHERE loss_reason_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS request_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  from_stage_code text,
  to_stage_code text NOT NULL,
  loss_reason_code text,
  comment text,
  changed_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE request_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_stage_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON request_stage_history;
CREATE POLICY tenant_isolation ON request_stage_history
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

CREATE INDEX IF NOT EXISTS idx_request_stage_history_request
  ON request_stage_history(organization_id,request_id,created_at);
CREATE INDEX IF NOT EXISTS idx_request_stage_history_to_stage
  ON request_stage_history(organization_id,to_stage_code,created_at);

-- Existing records only have their current state. Preserve what is known without
-- pretending that exact historic transition timestamps were available.
INSERT INTO request_stage_history(organization_id,request_id,from_stage_code,to_stage_code,created_at)
SELECT r.organization_id,r.id,NULL,'new',r.created_at
FROM requests r
WHERE NOT EXISTS (
  SELECT 1 FROM request_stage_history h
  WHERE h.request_id=r.id
);

INSERT INTO request_stage_history(organization_id,request_id,from_stage_code,to_stage_code,loss_reason_code,comment,created_at)
SELECT r.organization_id,r.id,'new',r.workflow_stage_code,
  CASE WHEN r.workflow_stage_code='not_agreed' THEN r.loss_reason_code ELSE NULL END,
  CASE WHEN r.workflow_stage_code='not_agreed' THEN r.loss_reason ELSE NULL END,
  GREATEST(r.created_at,r.updated_at)
FROM requests r
WHERE r.workflow_stage_code<>'new'
  AND NOT EXISTS (
    SELECT 1 FROM request_stage_history h
    WHERE h.request_id=r.id AND h.to_stage_code=r.workflow_stage_code
  );

CREATE OR REPLACE FUNCTION capture_request_stage_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO request_stage_history(
      organization_id,request_id,from_stage_code,to_stage_code,loss_reason_code,comment,created_at
    ) VALUES (
      NEW.organization_id,NEW.id,NULL,COALESCE(NULLIF(NEW.workflow_stage_code,''),'new'),
      CASE WHEN NEW.workflow_stage_code='not_agreed' THEN NEW.loss_reason_code ELSE NULL END,
      CASE WHEN NEW.workflow_stage_code='not_agreed' THEN NEW.loss_reason ELSE NULL END,
      COALESCE(NEW.created_at,now())
    );
    RETURN NEW;
  END IF;

  IF OLD.workflow_stage_code IS DISTINCT FROM NEW.workflow_stage_code THEN
    INSERT INTO request_stage_history(
      organization_id,request_id,from_stage_code,to_stage_code,loss_reason_code,comment,created_at
    ) VALUES (
      NEW.organization_id,NEW.id,OLD.workflow_stage_code,NEW.workflow_stage_code,
      CASE WHEN NEW.workflow_stage_code='not_agreed' THEN NEW.loss_reason_code ELSE NULL END,
      CASE WHEN NEW.workflow_stage_code='not_agreed' THEN NEW.loss_reason ELSE NULL END,
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_request_stage_history_insert ON requests;
CREATE TRIGGER capture_request_stage_history_insert
  AFTER INSERT ON requests
  FOR EACH ROW EXECUTE FUNCTION capture_request_stage_history();

DROP TRIGGER IF EXISTS capture_request_stage_history_update ON requests;
CREATE TRIGGER capture_request_stage_history_update
  AFTER UPDATE OF workflow_stage_code ON requests
  FOR EACH ROW EXECUTE FUNCTION capture_request_stage_history();

COMMIT;
