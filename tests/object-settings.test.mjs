import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as access from '../lib/core/access.mjs';
const require=createRequire(import.meta.url);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),user=id(2),objectId=id(3);
class AccessDeniedError extends Error {}
function compile(file,deps={}){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>deps[n]??require(n));return exports;}
const helper=compile('lib/operations/object-manager-options.ts');
function harness({assignScope=[{type:'all_org'}],foreign=false}={}){
 const writes=[],queries=[];
 const actor={organizationId:org,userId:user,demo:false,access:{capabilities:['operations.object.edit','operations.object.assign'],denies:[],scopes:{'operations.object.edit':[{type:'all_org'}],'operations.object.assign':assignScope}}};
 const current={organizationId:foreign?id(99):org,objectId,ownerUserId:id(4),status:'active',updatedAt:'v1',recruitingMode:'company_rules',assigneeUserIds:[],actualStartDate:'2026-01-01',actualEndDate:null};
 const tx=async(strings,...values)=>{const text=strings.join('?');queries.push({text,values});if(text.includes('FOR UPDATE OF o'))return [current];if(text.includes('SELECT DISTINCT m.user_id'))return [{id:id(5)}];if(text.includes('SELECT'))return [];writes.push({text,values});if(text.includes('UPDATE objects'))return [{updatedAt:'v2'}];return [];};tx.json=v=>v;
 const route=compile('app/api/objects/[id]/route.ts',{'@/lib/auth/server':{getCurrentActor:async()=>actor},'@/lib/access/server':{AccessDeniedError,requireCapability(a,c){if(!access.hasCapability(a.access,c))throw new AccessDeniedError(c);}},'@/lib/core/access.mjs':access,'@/lib/db/client':{withTenant:async(tenant,who,fn)=>{assert.equal(tenant,org);return fn(tx);}},'@/lib/operations/object-manager-options':helper,'next/server':{NextResponse:{json:(body,{status=200}={})=>new Response(JSON.stringify(body),{status})}}});
 return {writes,queries,run:body=>route.PATCH(new Request('http://localhost/api/objects',{method:'PATCH',body:JSON.stringify(body)}),{params:Promise.resolve({id:objectId})})};
}
test('ordinary address edit preserves assignments without assignment scope',async()=>{const h=harness({assignScope:[{type:'objects',ids:[id(99)]}]});const r=await h.run({expectedVersion:helper.objectEditVersion('v1'),address:'Новый адрес'});assert.equal(r.status,200);assert.ok(h.writes.length);assert.ok(h.writes.every(q=>!q.text.includes('object_assignments')));assert.equal((await r.json()).version,helper.objectEditVersion('v2'));});
test('assignment scope is checked independently from broad edit scope',async()=>{const h=harness({assignScope:[{type:'objects',ids:[id(99)]}]});assert.equal((await h.run({expectedVersion:helper.objectEditVersion('v1'),ownerUserId:id(5)})).status,403);assert.equal(h.writes.length,0);});
test('stale settings return conflict before any mutation',async()=>{const h=harness();assert.equal((await h.run({expectedVersion:helper.objectEditVersion('old'),address:'Адрес'})).status,409);assert.equal(h.writes.length,0);});
test('foreign organization cannot edit object',async()=>{const h=harness({foreign:true});assert.equal((await h.run({expectedVersion:helper.objectEditVersion('v1'),address:'Адрес'})).status,403);assert.equal(h.writes.length,0);});
test('missing version is rejected before querying',async()=>{const h=harness();assert.equal((await h.run({address:'Адрес'})).status,400);assert.equal(h.queries.length,0);});
test('settings event retains previous profile values alongside new values',async()=>{const h=harness();const r=await h.run({expectedVersion:helper.objectEditVersion('v1'),name:'Новое имя'});assert.equal(r.status,200);const event=h.writes.find(q=>q.text.includes('INSERT INTO activity_events'));const metadata=event.values.at(-1);assert.equal(metadata.name,'Новое имя');assert.equal(metadata.before.ownerUserId,id(4));assert.equal(metadata.before.status,'active');assert.equal(metadata.before.actualStartDate,'2026-01-01');});
