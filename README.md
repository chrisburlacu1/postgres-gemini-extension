# postgres-mcp-server

A Model Context Protocol (MCP) server that allows AI agents to interact with PostgreSQL databases. This extension provides tools for executing queries, inspecting schemas, and analyzing database performance.

## Features

- **Schema Discovery**: Search for tables/columns, list databases, schemas, tables, views, and describe table structures with multi-schema support.
- **Connection Health**: Dedicated tool for verifying connectivity and user permissions.
- **Performance Analysis**: Get row counts, storage size, indexes, constraints, and explain query execution plans.
- **TTL Caching**: In-memory structural metadata caching (5-minute TTL) for lightning-fast lookups.
- **ERD Generation**: Generates Mermaid-compatible Entity Relationship Diagrams of the database schema.
- **Security**: Built-in protection against destructive operations (DROP, DELETE, TRUNCATE, ALTER, etc.).
- **Best Practices**: Follows modern MCP server design patterns, including tool prefixing, detailed descriptions, and response formatting options.

## Tools

All tools are prefixed with `postgres_` to avoid conflicts in multi-server environments.

### Data Exploration Tools

- `postgres_preview_table(table_name, schema?, limit?)`: Quickly fetches a sample of rows from a specific table to understand its data shape without writing a manual SELECT query.
- `postgres_global_search(search_term, schema?)`: Searches across all character-based columns (VARCHAR, TEXT) in all tables for a specific string value. Extremely useful for finding where an email, ID, or name is used across the entire database.

### Query Tools

- `postgres_execute_query(sql)`: Executes a non-destructive SQL query.

### Schema Tools

- `postgres_list_databases()`: Lists all non-template databases.
- `postgres_list_schemas()`: Lists all schemas in the current database.
- `postgres_list_tables(schema?)`: Lists all tables in a specific schema (defaults to `public`).
- `postgres_list_views(schema?)`: Lists all views in a specific schema (defaults to `public`).
- `postgres_describe_table(table_name, schema?)`: Shows columns, data types, and nullability.
- `postgres_search_schema(pattern, schema?)`: Fuzzy search for tables and columns across schemas.
- `postgres_get_table_stats(schema?)`: Shows row counts and disk usage for tables and indexes.
- `postgres_get_database_schema_erd(schema?, include_columns?)`: Generates a Mermaid ERD.
- `postgres_get_table_relationships(table_name, schema?)`: Finds immediate neighbors of a table via foreign keys.
- `postgres_find_join_path(source_table, target_table, schema?)`: Discovers how to connect two tables via foreign key graph.
- `postgres_clear_cache()`: Manually clears the in-memory metadata cache.

### Analysis Tools

- `postgres_show_indexes(table_name, schema?)`: Lists all indexes for a specific table.
- `postgres_show_constraints(table_name, schema?)`: Shows primary, foreign, and unique constraints.
- `postgres_explain_query(sql)`: Runs `EXPLAIN (FORMAT JSON)` to show the execution plan.

### Connection Health

- `postgres_check_connection()`: Verifies connectivity and reports current user permissions.

## Getting Started

### Prerequisites

- Node.js (v18+)
- A running PostgreSQL instance

### Installation

1. Clone this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

### Configuration

Set the `DATABASE_URL` environment variable to your Postgres connection string:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/dbname
```

## Custom Commands

This extension includes custom commands for high-level automated tasks:

- `/db:insights [table_name]`: Prompts the agent to analyze a specific table's schema and suggest 5 interesting analytical paths and SQL queries.

## License

Apache-2.0
