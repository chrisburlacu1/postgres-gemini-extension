import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pool, schemaCache } from '../database.js';
import { formatRows } from '../utils/format.js';

export function registerSchemaTools(server: McpServer) {
  server.registerTool(
    'list_tables',
    {
      description: 'Lists all tables in the current database.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      try {
        const sql = `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
          ORDER BY table_name;
        `;
        const result = await pool.query(sql);
        return {
          content: [
            {
              type: 'text',
              text: formatRows(result.rows),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing tables: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'describe_table',
    {
      description: 'Gets the schema (columns) of a specific table.',
      inputSchema: z.object({
        table_name: z.string().describe('The name of the table to describe'),
      }).shape,
    },
    async ({ table_name }) => {
      try {
        // Check cache first
        if (schemaCache.has(table_name)) {
          return {
            content: [
              {
                type: 'text',
                text: formatRows(schemaCache.get(table_name)),
              },
            ],
          };
        }

        const sql = `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position;
        `;
        const result = await pool.query(sql, [table_name]);
        
        // Update cache
        schemaCache.set(table_name, result.rows);

        return {
          content: [
            {
              type: 'text',
              text: formatRows(result.rows),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error describing table: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'search_schema',
    {
      description: 'Search for tables and columns matching a fuzzy pattern.',
      inputSchema: z.object({
        pattern: z.string().describe('The pattern to search for (e.g., "stream", "track")'),
      }).shape,
    },
    async ({ pattern }) => {
      try {
        const sql = `
          SELECT 
            table_name, 
            column_name, 
            'column' as match_type
          FROM information_schema.columns
          WHERE table_schema = 'public' 
            AND (table_name ILIKE $1 OR column_name ILIKE $1)
          UNION
          SELECT 
            table_name, 
            NULL as column_name, 
            'table' as match_type
          FROM information_schema.tables
          WHERE table_schema = 'public' 
            AND table_name ILIKE $1
          ORDER BY table_name, match_type DESC;
        `;
        const result = await pool.query(sql, [`%${pattern}%`]);
        return {
          content: [
            {
              type: 'text',
              text: formatRows(result.rows),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error searching schema: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'get_table_stats',
    {
      description: 'Get row counts and storage size for all tables.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      try {
        const sql = `
          SELECT 
            relname AS table_name,
            reltuples::bigint AS estimated_rows,
            pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
            pg_size_pretty(pg_relation_size(relid)) AS table_size,
            pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
          FROM pg_catalog.pg_statio_user_tables
          ORDER BY pg_total_relation_size(relid) DESC;
        `;
        const result = await pool.query(sql);
        return {
          content: [
            {
              type: 'text',
              text: formatRows(result.rows),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting table stats: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'list_databases',
    {
      description: 'Lists all databases on the server.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      try {
        const sql = `SELECT datname FROM pg_database WHERE datistemplate = false;`;
        const result = await pool.query(sql);
        return {
          content: [
            {
              type: 'text',
              text: formatRows(result.rows),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing databases: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'list_views',
    {
      description: 'Lists all views in the current database.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      try {
        const sql = `
          SELECT table_name 
          FROM information_schema.views 
          WHERE table_schema = 'public'
          ORDER BY table_name;
        `;
        const result = await pool.query(sql);
        return {
          content: [
            {
              type: 'text',
              text: formatRows(result.rows),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing views: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'get_database_schema_erd',
    {
      description: 'Generates a Mermaid ERD (Entity Relationship Diagram) representing the database schema connections.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      try {
        const sql = `
          SELECT
              tc.table_name AS source_table,
              kcu.column_name AS source_column,
              ccu.table_name AS target_table,
              ccu.column_name AS target_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'public';
        `;
        const result = await pool.query(sql);
        
        if (result.rows.length === 0) {
          return {
            content: [{ type: 'text', text: 'No relationships found in the database.' }],
          };
        }

        let mermaid = '```mermaid\nerDiagram\n';
        for (const row of result.rows) {
          mermaid += `    ${row.target_table} ||--o{ ${row.source_table} : "${row.target_column} -> ${row.source_column}"\n`;
        }
        mermaid += '```';

        return {
          content: [
            {
              type: 'text',
              text: mermaid,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error generating ERD: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
