import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pool } from '../database.js';

export function registerQueryTools(server: McpServer) {
  server.registerTool(
    'execute_query',
    {
      description: 'Executes a SQL query against the Postgres database. Note: Destructive operations (DROP, DELETE, TRUNCATE) are forbidden.',
      inputSchema: z.object({
        sql: z.string().describe('The SQL query to execute'),
      }).shape,
    },
    async ({ sql }) => {
      try {
        // Basic safety check for destructive operations
        const destructiveKeywords = /\b(DROP|DELETE|TRUNCATE)\b/i;
        if (destructiveKeywords.test(sql)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Destructive operations (DROP, DELETE, TRUNCATE) are not allowed.',
              },
            ],
            isError: true,
          };
        }

        const result = await pool.query(sql);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing query: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
