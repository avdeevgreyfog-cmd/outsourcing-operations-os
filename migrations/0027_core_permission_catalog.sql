BEGIN;

-- The core capability catalogue is production metadata, not demo data. Some older
-- installations received these rows from 9000_demo_seed.sql; keep this migration
-- idempotent so both upgrade paths converge.
INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive) VALUES
('home.command.read','home','command','read',false),('task.read','control','task','read',false),('task.edit','control','task','edit',false),
('sales.lead.read','sales','lead','read',false),('sales.lead.create','sales','lead','create',false),('sales.lead.edit','sales','lead','edit',false),
('sales.client.read','sales','client','read',false),('sales.client.create','sales','client','create',false),('sales.client.edit','sales','client','edit',false),
('sales.request.read','sales','request','read',false),('sales.request.create','sales','request','create',false),('sales.request.edit','sales','request','edit',false),
('calculation.scenario.read','calculation','scenario','read',false),('calculation.scenario.create','calculation','scenario','create',false),('calculation.scenario.edit','calculation','scenario','edit',false),('calculation.scenario.approve','calculation','scenario','approve',false),
('calculation.rate_reference.read','calculation','rate_reference','read',false),('calculation.rate_reference.edit','calculation','rate_reference','edit',false),
('operations.object.read','operations','object','read',false),('operations.object.edit','operations','object','edit',false),('operations.need.read','operations','need','read',false),('operations.need.edit','operations','need','edit',false),('operations.shift.read','operations','shift','read',false),('operations.shift.edit','operations','shift','edit',false),
('recruiting.candidate.read','recruiting','candidate','read',false),('recruiting.candidate.create','recruiting','candidate','create',false),('recruiting.candidate.edit','recruiting','candidate','edit',false),('recruiting.candidate.assign','recruiting','candidate','assign',false),
('worker.read','worker','profile','read',false),('worker.edit','worker','profile','edit',false),('worker.compensation.read','worker','compensation','read',true),('worker.personal_docs.read','worker','personal_docs','read',true),
('time.time_entry.read','time','time_entry','read',false),('time.time_entry.edit','time','time_entry','edit',false),('time.timesheet.read','time','timesheet','read',false),('time.timesheet.edit','time','timesheet','edit',false),('time.timesheet.submit','time','timesheet','submit',false),('time.timesheet.approve_client','time','timesheet','approve_client',false),
('finance.worker_accrual.read','finance','worker_accrual','read',true),('finance.worker_accrual.edit','finance','worker_accrual','edit',true),('finance.payments.read','finance','payments','read',true),('finance.payments.edit','finance','payments','edit',true),('finance.client_margin.read','finance','client_margin','read',true),('finance.pnl.read','finance','pnl','read',true),
('analytics.portfolio.read','analytics','portfolio','read',false),('audit.read','admin','audit','read',true),('admin.permissions.manage','admin','permissions','manage',true),
('organization.read','organization','organization','read',false),('organization.manage','organization','organization','manage',true),
('organization.unit.manage','organization','unit','manage',true),('organization.position.manage','organization','position','manage',true),
('organization.employee.manage','organization','employee','manage',true),('organization.access.manage','organization','access','manage',true)
ON CONFLICT (capability) DO NOTHING;

-- Refresh the owner grant set after the complete capability catalogue exists.
INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,p.capability,'allow','all_org','{}'::uuid[]
FROM role_templates r
CROSS JOIN permission_definitions p
WHERE r.organization_id='00000000-0000-4000-8000-000000000002'::uuid
  AND r.code='director'
ON CONFLICT DO NOTHING;

-- Refresh the built-in preview templates as the catalogue grows.
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
WHERE r.organization_id='00000000-0000-4000-8000-000000000002'::uuid
  AND r.code<>'director'
ON CONFLICT DO NOTHING;

COMMIT;
