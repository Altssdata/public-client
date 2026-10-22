import { AltssPublicClient, resources } from './index.mjs';
const HELP = `Altss public reader 0.2.0 (Node.js 22+)
Usage:
  altss-public catalog data|task|commercial
  altss-public schema company|person|fund|evidence|task-result|...
  altss-public document pricing|methodology|coverage|developers|...
  altss-public openapi
  altss-public search "organization name" --limit 2 --cursor TOKEN --sandbox
  altss-public profile public-slug --sandbox
  altss-public resources
Options: --etag '"saved-tag"' --timeout 10000
Outputs one JSON response envelope; 304 means reuse your stored data.
Public descriptions, documents and bounded profile reads. --sandbox uses fictional profile fixtures.
No login, app.altss.com access, paid records or writes.
https://altss.com/developers
`;
export async function runCli(args, { stdout = text => process.stdout.write(text), stderr = text => process.stderr.write(text), createClient = options => new AltssPublicClient(options) } = {}) {
  if (!args.length || (args.length === 1 && ['--help','-h'].includes(args[0]))) { stdout(HELP); return 0; }
  if (args.length === 1 && args[0] === 'resources') { stdout(JSON.stringify(resources, null, 2)+'\n'); return 0; }
  let index = args[0] === 'openapi' ? 1 : 2;
  const resource = index === 1 ? 'openapi' : `${args[0]}:${args[1]}`;
  const profileRead = ['search','profile'].includes(args[0]);
  const options = {}, request = {}, seen = new Set();
  try {
    if (!profileRead && !Object.hasOwn(resources, resource)) throw new Error('Unknown resource; run altss-public resources');
    if (profileRead && !args[1]) throw new Error('A public name or slug is required');
    while (index < args.length) {
      const flag = args[index++];
      if (flag === '--sandbox' && profileRead && !seen.has(flag)) { seen.add(flag); options.sandbox = true; continue; }
      const value = args[index++];
      const allowed = ['--timeout', ...(profileRead ? args[0] === 'search' ? ['--limit','--cursor'] : [] : ['--etag'])];
      if (!allowed.includes(flag) || !value || seen.has(flag)) throw new Error('Invalid or repeated option; run altss-public --help');
      seen.add(flag);
      if (flag === '--etag') request.etag = value;
      else if (flag === '--cursor') request.cursor = value;
      else { if (!/^\d+$/.test(value)) throw new Error('Use an integer'); if (flag === '--limit') request.limit = Number(value); else options.timeoutMs = Number(value); }
    }
    const client = createClient(options);
    const result = args[0] === 'search' ? await client.searchProfiles(args[1], request) : args[0] === 'profile' ? await client.getProfile(args[1], request) : await client.read(resource, request);
    stdout(JSON.stringify(result, null, 2)+'\n');
    return 0;
  } catch (error) {
    // Never echo response bodies, user-supplied values or native network errors.
    const detail = error?.name === 'AltssHttpError' ? `HTTP ${error.status}` : error?.name === 'TimeoutError' ? 'request timed out' : error?.name === 'AbortError' ? 'request cancelled' : 'request or arguments failed validation';
    stderr(`Altss public reader: ${detail}. Check the resource, options and network; run --help.\n`);
    return 1;
  }
}
