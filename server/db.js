require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const pgConnectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mumigktobshxonccrsxm.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_3g4zniHPGQF2Kf9TjJzmlw_vTSb1dLM';

let pgPool = null;
let supabaseClient = null;
let sqliteDb = null;

if (pgConnectionString && !pgConnectionString.includes('[YOUR-PASSWORD]')) {
  pgPool = new Pool({
    connectionString: pgConnectionString,
    ssl: { rejectUnauthorized: false }
  });
  console.log('✅ Supabase PostgreSQL Pool Connected!');
} else if (supabaseUrl && supabaseKey) {
  supabaseClient = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase Client Connected (mumigktobshxonccrsxm)! Storing all data in Supabase.');
} else {
  // Local SQLite fallback ONLY if no Supabase parameters are supplied
  let dbPath = path.join(__dirname, '..', 'kpns.db');
  if (process.env.VERCEL || process.env.NOW_REGION) {
    const tmpPath = path.join('/tmp', 'kpns.db');
    if (fs.existsSync(dbPath) && !fs.existsSync(tmpPath)) {
      try {
        fs.copyFileSync(dbPath, tmpPath);
      } catch (e) {
        console.error('Error copying db file to /tmp:', e);
      }
    }
    dbPath = tmpPath;
  }
  const sqlite3 = require('sqlite3').verbose();
  sqliteDb = new sqlite3.Database(dbPath);
  console.log('ℹ️ Running with local SQLite database at:', dbPath);
}

// Convert SQLite '?' placeholders to PostgreSQL '$1, $2...'
function convertSqliteToPg(sql) {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

// Extract table name from SQL
function getTableName(sql) {
  const cleanSql = sql.trim();
  const fromMatch = cleanSql.match(/from\s+([a-z0-9_]+)/i);
  const intoMatch = cleanSql.match(/into\s+([a-z0-9_]+)/i);
  const updateMatch = cleanSql.match(/update\s+([a-z0-9_]+)/i);
  if (fromMatch) return fromMatch[1];
  if (intoMatch) return intoMatch[1];
  if (updateMatch) return updateMatch[1];
  return 'members';
}

// Execute query via Supabase REST API Client
async function runSupabaseRest(sql, params = [], type = 'all') {
  const cleanSql = sql.trim();
  const lowerSql = cleanSql.toLowerCase();
  const table = getTableName(cleanSql);

  // 1. SELECT COUNT(*)
  if (lowerSql.includes('count(*)')) {
    const { count, error } = await supabaseClient.from(table).select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    const result = [{ count: count || 0 }];
    return type === 'one' ? result[0] : result;
  }

  // 2. SELECT
  if (lowerSql.startsWith('select')) {
    let query = supabaseClient.from(table).select('*');

    // Parse simple equality WHERE clauses (e.g. WHERE email = ?, WHERE id = ?, etc.)
    const whereMatch = cleanSql.match(/where\s+([a-z0-9_]+)\s*=\s*\?/i);
    if (whereMatch && params.length > 0) {
      const col = whereMatch[1];
      query = query.eq(col, params[0]);
    }

    // ORDER BY
    if (lowerSql.includes('order by id desc')) {
      query = query.order('id', { ascending: false });
    } else if (lowerSql.includes('order by id asc')) {
      query = query.order('id', { ascending: true });
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    if (type === 'one') {
      return (data && data.length > 0) ? data[0] : null;
    }
    return data || [];
  }

  // 3. INSERT
  if (lowerSql.startsWith('insert')) {
    const colsMatch = cleanSql.match(/\(([^)]+)\)\s*values/i);
    if (colsMatch && params.length > 0) {
      const cols = colsMatch[1].split(',').map(c => c.trim());
      const rowObj = {};
      cols.forEach((col, idx) => {
        rowObj[col] = params[idx];
      });
      const { data, error } = await supabaseClient.from(table).insert([rowObj]).select();
      if (error) throw new Error(error.message);
      const inserted = (data && data[0]) ? data[0] : {};
      return { lastID: inserted.id || null, changes: 1 };
    }
  }

  // 4. UPDATE
  if (lowerSql.startsWith('update')) {
    const whereIdMatch = cleanSql.match(/where\s+([a-z0-9_]+)\s*=\s*\?/i);
    if (whereIdMatch && params.length > 0) {
      const whereCol = whereIdMatch[1];
      const whereVal = params[params.length - 1];

      const setMatch = cleanSql.match(/set\s+(.+?)\s+where/i);
      if (setMatch) {
        const setClause = setMatch[1];
        const setCols = setClause.split(',').map(c => c.split('=')[0].trim());
        const updateObj = {};
        setCols.forEach((col, idx) => {
          updateObj[col] = params[idx];
        });
        const { data, error } = await supabaseClient.from(table).update(updateObj).eq(whereCol, whereVal).select();
        if (error) throw new Error(error.message);
        return { changes: data ? data.length : 1 };
      }
    }
  }

  // 5. DELETE
  if (lowerSql.startsWith('delete')) {
    const whereIdMatch = cleanSql.match(/where\s+([a-z0-9_]+)\s*=\s*\?/i);
    if (whereIdMatch && params.length > 0) {
      const whereCol = whereIdMatch[1];
      const whereVal = params[0];
      const { data, error } = await supabaseClient.from(table).delete().eq(whereCol, whereVal).select();
      if (error) throw new Error(error.message);
      return { changes: data ? data.length : 1 };
    }
  }

  return [];
}

async function initDb() {
  if (pgPool) {
    try {
      const client = await pgPool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS members (
            id SERIAL PRIMARY KEY,
            form_no TEXT,
            member_code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            father_name TEXT,
            date_of_admission DATE,
            phone TEXT NOT NULL,
            email TEXT,
            aadhaar_number TEXT,
            blood_group TEXT,
            alternative_number TEXT,
            dob DATE,
            member_status TEXT DEFAULT 'Active',
            address TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            contribution_amount NUMERIC(12,2) NOT NULL,
            event_date DATE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS event_dues (
            id SERIAL PRIMARY KEY,
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
            amount NUMERIC(12,2) NOT NULL,
            paid_amount NUMERIC(12,2) DEFAULT 0,
            status TEXT DEFAULT 'pending'
          );

          CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            receipt_no TEXT UNIQUE NOT NULL,
            member_id INTEGER REFERENCES members(id),
            outside_person_name TEXT,
            outside_person_phone TEXT,
            event_id INTEGER REFERENCES events(id),
            due_id INTEGER REFERENCES event_dues(id),
            type TEXT NOT NULL,
            amount NUMERIC(12,2) NOT NULL,
            payment_mode TEXT DEFAULT 'Cash',
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS expenses (
            id SERIAL PRIMARY KEY,
            voucher_no TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            event_id INTEGER REFERENCES events(id),
            amount NUMERIC(12,2) NOT NULL,
            paid_to TEXT,
            payment_mode TEXT DEFAULT 'Cash',
            expense_date DATE NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );

          INSERT INTO users (name, email, password, role)
          VALUES ('KPNS Admin', 'kpnsclub@gmail.com', 'admin123', 'admin')
          ON CONFLICT (email) 
          DO UPDATE SET name = 'KPNS Admin', password = 'admin123', role = 'admin';
        `);
        console.log('✅ Supabase PostgreSQL tables and default admin verified!');
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Error initializing Supabase PostgreSQL tables:', err);
    }
  } else if (supabaseClient) {
    try {
      // Seed default admin via Supabase REST API
      const { data } = await supabaseClient.from('users').select('*').eq('email', 'kpnsclub@gmail.com');
      if (!data || data.length === 0) {
        await supabaseClient.from('users').insert([
          { name: 'KPNS Admin', email: 'kpnsclub@gmail.com', password: 'admin123', role: 'admin' }
        ]);
        console.log('✅ Default admin seeded in Supabase: kpnsclub@gmail.com / admin123');
      } else {
        console.log('✅ Default admin verified in Supabase: kpnsclub@gmail.com / admin123');
      }
    } catch (err) {
      console.error('Supabase init check notice:', err.message);
    }
  } else if (sqliteDb) {
    return new Promise((resolve, reject) => {
      sqliteDb.serialize(() => {
        sqliteDb.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        sqliteDb.run(`
          CREATE TABLE IF NOT EXISTS members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            form_no TEXT,
            member_code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            father_name TEXT,
            date_of_admission DATE,
            phone TEXT NOT NULL,
            email TEXT,
            aadhaar_number TEXT,
            blood_group TEXT,
            alternative_number TEXT,
            dob DATE,
            member_status TEXT DEFAULT 'Active',
            address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        sqliteDb.get(`SELECT * FROM users WHERE email = 'kpnsclub@gmail.com'`, [], (err, row) => {
          if (err) return reject(err);
          if (!row) {
            sqliteDb.run(
              `INSERT INTO users (name, email, password, role) VALUES ('KPNS Admin', 'kpnsclub@gmail.com', 'admin123', 'admin')`
            );
          } else {
            sqliteDb.run(
              `UPDATE users SET name = 'KPNS Admin', password = 'admin123', role = 'admin' WHERE email = 'kpnsclub@gmail.com'`
            );
          }
        });

        resolve(sqliteDb);
      });
    });
  }
}

