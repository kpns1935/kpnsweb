/**
 * MemberSearchSelect Component
 * Reusable searchable autocomplete component for selecting KPNS members.
 * Supports instant search, debouncing, keyboard navigation, text highlighting, 
 * ranking, clear button, ARIA accessibility, and compact profile card display.
 */
class MemberSearchSelect {
  constructor(options) {
    this.container = typeof options.container === 'string' 
      ? document.getElementById(options.container) 
      : options.container;

    if (!this.container) {
      console.error('MemberSearchSelect: Container element not found:', options.container);
      return;
    }

    this.id = options.id || 'memberSearchSelect_' + Math.random().toString(36).substr(2, 9);
    this.inputId = options.inputId || (options.id ? options.id + '_input' : 'memberSearchInput');
    this.hiddenInputId = options.hiddenInputId || options.id || null;
    this.placeholder = options.placeholder || '🔍 Search Member by ID, Name, Mobile or Email...';
    this.onSelect = options.onSelect || null;
    this.onClear = options.onClear || null;
    this.includeInactive = options.includeInactive || false;
    this.required = options.required || false;
    this.label = options.label || 'Select Member';

    this.selectedMember = null;
    this.results = [];
    this.highlightedIndex = -1;
    this.isOpen = false;
    this.debounceTimer = null;

    this.init();
  }

