# Implement get_database_schema_erd Plan

## Objective
Provide an efficient, holistic way for the AI agent to understand how all tables in the Postgres database are connected. The goal is to avoid repetitive `show_constraints` or `describe_table` tool calls by generating a dense, easily parsed Mermaid Entity-Relationship Diagram (ERD).

## Key Files & Context
- `src/tools/schema.ts`: This is the logical home for database-wide schema discovery tools.

## Proposed Solution
Add a new MCP tool named `get_database_schema_erd`. 
1. This tool will run a single query against `information_schema` to extract all `FOREIGN KEY` constraints.
2. It will parse the result set into the Mermaid `erDiagram` syntax.
3. The format will be: `target_table ||--o{ source_table : "target_column -> source_column"`. Note that Postgres foreign keys imply a one-to-many relationship (`||--o{`) by default, unless combined with unique constraints, but `||--o{` is the standard safe representation for ERDs.
4. The output will be returned as plain text inside a Markdown mermaid block, providing the AI with a token-efficient map of the entire database's graph.

## Implementation Steps
1. **Modify `src/tools/schema.ts`**:
   - Register a new tool `get_database_schema_erd`.
   - Implement the SQL query:
     ```sql
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
     ```
   - Transform the resulting rows into a string block:
     ```typescript
     let mermaid = "erDiagram\n";
     for (const row of result.rows) {
         mermaid += `    ${row.target_table} ||--o{ ${row.source_table} : "${row.target_column} -> ${row.source_column}"\n`;
     }
     ```
   - Return the constructed string wrapped in triple backticks with `mermaid`.
2. **Compile**: Run `npm run build` to verify type safety.

## Verification & Testing
- The project must compile successfully.
- Calling `get_database_schema_erd` should execute the query and format it as a valid Mermaid string, returning quickly without overwhelming output size.
