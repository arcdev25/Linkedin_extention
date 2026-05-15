// src/popup.js

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sendMsg(type, data = {}) {
  return new Promise((res, rej) => {
    chrome.runtime.sendMessage({ type, ...data }, resp => {
      if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
      else if (resp?.error) rej(new Error(resp.error));
      else res(resp);
    });
  });
}

function flash(elId, text, type = 'ok') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className = `flash ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'flash'; }, 3000);
}

function dn(name, company) {
  return company ? `${name}'s ${company}` : name;
}

const COLORS = [
  { id: 'yellow', bg: '#FEF08A', text: '#713F12' },
  { id: 'green',  bg: '#BBF7D0', text: '#14532D' },
  { id: 'blue',   bg: '#BAE6FD', text: '#0C4A6E' },
  { id: 'pink',   bg: '#FBCFE8', text: '#831843' },
  { id: 'orange', bg: '#FED7AA', text: '#7C2D12' },
];

// ─── Screen switcher ──────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ─── Tab switcher ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ─── Init: check session ──────────────────────────────────────────────────────
let currentSession = null;

async function init() {
  document.getElementById('app-sub').textContent = 'AUTHENTICATING…';
  try {
    const { session } = await sendMsg('GET_SESSION');
    if (session) {
      currentSession = session;
      enterMain(session);
    } else {
      showScreen('screen-login');
      document.getElementById('app-sub').textContent = 'SIGN IN REQUIRED';
      document.getElementById('login-email').focus();
    }
  } catch (e) {
    showScreen('screen-login');
    document.getElementById('app-sub').textContent = 'SIGN IN REQUIRED';
  }
}

function enterMain(session) {
  document.getElementById('app-sub').textContent = `${session.name.toUpperCase()}`;
  document.getElementById('user-name-label').textContent = session.name;
  document.getElementById('user-email-label').textContent = session.email;
  showScreen('screen-main');
  loadAccounts(session);
  loadKeywords(session);
  buildColorPicker();
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', async () => {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-err');
  const btn      = document.getElementById('login-btn');

  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Email and password required.'; errEl.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = 'Signing in…';

  try {
    const { session } = await sendMsg('LOGIN', { email, password });
    currentSession = session;
    enterMain(session);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Sign In →';
  }
});

document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('login-btn').click();
});

// Signup → open external page
document.getElementById('signup-btn').addEventListener('click', () => {
  sendMsg('OPEN_SIGNUP');
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
  if (!confirm('Sign out?')) return;
  await sendMsg('LOGOUT');
  currentSession = null;
  showScreen('screen-login');
  document.getElementById('app-sub').textContent = 'SIGN IN REQUIRED';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-err').style.display = 'none';
});

// ─── ACCOUNTS TAB ─────────────────────────────────────────────────────────────
async function loadAccounts(session) {
  const list    = document.getElementById('rec-list');
  const dot     = document.getElementById('status-dot');
  const statTxt = document.getElementById('status-text');

  try {
    const [{ recruiters }, stored] = await Promise.all([
      sendMsg('GET_MY_RECRUITERS', { ownerId: session.id }),
      new Promise(res => chrome.storage.local.get(['current_recruiter_id', 'current_recruiter_name'], res))
    ]);

    dot.className = 'status-dot green';

    if (stored.current_recruiter_name) {
      statTxt.innerHTML = `Active: <strong>${stored.current_recruiter_name}</strong>`;
    } else {
      statTxt.innerHTML = 'Pick an account below';
    }

    if (!recruiters || recruiters.length === 0) {
      list.innerHTML = '<div style="font-size:11px;color:#3d5e78;text-align:center;padding:12px 0">No accounts yet — add one below.</div>';
      return;
    }

    list.innerHTML = recruiters.map(r => {
      const display = dn(r.name, r.company);
      const sel = r.id === stored.current_recruiter_id;
      const nameHtml = r.company ? `${r.name}<em>'s ${r.company}</em>` : r.name;
      return `
        <div class="rec-item ${sel ? 'selected' : ''}" data-id="${r.id}" data-display="${display.replace(/"/g,'&quot;')}">
          <div>
            <div class="rec-name">${nameHtml}</div>
            ${r.email ? `<div class="rec-email">${r.email}</div>` : ''}
          </div>
          ${sel ? '<span class="rec-check">✓</span>' : ''}
        </div>`;
    }).join('');

    list.querySelectorAll('.rec-item').forEach(item => {
      item.addEventListener('click', async () => {
        await chrome.storage.local.set({
          current_recruiter_id: item.dataset.id,
          current_recruiter_name: item.dataset.display
        });
        loadAccounts(session);
      });
    });

  } catch (e) {
    list.innerHTML = `<div style="font-size:11px;color:#ef4444;text-align:center;padding:8px">${e.message}</div>`;
  }
}

