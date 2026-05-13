const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');

const connectionString = "postgresql://PostgreSQL_toufen:!!Toufen@toufen.postgres.database.azure.com:5432/postgres?sslmode=require";

const pool = new Pool({ 
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    // Test raw SQL
    const tables = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename IN ('kc_cada', 'kc_pt')
      ORDER BY tablename
    `);
    console.log('Tables found via raw SQL:', tables.rows);
    
    // Test Drizzle
    const db = drizzle(pool);
    const result = await db.execute(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('kc_cada', 'kc_pt')`);
    console.log('Tables found via Drizzle:', result.rows);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

test();
