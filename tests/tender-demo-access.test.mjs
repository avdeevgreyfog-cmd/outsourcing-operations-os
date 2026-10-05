import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { canReadRow } from '../lib/core/access.mjs';

const source = fs.readFileSync(new URL('../lib/demo/access.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', code)(exports);

test('tender demo fixtures follow each role commercial read scope', () => {
  const director = exports.getDemoActor('director');
  const regional = exports.getDemoActor('regional');
  const row = { organizationId: director.organizationId, ownerUserId: director.userId };
  assert.equal(canReadRow(director.access, 'sales.tender.read', row, director), true);
  assert.equal(canReadRow(regional.access, 'sales.tender.read', row, regional), false);
  assert.equal(canReadRow(regional.access, 'sales.tender.read', { ...row, ownerUserId: regional.userId }, regional), true);
  assert.equal(canReadRow(director.access, 'sales.tender.read', { ...row, organizationId: 'other-org' }, director), false);
  const recruiter = exports.getDemoActor('recruiter');
  assert.equal(canReadRow(recruiter.access, 'sales.tender.read', row, recruiter), false);
});

test('demo access requests cannot mutate cached actors or another capability scope', () => {
  const first = exports.getDemoActor('director');
  first.access.scopes['sales.tender.read'][0].type = 'assigned_to_me';
  first.access.capabilities.length = 0;
  assert.equal(first.access.scopes['sales.request.read'][0].type, 'all_org');
  const second = exports.getDemoActor('director');
  assert.equal(second.access.scopes['sales.tender.read'][0].type, 'all_org');
  assert.ok(second.access.capabilities.includes('sales.tender.read'));
});
