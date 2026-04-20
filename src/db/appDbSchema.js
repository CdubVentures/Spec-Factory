// WHY: Single DDL string for the global app.sqlite database.
// Holds cross-category state: brands, settings, studio maps.
// Mirrors specDbSchema.js pattern — all CREATE TABLE IF NOT EXISTS.

export const APP_DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS brands (
  identifier     TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  slug           TEXT NOT NULL,
  aliases        TEXT NOT NULL DEFAULT '[]',
  website        TEXT NOT NULL DEFAULT '',
  added_by       TEXT NOT NULL DEFAULT 'seed',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_slug ON brands(slug);

CREATE TABLE IF NOT EXISTS brand_categories (
  identifier TEXT NOT NULL REFERENCES brands(identifier) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  PRIMARY KEY (identifier, category)
);
CREATE INDEX IF NOT EXISTS idx_bc_category ON brand_categories(category);

CREATE TABLE IF NOT EXISTS brand_renames (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier  TEXT NOT NULL REFERENCES brands(identifier),
  old_slug    TEXT NOT NULL,
  new_slug    TEXT NOT NULL,
  old_name    TEXT NOT NULL,
  new_name    TEXT NOT NULL,
  renamed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_br_identifier ON brand_renames(identifier);

CREATE TABLE IF NOT EXISTS settings (
  section    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT,
  type       TEXT NOT NULL DEFAULT 'string',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (section, key)
);

CREATE TABLE IF NOT EXISTS studio_maps (
  category   TEXT NOT NULL,
  map_json   TEXT NOT NULL DEFAULT '{}',
  file_path  TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (category)
);

CREATE TABLE IF NOT EXISTS color_registry (
  name       TEXT PRIMARY KEY,
  hex        TEXT NOT NULL,
  css_var    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS unit_registry (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical        TEXT NOT NULL UNIQUE,
  label            TEXT NOT NULL DEFAULT '',
  synonyms_json    TEXT NOT NULL DEFAULT '[]',
  conversions_json TEXT NOT NULL DEFAULT '[]',
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS billing_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  month TEXT NOT NULL,
  day TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'unknown',
  model TEXT NOT NULL DEFAULT 'unknown',
  category TEXT DEFAULT '',
  product_id TEXT DEFAULT '',
  run_id TEXT DEFAULT '',
  round INTEGER DEFAULT 0,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cached_prompt_tokens INTEGER DEFAULT 0,
  sent_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  reason TEXT DEFAULT '',
  host TEXT DEFAULT '',
  url_count INTEGER DEFAULT 0,
  evidence_chars INTEGER DEFAULT 0,
  estimated_usage INTEGER DEFAULT 0,
  meta TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_be_month ON billing_entries(month);
CREATE INDEX IF NOT EXISTS idx_be_product ON billing_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_be_day ON billing_entries(day);
`;
