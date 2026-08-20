-- Identity only. Sync tables land in M3.
-- All timestamps are ISO 8601 TEXT; no Date objects, no epoch ints.

CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  handle     TEXT NOT NULL UNIQUE,   -- generated, never user-typed (zero moderation surface)
  name       TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE identities (
  provider         TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX idx_identities_user ON identities(user_id);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,   -- sha256(token). The raw token is NEVER stored.
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent   TEXT,
  revoked_at   TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
