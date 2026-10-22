import test from 'node:test';
import assert from 'node:assert/strict';
import { AltssPublicClient, AltssHttpError, resources } from '../src/index.mjs';
import { runCli } from '../src/cli.mjs';
import { spawnSync } from 'node:child_process';

const jsonResponse = (value = { entities: [] }, headers = {}) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json; charset=utf-8', ETag: '"abc"', ...headers } });
test('reads the exact versioned public catalog without credentials or redirects', async () => {
  let called = 0;
  const client = new AltssPublicClient({ fetch: async (url, init) => {
    called++;
    assert.equal(url, 'https://altss.com/api/v1/data-catalog.json');
    assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
    assert.deepEqual(init.headers, { Accept: 'application/json' });
    assert.ok(init.signal instanceof AbortSignal);
    return jsonResponse({ entities: [{ id: 'company', label: 'Company' }] });
  } });
  const result = await client.getCatalog('data');
  assert.equal(result.status, 200); assert.equal(result.etag, '"abc"');
  assert.equal(result.data.entities[0].label, 'Company'); assert.equal(called, 1);
});
for (const resource of Object.keys(resources)) test(`allowed resource ${resource} stays on the public origin`, async () => {
  const markdown = resource.startsWith('document:');
  const client = new AltssPublicClient({ fetch: async (url, options) => {
    assert.equal(new URL(url).origin, 'https://altss.com');
    assert.equal(new URL(url).pathname, resources[resource]);
    assert.equal(options.headers.Accept, markdown ? 'text/markdown' : 'application/json');
    return markdown ? new Response('# Public\n', { headers: { 'Content-Type': 'text/markdown' } }) : jsonResponse();
  } });
  assert.equal((await client.read(resource)).status, 200);
});
for (const resource of ['https://other.example', '__proto__', 'constructor', 'document:../account', 'catalog:premium', '/api/private', '', null]) test(`rejects unknown resource ${resource} before a request`, async () => {
  const client = new AltssPublicClient({ fetch: () => { assert.fail('unexpected request'); } });
  await assert.rejects(client.read(resource), TypeError);
});
test('returns 304 without parsing and preserves the caller validator', async () => {
  const client = new AltssPublicClient({ fetch: async (_, init) => {
    assert.equal(init.headers['If-None-Match'], 'W/"abc"');
    return new Response(null, { status: 304, headers: { ETag: 'W/"abc"' } });
  } });
  assert.equal((await client.getSchema('company', { etag: 'W/"abc"' })).data, null);
});
for (const etag of ['a', '"abc"\r\nAuthorization: secret', '*', '""', '"'+'x'.repeat(201)+'"']) test('rejects malformed validator '+JSON.stringify(etag.slice(0,15)), async () => {
  const client = new AltssPublicClient({ fetch: () => assert.fail('unexpected request') });
  await assert.rejects(client.getCatalog('data', { etag }), /etag/);
});
test('reports HTTP failure and Retry-After without returning private error text or retrying', async () => {
  let calls = 0;
  const client = new AltssPublicClient({ fetch: async () => { calls++; return new Response('PRIVATE_SENTINEL', { status: 429, headers: { 'Retry-After': '60' } }); } });
  await assert.rejects(client.getCatalog('data'), error => error instanceof AltssHttpError && error.status === 429 && error.retryAfter === '60' && !String(error).includes('PRIVATE'));
  assert.equal(calls, 1);
});
for (const [body,type,message] of [['<html>auth</html>','text/html','content type'],['invalid','application/json','invalid JSON'],['null','application/json','must be an object'],['[]','application/json','must be an object']]) test('rejects invalid response '+body, async () => {
  const client = new AltssPublicClient({ fetch: async () => new Response(body, { headers: { 'Content-Type': type } }) });
  await assert.rejects(client.getCatalog('data'), new RegExp(message));
});
for (const advertised of [false,true]) test(`bounds response bytes with advertised length=${advertised}`, async () => {
  let cancelled = false;
  const client = new AltssPublicClient({ fetch: async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024*1024)); }, cancel() { cancelled = true; } }), { headers: { 'Content-Type':'application/json', ...(advertised ? { 'Content-Length': '999999999' } : {}) } }) });
  await assert.rejects(client.getCatalog('data'), /4 MiB/);
  assert.equal(cancelled, true);
});
test('caller cancellation reaches the transport', async () => {
  const controller = new AbortController(); controller.abort();
  const client = new AltssPublicClient({ fetch: async (_,init) => { init.signal.throwIfAborted(); assert.fail('expected abort'); } });
  await assert.rejects(client.getDocument('pricing', { signal: controller.signal }), { name: 'AbortError' });
});
test('a transport stall obeys the configured deadline', async () => {
  const client = new AltssPublicClient({ timeoutMs: 10, fetch: async (_,init) => new Promise((_,reject) => { const keepAlive = setTimeout(() => reject(Error('Deadline failed')),500); init.signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(init.signal.reason); }, { once:true }); }) });
  await assert.rejects(client.getCatalog('data'), { name: 'TimeoutError' });
});
for (const timeoutMs of [0,-1,1.5,60001,NaN,'1000']) test('validates timeout '+timeoutMs, () => assert.throws(() => new AltssPublicClient({ timeoutMs }), TypeError));
test('command help is executable without network or installation scripts', () => {
  const run = spawnSync(process.execPath, ['bin/altss-public.mjs','--help'], { encoding:'utf8' });
  assert.equal(run.status,0); assert.match(run.stdout,/Public descriptions/); assert.equal(run.stderr,'');
});
test('CLI uses the same read contract and returns a JSON envelope', async () => {
  let output = '';
  const code = await runCli(['catalog','data','--timeout','2000','--etag','"old"'], { stdout: text => output += text, createClient: options => { assert.deepEqual(options,{ timeoutMs:2000 }); return { read: async (resource, options) => { assert.equal(resource,'catalog:data'); assert.deepEqual(options,{ etag:'"old"' }); return {status:304,data:null}; } }; } });
  assert.equal(code,0); assert.deepEqual(JSON.parse(output),{status:304,data:null});
});
for (const args of [['catalog','premium'],['openapi','--timeout'],['openapi','--timeout','1e3'],['openapi','--timeout','2','--timeout','2'],['openapi','--secret','PRIVATE']]) test('CLI fails safely for '+args.join(' '), async () => {
  let errors = '', called = false;
  const code = await runCli(args, { stderr: text => errors += text, createClient: () => { called=true; assert.fail('unexpected request'); } });
  assert.equal(code,1); assert.equal(called,false); assert.equal(errors.includes('PRIVATE'),false);
});
