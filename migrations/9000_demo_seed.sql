BEGIN;

INSERT INTO organizations(id,name,slug,settings) VALUES
('00000000-0000-4000-8000-000000000001','OPERIS Demo','operis-demo','{"currency":"RUB","timezone":"Europe/Moscow"}');

INSERT INTO app_users(id,email,display_name,password_hash) VALUES
('10000000-0000-4000-8000-000000000001','director@demo.local','Анна Лебедева',crypt('demo1234', gen_salt('bf'))),
('10000000-0000-4000-8000-000000000002','sales@demo.local','Илья Морозов',crypt('demo1234', gen_salt('bf'))),
('10000000-0000-4000-8000-000000000003','regional@demo.local','Мария Соколова',crypt('demo1234', gen_salt('bf'))),
('10000000-0000-4000-8000-000000000004','object@demo.local','Алексей Волков',crypt('demo1234', gen_salt('bf'))),
('10000000-0000-4000-8000-000000000005','recruiter@demo.local','Ольга Новикова',crypt('demo1234', gen_salt('bf'))),
('10000000-0000-4000-8000-000000000006','economist@demo.local','Елена Котова',crypt('demo1234', gen_salt('bf'))),
('10000000-0000-4000-8000-000000000007','finance@demo.local','Дмитрий Орлов',crypt('demo1234', gen_salt('bf')));

SET LOCAL app.organization_id = '00000000-0000-4000-8000-000000000001';
SET LOCAL app.user_id = '10000000-0000-4000-8000-000000000001';

INSERT INTO teams(id,organization_id,name,kind) VALUES
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Продажи','sales'),
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Операции','operations'),
('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Подбор','recruiting'),
('20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Финансы','finance');

INSERT INTO regions(id,organization_id,code,name) VALUES
('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','MOW','Москва и МО'),
('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','KLG','Калужская область');

INSERT INTO role_templates(id,organization_id,code,name,is_system) VALUES
('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','director','Director',true),
('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','sales_manager','Sales Manager',true),
('40000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','regional_manager','Regional Manager',true),
('40000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','object_manager','Object Manager',true),
('40000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','recruiter','Recruiter',true),
('40000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','economist','Economist',true),
('40000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','finance','Finance',true);

INSERT INTO organization_memberships(id,organization_id,user_id,role_template_id,primary_team_id) VALUES
('50000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'),
('50000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001'),
('50000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002'),
('50000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002'),
('50000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000003'),
('50000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006','40000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000004'),
('50000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','40000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000004');

INSERT INTO legal_entities(id,organization_id,name,short_name,inn,is_primary) VALUES
('31000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','ООО «Оперис Персонал»','Оперис Персонал','7700000000',true);

INSERT INTO positions(id,organization_id,code,name,purpose,duties,responsibilities,process_participation) VALUES
('41000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','ceo','Генеральный директор','Управление компанией и результатами направлений',ARRAY['Утверждать стратегию и ключевые решения'],ARRAY['Результат компании','Система управления'],ARRAY['Стратегическое управление','Согласования']),
('41000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','sales-manager','Менеджер по продажам','Развивать клиентский портфель и доводить заявки до запуска',ARRAY['Вести клиента и заявку','Готовить коммерческие предложения'],ARRAY['Клиенты','Заявки','Коммерческие условия'],ARRAY['Продажа','Запуск объекта']),
('41000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','regional-manager','Региональный менеджер','Обеспечивать результат объектов региона',ARRAY['Контролировать объекты','Управлять менеджерами объектов'],ARRAY['Регион','Объекты','Комплектование'],ARRAY['Запуск объекта','Операционное управление']),
('41000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','object-manager','Менеджер объекта','Обеспечивать стабильную работу объекта заказчика',ARRAY['Контролировать выход персонала','Вести табели','Решать оперативные вопросы'],ARRAY['Назначенные объекты','Персонал объекта','Сроки и качество'],ARRAY['Запуск объекта','Смены и табели']),
('41000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','recruiter','Рекрутер','Закрывать потребности подходящими кандидатами',ARRAY['Обрабатывать отклики','Вести кандидата до выхода'],ARRAY['Назначенные потребности','Кандидаты'],ARRAY['Подбор','Подготовка к выходу']),
('41000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','economist','Экономист','Обеспечивать корректность экономики проектов',ARRAY['Готовить расчёты','Проверять маржинальность'],ARRAY['Расчёты','Нормативы','Маржа'],ARRAY['Расчёт экономики','Согласование']),
('41000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','finance-manager','Финансовый менеджер','Контролировать начисления, выплаты и финансовый результат',ARRAY['Проверять начисления','Планировать выплаты','Контролировать P&L'],ARRAY['Начисления','Выплаты','Финансовый результат'],ARRAY['Закрытие периода','Выплаты']);

