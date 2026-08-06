let currentUser = null;
window.membersList = window.membersList || [];
window.eventsList = window.eventsList || [];
var membersList = window.membersList;
var eventsList = window.eventsList;
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

// Helper to check management roles (admin, president, secretary, treasurer, manager)
function isManagementRole(userOrRole) {
  if (!userOrRole) return false;
  const role = typeof userOrRole === 'object' ? (userOrRole.role || '') : userOrRole;
  if (!role) return false;
  const cleanRole = String(role).trim().toLowerCase();
  const validRoles = ['admin', 'president', 'secretary', 'treasurer', 'manager'];
  return validRoles.some(r => cleanRole.includes(r));
}

// Toggle Show/Hide Password
function togglePasswordVisibility(inputId = 'loginPassword', btnId = 'togglePasswordBtn') {
  const pwdInput = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!pwdInput) return;
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    if (btn) btn.innerHTML = '🙈';
  } else {
    pwdInput.type = 'password';
    if (btn) btn.innerHTML = '👁️';
  }
}

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
      
      const userInitial = (data.user.name || data.user.email || 'U').charAt(0).toUpperCase();
      const userAvatar = document.getElementById('userAvatar');
      if (userAvatar) userAvatar.innerText = userInitial;
      const userAvatarMobile = document.getElementById('userAvatarMobile');
      if (userAvatarMobile) userAvatarMobile.innerText = userInitial;

      if (roleBadge) roleBadge.innerText = data.user.role.toUpperCase();
      const roleBadgeMobile = document.getElementById('userRoleBadgeMobile');
      if (roleBadgeMobile) roleBadgeMobile.innerText = data.user.role.toUpperCase();
      
      const nameDisplay = document.getElementById('userNameDisplay');
      if (nameDisplay) nameDisplay.innerText = data.user.name || data.user.email;
      const nameDisplayMobile = document.getElementById('userNameDisplayMobile');
      if (nameDisplayMobile) nameDisplayMobile.innerText = data.user.name || data.user.email;
      
      if (authBtn) {
        authBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg> Logout';
        authBtn.className = 'dropdown-item';
      }
      const authBtnMobile = document.getElementById('authBtnMobile');
      if (authBtnMobile) {
        authBtnMobile.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;vertical-align:middle;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg> Logout';
      }
      
      // Users tab button is visible strictly for ADMIN users
      const usersTabBtns = document.querySelectorAll('button[onclick="switchTab(\'users\')"]');
      const backupBtn = document.getElementById('backupDataBtn');
      const restoreBtn = document.getElementById('restoreBackupBtn');
      const eraseBtn = document.getElementById('eraseAllBtn');
      const eraseDivider = document.getElementById('eraseDivider');
      const memberActionGroup = document.getElementById('memberActionButtonsGroup');
      const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
      const bulkUploadBtn = document.getElementById('bulkUploadBtn');
      const seedSampleBtn = document.getElementById('seedSampleBtn');
      
      const isAdmin = data.user && (data.user.role || '').toLowerCase() === 'admin';
      const isManager = data.user && isManagementRole(data.user);

      usersTabBtns.forEach(btn => {
        btn.style.display = isAdmin ? 'flex' : 'none';
      });

      if (backupBtn) backupBtn.style.display = isAdmin ? 'flex' : 'none';
      if (restoreBtn) restoreBtn.style.display = isAdmin ? 'flex' : 'none';
      if (eraseBtn) eraseBtn.style.display = isAdmin ? 'flex' : 'none';
      if (eraseDivider) eraseDivider.style.display = isAdmin ? 'block' : 'none';
      if (memberActionGroup) memberActionGroup.style.display = isManager ? 'flex' : 'none';

      // Admin-only member action buttons
      if (downloadTemplateBtn) downloadTemplateBtn.style.display = isAdmin ? 'inline-flex' : 'none';
      if (bulkUploadBtn) bulkUploadBtn.style.display = isAdmin ? 'inline-flex' : 'none';
      if (seedSampleBtn) seedSampleBtn.style.display = isAdmin ? 'inline-flex' : 'none';

      if (!isAdmin) {
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
      const roleBadgeMobile = document.getElementById('userRoleBadgeMobile');
      if (roleBadgeMobile) roleBadgeMobile.innerText = 'GUEST';
      
      if (authBtn) {
        authBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg> Login';
        authBtn.className = 'dropdown-item';
      }
      const authBtnMobile = document.getElementById('authBtnMobile');
      if (authBtnMobile) {
        authBtnMobile.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;vertical-align:middle;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg> Login';
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
      if (!val) return null;
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      if (typeof val === 'number') {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return d.toISOString().slice(0, 10);
      }
      const str = String(val).trim();
      if (!str) return null;
      // Convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
      const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmyMatch) {
        const day = dmyMatch[1].padStart(2, '0');
        const month = dmyMatch[2].padStart(2, '0');
        const year = dmyMatch[3];
        return `${year}-${month}-${day}`;
      }
      return str;
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
    window.membersList = membersList;

    // Populate dropdowns and filter/render table
    populateMemberDropdowns();
    filterMembersTable();
  } catch (err) {
    console.error('Members load error:', err);
  }
}

// ── MEMBER TABLE SAAS STATE & ENGINE ──────────────────────────────────────────
let memberStatusFilter = 'all'; // 'all', 'active', 'inactive', 'outstanding', 'nodue'
let memberSortKey = 'name';     // 'name', 'code', 'due_desc', 'date_desc'
let memberCurrentPage = 1;
let memberRowsPerPage = 20;
let selectedMemberIds = new Set();
let expandedMemberIds = new Set();

