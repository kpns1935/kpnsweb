let currentUser = null;
let membersList = [];
let eventsList = [];
let currentReceiptData = null;
let parsedExcelMembers = [];
let editingMemberId = null;

// ===================================
// TOAST NOTIFICATION ENGINE
// ===================================
function showToast(message, type = 'info', title = null, duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Prevent duplicate toast messages visible simultaneously
  const existingToasts = container.querySelectorAll('.toast-message');
  for (let msgEl of existingToasts) {
    if (msgEl.innerText === message) return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
    loading: '<div class="toast-spinner"></div>'
  };

  const titles = {
    success: title || 'Success',
    error: title || 'Error',
    warning: title || 'Warning',
    info: title || 'Notification',
    loading: title || 'Processing'
  };

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || 'ℹ'}</div>
    <div class="toast-content">
      <div class="toast-title">${titles[type]}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="dismissToast(this.parentElement)">&times;</button>
    ${type !== 'loading' ? `<div class="toast-progress" style="animation-duration: ${duration}ms;"></div>` : ''}
  `;

  container.appendChild(toast);

  if (type !== 'loading' && duration > 0) {
    setTimeout(() => {
      dismissToast(toast);
    }, duration);
  }

  return toast;
}

function dismissToast(toastEl) {
  if (!toastEl || toastEl.classList.contains('toast-hiding')) return;
  toastEl.classList.add('toast-hiding');
  setTimeout(() => {
    if (toastEl.parentElement) toastEl.parentElement.removeChild(toastEl);
  }, 300);
}

// Override window.alert to automatically use showToast
window.alert = function(msg) {
  showToast(String(msg), 'info');
};

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  // Set default dates
  const today = new Date().toISOString().slice(0, 10);
  if (document.getElementById('eDate')) document.getElementById('eDate').value = today;
  if (document.getElementById('expDate')) document.getElementById('expDate').value = today;
  if (document.getElementById('passbookToDate')) document.getElementById('passbookToDate').value = today;

  checkAuthSession().then(() => {
    if (currentUser) {
      // Load data after auth check to prevent race conditions
      loadDashboardData();
      loadMembersData();
      loadEventsData();
      loadTransactionsData();
      loadExpensesData();
      loadUsersData();
    }
  });
  
  // Initialize premium date picker globally
  // altInput: true  → displays DD/MM/YYYY to user
  // dateFormat: "Y-m-d" → real input value stays YYYY-MM-DD (backend-compatible)
  if (typeof flatpickr !== 'undefined') {
    flatpickr("input[type='date']", {
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d/m/Y",
      allowInput: true
    });
  }

});

// Check Session & Auth
async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    const roleBadge = document.getElementById('userRoleBadge');
    const authBtn = document.getElementById('authBtn');
    
    const appContainer = document.getElementById('appContainer');
    const loginPage = document.getElementById('loginPage');

    if (data.authenticated) {
      currentUser = data.user;
      
      if (loginPage) loginPage.classList.add('hidden');
      if (appContainer) appContainer.style.display = 'block';
      
      if (roleBadge) roleBadge.innerText = data.user.role.toUpperCase();
      const nameDisplay = document.getElementById('userNameDisplay');
      if (nameDisplay) nameDisplay.innerText = data.user.name || data.user.email;
      if (authBtn) {
        authBtn.innerText = 'Logout';
        authBtn.className = 'btn btn-outline btn-sm';
      }
      
      // Admin RBAC UI modifications
      const usersTabBtn = document.querySelector('button[onclick="switchTab(\'users\')"]');
      const restoreBtn = document.querySelector('button[onclick="openModal(\'importBackupModal\')"]');
      const eraseBtn = document.getElementById('eraseAllBtn');
      if (data.user.role === 'admin') {
        if (usersTabBtn) usersTabBtn.style.display = 'block';
        if (restoreBtn) restoreBtn.style.display = 'inline-block';
        if (eraseBtn) eraseBtn.style.display = 'inline-block';
      } else {
        if (usersTabBtn) usersTabBtn.style.display = 'none';
        if (restoreBtn) restoreBtn.style.display = 'none';
        if (eraseBtn) eraseBtn.style.display = 'none';
        
        // If they are on the users tab, kick them to dashboard
        const usersSection = document.getElementById('users');
        if (usersSection && usersSection.classList.contains('active')) {
          switchTab('dashboard');
        }
      }
    } else {
      currentUser = null;
      
      if (appContainer) appContainer.style.display = 'none';
      if (loginPage) loginPage.classList.remove('hidden');
      
      if (roleBadge) roleBadge.innerText = 'GUEST';
      if (authBtn) {
        authBtn.innerText = 'Login';
        authBtn.className = 'btn btn-emerald btn-sm';
      }
    }
  } catch (err) {
    console.error('Session check error:', err);
  }
}

function handleAuthButtonClick() {
  if (currentUser) {
    logout();
  } else {
    const loginPage = document.getElementById('loginPage');
    const appContainer = document.getElementById('appContainer');
    if (loginPage) loginPage.classList.remove('hidden');
    if (appContainer) appContainer.style.display = 'none';
  }
}

async function performLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.success) {
      currentUser = data.user;
      showToast(`Welcome back, ${data.user.name}!`, 'success', 'Login Successful');
      await checkAuthSession();
      loadDashboardData();
      loadMembersData();
      loadEventsData();
      loadTransactionsData();
      loadExpensesData();
      loadUsersData();
    } else {
      showToast(data.error || 'Login failed', 'error', 'Authentication Error');
    }
  } catch (err) {
    showToast('Login error occurred', 'error');
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  const loginPage = document.getElementById('loginPage');
  const appContainer = document.getElementById('appContainer');
  if (appContainer) appContainer.style.display = 'none';
  if (loginPage) loginPage.classList.remove('hidden');
  showToast('You have been logged out.', 'info');
}


// EXCEL BULK UPLOAD & TEMPLATE GENERATION
function downloadSampleExcelTemplate() {
  const sampleData = [
    {
      "FORM NO": "F-1001",
      "MEMBER ID": "KPNS-001",
      "REGISTER MEMBER": "Shri Ramratan Sharma",
      "FATHER NAME OF MEMBER": "Shri Mohanlal Sharma",
      "DATE OF ADMISSION": "2026-01-01",
      "MOBILE NO": "9876543210",
      "EMAIL ID": "ramratan@kpns.org",
      "AADHAAR NUMBER": "1234 5678 9012",
      "BLOOD GROUP": "O+",
      "ALTERNATIVE NUMBER": "9412345678",
      "DOB": "1985-05-15",
      "MEMBER STATUS": "Active",
      "ADDRESS": "Main Road, KPNS Village"
    },
    {
      "FORM NO": "F-1002",
      "MEMBER ID": "KPNS-002",
      "REGISTER MEMBER": "Smt. Sunita Verma",
      "FATHER NAME OF MEMBER": "Shri Ramesh Verma",
      "DATE OF ADMISSION": "2026-01-05",
      "MOBILE NO": "9812345678",
      "EMAIL ID": "sunita@kpns.org",
      "AADHAAR NUMBER": "9876 5432 1098",
      "BLOOD GROUP": "A+",
      "ALTERNATIVE NUMBER": "9498765432",
      "DOB": "1990-08-20",
      "MEMBER STATUS": "Active",
      "ADDRESS": "Ward No 3, KPNS Village"
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Members_Template");
  XLSX.writeFile(workbook, "KPNS_Member_Upload_Template.xlsx");
}

function exportMembersList() {
  if (!membersList || membersList.length === 0) {
    showToast('No members to export.', 'warning');
    return;
  }
  
  const exportData = membersList.map(m => ({
    "FORM NO": m.form_no || '',
    "MEMBER ID": m.member_code || '',
    "REGISTER MEMBER": m.name || '',
    "FATHER NAME OF MEMBER": m.father_name || '',
    "DATE OF ADMISSION": formatDate(m.date_of_admission),
    "MOBILE NO": cleanNumber(m.phone),
    "EMAIL ID": m.email || '',
    "AADHAAR NUMBER": cleanNumber(m.aadhaar_number),
    "BLOOD GROUP": m.blood_group || '',
    "ALTERNATIVE NUMBER": cleanNumber(m.alternative_number),
    "DOB": formatDate(m.dob),
    "MEMBER STATUS": m.member_status || '',
    "ADDRESS": m.address || '',
    "PENDING DUES": m.current_due_balance || 0
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "All_Members");
  XLSX.writeFile(workbook, "KPNS_All_Members_List.xlsx");
  showToast('Member list exported to Excel', 'success');
}

function parseExcelFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    parsedExcelMembers = XLSX.utils.sheet_to_json(worksheet);

    if (parsedExcelMembers.length === 0) {
      showToast('Selected Excel file contains no records.', 'warning');
      return;
    }

    // Fix date parsing for backend compatibility (YYYY-MM-DD)
    const formatExcelDate = (val) => {
      if (!val) return '';
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      if (typeof val === 'number') {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return d.toISOString().slice(0, 10);
      }
      return String(val);
    };

    parsedExcelMembers = parsedExcelMembers.map(m => {
      m['DATE OF ADMISSION'] = formatExcelDate(m['DATE OF ADMISSION'] || m['Admission Date'] || m['date_of_admission']);
      m['DOB'] = formatExcelDate(m['DOB'] || m['Date of Birth'] || m['dob']);
      return m;
    });

    document.getElementById('excelParsedCount').innerText = parsedExcelMembers.length;
    const tbody = document.getElementById('excelPreviewBody');
    tbody.innerHTML = parsedExcelMembers.slice(0, 5).map((m, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${m['REGISTER MEMBER'] || m['Name'] || m['member_name'] || '-'}</strong></td>
        <td>${m['FATHER NAME OF MEMBER'] || m['father_name'] || '-'}</td>
        <td>${cleanNumber(m['MOBILE NO'] || m['phone'])}</td>
        <td>${cleanNumber(m['AADHAAR NUMBER'] || m['aadhaar_number'])}</td>
        <td>${formatDate(m['DATE OF ADMISSION'])}</td>
        <td>${formatDate(m['DOB'])}</td>
      </tr>
    `).join('');

    document.getElementById('excelPreviewContainer').style.display = 'block';
    showToast(`Parsed ${parsedExcelMembers.length} records from Excel`, 'info');
  };
  reader.readAsArrayBuffer(file);
}

