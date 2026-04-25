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
  sangle: 'primary Dynamic View mouse showcase shot: best clean angled product image for the site\'s Dynamic View slot. Prefer front/side, low side, or top-side 3/4 where the mouse shape, buttons, logo, lighting, or front/side detail is visible; exact 30-45 degree geometry is not required.',
  angle:  'secondary distinct angled mouse product shot: second-best clean angled/technical perspective for carousel depth. Prefer a viewpoint different from sangle, such as opposite side, rear/top, side/top, or alternate 3/4; avoid near-duplicates of sangle and do not require exact rear/top geometry.',
  bottom: 'Underside/belly view showing the base, sensor, mouse feet/skates, and any bottom labels or DPI switch',
  right:  'True right-side profile mouse product shot: long horizontal side silhouette with the right side wall, grip, or side buttons dominant and only minimal top surface visible; not a top-down or three-quarter shot.',
  front:  'Nose/front-facing mouse product shot: camera faces the front edge of the mouse, with the front lip, USB/cable exit, scroll wheel/button-front shape, or nose profile visible; not a top-down shell shot.',
  rear:   'Head-on rear view showing the back/rear of the mouse, the palm rest curvature from behind',
});

const MONITOR = Object.freeze({
  front:  'Head-on front view of the monitor — camera faces the display straight on, showing the full screen, bezels, and stand',
  sangle: 'primary Dynamic View monitor showcase shot: best clean angled product image for the site\'s Dynamic View slot. Prefer front/side 3/4 or low side perspective showing the screen, bezels, stand depth, and overall form; exact 30-45 degree geometry is not required.',
  angle:  'secondary distinct angled monitor product shot: second-best clean angled/technical perspective for carousel depth. Prefer a viewpoint different from sangle, such as rear/side, stand/back design, or top/side form; avoid near-duplicates of sangle.',
  rear:   'Head-on rear view showing the back panel, ports, VESA mount area, and cable management',
  left:   'Strict side profile from the left at eye level — showing the monitor thickness, stand profile, and panel depth',
  right:  'Strict side profile from the right at eye level — mirror of left view',
  top:    "Bird's-eye shot looking down at the monitor from above — showing the top edge, thickness, and stand base",
  bottom: 'Underside view showing the bottom bezel and any bottom-mounted ports, buttons, or joystick',
});

const KEYBOARD = Object.freeze({
  top:    "Bird's-eye shot looking directly down at the keyboard from above — camera directly overhead, showing the full key layout and keycap legends",
  left:   'Strict side profile from the left at eye level — showing the keyboard height profile, key travel, and wrist-rest if present',
  sangle: 'primary Dynamic View keyboard showcase shot: best clean angled product image for the site\'s Dynamic View slot. Prefer front/top or front/side 3/4 showing keycaps plus case depth; exact 30-45 degree geometry is not required.',
  angle:  'secondary distinct angled keyboard product shot: second-best clean angled/technical perspective for carousel depth. Prefer a viewpoint different from sangle, such as opposite side, rear/top, side/top, or low profile angle; avoid near-duplicates of sangle.',
  bottom: 'Underside view showing the base, rubber feet, tilt legs, and any bottom labels',
  right:  'Strict side profile from the right at eye level — mirror of left view',
  front:  'Head-on front view — camera faces the front edge showing the spacebar and front bezel',
  rear:   'Head-on rear view showing the back edge, ports, cable routing, and any rear features',
});

const GENERIC = Object.freeze({
  top:    "Bird's-eye shot looking directly down at the product from above — camera directly overhead",
  bottom: 'Underside/belly view showing the base and any bottom features',
  left:   'Strict side profile from the left at eye level — camera level, no tilt, full side silhouette',
  right:  'Strict side profile from the right at eye level — mirror of left view',
  front:  'Head-on front view — camera faces the front of the product straight on',
  rear:   'Head-on rear view showing the back panel, ports, and rear design',
  sangle: 'primary Dynamic View product showcase shot: best clean angled image for the site\'s Dynamic View slot, usually front/side or low side 3/4; exact 30-45 degree geometry is not required.',
  angle:  'secondary distinct angled product shot: second-best clean angled/technical perspective for carousel depth, different from sangle; use the next best unique angled product image.',
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
