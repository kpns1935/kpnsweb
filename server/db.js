const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Check for Supabase / PostgreSQL configuration
const pgConnectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const isSupabaseConfigured = Boolean(pgConnectionString || (supabaseUrl && supabaseKey));

let pgPool = null;
let supabaseClient = null;
let sqliteDb = null;

if (pgConnectionString) {
  pgPool = new Pool({
    connectionString: pgConnectionString,
    ssl: { rejectUnauthorized: false }
  });
  console.log('✅ Supabase PostgreSQL Database Connected via Connection Pool!');
} else if (supabaseUrl && supabaseKey) {
  supabaseClient = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase Client Initialized!');
} else {
  // Local SQLite fallback
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
  sqliteDb = new sqlite3.Database(dbPath);
  console.log('ℹ️ Running with SQLite database at:', dbPath);
}

// Convert SQLite '?' placeholders to PostgreSQL '$1, $2...'
function convertSqliteToPg(sql) {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
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
        console.log('✅ Supabase PostgreSQL tables and default admin verified successfully!');
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Error initializing Supabase PostgreSQL tables:', err);
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

        const alterCols = [
          `ALTER TABLE members ADD COLUMN form_no TEXT`,
          `ALTER TABLE members ADD COLUMN father_name TEXT`,
          `ALTER TABLE members ADD COLUMN date_of_admission DATE`,
          `ALTER TABLE members ADD COLUMN aadhaar_number TEXT`,
          `ALTER TABLE members ADD COLUMN blood_group TEXT`,
          `ALTER TABLE members ADD COLUMN alternative_number TEXT`,
          `ALTER TABLE members ADD COLUMN dob DATE`,
          `ALTER TABLE members ADD COLUMN member_status TEXT DEFAULT 'Active'`
        ];
        alterCols.forEach(cmd => { sqliteDb.run(cmd, () => {}); });

        sqliteDb.run(`
          CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            contribution_amount REAL NOT NULL,
            event_date DATE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        sqliteDb.run(`
          CREATE TABLE IF NOT EXISTS event_dues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            member_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            paid_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'pending',
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
          )
        `);

        sqliteDb.run(`
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            receipt_no TEXT UNIQUE NOT NULL,
            member_id INTEGER,
            outside_person_name TEXT,
            outside_person_phone TEXT,
            event_id INTEGER,
            due_id INTEGER,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            payment_mode TEXT DEFAULT 'Cash',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (member_id) REFERENCES members(id),
            FOREIGN KEY (event_id) REFERENCES events(id),
            FOREIGN KEY (due_id) REFERENCES event_dues(id)
          )
        `);

        sqliteDb.run(`
          CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_no TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            event_id INTEGER,
            amount REAL NOT NULL,
            paid_to TEXT,
            payment_mode TEXT DEFAULT 'Cash',
            expense_date DATE NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id)
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

// Universal Query Interface
const db = {
  isSupabase: isSupabaseConfigured,
  supabase: supabaseClient,

  async queryAll(sql, params = []) {
    if (pgPool) {
      const pgSql = convertSqliteToPg(sql);
      const res = await pgPool.query(pgSql, params);
      return res.rows;
    }
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  async queryOne(sql, params = []) {
    if (pgPool) {
      const pgSql = convertSqliteToPg(sql);
      const res = await pgPool.query(pgSql, params);
      return res.rows[0] || null;
    }
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  },

  async execute(sql, params = []) {
    if (pgPool) {
      let pgSql = convertSqliteToPg(sql);
      const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
      if (isInsert && !pgSql.toUpperCase().includes('RETURNING')) {
        pgSql += ' RETURNING id';
      }
      const res = await pgPool.query(pgSql, params);
      const lastID = (isInsert && res.rows[0]) ? res.rows[0].id : null;
      return { lastID, changes: res.rowCount };
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
