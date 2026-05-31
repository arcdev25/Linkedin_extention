importScripts("config.js");
importScripts("bcrypt.min.js");

// ─── Message router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LOGIN')             { handleLogin(msg.email, msg.password).then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'LOGOUT')            { handleLogout().then(sendResponse).catch(e => sendResponse({ ok: true })); return true; }
  if (msg.type === 'GET_SESSION')       { handleGetSession().then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'OPEN_SIGNUP')       { chrome.tabs.create({ url: SIGNUP_URL }); sendResponse({ ok: true }); return true; }

  if (msg.type === 'GET_MY_RECRUITERS') { handleGetMyRecruiters(msg.ownerId).then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'GET_CONFIG')        {
    chrome.storage.local.get(['current_recruiter_id', 'current_recruiter_name', 'session'], result => {
      sendResponse({ ...result, supabase_url: SUPABASE_URL, supabase_key: SUPABASE_KEY });
    });
    return true;
  }

  if (msg.type === 'GET_PROFILE')       { handleGetProfile(msg.linkedinId).then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'UPSERT_CONTACT')    { handleUpsertContact(msg.data).then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }

  if (msg.type === 'SAVE_HIGHLIGHT')    { handleSaveHighlight(msg.data).then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'GET_HIGHLIGHTS')    { handleGetHighlights(msg.linkedinId, msg.recruiterId).then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'DELETE_HIGHLIGHT')  { handleDeleteHighlight(msg.id).then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }

  if (msg.type === 'GET_KEYWORDS')      { handleGetKeywords(msg.ownerId).then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'ADD_KEYWORD')       { handleAddKeyword(msg.ownerId, msg.word, msg.colorId).then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'DELETE_KEYWORD')    { handleDeleteKeyword(msg.id).then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'GET_KEYWORDS_FOR_PAGE') { handleGetKeywordsForPage().then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'CHECK_GOOGLE_SHEET_URL') {
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbwzzEBS8iI7zYVmEzHKrtqq53-SmSf8Qw5Cb3FSZakHdAjiS_Oi4DlTJiA5nU9x20bA3w/exec';

    fetch(`${scriptUrl}?url=${encodeURIComponent(msg.url)}`)
      .then(res => res.json())
      .then(data => {
        sendResponse({ exists: data.exists });
        console.log('data.exists------------', data.exists)
      })
      .catch(err => {
        console.error('Google Sheet check error:', err);
        sendResponse({ exists: false, error: err.message });
      });

    return true;
  }
});

// ─── Supabase client ─────────────────────────────────────────────────────────
function getClient() {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  };
  async function req(path, method = 'GET', body = null, extra = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method, headers: { ...headers, ...extra },
      body: body ? JSON.stringify(body) : null
    });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.hint || JSON.stringify(data));
    return data;
  }
  return { req };
}

function displayName(r) {
  return r.company ? `${r.name}'s ${r.company}` : r.name;
}

function cleanProfileText(value, blocked = []) {
  const text = String(value || '').trim();
  if (!text) return '';
  return blocked.some(item => item.toLowerCase() === text.toLowerCase()) ? '' : text;
}

function buildProfilePayload(data, existing = {}) {
  const name = cleanProfileText(data.name, ['Name not found']);
  const headline = cleanProfileText(data.headline, ['No headline available', 'Headline not found']);
  const profileUrl = cleanProfileText(data.profileUrl);
  const avatarUrl = cleanProfileText(data.avatarUrl);
  const existingName = cleanProfileText(existing.name, ['Name not found']);
  const existingHeadline = cleanProfileText(existing.headline, ['No headline available', 'Headline not found']);

  return {
    linkedin_id: data.linkedinId,
    name: name || existingName || '',
    headline: headline || existingHeadline || '',
    profile_url: profileUrl || existing.profile_url || '',
    avatar_url: avatarUrl || existing.avatar_url || ''
  };
}