async function confirmBulkUpload() {
  if (parsedExcelMembers.length === 0) return;

  try {
    const res = await fetch('/api/members/bulk-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: parsedExcelMembers })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message, 'success');
      closeModal('excelUploadModal');
      document.getElementById('excelFileInput').value = '';
      document.getElementById('excelPreviewContainer').style.display = 'none';
      parsedExcelMembers = [];
      loadMembersData();
      loadDashboardData();
    } else {
      showToast(data.error || 'Bulk upload failed', 'error');
    }
  } catch (err) {
    showToast('Bulk upload error occurred', 'error');
  }
}

// DATABASE BACKUP & RESTORE
function exportDataBackup() {
  window.open('/api/backup/export-json', '_blank');
  showToast('Downloading database backup JSON...', 'info');
}

async function importDataBackup() {
  const fileInput = document.getElementById('backupFileInput');
  const file = fileInput.files[0];
  if (!file) {
    showToast('Please select a .json backup file to import', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const backupObj = JSON.parse(e.target.result);
      const res = await fetch('/api/backup/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: backupObj })
      });
      const data = await res.json();

      if (data.success) {
        showToast('Database restored successfully!', 'success');
        closeModal('importBackupModal');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast(data.error || 'Database restore failed', 'error');
      }
    } catch (err) {
      showToast('Invalid backup JSON format', 'error');
    }
  };
  reader.readAsText(file);
}



