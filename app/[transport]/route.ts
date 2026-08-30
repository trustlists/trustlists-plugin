import { createMcpHandler } from 'mcp-handler';
import { registerPublicDirectoryTools } from '@trustlists/mcp/server';
import { SERVER_NAME, SERVER_VERSION } from '@trustlists/mcp/version';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerPublicDirectoryTools(server);
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

export { handler as GET, handler as POST, handler as DELETE };
