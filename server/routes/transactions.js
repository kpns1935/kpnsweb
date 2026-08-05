const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendWhatsAppSlip } = require('../whatsapp');

// List transactions (with filters for type, member, date range)
router.get('/', async (req, res) => {
  try {
    const { type, member_id, from_date, to_date } = req.query;

    // Fetch all transactions
    const allTxs = await db.queryAll('SELECT * FROM transactions ORDER BY id DESC');

    // Fetch lookup tables for member and event names
    const members = await db.queryAll('SELECT id, name, member_code, phone FROM members');
    const events = await db.queryAll('SELECT id, title FROM events');
    const memberMap = {};
    for (const m of members) memberMap[m.id] = m;
    const eventMap = {};
    for (const e of events) eventMap[e.id] = e;

    // Filter in JS
    let txs = allTxs;
    if (type) txs = txs.filter(t => t.type === type);
    if (member_id) txs = txs.filter(t => String(t.member_id) === String(member_id));
    if (from_date) txs = txs.filter(t => (t.created_at || '').slice(0, 10) >= from_date);
    if (to_date) txs = txs.filter(t => (t.created_at || '').slice(0, 10) <= to_date);

    // Attach member/event details
    txs = txs.map(tx => {
      const m = memberMap[tx.member_id] || {};
      const eventIds = tx.event_id ? String(tx.event_id).split(',').map(id => id.trim()).filter(Boolean) : [];
      const eventTitles = eventIds.map(id => (eventMap[id] || {}).title).filter(Boolean);
      return {
        ...tx,
        member_code: m.member_code || tx.member_code || null,
        member_name: m.name || tx.member_name || null,
        member_phone: m.phone || tx.member_phone || null,
        event_title: eventTitles.join(', ') || tx.event_title || null
      };
    });

    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single transaction details
router.get('/:id', async (req, res) => {
  try {
    const tx = await db.queryOne('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    // Attach member details
    if (tx.member_id) {
      const member = await db.queryOne('SELECT * FROM members WHERE id = ?', [tx.member_id]);
      if (member) {
        tx.member_code = member.member_code;
        tx.member_name = member.name;
        tx.member_phone = member.phone;
        tx.member_email = member.email;
        tx.member_address = member.address;
      }
    }

    // Resolve event titles
    if (tx.event_id) {
      const ids = String(tx.event_id).split(',').map(id => id.trim()).filter(Boolean);
      const titles = [];
      for (const id of ids) {
        const ev = await db.queryOne('SELECT * FROM events WHERE id = ?', [id]);
        if (ev) {
          titles.push(ev.title);
          tx.event_contribution = ev.contribution_amount;
        }
      }
      tx.event_title = titles.join(', ');
    }

    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new transaction (Member Payment, Member Donation, or Outside Donation)
router.post('/', async (req, res) => {
  try {
    const { 
      type, // 'member_payment', 'member_donation', 'outside_donation'
      member_id, 
      outside_person_name, 
      outside_person_phone, 
      event_id, 
      due_id, 
      amount, 
      payment_mode, 
      notes,
      send_whatsapp,
      created_at,
      per_event_amounts // { eventId: amount } — from multiple events mode
    } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!type || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Valid transaction type and positive amount are required' });
    }

    // Generate unique receipt number e.g., KPNS-MR-2026-001
    const targetDate = (created_at && !isNaN(new Date(created_at).getTime())) ? new Date(created_at) : new Date();
    const currentYear = targetDate.getFullYear();
    const prefix = `KPNS-MR-${currentYear}-`;
    const existingTxs = await db.queryAll(`SELECT receipt_no FROM transactions WHERE receipt_no LIKE ?`, [`${prefix}%`]);
    let maxNum = 0;
    for (const t of existingTxs) {
      if (t.receipt_no) {
        const parts = t.receipt_no.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    let nextNum = maxNum + 1;
    let receiptNo = `${prefix}${String(nextNum).padStart(3, '0')}`;

    // Safety loop: ensure receiptNo is unique in case of gaps or manual entries
    let checkExist = await db.queryOne(`SELECT id FROM transactions WHERE receipt_no = ?`, [receiptNo]);
    while (checkExist) {
      nextNum++;
      receiptNo = `${prefix}${String(nextNum).padStart(3, '0')}`;
      checkExist = await db.queryOne(`SELECT id FROM transactions WHERE receipt_no = ?`, [receiptNo]);
    }

    let resolvedMemberId = member_id || null;
    let resolvedOutsideName = outside_person_name || null;
    let resolvedOutsidePhone = outside_person_phone || null;

    if (type === 'outside_donation') {
      if (!outside_person_name) {
        return res.status(400).json({ error: 'Outside person name is required for outside donation' });
      }
      resolvedMemberId = null;
    } else {
      if (!member_id) {
        return res.status(400).json({ error: 'Member is required for member transaction' });
      }
    }

    // If type is member_payment and due_id or event_id provided, update event_dues paid_amount
    if (type === 'member_payment') {
      if (due_id) {
        const targetDue = await db.queryOne('SELECT * FROM event_dues WHERE id = ?', [due_id]);
        if (targetDue) {
          const newPaidAmount = targetDue.paid_amount + parsedAmount;
          const newStatus = newPaidAmount >= targetDue.amount ? 'completed' : 'partial';
          await db.execute(
            `UPDATE event_dues SET paid_amount = ?, status = ? WHERE id = ?`,
            [newPaidAmount, newStatus, targetDue.id]
          );
        }
      } else if (event_id && member_id) {
        const eventIds = String(event_id).split(',').map(id => id.trim()).filter(Boolean);

        if (per_event_amounts && typeof per_event_amounts === 'object') {
          // Per-event amounts mode — apply exact amount to each event's dues
          for (const evId of eventIds) {
            const evAmount = parseFloat(per_event_amounts[evId]);
            if (isNaN(evAmount) || evAmount <= 0) continue;
            const targetDue = await db.queryOne('SELECT * FROM event_dues WHERE event_id = ? AND member_id = ?', [evId, member_id]);
            if (targetDue) {
              const newPaidAmount = targetDue.paid_amount + evAmount;
              const newStatus = newPaidAmount >= targetDue.amount ? 'completed' : 'partial';
              await db.execute(
                `UPDATE event_dues SET paid_amount = ?, status = ? WHERE id = ?`,
                [newPaidAmount, newStatus, targetDue.id]
              );
            }
          }
        } else {
          // Legacy lump-sum mode — distribute payment across events sequentially
          let remainingPayment = parsedAmount;
          for (const evId of eventIds) {
            if (remainingPayment <= 0) break;
            const targetDue = await db.queryOne('SELECT * FROM event_dues WHERE event_id = ? AND member_id = ?', [evId, member_id]);
            if (targetDue) {
              const dueRemaining = targetDue.amount - targetDue.paid_amount;
              if (dueRemaining > 0) {
                const paymentToApply = Math.min(remainingPayment, dueRemaining);
                const newPaidAmount = targetDue.paid_amount + paymentToApply;
                const newStatus = newPaidAmount >= targetDue.amount ? 'completed' : 'partial';
                await db.execute(
                  `UPDATE event_dues SET paid_amount = ?, status = ? WHERE id = ?`,
                  [newPaidAmount, newStatus, targetDue.id]
                );
                remainingPayment -= paymentToApply;
              }
            }
          }
        }
      }
    }

    // Record Transaction
    const createdAtValue = created_at ? `${created_at} 12:00:00` : new Date().toISOString();

    const txResult = await db.execute(
      `INSERT INTO transactions (
        receipt_no, member_id, outside_person_name, outside_person_phone, 
        event_id, due_id, type, amount, payment_mode, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        receiptNo, resolvedMemberId, resolvedOutsideName, resolvedOutsidePhone,
        event_id || null, due_id || null, type, parsedAmount, payment_mode || 'Cash', notes || '',
        createdAtValue
      ]
    );

    const createdTxId = txResult.lastID;

    // Fetch full created tx with recipient information
    const createdTx = await db.queryOne('SELECT * FROM transactions WHERE id = ?', [createdTxId]);
    if (createdTx && createdTx.member_id) {
      const member = await db.queryOne('SELECT * FROM members WHERE id = ?', [createdTx.member_id]);
      if (member) {
        createdTx.member_name = member.name;
        createdTx.member_phone = member.phone;
      }
    }

    // Send WhatsApp if requested
    let whatsappResult = null;
    if (send_whatsapp) {
      const recipientName = createdTx.member_name || createdTx.outside_person_name || 'Valued Supporter';
      const recipientPhone = createdTx.member_phone || createdTx.outside_person_phone;

      if (recipientPhone) {
        whatsappResult = await sendWhatsAppSlip({
          phone: recipientPhone,
          memberName: recipientName,
          receiptNo,
          amount: parsedAmount,
          type: type === 'member_payment' ? 'Event Dues Payment' : (type === 'member_donation' ? 'Member Donation' : 'Outside Donation'),
          date: new Date().toLocaleDateString('en-IN'),
          note: notes
        });
      }
    }

    res.json({
      success: true,
      transactionId: createdTxId,
      receiptNo,
      whatsappResult,
      message: `Transaction recorded successfully. Receipt No: ${receiptNo}`
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger WhatsApp message manually for an existing receipt
router.post('/:id/send-whatsapp', async (req, res) => {
  try {
    const tx = await db.queryOne('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    // Attach member details
    if (tx.member_id) {
      const member = await db.queryOne('SELECT * FROM members WHERE id = ?', [tx.member_id]);
      if (member) {
        tx.member_name = member.name;
        tx.member_phone = member.phone;
      }
    }

    const recipientName = tx.member_name || tx.outside_person_name || 'Valued Supporter';
    const recipientPhone = req.body.phone || tx.member_phone || tx.outside_person_phone;

    if (!recipientPhone) {
      return res.status(400).json({ error: 'No recipient phone number available' });
    }

    const whatsappResult = await sendWhatsAppSlip({
      phone: recipientPhone,
      memberName: recipientName,
      receiptNo: tx.receipt_no,
      amount: tx.amount,
      type: tx.type === 'member_payment' ? 'Event Dues Payment' : (tx.type === 'member_donation' ? 'Member Donation' : 'Outside Donation'),
      date: new Date(tx.created_at).toLocaleDateString('en-IN'),
      note: tx.notes
    });

    res.json({ success: true, whatsappResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit transaction (admin only) - edits amount, payment_mode, notes, created_at
router.put('/:id', async (req, res) => {
  try {
    const txId = req.params.id;
    const { amount, payment_mode, notes, created_at } = req.body;

    const tx = await db.queryOne(`SELECT * FROM transactions WHERE id = ?`, [txId]);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const newAmount = amount ? parseFloat(amount) : tx.amount;
    if (isNaN(newAmount) || newAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const updateFields = {
      amount: newAmount,
      payment_mode: payment_mode || tx.payment_mode,
      notes: notes ?? tx.notes
    };
    if (created_at) {
      updateFields.created_at = `${created_at} 12:00:00`;
    }
    const setCols = Object.keys(updateFields);
    const setClause = setCols.map(c => `${c} = ?`).join(', ');
    const setParams = setCols.map(c => updateFields[c]);

    await db.execute(
      `UPDATE transactions SET ${setClause} WHERE id = ?`,
      [...setParams, txId]
    );

    res.json({ success: true, message: 'Transaction updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete transaction (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const txId = req.params.id;
    const tx = await db.queryOne(`SELECT * FROM transactions WHERE id = ?`, [txId]);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    // If it was a member payment, reverse the paid amount on event_dues
    if (tx.type === 'member_payment' && tx.event_id && tx.member_id) {
      const eventIds = String(tx.event_id).split(',').map(id => id.trim()).filter(Boolean);
      let remaining = tx.amount;
      for (const evId of eventIds) {
        if (remaining <= 0) break;
        const due = await db.queryOne(
          `SELECT * FROM event_dues WHERE event_id = ? AND member_id = ?`, [evId, tx.member_id]
        );
        if (due) {
          const reversal = Math.min(remaining, due.paid_amount);
          const newPaid = due.paid_amount - reversal;
          const newStatus = newPaid <= 0 ? 'pending' : (newPaid >= due.amount ? 'completed' : 'partial');
          await db.execute(
            `UPDATE event_dues SET paid_amount = ?, status = ? WHERE id = ?`,
            [newPaid, newStatus, due.id]
          );
          remaining -= reversal;
        }
      }
    }

    await db.execute(`DELETE FROM transactions WHERE id = ?`, [txId]);
    res.json({ success: true, message: 'Transaction deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