INSERT INTO process_roles(id,organization_id,code,name,description,responsibility) VALUES
('42000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','client-curator','Куратор клиента','Единая точка ответственности по клиенту','Коммуникация, договорённости и эскалации по закреплённым клиентам'),
('42000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','object-owner','Ответственный за объект','Процессная роль для операционного контура','Результат и операционная устойчивость закреплённых объектов'),
('42000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','calculation-economist','Экономист расчётов','Подготовка и проверка экономики','Корректность расчётов и соблюдение нормативов'),
('42000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','timesheet-approver','Согласующий табелей','Контроль закрытия табельного периода','Проверка и согласование табелей');

INSERT INTO organization_units(id,organization_id,parent_id,region_id,manager_membership_id,code,name,kind,sort_order) VALUES
('21000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',NULL,NULL,'50000000-0000-4000-8000-000000000001','company','OPERIS Demo','company',0),
('21000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',NULL,'50000000-0000-4000-8000-000000000001','management','Руководство','department',10),
('21000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',NULL,'50000000-0000-4000-8000-000000000002','commerce','Коммерция','direction',20),
('21000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',NULL,'50000000-0000-4000-8000-000000000005','recruiting','Подбор','department',30),
('21000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',NULL,'50000000-0000-4000-8000-000000000007','economics','Экономика и финансы','department',40),
('21000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','operations-mow','Операции · Москва','region',50),
('21000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',NULL,'operations-klg','Операции · Калуга','region',60),
('21000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004','objects-mow','Объектовые команды','team',10);

UPDATE organization_memberships SET
  position_id=CASE user_id
    WHEN '10000000-0000-4000-8000-000000000001' THEN '41000000-0000-4000-8000-000000000001'::uuid
    WHEN '10000000-0000-4000-8000-000000000002' THEN '41000000-0000-4000-8000-000000000002'::uuid
    WHEN '10000000-0000-4000-8000-000000000003' THEN '41000000-0000-4000-8000-000000000003'::uuid
    WHEN '10000000-0000-4000-8000-000000000004' THEN '41000000-0000-4000-8000-000000000004'::uuid
    WHEN '10000000-0000-4000-8000-000000000005' THEN '41000000-0000-4000-8000-000000000005'::uuid
    WHEN '10000000-0000-4000-8000-000000000006' THEN '41000000-0000-4000-8000-000000000006'::uuid
    WHEN '10000000-0000-4000-8000-000000000007' THEN '41000000-0000-4000-8000-000000000007'::uuid END,
  primary_org_unit_id=CASE user_id
    WHEN '10000000-0000-4000-8000-000000000001' THEN '21000000-0000-4000-8000-000000000002'::uuid
    WHEN '10000000-0000-4000-8000-000000000002' THEN '21000000-0000-4000-8000-000000000003'::uuid
    WHEN '10000000-0000-4000-8000-000000000003' THEN '21000000-0000-4000-8000-000000000006'::uuid
    WHEN '10000000-0000-4000-8000-000000000004' THEN '21000000-0000-4000-8000-000000000008'::uuid
    WHEN '10000000-0000-4000-8000-000000000005' THEN '21000000-0000-4000-8000-000000000004'::uuid
    ELSE '21000000-0000-4000-8000-000000000005'::uuid END,
  manager_membership_id=CASE user_id
    WHEN '10000000-0000-4000-8000-000000000001' THEN NULL
    WHEN '10000000-0000-4000-8000-000000000003' THEN '50000000-0000-4000-8000-000000000001'::uuid
    WHEN '10000000-0000-4000-8000-000000000004' THEN '50000000-0000-4000-8000-000000000003'::uuid
    WHEN '10000000-0000-4000-8000-000000000006' THEN '50000000-0000-4000-8000-000000000007'::uuid
    ELSE '50000000-0000-4000-8000-000000000001'::uuid END,
  phone='+7 900 100-00-'||right(user_id::text,2);

