import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const id='70000000-0000-4000-8000-000000000001';
const owner='10000000-0000-4000-8000-000000000001';
class AccessDeniedError extends Error {}
function route({allowed=true}={}) {
 const queries=[];
 const tx=async(parts,...values)=>{const sql=parts.join('?');queries.push({sql,values});
  if(sql.includes('FROM client_companies'))return [{id,clientId:id,organizationId:id,ownerUserId:owner,createdByUserId:owner,teamId:null,regionId:null,name:'Клиент',legalName:null,inn:null,notes:null,status:'active'}];
  if(sql.includes('organization_memberships'))return [];
  return [];
 };
 const deps={
  '@/lib/auth/server':{getCurrentActor:async()=>({organizationId:id,userId:owner,roleCode:'director',demo:false,access:{}})},
  '@/lib/access/server':{AccessDeniedError,requireCapability(){}},
  '@/lib/core/access.mjs':{canReadRow:()=>allowed,hasCapability:()=>true},
  '@/lib/db/client':{withTenant:async(_org,_user,fn)=>fn(tx)},
 };
 const compiled=ts.transpileModule(fs.readFileSync(new URL('../app/api/clients/[id]/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('exports','require',compiled)(exports,name=>deps[name]??require(name));
 return {patch:exports.PATCH,queries};
}
function request(ownerUserId){return new Request('http://local/api/clients/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Изменённое название',status:'active',ownerUserId})});}
test('editing client metadata retains an unchanged inactive owner',async()=>{
 const {patch,queries}=route();const response=await patch(request(owner),{params:Promise.resolve({id})});
 assert.equal(response.status,200);assert.equal((await response.json()).id,id);
 assert.equal(queries.some(q=>q.sql.includes('organization_memberships')),false);
 const update=queries.find(q=>q.sql.includes('UPDATE client_companies'));assert.ok(update.values.includes(owner));
});
test('assigning a different inactive owner is rejected without updating the client',async()=>{
 const {patch,queries}=route();const prior=console.error;console.error=()=>{};
 try{const response=await patch(request('10000000-0000-4000-8000-000000000099'),{params:Promise.resolve({id})});assert.equal(response.status,500);assert.match((await response.json()).error,/Ответственный/);}finally{console.error=prior;}
 assert.equal(queries.some(q=>q.sql.includes('UPDATE client_companies')),false);
});
test('client row scope still prevents metadata editing',async()=>{
 const {patch,queries}=route({allowed:false});const response=await patch(request(owner),{params:Promise.resolve({id})});
 assert.equal(response.status,403);assert.equal(queries.some(q=>q.sql.includes('UPDATE client_companies')),false);
});
