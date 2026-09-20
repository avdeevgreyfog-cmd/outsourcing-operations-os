import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function moduleUrl(path,replacements={}) {
  let source=ts.transpileModule(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
  }).outputText;
  for(const [from,to] of Object.entries(replacements)) source=source.replaceAll("'"+from+"'","'"+to+"'").replaceAll('"'+from+'"','"'+to+'"');
  return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
}

const demoUrl=moduleUrl('lib/demo/data.ts');
const demo=await import(demoUrl);
const modelUrl=moduleUrl('lib/recruiting/model.ts');
const timeline=await import(moduleUrl('lib/recruiting/demo-timeline.ts',{'./model':modelUrl}));

test('recruiting demo has 50 candidates and covers the complete funnel',()=>{
  assert.equal(demo.candidates.length,50);
  const counts=Object.fromEntries([...new Set(demo.candidates.map(x=>x.stage))].map(stage=>[stage,demo.candidates.filter(x=>x.stage===stage).length]));
  for(const stage of ['new','interview','documents','preparation','first_shift','retention_7','retention_30','rejected','no_show','reserve']){
    assert.ok((counts[stage]??0)>0,stage+' must be represented');
  }
  assert.equal(demo.candidates.some(x=>['contact','manager_review','approved','ready','started'].includes(x.stage)),false);
  assert.ok(new Set(demo.candidates.map(x=>x.source)).size>=5);
  assert.ok(demo.candidates.filter(x=>x.stage==='rejected').every(x=>x.rejectionReasonCode&&x.rejectionReason));
  assert.ok(demo.candidates.filter(x=>x.stage==='no_show').every(x=>x.rejectionReasonCode&&x.rejectionReason));
});

test('demo candidate details provide stage-specific history communications and documents',()=>{
  const documents=demo.candidates.find(x=>x.stage==='documents');
  const prep=demo.candidates.find(x=>x.stage==='preparation');
  const retained=demo.candidates.find(x=>x.stage==='retention_30');
  assert.ok(documents&&prep&&retained);

  const documentDetails=timeline.demoApplicationDetails(documents,demo.candidates.indexOf(documents));
  assert.equal(documentDetails.stage,'documents');
  assert.equal(documentDetails.documentSummary.required,5);
  assert.ok(documentDetails.documentSummary.received>=2);
  assert.ok(documentDetails.documentSummary.missing.length>0);
  assert.ok(documentDetails.recentCommunications.length>=2);

  const prepDetails=timeline.demoApplicationDetails(prep,demo.candidates.indexOf(prep));
  assert.equal(prepDetails.documentSummary.received,5);
  assert.ok(['ticket_required','ticket_bought','company','self'].includes(prepDetails.workflow.travelState));
  assert.ok(prepDetails.plannedStartDate);

  const retainedDetails=timeline.demoApplicationDetails(retained,demo.candidates.indexOf(retained));
  assert.ok(retainedDetails.actualStartAt?.startsWith('2026-08-'));
  assert.equal(retainedDetails.stageEvents.at(-1).toStage,'retention_30');
});
