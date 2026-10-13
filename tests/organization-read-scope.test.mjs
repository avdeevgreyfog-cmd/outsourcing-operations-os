import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadCompanyEmployee,canReadOrganizationPosition,filterOrganizationUnits,filterOrganizationAssignments} from '../lib/organization/read-scope.mjs';

const base={organizationId:'org',userId:'user',membershipId:'self',orgUnitIds:['ops'],regionIds:['moscow'],teamIds:[]};
const actor=(scopes,denies=[])=>({...base,access:{capabilities:['organization.read','sales.client.read'],denies,allOrg:true,scopes:{'sales.client.read':[{type:'all_org',ids:[]}],'organization.read':scopes}}});
const self={id:'self',userId:'user',organizationId:'org',orgUnitId:'ops',regionId:'moscow'};
const peer={...self,id:'peer',userId:'peer'};
const child={...peer,id:'child',orgUnitId:'ops-child',regionId:'vladimir'};
const sibling={...peer,id:'sibling',orgUnitId:'sales',regionId:'kaluga'};
const employees=[self,peer,child,sibling];
const seat={id:'seat',organizationId:'org',orgUnitId:'ops',regionId:'moscow'};

test('self does not inherit membership unit or region read',()=>{
  const a=actor([{type:'self',ids:[]}]);assert.deepEqual(employees.filter(row=>canReadCompanyEmployee(a,row)),[self]);
  assert.equal(canReadOrganizationPosition(a,seat),false);
  assert.deepEqual(filterOrganizationUnits(a,[{id:'ops',organizationId:'org',regionId:'moscow'}]),[]);
});
test('an unrelated all_org grant cannot create missing organization scopes',()=>{
  const a=actor([]);assert.equal(canReadCompanyEmployee(a,self),false);assert.equal(canReadOrganizationPosition(a,seat),false);
});
test('explicit unit read with empty ids inherits only membership units',()=>{
  const a=actor([{type:'org_unit',ids:[]}]);assert.deepEqual(employees.filter(row=>canReadCompanyEmployee(a,row)),[self,peer]);
  assert.equal(canReadOrganizationPosition(a,seat),true);assert.equal(canReadCompanyEmployee(a,child),false);
});
test('explicit unit ids do not additionally grant the actor unit',()=>{
  const a=actor([{type:'org_unit',ids:['sales']}]);assert.deepEqual(employees.filter(row=>canReadCompanyEmployee(a,row)),[sibling]);
});
test('resolved subtree allows descendants and excludes sibling units',()=>{
  const a=actor([{type:'org_unit_subtree',ids:['ops','ops-child']}]);assert.deepEqual(employees.filter(row=>canReadCompanyEmployee(a,row)),[self,peer,child]);
});
test('region and self scopes remain additive without unrelated membership regions',()=>{
  const a=actor([{type:'region',ids:['kaluga']},{type:'self',ids:[]}]);assert.deepEqual(employees.filter(row=>canReadCompanyEmployee(a,row)),[self,sibling]);
});
test('tenant and explicit deny win even with organization-wide read',()=>{
  const a=actor([{type:'all_org',ids:[]}]);assert.equal(canReadCompanyEmployee(a,{...self,organizationId:'foreign'}),false);
  assert.equal(canReadCompanyEmployee(actor([{type:'all_org',ids:[]}],['organization.read']),self),false);
});
test('unit tree retains parent context without authorizing parent employees',()=>{
  const a=actor([{type:'org_unit_subtree',ids:['ops-child']}]);const units=[{id:'root',parentId:null,organizationId:'org'},{id:'ops',parentId:'root',organizationId:'org'},{id:'ops-child',parentId:'ops',organizationId:'org'},{id:'sales',parentId:'root',organizationId:'org'}];
  assert.deepEqual(filterOrganizationUnits(a,units).map(row=>row.id),['root','ops','ops-child']);assert.equal(canReadCompanyEmployee(a,peer),false);
});
test('assignment lists require permitted employee and position contexts',()=>{
  const a=actor([{type:'org_unit',ids:['ops']}]);const rows=[{id:'yes',organizationId:'org',membershipId:'peer',staffPositionId:'seat'},{id:'hidden-employee',organizationId:'org',membershipId:'sibling',staffPositionId:'seat'},{id:'hidden-seat',organizationId:'org',membershipId:'peer',staffPositionId:'outside'}];
  assert.deepEqual(filterOrganizationAssignments(a,rows,[peer],[seat]).map(row=>row.id),['yes']);
});
test('self can see own assignment without exposing peer assignments',()=>{
  const a=actor([{type:'self',ids:[]}]);const rows=[{id:'own',organizationId:'org',membershipId:'self',staffPositionId:'seat'},{id:'peer',organizationId:'org',membershipId:'peer',staffPositionId:'seat'}];
  assert.deepEqual(filterOrganizationAssignments(a,rows,[self],[]).map(row=>row.id),['own']);
});