INSERT INTO membership_process_roles(organization_id,membership_id,process_role_id,org_unit_id,assigned_by_user_id) VALUES
('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000006','42000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001');

INSERT INTO membership_regions(organization_id,membership_id,region_id) VALUES
('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001');

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
('organization.employee.manage','organization','employee','manage',true),('organization.access.manage','organization','access','manage',true);

-- Director: organization wide access.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT '00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',capability,'all_org' FROM permission_definitions;

INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT '00000000-0000-4000-8000-000000000001',id,'organization.read','all_org'
FROM role_templates WHERE code<>'director';

-- Sales manager: commercial own/team scope, calculations readable/creatable.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT '00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',capability,'team'
FROM permission_definitions WHERE capability IN ('home.command.read','task.read','task.edit','sales.lead.read','sales.lead.create','sales.lead.edit','sales.client.read','sales.client.create','sales.client.edit','sales.request.read','sales.request.create','sales.request.edit','calculation.scenario.read','calculation.scenario.create','calculation.rate_reference.read');

-- Regional manager: operational rows constrained by membership regions.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT '00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',capability,'region'
FROM permission_definitions WHERE capability IN ('home.command.read','task.read','task.edit','sales.client.read','sales.request.read','operations.object.read','operations.object.edit','operations.need.read','operations.need.edit','operations.shift.read','operations.shift.edit','recruiting.candidate.read','worker.read','time.time_entry.read','time.timesheet.read','time.timesheet.edit','analytics.portfolio.read');

-- Object manager: only assigned objects.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT '00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004',capability,'assigned_to_me'
FROM permission_definitions WHERE capability IN ('home.command.read','task.read','task.edit','operations.object.read','operations.object.edit','operations.need.read','operations.need.edit','operations.shift.read','operations.shift.edit','recruiting.candidate.read','worker.read','time.time_entry.read','time.time_entry.edit','time.timesheet.read','time.timesheet.edit','time.timesheet.submit');

-- Recruiter: assigned needs/candidates; worker read without compensation.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT '00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005',capability,'assigned_to_me'
FROM permission_definitions WHERE capability IN ('home.command.read','task.read','task.edit','operations.need.read','recruiting.candidate.read','recruiting.candidate.create','recruiting.candidate.edit','recruiting.candidate.assign','worker.read');

-- Economist.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT '00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000006',capability,'all_org'
FROM permission_definitions WHERE capability IN ('home.command.read','sales.client.read','sales.request.read','calculation.scenario.read','calculation.scenario.create','calculation.scenario.edit','calculation.scenario.approve','calculation.rate_reference.read','calculation.rate_reference.edit','finance.client_margin.read');

-- Finance.
INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
SELECT '00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000007',capability,'all_org'
FROM permission_definitions WHERE capability IN ('home.command.read','sales.client.read','operations.object.read','worker.read','worker.compensation.read','time.time_entry.read','time.timesheet.read','time.timesheet.approve_client','finance.worker_accrual.read','finance.worker_accrual.edit','finance.payments.read','finance.payments.edit','finance.client_margin.read','finance.pnl.read','analytics.portfolio.read');

