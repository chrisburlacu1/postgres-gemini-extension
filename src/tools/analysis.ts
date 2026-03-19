import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pool } from '../database.js';
import { schemaCache } from '../utils/cache.js';
import { formatRows } from '../utils/format.js';

export function registerAnalysisTools(server: McpServer) {
  server.registerTool(
    'postgres_show_indexes',
    {
      title: 'Show Postgres Indexes',
      description: 'Lists all indexes defined for a specific table, including their definitions.',
      inputSchema: z.object({
        table_name: z.string().describe('The name of the table to show indexes for'),
        schema: z.string().optional().default('public').describe('The schema the table belongs to'),
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ table_name, schema, response_format }) => {
      try {
        const cacheKey = `indexes:${schema}.${table_name}`;
        let indexes;
        if (schemaCache.has(cacheKey)) {
          indexes = schemaCache.get(cacheKey)!;
        } else {
          const sql = `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 AND schemaname = $2;`;
          const result = await pool.query(sql, [table_name, schema]);
          indexes = result.rows;
          schemaCache.set(cacheKey, indexes);
        }

        return {
          content: [
            {
              type: 'text',
              text: response_format === 'json' ? JSON.stringify(indexes, null, 2) : formatRows(indexes),
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
    'postgres_show_constraints',
    {
      title: 'Show Postgres Constraints',
      description: 'Displays all constraints (Primary Keys, Foreign Keys, Unique) for a specific table.',
      inputSchema: z.object({
        table_name: z.string().describe('The name of the table to show constraints for'),
        schema: z.string().optional().default('public').describe('The schema the table belongs to'),
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ table_name, schema, response_format }) => {
      try {
        const cacheKey = `constraints:${schema}.${table_name}`;
        let constraints;
        if (schemaCache.has(cacheKey)) {
          constraints = schemaCache.get(cacheKey)!;
        } else {
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
          WHERE tc.table_name = $1 AND tc.table_schema = $2;
        `;
          const result = await pool.query(sql, [table_name, schema]);
          constraints = result.rows;
          schemaCache.set(cacheKey, constraints);
        }

        return {
          content: [
            {
              type: 'text',
              text: response_format === 'json' ? JSON.stringify(constraints, null, 2) : formatRows(constraints),
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
    'postgres_explain_query',
    {
      title: 'Explain Postgres Query',
      description: 'Executes EXPLAIN (FORMAT JSON) on a SQL query to provide the execution plan.',
      inputSchema: z.object({
        sql: z.string().describe('The SQL query to analyze with EXPLAIN'),
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ sql, response_format }) => {
      try {
        const explainSql = `EXPLAIN (FORMAT JSON) ${sql}`;
        const result = await pool.query(explainSql);
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
              text: `Error explaining query: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
