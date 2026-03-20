import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pool } from '../database.js';
import { schemaCache } from '../utils/cache.js';
import { formatResponse } from '../utils/format.js';

export function registerSchemaTools(server: McpServer) {
  server.registerTool(
    'postgres_list_schemas',
    {
      title: 'List Postgres Schemas',
      description: 'Lists all available schemas in the current database, excluding internal system schemas.',
      inputSchema: z.object({
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ response_format }) => {
      try {
        const cacheKey = 'schemas:all';
        let schemas;
        if (schemaCache.has(cacheKey)) {
          schemas = schemaCache.get(cacheKey)!;
        } else {
          const sql = `
            SELECT schema_name 
            FROM information_schema.schemata
            WHERE schema_name NOT LIKE 'pg_%' AND schema_name != 'information_schema'
            ORDER BY schema_name;
          `;
          const result = await pool.query(sql);
          schemas = result.rows;
          schemaCache.set(cacheKey, schemas);
        }

        return {
          content: [
            {
              type: 'text',
              text: formatResponse(schemas, response_format),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing schemas: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'postgres_list_tables',
    {
      title: 'List Postgres Tables',
      description: 'Lists all base tables in a specific schema (defaults to public). Supports pagination.',
      inputSchema: z.object({
        schema: z.string().optional().default('public').describe('The schema to list tables from'),
        limit: z.number().int().min(1).max(1000).optional().default(100).describe('Maximum number of tables to return'),
        offset: z.number().int().min(0).optional().default(0).describe('Number of tables to skip for pagination'),
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ schema, limit, offset, response_format }) => {
      try {
        const cacheKey = `tables:${schema}:${limit}:${offset}`;
        let tables;
        if (schemaCache.has(cacheKey)) {
          tables = schemaCache.get(cacheKey)!;
        } else {
          const sql = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = $1 AND table_type = 'BASE TABLE'
            ORDER BY table_name
            LIMIT $2 OFFSET $3;
          `;
          const result = await pool.query(sql, [schema, limit, offset]);
          tables = result.rows;
          schemaCache.set(cacheKey, tables);
        }

        return {
          content: [
            {
              type: 'text',
              text: formatResponse(tables, response_format),
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
    'postgres_describe_table',
    {
      title: 'Describe Postgres Table',
      description: 'Gets the detailed schema (columns, types, nullability, defaults) of a specific table.',
      inputSchema: z.object({
        table_name: z.string().describe('The name of the table to describe'),
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
        const cacheKey = `describe:${schema}.${table_name}`;
        let columns;
        if (schemaCache.has(cacheKey)) {
          columns = schemaCache.get(cacheKey)!;
        } else {
          const sql = `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = $1 AND table_schema = $2
            ORDER BY ordinal_position;
          `;
          const result = await pool.query(sql, [table_name, schema]);
          columns = result.rows;
          schemaCache.set(cacheKey, columns);
        }

        return {
          content: [
            {
              type: 'text',
              text: formatResponse(columns, response_format),
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
    'postgres_search_schema',
    {
      title: 'Search Postgres Schema',
      description: 'Searches for tables and columns matching a fuzzy pattern across schemas.',
      inputSchema: z.object({
        pattern: z.string().describe('The pattern to search for (e.g., "stream", "track")'),
        schema: z.string().optional().describe('Optional schema to restrict search to'),
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ pattern, schema, response_format }) => {
      try {
        let sql = `
          SELECT 
            table_schema,
            table_name, 
            column_name, 
            'column' as match_type
          FROM information_schema.columns
          WHERE (table_name ILIKE $1 OR column_name ILIKE $1)
            AND table_schema NOT LIKE 'pg_%' AND table_schema != 'information_schema'
        `;
        
        const params: any[] = [`%${pattern}%`];
        if (schema) {
          sql += ` AND table_schema = $2`;
          params.push(schema);
        }

        sql += `
          UNION
          SELECT 
            table_schema,
            table_name, 
            NULL as column_name, 
            'table' as match_type
          FROM information_schema.tables
          WHERE table_name ILIKE $1
            AND table_schema NOT LIKE 'pg_%' AND table_schema != 'information_schema'
        `;
        
        if (schema) {
          sql += ` AND table_schema = $2`;
        }

        sql += ` ORDER BY table_schema, table_name, match_type DESC;`;
        
        const result = await pool.query(sql, params);
        return {
          content: [
            {
              type: 'text',
              text: formatResponse(result.rows, response_format),
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
    'postgres_get_table_stats',
    {
      title: 'Get Postgres Table Stats',
      description: 'Retrieves row counts and storage metrics (table size, index size) for tables in a schema.',
      inputSchema: z.object({
        schema: z.string().optional().default('public').describe('The schema to get stats for'),
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ schema, response_format }) => {
      try {
        const sql = `
          SELECT 
            c.relname AS table_name,
            c.reltuples::bigint AS estimated_rows,
            pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
            pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
            pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) AS index_size
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'r' 
            AND n.nspname = $1
          ORDER BY pg_total_relation_size(c.oid) DESC;
        `;
        const result = await pool.query(sql, [schema]);
        return {
          content: [
            {
              type: 'text',
              text: formatResponse(result.rows, response_format),
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
    'postgres_list_databases',
    {
      title: 'List Postgres Databases',
      description: 'Lists all non-template databases available on the server.',
      inputSchema: z.object({
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ response_format }) => {
      try {
        const cacheKey = 'databases:all';
        let databases;
        if (schemaCache.has(cacheKey)) {
          databases = schemaCache.get(cacheKey)!;
        } else {
          const sql = `SELECT datname FROM pg_database WHERE datistemplate = false;`;
          const result = await pool.query(sql);
          databases = result.rows;
          schemaCache.set(cacheKey, databases);
        }

        return {
          content: [
            {
              type: 'text',
              text: formatResponse(databases, response_format),
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
    'postgres_list_views',
    {
      title: 'List Postgres Views',
      description: 'Lists all views in a specific schema (defaults to public).',
      inputSchema: z.object({
        schema: z.string().optional().default('public').describe('The schema to list views from'),
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ schema, response_format }) => {
      try {
        const cacheKey = `views:${schema}`;
        let views;
        if (schemaCache.has(cacheKey)) {
          views = schemaCache.get(cacheKey)!;
        } else {
          const sql = `
            SELECT table_name 
            FROM information_schema.views 
            WHERE table_schema = $1
            ORDER BY table_name;
          `;
          const result = await pool.query(sql, [schema]);
          views = result.rows;
          schemaCache.set(cacheKey, views);
        }

        return {
          content: [
            {
              type: 'text',
              text: formatResponse(views, response_format),
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
    'postgres_clear_cache',
    {
      title: 'Clear Postgres Cache',
      description: 'Clears the in-memory database schema cache. Use this if the database structure has changed.',
      inputSchema: z.object({}).shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      schemaCache.clear();
      return {
        content: [
          {
            type: 'text',
            text: 'Schema cache cleared successfully.',
          },
        ],
      };
    }
  );

  server.registerTool(
    'postgres_get_database_schema_erd',
    {
      title: 'Get Postgres ERD',
      description: 'Generates a Mermaid Entity Relationship Diagram representing the database schema and its foreign key connections.',
      inputSchema: z.object({
        schema: z.string().optional().default('public').describe('The schema to generate ERD for'),
        include_columns: z.boolean().optional().default(false).describe('Whether to include column names and types in the diagram'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ schema, include_columns }) => {
      try {
        const cacheKey = `erd_relationships:${schema}`;
        let relationships: any[] = [];

        if (schemaCache.has(cacheKey)) {
          relationships = schemaCache.get(cacheKey)!;
        } else {
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
                AND tc.table_schema = $1;
          `;
          const result = await pool.query(sql, [schema]);
          relationships = result.rows;
          schemaCache.set(cacheKey, relationships);
        }

        let mermaid = '```mermaid\n';

        if (include_columns) {
          const colCacheKey = `erd_columns:${schema}`;
          let columns: any[] = [];
          
          if (schemaCache.has(colCacheKey)) {
            columns = schemaCache.get(colCacheKey)!;
          } else {
            const colSql = `
              SELECT table_name, column_name, data_type
              FROM information_schema.columns
              WHERE table_schema = $1
              ORDER BY table_name, ordinal_position;
            `;
            const colResult = await pool.query(colSql, [schema]);
            columns = colResult.rows;
            schemaCache.set(colCacheKey, columns);
          }
          
          const tables = new Map<string, any[]>();
          for (const row of columns) {
            if (!tables.has(row.table_name)) tables.set(row.table_name, []);
            tables.get(row.table_name)?.push(row);
          }

          for (const [tableName, cols] of tables.entries()) {
            mermaid += `    ${tableName} {\n`;
            for (const col of cols) {
              mermaid += `        ${col.data_type.replace(/ /g, '_')} ${col.column_name}\n`;
            }
            mermaid += `    }\n`;
          }
        }

        if (relationships.length === 0 && !include_columns) {
          return {
            content: [{ type: 'text', text: 'No relationships found in the database.' }],
          };
        }

        for (const row of relationships) {
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
