import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as readScope from '../lib/organization/read-scope.mjs';
import {hasCapability} from '../lib/core/access.mjs';

const require=createRequire(import.meta.url);
const employees=[
  {id:'self',userId:'me',organizationId:'org',orgUnitId:'unit',regionId:'region'},
  {id:'peer',userId:'other',organizationId:'org',orgUnitId:'unit',regionId:'region'},
  {id:'child',userId:'child-user',organizationId:'org',orgUnitId:'child-unit',regionId:'region'},
  {id:'outside',userId:'outside-user',organizationId:'org',orgUnitId:'other-unit',regionId:'other-region'},
];
const staffPositions=employees.map(row=>({id:`seat-${row.id}`,organizationId:row.organizationId,orgUnitId:row.orgUnitId,regionId:row.regionId}));
const positionAssignments=employees.map(row=>({id:`assignment-${row.id}`,organizationId:row.organizationId,membershipId:row.id,staffPositionId:`seat-${row.id}`}));
const organizationUnits=[{id:'unit',organizationId:'org',parentId:null},{id:'child-unit',organizationId:'org',parentId:'unit'},{id:'other-unit',organizationId:'org',parentId:null}];
function loadService(demo){
  const queries=[];
  const sql=async(parts)=>{
    const text=parts.join('?');queries.push(text);
    if(text.includes('SELECT m.id,u.id'))return employees;
    if(text.includes('SELECT sp.id,sp.organization_id'))return staffPositions;
    if(text.includes('SELECT pa.id,pa.organization_id'))return positionAssignments;
    if(text.includes('SELECT ou.id,ou.organization_id'))return organizationUnits;
    throw new Error('Unexpected service query');
  };
  const dependencies={
    '@/lib/access/server':{requireCapability(actor,key){if(!hasCapability(actor.access,key))throw new Error('Denied');}},
    '@/lib/db/client':{withTenant:async(_org,_user,fn)=>fn(sql)},
    '@/lib/demo/organization':{companyEmployees:employees,staffPositions,positionAssignments,organizationUnits},
    '@/lib/organization/read-scope.mjs':readScope,
  };
  const source=fs.readFileSync(new URL('../lib/organization/service.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const service={};new Function('exports','require',compiled)(service,name=>dependencies[name]??require(name));
  const actor=(scopes)=>({organizationId:'org',userId:'me',membershipId:'self',orgUnitIds:['unit'],regionIds:['region'],demo,access:{capabilities:['organization.read','finance.pnl.read'],denies:[],allOrg:true,scopes:{'organization.read':scopes,'finance.pnl.read':[{type:'all_org',ids:[]}]}}});
  return {service,actor,queries};
}
for(const demo of [false,true]){
  test(`organization service ${demo?'demo':'tenant SQL'} keeps self isolated despite unit/region/allOrg`,async()=>{
    const {service,actor}=loadService(demo);const user=actor([{type:'self',ids:[]}]);
    assert.deepEqual((await service.listCompanyEmployees(user)).map(row=>row.id),['self']);
    assert.deepEqual(await service.listStaffPositions(user),[]);
    assert.deepEqual(await service.listOrganizationUnits(user),[]);
    assert.deepEqual((await service.listPositionAssignments(user)).map(row=>row.id),['assignment-self']);
  });
  test(`organization service ${demo?'demo':'tenant SQL'} applies resolved subtree to employees, seats and assignments`,async()=>{
    const {service,actor}=loadService(demo);const user=actor([{type:'org_unit_subtree',ids:['unit','child-unit']}]);
    assert.deepEqual((await service.listCompanyEmployees(user)).map(row=>row.id),['self','peer','child']);
    assert.deepEqual((await service.listStaffPositions(user)).map(row=>row.id),['seat-self','seat-peer','seat-child']);
    assert.deepEqual((await service.listPositionAssignments(user)).map(row=>row.id),['assignment-self','assignment-peer','assignment-child']);
  });
}
