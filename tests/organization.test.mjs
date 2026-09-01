import test from "node:test";
import assert from "node:assert/strict";
import { buildOrganizationTree, findStructureIssues, inheritedAccessSources, positionOccupancy } from "../lib/core/organization.mjs";

test("organization tree keeps hierarchy and deterministic order", () => {
  const tree = buildOrganizationTree([
    { id: "team", parentId: "operations", name: "Команда", sortOrder: 20 },
    { id: "operations", parentId: null, name: "Операции", sortOrder: 20 },
    { id: "management", parentId: null, name: "Руководство", sortOrder: 10 },
    { id: "objects", parentId: "operations", name: "Объекты", sortOrder: 10 },
  ]);

  assert.deepEqual(tree.map((unit) => unit.id), ["management", "operations"]);
  assert.deepEqual(tree[1].children.map((unit) => unit.id), ["objects", "team"]);
});

test("position and process role grants are additive", () => {
  const access = inheritedAccessSources({
    position: [{ capability: "organization.read", effect: "allow", scopeType: "org_unit", scopeIds: ["ops"], source: "position" }],
    roles: [{ capability: "operations.object.read", effect: "allow", scopeType: "region", scopeIds: ["moscow"], source: "process_role" }],
  });

  assert.deepEqual(access.map((item) => item.capability).sort(), ["operations.object.read", "organization.read"]);
  assert.equal(access.find((item) => item.capability === "organization.read").allow[0].source, "position");
});

test("individual override replaces inherited access for one employee", () => {
  const access = inheritedAccessSources({
    position: [{ capability: "finance.billing.read", effect: "allow", scopeType: "all_org", source: "position" }],
    overrides: [{ capability: "finance.billing.read", effect: "deny" }],
  });

  assert.deepEqual(access.find((item) => item.capability === "finance.billing.read"), {
    capability: "finance.billing.read",
    allow: [],
    denied: true,
  });
});

test("staff position capacity is independent from employee identity", () => {
  const occupancy=positionOccupancy({id:"position",capacity:3},[
    {staffPositionId:"position",status:"active",fte:1,effectiveFrom:"2026-01-01",effectiveTo:null},
    {staffPositionId:"position",status:"active",fte:.5,effectiveFrom:"2026-01-01",effectiveTo:null},
    {staffPositionId:"position",status:"planned",fte:1,effectiveFrom:"2027-01-01",effectiveTo:null},
  ],"2026-09-01");
  assert.deepEqual(occupancy,{occupied:1.5,open:1.5});
});

test("structure diagnostics expose unresolved routing gaps", () => {
  const issues=findStructureIssues({
    units:[{id:"ops",name:"Операции",kind:"department",active:true,managerMembershipId:null}],
    staffPositions:[{id:"seat",name:"Менеджер объекта",capacity:2,status:"open",level:1,reportsToPositionId:null}],
    assignments:[],
  });
  assert.deepEqual(issues.map(item=>item.id),["unit-manager-ops","position-open-seat","position-manager-seat"]);
});
