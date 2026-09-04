BEGIN;

-- Demo-only extension applied after 9000_demo_seed.sql. It mirrors the commercial
-- permissions and responsibility rules introduced by the production migration.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'team'
FROM role_templates r CROSS JOIN (VALUES
 ('approval.read'),('sales.request.archive'),('sales.proposal.read'),('sales.proposal.create'),('sales.proposal.edit'),
 ('sales.proposal.submit'),('sales.proposal.client_decision'),('sales.proposal.launch')
) p(capability)
WHERE r.organization_id='00000000-0000-4000-8000-000000000001'::uuid AND r.code='sales_manager'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'all_org'
FROM role_templates r CROSS JOIN (VALUES ('approval.read'),('approval.decide'),('sales.proposal.read')) p(capability)
WHERE r.organization_id='00000000-0000-4000-8000-000000000001'::uuid AND r.code IN ('economist','finance')
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT r.organization_id,r.id,p.capability,'region'
FROM role_templates r CROSS JOIN (VALUES ('approval.read'),('approval.decide')) p(capability)
WHERE r.organization_id='00000000-0000-4000-8000-000000000001'::uuid AND r.code='regional_manager'
ON CONFLICT DO NOTHING;

INSERT INTO responsibility_rules(
  organization_id,process_code,process_name,step_code,step_name,responsibility_type,subject_type,subject_id,scope_type,scope_ids,created_by_user_id
) VALUES
('00000000-0000-4000-8000-000000000001','commercial_calculation','Коммерческий расчёт','calculation_approval','Согласование расчёта','approver','membership','50000000-0000-4000-8000-000000000001','all_org','{}','10000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000001','commercial_proposal','Коммерческое предложение','proposal_approval','Согласование КП','approver','membership','50000000-0000-4000-8000-000000000001','all_org','{}','10000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000001','object_launch','Запуск объекта','owner','Ответственный за запуск','owner','membership','50000000-0000-4000-8000-000000000003','region',ARRAY['30000000-0000-4000-8000-000000000001'::uuid,'30000000-0000-4000-8000-000000000002'::uuid],'10000000-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;

UPDATE proposals SET
  content_snapshot=jsonb_build_object(
    'requestId','73000000-0000-4000-8000-000000000001',
    'title','РЦ Север — запуск 15 сентября',
    'clientId','70000000-0000-4000-8000-000000000001',
    'vatMode','with_vat',
    'location','Москва, Дмитровское шоссе',
    'expectedStartDate','2026-09-15',
    'roles',jsonb_build_array(
      jsonb_build_object('role','Комплектовщик','specialtyId','60000000-0000-4000-8000-000000000001','count',24,'rate',670.73,'unit','hour','scenarioId','79000000-0000-4000-8000-000000000001'),
      jsonb_build_object('role','Грузчик','specialtyId','60000000-0000-4000-8000-000000000002','count',8,'rate',713.25,'unit','hour','scenarioId','79000000-0000-4000-8000-000000000002')
    )
  ),approved_at='2026-08-28 16:30+03',sent_at='2026-08-28 17:00+03',accepted_at='2026-08-29 10:00+03',launched_at='2026-08-29 12:00+03'
WHERE id='7a000000-0000-4000-8000-000000000001'::uuid;

UPDATE objects SET source_proposal_id='7a000000-0000-4000-8000-000000000001'::uuid
WHERE id='80000000-0000-4000-8000-000000000001'::uuid;

COMMIT;
