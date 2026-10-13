// Run after employee-portal-native.browser.mjs on its disposable local database.
// Never accepts an external database URL or uses live account credentials.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import postgres from 'postgres';
import ts from 'typescript';

const require=createRequire(import.meta.url);
process.env.DATABASE_URL='postgresql://ubuntu@127.0.0.1:55439/operis_acceptance';
const admin=postgres(process.env.DATABASE_URL,{max:1,prepare:false,onnotice:()=>{}});
const exports={};
new Function('exports','require',ts.transpileModule(fs.readFileSync('lib/db/client.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText)(exports,require);
const {withTenant,db}=exports;
const organization='00000000-0000-4000-8000-000000000002';
const user='10000000-0000-4000-8000-000000000101';
const name='Native tenant savepoint rollback fixture';
try{
  await admin`DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tenant_savepoint_runtime') THEN
      CREATE ROLE tenant_savepoint_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;
  END $$`;
  const [runtimeRole]=await admin`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='tenant_savepoint_runtime'`;
  assert.equal(runtimeRole.rolsuper,false);
  assert.equal(runtimeRole.rolbypassrls,false);
  await admin`GRANT USAGE ON SCHEMA public TO tenant_savepoint_runtime`;
  await admin`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO tenant_savepoint_runtime`;
  await admin`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO tenant_savepoint_runtime`;
  await withTenant(organization,user,async sql=>{
    await sql`SET LOCAL ROLE tenant_savepoint_runtime`;
    const [outer]=await sql`SELECT pg_backend_pid() pid,current_user role`;
    assert.equal(outer.role,'tenant_savepoint_runtime');
    await assert.rejects(()=>sql.begin(async inner=>{
      const [context]=await inner`SELECT pg_backend_pid() pid,current_setting('app.organization_id') organization,current_setting('app.user_id') actor`;
      assert.equal(context.pid,outer.pid);
      assert.equal(context.organization,organization);
      assert.equal(context.actor,user);
      await inner`INSERT INTO worker_profiles(organization_id,full_name,status,created_by_user_id) VALUES(${organization}::uuid,${name},'active',${user}::uuid)`;
      throw new Error('inner rollback fixture');
    }),/inner rollback fixture/);
    const [count]=await sql`SELECT count(*)::int count FROM worker_profiles WHERE full_name=${name}`;
    assert.equal(count.count,0,'inner rollback leaves outer transaction usable');
  });
  await assert.rejects(()=>withTenant(organization,user,async sql=>{
    await sql`SET LOCAL ROLE tenant_savepoint_runtime`;
    await sql.begin(async inner=>inner.begin(async nested=>{
      await nested`INSERT INTO worker_profiles(organization_id,full_name,status,created_by_user_id) VALUES(${organization}::uuid,${name},'active',${user}::uuid)`;
      const [context]=await nested`SELECT current_setting('app.organization_id') organization,current_user role`;
      assert.equal(context.organization,organization);
      assert.equal(context.role,'tenant_savepoint_runtime');
    }));
    throw new Error('outer rollback fixture');
  }),/outer rollback fixture/);
  const [count]=await admin`SELECT count(*)::int count FROM worker_profiles WHERE full_name=${name}`;
  assert.equal(count.count,0,'successful nested savepoints cannot escape outer rollback');
  const contexts=await Promise.all([
    withTenant(organization,user,async sql=>(await sql`SELECT current_setting('app.organization_id') organization`)[0].organization),
    withTenant('00000000-0000-4000-8000-000000000001',user,async sql=>(await sql`SELECT current_setting('app.organization_id') organization`)[0].organization),
  ]);
  assert.deepEqual(contexts,[organization,'00000000-0000-4000-8000-000000000001']);
  console.log('PASS native tenant transactions: manual nested begin uses savepoint, tenant/actor/role preserved, inner and outer rollback, concurrent tenant contexts');
}finally{
  await db().end();
  await admin.end();
}
