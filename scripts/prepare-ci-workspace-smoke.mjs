import postgres from "postgres";

if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});

const org="00000000-0000-4000-8000-000000000002";
const user="10000000-0000-4000-8000-000000000101";
const region="b1000000-0000-4000-8000-000000000901";
const client="b2000000-0000-4000-8000-000000000901";
const object="b3000000-0000-4000-8000-000000000901";

try{
  await sql`
    UPDATE app_users
    SET password_hash=crypt('ci-workspace-pass',gen_salt('bf')),is_active=true
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
  console.log(object);
}finally{
  await sql.end();
}
