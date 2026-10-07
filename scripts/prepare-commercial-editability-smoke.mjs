import postgres from "postgres";

if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});

const org="00000000-0000-4000-8000-000000000002";
const user="10000000-0000-4000-8000-000000000101";
const region="b1000000-0000-4000-8000-000000000901";
const client="b2000000-0000-4000-8000-000000000901";
const specialty="b4000000-0000-4000-8000-000000000901";
const request="bc000000-0000-4000-8000-000000000901";
const requestRole="bd000000-0000-4000-8000-000000000901";
const tender="be000000-0000-4000-8000-000000000901";

try{
  await sql`
    INSERT INTO requests(id,organization_id,client_company_id,title,status,location_text,region_id,owner_user_id,created_by_user_id)
    VALUES(${request}::uuid,${org}::uuid,${client}::uuid,'CI Заявка','draft','CI исходный адрес',${region}::uuid,${user}::uuid,${user}::uuid)
    ON CONFLICT(id) DO UPDATE SET title='CI Заявка',status='draft',location_text='CI исходный адрес',client_company_id=${client}::uuid,owner_user_id=${user}::uuid,archived_at=NULL
  `;
  await sql`
    INSERT INTO request_roles(id,organization_id,request_id,specialty_id,count_required,schedule_json,requirements_json)
    VALUES(${requestRole}::uuid,${org}::uuid,${request}::uuid,${specialty}::uuid,2,'{}'::jsonb,'{}'::jsonb)
    ON CONFLICT(id) DO UPDATE SET count_required=2,specialty_id=${specialty}::uuid
  `;
  await sql`
    INSERT INTO tenders(id,organization_id,client_company_id,title,customer_name,platform,procedure_number,billing_unit,stage,decision,priority,potential,owner_user_id,created_by_user_id,region_id)
    VALUES(${tender}::uuid,${org}::uuid,${client}::uuid,'CI Тендер','CI Заказчик','CI ЭТП','CI-001','hour','new','undecided','normal','medium',${user}::uuid,${user}::uuid,${region}::uuid)
    ON CONFLICT(id) DO UPDATE SET title='CI Тендер',customer_name='CI Заказчик',stage='new',decision='undecided',result=NULL,owner_user_id=${user}::uuid,region_id=${region}::uuid
  `;
  console.log(JSON.stringify({client,request,tender}));
}finally{
  await sql.end();
}