INSERT INTO specialties(id,organization_id,code,name,aliases) VALUES
('60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','picker','Комплектовщик',ARRAY['сборщик заказов']),
('60000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','loader','Грузчик',ARRAY[]::text[]),
('60000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','assembler','Сборщик мебели',ARRAY['сборщик']);

INSERT INTO client_companies(id,organization_id,name,legal_name,status,owner_user_id,created_by_user_id,assigned_team_id,region_id) VALUES
('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','NordLog','ООО «НордЛог»','active','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'),
('70000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','FormaBath','ООО «Форма Бат»','active','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002'),
('70000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','CityPack','ООО «Сити Пак»','active','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');

INSERT INTO contacts(id,organization_id,client_company_id,full_name,position,phone,email,owner_user_id,created_by_user_id) VALUES
('71000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','Анастасия Миронова','Операционный менеджер','+7 900 000-00-01','a.mironova@example.test','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');

INSERT INTO leads(id,organization_id,client_company_id,title,source,stage,owner_user_id,created_by_user_id,assigned_team_id,region_id,next_action_at) VALUES
('72000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','Персонал на РЦ Север','Рекомендация','qualified','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-08-31 10:00+03');

INSERT INTO requests(id,organization_id,client_company_id,contact_id,lead_id,title,status,location_text,region_id,expected_start_date,duration_text,schedule_json,lunch_paid,vat_mode,housing_rule,travel_rule,shuttle_rule,ppe_rule,medical_rule,citizenship_rule,tools_rule,comments,owner_user_id,created_by_user_id,assigned_team_id) VALUES
('73000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','РЦ Север — запуск 15 сентября','calculated','Москва, Дмитровское шоссе','30000000-0000-4000-8000-000000000001','2026-09-15','12+ месяцев','{"pattern":"6/1","presenceHours":12,"paidHours":11,"dayStart":"08:00"}',false,'with_vat','include','include','client','client','client','RF_EAEU','client','Golden Path demo request','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001');

INSERT INTO request_roles(id,organization_id,request_id,specialty_id,count_required,schedule_json,requirements_json) VALUES
('74000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',24,'{"pattern":"6/1","paidHours":11}','{"experience":"not_required"}'),
('74000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002',8,'{"pattern":"6/1","paidHours":11}','{"physicalLoad":"high"}');

INSERT INTO rate_reference_entries(id,organization_id,specialty_id,region_id,employment_model,amount_min,amount_max,unit,pay_semantics,source,source_date,confidence,notes,valid_from,created_by_user_id) VALUES
('75000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','employment',360,430,'hour','net','Synthetic demo benchmark','2026-08-20','medium','Demo only; not market guidance','2026-08-20','10000000-0000-4000-8000-000000000006');

INSERT INTO calculation_models(id,organization_id,code,name,model_type,created_by_user_id) VALUES
('76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','employment','Трудовой договор','employment','10000000-0000-4000-8000-000000000001'),
('76000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','gph','ГПХ','gph','10000000-0000-4000-8000-000000000001'),
('76000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','npd','НПД','npd','10000000-0000-4000-8000-000000000001');

INSERT INTO calculation_rule_versions(id,organization_id,calculation_model_id,version,effective_from,rules_json,source,created_by_user_id) VALUES
('77000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001',1,'2026-01-01','{"items":[{"code":"insurance","type":"configured","value":0}],"legalParametersVerified":false}','Synthetic demo rules; production verification required','10000000-0000-4000-8000-000000000001');

INSERT INTO calculations(id,organization_id,request_id,status,owner_user_id,created_by_user_id,approved_by_user_id,approved_at) VALUES
('78000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','approved','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','2026-08-28 16:30+03');

