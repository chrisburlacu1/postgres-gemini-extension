# Plan: Deep Entity Investigation Tool

## Background & Motivation
When an AI agent is tasked with debugging a specific entity (e.g., a "User" or an "Order"), it often needs to see all associated data. Currently, the agent must manually find the primary key, query `information_schema` to find foreign keys pointing to that table, and then execute multiple subsequent `SELECT` queries to retrieve the child records. This is highly inefficient and consumes many conversational turns.

## Proposed Solution
Introduce a macro-tool that performs this entire workflow in a single step, giving the agent a complete "360-degree view" of a database record.

- **`postgres_find_related_records`**: A tool that takes a `table_name` and a `primary_key_value`. It will automatically discover the primary key column, find all related tables via foreign key constraints, and query those tables to return all associated data.

## Scope & Impact
- **New/Modified File**: `src/tools/exploration.ts` (or `analysis.ts`).
- **Modified File**: `src/tools/index.ts` (if creating a new module).

## Implementation Steps
1. Implement the tool `postgres_find_related_records`.
2. **Step 1: Identify Primary Key**: Query `information_schema` to find the primary key column name for the provided `table_name`.
3. **Step 2: Fetch Base Record**: Execute `SELECT * FROM table WHERE pk_column = $1` to get the core entity.
4. **Step 3: Discover Relationships**: Use the existing ERD relationship logic (or a modified query) to find all `target_table` and `target_column` definitions where the `source_table` is the provided table and the `source_column` is its primary key.
5. **Step 4: Fetch Child Records**: For each related table discovered, execute `SELECT * FROM target_table WHERE target_column = $1 LIMIT 50`.
6. Combine the base record and all related child records into a single, cohesive JSON/Markdown response.

## Verification & Testing
- Compile the project successfully.
- Execute the tool against a known table with foreign key relationships (e.g., a `users` table).
- Verify the output correctly includes the base user data, as well as associated data from related tables (e.g., `orders`, `sessions`).