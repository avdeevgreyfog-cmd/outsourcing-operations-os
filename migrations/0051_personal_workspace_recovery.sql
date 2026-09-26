BEGIN;

-- Recovery migration for the owner's personal production workspace.
-- Replays the original idempotent bootstrap so a database refresh cannot leave
-- the working tenant without its owner, role model or organization structure.

INSERT INTO organizations(id,name,slug,settings)
VALUES(
  '00000000-0000-4000-8000-000000000002',
  'Моя организация',
  'sergey-work',
  '{"currency":"RUB","timezone":"Europe/Moscow","workspaceKind":"personal-pilot"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name,
  slug=EXCLUDED.slug,
  settings=organizations.settings || EXCLUDED.settings,
  updated_at=now();

-- Account credentials are provisioned outside schema migrations. Keeping the
-- password nullable here prevents reusable credentials or hashes from living in
-- source control while preserving an existing password on upgrades.
INSERT INTO app_users(id,email,display_name,is_active)
VALUES(
  '10000000-0000-4000-8000-000000000101',
  'avdeevgreyfog@gmail.com',
  'Сергей Авдеев',
  true
)
ON CONFLICT (email) DO UPDATE SET
  display_name=EXCLUDED.display_name,
  is_active=true,
  updated_at=now();

SELECT set_config('app.organization_id','00000000-0000-4000-8000-000000000002',true);
SELECT set_config('app.user_id',(SELECT id::text FROM app_users WHERE email='avdeevgreyfog@gmail.com'),true);

INSERT INTO role_templates(id,organization_id,code,name,description,is_system) VALUES
('40000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000002','director','Генеральный директор','Полный доступ к рабочему контуру организации',true),
('40000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000002','sales_manager','Менеджер по продажам','Коммерческий контур и связанные расчёты',true),
('40000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000002','regional_manager','Региональный менеджер','Операционный контроль региона',true),
('40000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000002','object_manager','Менеджер объекта','Объекты, смены, сотрудники и табели',true),
('40000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000002','recruiter','Рекрутер','Потребности, кандидаты и подготовка к выходу',true),
('40000000-0000-4000-8000-000000000106','00000000-0000-4000-8000-000000000002','economist','Экономист','Расчёты, нормативы и коммерческая экономика',true),
('40000000-0000-4000-8000-000000000107','00000000-0000-4000-8000-000000000002','finance','Финансовый менеджер','Начисления, выплаты и финансовый результат',true)
ON CONFLICT (organization_id,code) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  is_system=true;

INSERT INTO positions(id,organization_id,code,name,purpose,duties,responsibilities,process_participation)
VALUES(
  '41000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000002',
  'ceo',
  'Генеральный директор',
  'Полный контроль рабочей организации и проверка сквозных процессов OPERIS',
  ARRAY['Настраивать структуру и права','Проверять рабочие процессы на реальных данных'],
  ARRAY['Целостность рабочего контура','Корректность прав и процессов'],
  ARRAY['Все основные процессы']
)
ON CONFLICT (organization_id,code) DO UPDATE SET
  name=EXCLUDED.name,
  purpose=EXCLUDED.purpose,
  updated_at=now();

INSERT INTO organization_units(id,organization_id,code,name,kind,sort_order)
VALUES(
  '21000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000002',
  'company',
  'Моя организация',
  'company',
  0
)
ON CONFLICT (organization_id,code) DO UPDATE SET
  name=EXCLUDED.name,
  active=true,
  updated_at=now();

INSERT INTO organization_memberships(
  id,organization_id,user_id,role_template_id,position_id,primary_org_unit_id,status,responsibility_summary
)
VALUES(
  '50000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000002',
  (SELECT id FROM app_users WHERE email='avdeevgreyfog@gmail.com'),
  (SELECT id FROM role_templates WHERE organization_id='00000000-0000-4000-8000-000000000002' AND code='director'),
  '41000000-0000-4000-8000-000000000101',
  '21000000-0000-4000-8000-000000000101',
  'active',
  'Владелец рабочего контура и генеральный директор'
)
ON CONFLICT (organization_id,user_id) DO UPDATE SET
  role_template_id=EXCLUDED.role_template_id,
  position_id=EXCLUDED.position_id,
  primary_org_unit_id=EXCLUDED.primary_org_unit_id,
  status='active';

UPDATE organization_units
SET manager_membership_id=(
  SELECT id FROM organization_memberships
  WHERE organization_id='00000000-0000-4000-8000-000000000002'
    AND user_id=(SELECT id FROM app_users WHERE email='avdeevgreyfog@gmail.com')
)
WHERE id='21000000-0000-4000-8000-000000000101';

INSERT INTO staff_positions(
  id,organization_id,code,name,job_profile_id,organization_unit_id,capacity,level,status,created_by_user_id
)
VALUES(
  '43000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000002',
  'CEO-001',
  'Генеральный директор',
  '41000000-0000-4000-8000-000000000101',
  '21000000-0000-4000-8000-000000000101',
  1,0,'filled',
  (SELECT id FROM app_users WHERE email='avdeevgreyfog@gmail.com')
)
ON CONFLICT (organization_id,code) DO UPDATE SET
  name=EXCLUDED.name,
  status='filled',
  updated_at=now();

INSERT INTO position_assignments(
  organization_id,staff_position_id,membership_id,assignment_type,fte,status,reason,created_by_user_id
)
SELECT
  '00000000-0000-4000-8000-000000000002',
  sp.id,
  m.id,
  'primary',
  1,
  'active',
  'Первичное назначение владельца рабочей организации',
  m.user_id
FROM staff_positions sp
JOIN organization_memberships m
  ON m.organization_id=sp.organization_id
 AND m.user_id=(SELECT id FROM app_users WHERE email='avdeevgreyfog@gmail.com')
WHERE sp.organization_id='00000000-0000-4000-8000-000000000002'
  AND sp.code='CEO-001'
  AND NOT EXISTS (
    SELECT 1 FROM position_assignments pa
    WHERE pa.staff_position_id=sp.id AND pa.membership_id=m.id AND pa.status='active'
  );

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT
  '00000000-0000-4000-8000-000000000002',
  r.id,
  p.capability,
  'allow',
  'all_org',
  '{}'::uuid[]
FROM role_templates r
CROSS JOIN permission_definitions p
WHERE r.organization_id='00000000-0000-4000-8000-000000000002'
  AND r.code='director'
  AND p.capability<>'admin.system_access.manage'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,p.capability,'allow','all_org','{}'::uuid[]
FROM role_templates r
JOIN permission_definitions p ON (
  (r.code='sales_manager' AND (
    p.capability IN ('home.command.read','task.read','task.edit','organization.read','approval.read','approval.decide')
    OR p.capability LIKE 'sales.%' OR p.capability LIKE 'calculation.%' OR p.capability LIKE 'contract.%'
    OR p.capability='company.document.read'
  ))
  OR
  (r.code='recruiter' AND (
    p.capability IN ('home.command.read','task.read','task.edit','organization.read','worker.read')
    OR p.capability LIKE 'recruiting.%' OR p.capability LIKE 'operations.need.%'
    OR p.capability LIKE 'worker.onboarding.%' OR p.capability LIKE 'document.%'
  ))
  OR
  (r.code='object_manager' AND (
    p.capability IN ('home.command.read','task.read','task.edit','organization.read','recruiting.candidate.read','worker.read','worker.edit')
    OR p.capability LIKE 'operations.%' OR p.capability LIKE 'time.%'
  ))
  OR
  (r.code='regional_manager' AND (
    p.capability IN ('home.command.read','task.read','task.edit','organization.read','approval.read','approval.decide','sales.client.read','sales.request.read','finance.pnl.read')
    OR p.capability LIKE 'operations.%' OR p.capability LIKE 'recruiting.%'
    OR p.capability LIKE 'worker.%' OR p.capability LIKE 'time.%' OR p.capability LIKE 'analytics.%'
  ))
  OR
  (r.code='economist' AND (
    p.capability IN ('home.command.read','task.read','organization.read','approval.read','approval.decide','sales.client.read','sales.request.read','finance.client_margin.read','contract.read')
    OR p.capability LIKE 'calculation.%' OR p.capability LIKE 'sales.proposal.%'
  ))
  OR
  (r.code='finance' AND (
    p.capability IN ('home.command.read','task.read','organization.read','approval.read','approval.decide','sales.client.read','sales.proposal.read','contract.read','operations.object.read','worker.read','worker.compensation.read')
    OR p.capability LIKE 'finance.%' OR p.capability LIKE 'time.timesheet.%' OR p.capability LIKE 'analytics.%'
  ))
)
WHERE r.organization_id='00000000-0000-4000-8000-000000000002'
  AND r.code<>'director'
ON CONFLICT DO NOTHING;

-- Passwords are still never stored in source control. This inserts only the
-- SHA-256 hash of a one-time activation token supplied privately to the owner.
INSERT INTO account_activation_tokens(user_id,token_hash,expires_at)
SELECT u.id,'ff06ace26a66ef96e7b5cae11f24a03595e4ba6d69dd5f7557cd530484e0259a',now()+interval '14 days'
FROM app_users u
JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id='00000000-0000-4000-8000-000000000002'::uuid AND m.status='active'
WHERE lower(u.email::text)=lower('avdeevgreyfog@gmail.com')
  AND u.password_hash IS NULL
ON CONFLICT (token_hash) DO UPDATE SET
  expires_at=EXCLUDED.expires_at,
  used_at=NULL;

COMMIT;
