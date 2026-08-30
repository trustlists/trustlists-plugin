import { PUBLIC_TOOL_NAMES, SERVER_NAME, SERVER_VERSION } from '@trustlists/mcp/version';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    ok: true,
    name: SERVER_NAME,
    version: SERVER_VERSION,
    transport: 'streamable-http',
    endpoint: '/mcp',
    tools: PUBLIC_TOOL_NAMES,
  });
}
