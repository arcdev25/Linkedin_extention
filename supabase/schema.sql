-- ============================================================
-- LinkedIn Profile Insight — Supabase Schema v1.2
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ── Owners (authenticated users) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS owners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,         -- plain text for simplicity; hash in production
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owners_email ON owners(email);
ALTER TABLE owners DISABLE ROW LEVEL SECURITY;

-- ── Recruiters (accounts owned by an owner) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS recruiters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  company     TEXT DEFAULT '',       -- "Daria's TechHunt"
  email       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruiters_owner_id ON recruiters(owner_id);
ALTER TABLE recruiters DISABLE ROW LEVEL SECURITY;

-- ── LinkedIn profiles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linkedin_id TEXT UNIQUE NOT NULL,
  name        TEXT DEFAULT '',
  headline    TEXT DEFAULT '',
  profile_url TEXT DEFAULT '',
  avatar_url  TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_linkedin_id ON profiles(linkedin_id);
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- ── Contacts (recruiter ↔ profile) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recruiter_id  UUID NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','chatting','interested','rejected','hired','failed','ghosted')),
  notes         TEXT DEFAULT '',
  contacted_at  TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (profile_id, recruiter_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_profile_id   ON contacts(profile_id);
CREATE INDEX IF NOT EXISTS idx_contacts_recruiter_id ON contacts(recruiter_id);
ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;

-- ── Highlights (text selections on LinkedIn) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS highlights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recruiter_id     UUID NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  highlighted_text TEXT NOT NULL,
  color_id         TEXT NOT NULL DEFAULT 'yellow',
  note             TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_highlights_profile_id ON highlights(profile_id);
ALTER TABLE highlights DISABLE ROW LEVEL SECURITY;

-- ── Keywords (auto-highlight on any webpage) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS keywords (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  word        TEXT NOT NULL,
  color_id    TEXT NOT NULL DEFAULT 'yellow',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (owner_id, word)            -- no duplicate keywords per owner
);

CREATE INDEX IF NOT EXISTS idx_keywords_owner_id ON keywords(owner_id);
ALTER TABLE keywords DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- MIGRATION: if you already have tables from an older schema,
-- run only what's missing:
--
-- CREATE TABLE IF NOT EXISTS owners (...);   ← new
-- ALTER TABLE recruiters DROP COLUMN IF EXISTS owner_name;
-- ALTER TABLE recruiters ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES owners(id);
-- CREATE TABLE IF NOT EXISTS keywords (...); ← new
-- ============================================================
