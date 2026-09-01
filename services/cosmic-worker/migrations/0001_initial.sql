CREATE TABLE IF NOT EXISTS aquarium (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  artist TEXT NOT NULL,
  release_title TEXT NOT NULL,
  bandcamp_url TEXT,
  aquarium_url TEXT NOT NULL UNIQUE,
  theme TEXT,
  status TEXT NOT NULL CHECK(status IN ('discovered','validated','generation_pending','generated','publication_pending','published','failed','disabled')),
  daily_batch_id TEXT,
  created_at TEXT NOT NULL,
  published_at TEXT,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_batch (
  id TEXT PRIMARY KEY,
  batch_date TEXT NOT NULL UNIQUE,
  target_count INTEGER NOT NULL DEFAULT 20,
  status TEXT NOT NULL,
  generated_count INTEGER NOT NULL DEFAULT 0,
  published_count INTEGER NOT NULL DEFAULT 0,
  email_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS analytics_event (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aquarium_id TEXT NOT NULL,
  track_id TEXT,
  batch_id TEXT,
  session_id TEXT NOT NULL,
  source_aquarium_id TEXT,
  destination_aquarium_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_delivery (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  recipient TEXT NOT NULL DEFAULT '',
  provider_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_aquarium_time ON analytics_event(aquarium_id,created_at);
CREATE INDEX IF NOT EXISTS idx_event_type_time ON analytics_event(event_type,created_at);
CREATE INDEX IF NOT EXISTS idx_aquarium_status ON aquarium(status,disabled_at);
