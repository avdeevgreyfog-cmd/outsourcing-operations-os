import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {canReadCompanyEmployee} from '../lib/organization/read-scope.mjs';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const org='00000000-0000-4000-8000-000000000001';
const foreignOrg='00000000-0000-4000-8000-000000000002';
const actorUser='10000000-0000-4000-8000-000000000001';
const actorMembership='11000000-0000-4000-8000-000000000001';
const targetMembership='11000000-0000-4000-8000-000000000002';
const targetUser='10000000-0000-4000-8000-000000000002';
const roleTemplate='12000000-0000-4000-8000-000000000001';
const legacyPosition='13000000-0000-4000-8000-000000000001';
const seatPosition='13000000-0000-4000-8000-000000000002';
const legacyUnit='14000000-0000-4000-8000-000000000001';
const seatUnit='14000000-0000-4000-8000-000000000002';
const membershipUnit='14000000-0000-4000-8000-000000000003';
const legacyRegion='15000000-0000-4000-8000-000000000001';
const seatRegion='15000000-0000-4000-8000-000000000002';
const membershipRegion='15000000-0000-4000-8000-000000000003';

function transpileFile(file){
  return ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
}

const systemModule={};
new Function('exports','require',transpileFile('lib/access/system.ts'))(systemModule,require);
const accessServer={};
new Function('exports','require',transpileFile('lib/access/server.ts'))(accessServer,name=>{
  if(name==='@/lib/access/system')return systemModule;
  return require(name);
});

function actorFor({scope='all_org',capability=true}={}){
  return {userId:actorUser,membershipId:actorMembership,organizationId:org,demo:false,access:{
    capabilities:capability?['organization.read']:[],denies:[],allOrg:true,
    scopes:{'organization.read':scope?[{type:scope,ids:[]}]:[]},
  }};
}

function defaultTarget(overrides={}){
  return {id:targetMembership,userId:targetUser,organizationId:org,orgUnitId:legacyUnit,regionId:legacyRegion,
    positionId:legacyPosition,primaryOrgUnitId:legacyUnit,roleTemplateId:roleTemplate,isOwner:false,...overrides};
}

function loadEndpoint({actor=actorFor(),target=defaultTarget(),inherited=[],overrides=[],systemGrants=[],regions=[],seats=[],units=[],descendants=[]}={}){
  const queries=[];
  const sourceNames={role_template:'Шаблон роли',job_profile:'Должностной профиль',process_role:'Процессная роль'};
  const inheritedItems=inherited.map(row=>({capability:row.capability,label:row.label??row.capability,effect:row.effect,scopeType:row.scope_type,scopeIds:row.scope_ids,sourceType:row.sourceType??'role_template',sourceName:row.sourceName??sourceNames[row.sourceType??'role_template']}));
  const overrideItems=overrides.map(row=>({capability:row.capability,label:row.label??row.capability,effect:row.effect,scopeType:row.scope_type,scopeIds:row.scope_ids,sourceType:'individual',sourceName:'Индивидуальное исключение'}));
  const systemItems=systemGrants.map(row=>({capability:row.capability,label:row.label??row.capability,effect:'allow',scopeType:'all_org',scopeIds:[],sourceType:'system_admin',sourceName:'Системное полномочие'}));
  const sql=async(parts,...values)=>{
    const text=parts.join('?');queries.push({text,values});
    if(text.includes('FROM organization_memberships m'))return target?[target]:[];
    if(text.includes('SELECT region_id FROM membership_regions'))return regions;
    if(text.includes('SELECT DISTINCT sp.job_profile_id'))return seats;
    if(text.includes('SELECT organization_unit_id FROM membership_organization_units'))return units;
    if(text.includes('sourceType'))return [...inheritedItems,...overrideItems,...systemItems].sort((left,right)=>left.capability.localeCompare(right.capability)||left.sourceType.localeCompare(right.sourceType));
    if(text.includes('FROM permission_grants g JOIN role_templates'))return [];
    if(text.includes('FROM permission_grants'))return inherited;
    if(text.includes('FROM user_permission_overrides'))return overrides;
    if(text.includes('SELECT EXISTS(')&&text.includes('organization_owners'))return [{isOwner:false}];
    if(text.includes('FROM membership_system_grants'))return systemGrants;
    return [];
  };
  sql.unsafe=async(text,values)=>{queries.push({text,values,unsafe:true});return descendants;};
  const deps={
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    '@/lib/access/server':accessServer,
    '@/lib/auth/server':{getCurrentActor:async()=>actor},
    '@/lib/db/client':{withTenant:async(orgId,userId,fn)=>{
      assert.equal(orgId,actor.organizationId);assert.equal(userId,actor.userId);return fn(sql);
    }},
    '@/lib/access/system':systemModule,
    '@/lib/organization/read-scope.mjs':{canReadCompanyEmployee},
  };
  const routeModule={};new Function('exports','require',transpileFile('app/api/organization/employees/[id]/access/route.ts'))(routeModule,name=>deps[name]??require(name));
  return {GET:routeModule.GET,queries};
}

