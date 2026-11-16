CREATE TABLE IF NOT EXISTS feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT,
  finished_at TEXT,
  status TEXT,
  items_collected INTEGER,
  items_sent INTEGER,
  skipped TEXT
);
CREATE TABLE IF NOT EXISTS seen_items (
  item_key TEXT PRIMARY KEY,
  feed_id INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seen_first ON seen_items(first_seen_at);
INSERT OR IGNORE INTO settings(key, value) VALUES
  ('send_time', '08:00'),
  ('recipients', '[]'),
  ('watermark', '');
