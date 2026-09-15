CREATE TABLE IF NOT EXISTS artist_machine_delivery_batch (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  provider_id TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS artist_machine_delivery_batch_item (
  batch_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  artist_slug TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  public_url TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (batch_id, artist_slug),
  FOREIGN KEY (batch_id) REFERENCES artist_machine_delivery_batch(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artist_machine_delivery_batch_email_time
  ON artist_machine_delivery_batch(email, created_at);

CREATE INDEX IF NOT EXISTS idx_artist_machine_delivery_batch_ip_time
  ON artist_machine_delivery_batch(ip_hash, created_at);

CREATE INDEX IF NOT EXISTS idx_artist_machine_delivery_batch_item_position
  ON artist_machine_delivery_batch_item(batch_id, position);
