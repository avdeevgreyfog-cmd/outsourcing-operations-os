BEGIN;

ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS no_bid_reason_code text,
  ADD COLUMN IF NOT EXISTS no_bid_comment text,
  ADD COLUMN IF NOT EXISTS result_reason_code text;

CREATE TABLE IF NOT EXISTS tender_reason_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('no_bid','lost')),
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,kind,code)
);

ALTER TABLE tender_reason_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_reason_catalog FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tender_reason_catalog;
CREATE POLICY tenant_isolation ON tender_reason_catalog
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

DROP TRIGGER IF EXISTS audit_tender_reason_catalog ON tender_reason_catalog;
CREATE TRIGGER audit_tender_reason_catalog
  AFTER INSERT OR UPDATE OR DELETE ON tender_reason_catalog
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

INSERT INTO tender_reason_catalog(organization_id,kind,code,name,sort_order,is_system)
SELECT o.id,v.kind,v.code,v.name,v.sort_order,true
FROM organizations o
CROSS JOIN (VALUES
  ('no_bid','economics','Низкая маржинальность / не проходит экономика',10),
  ('no_bid','deadline','Не успеваем подготовить заявку',20),
  ('no_bid','staffing','Нет нужного персонала / ресурсов',30),
  ('no_bid','payment','Неподходящие условия оплаты',40),
  ('no_bid','requirements','Завышенные требования к участнику',50),
  ('no_bid','security','Обеспечение / гарантия слишком рискованны',60),
  ('no_bid','geography','Не подходит география',70),
  ('no_bid','documents','Нет необходимых документов / допуска',80),
  ('no_bid','tailored','Признаки закупки под конкретного конкурента',90),
  ('no_bid','volume','Недостаточный объём / потенциал',100),
  ('no_bid','other','Другое',999),
  ('lost','price','Цена',10),
  ('lost','score','Проиграли по баллам / критериям',20),
  ('lost','qualification','Опыт / квалификация',30),
  ('lost','documents','Документы / комплектность заявки',40),
  ('lost','competitor','Выбран другой участник',50),
  ('lost','timing','Сроки / условия исполнения',60),
  ('lost','technical','Техническое несоответствие',70),
  ('lost','rejected','Заявка отклонена',80),
  ('lost','other','Другое',999)
) AS v(kind,code,name,sort_order)
ON CONFLICT (organization_id,kind,code) DO NOTHING;

CREATE TABLE IF NOT EXISTS tender_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tender_decision_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  from_decision text,
  to_decision text NOT NULL,
  reason_code text,
  comment text,
  changed_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tender_result_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  from_result text,
  to_result text NOT NULL,
  reason_code text,
  comment text,
  changed_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tender_stage_history','tender_decision_history','tender_result_history']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id())',table_name);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_tender_stage_history_tender
  ON tender_stage_history(organization_id,tender_id,created_at);
CREATE INDEX IF NOT EXISTS idx_tender_stage_history_stage
  ON tender_stage_history(organization_id,to_stage,created_at);
CREATE INDEX IF NOT EXISTS idx_tender_decision_history_tender
  ON tender_decision_history(organization_id,tender_id,created_at);
CREATE INDEX IF NOT EXISTS idx_tender_decision_history_decision
  ON tender_decision_history(organization_id,to_decision,created_at);
CREATE INDEX IF NOT EXISTS idx_tender_result_history_tender
  ON tender_result_history(organization_id,tender_id,created_at);
CREATE INDEX IF NOT EXISTS idx_tender_result_history_result
  ON tender_result_history(organization_id,to_result,created_at);

-- Backfill only facts that are present in the current record. Exact historic
-- transition timestamps cannot be reconstructed, so updated_at is used only
-- for the known current state.
INSERT INTO tender_stage_history(organization_id,tender_id,from_stage,to_stage,created_at)
SELECT t.organization_id,t.id,NULL,'new',t.created_at
FROM tenders t
WHERE NOT EXISTS (
  SELECT 1 FROM tender_stage_history h WHERE h.tender_id=t.id
);

