import { PUBLIC_TOOL_NAMES, SERVER_VERSION } from '@trustlists/mcp/version';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '64px 24px' }}>
      <p style={{ margin: 0, color: '#9aa0a6', fontSize: 13, letterSpacing: '0.04em' }}>
        trustlists_
      </p>
      <h1 style={{ margin: '8px 0 16px', fontSize: 32, fontWeight: 600 }}>
        Hosted MCP server
      </h1>
      <p style={{ margin: '0 0 24px', lineHeight: 1.6, color: '#c8c8c8' }}>
        Streamable HTTP endpoint for public trust center search, lookup, and browse.
        Local installs still use <code>npx -y @trustlists/mcp</code>.
      </p>
      <dl style={{ margin: 0, display: 'grid', gap: 12, fontSize: 14 }}>
        <div>
          <dt style={{ color: '#9aa0a6' }}>Endpoint</dt>
          <dd style={{ margin: '4px 0 0' }}>
            <code>/mcp</code>
          </dd>
        </div>
        <div>
          <dt style={{ color: '#9aa0a6' }}>Health</dt>
          <dd style={{ margin: '4px 0 0' }}>
            <a href="/health" style={{ color: '#ececec' }}>/health</a>
          </dd>
        </div>
        <div>
          <dt style={{ color: '#9aa0a6' }}>Version</dt>
          <dd style={{ margin: '4px 0 0' }}>{SERVER_VERSION}</dd>
        </div>
        <div>
          <dt style={{ color: '#9aa0a6' }}>Remote tools</dt>
          <dd style={{ margin: '4px 0 0' }}>{PUBLIC_TOOL_NAMES.join(', ')}</dd>
        </div>
      </dl>
      <p style={{ margin: '32px 0 0', fontSize: 14 }}>
        <a href="https://trustlists.org/mcp/" style={{ color: '#ececec' }}>
          Setup and docs
        </a>
      </p>
    </main>
  );
}
