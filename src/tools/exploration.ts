import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pool } from '../database.js';
import { formatRows, formatResponse } from '../utils/format.js';

export function registerExplorationTools(server: McpServer) {
  server.registerTool(
    'postgres_preview_table',
    {
      title: 'Preview Postgres Table',
      description: 'Quickly fetches a sample of rows from a specific table to understand its data shape without writing a manual SELECT query.',
      inputSchema: z.object({
        table_name: z.string().describe('The name of the table to preview'),
        schema: z.string().optional().default('public').describe('The schema the table belongs to'),
        limit: z.number().int().min(1).max(100).optional().default(10).describe('Number of rows to fetch (max 100)'),
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ table_name, schema, limit, response_format }) => {
      try {
        const safeSchema = '"' + schema.replaceAll('"', '""') + '"';
        const safeTable = '"' + table_name.replaceAll('"', '""') + '"';
        
        const sql = `SELECT * FROM ${safeSchema}.${safeTable} LIMIT $1;`;
        const result = await pool.query(sql, [limit]);
        
        return {
          content: [
            {
              type: 'text',
              text: formatResponse(result.rows, response_format, limit),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error previewing table: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'postgres_global_search',
    {
      title: 'Global Postgres Search',
      description: 'Searches across all character-based columns (VARCHAR, TEXT) in all tables for a specific string value. Extremely useful for finding where an email, ID, or name is used across the entire database.',
      inputSchema: z.object({
        search_term: z.string().min(3).describe('The exact string to search for (minimum 3 characters). Uses ILIKE %term%.'),
        schema: z.string().optional().default('public').describe('The schema to limit the search to'),
        response_format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format for the results'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ search_term, schema, response_format }) => {
      try {
        const colsSql = `
          SELECT table_name, column_name 
          FROM information_schema.columns 
          WHERE table_schema = $1 
            AND data_type IN ('character varying', 'text', 'character')
          ORDER BY table_name;
        `;
        const colsResult = await pool.query(colsSql, [schema]);
        
        if (colsResult.rows.length === 0) {
          return { content: [{ type: 'text', text: 'No text columns found in schema.' }] };
        }

        const tablesToColumns = new Map<string, string[]>();
        for (const row of colsResult.rows) {
          if (!tablesToColumns.has(row.table_name)) {
            tablesToColumns.set(row.table_name, []);
          }
          tablesToColumns.get(row.table_name)!.push(row.column_name);
        }

        const safeSchema = '"' + schema.replaceAll('"', '""') + '"';
        const searchPattern = `%${search_term}%`;
        const results: { table: string, matches: any[] }[] = [];

        const promises = Array.from(tablesToColumns.entries()).map(async ([tableName, columns]) => {
            const safeTable = '"' + tableName.replaceAll('"', '""') + '"';
            
            const whereClause = columns.map(col => `"${col.replaceAll('"', '""')}" ILIKE $1`).join(' OR ');
            
            const searchSql = `SELECT * FROM ${safeSchema}.${safeTable} WHERE ${whereClause} LIMIT 5;`;
            try {
                const searchResult = await pool.query(searchSql, [searchPattern]);
                if (searchResult.rows.length > 0) {
                    results.push({ table: tableName, matches: searchResult.rows });
                }
            } catch (err) {
                console.warn(`Search failed on ${tableName}:`, err);
            }
        });

        await Promise.all(promises);

        if (results.length === 0) {
             return { content: [{ type: 'text', text: `No matches found for '${search_term}' in schema '${schema}'.` }] };
        }

        if (response_format === 'json') {
            return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        }

        let markdownOutput = `# Search Results for '${search_term}'\n\n`;
        for (const result of results) {
            markdownOutput += `### Table: ${result.table}\n`;
            markdownOutput += formatRows(result.matches, 5);
            markdownOutput += `\n\n`;
        }

        return { content: [{ type: 'text', text: markdownOutput }] };

      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error performing global search: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'postgres_profile_column',
    {
      title: 'Profile Column',
      description: 'Analyzes a specific column to determine its shape (min/max/avg for numbers, distinct values for strings, null percentage).',
      inputSchema: z.object({
        table_name: z.string().describe('The name of the table'),
        column_name: z.string().describe('The name of the column to profile'),
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
    async ({ table_name, column_name, schema, response_format }) => {
      try {
        const typeSql = `
          SELECT data_type 
          FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = $2 AND table_schema = $3;
        `;
        const typeResult = await pool.query(typeSql, [table_name, column_name, schema]);
        
        if (typeResult.rows.length === 0) {
            return { content: [{ type: 'text', text: `Column not found.` }], isError: true };
        }
        
        const dataType = typeResult.rows[0].data_type;
        const safeSchema = '"' + schema.replaceAll('"', '""') + '"';
        const safeTable = '"' + table_name.replaceAll('"', '""') + '"';
        const safeColumn = '"' + column_name.replaceAll('"', '""') + '"';

        let profileData: any = { data_type: dataType };
        
        const nullSql = `
            SELECT COUNT(*) as total_rows, 
                   COUNT(CASE WHEN ${safeColumn} IS NULL THEN 1 END) as null_count
            FROM ${safeSchema}.${safeTable};
        `;
        const nullResult = await pool.query(nullSql);
        const totalRows = parseInt(nullResult.rows[0].total_rows);
        const nullCount = parseInt(nullResult.rows[0].null_count);
        profileData.null_percentage = totalRows > 0 ? (nullCount / totalRows * 100).toFixed(2) + '%' : '0%';

        if (['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision'].includes(dataType)) {
            const statsSql = `
                SELECT MIN(${safeColumn}) as min_val, 
                       MAX(${safeColumn}) as max_val, 
                       AVG(${safeColumn}::numeric) as avg_val
                FROM ${safeSchema}.${safeTable};
            `;
            const statsResult = await pool.query(statsSql);
            profileData = { ...profileData, ...statsResult.rows[0] };
        } else if (['character varying', 'text', 'character'].includes(dataType)) {
             const distinctSql = `
                SELECT ${safeColumn} as val, COUNT(*) as count 
                FROM ${safeSchema}.${safeTable} 
                WHERE ${safeColumn} IS NOT NULL 
                GROUP BY ${safeColumn} 
                ORDER BY count DESC 
                LIMIT 10;
            `;
            const distinctResult = await pool.query(distinctSql);
            profileData.top_values = distinctResult.rows;
        }

        if (response_format === 'json') {
          return { content: [{ type: 'text', text: JSON.stringify(profileData, null, 2) }] };
        }

        let markdown = `### Column Profile: ${column_name}\n`;
        markdown += `- **Data Type:** ${profileData.data_type}\n`;
        markdown += `- **Null Percentage:** ${profileData.null_percentage}\n`;
        if (profileData.min_val !== undefined) {
           markdown += `- **Min Value:** ${profileData.min_val}\n`;
           markdown += `- **Max Value:** ${profileData.max_val}\n`;
           markdown += `- **Avg Value:** ${profileData.avg_val}\n`;
        }
        if (profileData.top_values) {
           markdown += `\n#### Top Values\n`;
           markdown += formatResponse(profileData.top_values, 'markdown');
        }

        return {
          content: [{ type: 'text', text: markdown }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error profiling column: ${error.message}` }],
          isError: true,
        };
      }
    },
  );
}
