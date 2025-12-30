# postgres-gemini-extension

A Model Context Protocol (MCP) server that allows AI agents to interact with PostgreSQL databases. This extension provides tools for executing queries, inspecting schema, and analyzing database performance.

## Features

- **Schema Discovery**: Search for tables/columns, list databases, tables, views, and describe table structures.
- **Connection Health**: Dedicated tool for verifying connectivity and user permissions.
- **Performance Analysis**: Get row counts, storage size, and explain query execution plans.
- **Efficient Caching**: In-memory schema caching for faster metadata lookups.
- **Connection Pooling**: Efficient connection management using `pg.Pool`.
- **Modular Design**: Clean and maintainable TypeScript codebase.

## Tools

### Query Tools

- `execute_query(sql)`: Executes a SQL query and returns the results as JSON.

### Schema Tools

- `check_connection()`: Verifies connectivity and reports current user permissions.
- `list_databases()`: Lists all non-template databases on the server.
- `list_tables()`: Lists all tables in the `public` schema.
- `list_views()`: Lists all views in the `public` schema.
- `describe_table(table_name)`: Shows columns, data types, and nullability (with caching).
- `search_schema(pattern)`: Fuzzy search for tables and columns matching a keyword.
- `get_table_stats()`: Shows row counts and disk usage for tables and indexes.

### Analysis Tools

- `show_indexes(table_name)`: Lists all indexes for a specific table.
- `show_constraints(table_name)`: Shows primary keys, foreign keys, and unique constraints.
- `explain_query(sql)`: Runs `EXPLAIN (FORMAT JSON)` on a query to show the execution plan.

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

### Usage with Gemini CLI

This project is designed to be used as a Gemini CLI extension. Add it to your `gemini-extension.json` or link it directly.

```json
{
  "name": "postgres-extension",
  "mcpServers": {
    "postgresServer": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "DATABASE_URL": "your-connection-string"
      }
    }
  }
}
```

## Custom Commands

This extension includes custom commands for high-level automated tasks:

- `/db:insights [table_name]`: Prompts the agent to analyze a specific table's schema and suggest 5 interesting analytical paths and SQL queries.

## License

Apache-2.0
