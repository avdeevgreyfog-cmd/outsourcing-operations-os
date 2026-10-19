import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
class AccessDeniedError extends Error{}
const org='00000000-0000-4000-8000-000000000001',user='10000000-0000-4000-8000-000000000001',candidate='30000000-0000-4000-8000-000000000001';
function route({existing=false,denied=false}={}){
 const queries=[];const sql=async(strings,...args)=>{const text=strings.join('?');queries.push({text,args});if(text.includes('SELECT DISTINCT c.id'))return existing?[{id:candidate,organizationId:org,ownerUserId:user,createdByUserId:user}]:[];if(text.includes('INSERT INTO candidates'))return [{id:candidate}];return []};sql.begin=callback=>callback(sql);sql.json=x=>x;
 const dependencies={'@/lib/auth/server':{getCurrentActor:async()=>({organizationId:org,userId:user,demo:false,access:{}})},'@/lib/access/server':{AccessDeniedError,requireCapability(){if(denied)throw new AccessDeniedError()}},'@/lib/core/access.mjs':{canReadRow:()=>true},'@/lib/db/client':{withTenant:async(o,u,callback)=>{assert.equal(o,org);assert.equal(u,user);return callback(sql)}}};
 const js=ts.transpileModule(fs.readFileSync(new URL('../app/api/candidates/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const output={};new Function('exports','require',js)(output,name=>dependencies[name]??require(name));return {queries,post:body=>output.POST(new Request('http://local/api/candidates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}))};
}
test('first contact saves only a truthful name without a need, phone or invented application',async()=>{const r=route(),response=await r.post({fullName:'Иванов Иван'});assert.equal(response.status,201);assert.equal((await response.json()).applicationId,null);assert.equal(r.queries.filter(x=>x.text.includes('INSERT INTO candidates(')).length,1);assert.equal(r.queries.some(x=>x.text.includes('INSERT INTO candidate_applications')),false);assert.ok(r.queries.find(x=>x.text.includes('INSERT INTO candidates(')).args.includes('candidate'));});
test('repeated name-only first contact reuses candidate and does not insert a duplicate',async()=>{const r=route({existing:true}),response=await r.post({fullName:'Иванов Иван'});assert.equal(response.status,200);assert.equal((await response.json()).candidateId,candidate);assert.equal(r.queries.some(x=>x.text.includes('INSERT INTO candidates(')),false);assert.ok(r.queries.some(x=>x.text.includes('pg_advisory_xact_lock')));});
test('candidate create remains capability gated before any query',async()=>{const r=route({denied:true}),response=await r.post({fullName:'Иванов Иван'});assert.equal(response.status,403);assert.equal(r.queries.length,0);});
test('empty name cannot save even when no need is required',async()=>{const r=route(),response=await r.post({fullName:''});assert.equal(response.status,400);assert.equal(r.queries.length,0);});

test('unavailable preferred object is rejected without a candidate or application insert',async()=>{const r=route(),response=await r.post({fullName:'Иванов Иван',preferredObjectId:'40000000-0000-4000-8000-000000000001'});assert.equal(response.status,403);assert.equal(r.queries.some(x=>x.text.includes('INSERT INTO candidates(')),false);});
test('unavailable specialty does not silently discard requested direction',async()=>{const r=route(),response=await r.post({fullName:'Иванов Иван',preferredSpecialtyId:'50000000-0000-4000-8000-000000000001'});assert.equal(response.status,400);assert.equal(r.queries.some(x=>x.text.includes('INSERT INTO candidates(')),false);});
