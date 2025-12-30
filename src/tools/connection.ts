import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { checkConnection } from '../database.js';

export function registerConnectionTools(server: McpServer) {
  server.registerTool(
    'check_connection',
    {
      description: 'Verifies the database connection and returns status.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      const status = await checkConnection();
      if (status.success) {
        return {
          content: [
            {
              type: 'text',
              text: 'Successfully connected to the database.',
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
