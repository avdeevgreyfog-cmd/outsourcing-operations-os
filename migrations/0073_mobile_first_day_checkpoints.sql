-- Mobile field manager: first-day operational checkpoint only.
-- Actual attendance is recorded in existing attendance_events; no parallel attendance ledger.
CREATE TABLE IF NOT EXISTS worker_first_day_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  first_shift_date date NOT NULL,
  checkpoint text NOT NULL CHECK (checkpoint IN ('met','pass_checked','documents_checked','briefing_checked','ppe_checked','started')),
  state text NOT NULL CHECK (state IN ('done','issue')),
  note text,
  checked_by_user_id uuid NOT NULL REFERENCES app_users(id),
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id,worker_id,first_shift_date,checkpoint),
  CHECK (char_length(COALESCE(note,''))<=500)
);
CREATE INDEX IF NOT EXISTS idx_first_day_checkpoints_object_date ON worker_first_day_checkpoints(organization_id,object_id,first_shift_date);
ALTER TABLE worker_first_day_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_first_day_checkpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON worker_first_day_checkpoints
 USING (organization_id=app_current_organization_id())
 WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_worker_first_day_checkpoints
 AFTER INSERT OR UPDATE OR DELETE ON worker_first_day_checkpoints
 FOR EACH ROW EXECUTE FUNCTION audit_row_change();
