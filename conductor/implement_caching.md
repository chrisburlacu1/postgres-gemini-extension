# Plan: Implement Caching for Highly Cacheable Structural Metadata (COMPLETED)

## Objective
Improve the performance of the Postgres MCP server by caching highly cacheable structural metadata (tables, views, columns, indexes, constraints, ERD relationships). These elements rarely change during an active session, so caching them will significantly reduce load on the database and improve response times for the agent.

## Scope & Impact
The caching will target the following operations:
- Listing databases and schemas
- Listing tables and views per schema
- Describing table schemas (columns, data types)
- Showing indexes and constraints per table
- Retrieving relationships for ERD generation

We will implement a Time-To-Live (TTL) based caching mechanism to ensure that if the schema *does* change (e.g., via external migrations), the cache will eventually invalidate. We will also provide a tool to manually clear the cache.

## Key Files & Context
- `src/database.ts`: Will host the new TTL cache implementation.
- `src/tools/schema.ts`: Needs to integrate the cache for its listing and description tools, and introduce a `clear_cache` tool.
- `src/tools/analysis.ts`: Needs to integrate the cache for index and constraint lookups.

## Implementation Steps

### 1. Implement TTL Cache (`src/database.ts`)
- Replace the simple `Map` (`schemaCache`) with a custom TTL Cache class.
- The class should support `set(key, value, ttlMs)`, `get(key)`, and `clear()`.
- Default TTL should be set to 5 minutes (300,000 ms).

### 2. Update Schema Tools (`src/tools/schema.ts`)
- **`list_databases` & `list_schemas`**: Cache the results. (Note: we will also add `list_schemas` as previously discussed).
- **`list_tables` & `list_views`**: Update to accept an optional `schema` parameter (default 'public'). Cache the results using a key like `tables:{schema}` or `views:{schema}`.
- **`describe_table`**: Update to accept an optional `schema` parameter. Use cache key `describe:{schema}.{table_name}`.
- **`get_database_schema_erd`**: Update to accept an optional `schema` parameter. Cache the raw relationship data using key `erd_relationships:{schema}`.
- **`clear_cache` (New Tool)**: Add a tool that simply calls `cache.clear()` and returns a success message.

### 3. Update Analysis Tools (`src/tools/analysis.ts`)
- **`show_indexes`**: Update to accept an optional `schema` parameter. Cache results using key `indexes:{schema}.{table_name}`.
- **`show_constraints`**: Update to accept an optional `schema` parameter. Cache results using key `constraints:{schema}.{table_name}`.

## Verification & Testing
1. Start the MCP server.
2. Execute a cached tool (e.g., `list_tables`). Note the execution time.
3. Execute the same tool again. Verify the response is instantaneous (cache hit).
4. Run `clear_cache`.
5. Execute the tool again. Verify the response takes slightly longer (cache miss, fetched from DB).
6. Verify that transactional data tools (e.g., `execute_query`, `get_table_stats`) are not cached and always reflect real-time data.