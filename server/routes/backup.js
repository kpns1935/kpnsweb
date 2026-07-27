const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');

const dbFilePath = path.join(__dirname, '..', 'kpns.db');

// Export Database Backup File (.db / .json)
router.get('/export-db', (req, res) => {
  try {
    if (!fs.existsSync(dbFilePath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.download(dbFilePath, `KPNS_Backup_${timestamp}.db`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export Full Data JSON Backup
router.get('/export-json', async (req, res) => {
  try {
    const users = await db.queryAll('SELECT * FROM users');
    const members = await db.queryAll('SELECT * FROM members');
    const events = await db.queryAll('SELECT * FROM events');
    const event_dues = await db.queryAll('SELECT * FROM event_dues');
    const transactions = await db.queryAll('SELECT * FROM transactions');
    const expenses = await db.queryAll('SELECT * FROM expenses');

    const backupData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      data: {
        users,
        members,
        events,
        event_dues,
        transactions,
        expenses
      }
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=KPNS_Data_Backup_${timestamp}.json`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import Full Data JSON Backup
router.post('/import-json', async (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required to restore backups' });
  try {
    const { backup } = req.body;
    if (!backup || !backup.data) {
      return res.status(400).json({ error: 'Invalid backup file format' });
    }

    const { users, members, events, event_dues, transactions, expenses } = backup.data;

    // Clear existing data & restore
    db.serialize(async () => {
      try {
        await db.execute('DELETE FROM transactions');
        await db.execute('DELETE FROM event_dues');
        await db.execute('DELETE FROM expenses');
        await db.execute('DELETE FROM events');
        await db.execute('DELETE FROM members');
        await db.execute('DELETE FROM users');

        // Restore Users
        if (users && users.length > 0) {
          for (const u of users) {
            await db.execute(
              `INSERT INTO users (id, name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
              [u.id, u.name, u.email, u.password, u.role, u.created_at]
            );
          }
        }

        // Restore Members
        if (members && members.length > 0) {
          for (const m of members) {
            await db.execute(
              `INSERT INTO members (
                id, form_no, member_code, name, father_name, date_of_admission, 
                phone, email, aadhaar_number, blood_group, alternative_number, 
                dob, member_status, address, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                m.id, m.form_no, m.member_code, m.name, m.father_name, m.date_of_admission,
                m.phone, m.email, m.aadhaar_number, m.blood_group, m.alternative_number,
                m.dob, m.member_status, m.address, m.created_at
              ]
            );
          }
        }

        // Restore Events
        if (events && events.length > 0) {
          for (const e of events) {
            await db.execute(
              `INSERT INTO events (id, title, description, contribution_amount, event_date, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
              [e.id, e.title, e.description, e.contribution_amount, e.event_date, e.created_at]
            );
          }
        }

        // Restore Event Dues
        if (event_dues && event_dues.length > 0) {
          for (const ed of event_dues) {
            await db.execute(
              `INSERT INTO event_dues (id, event_id, member_id, amount, paid_amount, status) VALUES (?, ?, ?, ?, ?, ?)`,
              [ed.id, ed.event_id, ed.member_id, ed.amount, ed.paid_amount, ed.status]
            );
          }
        }

        // Restore Transactions
        if (transactions && transactions.length > 0) {
          for (const t of transactions) {
            await db.execute(
              `INSERT INTO transactions (
                id, receipt_no, member_id, outside_person_name, outside_person_phone, 
                event_id, due_id, type, amount, payment_mode, notes, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                t.id, t.receipt_no, t.member_id, t.outside_person_name, t.outside_person_phone,
                t.event_id, t.due_id, t.type, t.amount, t.payment_mode, t.notes, t.created_at
              ]
            );
          }
        }

        // Restore Expenses
        if (expenses && expenses.length > 0) {
          for (const ex of expenses) {
            await db.execute(
              `INSERT INTO expenses (
                id, voucher_no, title, category, event_id, amount, 
                paid_to, payment_mode, expense_date, notes, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                ex.id, ex.voucher_no, ex.title, ex.category, ex.event_id, ex.amount,
                ex.paid_to, ex.payment_mode, ex.expense_date, ex.notes, ex.created_at
              ]
            );
          }
        }

        res.json({ success: true, message: 'Database backup imported successfully!' });
      } catch (innerErr) {
        res.status(500).json({ error: innerErr.message });
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Erase All Data (Admin only)
router.post('/erase', async (req, res) => {
  if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    db.serialize(async () => {
      try {
        await db.execute('DELETE FROM transactions');
        await db.execute('DELETE FROM event_dues');
        await db.execute('DELETE FROM expenses');
        await db.execute('DELETE FROM events');
        await db.execute('DELETE FROM members');
        await db.execute("DELETE FROM users WHERE LOWER(email) != 'admin@kpns.org'");
        res.json({ success: true, message: 'All data successfully erased! Admin account preserved.' });
      } catch (innerErr) {
        res.status(500).json({ error: innerErr.message });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
