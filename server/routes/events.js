const express = require('express');
const router = express.Router();
const db = require('../db');

// List all events with collection statistics
router.get('/', async (req, res) => {
  try {
    const events = await db.queryAll('SELECT * FROM events');
    const eventDues = await db.queryAll('SELECT * FROM event_dues');
    const expenses = await db.queryAll('SELECT * FROM expenses');

    const duesMap = {};
    for (const d of eventDues) {
      if (!duesMap[d.event_id]) {
        duesMap[d.event_id] = { count: 0, expected: 0, collected: 0 };
      }
      duesMap[d.event_id].count++;
      duesMap[d.event_id].expected += (parseFloat(d.amount) || 0);
      duesMap[d.event_id].collected += (parseFloat(d.paid_amount) || 0);
    }

    const expensesMap = {};
    for (const ex of expenses) {
      if (ex.event_id) {
        if (!expensesMap[ex.event_id]) expensesMap[ex.event_id] = 0;
        expensesMap[ex.event_id] += (parseFloat(ex.amount) || 0);
      }
    }

    const result = events.map(e => {
      const stats = duesMap[e.id] || { count: 0, expected: 0, collected: 0 };
      const member_count = stats.count;
      const total_expected = stats.expected;
      const total_collected = stats.collected;
      const total_pending = total_expected - total_collected;
      const total_expenses = expensesMap[e.id] || 0;

      return {
        ...e,
        member_count,
        total_expected,
        total_collected,
        total_pending,
        total_expenses
      };
    });

    result.sort((a, b) => new Date(b.event_date || 0) - new Date(a.event_date || 0));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new event and impose contribution amount on all members
router.post('/', async (req, res) => {
  try {
    const { title, description, contribution_amount, event_date } = req.body;
    if (!title || !contribution_amount || !event_date) {
      return res.status(400).json({ error: 'Title, contribution amount, and event date are required' });
    }

    const amountNum = parseFloat(contribution_amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'Invalid contribution amount' });
    }

    // Insert Event record
    const eventResult = await db.execute(
      `INSERT INTO events (title, description, contribution_amount, event_date) VALUES (?, ?, ?, ?)`,
      [title, description || '', amountNum, event_date]
    );

    const eventId = eventResult.lastID;

    // Fetch only active members
    const members = await db.queryAll(`SELECT id FROM members`);
    const activeMembers = members.filter(m => (m.member_status || 'ACTIVE').toUpperCase() === 'ACTIVE');

    // Impose contribution on every member
    for (const member of activeMembers) {
      await db.execute(
        `INSERT INTO event_dues (event_id, member_id, amount, paid_amount, status) VALUES (?, ?, ?, 0, 'pending')`,
        [eventId, member.id, amountNum]
      );
    }

    res.json({
      success: true,
      eventId,
      imposedMembersCount: activeMembers.length,
      contributionAmount: amountNum,
      message: `Event '${title}' created successfully and ₹${amountNum} imposed for all ${activeMembers.length} members.`
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single event details with member dues status
router.get('/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    const event = await db.queryOne(`SELECT * FROM events WHERE id = ?`, [eventId]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const dues = await db.queryAll(`
      SELECT 
        d.*,
        m.member_code,
        m.name as member_name,
        m.phone as member_phone
      FROM event_dues d
      JOIN members m ON d.member_id = m.id
      WHERE d.event_id = ?
    `, [eventId]);

    dues.sort((a, b) => (a.member_name || '').localeCompare(b.member_name || ''));

    const expenses = await db.queryAll(`
      SELECT * FROM expenses WHERE event_id = ?
    `, [eventId]);

    expenses.sort((a, b) => new Date(b.expense_date || 0) - new Date(a.expense_date || 0));

    res.json({ event, dues, expenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit event (admin only) - updates title, date, description, and re-adjusts dues amounts
router.put('/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    const { title, description, contribution_amount, event_date } = req.body;

    const event = await db.queryOne(`SELECT * FROM events WHERE id = ?`, [eventId]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const newAmount = contribution_amount ? parseFloat(contribution_amount) : event.contribution_amount;
    if (isNaN(newAmount) || newAmount <= 0) {
      return res.status(400).json({ error: 'Invalid contribution amount' });
    }

    await db.execute(
      `UPDATE events SET title = ?, description = ?, contribution_amount = ?, event_date = ? WHERE id = ?`,
      [title || event.title, description ?? event.description, newAmount, event_date || event.event_date, eventId]
    );

    // If contribution amount changed, update pending dues (do not touch already paid amounts)
    if (newAmount !== event.contribution_amount) {
      const dues = await db.queryAll(`SELECT * FROM event_dues WHERE event_id = ?`, [eventId]);
      for (const due of dues) {
        const newStatus = due.paid_amount >= newAmount ? 'completed' : (due.paid_amount > 0 ? 'partial' : 'pending');
        await db.execute(
          `UPDATE event_dues SET amount = ?, status = ? WHERE id = ?`,
          [newAmount, newStatus, due.id]
        );
      }
    }

    res.json({ success: true, message: 'Event updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete event (admin only) - safely unlinks FK references and deletes event
router.delete('/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    const event = await db.queryOne(`SELECT * FROM events WHERE id = ?`, [eventId]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // 1. Unlink transactions referencing this event or its dues
    await db.execute(`UPDATE transactions SET event_id = NULL, due_id = NULL WHERE event_id = ?`, [eventId]);
    
    // 2. Unlink expenses referencing this event
    await db.execute(`UPDATE expenses SET event_id = NULL WHERE event_id = ?`, [eventId]);

    // 3. Delete event dues for this event
    await db.execute(`DELETE FROM event_dues WHERE event_id = ?`, [eventId]);

    // 4. Delete event
    await db.execute(`DELETE FROM events WHERE id = ?`, [eventId]);

    res.json({ success: true, message: `Event '${event.title}' deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
