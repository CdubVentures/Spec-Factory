/**
 * Per-view per-role prompt defaults.
 *
 * Each view contributes different text to the discovery prompt based on
 * its current role in the call:
 *
 *   - loop      : text used when this view is the sole loop focus
 *   - priority  : text used when this view appears in the PRIORITY section
 *                 of a single-run prompt (one of several views requested)
 *   - additional: text used when this view appears in the ADDITIONAL section
 *                 as a secondary hint (catch-any)
 *
 * Defaults for all three roles are seeded from the original per-category
 * view descriptions so the composed prompt is byte-identical to the
 * pre-refactor output until a user edits a specific role.
 *
 * Fallback order at call time:
 *   1. Per-view per-role DB override from finderStore (e.g., loopViewPrompt_top)
 *   2. Per-category per-view per-role default (VIEW_PROMPT_DEFAULTS[cat][view][role])
 *   3. Generic fallback (GENERIC_VIEW_PROMPT_DEFAULTS[view][role])
 *   4. Empty string (surfaced as an empty entry; the builder skips it)
 */

import { CANONICAL_VIEW_KEYS } from './productImageLlmAdapter.js';

export const VIEW_PROMPT_ROLES = Object.freeze(['loop', 'priority', 'additional']);

const MOUSE = Object.freeze({
  top:    "Bird's-eye shot looking directly down at the mouse from above — camera directly overhead, showing full shape outline and button layout",
  left:   'Strict side profile from the left at eye level — camera level with the mouse, no tilt, showing the full side silhouette, button profile, and scroll wheel',
  angle:  'Rear/top three-quarter mouse product shot: top shell plus one side with rear or palm-rest curvature dominant; not a pure top-down shot and not a front/nose-dominant sangle shot.',
  bottom: 'Underside/belly view showing the base, sensor, mouse feet/skates, and any bottom labels or DPI switch',
  right:  'True right-side profile mouse product shot: long horizontal side silhouette with the right side wall, grip, or side buttons dominant and only minimal top surface visible; not a top-down or three-quarter shot.',
  front:  'Nose/front-facing mouse product shot: camera faces the front edge of the mouse, with the front lip, USB/cable exit, scroll wheel/button-front shape, or nose profile visible; not a top-down shell shot.',
  rear:   'Head-on rear view showing the back/rear of the mouse, the palm rest curvature from behind',
  sangle: 'Front-side three-quarter mouse product shot: side geometry plus the front/nose/USB/cable/front-lip area are visible; low wide showcase angles are acceptable when the front-side geometry is clear.',
});

const MONITOR = Object.freeze({
  front:  'Head-on front view of the monitor — camera faces the display straight on, showing the full screen, bezels, and stand',
  angle:  'Rear/top 3/4 angle showing the monitor from behind and slightly above — showing the back panel design and stand',
  rear:   'Head-on rear view showing the back panel, ports, VESA mount area, and cable management',
  left:   'Strict side profile from the left at eye level — showing the monitor thickness, stand profile, and panel depth',
  right:  'Strict side profile from the right at eye level — mirror of left view',
  top:    "Bird's-eye shot looking down at the monitor from above — showing the top edge, thickness, and stand base",
  bottom: 'Underside view showing the bottom bezel and any bottom-mounted ports, buttons, or joystick',
  sangle: 'Front/side 3/4 angle — showing the monitor from the front-left at roughly 30–45 degrees',
});

const KEYBOARD = Object.freeze({
  top:    "Bird's-eye shot looking directly down at the keyboard from above — camera directly overhead, showing the full key layout and keycap legends",
  left:   'Strict side profile from the left at eye level — showing the keyboard height profile, key travel, and wrist-rest if present',
  angle:  'Front/top 3/4 angle showing the keyboard from above and slightly in front at roughly 30–45 degrees',
  bottom: 'Underside view showing the base, rubber feet, tilt legs, and any bottom labels',
  right:  'Strict side profile from the right at eye level — mirror of left view',
  front:  'Head-on front view — camera faces the front edge showing the spacebar and front bezel',
  rear:   'Head-on rear view showing the back edge, ports, cable routing, and any rear features',
  sangle: 'Front/side 3/4 angle — showing the keyboard from the front-left at roughly 30–45 degrees',
});

const GENERIC = Object.freeze({
  top:    "Bird's-eye shot looking directly down at the product from above — camera directly overhead",
  bottom: 'Underside/belly view showing the base and any bottom features',
  left:   'Strict side profile from the left at eye level — camera level, no tilt, full side silhouette',
  right:  'Strict side profile from the right at eye level — mirror of left view',
  front:  'Head-on front view — camera faces the front of the product straight on',
  rear:   'Head-on rear view showing the back panel, ports, and rear design',
  sangle: 'Front/side 3/4 angle — product shot from the front-left at roughly 30–45 degrees, slightly above',
  angle:  'Rear/top 3/4 angle — showing the product from above and behind at roughly 30–45 degrees',
});

function expandRoles(descMap) {
  const out = {};
  for (const key of Object.keys(descMap)) {
    const text = descMap[key];
    out[key] = Object.freeze({ loop: text, priority: text, additional: text });
  }
  return Object.freeze(out);
}

export const VIEW_PROMPT_DEFAULTS = Object.freeze({
  mouse: expandRoles(MOUSE),
  monitor: expandRoles(MONITOR),
  keyboard: expandRoles(KEYBOARD),
});

export const GENERIC_VIEW_PROMPT_DEFAULTS = expandRoles(GENERIC);

/**
 * Build the settings-store key for a per-view per-role prompt override.
 * Matches the registry entry keys (e.g., "loopViewPrompt_top").
 */
export function viewPromptSettingKey(role, view) {
  if (!VIEW_PROMPT_ROLES.includes(role)) return '';
  if (!CANONICAL_VIEW_KEYS.includes(view)) return '';
  return `${role}ViewPrompt_${view}`;
}

/**
 * Resolve a per-view per-role prompt text.
 *
 * @param {object} opts
 * @param {'loop'|'priority'|'additional'} opts.role
 * @param {string} opts.category
 * @param {string} opts.view
 * @param {string} [opts.dbOverride] — raw string from finderStore.getSetting
 * @returns {string}
 */
export function resolveViewPrompt({ role, category, view, dbOverride = '' } = {}) {
  if (!VIEW_PROMPT_ROLES.includes(role)) return '';
  if (!CANONICAL_VIEW_KEYS.includes(view)) return '';

  if (typeof dbOverride === 'string' && dbOverride.trim()) {
    return dbOverride;
  }

  const catMap = VIEW_PROMPT_DEFAULTS[category];
  const catRole = catMap?.[view]?.[role];
  if (catRole) return catRole;

  return GENERIC_VIEW_PROMPT_DEFAULTS[view]?.[role] || '';
}
