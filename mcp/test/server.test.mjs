import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.mjs';

const hit = { slug: 'example-capital-01', name: 'Example Capital', url: 'https://altss.com/profile/example-capital-01', type: 'Fixture', location: 'Fictional' };
const search = { query: 'Example', results: [hit] };
const read = { profile: { ...hit, description: 'Untrusted public description.', pageUpdatedAt: '2026-01-01' } };
const json = data => Response.json(data);
const call = (client, name = 'search_public_profiles', args = { query: 'Example' }, options) => client.callTool({ name, arguments: args }, undefined, options);
const errorCode = result => JSON.parse(result.content[0].text).error;
async function session(t, fetchImpl, sandbox = false) {
  const server = createServer({ fetch: fetchImpl, sandbox });
  const client = new Client({ name: 'offline-release-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); });
  return client;
}
test('initialization advertises exactly two bounded read-only tools without network access', async t => {
  const client = await session(t, () => { throw new Error('Unexpected fetch'); });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ['search_public_profiles', 'read_public_profile']);
  for (const tool of tools) { assert.equal(tool.annotations.readOnlyHint, true); assert.equal(tool.annotations.destructiveHint, false); assert.equal(tool.inputSchema.additionalProperties, false); }
  assert.equal(tools[0].inputSchema.properties.limit.maximum, 5);
  assert.deepEqual(Object.keys(client.getServerCapabilities()).sort(), ['tools']);
  assert.match(client.getInstructions(), /untrusted source data/);
});
test('public search uses one fixed-origin anonymous GET, strips extra data and derives citations', async t => {
  const requests = [];
  const client = await session(t, (url, options) => { requests.push({ url, options }); return json({ ...search, privateRecords: ['secret'], results: [{ ...hit, contact: 'secret' }] }); });
  const result = await call(client);
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent.results, [hit]);
  assert.deepEqual(result.structuredContent.citations, [{ title: hit.name, url: hit.url }]);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://altss.com/api/v1/public/profiles?query=Example&limit=5');
  assert.equal(requests[0].options.method, 'GET'); assert.equal(requests[0].options.credentials, 'omit'); assert.equal(requests[0].options.redirect, 'error');
  assert.deepEqual(requests[0].options.headers, { Accept: 'application/json' });
});
test('profile read narrows output and permits canonical public aliases', async t => {
  const client = await session(t, () => json({ ...read, profile: { ...read.profile, contacts: ['secret'], warehouseId: 99 }, unknown: 'secret' }));
  const result = await call(client, 'read_public_profile', { slug: 'old-public-alias' });
  assert.deepEqual(result.structuredContent.profile, read.profile);
  assert.equal(result.structuredContent.environment, 'production');
  assert.match(result.structuredContent.dateMeaning, /not independent field verification/);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
test('sandbox is a separate fixed fictional API path and labeled in results', async t => {
  const urls = [];
  const fixture = { ...hit, url: `https://example.com/organizations/${hit.slug}` };
  const client = await session(t, url => { urls.push(url); return json(url.includes('?') ? { ...search, results: [fixture] } : { profile: fixture }); }, true);
  const found = await call(client); const profile = await call(client, 'read_public_profile', { slug: hit.slug });
  assert.equal(found.structuredContent.environment, 'sandbox'); assert.equal(profile.structuredContent.environment, 'sandbox');
  assert.ok(urls.every(url => url.startsWith('https://altss.com/api/v1/sandbox/public/profiles')));
});
test('production cannot return a fictional sandbox citation', async t => {
  const client = await session(t, () => json({ profile: { ...hit, url: `https://example.com/organizations/${hit.slug}` } }));
  assert.equal(errorCode(await call(client, 'read_public_profile', { slug: hit.slug })), 'temporarily_unavailable');
});
for (const args of [{ query: 'x' }, { query: ' '.repeat(5) }, { query: '??' }, { query: 'x'.repeat(121) }, { query: 'Example', limit: 0 }, { query: 'Example', limit: 6 }, { query: 'Example', limit: 1.5 }, { query: 'Example', url: 'https://app.altss.com' }, { query: 'Example', token: 'test-only' }]) {
  test(`invalid search arguments never fetch: ${JSON.stringify(args)}`, async t => {
    let count = 0; const client = await session(t, () => { count++; throw new Error('Unexpected fetch'); });
    assert.equal((await call(client, 'search_public_profiles', args)).isError, true); assert.equal(count, 0);
  });
}
for (const args of [{ slug: '../admin' }, { slug: 'https://app.altss.com' }, { slug: 'UPPER' }, { slug: 'a'.repeat(201) }, { slug: hit.slug, credentials: 'test-only' }]) {
  test(`invalid profile arguments never fetch: ${JSON.stringify(args)}`, async t => {
    let count = 0; const client = await session(t, () => { count++; throw new Error('Unexpected fetch'); });
    assert.equal((await call(client, 'read_public_profile', args)).isError, true); assert.equal(count, 0);
  });
}
for (const [status, expected] of [[404, 'not_found'], [429, 'rate_limited'], [503, 'temporarily_unavailable'], [302, 'temporarily_unavailable']]) {
  test(`HTTP ${status} is an honest error without response text or automatic retry`, async t => {
    let count = 0; const client = await session(t, () => { count++; return new Response('secret-provider-body', { status }); });
    const result = await call(client, 'read_public_profile', { slug: hit.slug });
    assert.equal(result.isError, true); assert.equal(errorCode(result), expected); assert.equal(JSON.stringify(result).includes('secret'), false); assert.equal(count, 1);
  });
}
for (const data of [{ ...search, results: [{ ...hit, url: 'https://app.altss.com/private' }] }, { query: 'Wrong query', results: [] }, { ...search, results: Array(6).fill(hit) }, { ...search, results: [{ ...hit, name: 123 }] }]) {
  test('malformed or mismatched upstream search fails closed', async t => {
    const client = await session(t, () => json(data)); const result = await call(client);
    assert.equal(errorCode(result), 'temporarily_unavailable'); assert.equal(result.structuredContent, undefined);
  });
}
test('untrusted exception text is not returned', async t => {
  const client = await session(t, () => { throw new Error('secret credentials in provider exception'); });
  const result = await call(client); assert.equal(errorCode(result), 'temporarily_unavailable'); assert.equal(JSON.stringify(result).includes('secret'), false);
});
test('caller cancellation reaches the pending HTTP read', async t => {
  let signal, start; const started = new Promise(resolve => { start = resolve; });
  const client = await session(t, (_url, options) => { signal = options.signal; start(); return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); });
  const controller = new AbortController(); const pending = call(client, 'search_public_profiles', { query: 'Example' }, { signal: controller.signal });
  await started; controller.abort(); await assert.rejects(pending); await new Promise(resolve => setImmediate(resolve)); assert.equal(signal.aborted, true);
});
test('third concurrent call is rejected locally; slots recover after completion', async t => {
  let started = 0, release; const gate = new Promise(resolve => { release = resolve; });
  const client = await session(t, async () => { started++; await gate; return json(search); });
  const a = call(client), b = call(client); while (started < 2) await new Promise(resolve => setImmediate(resolve));
  assert.equal(errorCode(await call(client)), 'local_limit'); assert.equal(started, 2);
  release(); await Promise.all([a, b]); assert.equal((await call(client)).isError, undefined);
});
test('per-process call budget bounds repeated valid reads', async t => {
  let count = 0; const client = await session(t, () => { count++; return json(search); });
  for (let i = 0; i < 30; i++) assert.equal((await call(client)).isError, undefined);
  assert.equal(errorCode(await call(client)), 'local_limit'); assert.equal(count, 30);
});
test('unknown tools cannot fetch', async t => {
  let count = 0; const client = await session(t, () => { count++; return json(search); });
  assert.equal((await call(client, 'write_private_record', {})).isError, true); assert.equal(count, 0);
});
test('CLI rejects URL/token options and has offline help/version', () => {
  const bin = fileURLToPath(new URL('../bin/server.mjs', import.meta.url));
  for (const args of [['--url', 'https://app.altss.com'], ['--token=test'], ['--sandbox', '--sandbox']]) {
    const result = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /No URL, credentials/);
  }
  assert.equal(spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8', timeout: 10000 }).stdout, '1.0.0\n');
  assert.match(spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8', timeout: 10000 }).stdout, /fictional fixtures/);
});
