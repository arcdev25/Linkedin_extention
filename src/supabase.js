// src/supabase.js
// Lightweight Supabase client for Chrome extensions (no npm needed)

class SupabaseClient {
  constructor(url, anonKey) {
    this.url = url;
    this.anonKey = anonKey;
    this.headers = {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`
    };
  }

  async query(table, method = 'GET', body = null, params = '') {
    const url = `${this.url}/rest/v1/${table}${params}`;
    const options = {
      method,
      headers: this.headers
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Supabase error');
    }
    if (method === 'DELETE' || res.status === 204) return null;
    return res.json();
  }

  // Get profile by LinkedIn URL or profile ID
  async getProfile(linkedinId) {
    const data = await this.query(
      'profiles',
      'GET',
      null,
      `?linkedin_id=eq.${encodeURIComponent(linkedinId)}&select=*,contacts(*)`
    );
    return data?.[0] || null;
  }

  // Upsert a profile record
  async upsertProfile(profileData) {
    return this.query('profiles', 'POST', profileData, '');
  }

  // Add or update a contact entry (recruiter <-> profile link)
  async upsertContact(contactData) {
    const res = await fetch(`${this.url}/rest/v1/contacts`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(contactData)
    });
    return res.json();
  }

  // Update contact status
  async updateContactStatus(id, status, notes = '') {
    return this.query(
      `contacts?id=eq.${id}`,
      'PATCH',
      { status, notes, updated_at: new Date().toISOString() }
    );
  }

  // Get all recruiters
  async getRecruiters() {
    return this.query('recruiters', 'GET', null, '?select=*&order=name.asc');
  }

  // Add a recruiter
  async addRecruiter(name, email = '') {
    return this.query('recruiters', 'POST', { name, email });
  }
}

// Load config from chrome storage and return client
async function getSupabaseClient() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['supabase_url', 'supabase_key'], (result) => {
      if (!result.supabase_url || !result.supabase_key) {
        reject(new Error('Supabase not configured'));
        return;
      }
      resolve(new SupabaseClient(result.supabase_url, result.supabase_key));
    });
  });
}
