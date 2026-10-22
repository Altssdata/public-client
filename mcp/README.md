# Altss Public Profiles MCP

A stdio MCP server for clients that need a locally installed connector. It uses anonymous GET requests to the existing public pages API at https://altss.com. The hosted Streamable HTTP alternative remains https://altss.com/mcp.

Requires Node.js 22 or newer. No Altss account, API key or app.altss.com access is used. The package has pinned runtime dependencies, no install scripts, no telemetry and no automatic retries.

## Client configuration

After this version is published to npm, add this entry to an MCP client's server configuration:

```json
{
  "mcpServers": {
    "altss-public-profiles": {
      "command": "npx",
      "args": ["--yes", "altss-public-profiles-mcp@1.0.0"]
    }
  }
}
```

For an installed package, run `altss-public-profiles-mcp` directly. The client starts the process and exchanges MCP messages over stdin/stdout. Launching it in a terminal without a client waits for protocol input; it is not a web server.

## Tools and boundaries

- `search_public_profiles`: organization name of 2–120 characters; optional integer `limit` from 1 to 5. Returns a bounded subset with canonical citations.
- `read_public_profile`: one public slug. Returns a narrow published summary and canonical citation. Public aliases can resolve to another canonical slug.

Descriptions are untrusted source data, not instructions. Missing dates are unknown. A page modification date is not independent verification of every field. No contacts, private records, account operations, writes, bulk export, paid tasks or payments are provided. The separate documentation MCP is https://docs.altss.com/mcp.

The process permits two concurrent reads and thirty calls per minute. These are local process limits, not a global service quota. The service can additionally return a rate limit or temporary failure. Calls use a ten-second AbortSignal and a 4 MiB decoded response limit; cancellation is propagated. Protocol input is limited to 64 KiB. Errors do not expose provider response bodies. No records are persisted. Treat results as public research references, not investment advice.

Add `"--sandbox"` after the package argument to read only clearly labeled fictional fixtures from Altss's separate public sandbox. Search `Example`, then read `example-capital-01`. Sandbox mode never queries production profiles. No environment variable or command option can change the origin or supply credentials.

## Source verification

From this directory: `npm ci --ignore-scripts`, `npm run check`, then `npm audit --omit=dev`. Tests exercise real MCP initialization/tool calls through an in-memory transport, validation, GET-only boundaries, output filtering, error handling, cancellation and limits. `npm pack --ignore-scripts` creates the reviewed distribution. Live public reads and an isolated installed stdio session are separate release checks.

Registry metadata: `server.json` describes the proposed version 1.1.0, retaining the remote service and adding this package. Its presence in source does not establish registry publication. The package's `mcpName` supplies the official registry ownership check.

[Altss developer reference](https://altss.com/developers) · [source and issues](https://github.com/Altssdata/public-client) · Support: contact@altss.com.