// Avatar Initials & HSL Color Generator
function getMemberInitials(name) {
  if (!name) return 'M';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(name) {
  if (!name) return 'linear-gradient(135deg, #3B82F6, #1D4ED8)';
  const colors = [
    'linear-gradient(135deg, #3B82F6, #1D4ED8)', // Blue
    'linear-gradient(135deg, #10B981, #047857)', // Emerald
    'linear-gradient(135deg, #F59E0B, #B45309)', // Amber
    'linear-gradient(135deg, #8B5CF6, #6D28D9)', // Purple
    'linear-gradient(135deg, #EC4899, #BE185D)', // Pink
    'linear-gradient(135deg, #06B6D4, #0E7490)', // Cyan
    'linear-gradient(135deg, #6366F1, #4338CA)', // Indigo
    'linear-gradient(135deg, #F43F5E, #BE123C)'  // Rose
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Update Top Executive Metrics
function updateMemberMetrics() {
  const total = membersList.length;
  const active = membersList.filter(m => (m.member_status || 'Active').toUpperCase() === 'ACTIVE').length;
  const inactive = membersList.filter(m => (m.member_status || 'Active').toUpperCase() === 'INACTIVE').length;
  const totalDues = membersList.reduce((acc, m) => acc + (parseFloat(m.current_due_balance) || 0), 0);

  const elTotal = document.getElementById('mMetricTotalCount');
  const elActive = document.getElementById('mMetricActiveCount');
  const elInactive = document.getElementById('mMetricInactiveCount');
  const elDues = document.getElementById('mMetricTotalDues');

  if (elTotal) elTotal.textContent = total;
  if (elActive) elActive.textContent = active;
  if (elInactive) elInactive.textContent = inactive;
  if (elDues) elDues.textContent = formatINR(totalDues);
}

function setMemberStatusFilter(status) {
  memberStatusFilter = status;
  memberCurrentPage = 1;

  const chips = ['all', 'active', 'inactive', 'outstanding', 'nodue'];
  chips.forEach(c => {
    const chipId = 'mChip' + c.charAt(0).toUpperCase() + c.slice(1);
    const chip = document.getElementById(chipId);
    if (!chip) return;
    if (c === status) chip.classList.add('active');
    else chip.classList.remove('active');
  });

  filterMembersTable();
}

function setMemberSort(sortKey) {
  memberSortKey = sortKey;
  memberCurrentPage = 1;
  filterMembersTable();
}

function filterMembersTable() {
  updateMemberMetrics();

  const rawQuery = (document.getElementById('memberSearchInput')?.value || '').trim().toLowerCase();
  const clearBtn = document.getElementById('memberSearchClearBtn');

  if (clearBtn) clearBtn.style.display = (rawQuery || memberStatusFilter !== 'all') ? 'inline-flex' : 'none';

  // Compute live filter chip counts
  const countAll = membersList.length;
  const countActive = membersList.filter(m => (m.member_status || 'Active').toUpperCase() === 'ACTIVE').length;
  const countInactive = membersList.filter(m => (m.member_status || 'Active').toUpperCase() === 'INACTIVE').length;
  const countOutstanding = membersList.filter(m => parseFloat(m.current_due_balance || 0) > 0).length;
  const countNoDue = membersList.filter(m => parseFloat(m.current_due_balance || 0) <= 0).length;

  if (document.getElementById('mCountAll')) document.getElementById('mCountAll').textContent = countAll;
  if (document.getElementById('mCountActive')) document.getElementById('mCountActive').textContent = countActive;
  if (document.getElementById('mCountInactive')) document.getElementById('mCountInactive').textContent = countInactive;
  if (document.getElementById('mCountOutstanding')) document.getElementById('mCountOutstanding').textContent = countOutstanding;
  if (document.getElementById('mCountNoDue')) document.getElementById('mCountNoDue').textContent = countNoDue;

  // Filter members list
  let filtered = membersList.filter(m => {
    const status = (m.member_status || 'Active').toLowerCase();
    const dueBal = parseFloat(m.current_due_balance || 0);

    if (memberStatusFilter === 'active' && status !== 'active') return false;
    if (memberStatusFilter === 'inactive' && status !== 'inactive') return false;
    if (memberStatusFilter === 'outstanding' && dueBal <= 0) return false;
    if (memberStatusFilter === 'nodue' && dueBal > 0) return false;

    if (!rawQuery) return true;
    return (
      (m.member_code || '').toLowerCase().includes(rawQuery) ||
      (m.name || '').toLowerCase().includes(rawQuery) ||
      (m.father_name || '').toLowerCase().includes(rawQuery) ||
      (m.phone || '').toLowerCase().includes(rawQuery) ||
      (m.alternative_number || '').toLowerCase().includes(rawQuery) ||
      (m.email || '').toLowerCase().includes(rawQuery) ||
      (m.aadhaar_number || '').toLowerCase().includes(rawQuery) ||
      (m.address || '').toLowerCase().includes(rawQuery) ||
      (m.form_no || '').toLowerCase().includes(rawQuery)
    );
  });

  // Sort list
  filtered.sort((a, b) => {
    if (memberSortKey === 'name') return (a.name || '').localeCompare(b.name || '');
    if (memberSortKey === 'code') return (a.member_code || '').localeCompare(b.member_code || '');
    if (memberSortKey === 'due_desc') return (parseFloat(b.current_due_balance || 0) - parseFloat(a.current_due_balance || 0));
    if (memberSortKey === 'date_desc') return new Date(b.date_of_admission || 0) - new Date(a.date_of_admission || 0);
    return 0;
  });

  // Pagination
  const totalCount = filtered.length;
  const rowsPerPage = parseInt(memberRowsPerPage, 10);
  const totalPages = Math.ceil(totalCount / rowsPerPage) || 1;

  if (memberCurrentPage > totalPages) memberCurrentPage = totalPages;
  if (memberCurrentPage < 1) memberCurrentPage = 1;

  const startIndex = (memberCurrentPage - 1) * rowsPerPage;
  const pageItems = filtered.slice(startIndex, startIndex + rowsPerPage);

  // Render Desktop Table Body (#membersTableBody)
  const tbody = document.getElementById('membersTableBody');
  const cardGrid = document.getElementById('membersCardGrid');

  if (tbody) {
    if (pageItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;padding:48px 20px;color:var(--text-muted);">
            <div style="font-size:2rem;margin-bottom:10px;">👥</div>
            <div style="font-weight:700;font-size:1.05rem;color:var(--text-primary);margin-bottom:4px;">No members found.</div>
            <div style="font-size:0.85rem;margin-bottom:14px;">Try adjusting your search criteria or filter chips.</div>
            <button class="btn btn-sm" onclick="showAddMemberModal()">+ Add Member</button>
          </td>
        </tr>`;
    } else {
      tbody.innerHTML = pageItems.map(m => {
        const isSelected = selectedMemberIds.has(m.id);
        const isExpanded = expandedMemberIds.has(m.id);
        const dueBal = parseFloat(m.current_due_balance || 0);
        const initials = getMemberInitials(m.name);
        const bgGradient = getAvatarColor(m.name);
        const isActive = (m.member_status || 'Active').toUpperCase() === 'ACTIVE';

        return `
          <tr class="member-row-main ${isSelected ? 'selected' : ''}">
            <td style="text-align:center;">
              <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelectMember(${m.id})" style="accent-color:var(--accent-primary);cursor:pointer;">
            </td>
            <td>
              <div class="member-cell-info">
                <div class="member-avatar-circle" style="background:${bgGradient};">${initials}</div>
                <div class="member-name-wrap">
                  <span class="member-name-clickable" onclick="openMemberProfileDrawer(${m.id})">${highlight(m.name, rawQuery)}</span>
                  <div class="member-sub-details">
                    <strong class="text-gold">${highlight(m.member_code, rawQuery)}</strong>
                    ${m.form_no ? `· <span>Form: ${highlight(m.form_no, rawQuery)}</span>` : ''}
                  </div>
                </div>
              </div>
            </td>
            <td>
              <div style="font-size:0.84rem;color:var(--text-primary);">📞 ${highlight(cleanNumber(m.phone), rawQuery)}</div>
              ${m.email ? `<div style="font-size:0.75rem;color:var(--text-muted);">✉️ ${highlight(m.email, rawQuery)}</div>` : ''}
            </td>
            <td>
              <span class="badge ${isActive ? 'badge-completed' : 'badge-pending'}"
                    style="${isManagementRole(currentUser) ? 'cursor:pointer;' : ''}"
                    onclick="toggleMemberStatus(${m.id}, '${m.member_status || 'Active'}')"
                    title="${isManagementRole(currentUser) ? 'Click to toggle status' : ''}">
                ${isActive ? '🟢 ACTIVE' : '🔴 INACTIVE'}
              </span>
            </td>
            <td>
              ${dueBal > 0
                ? `<div><span class="badge badge-pending" style="background:rgba(239,68,68,0.15);color:#F87171;font-weight:700;">🔴 ${formatINR(dueBal)}</span><br><small style="font-size:0.7rem;color:var(--text-muted);">Outstanding</small></div>`
                : `<span class="badge badge-completed" style="background:rgba(34,197,94,0.15);color:#34D399;font-weight:600;">✓ No Due</span>`
              }
            </td>
            <td>
              <div class="action-btn-group" style="justify-content: flex-end;">
                <button class="icon-action-btn" onclick="openPassbookForMember(${m.id})" title="View Passbook Statement">📒</button>
                <button class="icon-action-btn" onclick="openTransactionModal({memberId: ${m.id}})" title="Record Payment">💰</button>
                <button class="icon-action-btn" onclick="toggleMemberRowExpand(${m.id})" title="Toggle Details Sub-Card">
                  ${isExpanded ? '▲' : '▼'}
                </button>

                <div class="action-dropdown-wrapper">
                  <button class="icon-action-btn" onclick="toggleActionDropdown(${m.id}, event)" title="More Actions">⋮</button>
                  <div class="action-dropdown-menu" id="mDropdown_${m.id}">
                    <button class="dropdown-action-item" onclick="openMemberProfileDrawer(${m.id})">👤 View Profile</button>
                    <button class="dropdown-action-item" onclick="openPassbookForMember(${m.id})">📖 Passbook Statement</button>
                    <button class="dropdown-action-item" onclick="openTransactionModal({memberId: ${m.id}})">💰 Record Payment</button>
                    ${isManagementRole(currentUser) ? `
                      <button class="dropdown-action-item" onclick="openMemberDuesModal(${m.id})">📋 View Dues</button>
                      <button class="dropdown-action-item" onclick="openImposeDueModal(${m.id})">⚡ Impose Contribution</button>
                      <button class="dropdown-action-item" onclick="editMember(${m.id})">✏️ Edit Details</button>
                      <div style="border-top:1px solid var(--glass-border);margin:4px 0;"></div>
                      <button class="dropdown-action-item danger" onclick="deleteMember(${m.id})">🗑️ Delete Member</button>
                    ` : ''}
                  </div>
                </div>
              </div>
            </td>
          </tr>

          <!-- Expandable Sub-Row Accordion -->
          <tr class="member-row-expand ${isExpanded ? 'show' : ''}" id="mExpandRow_${m.id}">
            <td colspan="6" style="padding: 0 14px 10px 14px; border: none;">
              <div class="member-expand-card">
                <div class="expand-info-item">
                  <span class="expand-info-label">Father's Name</span>
                  <span class="expand-info-val">${m.father_name || 'N/A'}</span>
                </div>
                <div class="expand-info-item">
                  <span class="expand-info-label">Date of Admission</span>
                  <span class="expand-info-val">${formatDate(m.date_of_admission)}</span>
                </div>
                <div class="expand-info-item">
                  <span class="expand-info-label">Date of Birth</span>
                  <span class="expand-info-val">${formatDate(m.dob)}</span>
                </div>
                <div class="expand-info-item">
                  <span class="expand-info-label">Blood Group</span>
                  <span class="expand-info-val"><span class="badge badge-partial">${m.blood_group || 'O+'}</span></span>
                </div>
                <div class="expand-info-item">
                  <span class="expand-info-label">Aadhaar Number</span>
                  <span class="expand-info-val">${cleanNumber(m.aadhaar_number)}</span>
                </div>
                <div class="expand-info-item">
                  <span class="expand-info-label">Alt Mobile</span>
                  <span class="expand-info-val">${cleanNumber(m.alternative_number)}</span>
                </div>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // Render Mobile Cards Grid (#membersCardGrid)
  if (cardGrid) {
    if (pageItems.length === 0) {
      cardGrid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:32px; color:var(--text-muted);">No members found.</div>`;
    } else {
      cardGrid.innerHTML = pageItems.map(m => {
        const dueBal = parseFloat(m.current_due_balance || 0);
        const initials = getMemberInitials(m.name);
        const bgGradient = getAvatarColor(m.name);
        const isActive = (m.member_status || 'Active').toUpperCase() === 'ACTIVE';

        return `
          <div class="member-mobile-card">
            <div class="mobile-card-top">
              <div class="member-avatar-circle" style="background:${bgGradient};">${initials}</div>
              <div style="flex:1;min-width:0;">
                <div class="member-name-clickable" onclick="openMemberProfileDrawer(${m.id})">${m.name}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);">ID: <strong class="text-gold">${m.member_code}</strong> · Form: ${m.form_no || '-'}</div>
              </div>
              <span class="badge ${isActive ? 'badge-completed' : 'badge-pending'}" style="font-size:0.68rem;">
                ${isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;padding:6px 0;">
              <div>📞 ${cleanNumber(m.phone)}</div>
              <div>
                ${dueBal > 0
                  ? `<span style="color:#F87171;font-weight:700;">🔴 ${formatINR(dueBal)}</span>`
                  : `<span style="color:#34D399;font-weight:600;">✓ No Due</span>`
                }
              </div>
            </div>
            <div class="mobile-card-actions">
              <button class="btn btn-outline btn-sm" style="flex:1;" onclick="openPassbookForMember(${m.id})">📒 Passbook</button>
              <button class="btn btn-emerald btn-sm" style="flex:1;" onclick="openTransactionModal({memberId: ${m.id}})">💰 Payment</button>
              <button class="btn btn-outline btn-sm" onclick="openMemberProfileDrawer(${m.id})">⋮ More</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Update Pagination Controls
  renderMemberPagination(totalCount);
  updateBulkActionBar();
}

function highlight(text, query) {
  if (!text || !query) return text || '';
  const str = String(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return str.replace(new RegExp(`(${escaped})`, 'gi'),
    '<mark style="background:rgba(234,179,8,0.28);color:#FACC15;border-radius:2px;padding:0 1px;">$1</mark>');
}

function clearMemberSearch() {
  const input = document.getElementById('memberSearchInput');
  if (input) input.value = '';
  setMemberStatusFilter('all');
}

// ── ROW EXPANSION & ACTION DROPDOWNS ─────────────────────────────────────────
function toggleMemberRowExpand(id) {
  if (expandedMemberIds.has(id)) {
    expandedMemberIds.delete(id);
  } else {
    expandedMemberIds.add(id);
  }
  const subRow = document.getElementById(`mExpandRow_${id}`);
  if (subRow) subRow.classList.toggle('show');
}

function toggleActionDropdown(id, event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById(`mDropdown_${id}`);
  if (!menu) return;
  const isAlreadyShow = menu.classList.contains('show');
  document.querySelectorAll('.action-dropdown-menu.show').forEach(m => m.classList.remove('show'));
  if (!isAlreadyShow) menu.classList.add('show');
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.action-dropdown-wrapper')) {
    document.querySelectorAll('.action-dropdown-menu.show').forEach(m => m.classList.remove('show'));
  }
});

// ── MEMBER PROFILE DRAWER ────────────────────────────────────────────────────
async function openMemberProfileDrawer(memberId) {
  const member = membersList.find(m => m.id == memberId);
  if (!member) return;

  const backdrop = document.getElementById('memberDrawerBackdrop');
  const panel = document.getElementById('memberProfileDrawer');
  const body = document.getElementById('memberDrawerBody');

  if (backdrop) backdrop.classList.add('active');
  if (panel) panel.classList.add('open');

  const initials = getMemberInitials(member.name);
  const bgGradient = getAvatarColor(member.name);
  const dueBal = parseFloat(member.current_due_balance || 0);

  if (body) {
    body.innerHTML = `
      <div class="drawer-profile-top">
        <div class="drawer-avatar" style="background:${bgGradient};">${initials}</div>
        <div style="flex:1;min-width:0;">
          <h2 style="margin:0;font-size:1.2rem;color:var(--text-primary);font-weight:700;">${member.name}</h2>
          <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px;">
            Member ID: <strong class="text-gold">${member.member_code}</strong> · Form: <strong>${member.form_no || '-'}</strong>
          </div>
          <div style="margin-top:6px;">
            <span class="badge ${member.member_status === 'Active' ? 'badge-completed' : 'badge-pending'}">
              ${(member.member_status || 'Active').toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      <!-- Financial Overview Card -->
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;">Outstanding Dues</div>
          <div style="font-size:1.3rem;font-weight:800;" class="${dueBal > 0 ? 'text-rose' : 'text-emerald'}">
            ${dueBal > 0 ? `🔴 ${formatINR(dueBal)}` : '✓ Cleared (₹0)'}
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="openMemberDuesModal(${member.id})">📋 View Dues</button>
      </div>

      <!-- Quick Action Buttons -->
      <div class="drawer-quick-actions">
        <button class="btn btn-emerald btn-sm" style="flex:1;" onclick="openTransactionModal({memberId: ${member.id}})">💰 Record Payment</button>
        <button class="btn btn-outline btn-sm" style="flex:1;" onclick="openPassbookForMember(${member.id})">📖 Passbook</button>
        ${isManagementRole(currentUser) ? `
          <button class="btn btn-outline btn-sm" onclick="openImposeDueModal(${member.id})">⚡ Impose</button>
          <button class="btn btn-outline btn-sm" onclick="editMember(${member.id})">✏️ Edit</button>
        ` : ''}
      </div>

      <!-- Full Personal Details Grid -->
      <div>
        <h4 style="font-size:0.85rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Personal Details</h4>
        <div class="drawer-grid-details">
          <div><span style="color:var(--text-muted);font-size:0.75rem;">Father's Name</span><br><strong style="font-size:0.85rem;">${member.father_name || 'N/A'}</strong></div>
          <div><span style="color:var(--text-muted);font-size:0.75rem;">Admission Date</span><br><strong style="font-size:0.85rem;">${formatDate(member.date_of_admission)}</strong></div>
          <div><span style="color:var(--text-muted);font-size:0.75rem;">Mobile Number</span><br><strong style="font-size:0.85rem;">${cleanNumber(member.phone)}</strong></div>
          <div><span style="color:var(--text-muted);font-size:0.75rem;">Alt Mobile</span><br><strong style="font-size:0.85rem;">${cleanNumber(member.alternative_number)}</strong></div>
          <div><span style="color:var(--text-muted);font-size:0.75rem;">Aadhaar Number</span><br><strong style="font-size:0.85rem;">${cleanNumber(member.aadhaar_number)}</strong></div>
          <div><span style="color:var(--text-muted);font-size:0.75rem;">Blood Group</span><br><strong style="font-size:0.85rem;"><span class="badge badge-partial">${member.blood_group || 'O+'}</span></strong></div>
          <div><span style="color:var(--text-muted);font-size:0.75rem;">Date of Birth</span><br><strong style="font-size:0.85rem;">${formatDate(member.dob)}</strong></div>
          <div><span style="color:var(--text-muted);font-size:0.75rem;">Email Address</span><br><strong style="font-size:0.85rem;">${member.email || 'N/A'}</strong></div>
          <div style="grid-column: 1/-1;"><span style="color:var(--text-muted);font-size:0.75rem;">Address</span><br><strong style="font-size:0.85rem;">${member.address || 'N/A'}</strong></div>
        </div>
      </div>
    `;
  }
}

function closeMemberProfileDrawer() {
  const backdrop = document.getElementById('memberDrawerBackdrop');
  const panel = document.getElementById('memberProfileDrawer');
  if (backdrop) backdrop.classList.remove('active');
  if (panel) panel.classList.remove('open');
}

// ── BULK SELECTION ENGINE ────────────────────────────────────────────────────
function toggleSelectAllMembers(checked) {
  if (checked) {
    membersList.forEach(m => selectedMemberIds.add(m.id));
  } else {
    selectedMemberIds.clear();
  }
  filterMembersTable();
}

function toggleSelectMember(id) {
  if (selectedMemberIds.has(id)) {
    selectedMemberIds.delete(id);
  } else {
    selectedMemberIds.add(id);
  }
  filterMembersTable();
}

function clearMemberSelections() {
  selectedMemberIds.clear();
  const selectAllCb = document.getElementById('selectAllMembersCb');
  if (selectAllCb) selectAllCb.checked = false;
  filterMembersTable();
}

function updateBulkActionBar() {
  const bar = document.getElementById('memberBulkActionBar');
  const countEl = document.getElementById('bulkSelectedCount');
  const selectAllCb = document.getElementById('selectAllMembersCb');

  if (countEl) countEl.textContent = `${selectedMemberIds.size} selected`;

  if (selectedMemberIds.size > 0) {
    if (bar) bar.classList.add('show');
  } else {
    if (bar) bar.classList.remove('show');
    if (selectAllCb) selectAllCb.checked = false;
  }
}

async function executeBulkAction(action) {
  if (selectedMemberIds.size === 0) {
    showToast('Please select at least one member.', 'info');
    return;
  }

  const ids = Array.from(selectedMemberIds);

  if (action === 'impose') {
    openImposeDueModal(ids[0]);
  } else if (action === 'activate') {
    if (!confirm(`Activate ${ids.length} selected member(s)?`)) return;
    for (const id of ids) {
      await fetch(`/api/members/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Active' })
      });
    }
    showToast(`Activated ${ids.length} member(s).`, 'success');
    clearMemberSelections();
    loadMembersData();
  } else if (action === 'deactivate') {
    if (!confirm(`Deactivate ${ids.length} selected member(s)?`)) return;
    for (const id of ids) {
      await fetch(`/api/members/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Inactive' })
      });
    }
    showToast(`Deactivated ${ids.length} member(s).`, 'success');
    clearMemberSelections();
    loadMembersData();
  } else if (action === 'export') {
    const selectedList = membersList.filter(m => selectedMemberIds.has(m.id));
    exportMembersList(selectedList);
  } else if (action === 'delete') {
    if (!confirm(`⚠️ Delete ${ids.length} selected member(s)? This action cannot be undone.`)) return;
    for (const id of ids) {
      await fetch(`/api/members/${id}`, { method: 'DELETE' });
    }
    showToast(`Deleted ${ids.length} member(s).`, 'success');
    clearMemberSelections();
    loadMembersData();
  }
}

// ── PAGINATION CONTROLS ──────────────────────────────────────────────────────
function changeMemberRowsPerPage(size) {
  memberRowsPerPage = parseInt(size, 10);
  memberCurrentPage = 1;
  filterMembersTable();
}

function changeMemberPage(page) {
  memberCurrentPage = page;
  filterMembersTable();
}

function renderMemberPagination(totalCount) {
  const rowsPerPage = parseInt(memberRowsPerPage, 10);
  const totalPages = Math.ceil(totalCount / rowsPerPage) || 1;
  const start = totalCount === 0 ? 0 : (memberCurrentPage - 1) * rowsPerPage + 1;
  const end = Math.min(memberCurrentPage * rowsPerPage, totalCount);

  const infoEl = document.getElementById('memberPaginationInfo');
  const btnEl = document.getElementById('memberPaginationButtons');

  if (infoEl) {
    infoEl.textContent = `Showing ${start}–${end} of ${totalCount} members`;
  }

  if (btnEl) {
    let btnsHtml = `
      <button class="page-btn" ${memberCurrentPage === 1 ? 'disabled' : ''} onclick="changeMemberPage(${memberCurrentPage - 1})">‹ Prev</button>
    `;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= memberCurrentPage - 1 && p <= memberCurrentPage + 1)) {
        btnsHtml += `
          <button class="page-btn ${p === memberCurrentPage ? 'active' : ''}" onclick="changeMemberPage(${p})">${p}</button>
        `;
      } else if (p === memberCurrentPage - 2 || p === memberCurrentPage + 2) {
        btnsHtml += `<span style="color:var(--text-muted);font-size:0.8rem;">…</span>`;
      }
    }

    btnsHtml += `
      <button class="page-btn" ${memberCurrentPage === totalPages ? 'disabled' : ''} onclick="changeMemberPage(${memberCurrentPage + 1})">Next ›</button>
    `;

    btnEl.innerHTML = btnsHtml;
  }
}

// Global MemberSearchSelect instances
let txMemberSearchInstance = null;
let passbookSearchInstance = null;

function populateMemberDropdowns() {
  // Initialize Transaction Member Search Select
  if (!txMemberSearchInstance) {
    const txContainer = document.getElementById('txMemberSearchContainer');
    if (txContainer) {
      txMemberSearchInstance = new MemberSearchSelect({
        container: 'txMemberSearchContainer',
        id: 'txMemberSearch',
        hiddenInputId: 'txMemberId',
        placeholder: '🔍 Search Member by ID, Name, Mobile or Email...',
        onSelect: function(member) {
          // Auto-load dues for selected member when type is member_payment
          const txType = document.getElementById('txType');
          if (txType && txType.value === 'member_payment') {
            // Hidden input is already set; dues will be fetched on form submit
          }
        },
        onClear: function() {
          // Clear dues selection when member is cleared
        }
      });
      // Add hidden input for backward compat
      if (!document.getElementById('txMemberId')) {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.id = 'txMemberId';
        hidden.value = '';
        txContainer.appendChild(hidden);
      }
    }
  }

  // Initialize Passbook Member Search Select
  if (!passbookSearchInstance) {
    const pbContainer = document.getElementById('passbookMemberSearchContainer');
    if (pbContainer) {
      passbookSearchInstance = new MemberSearchSelect({
        container: 'passbookMemberSearchContainer',
        id: 'passbookSearch',
        hiddenInputId: 'passbookMemberSelect',
        placeholder: '🔍 Search Member by ID, Name, Mobile or Email...',
        onSelect: function(member) {
          loadPassbook();
        },
        onClear: function() {
          // Clear passbook view
          document.getElementById('passbookMemberName').textContent = 'Select a Member';
          document.getElementById('passbookMemberCode').textContent = 'Code: - | Phone: -';
        }
      });
      // Add hidden input for backward compat
      if (!document.getElementById('passbookMemberSelect')) {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.id = 'passbookMemberSelect';
        hidden.value = '';
        pbContainer.appendChild(hidden);
      }
    }
  }
}


function populateInitialEventsChecklist() {
  const checklist = document.getElementById('memberInitialEventsChecklist');
  if (!checklist) return;
  // Filter only Active Fixed Contribution events with predefined amounts
  const fixedEvents = eventsList.filter(e => e.contribution_type !== 'flexible' && Number(e.contribution_amount) > 0);
  checklist.innerHTML = fixedEvents.map(e => `
    <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer; color: var(--text-primary); font-size: 0.88rem; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border);">
      <input type="checkbox" name="mInitialEventIds" value="${e.id}" style="width: auto; margin: 0;">
      <span>${e.title} (<strong>₹${Number(e.contribution_amount).toFixed(2)}</strong>)</span>
    </label>
  `).join('') || '<div style="color: var(--text-muted); font-size: 0.85rem;">No active fixed contribution events available.</div>';
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

  let initial_event_ids = [];
  if (!editingMemberId) {
    const cbs = document.querySelectorAll('input[name="mInitialEventIds"]:checked');
    initial_event_ids = Array.from(cbs).map(cb => cb.value);
  }

  const url = editingMemberId ? `/api/members/${editingMemberId}` : '/api/members';
  const method = editingMemberId ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      form_no, member_code, name, father_name, date_of_admission,
      phone, email, aadhaar_number, blood_group, alternative_number,
      dob, member_status, address, initial_event_ids
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
    loadDashboardData();
  } else {
    showToast(data.error || 'Failed to save member', 'error');
  }
}

function showAddMemberModal() {
  editingMemberId = null;
  document.getElementById('memberForm').reset();
  
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('mDateOfAdmission').value = today;
  
  const initialGroup = document.getElementById('mInitialEventsGroup');
  if (initialGroup) initialGroup.style.display = 'block';
  populateInitialEventsChecklist();

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
  
  const initialGroup = document.getElementById('mInitialEventsGroup');
  if (initialGroup) initialGroup.style.display = 'none';

  const titleEl = document.getElementById('memberModalTitle');
  const submitBtnEl = document.getElementById('memberModalSubmitBtn');
  if (titleEl) titleEl.innerText = "Edit Member Record";
  if (submitBtnEl) submitBtnEl.innerText = "Update Member Record";
  
  openModal('memberModal');
}

async function deleteMember(id) {
  const member = membersList.find(m => m.id == id);
  if (!member) return;

  const confirmMsg = 
    `Delete Member: ${member.name} (${member.member_code})?\n\n` +
    `This action will permanently delete the member profile.\n\n` +
    `• All unpaid dues will be removed automatically.\n` +
    `• Payment history and issued receipts will be retained for audit purposes.\n` +
    `• This action cannot be undone.\n\n` +
    `Are you sure you want to delete this member?`;

  if (!confirm(confirmMsg)) return;

  const res = await fetch(`/api/members/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) {
    showToast(data.message || 'Member deleted successfully.', 'success');
    loadMembersData();
    loadDashboardData();
    loadEventsData();
  } else {
    showToast(data.error || 'Failed to delete member', 'error');
  }
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
// ══════════════════════════════════════════════════════════════
// EVENTS SaaS ENGINE — State & Helpers
// ══════════════════════════════════════════════════════════════

let eventFilterChip = 'all';
let eventSortKey = 'date_desc';
let eventCurrentPage = 1;
let eventRowsPerPage = 12;
const selectedEventIds = new Set();

function getEventIcon(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('independence') || t.includes('republic') || t.includes('national')) return '🇮🇳';
  if (t.includes('puja') || t.includes('saraswati') || t.includes('durga') || t.includes('kali') || t.includes('pooja')) return '🪔';
  if (t.includes('development') || t.includes('fund') || t.includes('building') || t.includes('construction')) return '🏗️';
  if (t.includes('foundation') || t.includes('anniversary') || t.includes('celebration')) return '🎉';
  if (t.includes('flood') || t.includes('relief') || t.includes('disaster')) return '🆘';
  if (t.includes('donation') || t.includes('charity')) return '💝';
  if (t.includes('sports') || t.includes('game') || t.includes('tournament')) return '🏆';
  if (t.includes('cultural') || t.includes('music') || t.includes('dance')) return '🎭';
  if (t.includes('meeting') || t.includes('agm') || t.includes('general body')) return '📋';
  return '🎯';
}

function getEventStatus(ev) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = ev.event_date ? new Date(ev.event_date) : null;
  if (eventDate) {
    const daysUntil = Math.ceil((eventDate - today) / 86400000);
    if (daysUntil > 1) return 'upcoming';
  }
  if (ev.total_expected > 0 && ev.total_collected >= ev.total_expected) return 'completed';
  return 'active';
}

function getProgressClass(pct) {
  if (pct >= 100) return 'pct-full';
  if (pct >= 60)  return 'pct-high';
  if (pct >= 25)  return 'pct-mid';
  return 'pct-low';
}

// ── Filter + Sort Engine ─────────────────────────────────────────
function filterSortEvents() {
  if (!Array.isArray(eventsList)) return [];
  const query = (document.getElementById('eventSearchInput')?.value || '').toLowerCase().trim();

  let filtered = eventsList.filter(ev => {
    const status = getEventStatus(ev);
    const type   = ev.contribution_type || 'fixed';

    if (eventFilterChip === 'active'    && status !== 'active')    return false;
    if (eventFilterChip === 'upcoming'  && status !== 'upcoming')  return false;
    if (eventFilterChip === 'completed' && status !== 'completed') return false;
    if (eventFilterChip === 'fixed'     && type   !== 'fixed')     return false;
    if (eventFilterChip === 'flexible'  && type   !== 'flexible')  return false;

    if (query) {
      const haystack = `${ev.title} ${ev.description || ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (eventSortKey === 'date_asc')        return new Date(a.event_date || 0) - new Date(b.event_date || 0);
    if (eventSortKey === 'name')            return (a.title || '').localeCompare(b.title || '');
    if (eventSortKey === 'outstanding_desc') return (b.total_pending || 0) - (a.total_pending || 0);
    if (eventSortKey === 'progress') {
      const pctA = a.total_expected > 0 ? (a.total_collected / a.total_expected) : 0;
      const pctB = b.total_expected > 0 ? (b.total_collected / b.total_expected) : 0;
      return pctB - pctA;
    }
    // date_desc (default)
    return new Date(b.event_date || 0) - new Date(a.event_date || 0);
  });

  return filtered;
}

// ── Update Summary Metrics Bar ───────────────────────────────────
function updateEventMetrics() {
  if (!Array.isArray(eventsList)) return;

  let totalExpected = 0, totalCollected = 0, totalOutstanding = 0;
  let activeCount = 0, upcomingCount = 0;

  eventsList.forEach(ev => {
    const status = getEventStatus(ev);
    if (status === 'active')   activeCount++;
    if (status === 'upcoming') upcomingCount++;
    totalExpected    += (parseFloat(ev.total_expected) || 0);
    totalCollected   += (parseFloat(ev.total_collected) || 0);
    totalOutstanding += (parseFloat(ev.total_pending)   || 0);
  });

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('evMetricTotal',       eventsList.length);
  set('evMetricActive',      activeCount);
  set('evMetricUpcoming',    upcomingCount);
  set('evMetricExpected',    formatINR(totalExpected));
  set('evMetricCollected',   formatINR(totalCollected));
  set('evMetricOutstanding', formatINR(totalOutstanding));
}

// ── Update Filter Chip Counts ────────────────────────────────────
function updateEventChipCounts() {
  if (!Array.isArray(eventsList)) return;

  const counts = { all: eventsList.length, active: 0, upcoming: 0, completed: 0, fixed: 0, flexible: 0 };
  eventsList.forEach(ev => {
    const status = getEventStatus(ev);
    const type   = ev.contribution_type || 'fixed';
    if (counts[status] !== undefined) counts[status]++;
    if (counts[type]   !== undefined) counts[type]++;
  });

  const chips = ['All','Active','Upcoming','Completed','Fixed','Flexible'];
  chips.forEach(c => {
    const el = document.getElementById('evCount' + c);
    if (el) el.textContent = counts[c.toLowerCase()] ?? 0;
  });
}

// ── Set Filter Chip ──────────────────────────────────────────────
function setEventFilter(chip) {
  eventFilterChip = chip;
  eventCurrentPage = 1;

  // Update active chip style
  ['All','Active','Upcoming','Completed','Fixed','Flexible'].forEach(c => {
    const el = document.getElementById('evChip' + c);
    if (el) el.classList.toggle('active', c.toLowerCase() === chip);
  });

  // Update active metric card
  document.querySelectorAll('.event-metric-card').forEach(card => {
    card.classList.toggle('active-filter', card.dataset.filter === chip);
  });

  renderEventCards();
}

// ── Set Sort ─────────────────────────────────────────────────────
function setEventSort(key) {
  eventSortKey = key;
  eventCurrentPage = 1;
  renderEventCards();
}

// ── Debounced Search ─────────────────────────────────────────────
function onEventSearchInput(val) {
  eventCurrentPage = 1;
  renderEventCards();
}

// ── Build & Render Event Cards ───────────────────────────────────
function renderEventCards() {
  const container = document.getElementById('eventCardsContainer');
  if (!container) return;

  const filtered = filterSortEvents();
  const total    = filtered.length;
  const start    = (eventCurrentPage - 1) * eventRowsPerPage;
  const end      = Math.min(start + eventRowsPerPage, total);
  const page     = filtered.slice(start, end);

  // Update pagination info
  const info = document.getElementById('eventPaginationInfo');
  if (info) info.textContent = total === 0
    ? 'No events found'
    : `Showing ${start + 1}–${end} of ${total} events`;

  // Build pagination buttons
  buildEventPaginationButtons(Math.ceil(total / eventRowsPerPage));

  if (page.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);">
        <div style="font-size:2.5rem;margin-bottom:12px;">🎯</div>
        <div style="font-size:1rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">No events found</div>
        <div style="font-size:0.85rem;">Try adjusting your search or filter</div>
      </div>`;
    return;
  }

  container.innerHTML = page.map(ev => buildEventCardHTML(ev)).join('');
}

// ── Build a Single Event Card HTML ───────────────────────────────
function buildEventCardHTML(ev) {
  const status      = getEventStatus(ev);
  const icon        = getEventIcon(ev.title);
  const type        = ev.contribution_type || 'fixed';
  const isFlexible  = type === 'flexible' || !Number(ev.contribution_amount);
  const pct         = ev.total_expected > 0 ? Math.min(Math.round((ev.total_collected / ev.total_expected) * 100), 100) : 0;
  const pctClass    = getProgressClass(pct);
  const paid        = ev.member_count > 0 ? Math.round((ev.total_collected / (ev.contribution_amount || 1))) : 0;
  const pending     = Math.max(ev.member_count - paid, 0);
  const netBalance  = (ev.total_collected || 0) - (ev.total_expenses || 0);
  const isSelected  = selectedEventIds.has(ev.id);

  const statusBadge = {
    active:    '<span class="ev-status-badge ev-status-active">🟢 Active</span>',
    upcoming:  '<span class="ev-status-badge ev-status-upcoming">📅 Upcoming</span>',
    completed: '<span class="ev-status-badge ev-status-completed">🔵 Completed</span>',
    draft:     '<span class="ev-status-badge ev-status-draft">⚪ Draft</span>',
  }[status] || '';

  const typeBadge = isFlexible
    ? '<span class="ev-type-badge ev-type-flexible">🌱 Flexible</span>'
    : '<span class="ev-type-badge ev-type-fixed">📌 Fixed</span>';

  const contributionLine = isFlexible
    ? '<div class="ev-contribution-amount">Flexible contribution (no fixed amount)</div>'
    : `<div class="ev-contribution-amount">₹${Number(ev.contribution_amount || 0).toLocaleString('en-IN')} per member</div>`;

  const progressSection = ev.total_expected > 0 ? `
    <div class="event-progress-wrap">
      <div class="event-progress-row">
        <span class="event-progress-label">Collection Progress</span>
        <span class="event-progress-pct">${pct}%</span>
      </div>
      <div class="event-progress-bar">
        <div class="event-progress-fill ${pctClass}" style="width:${pct}%"></div>
      </div>
      <div class="event-progress-amounts">${formatINR(ev.total_collected)} collected of ${formatINR(ev.total_expected)} expected</div>
    </div>` : `
    <div class="event-progress-wrap">
      <div class="event-progress-row">
        <span class="event-progress-label">Collection Progress</span>
        <span class="event-progress-pct" style="color:var(--text-muted);">—</span>
      </div>
      <div class="event-progress-bar"><div class="event-progress-fill" style="width:0%"></div></div>
      <div class="event-progress-amounts" style="color:var(--text-muted);">No dues imposed yet</div>
    </div>`;

  const mgmtActions = isManagementRole(currentUser) ? `
    <div class="dropdown-item" onclick="editEvent(${ev.id});closeAllEventDropdowns()">✏️ Edit Event</div>
    <div class="dropdown-item" onclick="viewEventPendingMembers(${ev.id});closeAllEventDropdowns()">👥 Pending Members</div>
    <div class="dropdown-item text-rose" onclick="deleteEvent(${ev.id})">🗑️ Delete Event</div>
  ` : '';

  return `
  <div class="event-card" id="evCard${ev.id}">
    <!-- Header -->
    <div class="event-card-header">
      <input type="checkbox" class="event-select-cb" id="evCb${ev.id}"
        ${isSelected ? 'checked' : ''} onchange="toggleSelectEvent(${ev.id}, this.checked)">
      <div class="event-card-icon">${icon}</div>
      <div class="event-card-title-block">
        <div class="event-card-title" onclick="openEventDrawer(${ev.id})">${ev.title}</div>
        <div class="event-card-date">📅 ${formatDate(ev.event_date)}</div>
        ${contributionLine}
        <div class="event-card-badges">
          ${typeBadge}
          ${statusBadge}
        </div>
      </div>
    </div>

    <!-- Progress -->
    ${progressSection}

    <!-- Member Stats -->
    <div class="event-stats-row">
      <div class="event-stat-cell">
        <div class="event-stat-val">${ev.member_count}</div>
        <div class="event-stat-lbl">Assigned</div>
      </div>
      <div class="event-stat-cell">
        <div class="event-stat-val" style="color:#4ADE80;">${paid}</div>
        <div class="event-stat-lbl">Paid</div>
      </div>
      <div class="event-stat-cell">
        <div class="event-stat-val" style="color:#F87171;">${pending}</div>
        <div class="event-stat-lbl">Pending</div>
      </div>
    </div>

    <!-- Financial Summary -->
    <div class="event-finance-row">
      <div class="event-finance-item">
        <div class="event-finance-val ev-expected-val">${formatINR(ev.total_expected)}</div>
        <div class="event-finance-lbl">Expected</div>
      </div>
      <div class="event-finance-item">
        <div class="event-finance-val ev-collected-val">${formatINR(ev.total_collected)}</div>
        <div class="event-finance-lbl">Collected</div>
      </div>
      <div class="event-finance-item">
        <div class="event-finance-val ev-expenses-val">${formatINR(ev.total_expenses)}</div>
        <div class="event-finance-lbl">Expenses</div>
      </div>
      <div class="event-finance-item">
        <div class="event-finance-val" style="color:${netBalance >= 0 ? '#4ADE80' : '#F87171'};">${formatINR(netBalance)}</div>
        <div class="event-finance-lbl">Net Balance</div>
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="event-card-footer">
      <button class="btn btn-outline btn-sm" onclick="viewEventPendingMembers(${ev.id})">👥 Pending</button>
      <button class="btn btn-sm btn-emerald" onclick="openEventReport(${ev.id})">📊 Report</button>
      <div class="ev-action-more-wrap">
        <button class="ev-more-btn" onclick="toggleEventCardDropdown(${ev.id}, event)" title="More actions">⋮</button>
        <div class="event-dropdown-menu" id="evDropdown${ev.id}">
          <div class="dropdown-item" onclick="openEventDrawer(${ev.id});closeAllEventDropdowns()">🔍 View Details</div>
          <div class="dropdown-item" onclick="openEventReport(${ev.id})">📊 Report</div>
          ${mgmtActions}
        </div>
      </div>
    </div>
  </div>`;
}

// ── Pagination ───────────────────────────────────────────────────
function buildEventPaginationButtons(totalPages) {
  const container = document.getElementById('eventPaginationButtons');
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="changeEventPage(${eventCurrentPage - 1})" ${eventCurrentPage === 1 ? 'disabled' : ''}>‹ Prev</button>`;
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7 && p > 2 && p < totalPages - 1 && Math.abs(p - eventCurrentPage) > 1) {
      if (p === 3 || p === totalPages - 2) html += `<span style="color:var(--text-muted);padding:0 4px;">…</span>`;
      continue;
    }
    html += `<button class="page-btn ${p === eventCurrentPage ? 'active' : ''}" onclick="changeEventPage(${p})">${p}</button>`;
  }
  html += `<button class="page-btn" onclick="changeEventPage(${eventCurrentPage + 1})" ${eventCurrentPage === totalPages ? 'disabled' : ''}>Next ›</button>`;
  container.innerHTML = html;
}

function changeEventPage(page) {
  const filtered = filterSortEvents();
  const totalPages = Math.ceil(filtered.length / eventRowsPerPage);
  if (page < 1 || page > totalPages) return;
  eventCurrentPage = page;
  renderEventCards();
  document.getElementById('events')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function changeEventRowsPerPage(n) {
  eventRowsPerPage = parseInt(n) || 12;
  eventCurrentPage = 1;
  renderEventCards();
}

// ── Dropdown Menu Toggle ─────────────────────────────────────────
function toggleEventCardDropdown(id, evt) {
  if (evt) evt.stopPropagation();
  closeAllEventDropdowns();
  const menu = document.getElementById(`evDropdown${id}`);
  if (menu) menu.classList.toggle('open');
}

function toggleEventBulkMenu() {
  const menu = document.getElementById('eventBulkDropdown');
  if (menu) menu.classList.toggle('open');
}

function closeAllEventDropdowns() {
  document.querySelectorAll('.event-dropdown-menu.open').forEach(m => m.classList.remove('open'));
}

// Close dropdowns on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.ev-action-more-wrap') && !e.target.closest('#evBtnBulkActions')) {
    closeAllEventDropdowns();
  }
});

// ── Bulk Selection ───────────────────────────────────────────────
function toggleSelectEvent(id, checked) {
  if (checked) selectedEventIds.add(id);
  else         selectedEventIds.delete(id);
  updateEventBulkBar();
}

function clearEventSelection() {
  selectedEventIds.clear();
  document.querySelectorAll('.event-select-cb').forEach(cb => cb.checked = false);
  updateEventBulkBar();
}

function updateEventBulkBar() {
  const bar   = document.getElementById('eventBulkActionBar');
  const count = document.getElementById('eventBulkCount');
  const n     = selectedEventIds.size;
  if (bar) bar.style.display = n > 0 ? 'flex' : 'none';
  if (count) count.textContent = `${n} selected`;
}

function executeBulkEventAction(action) {
  closeAllEventDropdowns();
  if (action === 'export') {
    const rows = Array.from(selectedEventIds).map(id => eventsList.find(e => e.id == id)).filter(Boolean);
    if (!rows.length) { showToast('Select events to export', 'warning'); return; }
    const csv = ['Title,Date,Type,Expected,Collected,Outstanding,Expenses']
      .concat(rows.map(e => `"${e.title}","${e.event_date}","${e.contribution_type}","${e.total_expected}","${e.total_collected}","${e.total_pending}","${e.total_expenses}"`))
      .join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv]));
    a.download = 'events_export.csv'; a.click();
    showToast(`Exported ${rows.length} events`, 'success');
  } else if (action === 'delete') {
    if (!isManagementRole(currentUser)) { showToast('No permission', 'error'); return; }
    if (!selectedEventIds.size) { showToast('Select events to delete', 'warning'); return; }
    if (!confirm(`Delete ${selectedEventIds.size} selected events? This cannot be undone.`)) return;
    const ids = Array.from(selectedEventIds);
    Promise.all(ids.map(id => fetch(`/api/events/${id}`, { method: 'DELETE' }).then(r => r.json())))
      .then(results => {
        const ok = results.filter(r => r.success).length;
        showToast(`${ok} events deleted`, ok === ids.length ? 'success' : 'warning');
        clearEventSelection();
        loadEventsData();
      });
  } else if (action === 'archive') {
    showToast('Archive feature coming soon', 'info');
  }
}

// ── Export All Events ─────────────────────────────────────────────
function exportEventsData() {
  if (!Array.isArray(eventsList) || !eventsList.length) { showToast('No events to export', 'warning'); return; }
  const csv = ['Title,Date,Type,Contribution,Expected,Collected,Outstanding,Expenses,Members']
    .concat(eventsList.map(e => `"${e.title}","${e.event_date}","${e.contribution_type}","${e.contribution_amount || 0}","${e.total_expected}","${e.total_collected}","${e.total_pending}","${e.total_expenses}","${e.member_count}"`))
    .join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv]));
  a.download = `events_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  showToast('Events exported', 'success');
}

// ── Slide-In Event Drawer ────────────────────────────────────────
async function openEventDrawer(eventId) {
  const panel   = document.getElementById('eventDrawerPanel');
  const overlay = document.getElementById('eventDrawerOverlay');
  if (!panel) return;

  // Set loading state
  const ev = eventsList.find(e => e.id == eventId);
  if (!ev) return;

  document.getElementById('evDrawerIcon').textContent  = getEventIcon(ev.title);
  document.getElementById('evDrawerTitle').textContent = ev.title;

  const status      = getEventStatus(ev);
  const isFlexible  = ev.contribution_type === 'flexible' || !Number(ev.contribution_amount);
  const pct         = ev.total_expected > 0 ? Math.min(Math.round((ev.total_collected / ev.total_expected) * 100), 100) : 0;
  const paid        = ev.contribution_amount > 0 ? Math.round(ev.total_collected / ev.contribution_amount) : 0;
  const pending     = Math.max(ev.member_count - paid, 0);
  const netBalance  = (ev.total_collected || 0) - (ev.total_expenses || 0);
  const pctClass    = getProgressClass(pct);

  const statusBadge = {
    active:    '<span class="ev-status-badge ev-status-active">🟢 Active</span>',
    upcoming:  '<span class="ev-status-badge ev-status-upcoming">📅 Upcoming</span>',
    completed: '<span class="ev-status-badge ev-status-completed">🔵 Completed</span>',
  }[status] || '';

  const typeBadge = isFlexible
    ? '<span class="ev-type-badge ev-type-flexible">🌱 Flexible</span>'
    : '<span class="ev-type-badge ev-type-fixed">📌 Fixed</span>';

  document.getElementById('evDrawerBadges').innerHTML = typeBadge + statusBadge;

  const mgmtBtns = isManagementRole(currentUser) ? `
    <button class="btn btn-outline btn-sm" onclick="editEvent(${ev.id});closeEventDrawer()">✏️ Edit</button>
    <button class="btn btn-rose btn-sm" onclick="deleteEvent(${ev.id})">🗑️ Delete</button>
  ` : '';

  document.getElementById('evDrawerBody').innerHTML = `
    <!-- Quick Actions -->
    <div class="ev-drawer-section">
      <div class="ev-drawer-section-title">Quick Actions</div>
      <div class="ev-drawer-actions">
        <button class="btn btn-sm" onclick="viewEventPendingMembers(${ev.id})">👥 Pending Members</button>
        <button class="btn btn-outline btn-sm btn-emerald" onclick="openEventReport(${ev.id})">📊 Report</button>
        ${mgmtBtns}
      </div>
    </div>

    <!-- Collection Summary -->
    <div class="ev-drawer-section">
      <div class="ev-drawer-section-title">Collection Summary</div>
      <div class="ev-drawer-metrics-grid">
        <div class="ev-drawer-metric">
          <div class="ev-drawer-metric-val" style="color:#93C5FD;">${formatINR(ev.total_expected)}</div>
          <div class="ev-drawer-metric-lbl">Expected</div>
        </div>
        <div class="ev-drawer-metric">
          <div class="ev-drawer-metric-val" style="color:#4ADE80;">${formatINR(ev.total_collected)}</div>
          <div class="ev-drawer-metric-lbl">Collected</div>
        </div>
        <div class="ev-drawer-metric">
          <div class="ev-drawer-metric-val" style="color:#F87171;">${formatINR(ev.total_pending)}</div>
          <div class="ev-drawer-metric-lbl">Outstanding</div>
        </div>
        <div class="ev-drawer-metric">
          <div class="ev-drawer-metric-val">${pct}%</div>
          <div class="ev-drawer-metric-lbl">Collection %</div>
        </div>
        <div class="ev-drawer-metric">
          <div class="ev-drawer-metric-val">${paid}</div>
          <div class="ev-drawer-metric-lbl">Paid Members</div>
        </div>
        <div class="ev-drawer-metric">
          <div class="ev-drawer-metric-val" style="color:#F87171;">${pending}</div>
          <div class="ev-drawer-metric-lbl">Pending Members</div>
        </div>
        <div class="ev-drawer-metric">
          <div class="ev-drawer-metric-val" style="color:#FCD34D;">${formatINR(ev.total_expenses)}</div>
          <div class="ev-drawer-metric-lbl">Expenses</div>
        </div>
        <div class="ev-drawer-metric">
          <div class="ev-drawer-metric-val" style="color:${netBalance >= 0 ? '#4ADE80' : '#F87171'};">${formatINR(netBalance)}</div>
          <div class="ev-drawer-metric-lbl">Net Balance</div>
        </div>
      </div>

      <!-- Progress Bar -->
      <div style="margin-top:14px;">
        <div class="event-progress-row" style="margin-bottom:6px;">
          <span class="event-progress-label">Progress</span>
          <span class="event-progress-pct">${pct}%</span>
        </div>
        <div class="event-progress-bar">
          <div class="event-progress-fill ${pctClass}" style="width:${pct}%"></div>
        </div>
        <div class="event-progress-amounts" style="margin-top:5px;">${formatINR(ev.total_collected)} of ${formatINR(ev.total_expected)}</div>
      </div>
    </div>

    <!-- Event Details -->
    <div class="ev-drawer-section">
      <div class="ev-drawer-section-title">Event Details</div>
      <div class="ev-drawer-kv"><span class="ev-drawer-key">Event Date</span><span class="ev-drawer-val">${formatDate(ev.event_date)}</span></div>
      <div class="ev-drawer-kv"><span class="ev-drawer-key">Contribution Type</span><span class="ev-drawer-val">${isFlexible ? '🌱 Flexible' : '📌 Fixed'}</span></div>
      <div class="ev-drawer-kv"><span class="ev-drawer-key">Amount Per Member</span><span class="ev-drawer-val">${isFlexible ? '—' : formatINR(ev.contribution_amount)}</span></div>
      <div class="ev-drawer-kv"><span class="ev-drawer-key">Total Members</span><span class="ev-drawer-val">${ev.member_count} assigned</span></div>
      ${ev.description ? `<div class="ev-drawer-kv" style="flex-direction:column;align-items:flex-start;gap:6px;"><span class="ev-drawer-key">Description</span><span class="ev-drawer-val" style="text-align:left;font-size:0.82rem;line-height:1.5;">${ev.description}</span></div>` : ''}
    </div>
  `;

  panel.classList.add('open');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEventDrawer() {
  const panel   = document.getElementById('eventDrawerPanel');
  const overlay = document.getElementById('eventDrawerOverlay');
  if (panel)   panel.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// Close drawer on ESC
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeEventDrawer();
    closeAllEventDropdowns();
  }
});

// ══════════════════════════════════════════════════════════════
// LOAD EVENTS DATA (main entry point)
// ══════════════════════════════════════════════════════════════
async function loadEventsData() {
  try {
    const res = await fetch('/api/events');
    eventsList = await res.json();
    window.eventsList = eventsList;

    updateEventMetrics();
    updateEventChipCounts();
    renderEventCards();
    populateEventDropdowns();
  } catch (err) {
    console.error('Events load error:', err);
  }
}



function populateEventDropdowns() {
  // Populate checklist of events for Transactions
  const checklist = document.getElementById('txEventsCheckboxList');
  if (checklist) {
    checklist.innerHTML = eventsList.map(e => {
      const isFixed = (e.contribution_type !== 'flexible' && (parseFloat(e.contribution_amount) || 0) > 0);
      const badgeHtml = isFixed
        ? `<span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; border: 1px solid rgba(59, 130, 246, 0.3);">Fixed (₹${e.contribution_amount})</span>`
        : `<span style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; border: 1px solid rgba(245, 158, 11, 0.3);">Flexible</span>`;
      return `
        <label style="display: flex; align-items: center; justify-content: space-between; font-weight: normal; cursor: pointer; color: var(--text-primary); padding: 6px 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.02); margin-bottom: 2px; border: 1px solid rgba(255, 255, 255, 0.04); transition: background 0.2s;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" name="txEventIds" value="${e.id}" data-title="${e.title}" data-type="${isFixed ? 'fixed' : 'flexible'}" data-amount="${e.contribution_amount || 0}" onchange="onTxEventCheckboxChange(event)" style="width: auto; margin: 0;">
            <span>${e.title} (${formatDate(e.event_date)})</span>
          </div>
          ${badgeHtml}
        </label>
      `;
    }).join('') || '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 4px;">No events available.</div>';
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

function toggleContributionTypeFields() {
  const type = document.querySelector('input[name="eContributionType"]:checked')?.value || 'fixed';
  const amountGroup = document.getElementById('eAmountGroup');
  const imposeGroup = document.getElementById('eImposeGroup');
  const amountInput = document.getElementById('eAmount');
  const typeNote = document.getElementById('eContributionTypeNote');
  const submitBtn = document.getElementById('eSubmitBtn');

  if (type === 'flexible') {
    if (amountGroup) amountGroup.style.display = 'none';
    if (imposeGroup) imposeGroup.style.display = 'none';
    if (amountInput) { amountInput.required = false; amountInput.value = ''; }
    if (typeNote) {
      typeNote.textContent = '🌱 Flexible Drive (e.g. Building Fund, Donation Drive). No fixed contribution amount is imposed on members.';
    }
    if (submitBtn && !editingEventId) {
      submitBtn.textContent = 'Create Event (Flexible Drive)';
    }
  } else {
    if (amountGroup) amountGroup.style.display = 'block';
    if (imposeGroup) imposeGroup.style.display = 'flex';
    if (amountInput) amountInput.required = true;
    if (typeNote) {
      typeNote.textContent = '📌 Fixed events automatically impose a predefined contribution fee on active members.';
    }
    const isImposeChecked = document.getElementById('eImposeAll')?.checked;
    if (submitBtn && !editingEventId) {
      submitBtn.textContent = isImposeChecked ? 'Create Event & Impose Dues' : 'Create Event (No Dues)';
    }
  }
}

async function saveEvent(e) {
  e.preventDefault();
  const title = document.getElementById('eTitle').value;
  const contribution_type = document.querySelector('input[name="eContributionType"]:checked')?.value || 'fixed';
  const contribution_amount = contribution_type === 'flexible' ? 0 : document.getElementById('eAmount').value;
  const event_date = document.getElementById('eDate').value;
  const description = document.getElementById('eDesc').value;
  const impose_for_all = document.getElementById('eImposeAll') ? document.getElementById('eImposeAll').checked : true;

  const url = editingEventId ? `/api/events/${editingEventId}` : '/api/events';
  const method = editingEventId ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, contribution_type, contribution_amount, event_date, description, impose_for_all })
  });
  const data = await res.json();
  if (data.success) {
    showToast(data.message || 'Event saved successfully.', 'success');
    closeModal('eventModal');
    document.getElementById('eventForm').reset();

    // Reset default form state
    const fixedRadio = document.querySelector('input[name="eContributionType"][value="fixed"]');
    if (fixedRadio) fixedRadio.checked = true;
    const cb = document.getElementById('eImposeAll');
    if (cb) { cb.checked = true; toggleImposeWarning(true); }
    toggleContributionTypeFields();

    editingEventId = null;
    document.querySelector('#eventModal .modal-header h3').innerText = 'Create Event & Impose Contribution';
    loadEventsData();
    loadMembersData();
    loadDashboardData();
  } else {
    showToast(data.error || 'Failed to save event', 'error');
  }
}

// Toggle impose warning note and submit button label based on checkbox
function toggleImposeWarning(checked) {
  const note = document.getElementById('eImposeNote');
  const submitBtn = document.getElementById('eSubmitBtn');
  const type = document.querySelector('input[name="eContributionType"]:checked')?.value || 'fixed';
  if (note) {
    if (checked) {
      note.style.color = 'var(--accent-warning)';
      note.textContent = '⚠️ When checked, ₹ contribution dues will be automatically created for all active members.';
    } else {
      note.style.color = 'var(--text-muted)';
      note.textContent = 'ℹ️ No dues will be imposed. You can manually add dues later per member.';
    }
  }
  if (submitBtn && !editingEventId && type === 'fixed') {
    submitBtn.textContent = checked ? 'Create Event & Impose Dues' : 'Create Event (No Dues)';
  }
}

// 4. TRANSACTIONS & RECEIPT SLIPS
// ══════════════════════════════════════════════════════════════
// TRANSACTIONS SaaS ENGINE — State & Multi-Criteria Search
// ══════════════════════════════════════════════════════════════

let txTypeFilter = 'all'; // 'all', 'member_payment', 'member_donation', 'outside_donation'
let txSortKey = 'date_desc'; // 'date_desc', 'date_asc', 'amount_desc', 'receipt_asc'
let transactionsList = [];

async function loadTransactionsData() {
  try {
    const res = await fetch('/api/transactions');
    const txs = await res.json();
    transactionsList = txs;
    window.transactionsList = txs;

    updateTxChipCounts();
    filterTransactionsTable();
  } catch (err) {
    console.error('Transactions load error:', err);
  }
}

function updateTxChipCounts() {
  if (!Array.isArray(transactionsList)) return;

  const counts = { all: transactionsList.length, member_payment: 0, member_donation: 0, outside_donation: 0 };
  transactionsList.forEach(t => {
    if (counts[t.type] !== undefined) counts[t.type]++;
  });

  const setCnt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setCnt('txCountAll', counts.all);
  setCnt('txCountPayment', counts.member_payment);
  setCnt('txCountDonation', counts.member_donation);
  setCnt('txCountOutside', counts.outside_donation);
}

function setTxTypeFilter(type) {
  txTypeFilter = type;

  const chips = {
    all: 'txChipAll',
    member_payment: 'txChipPayment',
    member_donation: 'txChipDonation',
    outside_donation: 'txChipOutside'
  };

  Object.keys(chips).forEach(k => {
    const el = document.getElementById(chips[k]);
    if (el) el.classList.toggle('active', k === type);
  });

  filterTransactionsTable();
}

function setTxSort(sortKey) {
  txSortKey = sortKey;
  filterTransactionsTable();
}

function onTxSearchInput(query) {
  const clearBtn = document.getElementById('txClearBtn');
  if (clearBtn) clearBtn.style.display = query.trim() ? 'inline-flex' : 'none';
  filterTransactionsTable();
}

function clearTxSearch() {
  const input = document.getElementById('txSearchInput');
  if (input) input.value = '';
  const clearBtn = document.getElementById('txClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  filterTransactionsTable();
}

function filterTransactionsTable() {
  if (!Array.isArray(transactionsList)) return;

  const rawQuery = (document.getElementById('txSearchInput')?.value || '').toLowerCase().trim();

  // Multi-criteria filter matching:
  // 1. Receipt No (e.g. KPNS-MR-2026-001)
  // 2. Member / Outside Person Name
  // 3. Member ID (Code)
  // 4. Mobile Number (member or outside person)
  // 5. Notes / Event Title
  let filtered = transactionsList.filter(t => {
    if (txTypeFilter !== 'all' && t.type !== txTypeFilter) return false;

    if (rawQuery) {
      const haystack = [
        t.receipt_no || '',
        t.member_name || '',
        t.outside_person_name || '',
        t.member_code || '',
        t.member_phone || '',
        t.outside_person_phone || '',
        t.notes || '',
        t.event_title || ''
      ].join(' ').toLowerCase();

      if (!haystack.includes(rawQuery)) return false;
    }
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    if (txSortKey === 'date_asc') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    if (txSortKey === 'amount_desc') return (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0);
    if (txSortKey === 'receipt_asc') return (a.receipt_no || '').localeCompare(b.receipt_no || '');
    return new Date(b.created_at || 0) - new Date(a.created_at || 0); // date_desc
  });

  renderTransactionsTable(filtered);
}

function renderTransactionsTable(txs) {
  const tbody = document.getElementById('txTableBody');
  if (!tbody) return;

  if (!txs || txs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No transactions found matching search criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = txs.map(t => {
    const isPayment = t.type === 'member_payment';
    const isDonation = t.type === 'member_donation';

    let typeBadge;
    if (isPayment) typeBadge = '<span class="pb-badge pb-badge-payment">🟢 Payment</span>';
    else if (isDonation) typeBadge = '<span class="pb-badge pb-badge-opening">🟡 Donation</span>';
    else typeBadge = '<span class="pb-badge pb-badge-adjustment">🔵 Outside Donation</span>';

    const personName = t.member_name || t.outside_person_name || 'Guest / Outside';
    const personCode = t.member_code ? `<span class="badge badge-secondary" style="font-size:0.72rem;">ID: ${t.member_code}</span>` : '';
    const personPhone = (t.member_phone || t.outside_person_phone) ? `<span style="font-size:0.78rem;color:var(--text-muted);">📞 ${t.member_phone || t.outside_person_phone}</span>` : '';

    return `
      <tr>
        <td><strong class="text-gold" style="font-size:0.9rem;">${t.receipt_no}</strong></td>
        <td style="white-space:nowrap;">${formatDate(t.created_at)}</td>
        <td>${typeBadge}</td>
        <td>
          <div><strong>${personName}</strong></div>
          <div style="display:flex;gap:6px;align-items:center;margin-top:2px;">
            ${personCode}
            ${personPhone}
          </div>
        </td>
        <td class="text-emerald"><strong style="font-size:0.95rem;">${formatINR(t.amount)}</strong></td>
        <td><span class="badge badge-secondary" style="font-size:0.75rem;">${t.payment_mode || 'Cash'}</span></td>
        <td style="text-align: right;">
          <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="viewReceipt(${t.id})" title="View / Print Receipt Slip">🧾 Slip</button>
            ${isManagementRole(currentUser) ? `
              <button class="btn btn-outline btn-sm" onclick="editTransaction(${t.id})">✏️ Edit</button>
              <button class="btn btn-rose btn-sm" onclick="deleteTransaction(${t.id})">🗑️ Delete</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Edit Event
let editingEventId = null;
function editEvent(id) {
  const ev = eventsList.find(e => e.id == id);
  if (!ev) return;
  editingEventId = id;
  document.getElementById('eTitle').value = ev.title || '';

  const isFlexible = ev.contribution_type === 'flexible' || Number(ev.contribution_amount) === 0;
  const targetType = isFlexible ? 'flexible' : 'fixed';
  const radio = document.querySelector(`input[name="eContributionType"][value="${targetType}"]`);
  if (radio) radio.checked = true;

  document.getElementById('eAmount').value = ev.contribution_amount || '';
  document.getElementById('eDate').value = ev.event_date ? ev.event_date.slice(0, 10) : '';
  document.getElementById('eDesc').value = ev.description || '';

  toggleContributionTypeFields();

  document.querySelector('#eventModal .modal-header h3').innerText = 'Edit Event';
  document.querySelector('#eventForm button[type="submit"]').innerText = 'Update Event';
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

// ═══════════════════════════════════════════════════════════
// IMPOSE & REVOKE EVENT CONTRIBUTIONS (Admin)
// ═══════════════════════════════════════════════════════════

let imposeDueMemberSearchInstance = null;
let currentMemberDuesId = null;

// Open Impose Due modal, optionally pre-selecting a member
function openImposeDueModal(memberId = null) {
  closeModal('memberDuesModal');

  // Initialise member search inside modal (once)
  const container = document.getElementById('imposeDueMemberSearchContainer');
  if (container) {
    if (!imposeDueMemberSearchInstance) {
      imposeDueMemberSearchInstance = new MemberSearchSelect({
        container: 'imposeDueMemberSearchContainer',
        id: 'imposeDueMemberSearch',
        hiddenInputId: 'imposeDueMemberId',
        placeholder: '🔍 Search Member by ID, Name, Mobile or Email...',
        onSelect: () => updateImposeDueSummary(),
        onClear: () => {
          document.getElementById('imposeDueAmountGroup').style.display = 'none';
          document.getElementById('imposeDueSummary').style.display = 'none';
        }
      });
    } else {
      imposeDueMemberSearchInstance.clearSelection();
    }
  }

  // Populate fixed-event checklist
  const eventList = document.getElementById('imposeDueEventList');
  if (eventList) {
    const fixedEvents = eventsList.filter(e => (e.contribution_type || 'fixed') !== 'flexible' && Number(e.contribution_amount) > 0);
    if (fixedEvents.length === 0) {
      eventList.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px;">No fixed contribution events found.</div>';
    } else {
      eventList.innerHTML = fixedEvents.map(e => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;
                      border:1px solid var(--glass-border);background:rgba(255,255,255,0.02);
                      transition:background 0.15s;" 
               onmouseover="this.style.background='rgba(99,102,241,0.1)'" 
               onmouseout="this.style.background='rgba(255,255,255,0.02)'"
               onclick="selectImposeDueEvent(${e.id}, ${e.contribution_amount})">
          <input type="radio" name="imposeDueEventId" value="${e.id}" 
                 data-amount="${e.contribution_amount}"
                 style="width:auto;margin:0;accent-color:var(--accent-primary);"
                 onchange="selectImposeDueEvent(${e.id}, ${e.contribution_amount})">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:var(--text-primary);font-size:0.88rem;">${e.title}</div>
            <div style="font-size:0.76rem;color:var(--text-secondary);">📅 ${formatDate(e.event_date)} &nbsp;·&nbsp; <strong class="text-gold">₹${Number(e.contribution_amount).toFixed(2)}</strong> per member</div>
          </div>
        </label>
      `).join('');
    }
  }

  // Reset amount and summary
  document.getElementById('imposeDueAmountGroup').style.display = 'none';
  document.getElementById('imposeDueSummary').style.display = 'none';
  const amountEl = document.getElementById('imposeDueAmount');
  if (amountEl) amountEl.value = '';
  // Deselect any event radio
  document.querySelectorAll('input[name="imposeDueEventId"]').forEach(r => r.checked = false);

  // Pre-select member if ID provided
  if (memberId && imposeDueMemberSearchInstance) {
    imposeDueMemberSearchInstance.setValue(memberId);
  }

  openModal('imposeDueModal');
}

function selectImposeDueEvent(eventId, amount) {
  const amountGroup = document.getElementById('imposeDueAmountGroup');
  const amountInput = document.getElementById('imposeDueAmount');
  if (amountGroup) amountGroup.style.display = 'block';
  if (amountInput) amountInput.value = Number(amount).toFixed(2);
  updateImposeDueSummary();
}

function updateImposeDueSummary() {
  const memberId = document.getElementById('imposeDueMemberId')?.value;
  const selectedEvent = document.querySelector('input[name="imposeDueEventId"]:checked');
  const amount = document.getElementById('imposeDueAmount')?.value;
  const summaryEl = document.getElementById('imposeDueSummary');

  if (!summaryEl) return;

  if (memberId && selectedEvent && amount) {
    const member = membersList.find(m => m.id == memberId);
    const event = eventsList.find(e => e.id == parseInt(selectedEvent.value));
    if (member && event) {
      summaryEl.style.display = 'block';
      summaryEl.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div>👤 <strong>${member.name}</strong> (${member.member_code})</div>
          <div>🎯 <strong>${event.title}</strong></div>
          <div>💰 Amount to Impose: <strong class="text-gold">₹${Number(amount).toFixed(2)}</strong></div>
        </div>
      `;
      return;
    }
  }
  summaryEl.style.display = 'none';
}

async function submitImposeDue(e) {
  e.preventDefault();
  const memberId = document.getElementById('imposeDueMemberId')?.value;
  const selectedEvent = document.querySelector('input[name="imposeDueEventId"]:checked');
  const amount = document.getElementById('imposeDueAmount')?.value;

  if (!memberId) { showToast('Please select a member.', 'error'); return; }
  if (!selectedEvent) { showToast('Please select an event.', 'error'); return; }
  if (!amount || parseFloat(amount) <= 0) { showToast('Please enter a valid contribution amount.', 'error'); return; }

  const res = await fetch(`/api/members/${memberId}/impose-due`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: selectedEvent.value, amount: parseFloat(amount) })
  });
  const data = await res.json();

  if (data.success) {
    showToast(data.message, 'success');
    closeModal('imposeDueModal');
    loadMembersData();
    loadEventsData();
    loadDashboardData();
    // If passbook is open for this member, refresh it
    const pbHidden = document.getElementById('passbookMemberSelect');
    if (pbHidden && pbHidden.value == memberId) loadPassbook();
  } else {
    showToast(data.error || 'Failed to impose contribution', 'error');
  }
}

// ── MEMBER OUTSTANDING DUES MODAL ────────────────────────────────────────────
async function openMemberDuesModal(memberId) {
  currentMemberDuesId = memberId;
  const member = membersList.find(m => m.id == memberId);
  const titleEl = document.getElementById('memberDuesModalTitle');
  const bodyEl = document.getElementById('memberDuesModalBody');
  const imposeBtn = document.getElementById('openImposeFromDuesBtn');

  if (titleEl && member) {
    titleEl.textContent = `📋 Event Contributions — ${member.name} (${member.member_code})`;
  }
  if (bodyEl) bodyEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">Loading...</div>';
  if (imposeBtn) {
    imposeBtn.style.display = isManagementRole(currentUser) ? 'inline-flex' : 'none';
  }

  openModal('memberDuesModal');

  try {
    const res = await fetch(`/api/members/${memberId}/passbook`);
    const data = await res.json();

    // Pull all dues entries from passbook + deduplicate by event
    const duesRes = await fetch(`/api/events`);
    const allEvents = await duesRes.json();

    // Fetch dues directly for this member
    const duesListRes = await fetch(`/api/members/${memberId}/dues`);
    let duesList = [];
    if (duesListRes.ok) {
      duesList = await duesListRes.json();
    }

    if (!duesList.length) {
      bodyEl.innerHTML = `
        <div style="text-align:center;color:var(--text-muted);padding:32px 0;">
          <div style="font-size:2rem;margin-bottom:8px;">✅</div>
          <div style="font-weight:600;color:var(--text-primary);">No outstanding event contributions.</div>
          <div style="font-size:0.85rem;margin-top:4px;">This member has no imposed dues.</div>
        </div>
      `;
      return;
    }

    bodyEl.innerHTML = `
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Imposed</th>
              <th>Paid</th>
              <th>Pending</th>
              <th>Status</th>
              ${isManagementRole(currentUser) ? '<th>Action</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${duesList.map(d => {
              const amount = parseFloat(d.amount) || 0;
              const paid = parseFloat(d.paid_amount) || 0;
              const pending = Math.max(0, amount - paid);
              const isRevokable = paid === 0 && d.status !== 'completed';
              const statusBg = d.status === 'completed' 
                ? 'background:rgba(16,185,129,0.15);color:#34D399;' 
                : (paid > 0 ? 'background:rgba(245,158,11,0.15);color:#f59e0b;' : 'background:rgba(239,68,68,0.15);color:#ef4444;');
              const statusText = d.status === 'completed' ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'PENDING');
              return `
                <tr>
                  <td><strong>${d.event_title || 'Unknown Event'}</strong><br><small style="color:var(--text-muted)">${formatDate(d.event_date)}</small></td>
                  <td>${formatINR(amount)}</td>
                  <td class="text-emerald">${formatINR(paid)}</td>
                  <td class="text-rose"><strong>${formatINR(pending)}</strong></td>
                  <td><span style="font-size:0.72rem;padding:3px 8px;border-radius:20px;font-weight:600;${statusBg}">${statusText}</span></td>
                  ${isManagementRole(currentUser) ? `
                    <td>
                      ${isRevokable ? `
                        <button class="btn btn-rose btn-sm" style="font-size:0.75rem;padding:4px 10px;" onclick="confirmRevokeDue(${d.id}, '${(d.event_title||'').replace(/'/g,"\\'")}', ${memberId})">
                          🗑️ Revoke
                        </button>
                      ` : `<span style="color:var(--text-muted);font-size:0.78rem;">—</span>`}
                    </td>
                  ` : ''}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    if (bodyEl) bodyEl.innerHTML = `<div style="color:var(--accent-danger);padding:16px;">Failed to load dues: ${err.message}</div>`;
  }
}

function confirmRevokeDue(dueId, eventTitle, memberId) {
  const confirmed = confirm(
    `Revoke Event Contribution?\n\nEvent: "${eventTitle}"\n\n` +
    `• Only unpaid dues can be revoked.\n` +
    `• Paid contributions cannot be revoked.\n` +
    `• This action cannot be undone.\n\nProceed with revocation?`
  );
  if (!confirmed) return;
  revokeDue(dueId, memberId);
}

async function revokeDue(dueId, memberId) {
  const res = await fetch(`/api/members/revoke-due/${dueId}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) {
    showToast(data.message, 'success');
    // Refresh the dues modal
    openMemberDuesModal(memberId);
    loadMembersData();
    loadDashboardData();
    loadEventsData();
  } else {
    showToast(data.error || 'Failed to revoke contribution', 'error');
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

// Fetch next receipt number preview for selected transaction date
async function fetchNextReceiptNo() {
  const dateInput = document.getElementById('txDate');
  const receiptNoInput = document.getElementById('txReceiptNo');
  if (!dateInput || !receiptNoInput) return;
  const dateVal = dateInput.value || new Date().toISOString().slice(0, 10);
  try {
    const res = await fetch(`/api/transactions/next-receipt-no?date=${encodeURIComponent(dateVal)}`);
    const data = await res.json();
    if (data && data.receiptNo) {
      receiptNoInput.value = data.receiptNo;
    }
  } catch (err) {
    console.error('Failed to fetch next receipt number:', err);
  }
}

// Handle event selection mode toggle (Single / Multiple)
function handleEventModeChange() {
  const mode = document.querySelector('input[name="txEventMode"]:checked')?.value || 'single';
  const label = document.getElementById('txEventLabel');
  const checkboxes = document.querySelectorAll('input[name="txEventIds"]');

  if (mode === 'single') {
    if (label) label.textContent = 'Related Event (Optional)';
    // Uncheck all except last checked
    checkboxes.forEach(cb => { cb.checked = false; });
    document.getElementById('txPerEventAmounts').style.display = 'none';
    document.getElementById('txSingleAmountGroup').style.display = 'block';
    document.getElementById('txAmount').required = true;
    document.getElementById('txPerEventAmountsList').innerHTML = '';
    const amountInput = document.getElementById('txAmount');
    if (amountInput) amountInput.placeholder = 'e.g. 1000';
  } else {
    if (label) label.textContent = 'Select Events *';
    document.getElementById('txSingleAmountGroup').style.display = 'none';
    document.getElementById('txAmount').required = false;
    onTxEventCheckboxChange();
  }
}

// Enforce single-select when in single mode; build per-event amounts in multiple mode
function onTxEventCheckboxChange(evt) {
  const mode = document.querySelector('input[name="txEventMode"]:checked')?.value || 'single';

  if (mode === 'single') {
    const checkboxes = document.querySelectorAll('input[name="txEventIds"]');
    const justChecked = (evt && evt.target && evt.target.name === 'txEventIds') ? evt.target : null;

    if (justChecked && justChecked.checked) {
      checkboxes.forEach(cb => {
        if (cb !== justChecked) cb.checked = false;
      });
    }

    const selectedCb = document.querySelector('input[name="txEventIds"]:checked');
    const amountInput = document.getElementById('txAmount');

    if (amountInput) {
      if (selectedCb) {
        const type = selectedCb.dataset.type || 'fixed';
        const amt = parseFloat(selectedCb.dataset.amount) || 0;

        if (type === 'fixed' && amt > 0) {
          amountInput.value = amt;
          amountInput.placeholder = `₹${amt} (Auto-filled)`;
        } else {
          amountInput.value = '';
          amountInput.placeholder = 'Enter Amount';
        }
      } else {
        amountInput.placeholder = 'e.g. 1000';
      }
    }
    return;
  }

  // Multiple mode — build per-event amount fields
  const selectedCbs = document.querySelectorAll('input[name="txEventIds"]:checked');
  const container = document.getElementById('txPerEventAmountsList');
  const perEventSection = document.getElementById('txPerEventAmounts');

  if (!container || !perEventSection) return;

  if (selectedCbs.length === 0) {
    perEventSection.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  perEventSection.style.display = 'block';

  container.innerHTML = Array.from(selectedCbs).map(cb => {
    const eventId = cb.value;
    const title = cb.dataset.title || 'Event';
    const type = cb.dataset.type || 'fixed';
    const fixedAmt = parseFloat(cb.dataset.amount) || 0;

    const existingInput = document.getElementById(`txEventAmt_${eventId}`);
    let currentVal = existingInput ? existingInput.value : '';

    // Auto-fill fixed amount if value is empty
    if (currentVal === '' && type === 'fixed' && fixedAmt > 0) {
      currentVal = fixedAmt;
    }

    const badgeHtml = type === 'fixed'
      ? `<span style="font-size: 0.72rem; color: #60a5fa; background: rgba(59, 130, 246, 0.12); padding: 2px 6px; border-radius: 4px; font-weight: 600;">Fixed (₹${fixedAmt})</span>`
      : `<span style="font-size: 0.72rem; color: #fbbf24; background: rgba(245, 158, 11, 0.12); padding: 2px 6px; border-radius: 4px; font-weight: 600;">Flexible</span>`;

    const placeholderText = type === 'fixed' ? fixedAmt : 'Enter Amount';

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border);">
        <div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
          <span style="font-size: 0.88rem; color: var(--text-primary); font-weight: 500;" title="${title}">🎫 ${title}</span>
          <div>${badgeHtml}</div>
        </div>
        <div style="position: relative; width: 140px;">
          <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.85rem;">₹</span>
          <input type="number" step="0.01" min="0.01" id="txEventAmt_${eventId}" data-event-id="${eventId}" data-type="${type}"
            class="form-control tx-per-event-amt" value="${currentVal}"
            oninput="updatePerEventTotal()"
            style="padding-left: 28px; text-align: right; font-weight: 600;" required placeholder="${placeholderText}">
        </div>
      </div>
    `;
  }).join('');

  updatePerEventTotal();
}

// Recalculate total of all per-event amounts
function updatePerEventTotal() {
  const inputs = document.querySelectorAll('.tx-per-event-amt');
  let total = 0;
  let hasFlexibleEmpty = false;

  inputs.forEach(inp => {
    const v = parseFloat(inp.value);
    const type = inp.dataset.type;
    if (!isNaN(v) && v > 0) {
      total += v;
    } else if (type === 'flexible') {
      hasFlexibleEmpty = true;
    }
  });

  const totalEl = document.getElementById('txPerEventTotal');
  if (totalEl) {
    if (total > 0 && hasFlexibleEmpty) {
      totalEl.textContent = formatINR(total) + ' + Manual Amount';
    } else {
      totalEl.textContent = formatINR(total);
    }
  }
}

async function saveTransaction(e) {
  e.preventDefault();
  const type = document.getElementById('txType').value;
  const member_id = txMemberSearchInstance ? txMemberSearchInstance.getValue() : (document.getElementById('txMemberId') ? document.getElementById('txMemberId').value : '');
  const outside_person_name = document.getElementById('txOutsideName').value;
  const outside_person_phone = document.getElementById('txOutsidePhone').value;
  const created_at = document.getElementById('txDate').value;
  
  const mode = document.querySelector('input[name="txEventMode"]:checked')?.value || 'single';

  // Retrieve all selected event IDs from checklist
  const selectedCheckboxes = document.querySelectorAll('input[name="txEventIds"]:checked');
  const eventIds = Array.from(selectedCheckboxes).map(cb => cb.value);
  const event_id = eventIds.join(',');

  let amount;
  let per_event_amounts = null;

  if (mode === 'multiple' && eventIds.length > 0) {
    // Collect per-event amounts
    per_event_amounts = {};
    let total = 0;
    let valid = true;
    eventIds.forEach(eid => {
      const inp = document.getElementById(`txEventAmt_${eid}`);
      const val = inp ? parseFloat(inp.value) : 0;
      if (!inp || isNaN(val) || val <= 0) {
        valid = false;
      }
      per_event_amounts[eid] = val;
      total += val;
    });
    if (!valid) {
      showToast('Please enter a valid positive amount for each selected event.', 'error');
      return;
    }
    amount = total;
  } else {
    amount = document.getElementById('txAmount').value;
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid positive amount.', 'error');
      return;
    }
  }

  const payment_mode = document.getElementById('txMode').value;
  const notes = document.getElementById('txNotes').value;
  const send_whatsapp = document.getElementById('txSendWhatsApp').checked;

  const due_id = document.getElementById('txDueId')?.value || null;

  const res = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type, member_id, outside_person_name, outside_person_phone,
      event_id, due_id, amount, payment_mode, notes, send_whatsapp, created_at,
      per_event_amounts
    })
  });

  const data = await res.json();
  if (data.success) {
    showToast(`Transaction recorded successfully! Receipt: ${data.receiptNo}`, 'success');
    closeModal('transactionModal');
    document.getElementById('txForm').reset();
    if (document.getElementById('txDueId')) document.getElementById('txDueId').value = '';
    // Clear member search selector
    if (txMemberSearchInstance) txMemberSearchInstance.clearSelection();
    // Reset mode to single
    const singleRadio = document.querySelector('input[name="txEventMode"][value="single"]');
    if (singleRadio) singleRadio.checked = true;
    handleEventModeChange();
    loadTransactionsData();
    loadMembersData();
    loadDashboardData();
    loadEventsData();
    if (currentEventDuesData && currentEventDuesData.event) {
      viewEventPendingMembers(currentEventDuesData.event.id);
    }
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
    if (tx.type === 'member_payment') tagEl.innerText = 'MONEY RECEIPT';
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
          ${isManagementRole(currentUser) ? `
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
  if (passbookSearchInstance) {
    passbookSearchInstance.setValue(memberId);
  } else {
    // Fallback for hidden input
    const sel = document.getElementById('passbookMemberSelect');
    if (sel) sel.value = memberId;
    loadPassbook();
  }
}

// ══════════════════════════════════════════════════════════════
// MEMBER PASSBOOK STATEMENT ENGINE
// ══════════════════════════════════════════════════════════════

let passbookFilter = 'all'; // 'all', 'charges', 'payments', 'adjustments'
let passbookCurrentData = null;
const expandedPassbookItemIds = new Set();

async function loadPassbook() {
  const memberId = document.getElementById('passbookMemberSelect')
    ? document.getElementById('passbookMemberSelect').value
    : (passbookSearchInstance ? passbookSearchInstance.getValue() : '');
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
    passbookCurrentData = data;

    renderPassbookStatement();
  } catch (err) {
    console.error('Passbook load error:', err);
    showToast('Failed to load member passbook', 'error');
  }
}

function renderPassbookStatement() {
  if (!passbookCurrentData) return;
  const data = passbookCurrentData;
  const m = data.member || {};

  // Helper: format date as "01 Jan 1970"
  const fmtLong = (d) => {
    if (!d) return '-';
    const dt = new Date(d.length === 10 ? d + 'T00:00:00' : d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Avatar Initials & Color
  const initials = typeof getMemberInitials === 'function' ? getMemberInitials(m.name || 'Member') : 'MB';
  const avatarBg = typeof getAvatarColor === 'function' ? getAvatarColor(m.id || 0) : 'linear-gradient(135deg, #2563eb, #1d4ed8)';
  const avatarEl = document.getElementById('pbMemberAvatar');
  if (avatarEl) {
    avatarEl.style.background = avatarBg;
    avatarEl.innerText = initials;
  }

  // Header Details
  document.getElementById('passbookMemberName').innerText = `${m.name || 'Member'} ${m.father_name ? `(S/O ${m.father_name})` : ''}`;

  const isStatusActive = (m.member_status || 'ACTIVE').toUpperCase() === 'ACTIVE';
  const statusBadgeClass = isStatusActive ? 'badge-active' : 'badge-inactive';
  const statusIcon = isStatusActive ? '🟢' : '🔴';

  document.getElementById('passbookMemberCode').innerHTML = `
    <span class="badge badge-secondary">Member ID: ${m.member_code || '-'}</span>
    <span class="badge badge-secondary">Form No: ${m.form_no || '-'}</span>
    <span class="badge badge-secondary">📞 ${m.phone || '-'}</span>
    <span class="badge ${statusBadgeClass}">${statusIcon} ${m.member_status || 'Active'}</span>
  `;

  // Sticky Bar Header
  document.getElementById('pbStickyName').innerText = m.name || 'Member';
  document.getElementById('pbStickyCode').innerText = m.member_code || 'ID: -';
  document.getElementById('pbStickyDue').innerText = formatINR(data.current_due_balance || 0);

  const stickyBar = document.getElementById('passbookStickyHeader');
  if (stickyBar) stickyBar.style.display = 'flex';

  // Statement Period
  document.getElementById('passbookPeriodText').innerText = `${fmtLong(data.from_date)} → ${fmtLong(data.to_date)}`;

  // Calculate Totals
  let totalCharges = 0;
  let totalPaid = 0;

  const entries = data.entries || [];
  entries.forEach(e => {
    if (e.debit > 0) totalCharges += parseFloat(e.debit) || 0;
    if (e.credit > 0) totalPaid += parseFloat(e.credit) || 0;
  });

  // Balance Metrics
  document.getElementById('passbookPrevDue').innerText = formatINR(data.previous_due_balance || 0);
  document.getElementById('passbookTotalCharges').innerText = formatINR(totalCharges);
  document.getElementById('passbookTotalPaid').innerText = formatINR(totalPaid);
  document.getElementById('passbookCurrentDue').innerText = formatINR(data.current_due_balance || 0);

  // Filter Counts
  let chargesCount = 0, paymentsCount = 0, adjustmentsCount = 0;
  entries.forEach(e => {
    if (e.entry_type === 'DUE_IMPOSED') chargesCount++;
    else if (e.entry_type === 'DUES_PAYMENT' || e.entry_type === 'DONATION_PAYMENT') paymentsCount++;
    else adjustmentsCount++;
  });

  const setCnt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setCnt('pbCountAll', entries.length + 1); // +1 for Opening balance
  setCnt('pbCountCharges', chargesCount);
  setCnt('pbCountPayments', paymentsCount);
  setCnt('pbCountAdjustments', adjustmentsCount);

  // Filter entries
  let filteredEntries = entries.filter(e => {
    if (passbookFilter === 'charges') return e.entry_type === 'DUE_IMPOSED';
    if (passbookFilter === 'payments') return e.entry_type === 'DUES_PAYMENT' || e.entry_type === 'DONATION_PAYMENT';
    if (passbookFilter === 'adjustments') return e.entry_type !== 'DUE_IMPOSED' && e.entry_type !== 'DUES_PAYMENT' && e.entry_type !== 'DONATION_PAYMENT';
    return true;
  });

  // Render Views
  renderPassbookDesktopTable(data, filteredEntries, fmtLong);
  renderPassbookMobileTimeline(data, filteredEntries, fmtLong);

  // Show FAB for Payment Record
  const fab = document.getElementById('passbookFabPayment');
  if (fab) fab.style.display = isManagementRole(currentUser) ? 'flex' : 'none';
}

function setPassbookFilter(filter) {
  passbookFilter = filter;

  ['All', 'Charges', 'Payments', 'Adjustments'].forEach(f => {
    const el = document.getElementById('pbChip' + f);
    if (el) el.classList.toggle('active', f.toLowerCase() === filter);
  });

  renderPassbookStatement();
}

// ── Render Desktop Passbook Table ─────────────────────────────────
function renderPassbookDesktopTable(data, filteredEntries, fmtLong) {
  const tbody = document.getElementById('passbookTableBody');
  if (!tbody) return;

  const balanceCell = (bal) => {
    if (bal <= 0) {
      return `<strong class="text-emerald">${formatINR(0)}</strong><br><small style="color:var(--accent-success);font-size:0.72rem;font-weight:600;">✓ Cleared</small>`;
    }
    return `<strong class="text-rose">${formatINR(bal)}</strong><br><small style="color:var(--accent-danger);font-size:0.72rem;font-weight:600;">Due</small>`;
  };

  let html = '';

  // Include Opening Balance if showing ALL or CHARGES
  if (passbookFilter === 'all' || passbookFilter === 'charges') {
    html += `
      <tr style="background: rgba(245, 158, 11, 0.06);">
        <td><strong>${fmtLong(data.from_date)}</strong></td>
        <td><span class="pb-badge pb-badge-opening">🟡 Opening Balance</span></td>
        <td><strong>Opening Balance carried forward as on ${fmtLong(data.from_date)}</strong></td>
        <td style="color:var(--text-muted);text-align:right;">–</td>
        <td style="color:var(--text-muted);text-align:right;">–</td>
        <td style="color:var(--text-muted);text-align:right;">–</td>
        <td style="text-align:right;">${balanceCell(data.previous_due_balance)}</td>
      </tr>
    `;
  }

  if (filteredEntries.length > 0) {
    html += filteredEntries.map((item, idx) => {
      const isDue = item.entry_type === 'DUE_IMPOSED';
      const isPayment = item.entry_type === 'DUES_PAYMENT';
      const isDonation = item.entry_type === 'DONATION_PAYMENT';
      const itemId = `pbItem_${idx}_${item.id || item.date}`;
      const isExpanded = expandedPassbookItemIds.has(itemId);

      let badgeHtml, particularsHtml;
      if (isDue) {
        badgeHtml = `<span class="pb-badge pb-badge-charge">🔴 Charge Applied</span>`;
        particularsHtml = `Event Fee – <strong>${item.description}</strong>`;
      } else if (isPayment) {
        badgeHtml = `<span class="pb-badge pb-badge-payment">🟢 Payment Received</span>`;
        const receiptMatch = item.description.match(/^([^\s-][^\s]*(?:-[^\s]+)*)\s*-\s*/);
        const receiptNo = receiptMatch ? receiptMatch[1] : (item.receipt_no || '');
        const eventName = item.description.replace(/^[^-]+-\s*/, '').trim();
        particularsHtml = `Payment for <strong>${eventName}</strong><br><small style="color:var(--text-muted);font-size:0.75rem;">Receipt: ${receiptNo || 'N/A'}</small>`;
      } else if (isDonation) {
        badgeHtml = `<span class="pb-badge pb-badge-payment">🟢 Donation</span>`;
        particularsHtml = `Donation – ${item.description}`;
      } else {
        badgeHtml = `<span class="pb-badge pb-badge-adjustment">🔵 ${item.entry_type}</span>`;
        particularsHtml = item.description;
      }

      const eventFeeCell = isDue && item.contribution_amount > 0
        ? `<strong class="text-gold">${formatINR(item.contribution_amount)}</strong>`
        : `<span style="color:var(--text-muted);">–</span>`;

      return `
        <tr class="passbook-row-expandable" onclick="togglePassbookItemExpand('${itemId}')">
          <td style="white-space:nowrap;">${fmtLong(item.date)}</td>
          <td>${badgeHtml}</td>
          <td>${particularsHtml}</td>
          <td style="text-align:right;">${eventFeeCell}</td>
          <td style="text-align:right;" class="text-rose">${item.debit > 0 ? formatINR(item.debit) : '–'}</td>
          <td style="text-align:right;" class="text-emerald">${item.credit > 0 ? formatINR(item.credit) : '–'}</td>
          <td style="text-align:right;">${balanceCell(item.due_balance)}</td>
        </tr>
        ${isExpanded ? `
          <tr class="passbook-row-detail">
            <td colspan="7" style="padding:0;">
              <div class="passbook-detail-box">
                <div><strong>Transaction Date:</strong> ${fmtLong(item.date)}</div>
                <div><strong>Type:</strong> ${item.entry_type}</div>
                <div><strong>Description:</strong> ${item.description || '-'}</div>
                ${item.receipt_no ? `<div><strong>Receipt No:</strong> ${item.receipt_no}</div>` : ''}
                ${item.payment_mode ? `<div><strong>Payment Mode:</strong> ${item.payment_mode}</div>` : ''}
                ${item.notes ? `<div><strong>Notes:</strong> ${item.notes}</div>` : ''}
                ${isPayment && item.receipt_no ? `
                  <div>
                    <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();viewPassbookReceipt('${item.receipt_no}')">
                      📄 View Receipt
                    </button>
                  </div>
                ` : ''}
              </div>
            </td>
          </tr>
        ` : ''}
      `;
    }).join('');
  } else if (passbookFilter !== 'all' && passbookFilter !== 'charges') {
    html = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px;">No ${passbookFilter} activity found in selected statement period.</td></tr>`;
  }

  tbody.innerHTML = html;
}

// ── Render Mobile Timeline View ───────────────────────────────────
function renderPassbookMobileTimeline(data, filteredEntries, fmtLong) {
  const container = document.getElementById('passbookMobileTimeline');
  if (!container) return;

  let html = '';

  // Opening Balance Card (if ALL or CHARGES filter)
  if (passbookFilter === 'all' || passbookFilter === 'charges') {
    html += `
      <div class="passbook-timeline-card type-opening">
        <div class="passbook-card-header">
          <span class="pb-badge pb-badge-opening">🟡 Opening Balance</span>
          <span class="passbook-card-date">${fmtLong(data.from_date)}</span>
        </div>
        <div class="passbook-card-title">Opening Balance Carried Forward</div>
        <div class="passbook-card-body">
          <div>
            <div style="font-size:0.7rem;color:var(--text-muted);">Carried Balance</div>
            <div class="passbook-card-amount text-gold">${formatINR(data.previous_due_balance)}</div>
          </div>
          <div class="passbook-card-balance">
            <div>Running Balance</div>
            <strong style="color:var(--accent-gold);">${formatINR(data.previous_due_balance)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  if (filteredEntries.length > 0) {
    html += filteredEntries.map((item, idx) => {
      const isDue = item.entry_type === 'DUE_IMPOSED';
      const isPayment = item.entry_type === 'DUES_PAYMENT';
      const isDonation = item.entry_type === 'DONATION_PAYMENT';
      const itemId = `pbMob_${idx}_${item.id || item.date}`;
      const isExpanded = expandedPassbookItemIds.has(itemId);

      let cardTypeClass, badgeHtml, titleHtml, amountHtml;
      if (isDue) {
        cardTypeClass = 'type-charge';
        badgeHtml = `<span class="pb-badge pb-badge-charge">🔴 Charge Applied</span>`;
        titleHtml = item.description || 'Event Fee Charge';
        amountHtml = `<span class="passbook-card-amount text-rose">- ${formatINR(item.debit)}</span>`;
      } else if (isPayment) {
        cardTypeClass = 'type-payment';
        badgeHtml = `<span class="pb-badge pb-badge-payment">🟢 Payment Received</span>`;
        titleHtml = item.description || 'Payment Credit';
        amountHtml = `<span class="passbook-card-amount text-emerald">+ ${formatINR(item.credit)}</span>`;
      } else if (isDonation) {
        cardTypeClass = 'type-payment';
        badgeHtml = `<span class="pb-badge pb-badge-payment">🟢 Donation</span>`;
        titleHtml = item.description || 'Donation Credit';
        amountHtml = `<span class="passbook-card-amount text-emerald">+ ${formatINR(item.credit)}</span>`;
      } else {
        cardTypeClass = 'type-adjust';
        badgeHtml = `<span class="pb-badge pb-badge-adjustment">🔵 Adjustment</span>`;
        titleHtml = item.description || 'Account Adjustment';
        amountHtml = `<span class="passbook-card-amount">${formatINR(item.debit || item.credit || 0)}</span>`;
      }

      return `
        <div class="passbook-timeline-card ${cardTypeClass}">
          <div class="passbook-card-header">
            ${badgeHtml}
            <span class="passbook-card-date">${fmtLong(item.date)}</span>
          </div>
          <div class="passbook-card-title">${titleHtml}</div>
          <div class="passbook-card-body">
            <div>
              <div style="font-size:0.7rem;color:var(--text-muted);">${isDue ? 'Debit Charge' : 'Credit Amount'}</div>
              ${amountHtml}
            </div>
            <div class="passbook-card-balance">
              <div>Due Balance</div>
              <strong class="${item.due_balance > 0 ? 'text-rose' : 'text-emerald'}">${formatINR(item.due_balance)}</strong>
            </div>
          </div>
          <div class="passbook-card-actions">
            <button class="btn btn-outline btn-sm" onclick="togglePassbookItemExpand('${itemId}')" style="font-size:0.75rem;padding:4px 10px;">
              ${isExpanded ? '▲ Hide Details' : '▼ More Details'}
            </button>
            ${isPayment ? `
              <button class="btn btn-emerald btn-sm" onclick="viewPassbookReceipt('${item.receipt_no || ''}')" style="font-size:0.75rem;padding:4px 10px;">
                📄 View Receipt
              </button>
            ` : ''}
          </div>
          ${isExpanded ? `
            <div class="passbook-card-drawer">
              <div><strong>Date:</strong> ${fmtLong(item.date)}</div>
              <div><strong>Type:</strong> ${item.entry_type}</div>
              ${item.receipt_no ? `<div><strong>Receipt No:</strong> ${item.receipt_no}</div>` : ''}
              ${item.payment_mode ? `<div><strong>Payment Mode:</strong> ${item.payment_mode}</div>` : ''}
              ${item.notes ? `<div><strong>Notes:</strong> ${item.notes}</div>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } else if (passbookFilter !== 'all' && passbookFilter !== 'charges') {
    html = `
      <div class="passbook-empty-state">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">📖</div>
        <p style="color: var(--text-secondary); font-size: 0.9rem;">No ${passbookFilter} found in selected date range.</p>
      </div>
    `;
  }

  container.innerHTML = html;
}

function togglePassbookItemExpand(itemId) {
  if (expandedPassbookItemIds.has(itemId)) {
    expandedPassbookItemIds.delete(itemId);
  } else {
    expandedPassbookItemIds.add(itemId);
  }
  renderPassbookStatement();
}

function openQuickRecordPaymentForMember() {
  if (!passbookCurrentData || !passbookCurrentData.member) {
    showToast('Please select a member first', 'warning');
    return;
  }
  const m = passbookCurrentData.member;
  openTransactionModal();

  // Pre-fill member selection in transaction modal
  setTimeout(() => {
    const txMemberSelect = document.getElementById('txMemberId');
    if (txMemberSelect) txMemberSelect.value = m.id;
    if (typeof txSearchSelectInstance !== 'undefined' && txSearchSelectInstance) {
      txSearchSelectInstance.setValue(m.id);
    }
  }, 100);
}

function viewPassbookReceipt(receiptNo) {
  if (!receiptNo) {
    showToast('Receipt number not available', 'info');
    return;
  }
  switchTab('transactions');
  const txSearch = document.getElementById('txSearchInput');
  if (txSearch) {
    txSearch.value = receiptNo;
    if (typeof onTxSearchInput === 'function') onTxSearchInput(receiptNo);
    else if (typeof filterTransactionsTable === 'function') filterTransactionsTable();
  }
  showToast(`Filtered receipt: ${receiptNo}`, 'info');
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

    if (!res.ok || rData.error) {
      showToast(rData.error || 'Failed to generate report', 'error');
      return;
    }

    if (type === 'event') {
      renderEventReportView(rData, container);
    } else {
      renderFinancialReportView(rData, container);
    }
  } catch (err) {
    console.error('Report generation error:', err);
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
  if (!data || !data.event) {
    container.innerHTML = `<div style="text-align: center; color: var(--accent-rose); padding: 40px 0;">Event report data not found.</div>`;
    return;
  }
  const ev = data.event;
  const dues = data.dues || [];
  const expenses = data.expenses || [];

  container.innerHTML = `
    <div style="border-bottom: 2px solid var(--glass-border); padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 style="color: var(--accent-gold); font-size: 1.5rem;">EVENT BALANCE SHEET: ${(ev.title || '').toUpperCase()}</h2>
        <p style="color: var(--text-secondary);">Event Date: ${formatDate(ev.event_date)} | Contribution Imposed: ${formatINR(ev.contribution_amount)} Per Member</p>
      </div>
      <img src="assets/logo.png" style="width: 50px; height: 50px;">
    </div>

    <div class="metrics-grid" style="margin-bottom: 24px;">
      <div class="metric-card">
        <span class="metric-title">Total Imposed Dues</span>
        <span class="metric-value">${formatINR(data.total_imposed_dues || 0)}</span>
      </div>
      <div class="metric-card emerald">
        <span class="metric-title">Dues Collected</span>
        <span class="metric-value text-emerald">${formatINR(data.total_collected_dues || 0)}</span>
      </div>
      <div class="metric-card rose">
        <span class="metric-title">Pending Dues</span>
        <span class="metric-value text-rose">${formatINR(data.total_pending_dues || 0)}</span>
      </div>
      <div class="metric-card blue">
        <span class="metric-title">Event Expenses</span>
        <span class="metric-value text-rose">${formatINR(data.total_expenses || 0)}</span>
      </div>
    </div>

    <h3 style="margin-bottom: 12px; color: var(--accent-gold);">Member Dues Collection Breakdown (${dues.length} Members)</h3>
    <div class="table-responsive" style="margin-bottom: 24px;">
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
          ${dues.map(d => `
            <tr>
              <td><strong class="text-gold">${d.member_code || '-'}</strong></td>
              <td>${d.member_name || '-'}</td>
              <td>${formatINR(d.amount || 0)}</td>
              <td class="text-emerald">${formatINR(d.paid_amount || 0)}</td>
              <td><span class="badge ${d.status === 'completed' ? 'badge-completed' : 'badge-pending'}">${(d.status || 'pending').toUpperCase()}</span></td>
            </tr>
          `).join('') || '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No member dues found for this event.</td></tr>'}
        </tbody>
      </table>
    </div>

    ${expenses.length > 0 ? `
      <h3 style="margin-bottom: 12px; color: var(--accent-rose);">Event Expenses Breakdown (${expenses.length} Records)</h3>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Voucher No</th>
              <th>Expense Date</th>
              <th>Title</th>
              <th>Paid To</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${expenses.map(ex => `
              <tr>
                <td><strong class="text-gold">${ex.voucher_no || '-'}</strong></td>
                <td>${formatDate(ex.expense_date)}</td>
                <td>${ex.title || '-'}</td>
                <td>${ex.paid_to || '-'}</td>
                <td class="text-rose"><strong>${formatINR(ex.amount || 0)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
  `;
}

// 8. USERS MANAGEMENT
let usersList = [];

async function loadUsersData() {
  const isAdmin = currentUser && (currentUser.role || '').toLowerCase() === 'admin';
  if (!isAdmin) return;

  try {
    const res = await fetch('/api/auth/users');
    if (!res.ok) return;
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
          <div style="display:flex;gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="editUser(${u.id})">&#9999;&#65039; Edit</button>
            ${u.email !== 'kpnsclub@gmail.com' ? `<button class="btn btn-rose btn-sm" onclick="deleteUser(${u.id})">&#128465;&#65039; Delete</button>` : `<span style="font-size:0.75rem;color:var(--text-muted);padding:4px 8px;">🔒 Default</span>`}
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6">No app users found.</td></tr>';
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
  if (!nav) return;

  const isOpen = nav.classList.contains('mobile-active');
  if (isOpen) {
    closeMobileMenu();
  } else {
    nav.classList.add('mobile-active');
    if (overlay) overlay.classList.add('active');
  }
}

function closeMobileMenu() {
  const nav = document.getElementById('mainNav');
  const overlay = document.getElementById('navOverlay');
  if (nav) nav.classList.remove('mobile-active');
  if (overlay) overlay.classList.remove('active');
}

// User Dropdown logic
function toggleUserDropdown(event) {
  event.stopPropagation();
  const container = document.getElementById('userDropdownContainer');
  const toggleBtn = document.getElementById('userMenuToggle');
  
  if (container) {
    const isOpen = container.classList.contains('open');
    if (isOpen) {
      container.classList.remove('open');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    } else {
      container.classList.add('open');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    }
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
  const container = document.getElementById('userDropdownContainer');
  if (container && container.classList.contains('open') && !container.contains(event.target)) {
    container.classList.remove('open');
    const toggleBtn = document.getElementById('userMenuToggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
  }
});

// Close drawer on ESC key
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    closeMobileMenu();
    
    // Also close dropdown if open
    const container = document.getElementById('userDropdownContainer');
    if (container && container.classList.contains('open')) {
      container.classList.remove('open');
      const toggleBtn = document.getElementById('userMenuToggle');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    }
  }
});

// Swipe-to-close gesture on mobile drawer
let touchStartX = 0;
let touchEndX = 0;
document.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
}, { passive: true });

function handleSwipe() {
  const nav = document.getElementById('mainNav');
  if (!nav || !nav.classList.contains('mobile-active')) return;
  
  // Swipe Left to close (drawer slides in from left)
  if (touchStartX - touchEndX > 50) {
    closeMobileMenu();
  }
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
  
  document.querySelectorAll(`button[onclick="switchTab('${tabId}')"]`).forEach(btn => {
    btn.classList.add('active');
  });

  if (tabId === 'users') {
    const isAdmin = currentUser && (currentUser.role || '').toLowerCase() === 'admin';
    if (!isAdmin) {
      showToast('Users Management tab is restricted to Admin users only.', 'warning');
      switchTab('dashboard');
      return;
    }
    loadUsersData();
  }

  // Close mobile drawer after selecting a tab
  closeMobileMenu();
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

let currentEventDuesData = null;
let currentEventDuesFilter = 'pending';

async function viewEventPendingMembers(eventId) {
  try {
    const res = await fetch(`/api/events/${eventId}`);
    const data = await res.json();
    currentEventDuesData = data;
    currentEventDuesFilter = 'pending';
    
    document.getElementById('btnFilterPendingDues').classList.add('active');
    document.getElementById('btnFilterAllDues').classList.remove('active');
    document.getElementById('btnFilterPaidDues').classList.remove('active');
    
    const ev = data.event;
    document.getElementById('eventDuesTitle').innerText = `🎯 ${ev.title}`;
    document.getElementById('eventDuesSub').innerText = `Event Date: ${formatDate(ev.event_date)} | Contribution Imposed: ${formatINR(ev.contribution_amount)} Per Member`;

    if (document.getElementById('searchEventDuesInput')) {
      document.getElementById('searchEventDuesInput').value = '';
    }

    renderEventDuesTable();
    openModal('eventDuesModal');
  } catch (err) {
    showToast('Failed to load event dues details', 'error');
  }
}

function filterEventDues(filterType) {
  currentEventDuesFilter = filterType;
  document.getElementById('btnFilterPendingDues').classList.toggle('active', filterType === 'pending');
  document.getElementById('btnFilterAllDues').classList.toggle('active', filterType === 'all');
  document.getElementById('btnFilterPaidDues').classList.toggle('active', filterType === 'completed');
  renderEventDuesTable();
}

function renderEventDuesTable() {
  if (!currentEventDuesData) return;
  const dues = currentEventDuesData.dues || [];
  const search = (document.getElementById('searchEventDuesInput')?.value || '').toLowerCase().trim();

  const pendingList = dues.filter(d => ((parseFloat(d.amount) || 0) - (parseFloat(d.paid_amount) || 0)) > 0);
  const paidList = dues.filter(d => ((parseFloat(d.amount) || 0) - (parseFloat(d.paid_amount) || 0)) <= 0);

  document.getElementById('countPendingDues').innerText = pendingList.length;
  document.getElementById('countAllDues').innerText = dues.length;
  document.getElementById('countPaidDues').innerText = paidList.length;

  let filtered = dues;
  if (currentEventDuesFilter === 'pending') {
    filtered = pendingList;
  } else if (currentEventDuesFilter === 'completed') {
    filtered = paidList;
  }

  if (search) {
    filtered = filtered.filter(d => 
      (d.member_name || '').toLowerCase().includes(search) || 
      (d.member_code || '').toLowerCase().includes(search) || 
      (d.member_phone || '').includes(search)
    );
  }

  const tbody = document.getElementById('eventDuesTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">No members found for this view filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const amount = parseFloat(d.amount) || 0;
    const paid = parseFloat(d.paid_amount) || 0;
    const pending = Math.max(0, amount - paid);
    const isPending = pending > 0;
    const statusClass = isPending ? (paid > 0 ? 'role-badge' : 'role-badge') : 'role-badge';
    const statusBg = isPending ? (paid > 0 ? 'background: rgba(245,158,11,0.2); color:#f59e0b;' : 'background: rgba(239,68,68,0.2); color:#ef4444;') : 'background: rgba(34,197,94,0.2); color:#22c55e;';
    const statusText = isPending ? (paid > 0 ? 'PARTIAL' : 'PENDING') : 'PAID';

    return `
      <tr>
        <td><strong class="text-gold">${d.member_code}</strong></td>
        <td><strong>${d.member_name}</strong></td>
        <td>${cleanNumber(d.member_phone) || '-'}</td>
        <td>${formatINR(amount)}</td>
        <td class="text-emerald">${formatINR(paid)}</td>
        <td class="text-rose"><strong>${formatINR(pending)}</strong></td>
        <td><span class="${statusClass}" style="${statusBg}">${statusText}</span></td>
        <td>
          ${isPending ? `
            <button class="btn btn-emerald btn-sm" onclick="payEventDueForMember(${d.member_id}, ${currentEventDuesData.event.id}, ${d.id}, ${pending})">
              💰 Collect ₹${pending}
            </button>
          ` : `
            <span style="color: var(--accent-success); font-size: 0.85rem; font-weight: 600;">✓ Paid</span>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

function payEventDueForMember(memberId, eventId, dueId, pendingAmount) {
  closeModal('eventDuesModal');
  openTransactionModal({
    type: 'member_payment',
    memberId: memberId,
    eventId: eventId,
    dueId: dueId,
    amount: pendingAmount
  });
}

function openTransactionModal(prefill = null) {
  document.getElementById('txDate').value = (prefill && prefill.created_at) ? prefill.created_at : new Date().toISOString().slice(0, 10);
  const singleRadio = document.querySelector('input[name="txEventMode"][value="single"]');
  if (singleRadio) singleRadio.checked = true;
  handleEventModeChange();

  // Reset member search selector for a fresh open
  if (!prefill && txMemberSearchInstance) {
    txMemberSearchInstance.clearSelection();
  }

  fetchNextReceiptNo();

  openModal('transactionModal');

  if (prefill) {
    if (prefill.type) {
      document.getElementById('txType').value = prefill.type;
      toggleTxTypeFields();
    }
    if (prefill.memberId) {
      if (txMemberSearchInstance) {
        txMemberSearchInstance.setValue(prefill.memberId);
      } else {
        const el = document.getElementById('txMemberId');
        if (el) el.value = prefill.memberId;
      }
    }
    if (prefill.dueId) {
      document.getElementById('txDueId').value = prefill.dueId;
    }
    if (prefill.eventId) {
      const checkboxes = document.querySelectorAll('input[name="txEventIds"]');
      checkboxes.forEach(cb => {
        cb.checked = (String(cb.value) === String(prefill.eventId));
      });
      onTxEventCheckboxChange();
    }
    if (prefill.amount) {
      document.getElementById('txAmount').value = prefill.amount;
    }
  }
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
  if (!isManagementRole(currentUser)) {
    showToast('Management role required to change member status.', 'warning');
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


