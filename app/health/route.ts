import { HOSTED_TOOL_NAMES, SERVER_NAME, SERVER_VERSION } from '@trustlists/mcp/version';
import { OAUTH_ISSUER } from '../oauth';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    ok: true,
    name: SERVER_NAME,
    version: SERVER_VERSION,
    transport: 'streamable-http',
    endpoint: '/mcp',
    auth: { type: 'oauth', issuer: OAUTH_ISSUER },
    tools: HOSTED_TOOL_NAMES,
  });
}
