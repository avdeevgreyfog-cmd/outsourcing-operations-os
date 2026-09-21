BEGIN;

DO $$
DECLARE
  org_id constant uuid := '00000000-0000-4000-8000-000000000001';
  director_user constant uuid := '10000000-0000-4000-8000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id=org_id) THEN
    RETURN;
  END IF;

  PERFORM set_config('app.organization_id',org_id::text,true);
  PERFORM set_config('app.user_id',director_user::text,true);

  UPDATE organizations SET name='БЕТА · ОПЕРИС Аутсорсинг',slug='operis-beta' WHERE id=org_id;
  UPDATE legal_entities SET name='ООО «Оперис Аутсорсинг»',short_name='Оперис Аутсорсинг'
  WHERE organization_id=org_id AND is_primary=true;

  UPDATE regions SET code='MOW',name='Москва и Московская область' WHERE id='30000000-0000-4000-8000-000000000001'::uuid;
  UPDATE regions SET code='KLG',name='Калужская область' WHERE id='30000000-0000-4000-8000-000000000002'::uuid;
  INSERT INTO regions(id,organization_id,code,name)
  VALUES ('30000000-0000-4000-8000-000000000003',org_id,'VLA','Владимирская область')
  ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name;

  UPDATE app_users SET display_name='Анна Лебедева' WHERE id='10000000-0000-4000-8000-000000000001'::uuid;
  UPDATE app_users SET display_name='Михаил Соколов' WHERE id='10000000-0000-4000-8000-000000000002'::uuid;
  UPDATE app_users SET display_name='Алексей Громов' WHERE id='10000000-0000-4000-8000-000000000003'::uuid;
  UPDATE app_users SET display_name='Дмитрий Орлов' WHERE id='10000000-0000-4000-8000-000000000004'::uuid;
  UPDATE app_users SET display_name='Мария Лебедева' WHERE id='10000000-0000-4000-8000-000000000005'::uuid;
  UPDATE app_users SET display_name='Елена Котова' WHERE id='10000000-0000-4000-8000-000000000006'::uuid;
  UPDATE app_users SET display_name='Татьяна Миронова' WHERE id='10000000-0000-4000-8000-000000000007'::uuid;

  INSERT INTO app_users(id,email,display_name) VALUES
    ('10000000-0000-4000-8000-000000000008','client1@beta.local','Анна Воронова'),
    ('10000000-0000-4000-8000-000000000009','client2@beta.local','Елена Морозова'),
    ('10000000-0000-4000-8000-000000000010','object2@beta.local','Павел Никитин'),
    ('10000000-0000-4000-8000-000000000011','supply@beta.local','Ирина Белова'),
    ('10000000-0000-4000-8000-000000000012','recruiter1@beta.local','Ольга Зайцева'),
    ('10000000-0000-4000-8000-000000000013','recruiter2@beta.local','Ксения Волкова'),
    ('10000000-0000-4000-8000-000000000014','recruiter3@beta.local','Наталья Фомина')
  ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name;

  DELETE FROM position_assignments WHERE organization_id=org_id;
  DELETE FROM staff_positions WHERE organization_id=org_id;
  DELETE FROM membership_organization_units WHERE organization_id=org_id;
  DELETE FROM organization_unit_leads WHERE organization_id=org_id;
  DELETE FROM membership_process_roles WHERE organization_id=org_id;
  DELETE FROM responsibility_assignments WHERE organization_id=org_id;
  DELETE FROM responsibility_rules WHERE organization_id=org_id;
  DELETE FROM position_permission_grants WHERE organization_id=org_id;
  DELETE FROM process_role_permission_grants WHERE organization_id=org_id;
  DELETE FROM permission_grants WHERE organization_id=org_id;
  DELETE FROM membership_teams WHERE organization_id=org_id;
  DELETE FROM membership_regions WHERE organization_id=org_id;

  UPDATE organization_memberships
  SET role_template_id=NULL,position_id=NULL,primary_org_unit_id=NULL,manager_membership_id=NULL
  WHERE organization_id=org_id;

  UPDATE organization_units
  SET code='beta-tmp-unit-'||replace(id::text,'-',''),parent_id=NULL,manager_membership_id=NULL
  WHERE organization_id=org_id;
  UPDATE positions SET code='beta-tmp-position-'||replace(id::text,'-','') WHERE organization_id=org_id;
  UPDATE process_roles SET code='beta-tmp-process-'||replace(id::text,'-','') WHERE organization_id=org_id;
  UPDATE role_templates SET code='beta-tmp-role-'||replace(id::text,'-','') WHERE organization_id=org_id;

  DELETE FROM organization_memberships
  WHERE organization_id=org_id AND id='50000000-0000-4000-8000-000000000007'::uuid;

  UPDATE role_templates SET code='director',name='Директор',description='Полный контур управления компанией',is_system=true WHERE id='40000000-0000-4000-8000-000000000001'::uuid;
  UPDATE role_templates SET code='commercial_lead',name='Руководитель коммерческого направления',description='Продажи, тендеры, расчёты и КП',is_system=true WHERE id='40000000-0000-4000-8000-000000000002'::uuid;
  UPDATE role_templates SET code='client_manager',name='Менеджер клиентских заявок',description='Приём и сопровождение клиентских заявок',is_system=true WHERE id='40000000-0000-4000-8000-000000000003'::uuid;
  UPDATE role_templates SET code='operations_head',name='Руководитель объектов',description='Управление портфелем объектов',is_system=true WHERE id='40000000-0000-4000-8000-000000000004'::uuid;
  UPDATE role_templates SET code='object_manager',name='Менеджер объекта',description='Ежедневное управление закреплёнными объектами',is_system=true WHERE id='40000000-0000-4000-8000-000000000005'::uuid;
  UPDATE role_templates SET code='supply_specialist',name='Снабжение и документооборот',description='Снабжение, имущество, жильё и документы',is_system=true WHERE id='40000000-0000-4000-8000-000000000006'::uuid;
  UPDATE role_templates SET code='recruitment_head',name='Руководитель отдела подбора',description='Управление потребностями и командой подбора',is_system=true WHERE id='40000000-0000-4000-8000-000000000007'::uuid;
  INSERT INTO role_templates(id,organization_id,code,name,description,is_system) VALUES
    ('40000000-0000-4000-8000-000000000008',org_id,'recruiter','Менеджер по подбору','Поиск и сопровождение кандидатов',true),
    ('40000000-0000-4000-8000-000000000009',org_id,'finance_economist','Экономист / финансовый менеджер','Расчёты, начисления, выплаты и P&L',true)
  ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,description=EXCLUDED.description,is_system=true;

  INSERT INTO organization_memberships(id,organization_id,user_id,role_template_id,primary_team_id,status,phone) VALUES
    ('50000000-0000-4000-8000-000000000001',org_id,'10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','active','+7 900 200-01-01'),
    ('50000000-0000-4000-8000-000000000002',org_id,'10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','active','+7 900 200-02-02'),
    ('50000000-0000-4000-8000-000000000003',org_id,'10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002','active','+7 900 200-03-03'),
    ('50000000-0000-4000-8000-000000000004',org_id,'10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','active','+7 900 200-04-04'),
    ('50000000-0000-4000-8000-000000000005',org_id,'10000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000003','active','+7 900 200-05-05'),
    ('50000000-0000-4000-8000-000000000006',org_id,'10000000-0000-4000-8000-000000000006','40000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000004','active','+7 900 200-06-06'),
    ('50000000-0000-4000-8000-000000000008',org_id,'10000000-0000-4000-8000-000000000008','40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','active','+7 900 200-08-08'),
    ('50000000-0000-4000-8000-000000000009',org_id,'10000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','active','+7 900 200-09-09'),
    ('50000000-0000-4000-8000-000000000010',org_id,'10000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','active','+7 900 200-10-10'),
    ('50000000-0000-4000-8000-000000000011',org_id,'10000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000002','active','+7 900 200-11-11'),
    ('50000000-0000-4000-8000-000000000012',org_id,'10000000-0000-4000-8000-000000000012','40000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000003','active','+7 900 200-12-12'),
    ('50000000-0000-4000-8000-000000000013',org_id,'10000000-0000-4000-8000-000000000013','40000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000003','active','+7 900 200-13-13'),
    ('50000000-0000-4000-8000-000000000014',org_id,'10000000-0000-4000-8000-000000000014','40000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000003','active','+7 900 200-14-14')
  ON CONFLICT (organization_id,user_id) DO UPDATE SET role_template_id=EXCLUDED.role_template_id,primary_team_id=EXCLUDED.primary_team_id,status='active',phone=EXCLUDED.phone;

  UPDATE positions SET code='ceo',name='Генеральный директор / собственник',purpose='Управление компанией и финальные решения',duties=ARRAY['Стратегическое управление','Финальные согласования','Контроль ключевых рисков'],responsibilities=ARRAY['Результат компании','Коммерческие решения','Операционный и финансовый результат'],process_participation=ARRAY['Управление','Коммерция','Операции','Финансы'] WHERE id='41000000-0000-4000-8000-000000000001'::uuid;
  UPDATE positions SET code='commercial-lead',name='Руководитель коммерческого направления',purpose='Развивать продажи и доводить сделки до запуска',duties=ARRAY['Поиск новых заказов','Тендеры','Расчёты и КП','Договорная работа'],responsibilities=ARRAY['Коммерческий результат','Корректность условий','Скорость сделки'],process_participation=ARRAY['Заявка','Расчёт','КП','Договор'] WHERE id='41000000-0000-4000-8000-000000000002'::uuid;
  UPDATE positions SET code='client-manager',name='Менеджер по клиентским заявкам',purpose='Принимать и сопровождать заявки заказчиков',duties=ARRAY['Принимать заявки','Уточнять условия','Вести клиента','Передавать заявку в работу'],responsibilities=ARRAY['Полнота заявки','Срок реакции','Актуальность клиентских данных'],process_participation=ARRAY['Клиенты','Заявки'] WHERE id='41000000-0000-4000-8000-000000000003'::uuid;
  UPDATE positions SET code='operations-head',name='Руководитель объектов',purpose='Управлять портфелем объектов и менеджерами',duties=ARRAY['Распределять объекты','Контролировать запуск','Контролировать табели и риски','Разбирать эскалации'],responsibilities=ARRAY['Результат портфеля','Своевременный запуск','Комплектация и качество'],process_participation=ARRAY['Объекты','Запуски','Комплектация','Табели'] WHERE id='41000000-0000-4000-8000-000000000004'::uuid;
  UPDATE positions SET code='object-manager',name='Менеджер объекта',purpose='Обеспечивать стабильную ежедневную работу закреплённых объектов',duties=ARRAY['Управлять сотрудниками и сменами','Вести табель','Контролировать обеспечение','Фиксировать инциденты'],responsibilities=ARRAY['Выходы и смены','Табель','Комплектация','Обеспечение'],process_participation=ARRAY['Объект','Смены','Табели','Персонал'] WHERE id='41000000-0000-4000-8000-000000000005'::uuid;
  UPDATE positions SET code='supply-specialist',name='Специалист по снабжению и документообороту',purpose='Обеспечивать объекты ресурсами и сопровождать операционные документы',duties=ARRAY['Вести запасы','Обрабатывать заявки на обеспечение','Работать с поставщиками','Контролировать жильё и имущество','Вести операционный документооборот'],responsibilities=ARRAY['СИЗ и имущество','Срок исполнения заявок','Поставщики','Документы'],process_participation=ARRAY['Снабжение','Имущество','Жильё','Документооборот'] WHERE id='41000000-0000-4000-8000-000000000006'::uuid;
  UPDATE positions SET code='recruitment-head',name='Руководитель отдела подбора',purpose='Управлять командой подбора и закрытием потребностей',duties=ARRAY['Распределять потребности','Контролировать воронку','Управлять загрузкой','Контролировать подготовку к выходу'],responsibilities=ARRAY['Закрытие потребностей','Срок подбора','Качество выхода'],process_participation=ARRAY['Потребности','Подбор','Подготовка выхода'] WHERE id='41000000-0000-4000-8000-000000000007'::uuid;
  INSERT INTO positions(id,organization_id,code,name,purpose,duties,responsibilities,process_participation) VALUES
    ('41000000-0000-4000-8000-000000000008',org_id,'recruiter','Менеджер по подбору','Искать и сопровождать кандидатов до первого выхода',ARRAY['Искать кандидатов','Вести коммуникацию','Собирать документы','Готовить к выходу'],ARRAY['Кандидатская воронка','Документы','Подтверждённые выходы'],ARRAY['Подбор','Кандидаты','Документы']),
    ('41000000-0000-4000-8000-000000000009',org_id,'finance-economist','Экономист / финансовый менеджер','Вести коммерческую и фактическую экономику компании',ARRAY['Готовить расчёты','Проверять маржинальность','Вести нормативы и базу ставок','Проверять начисления и выплаты','Сверять табели','Анализировать P&L'],ARRAY['Расчёты и ставки','Маржа','Начисления и выплаты','Финансовый результат'],ARRAY['Расчёт экономики','Согласование','Закрытие периода','Выплаты','P&L'])
  ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,purpose=EXCLUDED.purpose,duties=EXCLUDED.duties,responsibilities=EXCLUDED.responsibilities,process_participation=EXCLUDED.process_participation,active=true;

  UPDATE process_roles SET code='commercial-owner',name='Владелец коммерческого контура',description='Расчёты, КП, тендеры и договоры',responsibility='Коммерческий результат и передача согласованного заказа в запуск' WHERE id='42000000-0000-4000-8000-000000000001'::uuid;
  UPDATE process_roles SET code='client-request-manager',name='Менеджер клиентских заявок',description='Приём и сопровождение входящих заявок',responsibility='Полнота и своевременная передача заявки' WHERE id='42000000-0000-4000-8000-000000000002'::uuid;
  UPDATE process_roles SET code='operations-owner',name='Владелец портфеля объектов',description='Управление всеми действующими объектами',responsibility='Операционный результат портфеля' WHERE id='42000000-0000-4000-8000-000000000003'::uuid;
  UPDATE process_roles SET code='object-owner',name='Ответственный за объект',description='Ежедневная ответственность за закреплённые объекты',responsibility='Смены, табели, персонал и качество' WHERE id='42000000-0000-4000-8000-000000000004'::uuid;
  INSERT INTO process_roles(id,organization_id,code,name,description,responsibility) VALUES
    ('42000000-0000-4000-8000-000000000005',org_id,'supply-owner','Ответственный за обеспечение','Снабжение, имущество и операционный документооборот','Исполнение заявок на обеспечение'),
    ('42000000-0000-4000-8000-000000000006',org_id,'recruitment-owner','Руководитель подбора','Распределение кадровой потребности','Закрытие потребностей и загрузка рекрутеров'),
    ('42000000-0000-4000-8000-000000000007',org_id,'recruiter','Рекрутер','Исполнитель подбора','Кандидаты по назначенным потребностям'),
    ('42000000-0000-4000-8000-000000000008',org_id,'calculation-economist','Экономист расчётов','Подготовка и проверка экономики','Корректность расчётов и нормативов'),
    ('42000000-0000-4000-8000-000000000009',org_id,'finance-controller','Финансовый контролёр','Закрытие периода и финансовый контроль','Начисления, выплаты и фактическая экономика')
  ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,description=EXCLUDED.description,responsibility=EXCLUDED.responsibility,active=true;

  UPDATE organization_units SET parent_id=NULL,region_id=NULL,manager_membership_id='50000000-0000-4000-8000-000000000001',code='company',name='БЕТА · ОПЕРИС Аутсорсинг',kind='company',description='Тестовая рабочая модель компании для сквозной проверки OPERIS',sort_order=0 WHERE id='21000000-0000-4000-8000-000000000001'::uuid;
  UPDATE organization_units SET parent_id='21000000-0000-4000-8000-000000000001',region_id=NULL,manager_membership_id='50000000-0000-4000-8000-000000000001',code='management',name='Руководство',kind='department',description='Управление компанией',sort_order=10 WHERE id='21000000-0000-4000-8000-000000000002'::uuid;
  UPDATE organization_units SET parent_id='21000000-0000-4000-8000-000000000001',region_id=NULL,manager_membership_id='50000000-0000-4000-8000-000000000002',code='commercial',name='Коммерция',kind='department',description='Продажи, тендеры, расчёты, КП и договорная работа',sort_order=20 WHERE id='21000000-0000-4000-8000-000000000003'::uuid;
  UPDATE organization_units SET parent_id='21000000-0000-4000-8000-000000000003',region_id=NULL,manager_membership_id='50000000-0000-4000-8000-000000000002',code='client-service',name='Клиентский сервис',kind='team',description='Приём и сопровождение клиентских заявок',sort_order=10 WHERE id='21000000-0000-4000-8000-000000000004'::uuid;
  UPDATE organization_units SET parent_id='21000000-0000-4000-8000-000000000001',region_id=NULL,manager_membership_id='50000000-0000-4000-8000-000000000003',code='operations',name='Операции',kind='department',description='Управление портфелем объектов и производственным персоналом',sort_order=30 WHERE id='21000000-0000-4000-8000-000000000005'::uuid;
  UPDATE organization_units SET parent_id='21000000-0000-4000-8000-000000000005',region_id=NULL,manager_membership_id='50000000-0000-4000-8000-000000000003',code='object-managers',name='Менеджеры объектов',kind='team',description='Ежедневное управление закреплёнными объектами',sort_order=10 WHERE id='21000000-0000-4000-8000-000000000006'::uuid;
  UPDATE organization_units SET parent_id='21000000-0000-4000-8000-000000000001',region_id=NULL,manager_membership_id='50000000-0000-4000-8000-000000000011',code='supply',name='Обеспечение',kind='department',description='Снабжение, имущество, жильё и операционный документооборот',sort_order=45 WHERE id='21000000-0000-4000-8000-000000000007'::uuid;
  UPDATE organization_units SET parent_id='21000000-0000-4000-8000-000000000001',region_id=NULL,manager_membership_id='50000000-0000-4000-8000-000000000005',code='recruitment',name='Подбор персонала',kind='department',description='Управление кадровой потребностью и воронкой подбора',sort_order=40 WHERE id='21000000-0000-4000-8000-000000000008'::uuid;
  INSERT INTO organization_units(id,organization_id,parent_id,region_id,manager_membership_id,code,name,kind,description,sort_order) VALUES
    ('21000000-0000-4000-8000-000000000009',org_id,'21000000-0000-4000-8000-000000000008',NULL,'50000000-0000-4000-8000-000000000005','recruiters','Группа подбора','team','Поиск и сопровождение кандидатов до первого выхода',10),
    ('21000000-0000-4000-8000-000000000010',org_id,'21000000-0000-4000-8000-000000000001',NULL,'50000000-0000-4000-8000-000000000006','finance','Экономика и финансы','department','Расчёты, начисления, выплаты и фактическая экономика объектов',50)
  ON CONFLICT (id) DO UPDATE SET parent_id=EXCLUDED.parent_id,region_id=EXCLUDED.region_id,manager_membership_id=EXCLUDED.manager_membership_id,code=EXCLUDED.code,name=EXCLUDED.name,kind=EXCLUDED.kind,description=EXCLUDED.description,sort_order=EXCLUDED.sort_order,active=true;

  INSERT INTO staff_positions(id,organization_id,code,name,job_profile_id,organization_unit_id,reports_to_position_id,capacity,level,status,effective_from,created_by_user_id) VALUES
    ('43000000-0000-4000-8000-000000000001',org_id,'CEO-01','Генеральный директор / собственник','41000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002',NULL,1,0,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000002',org_id,'COMM-HEAD-01','Руководитель коммерческого направления','41000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000001',1,1,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000003',org_id,'CLIENT-01','Менеджер по клиентским заявкам','41000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000004','43000000-0000-4000-8000-000000000002',1,2,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000004',org_id,'CLIENT-02','Менеджер по клиентским заявкам','41000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000004','43000000-0000-4000-8000-000000000002',1,2,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000005',org_id,'OPS-HEAD-01','Руководитель объектов','41000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000005','43000000-0000-4000-8000-000000000001',1,1,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000006',org_id,'OBJECT-01','Менеджер объекта','41000000-0000-4000-8000-000000000005','21000000-0000-4000-8000-000000000006','43000000-0000-4000-8000-000000000005',1,2,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000007',org_id,'OBJECT-02','Менеджер объекта','41000000-0000-4000-8000-000000000005','21000000-0000-4000-8000-000000000006','43000000-0000-4000-8000-000000000005',1,2,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000008',org_id,'SUPPLY-01','Специалист по снабжению и документообороту','41000000-0000-4000-8000-000000000006','21000000-0000-4000-8000-000000000007','43000000-0000-4000-8000-000000000001',1,1,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000009',org_id,'REC-HEAD-01','Руководитель отдела подбора','41000000-0000-4000-8000-000000000007','21000000-0000-4000-8000-000000000008','43000000-0000-4000-8000-000000000001',1,1,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000010',org_id,'REC-01','Менеджер по подбору','41000000-0000-4000-8000-000000000008','21000000-0000-4000-8000-000000000009','43000000-0000-4000-8000-000000000009',1,2,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000011',org_id,'REC-02','Менеджер по подбору','41000000-0000-4000-8000-000000000008','21000000-0000-4000-8000-000000000009','43000000-0000-4000-8000-000000000009',1,2,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000012',org_id,'REC-03','Менеджер по подбору','41000000-0000-4000-8000-000000000008','21000000-0000-4000-8000-000000000009','43000000-0000-4000-8000-000000000009',1,2,'filled','2026-01-01',director_user),
    ('43000000-0000-4000-8000-000000000013',org_id,'FIN-ECON-01','Экономист / финансовый менеджер','41000000-0000-4000-8000-000000000009','21000000-0000-4000-8000-000000000010','43000000-0000-4000-8000-000000000001',1,1,'filled','2026-01-01',director_user);

  INSERT INTO position_assignments(id,organization_id,staff_position_id,membership_id,assignment_type,fte,status,effective_from,reason,created_by_user_id) VALUES
    ('44000000-0000-4000-8000-000000000001',org_id,'43000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000002',org_id,'43000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000003',org_id,'43000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000008','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000004',org_id,'43000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000009','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000005',org_id,'43000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000003','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000006',org_id,'43000000-0000-4000-8000-000000000006','50000000-0000-4000-8000-000000000004','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000007',org_id,'43000000-0000-4000-8000-000000000007','50000000-0000-4000-8000-000000000010','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000008',org_id,'43000000-0000-4000-8000-000000000008','50000000-0000-4000-8000-000000000011','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000009',org_id,'43000000-0000-4000-8000-000000000009','50000000-0000-4000-8000-000000000005','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000010',org_id,'43000000-0000-4000-8000-000000000010','50000000-0000-4000-8000-000000000012','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000011',org_id,'43000000-0000-4000-8000-000000000011','50000000-0000-4000-8000-000000000013','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000012',org_id,'43000000-0000-4000-8000-000000000012','50000000-0000-4000-8000-000000000014','primary',1,'active','2026-01-01','Бета-компания',director_user),
    ('44000000-0000-4000-8000-000000000013',org_id,'43000000-0000-4000-8000-000000000013','50000000-0000-4000-8000-000000000006','primary',1,'active','2026-01-01','Бета-компания',director_user);

  UPDATE organization_memberships SET
    position_id=sp.job_profile_id,
    primary_org_unit_id=sp.organization_unit_id,
    manager_membership_id=CASE m.id
      WHEN '50000000-0000-4000-8000-000000000001'::uuid THEN NULL
      WHEN '50000000-0000-4000-8000-000000000002'::uuid THEN '50000000-0000-4000-8000-000000000001'::uuid
      WHEN '50000000-0000-4000-8000-000000000003'::uuid THEN '50000000-0000-4000-8000-000000000001'::uuid
      WHEN '50000000-0000-4000-8000-000000000004'::uuid THEN '50000000-0000-4000-8000-000000000003'::uuid
      WHEN '50000000-0000-4000-8000-000000000005'::uuid THEN '50000000-0000-4000-8000-000000000001'::uuid
      WHEN '50000000-0000-4000-8000-000000000006'::uuid THEN '50000000-0000-4000-8000-000000000001'::uuid
      WHEN '50000000-0000-4000-8000-000000000008'::uuid THEN '50000000-0000-4000-8000-000000000002'::uuid
      WHEN '50000000-0000-4000-8000-000000000009'::uuid THEN '50000000-0000-4000-8000-000000000002'::uuid
      WHEN '50000000-0000-4000-8000-000000000010'::uuid THEN '50000000-0000-4000-8000-000000000003'::uuid
      WHEN '50000000-0000-4000-8000-000000000011'::uuid THEN '50000000-0000-4000-8000-000000000001'::uuid
      ELSE '50000000-0000-4000-8000-000000000005'::uuid END
  FROM position_assignments pa JOIN staff_positions sp ON sp.id=pa.staff_position_id
  WHERE m.id=pa.membership_id AND m.organization_id=org_id;

  INSERT INTO membership_organization_units(organization_id,membership_id,organization_unit_id,assignment_type,effective_from)
  SELECT org_id,m.id,m.primary_org_unit_id,'primary','2026-01-01'
  FROM organization_memberships m WHERE m.organization_id=org_id AND m.primary_org_unit_id IS NOT NULL;

  INSERT INTO organization_unit_leads(organization_id,organization_unit_id,membership_id,lead_type,effective_from)
  SELECT org_id,id,manager_membership_id,'primary','2026-01-01'
  FROM organization_units WHERE organization_id=org_id AND manager_membership_id IS NOT NULL;

  INSERT INTO membership_process_roles(organization_id,membership_id,process_role_id,org_unit_id,effective_from,assigned_by_user_id) VALUES
    (org_id,'50000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000003','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000008','42000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000004','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000009','42000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000004','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000005','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000006','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000010','42000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000006','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000011','42000000-0000-4000-8000-000000000005','21000000-0000-4000-8000-000000000007','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000005','42000000-0000-4000-8000-000000000006','21000000-0000-4000-8000-000000000008','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000012','42000000-0000-4000-8000-000000000007','21000000-0000-4000-8000-000000000009','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000013','42000000-0000-4000-8000-000000000007','21000000-0000-4000-8000-000000000009','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000014','42000000-0000-4000-8000-000000000007','21000000-0000-4000-8000-000000000009','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000006','42000000-0000-4000-8000-000000000008','21000000-0000-4000-8000-000000000010','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000006','42000000-0000-4000-8000-000000000009','21000000-0000-4000-8000-000000000010','2026-01-01',director_user);

  INSERT INTO responsibility_assignments(organization_id,membership_id,process_role_id,resource_type,resource_label,responsibility_type,effective_from,created_by_user_id) VALUES
    (org_id,'50000000-0000-4000-8000-000000000001',NULL,'company','Стратегия и результат компании','owner','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000001','commercial','Тендеры, расчёты, КП и договоры','owner','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000008','42000000-0000-4000-8000-000000000002','clients','Север Логистик, ЭлектроМаш и Калуга Технопарк','executor','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000009','42000000-0000-4000-8000-000000000002','clients','Серпухов Фуд и МаркетФулфилмент','executor','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000003','portfolio','Портфель из 5 объектов','owner','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000004','objects','РЦ Северный, Склад Маркет Подольск, Технопарк Калуга','owner','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000010','42000000-0000-4000-8000-000000000004','objects','Пищекомбинат Серпухов, ЭлектроМаш Владимир','owner','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000011','42000000-0000-4000-8000-000000000005','supply','Снабжение, жильё, имущество и операционный документооборот','executor','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000005','42000000-0000-4000-8000-000000000006','recruitment','Все кадровые потребности и команда из трёх рекрутеров','owner','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000012','42000000-0000-4000-8000-000000000007','objects','РЦ Северный и Склад Маркет Подольск','executor','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000013','42000000-0000-4000-8000-000000000007','objects','Пищекомбинат Серпухов и Технопарк Калуга','executor','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000014','42000000-0000-4000-8000-000000000007','objects','ЭлектроМаш Владимир и Склад Маркет Подольск','executor','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000006','42000000-0000-4000-8000-000000000008','finance','Коммерческие расчёты, база ставок и плановая маржа','executor','2026-01-01',director_user),
    (org_id,'50000000-0000-4000-8000-000000000006','42000000-0000-4000-8000-000000000009','finance','Начисления, выплаты, закрытие табелей и P&L','approver','2026-01-01',director_user);

  INSERT INTO membership_teams(organization_id,membership_id,team_id)
  SELECT org_id,id,primary_team_id FROM organization_memberships
  WHERE organization_id=org_id AND primary_team_id IS NOT NULL ON CONFLICT DO NOTHING;

  INSERT INTO membership_regions(organization_id,membership_id,region_id)
  SELECT org_id,m.id,r.id FROM organization_memberships m CROSS JOIN regions r
  WHERE m.organization_id=org_id AND r.organization_id=org_id AND r.code IN ('MOW','KLG','VLA')
    AND m.id IN (
      '50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000005',
      '50000000-0000-4000-8000-000000000006'
    )
  ON CONFLICT DO NOTHING;

  INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
  SELECT org_id,'40000000-0000-4000-8000-000000000001'::uuid,capability,'all_org'
  FROM permission_definitions ON CONFLICT DO NOTHING;

  INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
  SELECT org_id,'40000000-0000-4000-8000-000000000002'::uuid,capability,'all_org'
  FROM permission_definitions WHERE capability IN (
    'home.command.read','task.read','task.edit','approval.read','approval.decide',
    'sales.lead.read','sales.lead.create','sales.lead.edit','sales.client.read','sales.client.create','sales.client.edit',
    'sales.request.read','sales.request.create','sales.request.edit','sales.request.archive',
    'sales.proposal.read','sales.proposal.create','sales.proposal.edit','sales.proposal.submit','sales.proposal.client_decision','sales.proposal.launch',
    'contract.read','contract.create','contract.edit','contract.submit',
    'calculation.scenario.read','calculation.scenario.create','calculation.scenario.edit','calculation.rate_reference.read','organization.read'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
  SELECT org_id,'40000000-0000-4000-8000-000000000003'::uuid,capability,'all_org'
  FROM permission_definitions WHERE capability IN (
    'home.command.read','task.read','task.edit','sales.client.read','sales.client.create','sales.client.edit',
    'sales.request.read','sales.request.create','sales.request.edit','sales.proposal.read','organization.read'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
  SELECT org_id,'40000000-0000-4000-8000-000000000004'::uuid,capability,'all_org'
  FROM permission_definitions WHERE capability IN (
    'home.command.read','task.read','task.edit','approval.read','approval.decide','sales.client.read','sales.request.read','contract.read',
    'operations.object.read','operations.object.edit','operations.need.read','operations.need.edit','operations.shift.read','operations.shift.edit',
    'operations.crew.read','operations.crew.manage','assets.read','assets.manage','procurement.read','procurement.manage',
    'supply.housing.read','supply.housing.manage','recruiting.candidate.read','worker.read','worker.edit','worker.offboarding.manage',
    'time.time_entry.read','time.timesheet.read','time.timesheet.edit','time.timesheet.review',
    'finance.pnl.read','analytics.portfolio.read','organization.read'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
  SELECT org_id,'40000000-0000-4000-8000-000000000005'::uuid,capability,
    CASE WHEN capability='organization.read' THEN 'org_unit' ELSE 'assigned_to_me' END
  FROM permission_definitions WHERE capability IN (
    'home.command.read','task.read','task.edit','operations.object.read','operations.object.edit','operations.need.read','operations.need.edit',
    'operations.shift.read','operations.shift.edit','operations.crew.read','operations.crew.manage','assets.read','assets.manage',
    'procurement.read','procurement.manage','supply.housing.read','supply.housing.manage','recruiting.candidate.read',
    'worker.read','worker.edit','time.time_entry.read','time.time_entry.edit','time.timesheet.read','time.timesheet.edit','time.timesheet.submit','organization.read'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
  SELECT org_id,'40000000-0000-4000-8000-000000000006'::uuid,capability,'all_org'
  FROM permission_definitions WHERE capability IN (
    'home.command.read','task.read','task.edit','operations.object.read','assets.read','assets.manage',
    'procurement.read','procurement.manage','supply.housing.read','supply.housing.manage','organization.read'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
  SELECT org_id,'40000000-0000-4000-8000-000000000007'::uuid,capability,'all_org'
  FROM permission_definitions WHERE capability IN (
    'home.command.read','task.read','task.edit','operations.need.read','operations.need.edit',
    'recruiting.candidate.read','recruiting.candidate.create','recruiting.candidate.edit','recruiting.candidate.assign','recruiting.candidate.convert',
    'recruiting.analytics.configure','recruiting.pipeline.configure','recruiting.sources.manage','worker.read','organization.read'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
  SELECT org_id,'40000000-0000-4000-8000-000000000008'::uuid,capability,
    CASE WHEN capability='organization.read' THEN 'org_unit' ELSE 'assigned_to_me' END
  FROM permission_definitions WHERE capability IN (
    'home.command.read','task.read','task.edit','operations.need.read',
    'recruiting.candidate.read','recruiting.candidate.create','recruiting.candidate.edit','recruiting.candidate.assign','recruiting.candidate.convert',
    'worker.read','organization.read'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO permission_grants(organization_id,role_template_id,capability,scope_type)
  SELECT org_id,'40000000-0000-4000-8000-000000000009'::uuid,capability,'all_org'
  FROM permission_definitions WHERE capability IN (
    'home.command.read','task.read','task.edit','approval.read','approval.decide','sales.client.read','sales.request.read','sales.proposal.read','contract.read',
    'calculation.scenario.read','calculation.scenario.create','calculation.scenario.edit','calculation.scenario.approve',
    'calculation.rate_reference.read','calculation.rate_reference.edit','calculation.rules.read','calculation.rules.manage',
    'operations.object.read','worker.read','worker.compensation.read','time.time_entry.read','time.timesheet.read','time.timesheet.review','time.timesheet.approve_client',
    'finance.worker_accrual.read','finance.worker_accrual.edit','finance.payments.read','finance.payments.edit','finance.client_margin.read','finance.pnl.read',
    'analytics.portfolio.read','organization.read'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO process_role_permission_grants(organization_id,process_role_id,capability,scope_type)
  SELECT org_id,'42000000-0000-4000-8000-000000000004'::uuid,capability,'assigned_to_me'
  FROM permission_definitions WHERE capability IN (
    'operations.object.read','operations.object.edit','operations.need.read','operations.need.edit',
    'operations.shift.read','operations.shift.edit','time.timesheet.read','time.timesheet.edit'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO process_role_permission_grants(organization_id,process_role_id,capability,scope_type)
  SELECT org_id,'42000000-0000-4000-8000-000000000007'::uuid,capability,'assigned_to_me'
  FROM permission_definitions WHERE capability IN (
    'operations.need.read','recruiting.candidate.read','recruiting.candidate.create','recruiting.candidate.edit','recruiting.candidate.assign'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO process_role_permission_grants(organization_id,process_role_id,capability,scope_type)
  SELECT org_id,'42000000-0000-4000-8000-000000000008'::uuid,capability,'all_org'
  FROM permission_definitions WHERE capability IN (
    'calculation.scenario.read','calculation.scenario.create','calculation.scenario.edit','calculation.rate_reference.read','calculation.rate_reference.edit'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO process_role_permission_grants(organization_id,process_role_id,capability,scope_type)
  SELECT org_id,'42000000-0000-4000-8000-000000000009'::uuid,capability,'all_org'
  FROM permission_definitions WHERE capability IN (
    'finance.worker_accrual.read','finance.worker_accrual.edit','finance.payments.read','finance.payments.edit','finance.pnl.read'
  ) ON CONFLICT DO NOTHING;
END $$;

COMMIT;
