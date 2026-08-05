const express = require('express');
const router = express.Router();
const db = require('../db');

// List all members with total pending dues and total paid amounts
router.get('/', async (req, res) => {
  try {
    const members = await db.queryAll('SELECT * FROM members');
    const eventDues = await db.queryAll('SELECT * FROM event_dues');
    const transactions = await db.queryAll('SELECT * FROM transactions');

    const duesMap = {};
    for (const d of eventDues) {
      if (!duesMap[d.member_id]) {
        duesMap[d.member_id] = { imposed: 0, paid: 0 };
      }
      duesMap[d.member_id].imposed += (parseFloat(d.amount) || 0);
      duesMap[d.member_id].paid += (parseFloat(d.paid_amount) || 0);
    }

    const donationMap = {};
    for (const t of transactions) {
      if (t.type === 'member_donation') {
        if (!donationMap[t.member_id]) donationMap[t.member_id] = 0;
        donationMap[t.member_id] += (parseFloat(t.amount) || 0);
      }
    }

    const result = members.map(m => {
      const duesInfo = duesMap[m.id] || { imposed: 0, paid: 0 };
      const total_dues_imposed = duesInfo.imposed;
      const total_dues_paid = duesInfo.paid;
      const current_due_balance = total_dues_imposed - total_dues_paid;
      const total_donations = donationMap[m.id] || 0;

      return {
        ...m,
        total_dues_imposed,
        total_dues_paid,
        current_due_balance,
        total_donations
      };
    });

    result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search members by code, name, mobile, or email with priority ranking
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    const includeInactive = req.query.includeInactive === 'true';

    const members = await db.queryAll('SELECT * FROM members');
    let filtered = members;
    if (!includeInactive) {
      filtered = filtered.filter(m => (m.member_status || 'Active').toUpperCase() === 'ACTIVE');
    }

    if (!q) {
      // If query is empty, return top 20 sorted by name
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return res.json(filtered.slice(0, 20));
    }

    const matches = [];
    for (const m of filtered) {
      const code = (m.member_code || '').toLowerCase();
      const phone = (m.phone || '').toLowerCase();
      const altPhone = (m.alternative_number || '').toLowerCase();
      const email = (m.email || '').toLowerCase();
      const name = (m.name || '').toLowerCase();
      const father = (m.father_name || '').toLowerCase();

      let rank = Infinity;

      if (code === q) rank = 1;
      else if (phone === q || altPhone === q) rank = 2;
      else if (email === q) rank = 3;
      else if (name.startsWith(q)) rank = 4;
      else if (name.includes(q)) rank = 5;
      else if (code.includes(q)) rank = 6;
      else if (phone.includes(q) || altPhone.includes(q)) rank = 7;
      else if (email.includes(q)) rank = 8;
      else if (father.includes(q)) rank = 9;

      if (rank !== Infinity) {
        matches.push({ member: m, rank });
      }
    }

    matches.sort((a, b) => a.rank - b.rank || (a.member.name || '').localeCompare(b.member.name || ''));

    const results = matches.slice(0, 20).map(m => m.member);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new member
router.post('/', async (req, res) => {
  try {
    const { 
      form_no, member_code, name, father_name, date_of_admission, 
      phone, email, aadhaar_number, blood_group, alternative_number, 
      dob, member_status, address, initial_event_ids
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    // Auto-generate code if not provided
    let code = member_code;
    if (!code) {
      const allMembers = await db.queryAll('SELECT member_code FROM members');
      let maxNum = 0;
      for (const m of allMembers) {
        if (m.member_code) {
          const match = m.member_code.match(/\d+/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      }
      let nextNum = maxNum + 1;
      code = 'KPNS-' + String(nextNum).padStart(3, '0');
      let checkCode = await db.queryOne('SELECT id FROM members WHERE member_code = ?', [code]);
      while (checkCode) {
        nextNum++;
        code = 'KPNS-' + String(nextNum).padStart(3, '0');
        checkCode = await db.queryOne('SELECT id FROM members WHERE member_code = ?', [code]);
      }
    }

    let formNoVal = form_no;
    if (!formNoVal) {
      const allMembers = await db.queryAll('SELECT form_no FROM members');
      let maxNum = 1000;
      for (const m of allMembers) {
        if (m.form_no) {
          const match = m.form_no.match(/\d+/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      }
      let nextNum = maxNum + 1;
      formNoVal = 'F-' + String(nextNum);
      let checkForm = await db.queryOne('SELECT id FROM members WHERE form_no = ?', [formNoVal]);
      while (checkForm) {
        nextNum++;
        formNoVal = 'F-' + String(nextNum);
        checkForm = await db.queryOne('SELECT id FROM members WHERE form_no = ?', [formNoVal]);
      }
    }

    const result = await db.execute(
      `INSERT INTO members (
        form_no, member_code, name, father_name, date_of_admission, 
        phone, email, aadhaar_number, blood_group, alternative_number, 
        dob, member_status, address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        formNoVal, code, name, father_name || '', date_of_admission || new Date().toISOString().slice(0,10),
        phone, email || '', aadhaar_number || '', blood_group || 'O+', alternative_number || '',
        dob || '', member_status || 'Active', address || ''
      ]
    );

    const newMemberId = result.lastID;
    const mStatus = member_status || 'Active';

    // Assign selected Fixed Contribution Events as initial dues if Active
    if (mStatus.toUpperCase() === 'ACTIVE') {
      let eventIdsToAssign = [];
      if (Array.isArray(initial_event_ids)) {
        eventIdsToAssign = initial_event_ids;
      } else if (typeof initial_event_ids === 'string' && initial_event_ids.trim()) {
        eventIdsToAssign = initial_event_ids.split(',').map(s => s.trim()).filter(Boolean);
      }

      if (eventIdsToAssign.length > 0) {
        const events = await db.queryAll('SELECT id, contribution_amount, contribution_type FROM events');
        const assignedSet = new Set();
        for (const evtId of eventIdsToAssign) {
          const evt = events.find(e => String(e.id) === String(evtId));
          // Only Active Fixed Contribution events with amount > 0 can be assigned as dues
          if (evt && (evt.contribution_type !== 'flexible') && parseFloat(evt.contribution_amount) > 0 && !assignedSet.has(evt.id)) {
            assignedSet.add(evt.id);
            await db.execute(
              `INSERT INTO event_dues (event_id, member_id, amount, paid_amount, status) VALUES (?, ?, ?, 0, 'pending')`,
              [evt.id, newMemberId, parseFloat(evt.contribution_amount)]
            );
          }
        }
      }
    }

    res.json({ success: true, id: newMemberId, member_code: code, form_no: formNoVal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Member (Admin / Manager)
// Deletes member profile and all unpaid dues while preserving historical payment transactions and receipts for audit
router.delete('/:id', async (req, res) => {
  try {
    const memberId = req.params.id;
    const member = await db.queryOne('SELECT * FROM members WHERE id = ?', [memberId]);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    // 1. Preserve transaction audit trail: preserve member name & phone on transactions before unlinking member_id
    await db.execute(
      `UPDATE transactions SET outside_person_name = COALESCE(outside_person_name, ?), outside_person_phone = COALESCE(outside_person_phone, ?), member_id = NULL WHERE member_id = ?`,
      [member.name, member.phone || '', memberId]
    );

    // 2. Delete all unpaid due entries (paid_amount = 0)
    await db.execute(
      `DELETE FROM event_dues WHERE member_id = ? AND (paid_amount = 0 OR paid_amount IS NULL)`,
      [memberId]
    );

    // 3. For partially paid dues, set amount = paid_amount & status = 'completed' so pending due balance is 0 while preserving historical paid amounts
    await db.execute(
      `UPDATE event_dues SET amount = paid_amount, status = 'completed' WHERE member_id = ? AND paid_amount > 0`,
      [memberId]
    );

    // 4. Delete member profile permanently
    await db.execute(`DELETE FROM members WHERE id = ?`, [memberId]);

    res.json({
      success: true,
      message: `Member '${member.name}' deleted successfully. Unpaid dues removed; payment history retained for audit.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update full member details
router.put('/:id', async (req, res) => {
  try {
    const { 
      form_no, member_code, name, father_name, date_of_admission, 
      phone, email, aadhaar_number, blood_group, alternative_number, 
      dob, member_status, address 
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    await db.execute(
      `UPDATE members SET 
        form_no = ?, member_code = ?, name = ?, father_name = ?, date_of_admission = ?, 
        phone = ?, email = ?, aadhaar_number = ?, blood_group = ?, alternative_number = ?, 
        dob = ?, member_status = ?, address = ?
      WHERE id = ?`,
      [
        form_no, member_code, name, father_name, date_of_admission,
        phone, email, aadhaar_number, blood_group, alternative_number,
        dob, member_status, address, req.params.id
      ]
    );

    res.json({ success: true, message: 'Member updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update member status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    
    await db.execute('UPDATE members SET member_status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true, message: 'Member status updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed sample 50 members if DB is empty
router.post('/seed-sample-members', async (req, res) => {
  try {
    const countObj = await db.queryOne('SELECT COUNT(*) as count FROM members');
    if (countObj.count > 0) {
      return res.json({ message: 'Members already present, skipping seed' });
    }

    const firstNames = ['Rajesh', 'Suresh', 'Amit', 'Priya', 'Vikram', 'Ramesh', 'Deepak', 'Sunita', 'Anil', 'Kavita', 'Manoj', 'Pooja', 'Rohan', 'Sneha', 'Sanjay', 'Geeta', 'Alok', 'Anita', 'Vijay', 'Rekha'];
    const lastNames = ['Sharma', 'Verma', 'Patel', 'Gupta', 'Singh', 'Kumar', 'Joshi', 'Mehta', 'Nair', 'Rao', 'Chaudhary', 'Das', 'Roy', 'Agarwal', 'Shah'];
    const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+'];

    let seededCount = 0;
    for (let i = 1; i <= 50; i++) {
      const fName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const fatherFName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const code = 'KPNS-' + String(i).padStart(3, '0');
      const formNo = 'F-' + String(1000 + i);
      const phone = '98' + Math.floor(10000000 + Math.random() * 90000000);
      const altPhone = '94' + Math.floor(10000000 + Math.random() * 90000000);
      const aadhaar = `${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`;
      const email = `${fName.toLowerCase()}.${lName.toLowerCase()}${i}@gmail.com`;
      const bg = bloodGroups[Math.floor(Math.random() * bloodGroups.length)];

      await db.execute(
        `INSERT INTO members (
          form_no, member_code, name, father_name, date_of_admission, 
          phone, email, aadhaar_number, blood_group, alternative_number, 
          dob, member_status, address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          formNo, code, `${fName} ${lName}`, `Shri ${fatherFName} ${lName}`, '2026-01-01',
          phone, email, aadhaar, bg, altPhone,
          '1990-05-15', 'Active', `Ward No ${i % 10 + 1}, KPNS District`
        ]
      );
      seededCount++;
    }

    res.json({ success: true, seededCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk-upload', async (req, res) => {
  try {
    const { members: memberList } = req.body;
    if (!Array.isArray(memberList) || memberList.length === 0) {
      return res.status(400).json({ error: 'No member records provided for upload' });
    }

    const existingCountObj = await db.queryOne('SELECT COUNT(*) as count FROM members');
    let currentCount = existingCountObj.count;
    const events = await db.queryAll('SELECT id, contribution_amount FROM events');

    const cleanVal = (val, defaultVal = '') => {
      if (val === null || val === undefined) return defaultVal;
      const str = String(val).trim();
      if (!str || str === '-' || str === '--' || str === 'N/A' || str === 'n/a') return defaultVal;
      return str;
    };

    const cleanDateVal = (val, defaultVal = null) => {
      const cleaned = cleanVal(val, null);
      if (!cleaned) return defaultVal;
      const dmyMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmyMatch) {
        const day = dmyMatch[1].padStart(2, '0');
        const month = dmyMatch[2].padStart(2, '0');
        const year = dmyMatch[3];
        return `${year}-${month}-${day}`;
      }
      return cleaned;
    };

    let insertedCount = 0;
    for (const m of memberList) {
      currentCount++;
      const name = cleanVal(m.name || m['REGISTER MEMBER'] || m['Name'] || m['Member Name']);
      if (!name) continue; // skip empty rows

      const form_no = cleanVal(m.form_no || m['FORM NO'] || m['Form No'], `F-${1000 + currentCount}`);
      const member_code = cleanVal(m.member_code || m['MEMBER ID'] || m['Member Code'], `KPNS-${String(currentCount).padStart(3, '0')}`);
      const father_name = cleanVal(m.father_name || m['FATHER NAME OF MEMBER'] || m['Father Name']);
      const date_of_admission = cleanDateVal(m.date_of_admission || m['DATE OF ADMISSION'] || m['Admission Date'], new Date().toISOString().slice(0, 10));
      const phone = cleanVal(m.phone || m['MOBILE NO'] || m['Mobile No'] || m['Phone'], '0000000000');
      const email = cleanVal(m.email || m['EMAIL ID'] || m['Email']);
      const aadhaar_number = cleanVal(m.aadhaar_number || m['AADHAAR NUMBER'] || m['Aadhaar']);
      const blood_group = cleanVal(m.blood_group || m['BLOOD GROUP'] || m['Blood Group'], 'O+');
      const alternative_number = cleanVal(m.alternative_number || m['ALTERNATIVE NUMBER'] || m['Alt Mobile']);
      const dob = cleanDateVal(m.dob || m['DOB'] || m['Date of Birth'], null);
      const member_status = cleanVal(m.member_status || m['MEMBER STATUS'] || m['Status'], 'Active');
      const address = cleanVal(m.address || m['ADDRESS'] || m['Address']);

      const result = await db.execute(
        `INSERT INTO members (
          form_no, member_code, name, father_name, date_of_admission, 
          phone, email, aadhaar_number, blood_group, alternative_number, 
          dob, member_status, address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          form_no, member_code, name, father_name, date_of_admission,
          phone, email, aadhaar_number, blood_group, alternative_number,
          dob, member_status, address
        ]
      );

      // Auto impose existing events on new member only if active
      const mStatus = member_status || 'Active';
      if (mStatus.toUpperCase() === 'ACTIVE') {
        for (const evt of events) {
          await db.execute(
            `INSERT INTO event_dues (event_id, member_id, amount, paid_amount, status) VALUES (?, ?, ?, 0, 'pending')`,
            [evt.id, result.lastID, evt.contribution_amount]
          );
        }
      }

      insertedCount++;
    }

    res.json({ success: true, count: insertedCount, message: `Successfully bulk uploaded ${insertedCount} members!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// Get member passbook for custom date range with PREVIOUS BALANCE calculation
router.get('/:id/passbook', async (req, res) => {
  try {
    const memberId = req.params.id;
    const { from_date, to_date } = req.query;

    const member = await db.queryOne('SELECT * FROM members WHERE id = ?', [memberId]);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    let fromFilter = from_date || '1970-01-01';
    let toFilter = to_date || '2099-12-31';

    const fromTs = `${fromFilter} 00:00:00`;
    const toTs = `${toFilter} 23:59:59`;

    // Fetch all dues and transactions for this member
    const allMemberDues = await db.queryAll('SELECT * FROM event_dues WHERE member_id = ?', [memberId]);
    const allMemberTransactions = await db.queryAll('SELECT * FROM transactions WHERE member_id = ?', [memberId]);

    // Fetch events lookup map
    const events = await db.queryAll('SELECT id, title, contribution_amount, event_date FROM events');
    const eventMap = {};
    for (const e of events) eventMap[e.id] = e;

    // 1. Calculate PREVIOUS BALANCE before from_date
    let previousDueBalance = 0;
    let prevDonationsTotal = 0;

    for (const d of allMemberDues) {
      const ev = eventMap[d.event_id] || d.events || {};
      let eventDate = d.created_at || ev.created_at || d.event_date || ev.event_date || '';

      const relatedTxs = allMemberTransactions.filter(t => 
        (t.due_id && String(t.due_id) === String(d.id)) || 
        (t.event_id && String(t.event_id).split(',').map(s=>s.trim()).includes(String(d.event_id)))
      );
      if (relatedTxs.length > 0) {
        const earliestTxDate = relatedTxs.map(t => t.created_at).filter(Boolean).sort()[0];
        if (earliestTxDate && (!eventDate || earliestTxDate < eventDate)) {
          eventDate = earliestTxDate;
        }
      }

      const eventDateOnly = (eventDate || '').slice(0, 10);
      if (eventDateOnly && eventDateOnly < fromFilter) {
        previousDueBalance += (parseFloat(d.amount) || 0);
      }
    }

    for (const t of allMemberTransactions) {
      const txDate = t.created_at ? t.created_at.slice(0, 10) : '';
      if (txDate && txDate < fromFilter) {
        if (t.type === 'member_payment') {
          previousDueBalance -= (parseFloat(t.amount) || 0);
        } else if (t.type === 'member_donation') {
          prevDonationsTotal += (parseFloat(t.amount) || 0);
        }
      }
    }

    // 2. Fetch entries within range [from_date, to_date]
    const duesInRange = [];
    for (const d of allMemberDues) {
      const ev = eventMap[d.event_id] || d.events || {};
      let eventDate = d.created_at || ev.created_at || d.event_date || ev.event_date || '';

      // If a payment was recorded for this event/due before the event date, use earliest payment date
      const relatedTxs = allMemberTransactions.filter(t => 
        (t.due_id && String(t.due_id) === String(d.id)) || 
        (t.event_id && String(t.event_id).split(',').map(s=>s.trim()).includes(String(d.event_id)))
      );
      if (relatedTxs.length > 0) {
        const earliestTxDate = relatedTxs.map(t => t.created_at).filter(Boolean).sort()[0];
        if (earliestTxDate && (!eventDate || earliestTxDate < eventDate)) {
          eventDate = earliestTxDate;
        }
      }

      const eventDateOnly = (eventDate || '').slice(0, 10);
      const eventTitle = ev.title || d.event_title || 'Event Contribution';
      const contribAmt = parseFloat(d.contribution_amount || ev.contribution_amount || d.amount) || 0;

      if (!eventDateOnly || (eventDateOnly >= fromFilter && eventDateOnly <= toFilter)) {
        duesInRange.push({
          ref_id: d.id,
          entry_type: 'DUE_IMPOSED',
          description: eventTitle,
          contribution_amount: contribAmt,
          debit: parseFloat(d.amount) || 0,
          credit: 0,
          date: eventDate || new Date().toISOString()
        });
      }
    }

    const transactionsInRange = [];
    for (const t of allMemberTransactions) {
      const txDate = t.created_at ? t.created_at.slice(0, 10) : '';
      if (!txDate || (txDate >= fromFilter && txDate <= toFilter)) {
        const isPayment = t.type === 'member_payment';
        const entry_type = isPayment ? 'DUES_PAYMENT' : 'DONATION_PAYMENT';
        const eventTitle = t.event_title || (t.events ? t.events.title : 'General Payment / Donation');
        const notesStr = t.notes ? ` (${t.notes})` : '';
        const description = `${t.receipt_no || 'REC'} - ${eventTitle}${notesStr}`;

        transactionsInRange.push({
          ref_id: t.id,
          entry_type,
          description,
          debit: 0,
          credit: parseFloat(t.amount) || 0,
          date: t.created_at || new Date().toISOString(),
          receipt_no: t.receipt_no,
          tx_type: t.type
        });
      }
    }

    // Combine and sort chronologically (DUE_IMPOSED comes first if on same timestamp or date)
    const allEntries = [...duesInRange, ...transactionsInRange].sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      const dayA = (a.date || '').slice(0, 10);
      const dayB = (b.date || '').slice(0, 10);

      if (dayA !== dayB) return timeA - timeB;
      if (a.entry_type === 'DUE_IMPOSED' && b.entry_type !== 'DUE_IMPOSED') return -1;
      if (b.entry_type === 'DUE_IMPOSED' && a.entry_type !== 'DUE_IMPOSED') return 1;
      return timeA - timeB;
    });

    // Compute running balance line by line
    let runningDueBalance = previousDueBalance;
    const passbookLines = allEntries.map(item => {
      if (item.entry_type === 'DUE_IMPOSED') {
        runningDueBalance += item.debit;
      } else if (item.entry_type === 'DUES_PAYMENT') {
        runningDueBalance -= item.credit;
      }
      return {
        date: item.date,
        entry_type: item.entry_type,
        description: item.description,
        contribution_amount: item.contribution_amount || 0,
        debit: item.debit,
        credit: item.credit,
        receipt_no: item.receipt_no || null,
        due_balance: runningDueBalance
      };
    });

    res.json({
      member,
      from_date: fromFilter,
      to_date: toFilter,
      previous_due_balance: previousDueBalance,
      previous_donations_total: prevDonationsTotal,
      entries: passbookLines,
      current_due_balance: runningDueBalance
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET ALL DUES FOR A SPECIFIC MEMBER ──────────────────────────────────────
// GET /api/members/:memberId/dues
router.get('/:memberId/dues', async (req, res) => {
  try {
    const memberId = parseInt(req.params.memberId, 10);

    const dues = await db.queryAll(`
      SELECT ed.id, ed.event_id, ed.amount, ed.paid_amount, ed.status,
             e.title AS event_title, e.event_date, e.contribution_type
      FROM event_dues ed
      JOIN events e ON ed.event_id = e.id
      WHERE ed.member_id = ?
      ORDER BY e.event_date DESC
    `, [memberId]);

    res.json(dues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── IMPOSE EVENT DUE FOR A MEMBER (Admin) ──────────────────────────────────
// POST /api/members/:memberId/impose-due
// Body: { event_id, amount }
router.post('/:memberId/impose-due', async (req, res) => {
  try {
    const memberId = parseInt(req.params.memberId, 10);
    const { event_id, amount } = req.body;

    if (!event_id || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'event_id and a valid positive amount are required' });
    }

    // Fetch member — must be Active
    const member = await db.queryOne(`SELECT * FROM members WHERE id = ?`, [memberId]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if ((member.member_status || 'Active').toUpperCase() !== 'ACTIVE') {
      return res.status(400).json({ error: 'Dues can only be imposed on Active members' });
    }

    // Fetch event — must be Fixed contribution type
    const event = await db.queryOne(`SELECT * FROM events WHERE id = ?`, [event_id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if ((event.contribution_type || 'fixed') === 'flexible') {
      return res.status(400).json({ error: 'Cannot impose a fixed due for a Flexible contribution event' });
    }

    // Check for existing unpaid due for same member + event
    const existing = await db.queryOne(
      `SELECT * FROM event_dues WHERE event_id = ? AND member_id = ? AND status != 'completed'`,
      [event_id, memberId]
    );
    if (existing) {
      return res.status(400).json({
        error: `Member already has an outstanding (unpaid) due for this event (₹${parseFloat(existing.amount).toFixed(2)}). Revoke it first if needed.`
      });
    }

    const amountNum = parseFloat(amount);

    // Create the due entry
    await db.execute(
      `INSERT INTO event_dues (event_id, member_id, amount, paid_amount, status) VALUES (?, ?, ?, 0, 'pending')`,
      [event_id, memberId, amountNum]
    );

    res.json({
      success: true,
      message: `✅ ₹${amountNum.toFixed(2)} contribution imposed on ${member.name} for "${event.title}".`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REVOKE EVENT DUE FOR A MEMBER (Admin) ──────────────────────────────────
// DELETE /api/members/revoke-due/:dueId
router.delete('/revoke-due/:dueId', async (req, res) => {
  try {
    const dueId = parseInt(req.params.dueId, 10);

    const due = await db.queryOne(`SELECT * FROM event_dues WHERE id = ?`, [dueId]);
    if (!due) return res.status(404).json({ error: 'Due entry not found' });

    // Block revoke if any payment has been made
    if (parseFloat(due.paid_amount || 0) > 0) {
      return res.status(400).json({
        error: `This contribution has already been partially or fully paid (₹${parseFloat(due.paid_amount).toFixed(2)} paid). Paid contributions cannot be revoked.`
      });
    }

    if (due.status === 'completed') {
      return res.status(400).json({ error: 'Fully paid contributions cannot be revoked.' });
    }

    await db.execute(`DELETE FROM event_dues WHERE id = ?`, [dueId]);

    res.json({ success: true, message: '✅ Unpaid event contribution revoked successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
