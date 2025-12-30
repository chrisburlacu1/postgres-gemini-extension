import pg from "pg";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || "postgres://localhost:5432/postgres";

export const pool = new Pool({
  connectionString,
});

// Simple in-memory cache for schema lookups
export const schemaCache = new Map<string, any>();

export async function query(text: string, params?: any[]) {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error("query error", { text, error });
    throw error;
  }
}

export async function checkPermissions() {
  try {
    const res = await query(`
      SELECT 
          current_user,
          usesuper AS is_superuser,
          usecreatedb AS can_create_db
      FROM pg_user
      WHERE usename = current_user;
    `);
    return res.rows[0] || { current_user: 'unknown', is_superuser: false };
  } catch (error) {
    return { error: 'Could not verify permissions' };
  }
}

export async function checkConnection() {
  try {
    const client = await pool.connect();
    client.release();
    
    // Also fetch basic user info
    const permissions = await checkPermissions();
    
    return { 
      success: true,
      user: permissions
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      details: "Ensure DATABASE_URL is set correctly. Example: postgresql://user:password@localhost:5432/dbname",
    };
  }
}
