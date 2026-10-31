-- Additive authentication state for Vercel. No application data is copied or reset.
CREATE TABLE IF NOT EXISTS web_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  KEY ix_web_sessions_expiry (expires_at),
  KEY ix_web_sessions_user (user_id),
  CONSTRAINT fk_web_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_attempts (
  bucket_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  KEY ix_auth_attempts_expiry (expires_at)
) ENGINE=InnoDB;