INSERT INTO tender_stage_history(organization_id,tender_id,from_stage,to_stage,created_at)
SELECT t.organization_id,t.id,'new',t.stage,GREATEST(t.created_at,t.updated_at)
FROM tenders t
WHERE t.stage<>'new'
  AND NOT EXISTS (
    SELECT 1 FROM tender_stage_history h WHERE h.tender_id=t.id AND h.to_stage=t.stage
  );

INSERT INTO tender_decision_history(organization_id,tender_id,from_decision,to_decision,reason_code,comment,created_at)
SELECT t.organization_id,t.id,'undecided',t.decision,t.no_bid_reason_code,t.no_bid_comment,GREATEST(t.created_at,t.updated_at)
FROM tenders t
WHERE t.decision<>'undecided'
  AND NOT EXISTS (
    SELECT 1 FROM tender_decision_history h WHERE h.tender_id=t.id
  );

INSERT INTO tender_result_history(organization_id,tender_id,from_result,to_result,reason_code,comment,created_at)
SELECT t.organization_id,t.id,NULL,t.result,t.result_reason_code,t.close_reason,GREATEST(t.created_at,t.updated_at)
FROM tenders t
WHERE t.result IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM tender_result_history h WHERE h.tender_id=t.id
  );

CREATE OR REPLACE FUNCTION capture_tender_workflow_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE actor_id uuid;
BEGIN
  actor_id:=NULLIF(current_setting('app.user_id',true),'')::uuid;

  IF TG_OP='INSERT' THEN
    INSERT INTO tender_stage_history(organization_id,tender_id,from_stage,to_stage,changed_by_user_id,created_at)
    VALUES(NEW.organization_id,NEW.id,NULL,NEW.stage,actor_id,COALESCE(NEW.created_at,now()));

    IF NEW.decision<>'undecided' THEN
      INSERT INTO tender_decision_history(
        organization_id,tender_id,from_decision,to_decision,reason_code,comment,changed_by_user_id,created_at
      ) VALUES(
        NEW.organization_id,NEW.id,NULL,NEW.decision,NEW.no_bid_reason_code,NEW.no_bid_comment,actor_id,COALESCE(NEW.created_at,now())
      );
    END IF;

    IF NEW.result IS NOT NULL THEN
      INSERT INTO tender_result_history(
        organization_id,tender_id,from_result,to_result,reason_code,comment,changed_by_user_id,created_at
      ) VALUES(
        NEW.organization_id,NEW.id,NULL,NEW.result,NEW.result_reason_code,NEW.close_reason,actor_id,COALESCE(NEW.created_at,now())
      );
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO tender_stage_history(organization_id,tender_id,from_stage,to_stage,changed_by_user_id)
    VALUES(NEW.organization_id,NEW.id,OLD.stage,NEW.stage,actor_id);
  END IF;

  IF OLD.decision IS DISTINCT FROM NEW.decision THEN
    INSERT INTO tender_decision_history(
      organization_id,tender_id,from_decision,to_decision,reason_code,comment,changed_by_user_id
    ) VALUES(
      NEW.organization_id,NEW.id,OLD.decision,NEW.decision,NEW.no_bid_reason_code,NEW.no_bid_comment,actor_id
    );
  END IF;

  IF OLD.result IS DISTINCT FROM NEW.result AND NEW.result IS NOT NULL THEN
    INSERT INTO tender_result_history(
      organization_id,tender_id,from_result,to_result,reason_code,comment,changed_by_user_id
    ) VALUES(
      NEW.organization_id,NEW.id,OLD.result,NEW.result,NEW.result_reason_code,NEW.close_reason,actor_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_tender_workflow_history_insert ON tenders;
CREATE TRIGGER capture_tender_workflow_history_insert
  AFTER INSERT ON tenders
  FOR EACH ROW EXECUTE FUNCTION capture_tender_workflow_history();

DROP TRIGGER IF EXISTS capture_tender_workflow_history_update ON tenders;
CREATE TRIGGER capture_tender_workflow_history_update
  AFTER UPDATE OF stage,decision,result ON tenders
  FOR EACH ROW EXECUTE FUNCTION capture_tender_workflow_history();

COMMIT;
