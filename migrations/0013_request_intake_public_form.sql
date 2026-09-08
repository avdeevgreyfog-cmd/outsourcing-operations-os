BEGIN;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS intake_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS request_public_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_opened_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_request_public_one_active_link
  ON request_public_links(request_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_request_public_link_org_request
  ON request_public_links(organization_id,request_id,created_at DESC);

CREATE TABLE IF NOT EXISTS request_public_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  public_link_id uuid NOT NULL REFERENCES request_public_links(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  payload jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_user_id uuid REFERENCES app_users(id),
  reviewed_at timestamptz,
  review_comment text
);

CREATE INDEX IF NOT EXISTS idx_request_public_submission_queue
  ON request_public_submissions(organization_id,request_id,status,submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_request_public_one_pending_submission
  ON request_public_submissions(public_link_id)
  WHERE status='pending';

ALTER TABLE request_public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_public_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON request_public_links;
CREATE POLICY tenant_isolation ON request_public_links
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

DROP POLICY IF EXISTS tenant_isolation ON request_public_submissions;
CREATE POLICY tenant_isolation ON request_public_submissions
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

COMMIT;
