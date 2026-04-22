/**
 * keyFinder quick-query presets — registry + pure derivations.
 *
 * Presets are derived state: a preset is "active" iff the current filter
 * state exactly matches its pinned axes. Search is orthogonal (does not
 * participate in matching). There is no preset persistence — presets are
 * recomputed every render from the live KeyFilterState.
 *
 * Adding / removing a preset is a one-file change per the O(1) Feature
 * Scaling rule. Axis-match semantics live in matchingPreset; applyPreset
 * is a trivial merge.
 */

import { DEFAULT_FILTERS, type KeyFilterState } from '../types.ts';

export type PresetTone =
  | 'all'
  | 'unresolved'
  | 'mandatory'
  | 'running'
  | 'below'
  | 'resolved';

export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly tone: PresetTone;
  /** Axes this preset pins. Omitted axes must equal DEFAULT_FILTERS to match. */
  readonly filters: Readonly<Partial<Omit<KeyFilterState, 'search'>>>;
}

export const KEY_FINDER_PRESETS: readonly Preset[] = Object.freeze([
  { id: 'all',                  label: 'All',                  tone: 'all',        filters: Object.freeze({}) },
  { id: 'unresolved',           label: 'Unresolved',           tone: 'unresolved', filters: Object.freeze({ status: 'unresolved' }) },
  { id: 'mandatory_unresolved', label: 'Mandatory unresolved', tone: 'mandatory',  filters: Object.freeze({ required: 'mandatory', status: 'unresolved' }) },
  { id: 'running',              label: 'Running',              tone: 'running',    filters: Object.freeze({ status: 'running' }) },
  { id: 'below_threshold',      label: 'Below threshold',      tone: 'below',      filters: Object.freeze({ status: 'below_threshold' }) },
  { id: 'resolved',             label: 'Resolved',             tone: 'resolved',   filters: Object.freeze({ status: 'resolved' }) },
]);

const PRESETS_BY_ID: ReadonlyMap<string, Preset> = new Map(
  KEY_FINDER_PRESETS.map((p) => [p.id, p]),
);

const AXIS_KEYS = ['difficulty', 'availability', 'required', 'status'] as const;
type AxisKey = typeof AXIS_KEYS[number];

/**
 * Return the preset id whose pinned axes exactly match the current filter
 * state (search ignored). Axes not pinned by the preset must equal the
 * default empty-string value. Returns null when no preset matches.
 */
export function matchingPreset(filters: KeyFilterState): string | null {
  for (const preset of KEY_FINDER_PRESETS) {
    let matches = true;
    for (const axis of AXIS_KEYS) {
      const expected = preset.filters[axis] ?? '';
      if (filters[axis] !== expected) {
        matches = false;
        break;
      }
    }
    if (matches) return preset.id;
  }
  return null;
}

/**
 * Expand a preset id into a full KeyFilterState. Preserves the caller's
 * current search string (search is orthogonal to presets). Throws if the
 * preset id is unknown — callers should only pass ids from KEY_FINDER_PRESETS.
 */
export function applyPreset(presetId: string, currentSearch: string): KeyFilterState {
  const preset = PRESETS_BY_ID.get(presetId);
  if (!preset) throw new Error(`unknown preset: ${presetId}`);
  return {
    search: currentSearch,
    difficulty: preset.filters.difficulty ?? '',
    availability: preset.filters.availability ?? '',
    required: preset.filters.required ?? '',
    status: preset.filters.status ?? '',
  };
}