INSERT INTO calculation_scenarios(id,organization_id,calculation_id,request_role_id,model_id,rule_version_id,name,status,inputs_snapshot,cost_snapshot,result_snapshot,rate_reference_snapshot,created_by_user_id,accepted_by_user_id,accepted_at) VALUES
('79000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000001','Базовый TK','accepted','{"workerNetHourly":390,"workers":24,"hoursPerWorker":242,"targetMarginPct":18}','{"employeeHourly":142,"projectHourly":18}','{"totalCostHourly":550,"clientRateHourly":670.73,"marginPct":18,"monthlyContribution":701215.68}','{"source":"Synthetic demo benchmark","amountMin":360,"amountMax":430,"sourceDate":"2026-08-20"}','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','2026-08-28 16:20+03'),
('79000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000001','Грузчики TK','accepted','{"workerNetHourly":420,"workers":8,"hoursPerWorker":242,"targetMarginPct":17}','{"employeeHourly":151,"projectHourly":21}','{"totalCostHourly":592,"clientRateHourly":713.25,"marginPct":17,"monthlyContribution":234740}','{"source":"Synthetic demo benchmark","amountMin":390,"amountMax":470,"sourceDate":"2026-08-20"}','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','2026-08-28 16:25+03');

INSERT INTO proposals(id,organization_id,request_id,version,status,scenario_ids,total_value,created_by_user_id,approved_by_user_id) VALUES
('7a000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',1,'accepted',ARRAY['79000000-0000-4000-8000-000000000001'::uuid,'79000000-0000-4000-8000-000000000002'::uuid],4873632,'10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');

INSERT INTO objects(id,organization_id,client_company_id,source_request_id,name,code,status,region_id,address_text,target_start_date,owner_user_id,created_by_user_id) VALUES
('80000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','РЦ Север','MOW-NL-01','launch','30000000-0000-4000-8000-000000000001','Москва, Дмитровское шоссе','2026-09-15','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002'),
('80000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',NULL,'РЦ Восток','MOW-NL-02','active','30000000-0000-4000-8000-000000000001','Балашиха','2026-06-01','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001'),
('80000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',NULL,'Завод Воротынск','KLG-FB-01','active','30000000-0000-4000-8000-000000000002','Калужская обл., Воротынск','2026-04-10','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001'),
('80000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003',NULL,'Склад Юг','MOW-CP-01','risk','30000000-0000-4000-8000-000000000001','Подольск','2026-07-15','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001'),
('80000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',NULL,'Склад Калуга','KLG-FB-02','active','30000000-0000-4000-8000-000000000002','Калуга','2026-05-20','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001');

INSERT INTO object_assignments(id,organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id) VALUES
('81000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','object_manager','2026-08-25','10000000-0000-4000-8000-000000000001'),
('81000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','object_manager','2026-06-01','10000000-0000-4000-8000-000000000001'),
('81000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','object_manager','2026-07-15','10000000-0000-4000-8000-000000000001');

INSERT INTO launches(id,organization_id,object_id,target_date,forecast_date,progress_pct,risk_level,checklist_json,created_by_user_id) VALUES
('82000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','2026-09-15','2026-09-17',68,'high','[{"title":"Подбор 32 сотрудников","done":false},{"title":"Проживание","done":true},{"title":"СИЗ","done":false}]','10000000-0000-4000-8000-000000000004');

INSERT INTO needs(id,organization_id,object_id,source_request_role_id,specialty_id,count_required,count_filled,deadline,status,owner_user_id,created_by_user_id) VALUES
('83000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',24,17,'2026-09-10','open','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004'),
('83000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',8,5,'2026-09-10','open','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004');

INSERT INTO need_assignments(id,organization_id,need_id,recruiter_user_id,team_id,target_count,assigned_by_user_id) VALUES
('84000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000003',7,'10000000-0000-4000-8000-000000000003'),
('84000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000003',3,'10000000-0000-4000-8000-000000000003');

INSERT INTO candidates(id,organization_id,full_name,phone,source,original_recruiter_user_id,current_recruiter_user_id,created_by_user_id,status) VALUES
('85000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Алексей Орлов','+7 900 000-10-01','Telegram','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','active'),
('85000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Илья Котов','+7 900 000-10-02','Referral','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','active'),
('85000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Сергей Волков','+7 900 000-10-03','Job board','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','converted');

