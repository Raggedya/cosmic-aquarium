CREATE TABLE IF NOT EXISTS artist_machine_request (
  id TEXT PRIMARY KEY,
  artist_name TEXT NOT NULL,
  bandcamp_url TEXT NOT NULL,
  email TEXT NOT NULL,
  city_location TEXT NOT NULL,
  message TEXT,
  source_url TEXT,
  ip_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_id TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_artist_machine_request_ip_time
  ON artist_machine_request(ip_hash, created_at);

CREATE INDEX IF NOT EXISTS idx_artist_machine_request_email_time
  ON artist_machine_request(email, created_at);
