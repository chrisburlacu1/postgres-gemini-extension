# Plan: Refactor Cache Logic to Utils (COMPLETED)

## Objective
Extract the `TTLCache` class and `schemaCache` instance from `src/database.ts` into a dedicated utility file `src/utils/cache.ts` to follow better software design practices and keep the database configuration clean.

## Key Files & Context
- `src/utils/cache.ts` (New file): Will contain the cache logic.
- `src/database.ts`: Will have the cache logic removed.
- `src/tools/schema.ts`: Needs updated imports.
- `src/tools/analysis.ts`: Needs updated imports.

## Implementation Steps
1. Create `src/utils/cache.ts` and migrate the `TTLCache` class and `schemaCache` export into it.
2. Remove `TTLCache` and `schemaCache` from `src/database.ts`.
3. Update `src/tools/schema.ts` to import `schemaCache` from `../utils/cache.js`.
4. Update `src/tools/analysis.ts` to import `schemaCache` from `../utils/cache.js`.

## Verification
- Run `npm run build` to ensure there are no TypeScript compilation errors and the imports resolve correctly.