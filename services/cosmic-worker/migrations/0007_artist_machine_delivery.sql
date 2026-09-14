CREATE TABLE IF NOT EXISTS artist_machine_delivery (
  id TEXT PRIMARY KEY,
  artist_slug TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  email TEXT NOT NULL,
  public_url TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  publication_id TEXT,
  status TEXT NOT NULL,
  provider_id TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_artist_machine_delivery_email_time
  ON artist_machine_delivery(email, created_at);

CREATE INDEX IF NOT EXISTS idx_artist_machine_delivery_ip_time
  ON artist_machine_delivery(ip_hash, created_at);
