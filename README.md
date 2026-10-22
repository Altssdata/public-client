# Altss public client

A JavaScript client, TypeScript declarations and command-line reader for Altss's existing public catalogs, JSON Schemas and Markdown documents. Requires Node.js 22 or newer. There are no runtime dependencies, installation scripts, account tokens or telemetry.

These are public descriptions and documents. The client does not provide subscription records, execute research tasks, submit listings or handle payments. Documentation MCP is a separate service at https://docs.altss.com/mcp.

## Install from the public GitHub release

```sh
npm install github:Altssdata/public-client#v0.1.0
npx altss-public catalog data
npx altss-public schema company
npx altss-public document pricing
npx altss-public resources
```

This is a GitHub source installation. It does not require or imply an npm registry listing. Pin the tag or an audited full commit when installing. No global installation is required.

## JavaScript / TypeScript

```js
import { AltssPublicClient, AltssHttpError } from 'altss-public-client';

const client = new AltssPublicClient({ timeoutMs: 10000 });
try {
  const response = await client.getCatalog('data');
  if (response.status === 200) console.log(response.data);
} catch (error) {
  if (error instanceof AltssHttpError) {
    console.error(error.status, error.retryAfter);
  } else {
    throw error;
  }
}
```

`getCatalog('data' | 'task' | 'commercial')`, `getSchema(name)`, `getDocument(name)` and `read(resource)` return `{ status, data, url, etag, lastModified, cacheControl }`. Import `resources` or run `altss-public resources` for the exact allowed names. JSON data is typed as an object with unknown fields; consult the current [OpenAPI specification](https://altss.com/openapi.json) and schemas before using its fields.

## Conditional requests

```js
const first = await client.getDocument('pricing');
if (first.status === 200 && first.etag) {
  const next = await client.getDocument('pricing', { etag: first.etag });
  const content = next.status === 304 ? first.data : next.data;
  console.log(content);
}
```

A `304` returns `data: null`; reuse the representation that belongs to the ETag you supplied. The client does not maintain a hidden cache. Supply `{ signal }` to cancel a request. The default deadline is 10 seconds, configurable from 1 to 60,000 milliseconds. Responses are limited to 4 MiB of decoded bytes.

The transport performs one GET per read, omits credentials and rejects redirects. It only addresses the fixed `https://altss.com` origin and named public paths. There are no automatic retries. Handle HTTP errors and any `Retry-After` value in your application; do not treat the absence of rate-limit headers as unlimited service.

## Command line

Commands print one JSON envelope to stdout. Help and resource enumeration work offline. Exit status is `0` for a completed read, including `304`, or `1` for invalid arguments/network/HTTP errors. Errors go to stderr without response bodies. Use shell redirection only when you want to save output yourself.

```sh
npx altss-public catalog data --timeout 15000
npx altss-public document pricing --etag '"previous-etag"'
npx altss-public openapi
```

## Development and support

Run `npm test` or `npm run check`. Tests cover resource boundaries, credentials, redirects, response limits, HTTP errors, validators, cancellation, deadlines and CLI behavior. Test fixtures do not establish a live service response.

Field definitions and current access terms: [Altss developer reference](https://altss.com/developers). Support: contact@altss.com. Report implementation issues in [this repository](https://github.com/Altssdata/public-client/issues). Do not include credentials or private records in reports.
