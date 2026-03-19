import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pool } from '../database.js';
import { formatRows } from '../utils/format.js';

export function registerQueryTools(server: McpServer) {
  server.registerTool(
    'postgres_execute_query',
    {
      title: 'Execute Postgres Query',
      description: 'Executes a SQL query against the database. For security, destructive operations like DROP, DELETE, and TRUNCATE are forbidden. This tool is intended for data retrieval and analysis.',
      inputSchema: z.object({
        sql: z.string().describe('The SQL query to execute'),
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: false, // Could be true if we only allowed SELECT, but currently we allow non-destructive writes if not in the blacklist
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ sql, response_format }) => {
      try {
        // Basic safety check for destructive operations
        // Improved regex to be more specific while still providing protection
        const destructiveKeywords = /\b(DROP|DELETE|TRUNCATE|ALTER|GRANT|REVOKE)\b/i;
        if (destructiveKeywords.test(sql)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Destructive or administrative operations (DROP, DELETE, TRUNCATE, ALTER, GRANT, REVOKE) are not allowed for security reasons.',
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
              text: response_format === 'json' ? JSON.stringify(result.rows, null, 2) : formatRows(result.rows),
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
