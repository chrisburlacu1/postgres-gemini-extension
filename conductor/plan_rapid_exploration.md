# Plan: Rapid Data Exploration Tools (COMPLETED)

## Background & Motivation
Currently, for an AI agent to see what data looks like, it must manually write a `SELECT` statement and execute it via `postgres_execute_query`. Furthermore, if the agent needs to find a specific string (like an email) but doesn't know which table it lives in, it requires writing complex, error-prone dynamic SQL. Adding dedicated exploration tools will save the agent turns and reduce syntax errors.

## Proposed Solution
Introduce two new highly-targeted tools to the `src/tools/query.ts` or a new `src/tools/exploration.ts` module:

1. **`postgres_preview_table`**: A convenience tool that takes a `table_name`, optional `schema`, and optional `limit` to instantly fetch a sample of rows without requiring the agent to formulate SQL.
2. **`postgres_global_search`**: A powerful diagnostic tool that searches across all `VARCHAR` and `TEXT` columns in the database for a specific string value, returning the table names, column names, and row data where the string was found.

## Scope & Impact
- **New File**: `src/tools/exploration.ts` (Recommended to keep `query.ts` focused on raw execution).
- **Modified File**: `src/index.ts` (To register the new tools).
- **Modified File**: `src/tools/index.ts` (To export the new registration function).

## Implementation Steps
1. Create `src/tools/exploration.ts`.
2. Implement `postgres_preview_table`:
   - Safely construct a query: `SELECT * FROM "schema"."table_name" LIMIT $1`. (Ensure schema/table identifiers are properly quoted to prevent SQL injection, using `pg-format` or manual escaping).
3. Implement `postgres_global_search`:
   - Query `information_schema.columns` to find all columns of type `character varying`, `text`, or `char`.
   - Iterate through the discovered columns (or construct a large `UNION` query) to search for `%pattern%` using `ILIKE`.
   - Return structured results detailing the table, column, and the matching row.
4. Update `src/tools/index.ts` and `src/index.ts` to register the new `exploration` tools.

## Verification & Testing
- Compile the project successfully.
- Verify `postgres_preview_table` returns the requested number of rows and handles non-existent tables gracefully.
- Verify `postgres_global_search` correctly identifies a known string across multiple tables without throwing syntax errors.