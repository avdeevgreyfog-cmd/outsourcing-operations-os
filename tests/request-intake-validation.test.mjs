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
const validation = load('lib/commercial/public-intake-validation.ts');
const intakeModule = load('lib/commercial/request-intake.ts');
const { publicIntakeContactError } = validation;
const contact = changes => ({ ...intakeModule.emptyRequestIntake().contact, name: 'Анна', phone: '', email: '', ...changes });

test('public intake accepts a phone or an email without requiring both', () => {
  assert.equal(publicIntakeContactError('Компания', contact({ phone: '+7 (999) 123-45-67' })), null);
  assert.equal(publicIntakeContactError('Компания', contact({ email: 'anna@example.ru' })), null);
  assert.equal(publicIntakeContactError('  Компания  ', contact({ phone: ' 1234567 ' })), null);
});

test('company and contact identify the caller, but internal empty drafts remain valid', () => {
  for (const company of ['', ' ', 'А', 'А'.repeat(241)]) assert.ok(publicIntakeContactError(company, contact({ phone: '1234567' })));
  for (const name of ['', ' ', 'А', 'А'.repeat(161)]) assert.ok(publicIntakeContactError('Компания', contact({ name, email: 'anna@example.ru' })));
  assert.equal(publicIntakeContactError('К'.repeat(240), contact({ name: 'А'.repeat(160), phone: '1234567' })), null);
  assert.doesNotThrow(() => intakeModule.normalizeRequestIntake({}));
  assert.equal(intakeModule.normalizeRequestIntake({}).contact.phone, '');
});

test('a usable callback is required; malformed optional contacts are also rejected', () => {
  assert.ok(publicIntakeContactError('Компания', contact({ phone: '  ', email: ' ' })));
  for (const phone of ['123456', '1'.repeat(16), 'позвоните мне', '+7 999 123 45 67 доб.1']) {
    assert.ok(publicIntakeContactError('Компания', contact({ phone, email: 'anna@example.ru' })));
  }
  assert.equal(publicIntakeContactError('Компания', contact({ phone: '1'.repeat(15) })), null);
  for (const email of ['anna', 'anna@', 'anna@host', 'anna @example.ru', 'a'.repeat(245) + '@example.ru']) {
    assert.ok(publicIntakeContactError('Компания', contact({ phone: '1234567', email })));
  }
});

function workflowFixture({ validLink = true, validRegion = true, validSpecialty = true, validOwner = true } = {}) {
  const link = { id: 'link', organizationId: 'org', createdByUserId: 'owner' };
  const writes = [];
  const tx = async (strings, ...values) => {
    const query = strings.join('?');
    if (query.startsWith('SELECT id,expires_at')) return validLink ? [{ id: link.id, expiresAt: null }] : [];
    if (query.startsWith('SELECT id FROM request_intake_links')) {
      assert.ok(query.includes("m.status='active'"), 'Link owner is rechecked inside the tenant transaction');
      return validLink ? [{ id: link.id }] : [];
    }
    if (query.startsWith('SELECT id FROM regions')) return validRegion ? [{ id: 'region' }] : [];
    if (query.startsWith('SELECT id FROM specialties')) return validSpecialty ? [{ id: 'specialty' }] : [];
    if (query.startsWith('SELECT id FROM organization_memberships')) return validOwner ? [{ id: 'membership' }] : [];
    if (query.startsWith('SELECT name FROM organizations')) return [{ name: 'Компания' }];
    if (query.startsWith('SELECT id,name FROM specialties') || query.startsWith('SELECT id,name FROM regions')) return [];
    if (query.startsWith('SELECT id FROM client_companies')) return [];
    if (query.startsWith('INSERT INTO requests')) { writes.push({ query, values }); return [{ id: 'request' }]; }
    if (query.startsWith('INSERT INTO request_roles') || query.startsWith('UPDATE request_intake_links')) { writes.push({ query, values }); return []; }
    throw new Error('Unexpected query: ' + query);
  };
  tx.json = value => value;
  // postgres TransactionSql intentionally exposes no nested begin method.
  const workflowServer = load('lib/commercial/request-workflow-server.ts', {
    '@/lib/commercial/edit-history':load('lib/commercial/edit-history.ts'),
    '@/lib/commercial/public-intake-validation': validation,
    '@/lib/access/server': { requireCapability() {} },
    '@/lib/core/access.mjs': { hasCapability() { return false; }, canReadRow() { return true; } },
    '@/lib/commercial/public-request-token-directory': { resolvePublicRequestToken: async (token, kind) => {
      assert.equal(token, 'token'); assert.equal(kind, 'request_intake_link');
      return { tenantId: link.organizationId, actorUserId: link.createdByUserId, linkId: link.id };
    }, registerPublicRequestToken: async () => {} },
    '@/lib/db/client': { withTenant: async (org, user, callback) => {
      assert.equal(org, link.organizationId); assert.equal(user, link.createdByUserId);
      return callback(tx);
    } },
    '@/lib/demo/data': {},
    '@/lib/commercial/edit-conflict':load('lib/commercial/edit-conflict.ts'),'@/lib/commercial/request-section':load('lib/commercial/request-section.ts',{'@/lib/commercial/request-intake':intakeModule}),'@/lib/commercial/request-intake-server':{getRequestIntake:async()=>intakeModule.emptyRequestIntake()},'@/lib/commercial/request-workflow-server':{getRequestWorkflowMeta:async()=>({observers:[]})},
    '@/lib/commercial/request-intake': intakeModule,
    '@/lib/commercial/request-workflow': {},
  });
  const payload = {
    companyName: 'Компания', title: 'Тестовая заявка', location: 'Москва', regionId: 'region', startDate: null,
    durationText: null, source: 'public_form', schedule: {}, intake: intakeModule.emptyRequestIntake(), lunchPaid: false,
    vatMode: null, comments: null,
    roles: [{ specialtyId: 'specialty', specialtyName: 'Грузчик', count: 2, schedule: {}, requirements: {}, targetClientRate: null }],
  };
  return { workflowServer, payload, writes };
}

