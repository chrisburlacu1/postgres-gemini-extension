import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools/index.js';
import { pool } from './database.js';

async function main() {
  const server = new McpServer({
    name: 'postgres-mcp-server',
    version: '1.0.0',
  });

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Postgres MCP Server running on stdio');

  // Graceful shutdown
  const shutdown = async () => {
    console.error('Shutting down Postgres MCP Server...');
    await server.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
