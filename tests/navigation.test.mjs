import test from "node:test";
import assert from "node:assert/strict";
import { filterNavigation, flattenNavigation, navigationManifest } from "../lib/core/navigation.mjs";
import { foundationModules } from "../lib/core/modules.mjs";

const access = (capabilities) => ({ capabilities, denies: [], scopes: {}, allOrg: false });
const visibleItems = (sections) => sections.flatMap((section) => section.groups.flatMap((group) => group.items));

test("foundation modules stay hidden in the regular capability-filtered sidebar", () => {
  const result = filterNavigation(navigationManifest, access(["*"]));
  const items = visibleItems(result);
  assert.equal(items.some((item) => item.status === "foundation"), false);
  assert.equal(items.some((item) => item.href === "/contracts"), true, "contracts are now an active capability-protected module");
  assert.equal(items.find((item) => item.href === "/contracts")?.status, undefined);
});

test("internal mode exposes foundation architecture without bypassing active capabilities", () => {
  const result = filterNavigation(navigationManifest, access([]), { showFoundations: true });
  const items = visibleItems(result);
  assert.equal(items.some((item) => item.href === "/contracts"), false, "active contracts still require contract.read");
  assert.ok(items.filter((item) => item.status === "foundation").length <= Object.keys(foundationModules).length);
  assert.equal(items.find((item)=>item.href==="/approvals")?.status, undefined, "activated approvals must no longer be marked as foundation");
});

test("navigation keeps each available route in one canonical place", () => {
  const result = filterNavigation(navigationManifest, access(["*"]));
  const hrefs = visibleItems(result).map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(hrefs.filter((href) => href === "/tasks").length, 1);
});

test("organization core routes are active and capability protected", () => {
  const permitted = visibleItems(filterNavigation(navigationManifest, access(["organization.read"])));
  const organizationRoutes = permitted.filter((item) => item.href.startsWith("/organization/"));
  assert.deepEqual(organizationRoutes.map((item) => item.href), [
    "/organization/structure",
    "/organization/staff",
    "/organization/positions",
    "/organization/departments",
  ]);
  assert.equal(organizationRoutes.every((item) => item.status !== "foundation"), true);
  assert.equal(visibleItems(filterNavigation(navigationManifest, access([]))).some((item) => item.href === "/organization/structure"), false);
});

test("capabilities remove unavailable items and their empty groups", () => {
  const result = filterNavigation(navigationManifest, access(["task.read"]));
  assert.deepEqual(result.map((section) => section.id), ["home"]);
  assert.deepEqual(result[0].groups.map((group) => group.id), ["my-work"]);
  assert.deepEqual(result[0].groups[0].items.map((item) => item.href), ["/tasks"]);
});

test("every foundation route has a module descriptor and canonical route", () => {
  const foundations = flattenNavigation().filter((item) => item.status === "foundation");
  assert.equal(new Set(foundations.map((item) => item.href)).size, foundations.length);
  for (const item of foundations) assert.ok(foundationModules[item.id], `missing descriptor for ${item.id}`);
  const contracts = flattenNavigation().find((item) => item.href === "/contracts");
  assert.equal(contracts?.id, "contract-registry");
  assert.equal(contracts?.status, undefined, "contracts must not fall back to the foundation catch-all route");
});


test("operations owns workers and operational analytics", () => {
  const items = flattenNavigation();
  const worker = items.find((item) => item.href === "/workers");
  const analytics = items.find((item) => item.href === "/operations/analytics");
  assert.equal(worker?.sectionId, "operations");
  assert.equal(worker?.groupId, "operations-workforce");
  assert.equal(analytics?.sectionId, "operations");
  assert.equal(items.some((item) => item.href === "/analytics?view=comparison"), false);
});

test("inventory and crews are active operation routes", () => {
  const items = flattenNavigation();
  assert.equal(items.find((item) => item.href === "/assets")?.status, undefined);
  assert.equal(items.find((item) => item.href === "/crews")?.status, undefined);
});


test("operations supply and staffing workspaces are active", () => {
  const items = flattenNavigation();
  for (const href of ["/staffing-plan","/supply/housing","/assets","/procurement","/crews","/operations/analytics"]) {
    const item=items.find((entry)=>entry.href===href);
    assert.ok(item, "missing "+href);
    assert.equal(item.status, undefined, href+" must not fall back to foundation");
    assert.equal(item.sectionId, "operations");
  }
});
