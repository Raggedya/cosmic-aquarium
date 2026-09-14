CREATE TABLE IF NOT EXISTS artist_machine_inventory (
  slug TEXT PRIMARY KEY,
  artist_name TEXT NOT NULL,
  public_url TEXT NOT NULL,
  song_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artist_machine_inventory_status_name
  ON artist_machine_inventory(status, artist_name);
