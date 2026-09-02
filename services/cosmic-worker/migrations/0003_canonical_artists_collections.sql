PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS artist (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  bandcamp_artist_url TEXT NOT NULL UNIQUE,
  primary_aquarium_id TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (primary_aquarium_id) REFERENCES aquarium(id) ON DELETE SET NULL
);

ALTER TABLE aquarium ADD COLUMN artist_id TEXT REFERENCES artist(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS collection (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('label','location','genre','curated','daily','era','theme')),
  description TEXT,
  theme TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','disabled')),
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_artist (
  collection_id TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  verification_score REAL,
  source TEXT,
  evidence TEXT,
  display_enabled INTEGER NOT NULL DEFAULT 0 CHECK (display_enabled IN (0,1)),
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, artist_id),
  FOREIGN KEY (collection_id) REFERENCES collection(id) ON DELETE CASCADE,
  FOREIGN KEY (artist_id) REFERENCES artist(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artist_release (
  artist_id TEXT NOT NULL,
  aquarium_id TEXT NOT NULL UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  PRIMARY KEY (artist_id, aquarium_id),
  FOREIGN KEY (artist_id) REFERENCES artist(id) ON DELETE CASCADE,
  FOREIGN KEY (aquarium_id) REFERENCES aquarium(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS location_research_run (
  id TEXT PRIMARY KEY,
  collection_id TEXT,
  location_query TEXT NOT NULL,
  sources TEXT,
  candidates_found INTEGER NOT NULL DEFAULT 0,
  verified_count INTEGER NOT NULL DEFAULT 0,
  probable_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  duration_seconds REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES collection(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_aquarium_artist ON aquarium(artist_id);
CREATE INDEX IF NOT EXISTS idx_collection_type_status ON collection(type,status);
CREATE INDEX IF NOT EXISTS idx_collection_artist_visible ON collection_artist(collection_id,display_enabled,verification_status);
CREATE INDEX IF NOT EXISTS idx_artist_release_primary ON artist_release(artist_id,is_primary);
