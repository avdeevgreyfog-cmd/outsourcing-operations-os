import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const exports={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/operations/planning-coverage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);
test('missing demand is unknown, explicit zero requires no exits, and excess is visible',()=>{
 assert.deepEqual(exports.planningCoverage(null,0),{label:'Потребность не задана',deficit:null,excess:null});
 assert.equal(exports.planningCoverage(0,0).label,'Выходы не требуются');assert.equal(exports.planningCoverage(0,2).label,'Сверх потребности: +2');
 assert.equal(exports.planningCoverage(5,7).excess,2);assert.equal(exports.planningCoverage(5,3).deficit,2);assert.equal(exports.planningCoverage(5,5).label,'План закрыт');assert.equal(exports.planningCoverage(5,5,true).label,'Факт закрыт');
});