async function upsertProfile(req, data) {
  const existingProfiles = await req(
    `profiles?linkedin_id=eq.${encodeURIComponent(data.linkedinId)}&select=id,name,headline,profile_url,avatar_url`
  );
  const existingProfile = existingProfiles?.[0] || {};

  const profileRows = await req(
    'profiles?on_conflict=linkedin_id', 'POST',
    buildProfilePayload(data, existingProfile),
    { 'Prefer': 'resolution=merge-duplicates,return=representation' }
  );

  return Array.isArray(profileRows) ? profileRows[0] : profileRows;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function handleLogin(email, password) {
  const { req } = getClient();

  const cleanEmail = email.toLowerCase().trim();

  const owners = await req(
    `owners?email=ilike.${cleanEmail}&select=*`
  );

  if (!owners || owners.length === 0) throw new Error('No account found with that email.');

  const owner = owners[0];

  // Check status BEFORE password (cheaper check first)
  if (owner.status !== 'active') throw new Error('Your account is disabled. Contact admin.');

  // bcryptjs is loaded via importScripts — dcodeIO.bcrypt is the global
  const bcrypt = dcodeIO.bcrypt;
  const passwordMatch = await bcrypt.compare(password, owner.password);
  if (!passwordMatch) throw new Error('Incorrect password.');

  // Store session (never store the hashed password)
  const session = { id: owner.id, name: owner.name, email: owner.email };
  await chrome.storage.local.set({ session });
  return { session };
}

async function handleLogout() {
  await chrome.storage.local.remove(['session', 'current_recruiter_id', 'current_recruiter_name', 'session_validated_at']);
  return { ok: true };
}

async function handleGetSession() {
  return new Promise(res => {
    chrome.storage.local.get(['session', 'session_validated_at'], result => {
      if (!result.session) { res({ session: null }); return; }

      // Re-validate at most once every 5 minutes to avoid a Supabase round-trip
      // on every popup open. If the tab is offline we trust the cached session.
      const now = Date.now();
      const lastValidated = result.session_validated_at || 0;
      if (now - lastValidated < 5 * 60 * 1000) {
        res({ session: result.session });
        return;
      }

      const { req } = getClient();
      req(`owners?id=eq.${result.session.id}&select=status`)
        .then(rows => {
          if (!rows || rows.length === 0 || rows[0].status !== 'active') {
            chrome.storage.local.remove(['session', 'current_recruiter_id', 'current_recruiter_name', 'session_validated_at']);
            res({ session: null });
          } else {
            chrome.storage.local.set({ session_validated_at: now });
            res({ session: result.session });
          }
        })
        .catch(() => res({ session: result.session })); // offline? trust cached
    });
  });
}

// ─── Recruiters ──────────────────────────────────────────────────────────────

async function handleGetMyRecruiters(ownerId) {
  const { req } = getClient();
  const recruiters = await req(
    `recruiters?owner_id=eq.${ownerId}&select=*&order=name.asc`
  );
  return {
    recruiters: (recruiters || []).map(r => ({ ...r, displayName: displayName(r) }))
  };
}

// ─── Profile + contacts ───────────────────────────────────────────────────────

async function handleGetProfile(linkedinId) {
  const { req } = getClient();
  const profiles = await req(
    `profiles?linkedin_id=eq.${encodeURIComponent(linkedinId)}&select=*,contacts(*,recruiters(id,name,company,email))`
  );
  return { profile: profiles?.[0] || null };
}

async function handleUpsertContact(data) {
  const { req } = getClient();
  const profile = await upsertProfile(req, data);

  const existing = await req(`contacts?profile_id=eq.${profile.id}&recruiter_id=eq.${data.recruiterId}`);

  if (existing && existing.length > 0) {
    await req(`contacts?id=eq.${existing[0].id}`, 'PATCH',
      { status: data.status, notes: data.notes || '', updated_at: new Date().toISOString() }
    );
    return { contact: { ...existing[0], status: data.status } };
  } else {
    const contacts = await req('contacts', 'POST',
      { profile_id: profile.id, recruiter_id: data.recruiterId, status: data.status, notes: data.notes || '', contacted_at: new Date().toISOString() },
      { 'Prefer': 'return=representation' }
    );
    return { contact: Array.isArray(contacts) ? contacts[0] : contacts };
  }
}

// ─── LinkedIn highlights ──────────────────────────────────────────────────────

async function handleSaveHighlight(data) {
  const { req } = getClient();
  const profile = await upsertProfile(req, { linkedinId: data.linkedinId });
  const rows = await req('highlights', 'POST',
    { profile_id: profile.id, recruiter_id: data.recruiterId, highlighted_text: data.text, color_id: data.colorId, note: data.note || '' },
    { 'Prefer': 'return=representation' }
  );
  return { highlight: Array.isArray(rows) ? rows[0] : rows };
}

async function handleGetHighlights(linkedinId, recruiterId) {
  const { req } = getClient();
  const profiles = await req(`profiles?linkedin_id=eq.${encodeURIComponent(linkedinId)}&select=id`);
  if (!profiles || profiles.length === 0) return { highlights: [] };
  const highlights = await req(`highlights?profile_id=eq.${profiles[0].id}&recruiter_id=eq.${recruiterId}&order=created_at.desc`);
  return { highlights: highlights || [] };
}

async function handleDeleteHighlight(id) {
  const { req } = getClient();
  await req(`highlights?id=eq.${id}`, 'DELETE');
  return { success: true };
}

// ─── Keywords (auto-highlight on any page) ────────────────────────────────────

async function handleGetKeywords(ownerId) {
  const { req } = getClient();
  const kws = await req(`keywords?owner_id=eq.${ownerId}&select=*&order=created_at.desc`);
  return { keywords: kws || [] };
}

async function handleAddKeyword(ownerId, word, colorId) {
  const { req } = getClient();
  const rows = await req('keywords', 'POST',
    { owner_id: ownerId, word: word.trim(), color_id: colorId || 'yellow' },
    { 'Prefer': 'return=representation' }
  );
  return { keyword: Array.isArray(rows) ? rows[0] : rows };
}

async function handleDeleteKeyword(id) {
  const { req } = getClient();
  await req(`keywords?id=eq.${id}`, 'DELETE');
  return { success: true };
}

// Get ALL keywords from ALL owners (for page highlighting — everyone's keywords)
async function handleGetKeywordsForPage() {
  const session = await new Promise(res => chrome.storage.local.get(['session'], r => res(r.session)));
  if (!session) return { keywords: [] };
  const { req } = getClient();
  // Only current user's keywords on pages
  const kws = await req(`keywords?owner_id=eq.${session.id}&select=*`);
  return { keywords: kws || [] };
}


