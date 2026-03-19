# Postgres MCP Server Extension for Gemini CLI

## Project Overview
This project is a Model Context Protocol (MCP) server that provides an interface for AI agents to interact with PostgreSQL databases. It is designed specifically to be used as an extension for the Gemini CLI. The server provides a suite of tools for executing queries, inspecting database schemas, analyzing performance, and verifying connection health.

**Key Technologies:**
- **Language:** TypeScript
- **Runtime:** Node.js
- **Database Driver:** `pg` (node-postgres)
- **MCP Framework:** `@modelcontextprotocol/sdk`
- **Validation:** `zod`

## Architecture & Structure
The project follows a modular structure, separating the core MCP server setup from the specific tool implementations and database connection logic.

- `src/index.ts`: The main entry point. It initializes the `McpServer`, registers all tools, and connects via the `StdioServerTransport`.
- `src/tools/`: Contains the implementations for the various MCP tools, categorized by function (e.g., `analysis.ts`, `connection.ts`, `query.ts`, `schema.ts`).
- `src/database.ts`: Handles the PostgreSQL connection pooling and provides core database interaction utilities.
- `src/utils/`: Includes formatting helpers (`format.ts`) and the TTL-based caching logic (`cache.ts`).
- `commands/db/insights.toml`: Defines a custom Gemini CLI command (`/db:insights`) that leverages the extension's tools.
- `gemini-extension.json`: The configuration file that tells the Gemini CLI how to load and run this extension.

## Building and Running

### Prerequisites
- Node.js (v18+)
- A running PostgreSQL database

### Setup & Build
1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the TypeScript code (compiles to the `dist/` directory):
   ```bash
   npm run build
   ```

### Execution
The server is intended to be run by the Gemini CLI as an MCP server. However, it can be started manually (e.g., for testing stdio communication):
```bash
npm run start
```
*Note: You must set the `DATABASE_URL` environment variable for the server to function correctly.*
Example: `DATABASE_URL=postgres://user:password@localhost:5432/dbname`

## Development Conventions
- **Language:** Strictly use TypeScript. Ensure all new code passes type checking.
- **Validation:** Use `zod` for validating inputs to MCP tools to ensure robust error handling.
- **Modularity:** When adding new tools, place them in the appropriate category within the `src/tools/` directory and ensure they are exported and registered in `src/tools/index.ts`.
- **Database Interaction:** Use connection pooling (via the `pg` library). Be extremely careful to prevent SQL injection vulnerabilities; use parameterized queries whenever accepting user input.
- **Error Handling:** Provide clear, actionable error messages back to the client if a query or operation fails.
- **Best Practices**: All tool names must be prefixed (e.g., `postgres_`), and each tool should include detailed descriptions and annotations (`readOnlyHint`, etc.).

## Key Features & Tools
The extension provides several tools categorized as follows (all prefixed with `postgres_`):
- **Query:** `execute_query`
- **Schema Discovery:** `list_databases`, `list_schemas`, `list_tables`, `list_views`, `describe_table`, `search_schema`, `get_database_schema_erd`, `clear_cache`
- **Performance/Analysis:** `get_table_stats`, `show_indexes`, `show_constraints`, `explain_query`
- **Connection Health:** `check_connection`

## Usage with Gemini CLI
To use this extension in the Gemini CLI, ensure the `gemini-extension.json` is correctly configured and that the `DATABASE_URL` environment variable is provided to the server instance.
