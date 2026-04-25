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
// Hex values use standard named-color equivalents where available, with
// intuitive light/dark variants for registry-only hyphenated names.

export const EG_DEFAULT_COLORS = Object.freeze([
  // ── Base neutrals ──
  { name: 'white',       hex: '#ffffff' },
  { name: 'black',       hex: '#000000' },
  { name: 'gray',        hex: '#808080' },
  { name: 'silver',      hex: '#c0c0c0' },
  { name: 'slate',       hex: '#708090' },
  { name: 'stone',       hex: '#928e85' },
  { name: 'ivory',       hex: '#fffff0' },
  { name: 'beige',       hex: '#f5f5dc' },
  { name: 'charcoal',    hex: '#36454f' },
  { name: 'graphite',    hex: '#383838' },
  { name: 'gunmetal',    hex: '#2a3439' },
  { name: 'titanium',    hex: '#878681' },
  { name: 'platinum',    hex: '#e5e4e2' },
  { name: 'cream',       hex: '#fffdd0' },
  { name: 'off-white',   hex: '#faf9f6' },
  { name: 'transparent', hex: '#f8fafc' },
  { name: 'clear',       hex: '#f8fafc' },
  { name: 'smoke',       hex: '#848884' },
  { name: 'frosted',     hex: '#eaf6f6' },

  // ── Base primaries ──
  { name: 'red',         hex: '#ff0000' },
  { name: 'blue',        hex: '#0000ff' },
  { name: 'green',       hex: '#008000' },
  { name: 'yellow',      hex: '#ffff00' },
  { name: 'electric-blue', hex: '#7df9ff' },
  { name: 'neon-green',  hex: '#39ff14' },
  { name: 'crimson',     hex: '#dc143c' },

  // ── Base secondaries ──
  { name: 'orange',      hex: '#ffa500' },
  { name: 'purple',      hex: '#800080' },
  { name: 'pink',        hex: '#ffc0cb' },
  { name: 'burgundy',    hex: '#800020' },

  // ── Base tertiaries & extended ──
  { name: 'teal',        hex: '#008080' },
  { name: 'cyan',        hex: '#00ffff' },
  { name: 'indigo',      hex: '#4b0082' },
  { name: 'violet',      hex: '#ee82ee' },
  { name: 'magenta',     hex: '#ff00ff' },
  { name: 'gold',        hex: '#ffd700' },
  { name: 'lime',        hex: '#00ff00' },
  { name: 'rose',        hex: '#ff007f' },
  { name: 'fuchsia',     hex: '#ff00ff' },
  { name: 'brown',       hex: '#a52a2a' },
  { name: 'bronze',      hex: '#cd7f32' },
  { name: 'copper',      hex: '#b87333' },
  { name: 'champagne',   hex: '#f7e7ce' },
  { name: 'navy',        hex: '#000080' },
  { name: 'maroon',      hex: '#800000' },
  { name: 'olive',       hex: '#808000' },
  { name: 'coral',       hex: '#ff7f50' },
  { name: 'salmon',      hex: '#fa8072' },
  { name: 'lavender',    hex: '#e6e6fa' },
  { name: 'turquoise',   hex: '#40e0d0' },
  { name: 'sky',         hex: '#87ceeb' },
  { name: 'emerald',     hex: '#50c878' },
  { name: 'amber',       hex: '#ffbf00' },
  { name: 'mint',        hex: '#98ff98' },

  // ── Light variants (modifier-first: --color-light-{base}) ──
  { name: 'light-gray',    hex: '#d3d3d3' },
  { name: 'light-slate',   hex: '#778899' },
  { name: 'light-stone',   hex: '#d8d0c4' },
  { name: 'light-red',     hex: '#ff7f7f' },
  { name: 'light-blue',    hex: '#add8e6' },
  { name: 'light-green',   hex: '#90ee90' },
  { name: 'light-yellow',  hex: '#ffffe0' },
  { name: 'light-orange',  hex: '#ffd580' },
  { name: 'light-purple',  hex: '#cbc3e3' },
  { name: 'light-pink',    hex: '#ffb6c1' },
  { name: 'light-teal',    hex: '#66b2b2' },
  { name: 'light-cyan',    hex: '#e0ffff' },
  { name: 'light-indigo',  hex: '#6f5fcf' },
  { name: 'light-violet',  hex: '#cf9fff' },
  { name: 'light-lime',    hex: '#ccff00' },
  { name: 'light-rose',    hex: '#ffb7c5' },
  { name: 'light-fuchsia', hex: '#ff77ff' },
  { name: 'light-brown',   hex: '#c4a484' },
  { name: 'light-emerald', hex: '#a8e6cf' },
  { name: 'light-sky',     hex: '#87cefa' },
  { name: 'light-amber',   hex: '#ffcf40' },
  { name: 'light-olive',   hex: '#b5b35c' },
  { name: 'light-coral',   hex: '#f08080' },

  // ── Dark variants (modifier-first: --color-dark-{base}) ──
  { name: 'dark-gray',     hex: '#404040' },
  { name: 'dark-slate',    hex: '#2f4f4f' },
  { name: 'dark-stone',    hex: '#5c5855' },
  { name: 'dark-red',      hex: '#8b0000' },
  { name: 'dark-blue',     hex: '#00008b' },
  { name: 'dark-green',    hex: '#006400' },
  { name: 'dark-yellow',   hex: '#cccc00' },
  { name: 'dark-orange',   hex: '#ff8c00' },
  { name: 'dark-purple',   hex: '#301934' },
  { name: 'dark-pink',     hex: '#e75480' },
  { name: 'dark-teal',     hex: '#005757' },
  { name: 'dark-cyan',     hex: '#008b8b' },
  { name: 'dark-indigo',   hex: '#2e0854' },
  { name: 'dark-violet',   hex: '#9400d3' },
  { name: 'dark-lime',     hex: '#32cd32' },
  { name: 'dark-rose',     hex: '#c21e56' },
  { name: 'dark-fuchsia',  hex: '#8b008b' },
  { name: 'dark-brown',    hex: '#5c4033' },
  { name: 'dark-sky',      hex: '#4a90b8' },
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
