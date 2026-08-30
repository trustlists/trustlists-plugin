import { createMcpHandler } from 'mcp-handler';
import { registerPublicDirectoryTools } from '@trustlists/mcp/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerPublicDirectoryTools(server);
  },
  {
    serverInfo: {
      name: 'trustlists',
      version: '0.2.1',
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
