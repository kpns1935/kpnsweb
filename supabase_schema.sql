-- KPNS Organization Management - Supabase PostgreSQL Database Schema

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Members Table
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

-- 3. Events Table
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  contribution_amount NUMERIC(12,2) NOT NULL,
  event_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Event Dues Table
CREATE TABLE IF NOT EXISTS event_dues (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pending'
);

-- 5. Transactions Table
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

-- 6. Expenses Table
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

-- 7. Insert/Verify Default Admin User
INSERT INTO users (name, email, password, role)
VALUES ('KPNS Admin', 'kpnsclub@gmail.com', 'admin123', 'admin')
ON CONFLICT (email) 
DO UPDATE SET name = 'KPNS Admin', password = 'admin123', role = 'admin';
