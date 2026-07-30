const express = require('express');
const router = express.Router();
const db = require('../db');

// List expenses
router.get('/', async (req, res) => {
  try {
    const { category, event_id, from_date, to_date } = req.query;

    const allExpenses = await db.queryAll('SELECT * FROM expenses ORDER BY expense_date DESC, id DESC');

    // Fetch events for title lookup
    const events = await db.queryAll('SELECT id, title FROM events');
    const eventMap = {};
    for (const e of events) eventMap[e.id] = e;

    // Filter in JS
    let expenses = allExpenses;
    if (category) expenses = expenses.filter(ex => ex.category === category);
    if (event_id) expenses = expenses.filter(ex => String(ex.event_id) === String(event_id));
    if (from_date) expenses = expenses.filter(ex => (ex.expense_date || '').slice(0, 10) >= from_date);
    if (to_date) expenses = expenses.filter(ex => (ex.expense_date || '').slice(0, 10) <= to_date);

    // Attach event titles
    expenses = expenses.map(ex => ({
      ...ex,
      event_title: (eventMap[ex.event_id] || {}).title || ex.event_title || null
    }));

    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new expense
router.post('/', async (req, res) => {
  try {
    const { title, category, event_id, amount, paid_to, payment_mode, expense_date, notes } = req.body;
    const parsedAmount = parseFloat(amount);

    if (!title || isNaN(parsedAmount) || parsedAmount <= 0 || !expense_date) {
      return res.status(400).json({ error: 'Title, positive amount, and expense date are required' });
    }

    // Generate unique Voucher No e.g., KPNS-EXP-2026-001 (year from expense date)
    const targetDate = (expense_date && !isNaN(new Date(expense_date).getTime())) ? new Date(expense_date) : new Date();
    const currentYear = targetDate.getFullYear();
    const countObj = await db.queryOne(`SELECT COUNT(*) as count FROM expenses WHERE voucher_no LIKE 'KPNS-EXP-${currentYear}-%'`);
    const voucherNo = `KPNS-EXP-${currentYear}-${String(countObj.count + 1).padStart(3, '0')}`;

    const result = await db.execute(
      `INSERT INTO expenses (voucher_no, title, category, event_id, amount, paid_to, payment_mode, expense_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        voucherNo, title, category || 'general', event_id || null,
        parsedAmount, paid_to || '', payment_mode || 'Cash', expense_date, notes || ''
      ]
    );

    res.json({
      success: true,
      expenseId: result.lastID,
      voucherNo,
      message: `Expense '${title}' of ₹${parsedAmount.toLocaleString('en-IN')} recorded. Voucher: ${voucherNo}`
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit expense (admin only)
router.put('/:id', async (req, res) => {
  try {
    const expId = req.params.id;
    const { title, category, event_id, amount, paid_to, payment_mode, expense_date, notes } = req.body;

    const ex = await db.queryOne(`SELECT * FROM expenses WHERE id = ?`, [expId]);
    if (!ex) return res.status(404).json({ error: 'Expense not found' });

    const parsedAmount = amount ? parseFloat(amount) : ex.amount;
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    await db.execute(
      `UPDATE expenses SET title=?, category=?, event_id=?, amount=?, paid_to=?, payment_mode=?, expense_date=?, notes=? WHERE id=?`,
      [
        title || ex.title,
        category || ex.category,
        event_id !== undefined ? (event_id || null) : ex.event_id,
        parsedAmount,
        paid_to !== undefined ? paid_to : ex.paid_to,
        payment_mode || ex.payment_mode,
        expense_date || ex.expense_date,
        notes !== undefined ? notes : ex.notes,
        expId
      ]
    );

    res.json({ success: true, message: 'Expense updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete expense (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const expId = req.params.id;
    const ex = await db.queryOne(`SELECT * FROM expenses WHERE id = ?`, [expId]);
    if (!ex) return res.status(404).json({ error: 'Expense not found' });

    await db.execute(`DELETE FROM expenses WHERE id = ?`, [expId]);
    res.json({ success: true, message: `Expense '${ex.title}' deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
