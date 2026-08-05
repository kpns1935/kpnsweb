require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const pgConnectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mumigktobshxonccrsxm.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_3g4zniHPGQF2Kf9TjJzmlw_vTSb1dLM';

let pgPool = null;
let supabaseClient = null;

if (pgConnectionString && !pgConnectionString.includes('[YOUR-PASSWORD]')) {
  pgPool = new Pool({
    connectionString: pgConnectionString,
    ssl: { rejectUnauthorized: false }
  });
  console.log('✅ Supabase PostgreSQL Pool Connected!');
} else if (supabaseUrl && supabaseKey) {
  supabaseClient = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase Client Connected (mumigktobshxonccrsxm)! Storing all data exclusively in Supabase.');
} else {
  throw new Error('❌ Supabase configuration missing! Please provide SUPABASE_URL and SUPABASE_KEY.');
}

// Convert SQLite '?' placeholders to PostgreSQL '$1, $2...'
function convertSqliteToPg(sql) {
  let converted = sql.replace(/date\(([^)]+)\)/gi, (match, inner) => {
    return `CAST(${inner} AS DATE)`;
  });
  let paramIndex = 1;
  converted = converted.replace(/\?/g, () => `$${paramIndex++}`);
  return converted;
}

// Extract primary table name from SQL
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

// Apply generic SQL WHERE clause parameters to Supabase query builder
function applyWhereFilters(query, sql, params) {
  if (!params || params.length === 0) return query;

  // Clean SQL string by stripping wrapper functions like LOWER(), UPPER(), date(), and table prefixes
  let cleanSql = sql.replace(/LOWER\(([^)]+)\)/gi, '$1')
                    .replace(/UPPER\(([^)]+)\)/gi, '$1')
                    .replace(/date\(([^)]+)\)/gi, '$1');

  const whereSplit = cleanSql.split(/where\s+/i);
  if (whereSplit.length < 2) return query;

  const whereBody = whereSplit[1].split(/order by|group by|limit/i)[0];

  // Match condition clauses (e.g. col = ?, col != ?, col >= ?, col <= ?, col LIKE ?, col IN (?, ?))
  const condRegex = /([a-z0-9_\.]+)\s*(=|!=|>=|<=|>|<|like|ilike|in\s*\([^)]*\))\s*(\?|\([^)]*\))/gi;
  let match;
  let paramIdx = 0;

  while ((match = condRegex.exec(whereBody)) !== null) {
    let rawCol = match[1].trim();
    let col = rawCol.includes('.') ? rawCol.split('.')[1] : rawCol;
    const op = match[2].trim().toLowerCase();

    if (op === '=') {
      if (paramIdx < params.length) {
        query = query.eq(col, params[paramIdx]);
        paramIdx++;
      }
    } else if (op === '!=') {
      if (paramIdx < params.length) {
        query = query.neq(col, params[paramIdx]);
        paramIdx++;
      }
    } else if (op === '>=') {
      if (paramIdx < params.length) {
        query = query.gte(col, params[paramIdx]);
        paramIdx++;
      }
    } else if (op === '<=') {
      if (paramIdx < params.length) {
        query = query.lte(col, params[paramIdx]);
        paramIdx++;
      }
    } else if (op === '>') {
      if (paramIdx < params.length) {
        query = query.gt(col, params[paramIdx]);
        paramIdx++;
      }
    } else if (op === '<') {
      if (paramIdx < params.length) {
        query = query.lt(col, params[paramIdx]);
        paramIdx++;
      }
    } else if (op === 'like' || op === 'ilike') {
      if (paramIdx < params.length) {
        query = query.ilike(col, params[paramIdx]);
        paramIdx++;
      }
    } else if (op.startsWith('in')) {
      const matchClause = match[0];
      const qCount = (matchClause.match(/\?/g) || []).length;
      if (qCount > 0 && paramIdx < params.length) {
        const sliceVals = params.slice(paramIdx, paramIdx + qCount);
        query = query.in(col, sliceVals);
        paramIdx += qCount;
      }
    }
  }

  return query;
}

