import test from "node:test";
import assert from "node:assert/strict";
import { filterNavigation, flattenNavigation, navigationManifest } from "../lib/core/navigation.mjs";
import { findFoundationModule, foundationModules } from "../lib/core/modules.mjs";

const access = (capabilities) => ({ capabilities, denies: [], scopes: {}, allOrg: false });
const visibleItems = (sections) => sections.flatMap((section) => section.groups.flatMap((group) => group.items));

test("foundation modules stay hidden in the regular capability-filtered sidebar", () => {
  const result = filterNavigation(navigationManifest, access(["*"]));
  assert.equal(visibleItems(result).some((item) => item.status === "foundation"), false);
  assert.equal(visibleItems(result).some((item) => item.href === "/contracts"), false);
});

test("internal mode exposes the complete target architecture", () => {
  const result = filterNavigation(navigationManifest, access([]), { showFoundations: true });
  const items = visibleItems(result);
  assert.equal(items.some((item) => item.href === "/contracts"), true);
  assert.equal(items.filter((item) => item.status === "foundation").length, Object.keys(foundationModules).length);
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
  assert.equal(findFoundationModule(["contracts"])?.id, "contract-registry");
});
