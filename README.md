# LinkedIn Profile Checker — Chrome Extension

Track recruiter outreach across your team directly on LinkedIn profiles.

## Features
- 🪟 **Movable & Minimizable Panel**: Drag the profile checker panel anywhere on LinkedIn profiles
- 🔲 **Overlay panel** appears automatically on any LinkedIn `/in/` profile page
- 👥 **Multi-recruiter**: see who else contacted a profile, when, and with what status
- 📊 **Statuses**: Pending · Chatting · Interested · Rejected · Hired · Failed · Ghosted
- 📝 **Notes** per recruiter per profile
- 🎨 **Keyword Highlighting**: Auto-highlight custom keywords across all websites
- ☁️ **Supabase** backend — real-time shared DB for your whole team

---

## Using the Profile Checker Panel

When you visit a LinkedIn profile page, the **Profile Checker** panel automatically appears:

### Panel Controls
- **Drag**: Click and hold the header bar (dark blue area) to move the panel anywhere on the page
- **Minimize**: Click the "−" button to collapse the panel to just the header
- **Maximize**: When minimized, click the "+" button to expand it again
- **Close**: Click the "×" button to close the panel

The panel stays in position as you scroll and can be moved out of the way if it's blocking content.

---

## Setup

### 1. Supabase (5 minutes)

1. Go to [supabase.com](https://supabase.com) → New Project
2. Open **SQL Editor** → paste contents of `supabase/schema.sql` → Run
3. Copy your **Project URL** and **anon public key** from Settings → API

### 2. Load the extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this folder (`linkedin-checker/`)

### 3. Configure

1. Click the extension icon (◈) in your toolbar
2. Go to **⚙️ Settings** tab
3. Paste your Supabase URL and anon key → **Save & Test**
4. Go to **👤 Recruiter** tab → Add your name → click it to select as active account

### 4. Use it

1. Go to any LinkedIn profile (`linkedin.com/in/...`)
2. The **◈ Profile Checker** panel appears in the top-right corner
3. Set a status, add notes, click **Add Contact** or **Update**
4. See other recruiters' activity in the lower section

---

## Statuses

| Status | Meaning |
|--------|---------|
| ⏳ Pending | Identified but not yet contacted |
| 💬 Chatting | In active conversation |
| ✅ Interested | Candidate is interested |
| ❌ Rejected | Candidate declined |
| 🎉 Hired | Successfully placed |
| 💀 Failed | Process failed / fell through |
| 👻 Ghosted | No response after contact |

---

## Database Schema

```
recruiters     — your team (id, name, email)
profiles       — LinkedIn profiles (id, linkedin_id, name, headline, ...)
contacts       — recruiter ↔ profile link (profile_id, recruiter_id, status, notes, timestamps)
```

---

## Security Notes

- The anon key is stored in `chrome.storage.local` (device only, not synced)
- For production, consider enabling **Row Level Security** in Supabase (see schema.sql comments)
- Each recruiter picks their own account client-side; for enforced auth, you'd need a backend proxy
