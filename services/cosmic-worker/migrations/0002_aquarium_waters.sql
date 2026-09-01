CREATE TABLE IF NOT EXISTS aquarium_water (
  aquarium_id TEXT NOT NULL REFERENCES aquarium(id) ON DELETE CASCADE,
  water TEXT NOT NULL CHECK (water IN ('heavy','dreamy','electronic','quiet','loud','dark','strange')),
  assigned_by TEXT NOT NULL DEFAULT 'automatic',
  confidence REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (aquarium_id, water)
);

CREATE INDEX IF NOT EXISTS aquarium_water_by_water ON aquarium_water(water, aquarium_id);