// 1. DASHBOARD METRICS & TABLES
async function loadDashboardData() {
  try {
    const res = await fetch('/api/reports/summary');
    const data = await res.json();

    document.getElementById('metricTotalIncome').innerText = formatINR(data.total_income);
    document.getElementById('metricTotalExpenses').innerText = formatINR(data.total_expenses);
    document.getElementById('metricNetBalance').innerText = formatINR(data.net_cash_balance);
    document.getElementById('metricPendingDues').innerText = formatINR(data.total_pending_dues);

    // Load recent events
    const evRes = await fetch('/api/events');
    const events = await evRes.json();
    const dashEvBody = document.getElementById('dashEventsBody');
    dashEvBody.innerHTML = events.slice(0, 5).map(e => `
      <tr>
        <td><strong>${e.title}</strong><br><small style="color: var(--text-muted);">${formatDate(e.event_date)}</small></td>
        <td>${formatINR(e.contribution_amount)}</td>
        <td><span class="text-emerald">${formatINR(e.total_collected)}</span> / ${formatINR(e.total_expected)}</td>
      </tr>
    `).join('') || '<tr><td colspan="3">No events created yet</td></tr>';

    // Load recent transactions
    const txRes = await fetch('/api/transactions');
    const txs = await txRes.json();
    const dashTxBody = document.getElementById('dashTxBody');
    dashTxBody.innerHTML = txs.slice(0, 5).map(t => `
      <tr>
        <td><strong class="text-gold">${t.receipt_no}</strong></td>
        <td>${t.member_name || t.outside_person_name || 'Outside Person'}</td>
        <td class="text-emerald">${formatINR(t.amount)}</td>
        <td><button class="btn btn-outline btn-sm" onclick="viewReceipt(${t.id})">👁️ Sleep</button></td>
      </tr>
    `).join('') || '<tr><td colspan="4">No transactions recorded yet</td></tr>';

    // Load upcoming birthdays
    const memRes = await fetch('/api/members');
    const allMembers = await memRes.json();
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const upcoming = allMembers
      .filter(m => m.dob && m.member_status === 'Active')
      .map(m => {
        const dob = new Date(m.dob);
        let nextBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (nextBirthday.getTime() < today.getTime()) {
          nextBirthday.setFullYear(today.getFullYear() + 1);
        }
        return { 
          ...m, 
          nextBirthday, 
          diff: nextBirthday.getTime() - today.getTime(),
          ageTurning: nextBirthday.getFullYear() - dob.getFullYear()
        };
      })
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 5);

    const dashBdayBody = document.getElementById('dashBirthdaysBody');
    if (dashBdayBody) {
      dashBdayBody.innerHTML = upcoming.map(m => {
        const bDayStr = `${m.nextBirthday.getFullYear()}-${String(m.nextBirthday.getMonth() + 1).padStart(2, '0')}-${String(m.nextBirthday.getDate()).padStart(2, '0')}`;
        const daysLeft = Math.ceil(m.diff / (1000 * 60 * 60 * 24));
        let daysBadge = '';
        if (daysLeft === 0) {
          daysBadge = `<span class="badge badge-completed">Today! 🎉</span>`;
        } else if (daysLeft === 1) {
          daysBadge = `<span class="badge badge-partial">Tomorrow! 🎂</span>`;
        } else {
          daysBadge = `<span class="badge badge-pending">${daysLeft} Days Left</span>`;
        }

        return `
          <tr>
            <td><strong>${m.name}</strong></td>
            <td>${cleanNumber(m.phone)}</td>
            <td>${formatDate(m.dob)}</td>
            <td class="text-emerald"><strong>${formatDate(bDayStr)}</strong></td>
            <td>${daysBadge}</td>
            <td><span class="badge badge-completed">${m.ageTurning} Years</span></td>
          </tr>
        `;
      }).join('') || '<tr><td colspan="6" style="text-align: center;">No upcoming birthdays found</td></tr>';
    }

  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

// 2. MEMBERS DATA MANAGEMENT
async function loadMembersData() {
  try {
    const res = await fetch('/api/members');
    membersList = await res.json();

    const tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = membersList.map(m => `
      <tr>
        <td><strong class="text-gold">${m.form_no || '-'}</strong></td>
        <td><strong>${m.member_code}</strong></td>
        <td><strong>${m.name}</strong></td>
        <td>${m.father_name || '-'}</td>
        <td>${formatDate(m.date_of_admission)}</td>
        <td>${cleanNumber(m.phone)}</td>
        <td>${cleanNumber(m.aadhaar_number)}</td>
        <td><span class="badge badge-partial">${m.blood_group || 'O+'}</span></td>
        <td>${cleanNumber(m.alternative_number)}</td>
        <td>${formatDate(m.dob)}</td>
        <td>
          <span class="badge ${m.member_status === 'Active' ? 'badge-completed' : 'badge-pending'}" 
                style="${currentUser && currentUser.role === 'admin' ? 'cursor: pointer;' : 'cursor: default;'}" 
                onclick="toggleMemberStatus(${m.id}, '${m.member_status || 'Active'}')" 
                title="${currentUser && currentUser.role === 'admin' ? 'Click to toggle status' : 'Status'}">
            ${(m.member_status || 'Active').toUpperCase()}
          </span>
        </td>
        <td class="${m.current_due_balance > 0 ? 'text-rose' : 'text-emerald'}"><strong>${formatINR(m.current_due_balance)}</strong></td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-outline btn-sm" onclick="openPassbookForMember(${m.id})">📖 Passbook</button>
            ${currentUser && currentUser.role === 'admin' ? `
              <button class="btn btn-outline btn-sm" onclick="editMember(${m.id})">✏️ Edit</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="13" style="text-align: center;">No members found. Click "Seed Sample 50 Members" to add initial members.</td></tr>';

    // Populate dropdowns
    populateMemberDropdowns();
  } catch (err) {
    console.error('Members load error:', err);
  }
}

function populateMemberDropdowns() {
  const selects = ['txMemberId', 'passbookMemberSelect'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = `<option value="">-- Choose Member --</option>` +
      membersList.map(m => `<option value="${m.id}">${m.member_code} - ${m.name} (S/O ${m.father_name || 'N/A'}) [${m.phone}]</option>`).join('');
    sel.value = currentVal;
  });
}

async function saveMember(e) {
  e.preventDefault();
  const form_no = document.getElementById('mFormNo').value;
  const member_code = document.getElementById('mCode').value;
  const name = document.getElementById('mName').value;
  const father_name = document.getElementById('mFatherName').value;
  const date_of_admission = document.getElementById('mDateOfAdmission').value;
  const phone = document.getElementById('mPhone').value;
  const email = document.getElementById('mEmail').value;
  const aadhaar_number = document.getElementById('mAadhaar').value;
  const blood_group = document.getElementById('mBloodGroup').value;
  const alternative_number = document.getElementById('mAltPhone').value;
  const dob = document.getElementById('mDOB').value;
  const member_status = document.getElementById('mStatus').value;
  const address = document.getElementById('mAddress').value;

  const url = editingMemberId ? `/api/members/${editingMemberId}` : '/api/members';
  const method = editingMemberId ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      form_no, member_code, name, father_name, date_of_admission,
      phone, email, aadhaar_number, blood_group, alternative_number,
      dob, member_status, address
    })
  });

  const data = await res.json();
  if (data.success) {
    if (editingMemberId) {
      showToast(`Member updated successfully!`, 'success');
    } else {
      showToast(`Member registered! Form No: ${data.form_no}, Code: ${data.member_code}`, 'success');
    }
    closeModal('memberModal');
    document.getElementById('memberForm').reset();
    loadMembersData();
  } else {
    showToast(data.error || 'Failed to save member', 'error');
  }
}

function showAddMemberModal() {
  editingMemberId = null;
  document.getElementById('memberForm').reset();
  
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('mDateOfAdmission').value = today;
  
  const titleEl = document.getElementById('memberModalTitle');
  const submitBtnEl = document.getElementById('memberModalSubmitBtn');
  if (titleEl) titleEl.innerText = "Add New Member Registration";
  if (submitBtnEl) submitBtnEl.innerText = "Save Member Record";
  
  openModal('memberModal');
}

function editMember(id) {
  const member = membersList.find(m => m.id == id);
  if (!member) {
    showToast('Member not found', 'warning');
    return;
  }
  
  editingMemberId = id;
  
  document.getElementById('mFormNo').value = member.form_no || '';
  document.getElementById('mCode').value = member.member_code || '';
  document.getElementById('mName').value = member.name || '';
  document.getElementById('mFatherName').value = member.father_name || '';
  document.getElementById('mDateOfAdmission').value = member.date_of_admission ? member.date_of_admission.slice(0, 10) : '';
  document.getElementById('mPhone').value = member.phone || '';
  document.getElementById('mEmail').value = member.email || '';
  document.getElementById('mAadhaar').value = member.aadhaar_number || '';
  document.getElementById('mBloodGroup').value = member.blood_group || 'O+';
  document.getElementById('mAltPhone').value = member.alternative_number || '';
  document.getElementById('mDOB').value = member.dob ? member.dob.slice(0, 10) : '';
  document.getElementById('mStatus').value = member.member_status || 'Active';
  document.getElementById('mAddress').value = member.address || '';
  
  const titleEl = document.getElementById('memberModalTitle');
  const submitBtnEl = document.getElementById('memberModalSubmitBtn');
  if (titleEl) titleEl.innerText = "Edit Member Record";
  if (submitBtnEl) submitBtnEl.innerText = "Update Member Record";
  
  openModal('memberModal');
}


