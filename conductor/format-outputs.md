# Format Outputs and Truncate Rows Plan

## Background & Motivation
Currently, the Postgres MCP server returns database query results and schema information as raw stringified JSON arrays. This wastes context window tokens on repeated JSON keys and is harder for the AI agent to parse. Furthermore, queries that return thousands of rows can overwhelm the agent's context window or crash the server.

## Proposed Solution
1. **Create Formatting Utilities**: Implement a utility function to convert arrays of database rows into token-efficient Markdown tables.
2. **Implement Safe Truncation**: Implement a wrapper function that slices the result set to a safe maximum (e.g., 50 rows) and appends a truncation warning if the original result set was larger.
3. **Refactor Tool Responses**: Update all existing tools to utilize these utilities instead of returning raw JSON.

## Scope & Impact
- **New File**: `src/utils/format.ts` - Will contain `formatToMarkdownTable` and `formatRows`.
- **Modified**: `src/tools/query.ts` - Update `execute_query` to format and truncate results.
- **Modified**: `src/tools/schema.ts` - Update all schema discovery tools to return formatted Markdown.
- **Modified**: `src/tools/analysis.ts` - Update all analysis tools to return formatted Markdown.

## Implementation Steps
1. **Create `src/utils/format.ts`**:
   - Write `formatToMarkdownTable(rows: any[]): string` to convert objects to markdown.
   - Write `formatRows(rows: any[], maxRows = 50): string` to handle truncation logic and call the table formatter.
2. **Refactor `src/tools/query.ts`**:
   - Import `formatRows` from `../utils/format.js`.
   - Replace `JSON.stringify(result.rows)` with `formatRows(result.rows)`.
3. **Refactor `src/tools/schema.ts`**:
   - Import `formatToMarkdownTable` and/or `formatRows`.
   - Apply formatting to the outputs of `list_tables`, `describe_table`, `search_schema`, `get_table_stats`, `list_databases`, and `list_views`.
4. **Refactor `src/tools/analysis.ts`**:
   - Import formatting utilities.
   - Apply formatting to the outputs of `show_indexes`, `show_constraints`, and `explain_query`.
5. **Build and Type-Check**:
   - Run `npm run build` to ensure the TypeScript compiler passes and imports (with `.js` extensions for ESM) are correct.

## Verification & Testing
- The project must compile successfully.
- Running a simulated query or tool should output a Markdown table instead of JSON.
- A query returning >50 rows should visibly include the `*(Note: Result truncated. Showing 50 of X rows)*` warning.
