-- Vibes Platform — PostgreSQL Schema
-- Run: psql -U vibes_user -d vibes -f schema.sql

-- ── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      CITEXT UNIQUE NOT NULL CHECK (username ~ '^[a-zA-Z0-9_]{2,24}$'),
  email         CITEXT UNIQUE,
  password_hash TEXT NOT NULL,
  tier          TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'merch')),
  notify_milestones BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Incremental migration for existing installs
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_milestones BOOLEAN DEFAULT true;

-- ── Profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT,
  bio           TEXT,
  avatar_url    TEXT,
  youtube_url   TEXT,
  aura_from     TEXT DEFAULT '#FF8C42',
  aura_to       TEXT DEFAULT '#E67E22',
  aura_name     TEXT DEFAULT 'Sunset Fire',
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Links ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS links (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  icon       TEXT DEFAULT '🔗',
  position   INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Photos ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photos (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  filename   TEXT NOT NULL,
  position   INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Page views (lightweight analytics) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS page_views (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at  TIMESTAMPTZ DEFAULT NOW(),
  referrer   TEXT,
  country    TEXT
);

-- ── Link clicks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS link_clicks (
  id         BIGSERIAL PRIMARY KEY,
  link_id    UUID NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Presave campaigns (one active campaign per user) ─────────────────────────
CREATE TABLE IF NOT EXISTS presave_campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT,
  artist_name     TEXT,
  cover_url       TEXT,
  release_date    TIMESTAMPTZ,
  spotify_id      TEXT,                 -- Spotify track or album ID
  spotify_type    TEXT DEFAULT 'track' CHECK (spotify_type IN ('track','album')),
  apple_music_url TEXT,
  active          BOOLEAN DEFAULT false,
  last_milestone  INT DEFAULT 0,        -- highest presave-count milestone already notified
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Incremental migration for existing installs
ALTER TABLE presave_campaigns ADD COLUMN IF NOT EXISTS last_milestone INT DEFAULT 0;

-- ── Presave actions (one row per fan presave, for counts + de-dup) ───────────
CREATE TABLE IF NOT EXISTS presave_actions (
  id          BIGSERIAL PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES presave_campaigns(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('spotify','apple')),
  external_id TEXT,                     -- Spotify user id, used to de-duplicate
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id);
CREATE INDEX IF NOT EXISTS idx_page_views_user_id ON page_views(user_id);
CREATE INDEX IF NOT EXISTS idx_page_views_viewed_at ON page_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_presave_actions_campaign ON presave_actions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_presave_actions_external ON presave_actions(campaign_id, platform, external_id);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_presave_campaigns_updated BEFORE UPDATE ON presave_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