// Pre-fill name from session
document.getElementById('new-name').addEventListener('focus', function() {
  if (!this.value && currentSession) this.value = currentSession.name;
});

document.getElementById('add-rec-btn').addEventListener('click', async () => {
  if (!currentSession) return;
  const name    = document.getElementById('new-name').value.trim();
  const company = document.getElementById('new-company').value.trim();
  const email   = document.getElementById('new-email').value.trim();

  if (!name) { flash('rec-flash', '⚠ Name required', 'err'); return; }

  const btn = document.getElementById('add-rec-btn');
  btn.disabled = true; btn.textContent = 'Adding…';

  try {
    const config = await sendMsg('GET_CONFIG');
    const res = await fetch(`${config.supabase_url}/rest/v1/recruiters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.supabase_key,
        'Authorization': `Bearer ${config.supabase_key}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ name, company, email, owner_id: currentSession.id })
    });
    if (!res.ok) throw new Error((await res.json()).message);

    document.getElementById('new-company').value = '';
    document.getElementById('new-email').value   = '';
    flash('rec-flash', `✅ Added ${dn(name, company)}`, 'ok');
    loadAccounts(currentSession);
  } catch (e) {
    flash('rec-flash', `❌ ${e.message}`, 'err');
  }

  btn.disabled = false; btn.textContent = 'Add Account';
});

// ─── KEYWORDS TAB ────────────────────────────────────────────────────────────
let selectedColorId = 'yellow';

function buildColorPicker() {
  const picker = document.getElementById('color-picker');
  picker.innerHTML = COLORS.map(c => `
    <div class="color-dot ${c.id === selectedColorId ? 'active' : ''}"
         data-id="${c.id}" title="${c.id}"
         style="background:${c.bg};border-color:${c.id === selectedColorId ? '#e2eaf4' : 'transparent'}">
    </div>
  `).join('');

  picker.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      selectedColorId = dot.dataset.id;
      buildColorPicker(); // re-render to update active state
    });
  });
}

async function loadKeywords(session) {
  const list = document.getElementById('kw-list');
  try {
    const { keywords } = await sendMsg('GET_KEYWORDS', { ownerId: session.id });
    if (!keywords || keywords.length === 0) {
      list.innerHTML = '<div class="empty-kw">No keywords yet.</div>';
      return;
    }
    list.innerHTML = keywords.map(k => {
      const c = COLORS.find(x => x.id === k.color_id) || COLORS[0];
      return `
        <div class="kw-item">
          <span class="kw-word" style="background:${c.bg};color:${c.text}">${k.word}</span>
          <button class="kw-del" data-id="${k.id}" title="Remove">✕</button>
        </div>`;
    }).join('');

    list.querySelectorAll('.kw-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        await sendMsg('DELETE_KEYWORD', { id: btn.dataset.id });
        loadKeywords(session);
        // Notify content scripts to refresh
        chrome.tabs.query({}, tabs => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_KEYWORDS' }).catch(() => {});
          });
        });
      });
    });

  } catch (e) {
    list.innerHTML = `<div class="empty-kw" style="color:#ef4444">${e.message}</div>`;
  }
}

document.getElementById('kw-add-btn').addEventListener('click', async () => {
  if (!currentSession) return;
  const word = document.getElementById('kw-input').value.trim();
  if (!word) { flash('kw-flash', '⚠ Enter a keyword', 'err'); return; }

  const btn = document.getElementById('kw-add-btn');
  btn.disabled = true; btn.textContent = '…';

  try {
    await sendMsg('ADD_KEYWORD', { ownerId: currentSession.id, word, colorId: selectedColorId });
    document.getElementById('kw-input').value = '';
    flash('kw-flash', `✅ Added "${word}"`, 'ok');
    loadKeywords(currentSession);
    // Notify all tabs to re-highlight
    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_KEYWORDS' }).catch(() => {});
      });
    });
  } catch (e) {
    flash('kw-flash', `❌ ${e.message}`, 'err');
  }

  btn.disabled = false; btn.textContent = 'Add';
});

document.getElementById('kw-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('kw-add-btn').click();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