// Sanitize parameters for PostgreSQL compatibility (converts DD/MM/YYYY to YYYY-MM-DD and empty string dates to null)
function sanitizeParam(val) {
  if (typeof val !== 'string') return val;
  const str = val.trim();
  if (!str) return null; // empty strings -> null (prevents invalid syntax for date/numeric columns in PG)
  
  // DD/MM/YYYY or DD-MM-YYYY -> YYYY-MM-DD
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  return str;
}

// Universal Query Interface
const db = {
  isSupabase: Boolean(pgPool || supabaseClient),
  supabase: supabaseClient,

  async queryAll(sql, params = []) {
    const cleanParams = params.map(sanitizeParam);
    if (pgPool) {
      const pgSql = convertSqliteToPg(sql);
      const res = await pgPool.query(pgSql, cleanParams);
      return res.rows;
    } else if (supabaseClient) {
      return runSupabaseRest(sql, cleanParams, 'all');
    }
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  async queryOne(sql, params = []) {
    const cleanParams = params.map(sanitizeParam);
    if (pgPool) {
      const pgSql = convertSqliteToPg(sql);
      const res = await pgPool.query(pgSql, cleanParams);
      return res.rows[0] || null;
    } else if (supabaseClient) {
      return runSupabaseRest(sql, cleanParams, 'one');
    }
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  },

  async execute(sql, params = []) {
    const cleanParams = params.map(sanitizeParam);
    if (pgPool) {
      let pgSql = convertSqliteToPg(sql);
      const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
      if (isInsert && !pgSql.toUpperCase().includes('RETURNING')) {
        pgSql += ' RETURNING id';
      }
      const res = await pgPool.query(pgSql, cleanParams);
      const lastID = (isInsert && res.rows[0]) ? res.rows[0].id : null;
      return { lastID, changes: res.rowCount };
    } else if (supabaseClient) {
      return runSupabaseRest(sql, cleanParams, 'execute');
    }
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
};

initDb();

module.exports = db;
