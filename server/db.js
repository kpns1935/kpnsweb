const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let dbPath = path.join(__dirname, '..', 'kpns.db');

// In Vercel serverless environment, local project directory is read-only
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

const db = new sqlite3.Database(dbPath);


function initDb() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table for application managers/admins
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'admin',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Members table (with all required custom fields)
      db.run(`
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


      // Ensure all columns exist for existing databases

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
      alterCols.forEach(cmd => {
        db.run(cmd, () => {}); // Ignore error if column already exists
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          contribution_amount REAL NOT NULL,
          event_date DATE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Dues table (records imposed contribution per member per event)
      db.run(`
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

      // Transactions table (Member dues payment, Member donation, Outside donation)
      db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          receipt_no TEXT UNIQUE NOT NULL,
          member_id INTEGER, -- NULL for outside donation
          outside_person_name TEXT, -- populated if outside donation
          outside_person_phone TEXT,
          event_id INTEGER, -- optional link to event
          due_id INTEGER, -- link to event_dues if paying towards event due
          type TEXT NOT NULL, -- 'member_payment', 'member_donation', 'outside_donation'
          amount REAL NOT NULL,
          payment_mode TEXT DEFAULT 'Cash',
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (member_id) REFERENCES members(id),
          FOREIGN KEY (event_id) REFERENCES events(id),
          FOREIGN KEY (due_id) REFERENCES event_dues(id)
        )
      `);

      // Expenses table (Event specific or generic org expenses)
      db.run(`
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          voucher_no TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          category TEXT NOT NULL, -- 'event', 'general', 'maintenance', 'other'
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

      // Check and seed/ensure default admin user exists
      db.get(`SELECT * FROM users WHERE email = 'kpnsclub@gmail.com'`, [], (err, row) => {
        if (err) {
          console.error('Error checking admin user:', err);
          return reject(err);
        }
        if (!row) {
          // Default password: admin123
          db.run(
            `INSERT INTO users (name, email, password, role) VALUES ('KPNS Admin', 'kpnsclub@gmail.com', 'admin123', 'admin')`,
            (err2) => {
              if (err2) console.error('Error creating default admin:', err2);
              else console.log('Default admin user created: kpnsclub@gmail.com / admin123');
            }
          );
        } else {
          // Always enforce default fixed credentials and admin role
          db.run(
            `UPDATE users SET name = 'KPNS Admin', password = 'admin123', role = 'admin' WHERE email = 'kpnsclub@gmail.com'`,
            (err2) => {
              if (err2) console.error('Error updating default admin:', err2);
              else console.log('Default admin user verified: kpnsclub@gmail.com / admin123 (Role: admin)');
            }
          );
        }
      });

      resolve(db);
    });
  });
}

// Helper wrapper functions for async/await
db.queryAll = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

db.queryOne = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

db.execute = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

initDb();

module.exports = db;
