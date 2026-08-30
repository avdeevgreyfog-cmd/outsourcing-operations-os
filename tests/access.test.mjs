import test from "node:test";
import assert from "node:assert/strict";
import { canReadField, canReadRow } from "../lib/core/access.mjs";

const actor = { userId: "u1", organizationId: "org1", teamIds: ["team1"] };

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
