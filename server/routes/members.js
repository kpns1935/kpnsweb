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

// Add new member
router.post('/', async (req, res) => {
  try {
    const { 
      form_no, member_code, name, father_name, date_of_admission, 
      phone, email, aadhaar_number, blood_group, alternative_number, 
      dob, member_status, address 
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    // Auto-generate code if not provided
    let code = member_code;
    if (!code) {
      const countObj = await db.queryOne('SELECT COUNT(*) as count FROM members');
      code = 'KPNS-' + String(countObj.count + 1).padStart(3, '0');
    }

    let formNoVal = form_no;
    if (!formNoVal) {
      const countObj = await db.queryOne('SELECT COUNT(*) as count FROM members');
      formNoVal = 'F-' + String(1001 + countObj.count);
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

    // Automatically apply all existing event dues to this new member only if Active
    const mStatus = member_status || 'Active';
    if (mStatus.toUpperCase() === 'ACTIVE') {
      const events = await db.queryAll('SELECT id, contribution_amount FROM events');
      for (const evt of events) {
        await db.execute(
          `INSERT INTO event_dues (event_id, member_id, amount, paid_amount, status) VALUES (?, ?, ?, 0, 'pending')`,
          [evt.id, result.lastID, evt.contribution_amount]
        );
      }
    }

    res.json({ success: true, id: result.lastID, member_code: code, form_no: formNoVal });
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

    // 1. Calculate PREVIOUS BALANCE before from_date
    let previousDueBalance = 0;
    let prevDonationsTotal = 0;

    for (const d of allMemberDues) {
      const eventDate = d.event_date || (d.events ? d.events.event_date : '');
      if (eventDate && eventDate < fromFilter) {
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
      const eventDate = d.event_date || (d.events ? d.events.event_date : '');
      if (!eventDate || (eventDate >= fromFilter && eventDate <= toFilter)) {
        duesInRange.push({
          ref_id: d.id,
          entry_type: 'DUE_IMPOSED',
          description: d.event_title || (d.events ? d.events.title : 'Event Contribution'),
          debit: parseFloat(d.amount) || 0,
          credit: 0,
          date: eventDate || new Date().toISOString().slice(0, 10)
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

    // Combine and sort chronologically
    const allEntries = [...duesInRange, ...transactionsInRange].sort((a, b) => new Date(a.date) - new Date(b.date));

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

module.exports = router;