test('public submission reuses the tenant transaction and assigns the link owner', async () => {
  const { workflowServer, payload, writes } = workflowFixture();
  const result = await workflowServer.submitBlankRequest('token', payload);
  assert.equal(result.id, 'request');
  assert.equal(result.reference, 'request');
  assert.equal(writes.length, 3);
  assert.equal(writes[0].values.at(-1), 'owner');
  assert.equal(writes[0].values.at(-2), 'owner');
});

test('public form resolves its tenant before checking owner membership and touching the link', async () => {
  const active = workflowFixture();
  assert.equal((await active.workflowServer.getBlankRequestContext('token')).organizationName, 'Компания');
  assert.equal(active.writes.length, 1);
  const inactive = workflowFixture({ validOwner: false });
  assert.equal(await inactive.workflowServer.getBlankRequestContext('token'), null);
  assert.equal(inactive.writes.length, 0);
});

test('revocation and invalid tenant references stop public submission before writes', async () => {
  for (const options of [{ validLink: false }, { validRegion: false }, { validSpecialty: false }]) {
    const { workflowServer, payload, writes } = workflowFixture(options);
    await assert.rejects(() => workflowServer.submitBlankRequest('token', payload), validation.PublicIntakeInputError);
    assert.equal(writes.length, 0);
  }
});

function internalRouteFixture({ deny = false } = {}) {
  const ownerId = '10000000-0000-4000-8000-000000000001';
  const requestId = '73000000-0000-4000-8000-000000000001';
  const actor = { userId: ownerId, organizationId: 'org', roleCode: 'manager', teamIds: [], access: {}, demo: false };
  const writes = [];
  const tx = async (strings, ...values) => {
    const query = strings.join('?');
    if(query.startsWith('SELECT updated_at'))return [{updatedAt:'v1',status:'draft',archivedAt:null}];
    if(query.startsWith('INSERT INTO activity_events')){writes.push({query,values});return [];}
    if (query.includes('FROM organization_memberships')) return [{ id: ownerId }];
    if (query.startsWith('INSERT INTO requests')) { writes.push({ query, values }); return [{ id: requestId }]; }
    if (query.startsWith('UPDATE requests') || query.startsWith('DELETE FROM request_observers')) { writes.push({ query, values }); return []; }
    if (query.startsWith('SELECT DISTINCT request_role_id')) return [];
    throw new Error('Unexpected query: ' + query);
  };
  tx.json = value => value;
  class AccessDeniedError extends Error {}
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    '@/lib/auth/server': { getCurrentActor: async () => actor },
    '@/lib/access/server': { AccessDeniedError, requireCapability() { if (deny) throw new AccessDeniedError(); } },
    '@/lib/core/access.mjs': { hasCapability() { return false; }, canReadRow() { return true; } },
    '@/lib/db/client': { withTenant: async (org, user, callback) => {
      assert.equal(org, actor.organizationId); assert.equal(user, ownerId);
      return callback(tx);
    } },
    '@/lib/commercial/edit-conflict':load('lib/commercial/edit-conflict.ts'),'@/lib/commercial/request-section':load('lib/commercial/request-section.ts',{'@/lib/commercial/request-intake':intakeModule}),'@/lib/commercial/request-intake-server':{getRequestIntake:async()=>intakeModule.emptyRequestIntake()},'@/lib/commercial/request-workflow-server':{getRequestWorkflowMeta:async()=>({observers:[]})},
    '@/lib/commercial/request-intake': intakeModule,
    '@/lib/commercial/service': { getCommercialRequest: async () => ({
      id: requestId, ownerUserId: ownerId, status: 'draft', archivedAt: null, roles: [],
    }) },
  };
  const payload = {
    title: 'Неполный черновик', source: 'manual', location: '', regionId: null, clientId: null,
    startDate: null, durationText: null, schedule: {}, intake: {}, lunchPaid: false, vatMode: null,
    comments: null, ownerUserId: ownerId, observerUserIds: [], roles: [],
  };
  const request = () => new Request('https://test.local/api/requests/v2', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  return { dependencies, writes, request, requestId };
}

