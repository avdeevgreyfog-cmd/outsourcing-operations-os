import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as evaluator from '../lib/core/access.mjs';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const organization='00000000-0000-4000-8000-000000000001';
const workerId='88000000-0000-4000-8000-000000000001';
const user='10000000-0000-4000-8000-000000000001';

function compile(file,deps={}){
  const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('exports','require',compiled)(exports,name=>deps[name]??require(name));return exports;
}

function actor({demo=false}={}){
  return {organizationId:organization,userId:user,demo,teamIds:[],orgUnitIds:[],regionIds:[],access:{capabilities:['worker.read'],denies:[],scopes:{'worker.read':[{type:'all_org',ids:[]}]}}};
}

function loadService({scopeRows=[{organizationId:organization,objectId:'86000000-0000-4000-8000-000000000001',ownerUserId:user,regionId:null,assigneeUserIds:[user]}],relationRows=[{relationType:'gph',relationFrom:'02.10.2026',relationTo:null}]}={}){
  const queries=[];
  const sql=async(strings,...values)=>{
    const text=strings.reduce((out,part,index)=>out+part+(index<values.length?`$${index+1}`:''),'');
    queries.push({text,values});
    if(text.includes('FROM worker_profiles w'))return scopeRows;
    if(text.includes('FROM employment_relations'))return relationRows;
    return [];
  };
  const demoData=compile(path.join(root,'lib/demo/data.ts'));
  const deps={
    '@/lib/access/server':{requireCapability(currentActor,capability){if(!evaluator.hasCapability(currentActor.access,capability))throw new Error(`Missing capability: ${capability}`);}},
    '@/lib/core/access.mjs':evaluator,
    '@/lib/db/client':{withTenant:async(org,userId,callback)=>{assert.equal(org,organization);assert.equal(userId,user);return callback(sql);}},
    '@/lib/demo/data':demoData,
    '@/lib/demo/organization':{companyProfile:{},organizationUnits:[]},
  };
  const service=compile(path.join(root,'lib/operations/service.ts'),deps);
  return {getWorkerOffboardingContext:service.getWorkerOffboardingContext,queries};
}

test('offboarding reads only the employment relation active on the current date',async()=>{
  const harness=loadService();
  const context=await harness.getWorkerOffboardingContext(actor(),workerId);
  assert.equal(context.relationType,'gph');
  assert.equal(context.relationFrom,'02.10.2026');
  const relationQuery=harness.queries.find(query=>query.text.includes('FROM employment_relations'));
  assert.ok(relationQuery);
  assert.match(relationQuery.text,/effective_from<=current_date/);
  assert.match(relationQuery.text,/effective_to IS NULL OR effective_to>=current_date/);
  assert.match(relationQuery.text,/organization_id=\$2::uuid/);
  assert.deepEqual(relationQuery.values,[workerId,organization]);
  assert.equal(harness.queries.filter(query=>query.text.includes('FROM employment_relations')).length,1);
});

test('demo offboarding context reflects a worker’s existing relation and creates no inferred employment data',async()=>{
  const demoData=compile(path.join(root,'lib/demo/data.ts'));
  const demoWorker=demoData.workers.find(row=>row.employment);
  assert.ok(demoWorker,'fixture should include a demo worker with an existing employment type');
  const harness=loadService();
  const context=await harness.getWorkerOffboardingContext(actor({demo:true}),demoWorker.id);
  assert.equal(context.relationType,demoWorker.employment);
  assert.equal(context.relationFrom,demoWorker.startDate??null);
  assert.deepEqual(context.outstandingAssets,[]);
  assert.deepEqual(context.housing,[]);
  assert.deepEqual(context.exits,[]);
  assert.deepEqual(harness.queries,[]);
});
