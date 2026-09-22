BEGIN;

DO $$
DECLARE
  org_id constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  director_user constant uuid := '10000000-0000-4000-8000-000000000001'::uuid;
BEGIN
  -- Beta data is optional in clean/non-demo installations. Match 0037/0038 and no-op
  -- when the fixture organization was not created.
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id=org_id) THEN
    RETURN;
  END IF;

  PERFORM set_config('app.organization_id',org_id::text,true);
  PERFORM set_config('app.user_id',director_user::text,true);

  -- Keep the beta company useful for checking local/rotation logic and size-based PPE.
  WITH ranked AS (
    SELECT id,row_number() OVER(ORDER BY id) rn
    FROM worker_profiles
    WHERE organization_id=org_id
      AND id::text LIKE '88000000-%'
  )
  UPDATE worker_profiles w
  SET clothing_size=(ARRAY['48','50','52','54','56'])[((r.rn-1)%5)+1],
      shoe_size=(ARRAY['41','42','43','44','45'])[((r.rn-1)%5)+1],
      height_cm=168+(((r.rn-1)%11)*2)
  FROM ranked r
  WHERE w.id=r.id;

  UPDATE worker_object_assignments
  SET work_mode=CASE WHEN worker_id IN (
      '88000000-0000-4000-8000-000000000001'::uuid,
      '88000000-0000-4000-8000-000000000004'::uuid,
      '88000000-0000-4000-8000-000000000007'::uuid,
      '88000000-0000-4000-8000-000000000009'::uuid,
      '88000000-0000-4000-8000-000000000012'::uuid,
      '88000000-0000-4000-8000-000000000015'::uuid,
      '88000000-0000-4000-8000-000000000018'::uuid,
      '88000000-0000-4000-8000-000000000019'::uuid,
      '88000000-0000-4000-8000-000000000021'::uuid,
      '88000000-0000-4000-8000-000000000022'::uuid,
      '88000000-0000-4000-8000-000000000024'::uuid,
      '88000000-0000-4000-8000-000000000025'::uuid,
      '88000000-0000-4000-8000-000000000027'::uuid,
      '88000000-0000-4000-8000-000000000028'::uuid,
      '88000000-0000-4000-8000-000000000029'::uuid,
      '88000000-0000-4000-8000-000000000032'::uuid,
      '88000000-0000-4000-8000-000000000035'::uuid,
      '88000000-0000-4000-8000-000000000038'::uuid,
      '88000000-0000-4000-8000-000000000041'::uuid,
      '88000000-0000-4000-8000-000000000044'::uuid
    ) THEN 'rotation' ELSE 'local' END,
    paid_hours_per_shift=11
  WHERE organization_id=org_id
    AND worker_id::text LIKE '88000000-%'
    AND (effective_to IS NULL OR effective_to>=current_date);

  UPDATE worker_rates
  SET amount=amount*11,unit='shift'
  WHERE organization_id=org_id
    AND worker_id IN (
      '88000000-0000-4000-8000-000000000001'::uuid,
      '88000000-0000-4000-8000-000000000005'::uuid,
      '88000000-0000-4000-8000-000000000009'::uuid,
      '88000000-0000-4000-8000-000000000013'::uuid,
      '88000000-0000-4000-8000-000000000017'::uuid,
      '88000000-0000-4000-8000-000000000021'::uuid,
      '88000000-0000-4000-8000-000000000025'::uuid,
      '88000000-0000-4000-8000-000000000029'::uuid,
      '88000000-0000-4000-8000-000000000033'::uuid,
      '88000000-0000-4000-8000-000000000037'::uuid,
      '88000000-0000-4000-8000-000000000041'::uuid
    )
    AND unit='hour';

  UPDATE needs
  SET conditions_snapshot=jsonb_set(
        jsonb_set(COALESCE(conditions_snapshot,'{}'::jsonb),'{workMode}',
          to_jsonb(CASE WHEN COALESCE((conditions_snapshot->>'housingProvided')::boolean,false) THEN 'rotation' ELSE 'local' END),true),
        '{paidHoursPerShift}','11'::jsonb,true)
  WHERE organization_id=org_id;

  INSERT INTO worker_absence_plans(
    id,organization_id,worker_id,object_id,absence_type,status,planned_from,planned_to,flexible_return,note,created_by_user_id
  ) VALUES
    ('8c000000-0000-4000-8000-000000000001',org_id,'88000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','intershift','confirmed','2026-09-18','2026-09-28',true,'Плановая межвахта','10000000-0000-4000-8000-000000000004'),
    ('8c000000-0000-4000-8000-000000000002',org_id,'88000000-0000-4000-8000-000000000010','80000000-0000-4000-8000-000000000002','vacation','confirmed','2026-09-25','2026-10-04',false,'Плановый отпуск','10000000-0000-4000-8000-000000000010'),
    ('8c000000-0000-4000-8000-000000000003',org_id,'88000000-0000-4000-8000-000000000018','80000000-0000-4000-8000-000000000003','intershift','confirmed','2026-09-20','2026-10-01',true,'Плановая межвахта','10000000-0000-4000-8000-000000000010'),
    ('8c000000-0000-4000-8000-000000000004',org_id,'88000000-0000-4000-8000-000000000030','80000000-0000-4000-8000-000000000004','sick','confirmed','2026-09-21','2026-09-24',false,'Больничный','10000000-0000-4000-8000-000000000004'),
    ('8c000000-0000-4000-8000-000000000005',org_id,'88000000-0000-4000-8000-000000000038','80000000-0000-4000-8000-000000000005','intershift','confirmed','2026-09-16','2026-09-25',true,'Плановая межвахта','10000000-0000-4000-8000-000000000004')
  ON CONFLICT(id) DO UPDATE SET
    worker_id=EXCLUDED.worker_id,object_id=EXCLUDED.object_id,absence_type=EXCLUDED.absence_type,status=EXCLUDED.status,
    planned_from=EXCLUDED.planned_from,planned_to=EXCLUDED.planned_to,flexible_return=EXCLUDED.flexible_return,note=EXCLUDED.note,updated_at=now();

  INSERT INTO contacts(
    id,organization_id,client_company_id,full_name,position,phone,email,telegram,whatsapp,max_contact,communication_preference,owner_user_id,created_by_user_id
  ) VALUES
    ('8d000000-0000-4000-8000-000000000001',org_id,'70000000-0000-4000-8000-000000000001','Алексей Петров','Начальник участка','+7 900 555-01-01','a.petrov@example.ru','@petrov_object','+7 900 555-01-01',NULL,'telegram','10000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008'),
    ('8d000000-0000-4000-8000-000000000002',org_id,'70000000-0000-4000-8000-000000000002','Игорь Крылов','Руководитель производства','+7 900 555-02-02','i.krylov@example.ru',NULL,'+7 900 555-02-02',NULL,'phone','10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000009'),
    ('8d000000-0000-4000-8000-000000000003',org_id,'70000000-0000-4000-8000-000000000003','Марина Белова','Специалист по персоналу','+7 900 555-03-03','m.belova@example.ru','@belova_hr',NULL,NULL,'telegram','10000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008'),
    ('8d000000-0000-4000-8000-000000000004',org_id,'70000000-0000-4000-8000-000000000004','Олег Серов','Начальник смены','+7 900 555-04-04','o.serov@example.ru',NULL,'+7 900 555-04-04','+7 900 555-04-04','whatsapp','10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000009'),
    ('8d000000-0000-4000-8000-000000000005',org_id,'70000000-0000-4000-8000-000000000005','Елена Павлова','Администратор объекта','+7 900 555-05-05','e.pavlova@example.ru','@pavlova_admin',NULL,NULL,'telegram','10000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008')
  ON CONFLICT(id) DO UPDATE SET
    full_name=EXCLUDED.full_name,position=EXCLUDED.position,phone=EXCLUDED.phone,email=EXCLUDED.email,
    telegram=EXCLUDED.telegram,whatsapp=EXCLUDED.whatsapp,max_contact=EXCLUDED.max_contact,
    communication_preference=EXCLUDED.communication_preference,owner_user_id=EXCLUDED.owner_user_id;

  INSERT INTO object_contact_assignments(
    id,organization_id,object_id,contact_id,roles,note,active,created_by_user_id
  ) VALUES
    ('8e000000-0000-4000-8000-000000000001',org_id,'80000000-0000-4000-8000-000000000001','8d000000-0000-4000-8000-000000000001',ARRAY['operations','timesheet','security'],'Основной контакт по ежедневной работе и табелю',true,'10000000-0000-4000-8000-000000000004'),
    ('8e000000-0000-4000-8000-000000000002',org_id,'80000000-0000-4000-8000-000000000002','8d000000-0000-4000-8000-000000000002',ARRAY['operations','timesheet','closing_signer'],'Производство, табель и закрывающие документы',true,'10000000-0000-4000-8000-000000000010'),
    ('8e000000-0000-4000-8000-000000000003',org_id,'80000000-0000-4000-8000-000000000003','8d000000-0000-4000-8000-000000000003',ARRAY['documents','security','approval'],'Документы сотрудников и допуски на объект',true,'10000000-0000-4000-8000-000000000010'),
    ('8e000000-0000-4000-8000-000000000004',org_id,'80000000-0000-4000-8000-000000000004','8d000000-0000-4000-8000-000000000004',ARRAY['operations','timesheet','warehouse_ppe'],'Смены, табель и выдача СИЗ',true,'10000000-0000-4000-8000-000000000004'),
    ('8e000000-0000-4000-8000-000000000005',org_id,'80000000-0000-4000-8000-000000000005','8d000000-0000-4000-8000-000000000005',ARRAY['operations','documents','finance'],'Операционные вопросы, документы и сверки',true,'10000000-0000-4000-8000-000000000004')
  ON CONFLICT(object_id,contact_id) DO UPDATE SET roles=EXCLUDED.roles,note=EXCLUDED.note,active=true,updated_at=now();
END $$;

COMMIT;