test('internal create and edit allow incomplete drafts using one tenant transaction', async () => {
  const fixture = internalRouteFixture();
  const create = load('app/api/requests/v2/route.ts', fixture.dependencies);
  const created = await create.POST(fixture.request());
  assert.equal(created.status, 201);
  assert.equal(created.body.id, fixture.requestId);
  const edit = load('app/api/requests/[id]/v2/route.ts', fixture.dependencies);
  const updated = await edit.PATCH(fixture.request(), { params: Promise.resolve({ id: fixture.requestId }) });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.id, fixture.requestId);
  assert.equal(fixture.writes.filter(row => row.query.startsWith('INSERT INTO requests')).length, 1);
  assert.equal(fixture.writes.filter(row => row.query.startsWith('UPDATE requests')).length, 1);
});

test('internal draft creation and editing reject missing permissions before database writes', async () => {
  const fixture = internalRouteFixture({ deny: true });
  const create = load('app/api/requests/v2/route.ts', fixture.dependencies);
  const edit = load('app/api/requests/[id]/v2/route.ts', fixture.dependencies);
  assert.equal((await create.POST(fixture.request())).status, 403);
  assert.equal((await edit.PATCH(fixture.request(), { params: Promise.resolve({ id: fixture.requestId }) })).status, 403);
  assert.equal(fixture.writes.length, 0);
});

test('archive and restore reuse the tenant transaction and retain archive permissions', async () => {
  for (const action of ['archive', 'restore']) for (const deny of [false, true]) {
    const fixture = internalRouteFixture({ deny });
    const route = load('app/api/requests/[id]/route.ts', fixture.dependencies);
    const response = await route.PATCH(new Request('https://test.local/api/requests/id', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    }), { params: Promise.resolve({ id: fixture.requestId }) });
    assert.equal(response.status, deny ? 403 : 200);
    assert.equal(fixture.writes.length, deny ? 0 : 1);
    if (!deny) assert.equal(response.body.archived, action === 'archive');
  }
});

test('pipeline settings use one transaction and remain restricted to administrators', async () => {
  const stages = load('lib/commercial/request-workflow.ts').defaultRequestStages;
  for (const allowed of [true, false]) {
    const writes = [];
    const actor = { organizationId: 'org', userId: 'owner', roleCode: allowed ? 'director' : 'manager', access: {}, demo: false };
    const tx = async strings => { writes.push(strings.join('?')); return []; };
    const route = load('app/api/requests/stages/route.ts', {
      'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
      '@/lib/auth/server': { getCurrentActor: async () => actor },
      '@/lib/core/access.mjs': { hasCapability: () => false },
      '@/lib/commercial/request-workflow': { requestStageCodes: stages.map(stage => stage.code) },
      '@/lib/db/client': { withTenant: async (org, user, callback) => {
        assert.equal(org, actor.organizationId); assert.equal(user, actor.userId);
        return callback(tx);
      } },
    });
    const response = await route.PATCH(new Request('https://test.local/api/requests/stages', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stages }),
    }));
    assert.equal(response.status, allowed ? 200 : 403);
    assert.equal(writes.length, allowed ? stages.length : 0);
  }
});