INSERT INTO candidate_applications(id,organization_id,candidate_id,need_id,object_id,stage,next_action_at,owner_user_id,created_by_user_id) VALUES
('86000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','call','2026-08-31 14:30+03','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005'),
('86000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','documents','2026-08-31 11:00+03','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005'),
('86000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','first_shift',NULL,'10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005');

INSERT INTO candidate_stage_history(id,organization_id,application_id,from_stage,to_stage,changed_by_user_id,reason) VALUES
('87000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000003','approved','first_shift','10000000-0000-4000-8000-000000000005','Первый выход подтверждён');

INSERT INTO worker_profiles(id,organization_id,origin_candidate_id,full_name,phone,status,source,original_recruiter_user_id,created_by_user_id) VALUES
('88000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000003','Сергей Волков','+7 900 000-10-03','active','Job board','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005'),
('88000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',NULL,'Павел Ильин','+7 900 000-20-02','active','Legacy import',NULL,'10000000-0000-4000-8000-000000000004');

INSERT INTO employment_relations(id,organization_id,worker_id,relation_type,effective_from,contract_reference,created_by_user_id) VALUES
('89000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','employment','2026-08-28','DEMO-TK-001','10000000-0000-4000-8000-000000000001');

INSERT INTO worker_rates(id,organization_id,worker_id,specialty_id,object_id,amount,unit,effective_from,created_by_user_id) VALUES
('8a000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',390,'hour','2026-08-28','10000000-0000-4000-8000-000000000006');

INSERT INTO worker_object_assignments(id,organization_id,worker_id,object_id,specialty_id,effective_from,manager_user_id,created_by_user_id) VALUES
('8b000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-08-28','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004');

INSERT INTO shifts(id,organization_id,object_id,need_id,specialty_id,shift_date,starts_at,ends_at,shift_kind,demand_count,assigned_count,reserve_count,planned_cost,status,created_by_user_id) VALUES
('8c000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-08-29','2026-08-29 08:00+03','2026-08-29 20:00+03','day',18,17,1,72930,'closed','10000000-0000-4000-8000-000000000004'),
('8c000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-08-31','2026-08-31 08:00+03','2026-08-31 20:00+03','day',20,16,2,68640,'open','10000000-0000-4000-8000-000000000004');

INSERT INTO shift_assignments(id,organization_id,shift_id,worker_id,confirmation_status,is_reserve,assigned_by_user_id) VALUES
('8d000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','8c000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','confirmed',false,'10000000-0000-4000-8000-000000000004');

INSERT INTO attendance_events(id,organization_id,shift_assignment_id,event_type,event_at,source,created_by_user_id) VALUES
('8e000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','8d000000-0000-4000-8000-000000000001','arrival','2026-08-29 07:54+03','master','10000000-0000-4000-8000-000000000004'),
('8e000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','8d000000-0000-4000-8000-000000000001','departure','2026-08-29 20:02+03','master','10000000-0000-4000-8000-000000000004');

INSERT INTO time_entries(id,organization_id,worker_id,object_id,shift_id,work_date,planned,time_code,fact_hours,day_hours,night_hours,overtime_hours,source) VALUES
('8f000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','8c000000-0000-4000-8000-000000000001','2026-08-29',true,'WORK',11,11,0,0,'attendance'),
('8f000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000004',NULL,'2026-08-29',false,'OFF',0,0,0,0,'schedule');

INSERT INTO timesheet_snapshots(id,organization_id,object_id,view_type,period_type,period_start,period_end,status,snapshot_json,submitted_by_user_id,submitted_at,approved_by_user_id,approved_at) VALUES
('90000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','client','second_half','2026-08-16','2026-08-31','approved','{"hours":80,"workers":9,"internalHours":88}','10000000-0000-4000-8000-000000000004','2026-08-30 09:00+03','10000000-0000-4000-8000-000000000007','2026-08-30 11:00+03'),
('90000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','internal','second_half','2026-08-16','2026-08-31','submitted','{"hours":88,"workers":9,"clientHours":80}','10000000-0000-4000-8000-000000000004','2026-08-30 09:00+03',NULL,NULL);

