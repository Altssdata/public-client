# Altss public client

A JavaScript client, TypeScript declarations and command-line reader for Altss's public catalogs, JSON Schemas, Markdown documents and bounded published profile summaries. Requires Node.js 22 or newer. There are no runtime dependencies, installation scripts, account tokens or telemetry.

These are public descriptions and documents. The client does not provide subscription records, execute research tasks, submit listings or handle payments. Documentation MCP is a separate service at https://docs.altss.com/mcp.

## Install from the public GitHub release

```sh
npm install github:Altssdata/public-client#v0.2.0
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

## Public profile reads and sandbox

```js
const page = await client.searchProfiles('Daimler Truck', { limit: 2 });
if (page.status === 200) {
  console.log(page.data.results);
  if (page.data.pagination.nextCursor) {
    const next = await client.searchProfiles('Daimler Truck', { limit: 2, cursor: page.data.pagination.nextCursor });
    console.log(next.data);
  }
}
const profile = await client.getProfile('daimler-truck-ag');

const sandbox = new AltssPublicClient({ sandbox: true });
const sample = await sandbox.searchProfiles('Example', { limit: 2 });
const fixture = await sandbox.getProfile('example-capital-01');
```

Profile methods use bounded GETs only, with no account or app.altss.com access. Pages contain 1–5 results within at most ten matches. Restart a query when its cursor becomes stale. Missing public slugs return HTTP 404; temporary upstream failures are errors, not empty successful records. Profile reads are private/no-store. A returned environment and rateLimit object describes the serving instance, not a global or per-user allowance. Sandbox mode affects profile methods only and uses clearly labeled fictional fixtures; it never queries production records.

```sh
npx --no-install altss-public search "Daimler Truck" --limit 2
npx --no-install altss-public profile daimler-truck-ag
npx --no-install altss-public search Example --sandbox --limit 2
```

## Python SDK

The [Python client](./python/README.md) reads the same named public resources and
bounded profile summaries using the Python standard library. It requires Python
3.11 or newer and has no runtime dependencies, credentials, writes or retries.
Version 0.1.0 is [published on PyPI](https://pypi.org/project/altss-public-client/0.1.0/).

```sh
python -m pip install --only-binary=:all: --no-deps altss-public-client==0.1.0
```

See its README for usage, the matching GitHub source installation and transport limits.
The Python, JavaScript and Go packages have separate release versions.

## Go SDK

The [Go module](./go/README.md) provides the same fixed-origin, anonymous GET boundaries with the Go standard library:

```sh
go get github.com/Altssdata/public-client/go@v0.1.0
```

Its source module is in `go/`; version tags use the `go/v0.1.0` form. A source tag does not by itself establish package-proxy availability. Refer to the release's installation verification for actual registry results.
