const express = require('express');
const router = express.Router();
const db = require('../db');

// Overall Financial Summary
router.get('/summary', async (req, res) => {
  try {
    const totalMemberPayments = await db.queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'member_payment'`);
    const totalMemberDonations = await db.queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'member_donation'`);
    const totalOutsideDonations = await db.queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'outside_donation'`);
    const totalExpenses = await db.queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses`);
    const totalPendingDues = await db.queryOne(`SELECT COALESCE(SUM(amount - paid_amount), 0) as total FROM event_dues`);

    const totalIncome = (totalMemberPayments.total || 0) + (totalMemberDonations.total || 0) + (totalOutsideDonations.total || 0);
    const netCashBalance = totalIncome - (totalExpenses.total || 0);

    const memberCountObj = await db.queryOne(`SELECT COUNT(*) as count FROM members`);
    const eventCountObj = await db.queryOne(`SELECT COUNT(*) as count FROM events`);

    res.json({
      member_count: memberCountObj.count,
      event_count: eventCountObj.count,
      total_member_payments: totalMemberPayments.total || 0,
      total_member_donations: totalMemberDonations.total || 0,
      total_outside_donations: totalOutsideDonations.total || 0,
      total_income: totalIncome,
      total_expenses: totalExpenses.total || 0,
      net_cash_balance: netCashBalance,
      total_pending_dues: totalPendingDues.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Yearly Balance Sheet Report
router.get('/yearly', async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const fromDate = `${year}-01-01`;
    const toDate = `${year}-12-31`;

    const yearFromDate = `${year}-01-01`;
    const yearToDate = `${year}-12-31 23:59:59`;

    const incomeBreakdown = await db.queryAll(`
      SELECT 
        type,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM transactions
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY type
    `, [yearFromDate, yearToDate]);

    const expenseBreakdown = await db.queryAll(`
      SELECT 
        category,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM expenses
      WHERE expense_date >= ? AND expense_date <= ?
      GROUP BY category
    `, [`${year}-01-01`, `${year}-12-31`]);

    const transactionsList = await db.queryAll(`
      SELECT t.*, m.name as member_name, e.title as event_title
      FROM transactions t
      LEFT JOIN members m ON t.member_id = m.id
      LEFT JOIN events e ON t.event_id = e.id
      WHERE t.created_at >= ? AND t.created_at <= ?
      ORDER BY t.created_at ASC
    `, [yearFromDate, yearToDate]);

    const expensesList = await db.queryAll(`
      SELECT ex.*, e.title as event_title
      FROM expenses ex
      LEFT JOIN events e ON ex.event_id = e.id
      WHERE ex.expense_date >= ? AND ex.expense_date <= ?
      ORDER BY ex.expense_date ASC
    `, [`${year}-01-01`, `${year}-12-31`]);

    let totalIncome = 0;
    incomeBreakdown.forEach(i => totalIncome += i.total_amount);

    let totalExpenses = 0;
    expenseBreakdown.forEach(e => totalExpenses += e.total_amount);

    res.json({
      report_type: 'YEARLY',
      year,
      from_date: fromDate,
      to_date: toDate,
      income_breakdown: incomeBreakdown,
      expense_breakdown: expenseBreakdown,
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net_balance: totalIncome - totalExpenses,
      transactions: transactionsList,
      expenses: expensesList
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Event Balance Sheet Report
router.get('/event/:eventId', async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await db.queryOne(`SELECT * FROM events WHERE id = ?`, [eventId]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const allDues = await db.queryAll(`SELECT * FROM event_dues WHERE event_id = ?`, [eventId]);
    const allTransactions = await db.queryAll(`SELECT * FROM transactions WHERE event_id = ?`, [eventId]);
    const allExpenses = await db.queryAll(`SELECT * FROM expenses WHERE event_id = ?`, [eventId]);

    let total_imposed_dues = 0;
    let total_collected_dues = 0;
    for (const d of allDues) {
      total_imposed_dues += (parseFloat(d.amount) || 0);
      total_collected_dues += (parseFloat(d.paid_amount) || 0);
    }

    let total_event_donations = 0;
    for (const t of allTransactions) {
      if (t.type === 'member_donation' || t.type === 'outside_donation') {
        total_event_donations += (parseFloat(t.amount) || 0);
      }
    }

    let total_expenses = 0;
    for (const ex of allExpenses) {
      total_expenses += (parseFloat(ex.amount) || 0);
    }

    const total_pending_dues = total_imposed_dues - total_collected_dues;
    const total_income = total_collected_dues + total_event_donations;
    const net_event_profit_loss = total_income - total_expenses;

    // Attach member details to dues
    const members = await db.queryAll('SELECT id, name, member_code, phone FROM members');
    const memberMap = {};
    for (const m of members) {
      memberMap[m.id] = m;
    }

    const duesDetails = allDues.map(d => {
      const m = memberMap[d.member_id] || {};
      return {
        ...d,
        member_code: m.member_code || '-',
        member_name: m.name || ('Member #' + d.member_id),
        member_phone: m.phone || '-'
      };
    });

    duesDetails.sort((a, b) => (a.member_name || '').localeCompare(b.member_name || ''));
    allExpenses.sort((a, b) => new Date(a.expense_date || 0) - new Date(b.expense_date || 0));

    res.json({
      report_type: 'EVENT',
      event,
      total_imposed_dues,
      total_collected_dues,
      total_pending_dues,
      total_event_donations,
      total_income,
      total_expenses,
      net_event_profit_loss,
      dues: duesDetails,
      expenses: allExpenses
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Custom Time Period Balance Sheet Report
router.get('/custom', async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date query parameters required' });
    }

    const fromTs = `${from_date} 00:00:00`;
    const toTs = `${to_date} 23:59:59`;

    const incomeBreakdown = await db.queryAll(`
      SELECT 
        type,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM transactions
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY type
    `, [fromTs, toTs]);

    const expenseBreakdown = await db.queryAll(`
      SELECT 
        category,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM expenses
      WHERE expense_date >= ? AND expense_date <= ?
      GROUP BY category
    `, [from_date, to_date]);

    const transactionsList = await db.queryAll(`
      SELECT t.*, m.name as member_name, e.title as event_title
      FROM transactions t
      LEFT JOIN members m ON t.member_id = m.id
      LEFT JOIN events e ON t.event_id = e.id
      WHERE t.created_at >= ? AND t.created_at <= ?
      ORDER BY t.created_at ASC
    `, [fromTs, toTs]);

    const expensesList = await db.queryAll(`
      SELECT ex.*, e.title as event_title
      FROM expenses ex
      LEFT JOIN events e ON ex.event_id = e.id
      WHERE ex.expense_date >= ? AND ex.expense_date <= ?
      ORDER BY ex.expense_date ASC
    `, [from_date, to_date]);

    let totalIncome = 0;
    incomeBreakdown.forEach(i => totalIncome += i.total_amount);

    let totalExpenses = 0;
    expenseBreakdown.forEach(e => totalExpenses += e.total_amount);

    res.json({
      report_type: 'CUSTOM_PERIOD',
      from_date,
      to_date,
      income_breakdown: incomeBreakdown,
      expense_breakdown: expenseBreakdown,
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net_balance: totalIncome - totalExpenses,
      transactions: transactionsList,
      expenses: expensesList
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
