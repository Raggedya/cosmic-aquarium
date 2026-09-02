PRAGMA foreign_keys = ON;

-- Non-destructive Master Library expansion. Existing Artist and Aquarium IDs remain intact.
ALTER TABLE artist ADD COLUMN display_name TEXT;
ALTER TABLE artist ADD COLUMN slug TEXT;
ALTER TABLE artist ADD COLUMN primary_location_id TEXT;
ALTER TABLE artist ADD COLUMN country TEXT;
ALTER TABLE artist ADD COLUMN metadata TEXT;
ALTER TABLE artist ADD COLUMN archived_at TEXT;

ALTER TABLE aquarium ADD COLUMN type TEXT NOT NULL DEFAULT 'artist';
ALTER TABLE aquarium ADD COLUMN configuration TEXT;
ALTER TABLE aquarium ADD COLUMN updated_at TEXT;

ALTER TABLE collection_artist ADD COLUMN confidence REAL;
ALTER TABLE collection_artist ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE collection_artist ADD COLUMN administrator_override INTEGER NOT NULL DEFAULT 0 CHECK (administrator_override IN (0,1));
ALTER TABLE collection_artist ADD COLUMN updated_at TEXT;

CREATE TABLE IF NOT EXISTS location (
  id TEXT PRIMARY KEY,
  city TEXT,
  region TEXT,
  country TEXT NOT NULL,
  display_name TEXT NOT NULL,
  canonical_location TEXT NOT NULL UNIQUE,
  latitude REAL,
  longitude REAL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_filter (
  collection_id TEXT PRIMARY KEY,
  location_id TEXT,
  style_water TEXT,
  label_collection_id TEXT,
  metadata TEXT,
  FOREIGN KEY (collection_id) REFERENCES collection(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES location(id) ON DELETE SET NULL,
  FOREIGN KEY (label_collection_id) REFERENCES collection(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS artist_alias (
  artist_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (artist_id, normalized_alias),
  FOREIGN KEY (artist_id) REFERENCES artist(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS metadata_evidence (
  id TEXT PRIMARY KEY,
  artist_id TEXT,
  collection_id TEXT,
  field_name TEXT NOT NULL,
  value TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  confidence REAL,
  administrator_override INTEGER NOT NULL DEFAULT 0 CHECK (administrator_override IN (0,1)),
  observed_at TEXT NOT NULL,
  FOREIGN KEY (artist_id) REFERENCES artist(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES collection(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_job (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','researching','verifying','deduplicating','classifying','building','complete','failed')),
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  input TEXT,
  result TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS bandcamp_link_health (
  artist_id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','redirected','not_found','temporary_failure','unchecked')),
  http_status INTEGER,
  resolved_url TEXT,
  checked_at TEXT,
  next_check_at TEXT,
  failure_reason TEXT,
  FOREIGN KEY (artist_id) REFERENCES artist(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artist_canonical_name ON artist(canonical_name);
CREATE INDEX IF NOT EXISTS idx_artist_primary_location ON artist(primary_location_id,status);
CREATE INDEX IF NOT EXISTS idx_collection_artist_status ON collection_artist(collection_id,membership_status,display_enabled);
CREATE INDEX IF NOT EXISTS idx_collection_filter_location_style ON collection_filter(location_id,style_water);
CREATE INDEX IF NOT EXISTS idx_admin_job_status_created ON admin_job(status,created_at);
CREATE INDEX IF NOT EXISTS idx_metadata_evidence_artist_field ON metadata_evidence(artist_id,field_name,administrator_override);