async function seedSampleMembers() {
  if (!confirm('This will seed 50 members if the list is empty. Proceed?')) return;
  const res = await fetch('/api/members/seed-sample-members', { method: 'POST' });
  const data = await res.json();
  showToast(data.message || `Successfully seeded 50 organization members!`, 'success');
  loadMembersData();
  loadDashboardData();
}

// 3. EVENTS MANAGEMENT
async function loadEventsData() {
  try {
    const res = await fetch('/api/events');
    eventsList = await res.json();

    const tbody = document.getElementById('eventsTableBody');
    tbody.innerHTML = eventsList.map(e => `
      <tr>
        <td><strong>${e.title}</strong></td>
        <td>${formatDate(e.event_date)}</td>
        <td class="text-gold"><strong>${formatINR(e.contribution_amount)}</strong></td>
        <td>${e.member_count} Members</td>
        <td>${formatINR(e.total_expected)}</td>
        <td class="text-emerald">${formatINR(e.total_collected)}</td>
        <td class="text-rose">${formatINR(e.total_expenses)}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="openEventReport(${e.id})">📊 Report</button>
            ${currentUser && currentUser.role === 'admin' ? `
              <button class="btn btn-outline btn-sm" onclick="editEvent(${e.id})">✏️ Edit</button>
              <button class="btn btn-rose btn-sm" onclick="deleteEvent(${e.id})">🗑️ Delete</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8" style="text-align: center;">No events created yet.</td></tr>';

    populateEventDropdowns();
  } catch (err) {
    console.error('Events load error:', err);
  }
}

function populateEventDropdowns() {
  // Populate checklist of events for Transactions
  const checklist = document.getElementById('txEventsCheckboxList');
  if (checklist) {
    checklist.innerHTML = eventsList.map(e => `
      <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer; color: var(--text-primary); padding: 4px; border-radius: 4px; transition: background 0.2s;">
        <input type="checkbox" name="txEventIds" value="${e.id}" style="width: auto; margin: 0;">
        <span>${e.title} (${formatDate(e.event_date)})</span>
      </label>
    `).join('') || '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 4px;">No events available.</div>';
  }

  // Keep dropdown list for other selects
  const selects = ['expEventId', 'expEditEventId', 'reportEventSelect'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = `<option value="">-- Optional Event --</option>` +
      eventsList.map(e => `<option value="${e.id}">${e.title} (${formatDate(e.event_date)})</option>`).join('');
    sel.value = currentVal;
  });
}

async function saveEvent(e) {
  e.preventDefault();
  const title = document.getElementById('eTitle').value;
  const contribution_amount = document.getElementById('eAmount').value;
  const event_date = document.getElementById('eDate').value;
  const description = document.getElementById('eDesc').value;

  const url = editingEventId ? `/api/events/${editingEventId}` : '/api/events';
  const method = editingEventId ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, contribution_amount, event_date, description })
  });
  const data = await res.json();
  if (data.success) {
    showToast(data.message || 'Event saved successfully.', 'success');
    closeModal('eventModal');
    document.getElementById('eventForm').reset();
    editingEventId = null;
    document.querySelector('#eventModal .modal-header h3').innerText = 'Create Event & Impose Contribution';
    document.querySelector('#eventForm button[type="submit"]').innerText = 'Create Event & Impose Dues';
    loadEventsData();
    loadMembersData();
    loadDashboardData();
  } else {
    showToast(data.error || 'Failed to create event', 'error');
  }
}

// 4. TRANSACTIONS & RECEIPT SLIPS
async function loadTransactionsData() {
  try {
    const res = await fetch('/api/transactions');
    const txs = await res.json();

    const tbody = document.getElementById('txTableBody');
    tbody.innerHTML = txs.map(t => `
      <tr>
        <td><strong class="text-gold">${t.receipt_no}</strong></td>
        <td>${formatDate(t.created_at)}</td>
        <td>
          <span class="badge ${t.type === 'member_payment' ? 'badge-completed' : (t.type === 'member_donation' ? 'badge-partial' : 'badge-pending')}">
            ${t.type === 'member_payment' ? 'Member Payment' : (t.type === 'member_donation' ? 'Member Donation' : 'Outside Donation')}
          </span>
        </td>
        <td><strong>${t.member_name || t.outside_person_name || '-'}</strong></td>
        <td class="text-emerald"><strong>${formatINR(t.amount)}</strong></td>
        <td>${t.payment_mode || 'Cash'}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="viewReceipt(${t.id})">🧾 Sleep</button>
            ${currentUser && currentUser.role === 'admin' ? `
              <button class="btn btn-outline btn-sm" onclick="editTransaction(${t.id})">✏️ Edit</button>
              <button class="btn btn-rose btn-sm" onclick="deleteTransaction(${t.id})">🗑️ Delete</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7" style="text-align: center;">No transactions found.</td></tr>';
  } catch (err) {
    console.error('Transactions load error:', err);
  }
}

// Edit Event
let editingEventId = null;
function editEvent(id) {
  const ev = eventsList.find(e => e.id == id);
  if (!ev) return;
  editingEventId = id;
  document.getElementById('eTitle').value = ev.title || '';
  document.getElementById('eAmount').value = ev.contribution_amount || '';
  document.getElementById('eDate').value = ev.event_date ? ev.event_date.slice(0, 10) : '';
  document.getElementById('eDesc').value = ev.description || '';
  document.querySelector('#eventModal .modal-header h3').innerText = 'Edit Event';
  document.querySelector('#eventForm button[type="submit"]').innerText = 'Update Event & Adjust Dues';
  openModal('eventModal');
}

async function deleteEvent(id) {
  const ev = eventsList.find(e => e.id == id);
  if (!ev) return;
  if (!confirm(`Delete event "${ev.title}"? This will remove all dues for this event from all member passbooks.`)) return;
  const res = await fetch(`/api/events/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) {
    showToast(data.message, 'success');
    loadEventsData();
    loadMembersData();
    loadDashboardData();
  } else {
    showToast(data.error || 'Failed to delete event', 'error');
  }
}

// Edit Transaction
let editingTxId = null;
let editingTxData = null;
function editTransaction(id) {
  const txEl = document.querySelector(`[onclick="editTransaction(${id})"]`);
  // Fetch from server to get full data
  fetch(`/api/transactions/${id}`).then(r => r.json()).then(tx => {
    editingTxId = id;
    editingTxData = tx;
    document.getElementById('txEditAmount').value = tx.amount || '';
    document.getElementById('txEditMode').value = tx.payment_mode || 'Cash';
    document.getElementById('txEditDate').value = tx.created_at ? tx.created_at.slice(0, 10) : '';
    document.getElementById('txEditNotes').value = tx.notes || '';
    document.getElementById('txEditReceiptNo').innerText = tx.receipt_no || '';
    document.getElementById('txEditName').innerText = tx.member_name || tx.outside_person_name || '-';
    openModal('txEditModal');
  });
}

async function saveEditTransaction(e) {
  e.preventDefault();
  const amount = document.getElementById('txEditAmount').value;
  const payment_mode = document.getElementById('txEditMode').value;
  const created_at = document.getElementById('txEditDate').value;
  const notes = document.getElementById('txEditNotes').value;
  const res = await fetch(`/api/transactions/${editingTxId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, payment_mode, created_at, notes })
  });
  const data = await res.json();
  if (data.success) {
    showToast('Transaction updated successfully!', 'success');
    closeModal('txEditModal');
    loadTransactionsData();
    loadMembersData();
    loadDashboardData();
  } else {
    showToast(data.error || 'Failed to update transaction', 'error');
  }
}

