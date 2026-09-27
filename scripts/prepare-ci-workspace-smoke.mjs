import postgres from "postgres";

if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
if(!process.env.CI_SMOKE_PASSWORD)throw new Error("CI_SMOKE_PASSWORD is required");
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
const password=process.env.CI_SMOKE_PASSWORD;

const org="00000000-0000-4000-8000-000000000002";
const user="10000000-0000-4000-8000-000000000101";
const region="b1000000-0000-4000-8000-000000000901";
const client="b2000000-0000-4000-8000-000000000901";
const object="b3000000-0000-4000-8000-000000000901";
const specialty="b4000000-0000-4000-8000-000000000901";
const need="b5000000-0000-4000-8000-000000000901";
const candidate="b6000000-0000-4000-8000-000000000901";
const application="b7000000-0000-4000-8000-000000000901";
const worker="b8000000-0000-4000-8000-000000000901";
const assignment="b9000000-0000-4000-8000-000000000901";
const rate="ba000000-0000-4000-8000-000000000901";
const accrual="bb000000-0000-4000-8000-000000000901";
const advance="bf000000-0000-4000-8000-000000000901";

try{
  await sql`
    UPDATE app_users
    SET password_hash=crypt(${password},gen_salt('bf')),is_active=true
    WHERE id=${user}::uuid
  `;
  await sql`
    INSERT INTO regions(id,organization_id,code,name)
    VALUES(${region}::uuid,${org}::uuid,'CI-MOW','CI Москва')
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name
  `;
  await sql`
    INSERT INTO client_companies(id,organization_id,name,status,owner_user_id,created_by_user_id,region_id)
    VALUES(${client}::uuid,${org}::uuid,'CI Заказчик','active',${user}::uuid,${user}::uuid,${region}::uuid)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,status='active',region_id=EXCLUDED.region_id
  `;
  await sql`
    INSERT INTO objects(id,organization_id,client_company_id,name,code,status,region_id,owner_user_id,created_by_user_id,target_start_date)
    VALUES(${object}::uuid,${org}::uuid,${client}::uuid,'CI Рабочий объект','CI-OBJECT','active',${region}::uuid,${user}::uuid,${user}::uuid,current_date)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,status='active',owner_user_id=EXCLUDED.owner_user_id,region_id=EXCLUDED.region_id
  `;
  await sql`
    INSERT INTO specialties(id,organization_id,code,name,active)
    VALUES(${specialty}::uuid,${org}::uuid,'ci-picker','CI Комплектовщик',true)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,active=true
  `;
  await sql`
    INSERT INTO needs(id,organization_id,object_id,specialty_id,count_required,count_filled,status,owner_user_id,created_by_user_id,region_id,source_kind,title,priority,manager_user_id)
    VALUES(${need}::uuid,${org}::uuid,${object}::uuid,${specialty}::uuid,1,1,'closed',${user}::uuid,${user}::uuid,${region}::uuid,'other','CI импортированная потребность','low',${user}::uuid)
    ON CONFLICT(id) DO UPDATE SET status='closed',count_required=1,count_filled=1
  `;
  await sql`
    INSERT INTO candidates(id,organization_id,full_name,phone,source,current_recruiter_user_id,created_by_user_id,status,source_channel,source_reference)
    VALUES(${candidate}::uuid,${org}::uuid,'CI Кандидат','+7 900 000-00-01','company_database',${user}::uuid,${user}::uuid,'active','spreadsheet','CI-K-1')
    ON CONFLICT(id) DO UPDATE SET full_name=EXCLUDED.full_name
  `;
  await sql`
    INSERT INTO candidate_applications(id,organization_id,candidate_id,need_id,object_id,stage,owner_user_id,created_by_user_id,manager_user_id,planned_start_date,conditions_snapshot,workflow_details,source_snapshot,planned_shift_kind)
    VALUES(${application}::uuid,${org}::uuid,${candidate}::uuid,${need}::uuid,${object}::uuid,'first_shift',${user}::uuid,${user}::uuid,${user}::uuid,current_date,
      '{"sourceStatus":"Приступил к работе","announcedRate":"4500 ₽ / смена"}'::jsonb,
      '{"nextActionLabel":"Нет действий"}'::jsonb,
      '{"source":"company_database","channel":"spreadsheet","reference":"CI-K-1"}'::jsonb,'day')
    ON CONFLICT(id) DO UPDATE SET stage='first_shift',object_id=EXCLUDED.object_id
  `;
  await sql`
    INSERT INTO worker_profiles(id,organization_id,origin_candidate_id,full_name,phone,status,source,created_by_user_id,employment_documents_status)
    VALUES(${worker}::uuid,${org}::uuid,${candidate}::uuid,'CI Работник','+7 900 000-00-02','active','company_database',${user}::uuid,'not_received')
    ON CONFLICT(id) DO UPDATE SET status='active',full_name=EXCLUDED.full_name
  `;
  await sql`
    INSERT INTO worker_object_assignments(id,organization_id,worker_id,object_id,specialty_id,effective_from,manager_user_id,created_by_user_id,work_mode,paid_hours_per_shift,transition_days,daily_payment_shifts,schedule_work_days,schedule_rest_days,schedule_shift_kind,schedule_anchor_date)
    VALUES(${assignment}::uuid,${org}::uuid,${worker}::uuid,${object}::uuid,${specialty}::uuid,current_date-interval '2 days',${user}::uuid,${user}::uuid,'local',11,7,7,5,2,'day',current_date-interval '2 days')
    ON CONFLICT(id) DO UPDATE SET effective_to=NULL,daily_payment_shifts=7
  `;
  await sql`
    INSERT INTO worker_rates(id,organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id)
    VALUES(${rate}::uuid,${org}::uuid,${worker}::uuid,${specialty}::uuid,${object}::uuid,4500,'shift','day',current_date-interval '2 days',${user}::uuid)
    ON CONFLICT(id) DO UPDATE SET amount=4500,effective_to=NULL
  `;
  await sql`
    INSERT INTO time_entries(organization_id,worker_id,object_id,work_date,planned,time_code,fact_hours,day_hours,night_hours,overtime_hours,planned_shift_kind,source)
    VALUES(${org}::uuid,${worker}::uuid,${object}::uuid,current_date-interval '1 day',true,'WORK',11,11,0,0,'day','import')
    ON CONFLICT(worker_id,object_id,work_date) DO UPDATE SET time_code='WORK',fact_hours=11,day_hours=11,night_hours=0
  `;
  await sql`
    INSERT INTO worker_accruals(id,organization_id,worker_id,object_id,period_start,period_end,base_amount,premium_amount,adjustment_amount,total_amount,status,created_by_user_id)
    VALUES(${accrual}::uuid,${org}::uuid,${worker}::uuid,${object}::uuid,date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date,4500,0,0,4500,'draft',${user}::uuid)
    ON CONFLICT(id) DO UPDATE SET total_amount=4500,base_amount=4500
  `;
  await sql`
    INSERT INTO advance_payments(id,organization_id,worker_id,object_id,amount,payment_date,status,reference,created_by_user_id,payment_purpose,work_date,confirmed_by_user_id,confirmed_at,record_source,reconciliation_status)
    VALUES(${advance}::uuid,${org}::uuid,${worker}::uuid,${object}::uuid,4500,current_date,'paid','CI ежедневная выплата',${user}::uuid,'daily_shift',current_date-interval '1 day',${user}::uuid,now(),'legacy','confirmed')
    ON CONFLICT(id) DO UPDATE SET status='paid',amount=4500
  `;
  console.log(object);
}finally{
  await sql.end();
}
