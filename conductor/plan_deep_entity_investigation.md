# Deep Entity Investigation Tool Implementation Plan (COMPLETED)

**Goal:** Provide AI agents with a macro-tool (`postgres_get_entity_graph`) that performs a 360-degree investigation of a specific entity (e.g., a specific User or Order) by automatically discovering and querying all related child records via foreign keys.

**Architecture:** Add the new tool to `src/tools/exploration.ts`.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `pg`, `zod`.

---

### Task 1: Add `postgres_get_entity_graph` to Exploration Tools

**Files:**
- Modify: `src/tools/exploration.ts`

- [x] **Step 1: Add `postgres_get_entity_graph` tool registration**

Inside `registerExplorationTools(server: McpServer)` in `src/tools/exploration.ts`, add the new tool.

```typescript
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
```

- [x] **Step 2: Commit changes**

```bash
git add src/tools/exploration.ts
git commit -m "feat: add postgres_get_entity_graph tool"
```

---

### Task 2: Build Project & Update Docs
- [x] **Step 1: Run Build**
```bash
npm run build
```
- [x] **Step 2: Update README.md and GEMINI.md**
Add `postgres_get_entity_graph` to the list of Data Exploration Tools in `README.md` and `GEMINI.md`.
- [x] **Step 3: Commit build output & docs**

```bash
git add README.md GEMINI.md
git commit -m "docs: add postgres_get_entity_graph to documentation"
```