async function deleteTransaction(id) {
  if (!confirm('Delete this transaction? If it was a member payment, the dues balance will be reversed.')) return;
  const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) {
    showToast(data.message, 'success');
    loadTransactionsData();
    loadMembersData();
    loadDashboardData();
  } else {
    showToast(data.error || 'Failed to delete transaction', 'error');
  }
}

function toggleTxTypeFields() {
  const type = document.getElementById('txType').value;
  if (type === 'outside_donation') {
    document.getElementById('txMemberGroup').style.display = 'none';
    document.getElementById('txOutsideGroup').style.display = 'block';
  } else {
    document.getElementById('txMemberGroup').style.display = 'block';
    document.getElementById('txOutsideGroup').style.display = 'none';
  }
}

async function saveTransaction(e) {
  e.preventDefault();
  const type = document.getElementById('txType').value;
  const member_id = document.getElementById('txMemberId').value;
  const outside_person_name = document.getElementById('txOutsideName').value;
  const outside_person_phone = document.getElementById('txOutsidePhone').value;
  const created_at = document.getElementById('txDate').value;
  
  // Retrieve all selected event IDs from checklist
  const selectedCheckboxes = document.querySelectorAll('input[name="txEventIds"]:checked');
  const eventIds = Array.from(selectedCheckboxes).map(cb => cb.value);
  const event_id = eventIds.join(',');

  const amount = document.getElementById('txAmount').value;
  const payment_mode = document.getElementById('txMode').value;
  const notes = document.getElementById('txNotes').value;
  const send_whatsapp = document.getElementById('txSendWhatsApp').checked;

  const res = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type, member_id, outside_person_name, outside_person_phone,
      event_id, amount, payment_mode, notes, send_whatsapp, created_at
    })
  });

  const data = await res.json();
  if (data.success) {
    showToast(`Transaction recorded successfully! Receipt: ${data.receiptNo}`, 'success');
    closeModal('transactionModal');
    document.getElementById('txForm').reset();
    loadTransactionsData();
    loadMembersData();
    loadDashboardData();
    viewReceipt(data.transactionId);
  } else {
    showToast(data.error || 'Failed to save transaction', 'error');
  }
}

// VIEW & GENERATE SLEEP (RECEIPT) CARD
async function viewReceipt(id) {
  try {
    const res = await fetch(`/api/transactions/${id}`);
    const tx = await res.json();
    currentReceiptData = tx;

    document.getElementById('rNo').innerText = tx.receipt_no;
    document.getElementById('rDate').innerText = formatDate(tx.created_at);
    document.getElementById('rName').innerText = tx.member_name || tx.outside_person_name || 'Valued Supporter';

    // Member ID — show only for member transactions
    const memberIdRow = document.getElementById('rMemberIdRow');
    if (tx.member_code) {
      document.getElementById('rMemberId').innerText = tx.member_code;
      memberIdRow.style.display = '';
    } else {
      memberIdRow.style.display = 'none';
    }

    document.getElementById('rPhone').innerText = cleanNumber(tx.member_phone || tx.outside_person_phone) || 'N/A';
    document.getElementById('rEvent').innerText = tx.event_title || 'General Fund / Organization Purpose';
    document.getElementById('rAmount').innerText = formatINR(tx.amount);
    document.getElementById('rMode').innerText = tx.payment_mode || 'Cash';
    document.getElementById('rAmountInWords').innerText = amountInWords(tx.amount);
    document.getElementById('rNotes').innerText = tx.notes || '-';

    const tagEl = document.getElementById('rTag');
    if (tx.type === 'member_payment') tagEl.innerText = 'MEMBER DUES PAYMENT';
    else if (tx.type === 'member_donation') tagEl.innerText = 'MEMBER DONATION';
    else tagEl.innerText = 'Well Wisher Donation';

    openModal('receiptModal');
  } catch (err) {
    showToast('Could not load receipt details', 'error');
  }
}

