import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { registerHostedTools } from '@trustlists/mcp/server';
import { SERVER_NAME, SERVER_VERSION } from '@trustlists/mcp/version';
import { verifyBearerToken } from '../oauth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerHostedTools(server);
  },
  {
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
  },
  {
    basePath: '',
    maxDuration: 60,
    verboseLogs: false,
    disableSse: true,
  },
);

const authHandler = withMcpAuth(handler, verifyBearerToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/mcp',
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
