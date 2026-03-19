import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { checkConnection } from '../database.js';

export function registerConnectionTools(server: McpServer) {
  server.registerTool(
    'postgres_check_connection',
    {
      title: 'Check Postgres Connection',
      description: 'Verifies the database connection, performs a simple query test, and returns the current user and their permissions.',
      inputSchema: z.object({}).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      const status = await checkConnection();
      if (status.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Successfully connected to the database as user '${status.user.current_user}'. Superuser status: ${status.user.is_superuser}.`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Connection failed: ${status.error}\n\nRequired Action: ${status.details}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
