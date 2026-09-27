BEGIN;

-- The owner's real OPERIS workspace is persistent customer data. Demo resets,
-- seed refreshes and showcase rebuilds must never target this organization.
UPDATE organizations
SET settings = COALESCE(settings,'{}'::jsonb) || '{
  "workspaceKind":"customer",
  "dataProtection":"persistent",
  "demoDataPolicy":"isolated"
}'::jsonb,
updated_at=now()
WHERE id='00000000-0000-4000-8000-000000000002'::uuid
  AND slug='sergey-work';

COMMIT;
