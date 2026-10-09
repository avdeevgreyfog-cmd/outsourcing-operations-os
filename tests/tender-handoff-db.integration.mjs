import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required for tender handoff integration tests');
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
const org='00000000-0000-4000-8000-000000000001';
const director='10000000-0000-4000-8000-000000000001';
const client='70000000-0000-4000-8000-000000000001';
const region='30000000-0000-4000-8000-000000000001';
const specialty='60000000-0000-4000-8000-000000000001';
const legalEntity='31000000-0000-4000-8000-000000000001';
const request='73000000-0000-4000-8000-000000000001';

try{
  const migrations=await sql`SELECT filename FROM schema_migrations ORDER BY filename`;
  assert.ok(migrations.some(row=>row.filename==='0067_tender_win_handoff.sql'),'Tender win handoff migration must be applied');
  await sql`SELECT set_config('app.organization_id',${org},false),set_config('app.user_id',${director},false)`;

  const tender=randomUUID();
  await sql`INSERT INTO tenders(id,organization_id,client_company_id,region_id,legal_entity_id,title,customer_name,stage,result,owner_user_id,created_by_user_id) VALUES(${tender}::uuid,${org}::uuid,${client}::uuid,${region}::uuid,${legalEntity}::uuid,'Won tender integration','Test customer','completed','won',${director}::uuid,${director}::uuid)`;
  const role=randomUUID();
  await sql`INSERT INTO tender_roles(id,organization_id,tender_id,specialty_id,title,count_required,billing_unit) VALUES(${role}::uuid,${org}::uuid,${tender}::uuid,${specialty}::uuid,'Комплектовщик',20,'hour')`;

  const object=randomUUID();
  await sql`INSERT INTO objects(id,organization_id,client_company_id,legal_entity_id,source_tender_id,name,code,status,region_id,owner_user_id,created_by_user_id) VALUES(${object}::uuid,${org}::uuid,${client}::uuid,${legalEntity}::uuid,${tender}::uuid,'Tender launch object',${`TND-${object.slice(0,8)}`},'prelaunch',${region}::uuid,${director}::uuid,${director}::uuid)`;
  const contract=randomUUID();
  await sql`INSERT INTO contracts(id,organization_id,client_company_id,legal_entity_id,request_id,tender_id,proposal_id,object_id,kind,status,title,owner_user_id,created_by_user_id) VALUES(${contract}::uuid,${org}::uuid,${client}::uuid,${legalEntity}::uuid,NULL,${tender}::uuid,NULL,${object}::uuid,'master','draft','Tender source contract',${director}::uuid,${director}::uuid)`;
  const need=randomUUID();
  await sql`INSERT INTO needs(id,organization_id,object_id,source_request_role_id,source_tender_role_id,specialty_id,count_required,count_filled,deadline,status,owner_user_id,created_by_user_id) VALUES(${need}::uuid,${org}::uuid,${object}::uuid,NULL,${role}::uuid,${specialty}::uuid,20,0,current_date+7,'open',${director}::uuid,${director}::uuid)`;

  const [handoff]=await sql`SELECT c.request_id,c.tender_id,o.source_request_id,o.source_proposal_id,o.source_tender_id,n.source_request_role_id,n.source_tender_role_id FROM contracts c JOIN objects o ON o.id=c.object_id JOIN needs n ON n.object_id=o.id WHERE c.id=${contract}::uuid AND n.id=${need}::uuid`;
  assert.equal(handoff.request_id,null);
  assert.equal(handoff.tender_id,tender);
  assert.equal(handoff.source_request_id,null);
  assert.equal(handoff.source_proposal_id,null);
  assert.equal(handoff.source_tender_id,tender);
  assert.equal(handoff.source_request_role_id,null);
  assert.equal(handoff.source_tender_role_id,role);

  await assert.rejects(()=>sql`INSERT INTO contracts(organization_id,client_company_id,legal_entity_id,request_id,tender_id,kind,status,title,owner_user_id,created_by_user_id) VALUES(${org}::uuid,${client}::uuid,${legalEntity}::uuid,${request}::uuid,${tender}::uuid,'master','draft','Invalid dual source',${director}::uuid,${director}::uuid)`,error=>error?.code==='23514');
  const manualObject=randomUUID();
  await sql`INSERT INTO objects(id,organization_id,client_company_id,legal_entity_id,name,code,status,region_id,owner_user_id,created_by_user_id) VALUES(${manualObject}::uuid,${org}::uuid,${client}::uuid,${legalEntity}::uuid,'Manual source object',${`MAN-${manualObject.slice(0,8)}`},'prelaunch',${region}::uuid,${director}::uuid,${director}::uuid)`;
  await assert.rejects(()=>sql`INSERT INTO contracts(organization_id,client_company_id,legal_entity_id,request_id,tender_id,object_id,kind,status,title,owner_user_id,created_by_user_id) VALUES(${org}::uuid,${client}::uuid,${legalEntity}::uuid,NULL,${tender}::uuid,${manualObject}::uuid,'master','draft','Tender contract with foreign object source',${director}::uuid,${director}::uuid)`,error=>error?.code==='23514');
  await assert.rejects(()=>sql`INSERT INTO objects(organization_id,client_company_id,legal_entity_id,source_request_id,source_tender_id,name,code,status,region_id,owner_user_id,created_by_user_id) VALUES(${org}::uuid,${client}::uuid,${legalEntity}::uuid,${request}::uuid,${tender}::uuid,'Invalid dual source object',${`BAD-${randomUUID().slice(0,8)}`},'prelaunch',${region}::uuid,${director}::uuid,${director}::uuid)`,error=>error?.code==='23514');

  const otherTender=randomUUID();
  await sql`INSERT INTO tenders(id,organization_id,client_company_id,region_id,title,customer_name,stage,result,owner_user_id,created_by_user_id) VALUES(${otherTender}::uuid,${org}::uuid,${client}::uuid,${region}::uuid,'Other won tender','Test customer','completed','won',${director}::uuid,${director}::uuid)`;
  const otherRole=randomUUID();
  await sql`INSERT INTO tender_roles(id,organization_id,tender_id,specialty_id,title,count_required,billing_unit) VALUES(${otherRole}::uuid,${org}::uuid,${otherTender}::uuid,${specialty}::uuid,'Other role',5,'hour')`;
  await assert.rejects(()=>sql`INSERT INTO needs(organization_id,object_id,source_tender_role_id,specialty_id,count_required,count_filled,deadline,status,owner_user_id,created_by_user_id) VALUES(${org}::uuid,${object}::uuid,${otherRole}::uuid,${specialty}::uuid,5,0,current_date+7,'open',${director}::uuid,${director}::uuid)`,error=>error?.code==='23514');

  const permission=await sql`SELECT capability FROM permission_definitions WHERE capability='sales.tender.launch'`;
  assert.equal(permission[0]?.capability,'sales.tender.launch');
  console.log('Tender win handoff PostgreSQL integration passed: exclusive sources, tender contract/object/need links and launch capability.');
}finally{await sql.end();}
