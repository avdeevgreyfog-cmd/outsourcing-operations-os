import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('employee calendar prefers assigned manager shifts, keeps explicit days off and separates plan from fact',async()=>{
 const sql=async(strings)=>{const q=strings.join('?');
 if(q.includes('FROM worker_timesheet_links'))return [{worker:'w',object:'o',today:'2026-10-12',timezone:'Europe/Moscow',owner:'manager',horizon:3,workDays:5,restDays:2,anchor:'2026-10-01',defaultKind:'day'}];
 if(q.includes('FROM time_entries'))return [{date:'2026-10-13',kind:'day',code:'PLANNED',source:'schedule',hours:0},{date:'2026-10-14',kind:null,code:'DAY_OFF',source:'schedule',hours:0}];
 if(q.includes('FROM shift_assignments'))return [{date:'2026-10-13',kind:'night',start:'20:00',end:'08:00',endsNextDay:true},{date:'2026-10-15',kind:'day',reserve:true,start:'08:00',end:'20:00',endsNextDay:false}];
 return [];};
 const dependencies={'@/lib/operations/worker-timesheet-portal':{resolveToken:async()=>({tenantId:'org',actorUserId:'actor',linkId:'link'})},'@/lib/db/client':{withTenant:async(o,a,fn)=>fn(sql)},'@/lib/access/server':{},'@/lib/core/access.mjs':{},'@/lib/data/service':{}};
 const modules=new Map();
 function compile(file){
  file=path.resolve(file);if(modules.has(file))return modules.get(file);
  const exports={};modules.set(file,exports);
  new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>{
   if(n in dependencies)return dependencies[n];
   if(n.startsWith('@/')||n.startsWith('.')){
    const base=n.startsWith('@/')?path.resolve(n.slice(2)):path.resolve(path.dirname(file),n);
    const target=[base,base+'.ts',base+'.mjs',base+'/index.ts'].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
    if(!target)throw Error('Missing dependency '+n+' from '+file);
    return target.endsWith('.mjs')?require(target):compile(target);
   }
   return require(n);
  });return exports;
 }
 const exports=compile('lib/operations/employee-planning.ts');
 const data=await exports.employeePlanning('token');assert.equal(data.owner,'manager');const night=data.days.find(d=>d.date==='2026-10-13');assert.equal(night.kind,'night');assert.equal(night.source,'assigned');assert.equal(night.endsNextDay,true);assert.equal(data.days.find(d=>d.date==='2026-10-14').kind,'off');assert.equal('hours' in night,false);const reserve=data.days.find(d=>d.date==='2026-10-15');assert.equal(reserve.kind,null);assert.equal(reserve.reserveKind,'day');
});
