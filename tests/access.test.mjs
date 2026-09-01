import test from "node:test";
import assert from "node:assert/strict";
import { canReadField, canReadRow } from "../lib/core/access.mjs";

const actor = { userId: "u1", membershipId: "member1", organizationId: "org1", teamIds: ["team1"], orgUnitIds: ["ops"] };

test("organization isolation wins", () => {
  const access = { capabilities: ["operations.object.read"], allOrg: true, scopes: {} };
  assert.equal(canReadRow(access, "operations.object.read", { organizationId: "org2" }, actor), false);
});

test("region scope filters rows", () => {
  const access = { capabilities: ["operations.object.read"], scopes: { "operations.object.read": [{ type: "region", ids: ["moscow"] }] } };
  assert.equal(canReadRow(access, "operations.object.read", { organizationId: "org1", regionId: "moscow" }, actor), true);
  assert.equal(canReadRow(access, "operations.object.read", { organizationId: "org1", regionId: "kaluga" }, actor), false);
});

test("field permission can be denied independently", () => {
  const access = { capabilities: ["worker.read", "worker.compensation.read"], denies: ["worker.compensation.read"] };
  assert.equal(canReadField(access, "worker.compensation.read"), false);
});


test("all_org is capability-specific and never widens another grant", () => {
  const access = {
    capabilities: ["calculation.read", "operations.object.read"],
    allOrg: true,
    scopes: {
      "calculation.read": [{ type: "all_org", ids: [] }],
      "operations.object.read": [{ type: "region", ids: ["moscow"] }],
    },
  };
  assert.equal(canReadRow(access, "operations.object.read", { organizationId: "org1", regionId: "kaluga" }, actor), false);
  assert.equal(canReadRow(access, "calculation.read", { organizationId: "org1" }, actor), true);
});

test("self scope only exposes the current employee", () => {
  const access = { capabilities: ["organization.read"], scopes: { "organization.read": [{ type: "self", ids: [] }] } };
  assert.equal(canReadRow(access, "organization.read", { organizationId: "org1", membershipId: "member1" }, actor), true);
  assert.equal(canReadRow(access, "organization.read", { organizationId: "org1", membershipId: "member2" }, actor), false);
});

test("org unit scope can inherit the actor assignment", () => {
  const access = { capabilities: ["organization.read"], scopes: { "organization.read": [{ type: "org_unit", ids: [] }] } };
  assert.equal(canReadRow(access, "organization.read", { organizationId: "org1", orgUnitId: "ops" }, actor), true);
  assert.equal(canReadRow(access, "organization.read", { organizationId: "org1", orgUnitId: "finance" }, actor), false);
});