// Execute query via Supabase REST API Client
async function runSupabaseRest(sql, params = [], type = 'all') {
  if (!supabaseClient) {
    throw new Error('Supabase client is not connected');
  }

  const cleanSql = sql.trim();
  const lowerSql = cleanSql.toLowerCase();
  const table = getTableName(cleanSql);

  // 1. SELECT COUNT(*)
  if (lowerSql.includes('count(*)')) {
    let query = supabaseClient.from(table).select('*', { count: 'exact', head: true });
    query = applyWhereFilters(query, cleanSql, params);

    const { count, error } = await query;
    if (error) throw new Error(error.message);
    const result = [{ count: count || 0 }];
    return type === 'one' ? result[0] : result;
  }

  // 2. SELECT SUM(...) / COALESCE(SUM(...))
  if (lowerSql.includes('sum(')) {
    let query = supabaseClient.from(table).select('*');
    query = applyWhereFilters(query, cleanSql, params);

    if (lowerSql.includes("type in ('member_donation', 'outside_donation')")) {
      query = query.in('type', ['member_donation', 'outside_donation']);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let total = 0;
    if (data && data.length > 0) {
      if (lowerSql.includes('amount - paid_amount')) {
        total = data.reduce((acc, row) => acc + ((parseFloat(row.amount) || 0) - (parseFloat(row.paid_amount) || 0)), 0);
      } else if (lowerSql.includes('paid_amount')) {
        total = data.reduce((acc, row) => acc + (parseFloat(row.paid_amount) || 0), 0);
      } else {
        total = data.reduce((acc, row) => acc + (parseFloat(row.amount) || 0), 0);
      }
    }

    const result = [{ total }];
    return type === 'one' ? result[0] : result;
  }

  // 3. SELECT (Standard / Joined queries)
  if (lowerSql.startsWith('select')) {
    let selectFields = '*';
    if (table === 'transactions') {
      selectFields = '*, members(name, member_code, phone), events(title)';
    } else if (table === 'expenses') {
      selectFields = '*, events(title)';
    } else if (table === 'event_dues') {
      selectFields = '*, members(name, member_code, phone), events(title, contribution_amount, event_date)';
    }

    let query = supabaseClient.from(table).select(selectFields);

    // Apply generic WHERE filters
    query = applyWhereFilters(query, cleanSql, params);

    // ORDER BY
    if (lowerSql.includes('order by')) {
      if (lowerSql.includes('id desc')) {
        query = query.order('id', { ascending: false });
      } else if (lowerSql.includes('id asc')) {
        query = query.order('id', { ascending: true });
      } else if (lowerSql.includes('created_at desc')) {
        query = query.order('created_at', { ascending: false });
      } else if (lowerSql.includes('created_at asc')) {
        query = query.order('created_at', { ascending: true });
      } else if (lowerSql.includes('expense_date desc')) {
        query = query.order('expense_date', { ascending: false });
      } else if (lowerSql.includes('expense_date asc')) {
        query = query.order('expense_date', { ascending: true });
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let rows = (data || []).map(item => {
      const row = { ...item };
      if (item.members) {
        row.member_name = item.members.name;
        row.member_code = item.members.member_code;
        row.member_phone = item.members.phone;
      }
      if (item.events) {
        row.event_title = item.events.title;
        row.contribution_amount = item.events.contribution_amount;
        row.event_date = item.events.event_date;
      }
      return row;
    });

    if (type === 'one') {
      return (rows && rows.length > 0) ? rows[0] : null;
    }
    return rows;
  }

  // 4. INSERT
  if (lowerSql.startsWith('insert')) {
    const colsMatch = cleanSql.match(/\(([^)]+)\)\s*values/i);
    if (colsMatch && params.length > 0) {
      const cols = colsMatch[1].split(',').map(c => c.trim());
      const rowObj = {};
      cols.forEach((col, idx) => {
        rowObj[col] = params[idx];
      });
      let { data, error } = await supabaseClient.from(table).insert([rowObj]).select();
      if (error && (error.message.includes('Could not find the') || error.code === 'PGRST204')) {
        const missingColMatch = error.message.match(/Could not find the '([^']+)' column/i);
        if (missingColMatch) {
          const missingCol = missingColMatch[1];
          delete rowObj[missingCol];
          const retry = await supabaseClient.from(table).insert([rowObj]).select();
          data = retry.data;
          error = retry.error;
        }
      }
      if (error) throw new Error(error.message);
      const inserted = (data && data[0]) ? data[0] : {};
      return { lastID: inserted.id || null, changes: 1 };
    }
  }

  // 5. UPDATE
  if (lowerSql.startsWith('update')) {
    const setMatch = cleanSql.match(/set\s+(.+?)\s+where/i);
    const whereMatch = cleanSql.match(/where\s+([a-z0-9_\.]+)\s*=\s*\?/i);
    if (setMatch && whereMatch && params.length > 0) {
      const setClause = setMatch[1];
      const setCols = setClause.split(',').map(c => c.split('=')[0].trim());
      const updateObj = {};
      setCols.forEach((col, idx) => {
        updateObj[col] = params[idx];
      });

      let rawCol = whereMatch[1];
      let whereCol = rawCol.includes('.') ? rawCol.split('.')[1] : rawCol;
      const whereVal = params[params.length - 1];

      let { data, error } = await supabaseClient.from(table).update(updateObj).eq(whereCol, whereVal).select();
      if (error && (error.message.includes('Could not find the') || error.code === 'PGRST204')) {
        const missingColMatch = error.message.match(/Could not find the '([^']+)' column/i);
        if (missingColMatch) {
          const missingCol = missingColMatch[1];
          delete updateObj[missingCol];
          const retry = await supabaseClient.from(table).update(updateObj).eq(whereCol, whereVal).select();
          data = retry.data;
          error = retry.error;
        }
      }
      if (error) throw new Error(error.message);
      return { changes: data ? data.length : 1 };
    }
  }

  // 6. DELETE
  if (lowerSql.startsWith('delete')) {
    let query = supabaseClient.from(table).delete();
    query = applyWhereFilters(query, cleanSql, params);

    const { data, error } = await query.select();
    if (error) throw new Error(error.message);
    return { changes: data ? data.length : 1 };
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
            contribution_amount NUMERIC(12,2) DEFAULT 0,
            contribution_type TEXT DEFAULT 'fixed',
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
  }
}

