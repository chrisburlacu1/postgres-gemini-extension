# Dependency & Routing Tools Implementation Plan (COMPLETED)

**Goal:** Provide AI agents with tools to understand table relationships (`postgres_get_table_relationships`) and auto-generate complex join paths (`postgres_find_join_path`).

**Architecture:** Add two new tools to `src/tools/schema.ts`. These tools will utilize foreign key constraint metadata to map the database graph.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `pg`, `zod`.

---

### Task 1: Add `postgres_get_table_relationships` to Schema Tools

**Files:**
- Modify: `src/tools/schema.ts`

- [x] **Step 1: Add `postgres_get_table_relationships` tool registration**

Inside `registerSchemaTools(server: McpServer)` in `src/tools/schema.ts`, add the new tool.

```typescript
  server.registerTool(
    'postgres_get_table_relationships',
    {
      title: 'Get Table Relationships',
      description: 'Finds immediate neighbors of a table by listing incoming foreign keys (Has Many) and outgoing foreign keys (Belongs To).',
      inputSchema: z.object({
        table_name: z.string().describe('The name of the table'),
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
        const cacheKey = `relationships:${schema}.${table_name}`;
        let relationships: any = { outgoing: [], incoming: [] };

        if (schemaCache.has(cacheKey)) {
          relationships = schemaCache.get(cacheKey)!;
        } else {
          const outgoingSql = `
            SELECT
                kcu.column_name AS source_column,
                ccu.table_name AS target_table,
                ccu.column_name AS target_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2;
          `;
          
          const incomingSql = `
            SELECT
                tc.table_name AS source_table,
                kcu.column_name AS source_column,
                ccu.column_name AS target_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_schema = $1 AND ccu.table_name = $2;
          `;

          const [outResult, inResult] = await Promise.all([
            pool.query(outgoingSql, [schema, table_name]),
            pool.query(incomingSql, [schema, table_name])
          ]);

          relationships.outgoing = outResult.rows;
          relationships.incoming = inResult.rows;
          
          schemaCache.set(cacheKey, relationships);
        }

        if (response_format === 'json') {
          return { content: [{ type: 'text', text: JSON.stringify(relationships, null, 2) }] };
        }

        let markdown = `### Outgoing Relationships (Foreign Keys)\n`;
        markdown += relationships.outgoing.length ? formatResponse(relationships.outgoing, 'markdown') : 'None\n';
        markdown += `\n### Incoming Relationships (References to this table)\n`;
        markdown += relationships.incoming.length ? formatResponse(relationships.incoming, 'markdown') : 'None\n';

        return {
          content: [{ type: 'text', text: markdown }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error getting relationships: ${error.message}` }],
          isError: true,
        };
      }
    },
  );
```

- [x] **Step 2: Commit changes**

```bash
git add src/tools/schema.ts
git commit -m "feat: add postgres_get_table_relationships tool"
```

---

### Task 2: Add `postgres_find_join_path` to Schema Tools

**Files:**
- Modify: `src/tools/schema.ts`

- [x] **Step 1: Add `postgres_find_join_path` tool registration**

Inside `registerSchemaTools(server: McpServer)` in `src/tools/schema.ts`, add the new tool. This tool fetches all foreign keys in the schema, builds a graph, and performs a Breadth-First Search (BFS) to find the shortest join path between two tables.

```typescript
  server.registerTool(
    'postgres_find_join_path',
    {
      title: 'Find Join Path',
      description: 'Discovers how to connect two tables by searching the foreign key graph. Returns the SQL JOIN string.',
      inputSchema: z.object({
        source_table: z.string().describe('The starting table for the join'),
        target_table: z.string().describe('The destination table for the join'),
        schema: z.string().optional().default('public').describe('The schema the tables belong to'),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ source_table, target_table, schema }) => {
      try {
        const cacheKey = `all_fkeys:${schema}`;
        let allFKeys: any[] = [];
        
        if (schemaCache.has(cacheKey)) {
            allFKeys = schemaCache.get(cacheKey)!;
        } else {
             const fkeySql = `
                SELECT
                    tc.table_name AS source_table,
                    kcu.column_name AS source_column,
                    ccu.table_name AS target_table,
                    ccu.column_name AS target_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1;
             `;
             const result = await pool.query(fkeySql, [schema]);
             allFKeys = result.rows;
             schemaCache.set(cacheKey, allFKeys);
        }

        // Build adjacency list for undirected graph search
        const graph: Record<string, any[]> = {};
        for (const edge of allFKeys) {
            if (!graph[edge.source_table]) graph[edge.source_table] = [];
            if (!graph[edge.target_table]) graph[edge.target_table] = [];
            
            // Edge from source to target
            graph[edge.source_table].push({
                to: edge.target_table,
                condition: `${edge.source_table}.${edge.source_column} = ${edge.target_table}.${edge.target_column}`
            });
            // Edge from target to source
            graph[edge.target_table].push({
                to: edge.source_table,
                condition: `${edge.target_table}.${edge.target_column} = ${edge.source_table}.${edge.source_column}`
            });
        }

        if (!graph[source_table] || !graph[target_table]) {
             return { content: [{ type: 'text', text: 'One or both tables do not exist or have no relationships.' }] };
        }

        // BFS to find shortest path
        const queue: { current: string, path: string[], visited: Set<string> }[] = [];
        queue.push({ current: source_table, path: [], visited: new Set([source_table]) });
        
        let foundPath: string[] | null = null;

        while (queue.length > 0) {
            const { current, path, visited } = queue.shift()!;
            
            if (current === target_table) {
                foundPath = path;
                break;
            }

            const neighbors = graph[current] || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor.to)) {
                    const newVisited = new Set(visited);
                    newVisited.add(neighbor.to);
                    queue.push({
                        current: neighbor.to,
                        path: [...path, `JOIN ${neighbor.to} ON ${neighbor.condition}`],
                        visited: newVisited
                    });
                }
            }
        }

        if (foundPath) {
             const resultString = `-- Path from ${source_table} to ${target_table}\n` + foundPath.join('\n');
             return { content: [{ type: 'text', text: `\`\`\`sql\n${resultString}\n\`\`\`` }] };
        } else {
             return { content: [{ type: 'text', text: `No relationship path found between ${source_table} and ${target_table}.` }] };
        }

      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error finding join path: ${error.message}` }],
          isError: true,
        };
      }
    },
  );
```

- [x] **Step 2: Commit changes**

```bash
git add src/tools/schema.ts
git commit -m "feat: add postgres_find_join_path tool"
```

---

### Task 3: Build Project
- [x] **Step 1: Run Build**
```bash
npm run build
```
- [x] **Step 2: Commit build output**

```bash
git add dist
git commit -m "build: compile new dependency routing tools"
```
