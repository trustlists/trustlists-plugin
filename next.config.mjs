/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@trustlists/mcp'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, DELETE, OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, Accept, MCP-Session-Id, MCP-Protocol-Version, Last-Event-ID',
          },
          { key: 'Access-Control-Expose-Headers', value: 'MCP-Session-Id, MCP-Protocol-Version' },
        ],
      },
    ];
  },
};

export default nextConfig;
