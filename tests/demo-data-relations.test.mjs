import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../lib/demo/data.ts",import.meta.url),"utf8");

// Parse only JSON array literals; never execute the TypeScript demo module.
function fixture(name){
  const marker=`export const ${name} = [`;
  const pos=source.indexOf(marker);
  assert.notEqual(pos,-1,`missing fixture ${name}`);
  const start=pos+marker.length-1;
  let depth=0,quoted=false,escaped=false;
  for(let i=start;i<source.length;i++){
    const char=source[i];
    if(quoted){
      if(escaped){escaped=false;continue;}
      if(char==="\\"){escaped=true;continue;}
      if(char==='"'){quoted=false;}
      continue;
    }
    if(char==='"'){quoted=true;continue;}
    if(char==="[")depth++;
    if(char==="]"&&--depth===0)return JSON.parse(source.slice(start,i+1));
  }
  throw new Error(`unterminated JSON fixture: ${name}`);
}

const clients=fixture("clients");
const objects=fixture("objects");
const needs=fixture("needs");
const candidates=fixture("candidates");
const workers=fixture("workers");

function uniqueIds(name,rows){
  const ids=rows.map(row=>row.id);
  assert.equal(new Set(ids).size,rows.length,`${name}: duplicate IDs`);
  for(const id of ids)assert.match(id,/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i,`${name}: invalid ID`);
}

test("agreed demo portfolio preserves original registry sizes",()=>{
  assert.equal(clients.length,5);
  assert.equal(objects.length,5);
  assert.equal(needs.length,21);
  assert.equal(candidates.length,50);
  assert.equal(workers.length,44);
  for(const [name,rows] of Object.entries({clients,objects,needs,candidates,workers}))uniqueIds(name,rows);
  assert.ok(new Set(candidates.map(row=>row.stage)).size>=8,"candidate funnel collapsed");
});

test("every object and linked record references an existing parent",()=>{
  const clientIds=new Set(clients.map(row=>row.id));
  const objectIds=new Set(objects.map(row=>row.id));
  for(const object of objects){
    assert.ok(clientIds.has(object.clientId),`orphan object ${object.id}`);
    assert.ok(object.ownerUserId,`object missing manager ${object.id}`);
  }
  for(const [name,rows] of Object.entries({needs,candidates,workers})){
    for(const row of rows){
      assert.ok(objectIds.has(row.objectId),`${name}: missing object for ${row.id}`);
      assert.ok(clientIds.has(row.clientId),`${name}: missing client for ${row.id}`);
      assert.equal(row.clientId,objects.find(object=>object.id===row.objectId)?.clientId,`${name}: client mismatch for ${row.id}`);
    }
  }
});

test("candidate recruiters and employee object managers are consistently assigned",()=>{
  const objectMap=new Map(objects.map(row=>[row.id,row]));
  for(const candidate of candidates){
    assert.ok(candidate.ownerUserId,`candidate missing owner ${candidate.id}`);
    assert.ok(candidate.assigneeUserIds?.includes(candidate.ownerUserId),`candidate owner not in assignees ${candidate.id}`);
  }
  for(const worker of workers){
    const object=objectMap.get(worker.objectId);
    assert.equal(worker.ownerUserId,object.ownerUserId,`employee owner differs from object manager: ${worker.id}`);
    assert.equal(worker.managerName,object.ownerName,`employee manager label differs from object: ${worker.id}`);
    assert.ok(worker.assigneeUserIds?.includes(worker.ownerUserId),`employee manager not in assignees: ${worker.id}`);
  }
});
