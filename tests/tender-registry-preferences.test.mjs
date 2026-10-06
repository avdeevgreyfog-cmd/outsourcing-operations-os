import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(path, require = () => ({})) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(require, exports);
  return exports;
}
const layout = load('../lib/ui/registry-layout.ts');
const registry = load('../lib/tenders/registry.ts', id => {
  assert.equal(id, '@/lib/ui/registry-layout');
  return layout;
});

test('old tender preferences acquire defaults and discard unavailable columns and widths', () => {
  const result = registry.normalizeTenderSettings({ columns: ['owner', 'owner', 'result', 'secret'], pinned: ['owner', 'secret'], widths: { owner: 90, result: 600, secret: 123 }, group: 'customer', sort: 'result' });
  assert.deepEqual(result.columns, ['identity', 'owner', 'result']);
  assert.deepEqual(result.pinned, ['owner']);
  assert.deepEqual(result.widths, { owner: 110, result: 480 });
  assert.equal(result.group, 'customer');
  assert.equal(result.subgroup, 'none');
  assert.equal(result.sort, 'result');
  assert.equal(result.deadline, 'all');
  assert.equal(registry.normalizeTenderSettings({ bucket: 'archive', deadline: 'overdue', sort: 'budget' }).bucket, 'active');
  assert.equal(registry.normalizeTenderSettings({ group: 'stage', subgroup: 'stage' }).subgroup, 'none');
  assert.equal(registry.normalizeTenderSettings({ group: 'none', subgroup: 'platform' }).subgroup, 'none');
});

test('preset changes clear previous filters while preserving the user layout and sorting', () => {
  const current = registry.normalizeTenderSettings({ columns: ['identity', 'decision'], pinned: [], widths: { decision: 220 }, bucket: 'completed', stage: 'completed', owner: 'owner-id', customer: 'client-id', platform: 'РТС', decision: 'no_bid', source: 'Импорт', deadline: 'today', group: 'owner', subgroup: 'decision', sort: 'deadline', direction: 'asc' });
  const urgent = registry.tenderPresetSettings('urgent', current);
  assert.equal(urgent.bucket, 'active');
  assert.equal(urgent.deadline, '3d');
  for (const filter of ['stage', 'owner', 'customer', 'platform', 'decision', 'source']) assert.equal(urgent[filter], '');
  for (const preference of ['columns', 'pinned', 'widths', 'group', 'subgroup', 'sort', 'direction']) assert.deepEqual(urgent[preference], current[preference]);
  assert.equal(registry.tenderPresetSettings('completed', urgent).bucket, 'completed');
  assert.equal(registry.tenderPresetSettings('unassigned', urgent).owner, 'unassigned');
  assert.equal(registry.tenderPresetSettings('active', urgent).deadline, 'all');
});

test('saved preferences tolerate malformed entries and persist no search or business rows', () => {
  for (const input of [null, false, 12, 'broken', [], { views: [null, false, {}, { id: 'broken', name: 5 }] }]) {
    const result = registry.normalizeTenderPreferences(input);
    assert.deepEqual(result.settings, registry.defaultTenderSettings);
    assert.deepEqual(result.views, []);
  }
  const result = registry.normalizeTenderPreferences({ selectedView: 'mine', query: 'customer query', rows: [{ initialPrice: 999 }], settings: { owner: 'owner-id', query: 'search', rows: [{}] }, views: [null, { id: 'active', name: 'Reserved' }, { id: 'mine', name: '  Мой вид  ', settings: { group: 'owner', subgroup: 'customer', columns: ['identity', 'source'] } }, { id: 'mine', name: 'Duplicate' }] });
  assert.equal(result.selectedView, 'mine');
  assert.equal(result.views.length, 1);
  assert.equal(result.views[0].name, 'Мой вид');
  assert.equal(result.views[0].settings.subgroup, 'customer');
  assert.equal(result.settings.owner, 'owner-id');
  assert.ok(!JSON.stringify(result).includes('query'));
  assert.ok(!JSON.stringify(result).includes('rows'));
  assert.equal(registry.normalizeTenderPreferences({ selectedView: 'removed' }).selectedView, 'custom');
  const many = registry.normalizeTenderPreferences({ views: Array.from({ length: 50 }, (_, i) => ({ id: `view-${i}`, name: `View ${i}`, settings: {} })) });
  assert.equal(many.views.length, 30);
});

test('customer identities keep same-name clients separate from each other and free-text customers', () => {
  const name = 'ООО «Клиент»';
  assert.equal(registry.tenderCustomerKey({ clientId: 'client-1', customer: name }), 'client-1');
  assert.equal(registry.tenderCustomerKey({ clientId: 'client-2', customer: name }), 'client-2');
  assert.equal(registry.tenderCustomerKey({ clientId: null, customer: name }), `customer:${name}`);
  assert.equal(registry.tenderCustomerKey({ clientId: null, customer: '  Имя  ' }), 'customer:  Имя  ');
});
