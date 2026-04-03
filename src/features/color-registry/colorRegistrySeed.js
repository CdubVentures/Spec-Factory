// WHY: Hash-gated reconcile for the global color registry.
// On bootstrap: compute SHA256 of color_registry.json, compare to stored hash.
// If changed (or first run): full reconcile — upsert all + remove stale colors.
// If unchanged: skip entirely (O(1) startup).
// On every API mutation: write-back DB state to JSON so data survives DB rebuild.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { sha256Hex } from '../../shared/contentHash.js';

// ── Default seed data — full EG CSS palette ─────────────────────────────────
// WHY: These map 1:1 to EG CSS variables (--color-{name}: #hex).
// Modifier-first naming convention: light-blue, dark-green, light-gray.
// Every base color has a light- and dark- variant for systematic coverage.
// Hex values match EG global.css where defined, Tailwind palette elsewhere.

export const EG_DEFAULT_COLORS = Object.freeze([
  // ── Base neutrals ──
  { name: 'white',       hex: '#ffffff' },
  { name: 'black',       hex: '#3A3F41' },
  { name: 'gray',        hex: '#586062' },
  { name: 'silver',      hex: '#cbd5e1' },
  { name: 'slate',       hex: '#64748b' },
  { name: 'stone',       hex: '#78716c' },
  { name: 'ivory',       hex: '#fafaf9' },
  { name: 'beige',       hex: '#f5f5f4' },

  // ── Base primaries ──
  { name: 'red',         hex: '#ef4444' },
  { name: 'blue',        hex: '#3b82f6' },
  { name: 'green',       hex: '#22c55e' },
  { name: 'yellow',      hex: '#ffd83a' },

  // ── Base secondaries ──
  { name: 'orange',      hex: '#f97316' },
  { name: 'purple',      hex: '#a855f7' },
  { name: 'pink',        hex: '#ec4899' },

  // ── Base tertiaries & extended ──
  { name: 'teal',        hex: '#14b8a6' },
  { name: 'cyan',        hex: '#06b6d4' },
  { name: 'indigo',      hex: '#6366f1' },
  { name: 'violet',      hex: '#8b5cf6' },
  { name: 'magenta',     hex: '#d946ef' },
  { name: 'gold',        hex: '#eab308' },
  { name: 'lime',        hex: '#84cc16' },
  { name: 'rose',        hex: '#f43f5e' },
  { name: 'fuchsia',     hex: '#c026d3' },
  { name: 'brown',       hex: '#8b4513' },
  { name: 'navy',        hex: '#1e3a8a' },
  { name: 'maroon',      hex: '#7f1d1d' },
  { name: 'olive',       hex: '#a16207' },
  { name: 'coral',       hex: '#fb7185' },
  { name: 'salmon',      hex: '#fda4af' },
  { name: 'lavender',    hex: '#a78bfa' },
  { name: 'turquoise',   hex: '#2dd4bf' },
  { name: 'sky',         hex: '#0ea5e9' },
  { name: 'emerald',     hex: '#10b981' },
  { name: 'amber',       hex: '#f59e0b' },

  // ── Light variants (modifier-first: --color-light-{base}) ──
  { name: 'light-gray',    hex: '#6b7280' },
  { name: 'light-slate',   hex: '#64748b' },
  { name: 'light-stone',   hex: '#78716c' },
  { name: 'light-red',     hex: '#ef4444' },
  { name: 'light-blue',    hex: '#60a5fa' },
  { name: 'light-green',   hex: '#22c55e' },
  { name: 'light-yellow',  hex: '#facc15' },
  { name: 'light-orange',  hex: '#fb923c' },
  { name: 'light-purple',  hex: '#a855f7' },
  { name: 'light-pink',    hex: '#ec4899' },
  { name: 'light-teal',    hex: '#14b8a6' },
  { name: 'light-cyan',    hex: '#06b6d4' },
  { name: 'light-indigo',  hex: '#6366f1' },
  { name: 'light-violet',  hex: '#8b5cf6' },
  { name: 'light-lime',    hex: '#84cc16' },
  { name: 'light-rose',    hex: '#f43f5e' },
  { name: 'light-fuchsia', hex: '#c026d3' },
  { name: 'light-brown',   hex: '#a0522d' },
  { name: 'light-emerald', hex: '#10b981' },
  { name: 'light-sky',     hex: '#0ea5e9' },
  { name: 'light-amber',   hex: '#f59e0b' },
  { name: 'light-olive',   hex: '#808000' },
  { name: 'light-coral',   hex: '#fda4af' },

  // ── Dark variants (modifier-first: --color-dark-{base}) ──
  { name: 'dark-gray',     hex: '#374151' },
  { name: 'dark-slate',    hex: '#334155' },
  { name: 'dark-stone',    hex: '#44403c' },
  { name: 'dark-red',      hex: '#b91c1c' },
  { name: 'dark-blue',     hex: '#1d4ed8' },
  { name: 'dark-green',    hex: '#15803d' },
  { name: 'dark-yellow',   hex: '#a16207' },
  { name: 'dark-orange',   hex: '#c2410c' },
  { name: 'dark-purple',   hex: '#7e22ce' },
  { name: 'dark-pink',     hex: '#be185d' },
  { name: 'dark-teal',     hex: '#0f766e' },
  { name: 'dark-cyan',     hex: '#0e7490' },
  { name: 'dark-indigo',   hex: '#4338ca' },
  { name: 'dark-violet',   hex: '#6d28d9' },
  { name: 'dark-lime',     hex: '#4d7c0f' },
  { name: 'dark-rose',     hex: '#be123c' },
  { name: 'dark-fuchsia',  hex: '#a21caf' },
  { name: 'dark-brown',    hex: '#451a03' },
  { name: 'dark-sky',      hex: '#0369a1' },
]);

