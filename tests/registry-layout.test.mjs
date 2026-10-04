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
const requests = load('../lib/commercial/request-registry.ts', id => {
  assert.equal(id, '@/lib/ui/registry-layout');
  return layout;
});
const columns = [{ id: 'person', label: 'Имя', width: 250, required: true }, { id: 'object', label: 'Объект', width: 180 }, { id: 'finance', label: 'Расчёт', width: 120 }];
const fallback = { columns: ['person', 'object'], pinned: ['person'], widths: {} };

test('saved column order survives while duplicate, hidden pin and unauthorized fields are removed', () => {
  const result = layout.normalizeRegistryLayout({ columns: ['object', 'object', 'secret'], pinned: ['object', 'finance', 'secret'], widths: { object: 302, secret: 150 } }, columns, fallback);
  assert.deepEqual(result, { columns: ['person', 'object'], pinned: ['object'], widths: { object: 302 } });
  const restricted = layout.normalizeRegistryLayout({ columns: ['person', 'finance'], pinned: ['finance'] }, columns.slice(0, 2), fallback);
  assert.deepEqual(restricted.columns, ['person']);
  assert.deepEqual(restricted.pinned, []);
});

test('column widths are finite and bounded and pinned offsets match rendered order', () => {
  const result = layout.normalizeRegistryLayout({ columns: ['object', 'finance', 'person'], pinned: ['person', 'object'], widths: { person: 500, object: 90, finance: NaN } }, columns, fallback);
  assert.deepEqual(result.widths, { person: 480, object: 110 });
  assert.deepEqual(layout.orderedRegistryColumns(columns, result).map(c => c.id), ['object', 'person', 'finance']);
  assert.equal(layout.registryPinnedOffset('person', columns, result), 110);
  assert.equal(layout.registryPinnedOffset('object', columns, result, 40), 40);
});

test('old request views acquire valid pinning without losing order, filters or grouping', () => {
  const result = requests.normalizeRequestSettings({ columns: ['stage', 'identity', 'source'], stage: 'proposal_sent', group: 'owner', sort: 'start', direction: 'asc' });
  assert.deepEqual(result.columns, ['stage', 'identity', 'source']);
  assert.deepEqual(result.pinned, ['identity']);
  assert.equal(result.stage, 'proposal_sent');
  assert.equal(result.group, 'owner');
  assert.equal(result.subgroup, 'none');
  assert.equal(result.sort, 'start');
});

test('two grouping levels remain distinct and independent fields stay available', () => {
  assert.equal(requests.normalizeRequestSettings({ group: 'stage', subgroup: 'stage' }).subgroup, 'none');
  assert.equal(requests.normalizeRequestSettings({ group: 'none', subgroup: 'owner' }).subgroup, 'none');
  const result = requests.normalizeRequestSettings({ group: 'owner', subgroup: 'client', columns: ['identity', 'client', 'location', 'roles'], pinned: [], sort: 'location' });
  assert.equal(result.subgroup, 'client');
  assert.deepEqual(result.columns, ['identity', 'client', 'location', 'roles']);
  assert.equal(result.sort, 'location');
  assert.deepEqual(result.pinned, []);
});
