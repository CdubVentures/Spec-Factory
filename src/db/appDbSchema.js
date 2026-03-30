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
`;