function accessParams(id=targetMembership){return {params:Promise.resolve({id})};}
async function get(options){const loaded=loadEndpoint(options);const response=await loaded.GET(new Request('http://local/api/organization/employees/'+targetMembership+'/access'),accessParams());return {...loaded,response,body:await response.json()};}
const grant=(capability,effect,scope_type='all_org',scope_ids=[],sourceType='role_template')=>({capability,effect,scope_type,scope_ids,sourceType});
const override=(capability,effect,scope_type='all_org',scope_ids=[])=>({capability,effect,scope_type,scope_ids});
const effective=(body,capability)=>body.effective.find(item=>item.capability===capability);

test('self scope rejects another employee before reading any grants',async()=>{
  const {response,queries}=await get({actor:actorFor({scope:'self'})});
  assert.equal(response.status,403);
  assert.equal(queries.length,1);
  assert.match(queries[0].text,/FROM organization_memberships m/);
  assert.equal(queries.some(query=>/FROM (permission_grants|membership_regions|membership_process_roles|user_permission_overrides|membership_system_grants)/.test(query.text)),false);
});

test('self scope permits the actor own employee record',async()=>{
  const actor=actorFor({scope:'self'});
  const {response}=await get({actor,target:defaultTarget({id:actorMembership,userId:actorUser})});
  assert.equal(response.status,200);
});

test('organization subtree scope permits a target employee in the granted subtree',async()=>{
  const actor=actorFor({scope:'org_unit_subtree'});
  actor.access.scopes['organization.read']=[{type:'org_unit_subtree',ids:[legacyUnit]}];
  const {response,body}=await get({actor});
  assert.equal(response.status,200);
  assert.ok(body);
});

test('a foreign tenant target is rejected even under all_org and before grant reads',async()=>{
  const {response,queries}=await get({target:defaultTarget({organizationId:foreignOrg})});
  assert.equal(response.status,403);
  assert.equal(queries.length,1);
});

test('missing organization.read capability is rejected before opening the tenant query',async()=>{
  const {response,queries}=await get({actor:actorFor({capability:false})});
  assert.equal(response.status,403);
  assert.equal(queries.length,0);
});

test('missing employee target returns 404 without reading grants',async()=>{
  const {response,queries}=await get({target:null});
  assert.equal(response.status,404);
  assert.equal(queries.length,1);
});

test('individual allow overrides an inherited deny',async()=>{
  const cap='example.read';
  const {response,body}=await get({inherited:[grant(cap,'deny')],overrides:[override(cap,'allow','assigned_to_me')]});
  assert.equal(response.status,200);
  assert.deepEqual(effective(body,cap),{capability:cap,label:cap,effect:'allow',scopeTypes:['assigned_to_me'],scopeIds:[],sources:2});
  assert.deepEqual(body.items.map(item=>item.sourceType),['individual','role_template']);
  assert.deepEqual(body.items.map(item=>item.sourceName),['Индивидуальное исключение','Шаблон роли']);
});

test('individual self scope replaces inherited all_org scope',async()=>{
  const cap='example.read';
  const {response,body}=await get({inherited:[grant(cap,'allow','all_org')],overrides:[override(cap,'allow','self')]});
  assert.equal(response.status,200);
  assert.deepEqual(effective(body,cap),{capability:cap,label:cap,effect:'allow',scopeTypes:['self'],scopeIds:[],sources:2});
});

test('individual deny overrides inherited allow',async()=>{
  const cap='example.read';
  const {response,body}=await get({inherited:[grant(cap,'allow','all_org')],overrides:[override(cap,'deny')]});
  assert.equal(response.status,200);
  assert.deepEqual(effective(body,cap),{capability:cap,label:cap,effect:'deny',scopeTypes:[],scopeIds:[],sources:2});
});

test('effective scope context combines legacy profile, active seats, membership regions and units',async()=>{
  const {response,body,queries}=await get({
    regions:[{region_id:membershipRegion}],
    seats:[{job_profile_id:seatPosition,organization_unit_id:seatUnit,region_id:seatRegion}],
    units:[{organization_unit_id:membershipUnit}],
    inherited:[grant('context.units','allow','org_unit',[],'job_profile'),grant('context.regions','allow','region',[],'process_role')],
  });
  assert.equal(response.status,200);
  assert.deepEqual(effective(body,'context.units').scopeIds.sort(),[legacyUnit,seatUnit,membershipUnit].sort());
  assert.deepEqual(effective(body,'context.regions').scopeIds.sort(),[membershipRegion,seatRegion].sort());
  assert.deepEqual(body.items.map(item=>item.sourceType),['process_role','job_profile']);
  assert.deepEqual(body.items.map(item=>item.sourceName),['Процессная роль','Должностной профиль']);
  const positionQuery=queries.find(query=>query.text.includes('position_id=ANY'));
  assert.ok(positionQuery.values.flat(Infinity).includes(legacyPosition));
  assert.ok(positionQuery.values.flat(Infinity).includes(seatPosition));
});

test('system grant restores allow and all_org priority over inherited and individual deny',async()=>{
  const cap='organization.access.manage';
  const {response,body}=await get({inherited:[grant(cap,'deny')],overrides:[override(cap,'deny')],systemGrants:[{capability:cap}]});
  assert.equal(response.status,200);
  assert.deepEqual(effective(body,cap),{capability:cap,label:cap,effect:'allow',scopeTypes:['all_org'],scopeIds:[],sources:3});
  assert.deepEqual(body.items.map(item=>item.sourceType),['individual','role_template','system_admin']);
  assert.deepEqual(body.items.map(item=>item.sourceName),['Индивидуальное исключение','Шаблон роли','Системное полномочие']);
});