// Sanitize parameters for PostgreSQL compatibility (converts DD/MM/YYYY to YYYY-MM-DD and dashes/empty strings to null)
function sanitizeParam(val) {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return val;
  const str = val.trim();
  if (!str || str === '-' || str === '--' || str === 'N/A' || str === 'n/a' || str === 'null' || str === 'undefined') {
    return null;
  }
  
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  return str;
}

// Universal Query Interface (100% Supabase Backend)
const db = {
  isSupabase: true,
  supabase: supabaseClient,

  async queryAll(sql, params = []) {
    const cleanParams = params.map(sanitizeParam);
    if (pgPool) {
      const pgSql = convertSqliteToPg(sql);
      const res = await pgPool.query(pgSql, cleanParams);
      return res.rows;
    }
    return runSupabaseRest(sql, cleanParams, 'all');
  },

  async queryOne(sql, params = []) {
    const cleanParams = params.map(sanitizeParam);
    if (pgPool) {
      const pgSql = convertSqliteToPg(sql);
      const res = await pgPool.query(pgSql, cleanParams);
      return res.rows[0] || null;
    }
    return runSupabaseRest(sql, cleanParams, 'one');
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
    }
    return runSupabaseRest(sql, cleanParams, 'execute');
  }
};

initDb();

module.exports = db;
