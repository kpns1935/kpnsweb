const express = require('express');
const router = express.Router();
const db = require('../db');

// Overall Financial Summary
router.get('/summary', async (req, res) => {
  try {
    const allTransactions = await db.queryAll('SELECT * FROM transactions');
    const allExpenses = await db.queryAll('SELECT * FROM expenses');
    const allDues = await db.queryAll('SELECT * FROM event_dues');
    const allMembers = await db.queryAll('SELECT * FROM members');
    const allEvents = await db.queryAll('SELECT * FROM events');

    let totalMemberPayments = 0, totalMemberDonations = 0, totalOutsideDonations = 0;
    for (const t of allTransactions) {
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'member_payment') totalMemberPayments += amt;
      else if (t.type === 'member_donation') totalMemberDonations += amt;
      else if (t.type === 'outside_donation') totalOutsideDonations += amt;
    }

    let totalExpenses = 0;
    for (const ex of allExpenses) totalExpenses += (parseFloat(ex.amount) || 0);

    let totalPendingDues = 0;
    for (const d of allDues) totalPendingDues += ((parseFloat(d.amount) || 0) - (parseFloat(d.paid_amount) || 0));

    const totalIncome = totalMemberPayments + totalMemberDonations + totalOutsideDonations;

    res.json({
      member_count: allMembers.length,
      event_count: allEvents.length,
      total_member_payments: totalMemberPayments,
      total_member_donations: totalMemberDonations,
      total_outside_donations: totalOutsideDonations,
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net_cash_balance: totalIncome - totalExpenses,
      total_pending_dues: totalPendingDues
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

    // Fetch all transactions and expenses
    const allTransactions = await db.queryAll('SELECT * FROM transactions');
    const allExpenses = await db.queryAll('SELECT * FROM expenses');

    // Fetch lookup tables
    const members = await db.queryAll('SELECT id, name FROM members');
    const events = await db.queryAll('SELECT id, title FROM events');
    const memberMap = {};
    for (const m of members) memberMap[m.id] = m;
    const eventMap = {};
    for (const e of events) eventMap[e.id] = e;

    // Filter by year
    const yearTxs = allTransactions.filter(t => {
      const d = (t.created_at || '').slice(0, 10);
      return d >= fromDate && d <= toDate;
    });

    const yearExps = allExpenses.filter(ex => {
      const d = (ex.expense_date || '').slice(0, 10);
      return d >= fromDate && d <= toDate;
    });

    // Build income_breakdown (GROUP BY type in JS)
    const incomeGroups = {};
    for (const t of yearTxs) {
      const tp = t.type || 'unknown';
      if (!incomeGroups[tp]) incomeGroups[tp] = { type: tp, count: 0, total_amount: 0 };
      incomeGroups[tp].count++;
      incomeGroups[tp].total_amount += (parseFloat(t.amount) || 0);
    }
    const incomeBreakdown = Object.values(incomeGroups);

    // Build expense_breakdown (GROUP BY category in JS)
    const expenseGroups = {};
    for (const ex of yearExps) {
      const cat = ex.category || 'general';
      if (!expenseGroups[cat]) expenseGroups[cat] = { category: cat, count: 0, total_amount: 0 };
      expenseGroups[cat].count++;
      expenseGroups[cat].total_amount += (parseFloat(ex.amount) || 0);
    }
    const expenseBreakdown = Object.values(expenseGroups);

    // Enrich transactions with member/event names
    const transactionsList = yearTxs.map(t => {
      const m = memberMap[t.member_id] || {};
      const ev = eventMap[t.event_id] || {};
      return { ...t, member_name: m.name || t.member_name || null, event_title: ev.title || t.event_title || null };
    });
    transactionsList.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    // Enrich expenses with event names
    const expensesList = yearExps.map(ex => {
      const ev = eventMap[ex.event_id] || {};
      return { ...ex, event_title: ev.title || ex.event_title || null };
    });
    expensesList.sort((a, b) => new Date(a.expense_date || 0) - new Date(b.expense_date || 0));

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

    const rawDues = await db.queryAll(`SELECT * FROM event_dues`);
    const allDues = rawDues.filter(d => String(d.event_id) === String(eventId));

    const rawTransactions = await db.queryAll(`SELECT * FROM transactions`);
    const allTransactions = rawTransactions.filter(t => {
      if (!t.event_id) return false;
      const ids = String(t.event_id).split(',').map(s => s.trim());
      return ids.includes(String(eventId));
    });

    const rawExpenses = await db.queryAll(`SELECT * FROM expenses`);
    const allExpenses = rawExpenses.filter(ex => String(ex.event_id) === String(eventId));

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

    // Fetch all transactions and expenses
    const allTransactions = await db.queryAll('SELECT * FROM transactions');
    const allExpenses = await db.queryAll('SELECT * FROM expenses');

    // Fetch lookup tables
    const members = await db.queryAll('SELECT id, name FROM members');
    const events = await db.queryAll('SELECT id, title FROM events');
    const memberMap = {};
    for (const m of members) memberMap[m.id] = m;
    const eventMap = {};
    for (const e of events) eventMap[e.id] = e;

    // Filter by date range
    const periodTxs = allTransactions.filter(t => {
      const d = (t.created_at || '').slice(0, 10);
      return d >= from_date && d <= to_date;
    });

    const periodExps = allExpenses.filter(ex => {
      const d = (ex.expense_date || '').slice(0, 10);
      return d >= from_date && d <= to_date;
    });

    // Build income_breakdown (GROUP BY type in JS)
    const incomeGroups = {};
    for (const t of periodTxs) {
      const tp = t.type || 'unknown';
      if (!incomeGroups[tp]) incomeGroups[tp] = { type: tp, count: 0, total_amount: 0 };
      incomeGroups[tp].count++;
      incomeGroups[tp].total_amount += (parseFloat(t.amount) || 0);
    }
    const incomeBreakdown = Object.values(incomeGroups);

    // Build expense_breakdown (GROUP BY category in JS)
    const expenseGroups = {};
    for (const ex of periodExps) {
      const cat = ex.category || 'general';
      if (!expenseGroups[cat]) expenseGroups[cat] = { category: cat, count: 0, total_amount: 0 };
      expenseGroups[cat].count++;
      expenseGroups[cat].total_amount += (parseFloat(ex.amount) || 0);
    }
    const expenseBreakdown = Object.values(expenseGroups);

    // Enrich transactions with member/event names
    const transactionsList = periodTxs.map(t => {
      const m = memberMap[t.member_id] || {};
      const ev = eventMap[t.event_id] || {};
      return { ...t, member_name: m.name || t.member_name || null, event_title: ev.title || t.event_title || null };
    });
    transactionsList.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    // Enrich expenses with event names
    const expensesList = periodExps.map(ex => {
      const ev = eventMap[ex.event_id] || {};
      return { ...ex, event_title: ev.title || ex.event_title || null };
    });
    expensesList.sort((a, b) => new Date(a.expense_date || 0) - new Date(b.expense_date || 0));

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

