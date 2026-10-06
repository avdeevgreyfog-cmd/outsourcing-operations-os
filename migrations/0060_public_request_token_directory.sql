BEGIN;

CREATE TABLE IF NOT EXISTS public_request_token_directory (
  token_hash text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES app_users(id),
  link_kind text NOT NULL CHECK (link_kind IN ('request_public_link','request_intake_link')),
  link_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(link_kind,link_id)
);

INSERT INTO public_request_token_directory(token_hash,tenant_id,actor_user_id,link_kind,link_id,created_at)
SELECT encode(digest(token,'sha256'),'hex'),organization_id,created_by_user_id,'request_public_link',id,created_at
FROM request_public_links
ON CONFLICT(token_hash) DO NOTHING;

INSERT INTO public_request_token_directory(token_hash,tenant_id,actor_user_id,link_kind,link_id,created_at)
SELECT encode(digest(token,'sha256'),'hex'),organization_id,created_by_user_id,'request_intake_link',id,created_at
FROM request_intake_links
ON CONFLICT(token_hash) DO NOTHING;

ALTER TABLE request_public_links FORCE ROW LEVEL SECURITY;
ALTER TABLE request_public_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE request_intake_links FORCE ROW LEVEL SECURITY;

COMMIT;
