# Altss Python public client

Python 3.11+ readers for named anonymous resources on **https://altss.com**:
published profile summaries, catalogs, JSON Schemas and Markdown documents.
The runtime uses only the Python standard library. It has no account tokens,
cookies, telemetry, automatic retries or authenticated Product access.

## Install from PyPI

```sh
python -m pip install --only-binary=:all: --no-deps altss-public-client==0.1.0
```

Version 0.1.0 is [published on PyPI](https://pypi.org/project/altss-public-client/0.1.0/).
The wheel and source distribution match the reviewed
[Python GitHub release](https://github.com/Altssdata/public-client/releases/tag/python/v0.1.0).
Python, JavaScript and Go have separate release versions.

## Install from GitHub source

```sh
python -m pip install 'git+https://github.com/Altssdata/public-client.git@python/v0.1.0#subdirectory=python'
```

This alternative installs the matching tagged source. Choose one installation
method for your project.

## Use

```python
from altss_public import AltssPublicClient, AltssHttpError

client = AltssPublicClient(timeout=10)
catalog = client.get_catalog("data")
profile = client.get_profile("daimler-truck-ag")
page = client.search_profiles("Daimler Truck", limit=2)
print(profile.data)

sandbox = AltssPublicClient(sandbox=True)
fixture = sandbox.get_profile("example-capital-01")
```

`get_catalog(name)`, `get_schema(name)`, `get_document(name)` and `read(resource)`
accept the exact names in the exported, immutable `resources` mapping.
Their optional `etag` argument performs a conditional GET. A `304` returns
`data=None`; reuse the representation belonging to that ETag. There is no hidden cache.
`search_profiles(query, limit=1..5, cursor=None)` follows the public pagination
contract. `get_profile(slug)` reads one existing published profile. Sandbox mode
changes only profile methods and reads clearly labeled fictional fixtures.

Responses provide `status`, `data`, `url`, `etag`, `last_modified`, `cache_control`,
and optional `environment` and `rate_limit` metadata. JSON is a dictionary of
unknown fields: use the [current OpenAPI reference](https://altss.com/openapi.json).
Canonical profile citations come from the service response, not from guessed slugs.
Profile responses remain private/no-store. Rate-limit headers describe the serving
instance; they are not a global or per-user allowance.

The transport sends one HTTPS GET to the fixed Altss origin, rejects redirects
and limits response bodies to 4 MiB. TLS verification stays enabled. Environment
proxy credentials, netrc files and global cookie stores are not loaded.
Timeout is 10 seconds by default, configurable above zero through 60 seconds.
The same remaining time budget is applied before each socket operation and body
chunk. These are socket timeouts, not a hard process deadline: operating-system
DNS resolution and a slow header stream may outlast that budget.
The synchronous client does not provide asynchronous task execution or cancellation.

HTTP failures raise `AltssHttpError` with `status` and `retry_after`; response bodies
are not retained in the exception. Missing profiles are errors, never fabricated
records. Other transport, TLS, timeout, decoding and validation failures propagate.
There are no writes, account access, contact exports, bulk exports, payments or
subscription records. Documentation MCP is a separate service at docs.altss.com/mcp.

Run `python -m unittest discover -s tests -v` from this directory. Build artifacts
with `python -m build`, then validate with `python -m twine check dist/*` in an
isolated development environment. Tests use deterministic transports; live reads
and registry installation are separate release checks.

Support: contact@altss.com. [Source and issues](https://github.com/Altssdata/public-client).
Field definitions and access terms: [Altss developer reference](https://altss.com/developers).
The proprietary license and public-data boundaries match the existing clients.
