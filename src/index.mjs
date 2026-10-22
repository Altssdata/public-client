const ORIGIN = 'https://altss.com';
const MAX_BYTES = 4 * 1024 * 1024;
export const resources = Object.freeze({
  ...Object.fromEntries(['data', 'task', 'commercial'].map(name => [`catalog:${name}`, `/api/v1/${name}-catalog.json`])),
  openapi: '/api/v1/openapi.json',
  ...Object.fromEntries(['company', 'organization', 'family-office', 'institutional-investor', 'person', 'fund', 'transaction', 'relationship', 'commitment', 'event', 'evidence', 'task-result'].map(name => [`schema:${name}`, `/api/v1/schemas/${name}.json`])),
  ...Object.fromEntries(['developers', 'pricing', 'methodology', 'coverage', 'platform', 'ai', 'agents', 'auth'].map(name => [`document:${name}`, `/${name}.md`])),
});

export class AltssHttpError extends Error {
  constructor(status, retryAfter = null) {
    super(`Altss public resource returned HTTP ${status}`);
    this.name = 'AltssHttpError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Reads only named public resources. No account, token, arbitrary URL or write operation. */
export class AltssPublicClient {
  #fetch;
  #timeout;
  constructor({ timeoutMs = 10000, fetch: fetchImpl = globalThis.fetch } = {}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('timeoutMs must be an integer from 1 to 60000');
    if (typeof fetchImpl !== 'function') throw new TypeError('A Fetch-compatible function is required');
    this.#fetch = fetchImpl;
    this.#timeout = timeoutMs;
  }
  getCatalog(name, options) { return this.read(`catalog:${name}`, options); }
  getSchema(name, options) { return this.read(`schema:${name}`, options); }
  getDocument(name, options) { return this.read(`document:${name}`, options); }
  async read(resource, { etag, signal } = {}) {
    if (typeof resource !== 'string' || !Object.hasOwn(resources, resource)) throw new TypeError('Unknown Altss public resource');
    if (etag !== undefined && (typeof etag !== 'string' || !/^(?:W\/)?"[\x21\x23-\x7e]{1,200}"$/.test(etag))) throw new TypeError('etag must be an HTTP entity tag');
    const url = ORIGIN + resources[resource];
    const isMarkdown = resource.startsWith('document:');
    const headers = { Accept: isMarkdown ? 'text/markdown' : 'application/json', ...(etag ? { 'If-None-Match': etag } : {}) };
    const timeout = AbortSignal.timeout(this.#timeout);
    const response = await this.#fetch(url, { method: 'GET', headers, credentials: 'omit', redirect: 'error', signal: signal ? AbortSignal.any([timeout, signal]) : timeout });
    const metadata = { url, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'), cacheControl: response.headers.get('cache-control') };
    if (response.status === 304 && etag) return { ...metadata, status: 304, data: null };
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new AltssHttpError(response.status, response.headers.get('retry-after'));
    }
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (type !== (isMarkdown ? 'text/markdown' : 'application/json') && !(isMarkdown === false && type === 'application/schema+json')) {
      await response.body?.cancel();
      throw new Error('Altss public resource returned an unexpected content type');
    }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body?.cancel();
      throw new Error('Altss public resource exceeds the 4 MiB limit');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Altss public resource returned an empty body');
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error('Altss public resource exceeds the 4 MiB limit');
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    let data;
    try { data = isMarkdown ? text : JSON.parse(text); } catch { throw new Error('Altss public resource returned invalid JSON'); }
    if (!isMarkdown && (!data || typeof data !== 'object' || Array.isArray(data))) throw new Error('Altss public JSON resource must be an object');
    return { ...metadata, status: 200, data };
  }
}
