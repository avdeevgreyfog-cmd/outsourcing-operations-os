BEGIN;

-- Make the recovered personal workspace a first-class organization owner under
-- the post-0030 access model. System access belongs to ownership, not the
-- legacy director role grant set.
SELECT set_config('app.organization_id','00000000-0000-4000-8000-000000000002',true);
SELECT set_config('app.user_id',(SELECT user_id::text FROM organization_memberships WHERE id='50000000-0000-4000-8000-000000000101'::uuid),true);

DELETE FROM permission_grants pg
USING role_templates rt
WHERE pg.role_template_id=rt.id
  AND rt.organization_id='00000000-0000-4000-8000-000000000002'::uuid
  AND rt.code='director'
  AND pg.capability='admin.system_access.manage';

INSERT INTO organization_owners(organization_id,membership_id,assigned_by_user_id)
SELECT
  '00000000-0000-4000-8000-000000000002'::uuid,
  m.id,
  m.user_id
FROM organization_memberships m
WHERE m.id='50000000-0000-4000-8000-000000000101'::uuid
  AND m.status='active'
ON CONFLICT (organization_id) DO UPDATE SET
  membership_id=EXCLUDED.membership_id,
  assigned_by_user_id=EXCLUDED.assigned_by_user_id;

COMMIT;
