-- Sync index. One row per (user, profile, device).
--
-- Deliberately NOT one row per typing test: row count is bounded by how
-- many devices someone owns (2-5), not by how much they type, so write
-- volume stays flat no matter how heavy a user gets. D1's free tier
-- allows 100k row writes/day and this design never approaches it.
--
-- The bytes themselves live in R2 at
--   u/{userId}/p/{profileId}/d/{deviceId}.json.gz
-- This table exists only so a client can list what's there and skip
-- downloading blobs it already has.

CREATE TABLE profile_blobs (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  name       TEXT,              -- display name, so a manifest is useful alone
  updated_at TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  checksum   TEXT,              -- sha256 of the UNCOMPRESSED body
  PRIMARY KEY (user_id, profile_id, device_id)
);
CREATE INDEX idx_blobs_user_updated ON profile_blobs(user_id, updated_at);