INSERT INTO reconciliation_issues(id,organization_id,object_id,worker_id,work_date,internal_hours,client_hours,difference_hours,reason,owner_user_id,status) VALUES
('91000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','2026-08-27',11,8,3,'Клиент не подтвердил переработку','10000000-0000-4000-8000-000000000004','open');

INSERT INTO client_rates(id,organization_id,client_company_id,object_id,specialty_id,accepted_scenario_id,amount,unit,effective_from,created_by_user_id) VALUES
('92000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000001',670.73,'hour','2026-08-28','10000000-0000-4000-8000-000000000006');

INSERT INTO worker_accruals(id,organization_id,worker_id,object_id,period_start,period_end,base_amount,premium_amount,adjustment_amount,total_amount,status,source_snapshot_id,created_by_user_id,approved_by_user_id) VALUES
('93000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','2026-08-16','2026-08-31',34320,1500,0,35820,'approved','90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007');

INSERT INTO advance_payments(id,organization_id,worker_id,object_id,amount,payment_date,status,reference,created_by_user_id) VALUES
('94000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',5000,'2026-08-25','paid','DEMO-ADV-1','10000000-0000-4000-8000-000000000007');

INSERT INTO worker_payments(id,organization_id,worker_id,object_id,accrual_id,amount,payment_date,status,reference,created_by_user_id,updated_by_user_id) VALUES
('95000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',30820,'2026-09-05','planned','DEMO-PAY-1','10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007');

INSERT INTO client_revenue_lines(id,organization_id,client_company_id,object_id,client_rate_id,period_start,period_end,quantity,unit,rate,amount,source_snapshot_id,status,created_by_user_id) VALUES
('96000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','2026-08-16','2026-08-31',80,'hour',670.73,53658.40,'90000000-0000-4000-8000-000000000001','approved','10000000-0000-4000-8000-000000000007');

INSERT INTO object_expenses(id,organization_id,object_id,expense_date,category,amount,vendor,reference,plan_fact,created_by_user_id) VALUES
('97000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','2026-08-29','housing',9600,'Demo Hostel','H-0829','fact','10000000-0000-4000-8000-000000000007'),
('97000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','2026-08-29','transport',3500,'Demo Transport','T-0829','fact','10000000-0000-4000-8000-000000000007');

INSERT INTO pnl_snapshots(id,organization_id,object_id,period_start,period_end,scenario,revenue,worker_cost,object_expenses,contribution,margin_pct,snapshot_json) VALUES
('98000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','2026-08-16','2026-08-31','fact',53658.40,35820,13100,4738.40,8.829,'{"note":"Golden Path partial period"}'),
('98000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','2026-09-01','2026-09-30','forecast',3110000,2130000,270000,710000,22.83,'{}');

INSERT INTO tasks(id,organization_id,title,status,priority,assignee_user_id,due_at,entity_type,entity_id,created_by_user_id) VALUES
('99000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Закрыть дефицит комплектовщиков','open','critical','10000000-0000-4000-8000-000000000005','2026-09-05 18:00+03','need','83000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003'),
('99000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Разобрать расхождение табеля 3 часа','open','high','10000000-0000-4000-8000-000000000004','2026-08-31 15:00+03','reconciliation','91000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007'),
('99000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Проверить КП РЦ Север','done','normal','10000000-0000-4000-8000-000000000002','2026-08-28 17:00+03','proposal','7a000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');

INSERT INTO activity_events(id,organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES
('9a000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006','calculation','78000000-0000-4000-8000-000000000001','approved','Расчёт по заявке РЦ Север согласован','{}'),
('9a000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','candidate','85000000-0000-4000-8000-000000000003','converted','Кандидат Сергей Волков переведён в сотрудника','{"workerId":"88000000-0000-4000-8000-000000000001"}'),
('9a000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','timesheet','90000000-0000-4000-8000-000000000001','approved','Клиентский табель согласован','{}');

COMMIT;
