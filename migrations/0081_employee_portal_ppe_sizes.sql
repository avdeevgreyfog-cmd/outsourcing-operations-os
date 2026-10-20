-- Pending PPE sizes are separate from manager-approved worker profile sizes.
ALTER TABLE worker_profiles
 ADD COLUMN IF NOT EXISTS glove_size text,
 ADD COLUMN IF NOT EXISTS ppe_size_comment text;
CREATE TABLE IF NOT EXISTS worker_ppe_size_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 worker_id uuid NOT NULL REFERENCES worker_profiles(id),
 object_id uuid NOT NULL REFERENCES objects(id),
 source_link_id uuid NOT NULL REFERENCES worker_timesheet_links(id),
 clothing_size text,
 shoe_size text,
 glove_size text,
 comment text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','superseded')),
 reviewed_by_user_id uuid REFERENCES app_users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (clothing_size IS NULL OR char_length(clothing_size)<=40),
 CHECK (shoe_size IS NULL OR char_length(shoe_size)<=40),
 CHECK (glove_size IS NULL OR char_length(glove_size)<=40),
 CHECK (comment IS NULL OR char_length(comment)<=500)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_ppe_size_pending ON worker_ppe_size_requests(organization_id,worker_id,object_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_worker_ppe_size_scope ON worker_ppe_size_requests(organization_id,object_id,created_at DESC);
ALTER TABLE worker_ppe_size_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_ppe_size_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY worker_ppe_size_requests_tenant ON worker_ppe_size_requests USING (organization_id=app_current_organization_id())
 WITH CHECK (organization_id=app_current_organization_id());
CREATE TRIGGER audit_worker_ppe_size_requests AFTER INSERT OR UPDATE OR DELETE ON worker_ppe_size_requests
 FOR EACH ROW EXECUTE FUNCTION audit_row_change();
