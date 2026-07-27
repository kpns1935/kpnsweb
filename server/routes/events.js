const express = require('express');
const router = express.Router();
const db = require('../db');

// List all events with collection statistics
router.get('/', async (req, res) => {
  try {
    const events = await db.queryAll(`
      SELECT 
        e.*,
        COUNT(d.id) AS member_count,
        COALESCE(SUM(d.amount), 0) AS total_expected,
        COALESCE(SUM(d.paid_amount), 0) AS total_collected,
        (COALESCE(SUM(d.amount), 0) - COALESCE(SUM(d.paid_amount), 0)) AS total_pending,
        (
          SELECT COALESCE(SUM(amount), 0)
          FROM expenses
          WHERE event_id = e.id
        ) AS total_expenses
      FROM events e
      LEFT JOIN event_dues d ON e.id = d.event_id
      GROUP BY e.id
      ORDER BY e.event_date DESC
    `);
    res.json(events);
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
    const members = await db.queryAll(`SELECT id FROM members WHERE UPPER(COALESCE(member_status, 'ACTIVE')) = 'ACTIVE'`);

    // Impose contribution on every member
    for (const member of members) {
      await db.execute(
        `INSERT INTO event_dues (event_id, member_id, amount, paid_amount, status) VALUES (?, ?, ?, 0, 'pending')`,
        [eventId, member.id, amountNum]
      );
    }

    res.json({
      success: true,
      eventId,
      imposedMembersCount: members.length,
      contributionAmount: amountNum,
      message: `Event '${title}' created successfully and ₹${amountNum} imposed for all ${members.length} members.`
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
      ORDER BY m.name ASC
    `, [eventId]);

    const expenses = await db.queryAll(`
      SELECT * FROM expenses WHERE event_id = ? ORDER BY expense_date DESC
    `, [eventId]);

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

// Delete event (admin only) - cascades to event_dues
router.delete('/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    const event = await db.queryOne(`SELECT * FROM events WHERE id = ?`, [eventId]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    await db.execute(`DELETE FROM event_dues WHERE event_id = ?`, [eventId]);
    await db.execute(`DELETE FROM events WHERE id = ?`, [eventId]);

    res.json({ success: true, message: `Event '${event.title}' deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