// Download Receipt Sleep as Picture File (PNG) using HTML2Canvas
function downloadReceiptPicture() {
  const element = document.getElementById('receiptSlipCard');
  html2canvas(element, { scale: 2 }).then(canvas => {
    const link = document.createElement('a');
    link.download = `Receipt_${currentReceiptData?.receipt_no || 'KPNS'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

// Dispatch Direct WhatsApp link or Twilio API
function dispatchWhatsAppDirect() {
  if (!currentReceiptData) return;
  const recipientPhone = currentReceiptData.member_phone || currentReceiptData.outside_person_phone || '';
  const recipientName = currentReceiptData.member_name || currentReceiptData.outside_person_name || 'Member';

  let cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
  if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

  const msgText = encodeURIComponent(
    `🚩 *KPNS Organization Transaction Receipt*\n\n` +
    `Dear ${recipientName},\n` +
    `Thank you for your payment/donation to KPNS Organization.\n\n` +
    `📋 *Receipt No:* ${currentReceiptData.receipt_no}\n` +
    `💰 *Amount:* ${formatINR(currentReceiptData.amount)}\n` +
    `📌 *Type:* ${currentReceiptData.type}\n` +
    `📅 *Date:* ${formatDate(currentReceiptData.created_at)}\n` +
    `\nThank you for supporting KPNS Organization!`
  );

  if (cleanPhone) {
    window.open(`https://wa.me/${cleanPhone}?text=${msgText}`, '_blank');
  } else {
    showToast('No phone number attached to this receipt.', 'warning');
  }
}

// 5. EXPENSES MANAGEMENT
async function loadExpensesData() {
  try {
    const res = await fetch('/api/expenses');
    const expenses = await res.json();

    const tbody = document.getElementById('expenseTableBody');
    tbody.innerHTML = expenses.map(ex => `
      <tr>
        <td><strong class="text-gold">${ex.voucher_no}</strong></td>
        <td>${formatDate(ex.expense_date)}</td>
        <td><strong>${ex.title}</strong></td>
        <td><span class="badge badge-partial">${ex.category.toUpperCase()}</span></td>
        <td>${ex.event_title || 'General Purpose'}</td>
        <td>${ex.paid_to || '-'}</td>
        <td class="text-rose"><strong>${formatINR(ex.amount)}</strong></td>
        <td>
          ${currentUser && currentUser.role === 'admin' ? `
            <div style="display:flex;gap:6px;">
              <button class="btn btn-outline btn-sm" onclick="editExpense(${ex.id})">✏️ Edit</button>
              <button class="btn btn-rose btn-sm" onclick="deleteExpense(${ex.id})">🗑️ Delete</button>
            </div>
          ` : '-'}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8" style="text-align: center;">No expenses recorded yet.</td></tr>';
  } catch (err) {
    console.error('Expenses load error:', err);
  }
}

async function saveExpense(e) {
  e.preventDefault();
  const title = document.getElementById('expTitle').value;
  const category = document.getElementById('expCategory').value;
  const event_id = document.getElementById('expEventId').value;
  const amount = document.getElementById('expAmount').value;
  const paid_to = document.getElementById('expPaidTo').value;
  const expense_date = document.getElementById('expDate').value;

  const res = await fetch('/api/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, category, event_id, amount, paid_to, expense_date })
  });

  const data = await res.json();
  if (data.success) {
    showToast(data.message, 'success');
    closeModal('expenseModal');
    document.getElementById('expenseForm').reset();
    loadExpensesData();
    loadDashboardData();
  } else {
    showToast(data.error || 'Failed to save expense', 'error');
  }
}

// Edit Expense
let editingExpenseId = null;
let expensesList = [];

function editExpense(id) {
  fetch('/api/expenses').then(r => r.json()).then(all => {
    const ex = all.find(e => e.id == id);
    if (!ex) return;
    editingExpenseId = id;
    document.getElementById('expEditVoucher').innerText = ex.voucher_no || '';
    document.getElementById('expEditTitle').value = ex.title || '';
    document.getElementById('expEditCategory').value = ex.category || 'general';
    document.getElementById('expEditEventId').value = ex.event_id || '';
    document.getElementById('expEditAmount').value = ex.amount || '';
    document.getElementById('expEditPaidTo').value = ex.paid_to || '';
    document.getElementById('expEditDate').value = ex.expense_date ? ex.expense_date.slice(0, 10) : '';
    openModal('expEditModal');
  });
}

async function saveEditExpense(e) {
  e.preventDefault();
  const title = document.getElementById('expEditTitle').value;
  const category = document.getElementById('expEditCategory').value;
  const event_id = document.getElementById('expEditEventId').value;
  const amount = document.getElementById('expEditAmount').value;
  const paid_to = document.getElementById('expEditPaidTo').value;
  const expense_date = document.getElementById('expEditDate').value;

  const res = await fetch(`/api/expenses/${editingExpenseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, category, event_id, amount, paid_to, expense_date })
  });
  const data = await res.json();
  if (data.success) {
    showToast('Expense updated successfully!', 'success');
    closeModal('expEditModal');
    loadExpensesData();
    loadDashboardData();
  } else {
    showToast(data.error || 'Failed to update expense', 'error');
  }
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense record? This action cannot be undone.')) return;
  const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) {
    showToast(data.message, 'success');
    loadExpensesData();
    loadDashboardData();
  } else {
    showToast(data.error || 'Failed to delete expense', 'error');
  }
}

// 6. PASSBOOK GENERATOR WITH PREVIOUS BALANCE
function openPassbookForMember(memberId) {
  switchTab('passbook');
  document.getElementById('passbookMemberSelect').value = memberId;
  loadPassbook();
}

