import test from "node:test";
import assert from "node:assert/strict";
import { filterNavigation, navigationManifest } from "../lib/core/navigation.mjs";

const access = (capabilities) => ({ capabilities, denies: [], scopes: {}, allOrg: false });
const visibleItems = (sections) => sections.flatMap((section) => section.groups.flatMap((group) => group.items));

test("planned modules define the target IA without appearing in the sidebar", () => {
  const result = filterNavigation(navigationManifest, access(["*"]));
  assert.equal(visibleItems(result).some((item) => item.status === "planned"), false);
  assert.equal(visibleItems(result).some((item) => item.href === "/contracts"), false);
});

test("navigation keeps each available route in one canonical place", () => {
  const result = filterNavigation(navigationManifest, access(["*"]));
  const hrefs = visibleItems(result).map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(hrefs.filter((href) => href === "/tasks").length, 1);
});

test("capabilities remove unavailable items and their empty groups", () => {
  const result = filterNavigation(navigationManifest, access(["task.read"]));
  assert.deepEqual(result.map((section) => section.id), ["home"]);
  assert.deepEqual(result[0].groups.map((group) => group.id), ["my-work"]);
  assert.deepEqual(result[0].groups[0].items.map((item) => item.href), ["/tasks"]);
});
