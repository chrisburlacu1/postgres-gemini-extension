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

  server.registerTool(
    'postgres_get_entity_graph',
    {
      title: 'Get Entity Graph (360-Degree View)',
      description: 'Provides a complete 360-degree view of a specific record by resolving its primary key, fetching the core record, and automatically discovering and querying all related child records via incoming foreign keys. Essential for debugging a specific entity like a user or order.',
      inputSchema: z.object({
        table_name: z.string().describe('The name of the base table'),
        primary_key_value: z.string().describe('The value of the primary key for the record to investigate (cast to string)'),
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
    async ({ table_name, primary_key_value, schema, response_format }) => {
      try {
        const safeSchema = '"' + schema.replaceAll('"', '""') + '"';
        const safeTable = '"' + table_name.replaceAll('"', '""') + '"';

        // 1. Find Primary Key Column
        const pkSql = `
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name 
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' 
            AND tc.table_schema = $1 
            AND tc.table_name = $2
          LIMIT 1;
        `;
        const pkResult = await pool.query(pkSql, [schema, table_name]);
        
        let pkColumn = 'id'; // fallback
        if (pkResult.rows.length > 0) {
            pkColumn = pkResult.rows[0].column_name;
        } else {
            // Check if there is an id column anyway
            const colSql = `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = 'id'`;
            const colResult = await pool.query(colSql, [schema, table_name]);
            if (colResult.rows.length === 0) {
                 return { content: [{ type: 'text', text: `Could not determine primary key for ${schema}.${table_name}.` }], isError: true };
            }
        }
        
        const safePkColumn = '"' + pkColumn.replaceAll('"', '""') + '"';

        // 2. Fetch Base Record
        const baseSql = `SELECT * FROM ${safeSchema}.${safeTable} WHERE ${safePkColumn} = $1 LIMIT 1;`;
        const baseResult = await pool.query(baseSql, [primary_key_value]);

        if (baseResult.rows.length === 0) {
             return { content: [{ type: 'text', text: `No record found in ${schema}.${table_name} with ${pkColumn} = '${primary_key_value}'.` }] };
        }

        const baseRecord = baseResult.rows[0];
        
        // 3. Find Incoming Foreign Keys (Child Tables)
        const inFkeySql = `
            SELECT
                tc.table_name AS child_table,
                kcu.column_name AS child_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name 
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu 
                ON ccu.constraint_name = tc.constraint_name 
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' 
                AND ccu.table_schema = $1 
                AND ccu.table_name = $2
                AND ccu.column_name = $3;
        `;
        const fkeyResult = await pool.query(inFkeySql, [schema, table_name, pkColumn]);
        const childRelationships = fkeyResult.rows;

        // 4. Fetch Child Records
        const graph: any = {
            base_record: {
                table: table_name,
                pk_column: pkColumn,
                data: baseRecord
            },
            related_records: []
        };

        const promises = childRelationships.map(async (rel) => {
            const safeChildTable = '"' + rel.child_table.replaceAll('"', '""') + '"';
            const safeChildCol = '"' + rel.child_column.replaceAll('"', '""') + '"';
            const childQuery = `SELECT * FROM ${safeSchema}.${safeChildTable} WHERE ${safeChildCol} = $1 LIMIT 10;`;
            try {
                const childRes = await pool.query(childQuery, [primary_key_value]);
                if (childRes.rows.length > 0) {
                    graph.related_records.push({
                        table: rel.child_table,
                        foreign_key_column: rel.child_column,
                        count: childRes.rows.length,
                        data: childRes.rows
                    });
                }
            } catch (err) {
                 console.warn(`Error fetching child records from ${rel.child_table}:`, err);
            }
        });

        await Promise.all(promises);

        if (response_format === 'json') {
             return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
        }

        let markdown = `# Entity Graph: ${table_name} (${pkColumn} = ${primary_key_value})\n\n`;
        markdown += `## Base Record\n`;
        markdown += formatResponse([graph.base_record.data], 'markdown');
        markdown += `\n\n## Related Records\n`;

        if (graph.related_records.length === 0) {
             markdown += `No associated child records found in the database.`;
        } else {
             for (const rel of graph.related_records) {
                 markdown += `### ${rel.table} (via ${rel.foreign_key_column})\n`;
                 markdown += `Showing ${rel.count} record(s):\n`;
                 markdown += formatResponse(rel.data, 'markdown');
                 markdown += `\n\n`;
             }
        }

        return { content: [{ type: 'text', text: markdown }] };

      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error generating entity graph: ${error.message}` }],
          isError: true,
        };
      }
    },
  );
}