async function loadPassbook() {
  const memberId = document.getElementById('passbookMemberSelect').value;
  if (!memberId) return;

  // Helper: converts DD/MM/YYYY → YYYY-MM-DD; passes YYYY-MM-DD through unchanged
  const normDate = (val) => {
    if (!val) return '';
    const ddmmyyyy = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    return val; // Already YYYY-MM-DD
  };

  const fromDate = normDate(document.getElementById('passbookFromDate').value);
  const toDate   = normDate(document.getElementById('passbookToDate').value);

  let url = `/api/members/${memberId}/passbook?1=1`;
  if (fromDate) url += `&from_date=${fromDate}`;
  if (toDate)   url += `&to_date=${toDate}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    document.getElementById('passbookMemberName').innerText = `${data.member.name} (S/O ${data.member.father_name || 'N/A'})`;
    document.getElementById('passbookMemberCode').innerText = `Form No: ${data.member.form_no || '-'} | Member ID: ${data.member.member_code} | Mobile: ${data.member.phone} | Status: ${data.member.member_status || 'Active'}`;

    document.getElementById('passbookPeriodText').innerText = `${formatDate(data.from_date)} to ${formatDate(data.to_date)}`;
    
    document.getElementById('passbookPrevDue').innerText = formatINR(data.previous_due_balance);
    document.getElementById('passbookCurrentDue').innerText = formatINR(data.current_due_balance);

    const tbody = document.getElementById('passbookTableBody');
    
    let html = `
      <tr style="background: rgba(245, 158, 11, 0.1);">
        <td><strong>${formatDate(data.from_date)}</strong></td>
        <td><span class="badge badge-partial">OPENING BALANCE</span></td>
        <td><strong>PREVIOUS DUE BALANCE BEFORE ${formatDate(data.from_date)}</strong></td>
        <td>-</td>
        <td>-</td>
        <td class="text-gold"><strong>${formatINR(data.previous_due_balance)}</strong></td>
      </tr>
    `;

    if (data.entries && data.entries.length > 0) {
      html += data.entries.map(item => `
        <tr>
          <td>${formatDate(item.date)}</td>
          <td>
            <span class="badge ${item.entry_type === 'DUE_IMPOSED' ? 'badge-pending' : (item.entry_type === 'DUES_PAYMENT' ? 'badge-completed' : 'badge-partial')}">
              ${item.entry_type}
            </span>
          </td>
          <td>${item.description}</td>
          <td class="text-rose">${item.debit > 0 ? formatINR(item.debit) : '-'}</td>
          <td class="text-emerald">${item.credit > 0 ? formatINR(item.credit) : '-'}</td>
          <td><strong class="${item.due_balance > 0 ? 'text-rose' : 'text-emerald'}">${formatINR(item.due_balance)}</strong></td>
        </tr>
      `).join('');
    } else {
      html += `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No transaction activity found in selected date range.</td></tr>`;
    }

    tbody.innerHTML = html;
  } catch (err) {
    console.error('Passbook load error:', err);
  }
}

// Download Passbook picture statement using html2canvas
function downloadPassbookImage() {
  const container = document.getElementById('passbookRenderContainer');
  html2canvas(container, { scale: 2 }).then(canvas => {
    const link = document.createElement('a');
    link.download = `KPNS_Passbook_${document.getElementById('passbookMemberName').innerText}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

// 7. BALANCE SHEET REPORTS ENGINE
function toggleReportFilters() {
  const type = document.getElementById('reportTypeSelect').value;
  document.getElementById('filterYearGroup').style.display = type === 'yearly' ? 'block' : 'none';
  document.getElementById('filterEventGroup').style.display = type === 'event' ? 'block' : 'none';
  document.getElementById('filterCustomGroup').style.display = type === 'custom' ? 'flex' : 'none';
}

async function generateReport() {
  const type = document.getElementById('reportTypeSelect').value;
  const container = document.getElementById('reportContainer');
  let url = '';

  if (type === 'yearly') {
    const yr = document.getElementById('reportYear').value || 2026;
    url = `/api/reports/yearly?year=${yr}`;
  } else if (type === 'event') {
    const evId = document.getElementById('reportEventSelect').value;
    if (!evId) { alert('Please select an event'); return; }
    url = `/api/reports/event/${evId}`;
  } else {
    const from = document.getElementById('reportFromDate').value;
    const to = document.getElementById('reportToDate').value;
    if (!from || !to) { alert('Please choose both From and To dates'); return; }
    url = `/api/reports/custom?from_date=${from}&to_date=${to}`;
  }

  try {
    const res = await fetch(url);
    const rData = await res.json();

    if (type === 'event') {
      renderEventReportView(rData, container);
    } else {
      renderFinancialReportView(rData, container);
    }
  } catch (err) {
    showToast('Failed to generate report', 'error');
  }
}

function openEventReport(eventId) {
  switchTab('reports');
  document.getElementById('reportTypeSelect').value = 'event';
  toggleReportFilters();
  document.getElementById('reportEventSelect').value = eventId;
  generateReport();
}

function renderFinancialReportView(data, container) {
  container.innerHTML = `
    <div style="border-bottom: 2px stroke var(--border-color); padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 style="color: var(--accent-gold); font-size: 1.5rem;">KPNS ORGANIZATION - BALANCE SHEET REPORT</h2>
        <p style="color: var(--text-secondary);">Type: ${data.report_type} | Period: ${formatDate(data.from_date)} to ${formatDate(data.to_date)}</p>
      </div>
      <img src="assets/logo.png" style="width: 50px; height: 50px;">
    </div>

    <div class="metrics-grid" style="margin-bottom: 24px;">
      <div class="metric-card emerald">
        <span class="metric-title">Total Income / Collection</span>
        <span class="metric-value text-emerald">${formatINR(data.total_income)}</span>
      </div>
      <div class="metric-card rose">
        <span class="metric-title">Total Expenses</span>
        <span class="metric-value text-rose">${formatINR(data.total_expenses)}</span>
      </div>
      <div class="metric-card blue">
        <span class="metric-title">Net Surplus / Balance</span>
        <span class="metric-value text-gold">${formatINR(data.net_balance)}</span>
      </div>
    </div>

    <h3 style="margin-bottom: 12px; color: var(--accent-gold);">Income & Revenue Ledger (${data.transactions.length} Records)</h3>
    <div class="table-responsive" style="margin-bottom: 24px;">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Receipt No</th>
            <th>Type</th>
            <th>Received From</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${data.transactions.map(t => `
            <tr>
              <td>${formatDate(t.created_at)}</td>
              <td><strong class="text-gold">${t.receipt_no}</strong></td>
              <td>${t.type}</td>
              <td>${t.member_name || t.outside_person_name || '-'}</td>
              <td class="text-emerald"><strong>${formatINR(t.amount)}</strong></td>
            </tr>
          `).join('') || '<tr><td colspan="5">No income transactions in this period.</td></tr>'}
        </tbody>
      </table>
    </div>

    <h3 style="margin-bottom: 12px; color: var(--accent-rose);">Expense Ledger (${data.expenses.length} Records)</h3>
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Voucher No</th>
            <th>Title</th>
            <th>Category</th>
            <th>Paid To</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${data.expenses.map(e => `
            <tr>
              <td>${formatDate(e.expense_date)}</td>
              <td><strong class="text-gold">${e.voucher_no}</strong></td>
              <td>${e.title}</td>
              <td>${e.category}</td>
              <td>${e.paid_to || '-'}</td>
              <td class="text-rose"><strong>${formatINR(e.amount)}</strong></td>
            </tr>
          `).join('') || '<tr><td colspan="6">No expenses recorded in this period.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderEventReportView(data, container) {
  const ev = data.event;
  container.innerHTML = `
    <div style="border-bottom: 2px stroke var(--border-color); padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 style="color: var(--accent-gold); font-size: 1.5rem;">EVENT BALANCE SHEET: ${ev.title.toUpperCase()}</h2>
        <p style="color: var(--text-secondary);">Event Date: ${formatDate(ev.event_date)} | Contribution Imposed: ${formatINR(ev.contribution_amount)} Per Member</p>
      </div>
      <img src="assets/logo.png" style="width: 50px; height: 50px;">
    </div>

    <div class="metrics-grid" style="margin-bottom: 24px;">
      <div class="metric-card">
        <span class="metric-title">Total Imposed Dues</span>
        <span class="metric-value">${formatINR(data.total_imposed_dues)}</span>
      </div>
      <div class="metric-card emerald">
        <span class="metric-title">Dues Collected</span>
        <span class="metric-value text-emerald">${formatINR(data.total_collected_dues)}</span>
      </div>
      <div class="metric-card rose">
        <span class="metric-title">Pending Dues</span>
        <span class="metric-value text-rose">${formatINR(data.total_pending_dues)}</span>
      </div>
      <div class="metric-card blue">
        <span class="metric-title">Event Expenses</span>
        <span class="metric-value text-rose">${formatINR(data.total_expenses)}</span>
      </div>
    </div>

    <h3 style="margin-bottom: 12px; color: var(--accent-gold);">Member Dues Collection Breakdown</h3>
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Member Code</th>
            <th>Member Name</th>
            <th>Imposed</th>
            <th>Paid</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.dues.map(d => `
            <tr>
              <td><strong class="text-gold">${d.member_code}</strong></td>
              <td>${d.member_name}</td>
              <td>${formatINR(d.amount)}</td>
              <td class="text-emerald">${formatINR(d.paid_amount)}</td>
              <td><span class="badge ${d.status === 'completed' ? 'badge-completed' : 'badge-pending'}">${d.status.toUpperCase()}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// 8. USERS MANAGEMENT
let usersList = [];

async function loadUsersData() {
  try {
    const res = await fetch('/api/auth/users');
    if (!res.ok) return; // Not admin or not authenticated
    const users = await res.json();
    if (!Array.isArray(users)) return;

    usersList = users; // Cache for editUser

    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${u.id}</td>
        <td><strong>${u.name}</strong></td>
        <td>${u.email}</td>
        <td><span class="badge badge-completed">${u.role.toUpperCase()}</span></td>
        <td>${formatDate(u.created_at)}</td>
        <td>
          ${currentUser && currentUser.role === 'admin' ? `
            <div style="display:flex;gap:6px;">
              <button class="btn btn-outline btn-sm" onclick="editUser(${u.id})">&#9999;&#65039; Edit</button>
              ${u.email !== 'kpnsclub@gmail.com' ? `<button class="btn btn-rose btn-sm" onclick="deleteUser(${u.id})">&#128465;&#65039; Delete</button>` : `<span style="font-size:0.75rem;color:var(--text-muted);padding:4px 8px;">🔒 Default</span>`}
            </div>
          ` : '-'}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6">No app users.</td></tr>';
  } catch (err) {
    console.error('Users load error:', err);
  }
}

async function saveUser(e) {
  e.preventDefault();
  const name = document.getElementById('uName').value;
  const email = document.getElementById('uEmail').value;
  const password = document.getElementById('uPassword').value;
  const role = document.getElementById('uRole').value;

  const res = await fetch('/api/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, role })
  });

  const data = await res.json();
  if (data.success) {
    showToast('User created successfully', 'success');
    closeModal('userModal');
    document.getElementById('userForm').reset();
    loadUsersData();
  } else {
    showToast(data.error || 'Failed to create user', 'error');
  }
}

// Edit User
let editingUserId = null;

function editUser(id) {
  // Use cached list — no extra network call needed
  const u = usersList.find(x => x.id == id);
  if (!u) {
    showToast('User not found. Please refresh the page and try again.', 'warning');
    return;
  }
  editingUserId = u.id;
  document.getElementById('uEditName').value = u.name || '';
  document.getElementById('uEditEmail').value = u.email || '';
  document.getElementById('uEditPassword').value = '';

  const roleSelect = document.getElementById('uEditRole');
  // Set role — if the stored role doesn't match any option, add it temporarily
  const validRoles = ['admin', 'president', 'secretary', 'treasurer'];
  if (!validRoles.includes(u.role)) {
    const opt = document.createElement('option');
    opt.value = u.role;
    opt.text = u.role.charAt(0).toUpperCase() + u.role.slice(1) + ' (current)';
    roleSelect.appendChild(opt);
  }
  roleSelect.value = u.role;

  openModal('userEditModal');
}

async function saveEditUser(e) {
  e.preventDefault();
  const name = document.getElementById('uEditName').value;
  const email = document.getElementById('uEditEmail').value;
  const password = document.getElementById('uEditPassword').value;
  const role = document.getElementById('uEditRole').value;

  const res = await fetch(`/api/auth/users/${editingUserId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password: password || undefined, role })
  });
  const data = await res.json();
  if (data.success) {
    showToast('User updated successfully!', 'success');
    closeModal('userEditModal');
    loadUsersData();
  } else {
    showToast(data.error || 'Failed to update user', 'error');
  }
}