  init() {
    this.container.classList.add('member-search-select-wrapper');
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="member-search-container" id="${this.id}_container">
        <!-- Hidden input for form backwards compatibility -->
        ${this.hiddenInputId ? `<input type="hidden" id="${this.hiddenInputId}" value="">` : ''}

        <!-- Selected Profile Card (Hidden by default) -->
        <div class="selected-member-card" id="${this.id}_selectedCard" style="display: none;">
          <div class="member-card-content">
            <div class="member-card-header">
              <span class="member-avatar">👤</span>
              <div class="member-main-info">
                <strong class="member-name-title" id="${this.id}_cardName"></strong>
                <span class="member-badge" id="${this.id}_cardStatus">Active</span>
              </div>
            </div>
            <div class="member-card-details">
              <span><strong>Member ID :</strong> <span id="${this.id}_cardCode"></span></span>
              <span>📞 <span id="${this.id}_cardPhone"></span></span>
              <span id="${this.id}_cardEmailGroup">✉️ <span id="${this.id}_cardEmail"></span></span>
            </div>
          </div>
          <button type="button" class="btn-clear-selection" id="${this.id}_clearBtn" title="Change / Clear Member">&times;</button>
        </div>

        <!-- Search Input Box -->
        <div class="search-input-box-wrapper" id="${this.id}_searchWrapper">
          <div class="search-input-inner">
            <input 
              type="text" 
              id="${this.inputId}" 
              class="form-control member-search-input" 
              placeholder="${this.placeholder}"
              autocomplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="false"
              aria-controls="${this.id}_dropdown"
            />
            <button type="button" class="btn-input-reset" id="${this.id}_resetQueryBtn" style="display: none;" title="Clear search">&times;</button>
          </div>
        </div>

        <!-- Autocomplete Dropdown List -->
        <div class="member-search-dropdown" id="${this.id}_dropdown" role="listbox" style="display: none;">
          <div class="member-search-results-list" id="${this.id}_resultsList"></div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const input = document.getElementById(this.inputId);
    const resetQueryBtn = document.getElementById(`${this.id}_resetQueryBtn`);
    const clearSelectionBtn = document.getElementById(`${this.id}_clearBtn`);

    if (input) {
      input.addEventListener('input', (e) => {
        const q = e.target.value;
        if (resetQueryBtn) {
          resetQueryBtn.style.display = q.trim() ? 'block' : 'none';
        }
        this.handleInput(q);
      });

      input.addEventListener('focus', () => {
        const q = input.value;
        this.handleInput(q, true);
      });

      input.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    if (resetQueryBtn) {
      resetQueryBtn.addEventListener('click', () => {
        if (input) {
          input.value = '';
          input.focus();
        }
        resetQueryBtn.style.display = 'none';
        this.handleInput('');
      });
    }

    if (clearSelectionBtn) {
      clearSelectionBtn.addEventListener('click', () => {
        this.clearSelection();
      });
    }

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.closeDropdown();
      }
    });
  }

  handleInput(query, forceOpen = false) {
    clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.search(query, forceOpen);
    }, 150);
  }

  getMembersList() {
    if (Array.isArray(window.membersList) && window.membersList.length > 0) {
      return window.membersList;
    }
    if (typeof membersList !== 'undefined' && Array.isArray(membersList) && membersList.length > 0) {
      window.membersList = membersList;
      return membersList;
    }
    return window.membersList || [];
  }

  async search(query, forceOpen = false) {
    const q = (query || '').trim().toLowerCase();

    let allMembers = this.getMembersList();

    // If cache is empty, attempt to fetch from backend automatically
    if (allMembers.length === 0) {
      try {
        const res = await fetch('/api/members');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            window.membersList = data;
            if (typeof membersList !== 'undefined') membersList = data;
            allMembers = data;
          }
        }
      } catch (err) {
        console.error('MemberSearchSelect fallback fetch error:', err);
      }
    }

    if (!this.includeInactive) {
      allMembers = allMembers.filter(m => (m.member_status || 'Active').toUpperCase() === 'ACTIVE');
    }

    if (!q) {
      const topResults = [...allMembers].sort((a, b) => (a.name || '').localeCompare(b.name || '')).slice(0, 20);
      this.renderResults(topResults, q);
      if (forceOpen && topResults.length > 0) {
        this.openDropdown();
      }
      return;
    }

    // Ranking priority:
    // 1. Exact Member ID
    // 2. Exact Mobile Number
    // 3. Exact Email Address
    // 4. Member Name starts with query
    // 5. Member Name contains query
    // 6. Member Code / Phone / Email contains query
    const ranked = [];
    for (const m of allMembers) {
      const code = (m.member_code || '').toLowerCase();
      const phone = (m.phone || '').toLowerCase();
      const altPhone = (m.alternative_number || '').toLowerCase();
      const email = (m.email || '').toLowerCase();
      const name = (m.name || '').toLowerCase();

      let rank = Infinity;
      if (code === q) rank = 1;
      else if (phone === q || altPhone === q) rank = 2;
      else if (email === q) rank = 3;
      else if (name.startsWith(q)) rank = 4;
      else if (name.includes(q)) rank = 5;
      else if (code.includes(q)) rank = 6;
      else if (phone.includes(q) || altPhone.includes(q)) rank = 7;
      else if (email.includes(q)) rank = 8;

      if (rank !== Infinity) {
        ranked.push({ member: m, rank });
      }
    }

    ranked.sort((a, b) => a.rank - b.rank || (a.member.name || '').localeCompare(b.member.name || ''));

    const finalResults = ranked.slice(0, 20).map(r => r.member);
    this.renderResults(finalResults, q);
    this.openDropdown();
  }

  renderResults(results, query) {
    this.results = results;
    this.highlightedIndex = -1;
    const listContainer = document.getElementById(`${this.id}_resultsList`);
    if (!listContainer) return;

    if (results.length === 0) {
      listContainer.innerHTML = `
        <div class="member-search-empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">No member found.</div>
          <div class="empty-subtitle">Try searching by:</div>
          <ul class="empty-tips">
            <li>• Member ID (e.g. KPNS0001)</li>
            <li>• Name</li>
            <li>• Mobile Number</li>
            <li>• Email Address</li>
          </ul>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = results.map((m, idx) => `
      <div 
        class="member-search-item" 
        data-index="${idx}" 
        id="${this.id}_item_${idx}"
        role="option"
        aria-selected="false"
      >
        <div class="item-main">
          <span class="item-code">${this.highlightMatch(m.member_code || '', query)}</span>
          <strong class="item-name">${this.highlightMatch(m.name || '', query)}</strong>
        </div>
        <div class="item-sub">
          <span>📞 ${this.highlightMatch(m.phone || 'N/A', query)}</span>
          ${m.email ? `<span>✉️ ${this.highlightMatch(m.email, query)}</span>` : ''}
          <span class="badge badge-sm ${(m.member_status || 'Active').toLowerCase() === 'active' ? 'badge-active' : 'badge-inactive'}">
            ${m.member_status || 'Active'}
          </span>
        </div>
      </div>
    `).join('');

    const items = listContainer.querySelectorAll('.member-search-item');
    items.forEach((itemEl) => {
      itemEl.addEventListener('click', () => {
        const idx = parseInt(itemEl.getAttribute('data-index'), 10);
        if (this.results[idx]) {
          this.selectMember(this.results[idx]);
        }
      });
    });
  }

  highlightMatch(text, query) {
    if (!query || !text) return this.escapeHtml(text);
    const strText = String(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    
    // Split and rebuild safely with <mark>
    const parts = strText.split(regex);
    return parts.map(part => {
      if (part.toLowerCase() === query.toLowerCase()) {
        return `<mark class="search-highlight">${this.escapeHtml(part)}</mark>`;
      }
      return this.escapeHtml(part);
    }).join('');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  handleKeyDown(e) {
    const listContainer = document.getElementById(`${this.id}_resultsList`);
    const items = listContainer ? listContainer.querySelectorAll('.member-search-item') : [];

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.isOpen) {
        this.openDropdown();
        return;
      }
      this.highlightedIndex = Math.min(this.highlightedIndex + 1, items.length - 1);
      this.updateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.isOpen) return;
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
      this.updateHighlight(items);
    } else if (e.key === 'Enter') {
      if (this.isOpen && this.highlightedIndex >= 0 && this.results[this.highlightedIndex]) {
        e.preventDefault();
        this.selectMember(this.results[this.highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      this.closeDropdown();
    }
  }

  updateHighlight(items) {
    items.forEach((item, idx) => {
      if (idx === this.highlightedIndex) {
        item.classList.add('highlighted');
        item.setAttribute('aria-selected', 'true');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('highlighted');
        item.setAttribute('aria-selected', 'false');
      }
    });
  }

  openDropdown() {
    const dropdown = document.getElementById(`${this.id}_dropdown`);
    const input = document.getElementById(this.inputId);
    if (dropdown) {
      dropdown.style.display = 'block';
      this.isOpen = true;
      if (input) input.setAttribute('aria-expanded', 'true');
    }
  }

  closeDropdown() {
    const dropdown = document.getElementById(`${this.id}_dropdown`);
    const input = document.getElementById(this.inputId);
    if (dropdown) {
      dropdown.style.display = 'none';
      this.isOpen = false;
      this.highlightedIndex = -1;
      if (input) input.setAttribute('aria-expanded', 'false');
    }
  }

  selectMember(member) {
    if (!member) return;

    this.selectedMember = member;

    if (this.hiddenInputId) {
      const hiddenInput = document.getElementById(this.hiddenInputId);
      if (hiddenInput) {
        hiddenInput.value = member.id;
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    document.getElementById(`${this.id}_cardName`).textContent = member.name || 'N/A';
    document.getElementById(`${this.id}_cardCode`).textContent = member.member_code || 'N/A';
    document.getElementById(`${this.id}_cardPhone`).textContent = member.phone || 'N/A';

    const emailEl = document.getElementById(`${this.id}_cardEmail`);
    const emailGroup = document.getElementById(`${this.id}_cardEmailGroup`);
    if (member.email) {
      emailEl.textContent = member.email;
      emailGroup.style.display = 'inline';
    } else {
      emailGroup.style.display = 'none';
    }

    const statusBadge = document.getElementById(`${this.id}_cardStatus`);
    if (statusBadge) {
      statusBadge.textContent = member.member_status || 'Active';
      statusBadge.className = `member-badge ${(member.member_status || 'Active').toLowerCase() === 'active' ? 'badge-active' : 'badge-inactive'}`;
    }

    document.getElementById(`${this.id}_searchWrapper`).style.display = 'none';
    document.getElementById(`${this.id}_selectedCard`).style.display = 'flex';
    this.closeDropdown();

    if (typeof this.onSelect === 'function') {
      this.onSelect(member);
    }
  }

  clearSelection() {
    this.selectedMember = null;

    if (this.hiddenInputId) {
      const hiddenInput = document.getElementById(this.hiddenInputId);
      if (hiddenInput) {
        hiddenInput.value = '';
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const input = document.getElementById(this.inputId);
    if (input) {
      input.value = '';
    }

    const resetQueryBtn = document.getElementById(`${this.id}_resetQueryBtn`);
    if (resetQueryBtn) resetQueryBtn.style.display = 'none';

    document.getElementById(`${this.id}_selectedCard`).style.display = 'none';
    document.getElementById(`${this.id}_searchWrapper`).style.display = 'block';

    if (input) input.focus();

    if (typeof this.onClear === 'function') {
      this.onClear();
    }
  }

  async setValue(memberId) {
    if (!memberId) {
      this.clearSelection();
      return;
    }

    let members = this.getMembersList();
    if (members.length === 0) {
      try {
        const res = await fetch('/api/members');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            window.membersList = data;
            if (typeof membersList !== 'undefined') membersList = data;
            members = data;
          }
        }
      } catch (err) {}
    }

    const member = members.find(m => m.id == memberId);
    if (member) {
      this.selectMember(member);
    } else {
      this.clearSelection();
    }
  }

  getValue() {
    return this.selectedMember ? this.selectedMember.id : '';
  }
}

window.MemberSearchSelect = MemberSearchSelect;
