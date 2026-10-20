import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file){const compiled=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('exports',compiled)(exports);return exports;}
const tender=load('components/sales/DemoTenderPreview.tsx'),client=load('components/sales/DemoClientPreview.tsx');
function storage(fn){const previous={window:globalThis.window,sessionStorage:globalThis.sessionStorage};const rows=new Map();globalThis.window={dispatchEvent(){}};globalThis.sessionStorage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)};try{fn();}finally{Object.assign(globalThis,previous);}}
test('opening or quick editing a tender retains saved detailed roles, conditions and documents',()=>storage(()=>{
 const detail={id:'tender',title:'Закупка',roles:[{id:'role',count:23}],conditions:{schedule:'5/2'},sourceDocuments:[{id:'doc',name:'ТЗ.pdf'}]};
 assert.equal(tender.saveDemoTenderSnapshot('scope',detail),true);assert.equal(tender.saveDemoTenderSnapshot('scope',{id:detail.id,title:'Уточнённая закупка'}),true);
 const saved=tender.loadDemoTenderSnapshot('scope',detail.id);assert.equal(saved.title,'Уточнённая закупка');assert.deepEqual(saved.roles,detail.roles);assert.deepEqual(saved.conditions,detail.conditions);assert.deepEqual(saved.sourceDocuments,detail.sourceDocuments);
}));
test('a compact client snapshot retains contacts and stays isolated to its workspace',()=>storage(()=>{
 const row={id:'client',organizationId:'org',name:'Клиент',status:'active',contactRows:[{id:'contact',fullName:'Анна'}]};
 assert.equal(client.saveDemoClientSnapshot('scope',row,true),true);assert.equal(client.saveDemoClientSnapshot('scope',{id:row.id,organizationId:'org',name:'Новое название',status:'active'}),true);assert.deepEqual(client.loadDemoClientSnapshot('scope',row.id).contactRows,row.contactRows);assert.equal(client.loadDemoClientSnapshot('other',row.id),null);
}));
