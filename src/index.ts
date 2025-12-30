import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools/index.js';

async function main() {
  const server = new McpServer({
    name: 'postgres-mcp-server',
    version: '1.0.0',
  });

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Postgres MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
