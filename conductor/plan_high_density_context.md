# High-Density Context Tools Implementation Plan (COMPLETED)

**Goal:** Provide AI agents with high-density tools (`postgres_get_schema_overview`, `postgres_get_table_ddl`, and `postgres_profile_column`) to reduce tool call round-trips and improve initial database orientation.

**Architecture:** Add two new tools to `src/tools/schema.ts` and one to `src/tools/exploration.ts`. We will use caching via `schemaCache` for metadata tools to maintain performance.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `pg`, `zod`.

---

### Task 1: Add `postgres_get_schema_overview` to Schema Tools

**Files:**
- Modify: `src/tools/schema.ts`

- [x] **Step 1: Add `postgres_get_schema_overview` tool registration**

Inside `registerSchemaTools(server: McpServer)` in `src/tools/schema.ts`, add the new tool. It should query `information_schema.tables`, `pg_class`, and `information_schema.table_constraints` to get table names, primary keys, and estimated row counts.

```typescript
  server.registerTool(
    'postgres_get_schema_overview',
    {
      title: 'Get Schema Overview',
      description: 'Provides a high-density overview of a schema including all tables, their primary keys, and approximate row counts. Best for initial orientation.',
      inputSchema: z.object({
        schema: z.string().optional().default('public').describe('The schema to summarize'),
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
        const cacheKey = `schema_overview:${schema}`;
        let overview;
        if (schemaCache.has(cacheKey)) {
          overview = schemaCache.get(cacheKey)!;
        } else {
          const sql = `
            SELECT 
                t.table_name,
                (SELECT string_agg(kcu.column_name, ', ') 
                 FROM information_schema.table_constraints tc
                 JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                 WHERE tc.table_name = t.table_name AND tc.table_schema = t.table_schema AND tc.constraint_type = 'PRIMARY KEY'
                ) as primary_keys,
                c.reltuples::bigint AS estimated_rows
            FROM information_schema.tables t
            JOIN pg_class c ON c.relname = t.table_name
            JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
            WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
            ORDER BY t.table_name;
          `;
          const result = await pool.query(sql, [schema]);
          overview = result.rows;
          schemaCache.set(cacheKey, overview);
        }

        return {
          content: [{ type: 'text', text: formatResponse(overview, response_format) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error getting schema overview: ${error.message}` }],
          isError: true,
        };
      }
    },
  );
```

- [x] **Step 2: Commit changes**

```bash
git add src/tools/schema.ts
git commit -m "feat: add postgres_get_schema_overview tool"
```

---

### Task 2: Add `postgres_get_table_ddl` to Schema Tools

**Files:**
- Modify: `src/tools/schema.ts`

- [x] **Step 1: Add `postgres_get_table_ddl` tool registration**

Inside `registerSchemaTools(server: McpServer)` in `src/tools/schema.ts`, add the new tool to reconstruct basic DDL.

```typescript
  server.registerTool(
    'postgres_get_table_ddl',
    {
      title: 'Get Table DDL',
      description: 'Reconstructs a simplified CREATE TABLE statement for an agent to easily understand the full schema of a single table.',
      inputSchema: z.object({
        table_name: z.string().describe('The name of the table'),
        schema: z.string().optional().default('public').describe('The schema the table belongs to'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ table_name, schema }) => {
      try {
        const cacheKey = `ddl:${schema}.${table_name}`;
        let ddl = '';
        if (schemaCache.has(cacheKey)) {
          ddl = schemaCache.get(cacheKey)!;
        } else {
          const colSql = `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = $1 AND table_schema = $2
            ORDER BY ordinal_position;
          `;
          const colResult = await pool.query(colSql, [table_name, schema]);
          
          if (colResult.rows.length === 0) {
             return { content: [{ type: 'text', text: `Table ${schema}.${table_name} not found or has no columns.` }] };
          }

          let statement = `CREATE TABLE ${schema}.${table_name} (\n`;
          const colDefs = colResult.rows.map(col => {
            let def = `  ${col.column_name} ${col.data_type}`;
            if (col.is_nullable === 'NO') def += ' NOT NULL';
            if (col.column_default) def += ` DEFAULT ${col.column_default}`;
            return def;
          });
          
          statement += colDefs.join(',\n');
          statement += '\n)';
          ddl = statement;
          schemaCache.set(cacheKey, ddl);
        }

        return {
          content: [{ type: 'text', text: '```sql\n' + ddl + '\n```' }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error generating DDL: ${error.message}` }],
          isError: true,
        };
      }
    },
  );
```

- [x] **Step 2: Commit changes**

```bash
git add src/tools/schema.ts
git commit -m "feat: add postgres_get_table_ddl tool"
```

---

### Task 3: Add `postgres_profile_column` to Exploration Tools

**Files:**
- Modify: `src/tools/exploration.ts`

- [x] **Step 1: Add `postgres_profile_column` tool registration**

Inside `registerExplorationTools(server: McpServer)` in `src/tools/exploration.ts`, add the new tool.

```typescript
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
```

- [x] **Step 2: Commit changes**

```bash
git add src/tools/exploration.ts
git commit -m "feat: add postgres_profile_column tool"
```

---

### Task 4: Build Project
- [x] **Step 1: Run Build**
```bash
npm run build
```
- [x] **Step 2: Commit build output**
```bash
git add dist
git commit -m "build: compile new high density context tools"
```
