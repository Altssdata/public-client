#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../src/server.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('Altss Public Profiles MCP 1.0.0\nUsage: altss-public-profiles-mcp [--sandbox]\nPublic GETs only; no credentials. --sandbox uses fictional fixtures.\n');
} else if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('1.0.0\n');
} else if (args.length > 1 || (args.length === 1 && args[0] !== '--sandbox')) {
  process.stderr.write('Use altss-public-profiles-mcp [--sandbox]. No URL, credentials or other arguments are accepted.\n');
  process.exitCode = 1;
} else {
  const server = createServer({ sandbox: args[0] === '--sandbox' });
  const transport = new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 65536 });
  const close = () => { void server.close().finally(() => { process.exitCode = 0; }); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  process.stdin.once('end', close);
  server.server.onerror = () => { process.stderr.write('Altss MCP protocol error.\n'); };
  try { await server.connect(transport); }
  catch { process.stderr.write('Altss MCP could not start.\n'); process.exitCode = 1; }
}
