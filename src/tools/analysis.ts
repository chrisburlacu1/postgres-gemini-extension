import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pool } from '../database.js';

export function registerAnalysisTools(server: McpServer) {
  server.registerTool(
    'show_indexes',
    {
      description: 'Lists all indexes for a specific table.',
      inputSchema: z.object({
        table_name: z.string().describe('The name of the table to show indexes for'),
      }).shape,
    },
    async ({ table_name }) => {
      try {
        const sql = `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1;`;
        const result = await pool.query(sql, [table_name]);
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
              text: `Error showing indexes: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'show_constraints',
    {
      description: 'Shows constraints (primary keys, foreign keys, unique) for a specific table.',
      inputSchema: z.object({
        table_name: z.string().describe('The name of the table to show constraints for'),
      }).shape,
    },
    async ({ table_name }) => {
      try {
        const sql = `
          SELECT
              tc.constraint_name, 
              tc.table_name, 
              kcu.column_name, 
              tc.constraint_type,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name 
          FROM 
              information_schema.table_constraints AS tc 
              JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
              JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
          WHERE tc.table_name = $1;
        `;
        const result = await pool.query(sql, [table_name]);
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
              text: `Error showing constraints: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'explain_query',
    {
      description: 'Runs EXPLAIN on a SQL query to show the execution plan.',
      inputSchema: z.object({
        sql: z.string().describe('The SQL query to explain'),
      }).shape,
    },
    async ({ sql }) => {
      try {
        const explainSql = `EXPLAIN (FORMAT JSON) ${sql}`;
        const result = await pool.query(explainSql);
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
              text: `Error explaining query: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
