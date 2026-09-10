CREATE INDEX IF NOT EXISTS idx_event_type_time_session
ON analytics_event(event_type, created_at, session_id);

CREATE INDEX IF NOT EXISTS idx_event_time_session
ON analytics_event(created_at, session_id);
