import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => name in dependencies ? dependencies[name] : nativeRequire(name));
  return exports;
}
const intake = load('lib/commercial/request-intake.ts');

function fixture({ denied = false, rowDenied = false, status = 'pending', linked = false, specialtyChange = false, registerFails = false } = {}) {
  const actor = { userId: 'owner', organizationId: 'org', demo: false, access: {} };
  const requestId = 'request';
  const writes = [];
  const registrations = [];
  let transactions = 0;
  const role = { id: 'role', specialtyId: specialtyChange ? 'other-specialty' : 'specialty', count: 4, schedule: {}, requirements: {}, targetClientRate: null };
  const payload = {
    title: 'Уточнённая заявка', location: 'Москва', regionId: null, startDate: null, durationText: null,
    schedule: {}, intake: intake.emptyRequestIntake(), lunchPaid: false, vatMode: null, housingRule: null, travelRule: null,
    shuttleRule: null, ppeRule: null, medicalRule: null, citizenshipRule: null, toolsRule: null, comments: null, roles: [role],
  };
  const tx = async (strings, ...values) => {
    const query = strings.join('?').trim();
    if (query.startsWith('SELECT status,payload')) return [{ status, payload }];
    if (query.startsWith('SELECT id FROM specialties')) return [{ id: role.specialtyId }];
    if (query.startsWith('SELECT DISTINCT request_role_id')) return linked ? [{ id: 'role' }] : [];
    if (query.startsWith('INSERT INTO request_public_links')) {
      writes.push({ query, values }); return [{ id: 'link', expiresAt: null }];
    }
    if (query.startsWith('UPDATE ')) { writes.push({ query, values }); return []; }
    throw new Error('Unexpected query: ' + query);
  };
  tx.json = value => value;
  class AccessDeniedError extends Error {}
  const service = load('lib/commercial/request-intake-server.ts', {
    '@/lib/access/server': { AccessDeniedError, requireCapability() { if (denied) throw new AccessDeniedError(); } },
    '@/lib/core/access.mjs': { canReadRow() { return !rowDenied; } },
    '@/lib/db/client': { withTenant: async (org, user, callback) => {
      assert.equal(org, actor.organizationId); assert.equal(user, actor.userId);
      transactions++;
      const previousLength = writes.length;
      try { return await callback(tx); } catch (error) { writes.splice(previousLength); throw error; }
    } },
    '@/lib/commercial/public-request-token-directory': {
      registerPublicRequestToken: async (...args) => {
        assert.equal(args[0], tx);
        if (registerFails) throw new Error('Token registration failed');
        registrations.push(args);
      },
      resolvePublicRequestToken: async () => null,
    },
    '@/lib/commercial/service': { getCommercialRequest: async () => ({
      id: requestId, status: 'draft', archivedAt: null, roles: [{ id: 'role', specialtyId: 'specialty' }],
    }) },
    '@/lib/commercial/request-intake': intake,
  });
  return { service, actor, requestId, writes, registrations, AccessDeniedError, transactions: () => transactions };
}

test('clarification link creation revokes old links and registers the token in one transaction', async () => {
  const f = fixture();
  const result = await f.service.createRequestPublicLink(f.actor, f.requestId, null);
  assert.equal(f.transactions(), 1);
  assert.equal(f.writes.length, 2);
  assert.ok(f.writes[0].query.startsWith('UPDATE request_public_links SET revoked_at'));
  assert.equal(result.id, 'link');
  assert.equal(f.registrations.length, 1);
  const [, token, org, user, kind, id] = f.registrations[0];
  assert.equal(result.path, '/request-form/' + token);
  assert.equal(org, 'org'); assert.equal(user, 'owner');
  assert.equal(kind, 'request_public_link'); assert.equal(id, 'link');
});

test('token registration failure rolls back clarification link changes', async () => {
  const f = fixture({ registerFails: true });
  await assert.rejects(() => f.service.createRequestPublicLink(f.actor, f.requestId, 7), /Token registration failed/);
  assert.equal(f.writes.length, 0);
});

test('accepting a clarification updates the request and existing role without nested begin', async () => {
  const f = fixture();
  const result = await f.service.reviewPublicSubmission(f.actor, f.requestId, 'submission', 'accept', 'Проверено');
  assert.deepEqual(result, { status: 'accepted' });
  assert.equal(f.transactions(), 1);
  assert.equal(f.writes.length, 3);
  assert.ok(f.writes[0].query.startsWith('UPDATE requests'));
  assert.ok(f.writes[1].query.startsWith('UPDATE request_roles'));
  assert.ok(f.writes[2].query.includes("status='accepted'"));
  assert.equal(f.writes[1].values.includes(4), true);
});

test('rejecting a clarification preserves request fields and positions', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.reviewPublicSubmission(f.actor, f.requestId, 'submission', 'reject', 'Нужны уточнения'), { status: 'rejected' });
  assert.equal(f.writes.length, 1);
  assert.ok(f.writes[0].query.startsWith('UPDATE request_public_submissions'));
  assert.ok(f.writes[0].query.includes("status='rejected'"));
});

test('already reviewed clarifications cannot be processed twice', async () => {
  const f = fixture({ status: 'accepted' });
  await assert.rejects(() => f.service.reviewPublicSubmission(f.actor, f.requestId, 'submission', 'accept', null), /уже обработана/);
  assert.equal(f.writes.length, 0);
});

test('calculation-linked positions preserve their specialty and roll back failed acceptance', async () => {
  const f = fixture({ linked: true, specialtyChange: true });
  await assert.rejects(() => f.service.reviewPublicSubmission(f.actor, f.requestId, 'submission', 'accept', null), /Нельзя менять специальность/);
  assert.equal(f.writes.length, 0);
});

test('capability and row scope denials stop both link creation and review before writes', async () => {
  for (const options of [{ denied: true }, { rowDenied: true }]) {
    const f = fixture(options);
    await assert.rejects(() => f.service.createRequestPublicLink(f.actor, f.requestId, null), f.AccessDeniedError);
    await assert.rejects(() => f.service.reviewPublicSubmission(f.actor, f.requestId, 'submission', 'accept', null), f.AccessDeniedError);
    assert.equal(f.transactions(), 0);
    assert.equal(f.writes.length, 0);
  }
});