async function deleteUser(id) {
  if (!confirm('Delete this app user? They will no longer be able to log in.')) return;
  const res = await fetch(`/api/auth/users/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) {
    showToast(data.message, 'success');
    loadUsersData();
  } else {
    showToast(data.error || 'Failed to delete user', 'error');
  }
}

// Mobile Navigation Drawer Toggle
function toggleMobileMenu() {
  const nav = document.getElementById('mainNav');
  const overlay = document.getElementById('navOverlay');
  const btn = document.getElementById('mobileMenuBtn');
  if (!nav) return;

  const isOpen = nav.classList.contains('mobile-active');
  if (isOpen) {
    closeMobileMenu();
  } else {
    nav.classList.add('mobile-active');
    if (overlay) overlay.classList.add('active');
    if (btn) btn.innerText = '✕';
  }
}

function closeMobileMenu() {
  const nav = document.getElementById('mainNav');
  const overlay = document.getElementById('navOverlay');
  const btn = document.getElementById('mobileMenuBtn');
  if (nav) nav.classList.remove('mobile-active');
  if (overlay) overlay.classList.remove('active');
  if (btn) btn.innerText = '☰';
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  const tab = document.getElementById(tabId);
  if (tab) tab.classList.add('active');
  
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }

  // Close mobile drawer after selecting a tab
  closeMobileMenu();
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function openTransactionModal() {
  document.getElementById('txDate').value = new Date().toISOString().slice(0, 10);
  openModal('transactionModal');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function formatINR(amount) {
  if (amount === null || amount === undefined) return '₹0.00';
  const num = Number(amount);
  if (isNaN(num)) return '₹0.00';
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function amountInWords(num) {
  const a = ['','One ','Two ','Three ','Four ', 'Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
  const b = ['', '', 'Twenty','Thirty','Forty','Fifty', 'Sixty','Seventy','Eighty','Ninety'];
  if (num === null || num === undefined || isNaN(Number(num))) return '';
  if (Number(num) === 0) return 'Zero Rupees Only';
  let n = Math.floor(Number(num));
  if (n.toString().length > 9) return 'Overflow';
  let str = '';
  let crore = Math.floor(n / 10000000);
  if (crore > 0) {
    str += (crore < 20) ? a[crore] : b[Math.floor(crore / 10)] + (crore % 10 !== 0 ? ' ' + a[crore % 10] : ' ');
    str += 'Crore ';
    n %= 10000000;
  }
  let lakh = Math.floor(n / 100000);
  if (lakh > 0) {
    str += (lakh < 20) ? a[lakh] : b[Math.floor(lakh / 10)] + (lakh % 10 !== 0 ? ' ' + a[lakh % 10] : ' ');
    str += 'Lakh ';
    n %= 100000;
  }
  let thousand = Math.floor(n / 1000);
  if (thousand > 0) {
    str += (thousand < 20) ? a[thousand] : b[Math.floor(thousand / 10)] + (thousand % 10 !== 0 ? ' ' + a[thousand % 10] : ' ');
    str += 'Thousand ';
    n %= 1000;
  }
  let hundred = Math.floor(n / 100);
  if (hundred > 0) {
    str += a[hundred] + 'Hundred ';
    n %= 100;
  }
  if (n > 0) {
    if (str !== '') str += 'and ';
    str += (n < 20) ? a[n] : b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
  }
  return str.trim() + ' Rupees Only';
}

function cleanNumber(val) {
  if (!val) return '-';
  return String(val).replace(/\.0$/, '');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  // Normalise space-separated datetime (e.g. '2026-07-22 12:00:00') to ISO format
  const normalized = typeof dateStr === 'string' ? dateStr.replace(' ', 'T') : dateStr;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return String(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

async function toggleMemberStatus(memberId, currentStatus) {
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Only Admin users can change member status.');
    return;
  }
  const newStatus = (currentStatus === 'Active') ? 'Inactive' : 'Active';
  if (!confirm(`Change member status to ${newStatus}?`)) return;
  
  try {
    const res = await fetch(`/api/members/${memberId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      loadMembersData();
    } else {
      alert(data.error || 'Failed to change status');
    }
  } catch (err) {
    alert('Error changing status');
  }
}

async function eraseAllData() {
  if (!confirm("⚠️ WARNING: This will permanently erase ALL members, transactions, expenses, events, and other users. This action CANNOT be undone.\n\nAre you sure you want to proceed?")) {
    return;
  }
  const confirmation = prompt("To confirm erasure, type 'ERASE ALL':");
  if (confirmation !== 'ERASE ALL') {
    alert("Confirmation mismatch. Erasure canceled.");
    return;
  }
  
  try {
    const res = await fetch('/api/backup/erase', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      window.location.reload();
    } else {
      alert(data.error || 'Failed to erase data.');
    }
  } catch (err) {
    alert('An error occurred during database erasure.');
  }
}


