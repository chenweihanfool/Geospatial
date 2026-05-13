import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Default Azure PostgreSQL connection
let defaultConnectionString = "postgresql://PostgreSQL_toufen:!!Toufen@toufen.postgres.database.azure.com:5432/postgres?sslmode=require";

// Current database connection info
let currentDbInfo = {
  host: "toufen.postgres.database.azure.com",
  port: 5432,
  database: "postgres",
  username: "PostgreSQL_toufen",
  table: "public.n_kc_ctl",
  connectionString: defaultConnectionString
};

// Create initial pool
console.log('🔵 Initializing database connection to:', defaultConnectionString.split('@')[1]?.split('?')[0]);
export let pool = new Pool({ 
  connectionString: defaultConnectionString,
  ssl: {
    rejectUnauthorized: false // Required for Azure PostgreSQL
  }
});

export let db = drizzle(pool, { 
  schema,
  logger: process.env.NODE_ENV === 'development'
});

// Verify connection and create tables if needed
pool.query('SELECT current_database(), current_user').then(result => {
  console.log('✅ Connected to database:', result.rows[0]);
  
  // Create cadastral tables if they don't exist
  return pool.query(`
    CREATE TABLE IF NOT EXISTS public.kc_pt (
      id SERIAL PRIMARY KEY,
      point_no TEXT NOT NULL UNIQUE,
      y_coord NUMERIC(15, 3) NOT NULL,
      x_coord NUMERIC(15, 3) NOT NULL,
      geom GEOMETRY(POINT, 3826),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.kc_cada (
      id SERIAL PRIMARY KEY,
      lot_no TEXT NOT NULL,
      sub_no TEXT NOT NULL,
      section_code TEXT,
      area NUMERIC(15, 3),
      grade TEXT,
      attributes TEXT,
      center_y NUMERIC(15, 3),
      center_x NUMERIC(15, 3),
      zone TEXT,
      point_count INTEGER,
      boundary_points TEXT,
      geom GEOMETRY(POLYGON, 3826),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}).then(() => {
  console.log('✅ Cadastral tables ensured');
}).catch(err => {
  console.error('❌ Database setup failed:', err.message);
});

// Interface for database connection info
export interface DatabaseConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  table: string;
}

// Function to switch database connection
export async function switchDatabase(dbInfo: DatabaseConnection) {
  try {
    // Close existing pool
    await pool.end();
    
    // Create new connection string
    const newConnectionString = `postgresql://${dbInfo.username}:${dbInfo.password}@${dbInfo.host}:${dbInfo.port}/${dbInfo.database}?sslmode=require`;
    
    // Create new pool
    pool = new Pool({
      connectionString: newConnectionString,
      ssl: {
        rejectUnauthorized: false
      }
    });
    
    // Create new drizzle instance
    db = drizzle(pool, { schema });
    
    // Update current database info
    currentDbInfo = {
      host: dbInfo.host,
      port: dbInfo.port,
      database: dbInfo.database,
      username: dbInfo.username,
      table: dbInfo.table,
      connectionString: newConnectionString
    };
    
    // Test connection
    const testQuery = await pool.query('SELECT 1');
    console.log('Database switched successfully:', dbInfo.host);
    
    return { success: true, message: '資料庫切換成功' };
  } catch (error) {
    console.error('Database switch failed:', error);
    
    // Fallback to default connection
    pool = new Pool({ 
      connectionString: defaultConnectionString,
      ssl: {
        rejectUnauthorized: false
      }
    });
    db = drizzle(pool, { schema });
    
    // Reset to default info
    currentDbInfo = {
      host: "toufen.postgres.database.azure.com",
      port: 5432,
      database: "postgres",
      username: "PostgreSQL_toufen",
      table: "public.n_kc_ctl",
      connectionString: defaultConnectionString
    };
    
    return { success: false, message: '資料庫切換失敗，已恢復預設連線', error: error instanceof Error ? error.message : String(error) };
  }
}

// Function to get current database info
export function getCurrentDbInfo() {
  return currentDbInfo;
}

// Function to switch only the target table (no reconnection needed)
export function setCurrentTable(table: string) {
  currentDbInfo = { ...currentDbInfo, table };
}