function parseColorEntries(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data.colors !== 'object') return null;
    return Object.entries(data.colors).map(([name, entry]) => ({
      name,
      hex: entry.hex,
    }));
  } catch {
    return null;
  }
}

function buildJsonPayload(colors) {
  const colorMap = {};
  for (const c of colors) {
    colorMap[c.name] = { hex: c.hex, css_var: `--color-${c.name}` };
  }
  return {
    _doc: 'Global color registry. Managed by GUI.',
    _version: 1,
    colors: colorMap,
  };
}

export function seedColorRegistry(appDb, colorRegistryPath) {
  // ── Hash gate ──
  let raw = null;
  try { raw = colorRegistryPath ? readFileSync(colorRegistryPath, 'utf8') : null; } catch { raw = null; }
  const hash = raw ? sha256Hex(raw) : null;
  const storedHash = appDb.getSeedHash('color_registry');

  if (hash && hash === storedHash) {
    return { seeded: 0, removed: 0 };
  }

  const fromJson = raw ? parseColorEntries(raw) : null;
  const source = fromJson || EG_DEFAULT_COLORS;
  let seeded = 0;
  let removed = 0;

  // ── Full reconcile: upsert all from source ──
  const sourceNames = new Set(source.map((c) => c.name));
  for (const { name, hex } of source) {
    appDb.upsertColor({ name, hex, css_var: `--color-${name}` });
    seeded++;
  }

  // ── Remove stale colors not in source ──
  const existing = appDb.listColors();
  for (const row of existing) {
    if (!sourceNames.has(row.name)) {
      appDb.deleteColor(row.name);
      removed++;
    }
  }

  if (hash) {
    appDb.setSeedHash('color_registry', hash);
  }

  // WHY: If JSON didn't exist, write it from whatever was seeded
  if (!fromJson && colorRegistryPath) {
    const all = appDb.listColors();
    try {
      writeFileSync(colorRegistryPath, JSON.stringify(buildJsonPayload(all), null, 2));
    } catch { /* non-critical on first boot */ }
  }

  return { seeded, removed };
}

export async function writeBackColorRegistry(appDb, colorRegistryPath) {
  if (!colorRegistryPath) return;
  const all = appDb.listColors();
  const payload = buildJsonPayload(all);
  writeFileSync(colorRegistryPath, JSON.stringify(payload, null, 2));
}
