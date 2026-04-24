import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKeyPromptPreviewState,
  resolveKeyPromptPassengerSnapshot,
} from '../keyFinderPromptPreviewSnapshot.ts';
import type { KeyEntry, KeyGroup } from '../../types.ts';

function key(fieldKey: string, passengers: readonly string[]): KeyEntry {
  return {
    field_key: fieldKey,
    label: fieldKey,
    difficulty: 'easy',
    availability: 'always',
    required_level: 'non_mandatory',
    variant_dependent: false,
    budget: 1,
    raw_budget: 1,
    in_flight_as_primary: false,
    in_flight_as_passenger_count: 0,
    bundle_pool: 6,
    bundle_total_cost: passengers.length,
    bundle_preview: passengers.map((passenger) => ({ field_key: passenger, cost: 1 })),
    last_run_number: null,
    last_value: null,
    last_confidence: null,
    last_status: null,
    last_model: null,
    last_fallback_used: null,
    last_access_mode: null,
    last_effort_level: null,
    last_thinking: null,
    last_web_search: null,
    candidate_count: 0,
    published: false,
    concrete_evidence: false,
    top_confidence: null,
    top_evidence_count: null,
    run_count: 0,
    running: false,
    opMode: null,
    opStatus: null,
    ridingPrimaries: [],
    activePassengers: [],
  };
}

function group(keys: readonly KeyEntry[]): KeyGroup {
  return {
    name: 'design',
    keys,
    stats: { total: keys.length, resolved: 0, unresolved: keys.length, running: 0 },
  };
}

describe('KeyFinder prompt preview passenger snapshot', () => {
  it('captures the visible Next bundle passengers when Prompt is clicked', () => {
    const state = createKeyPromptPreviewState([group([key('design', ['connection', 'connectivity'])])], 'design');

    assert.deepEqual(state, {
      fieldKey: 'design',
      passengerFieldKeysSnapshot: ['connection', 'connectivity'],
    });
  });

  it('uses the latest visible row snapshot while the modal remains open', () => {
    const state = createKeyPromptPreviewState([group([key('design', ['connection'])])], 'design');
    const latest = resolveKeyPromptPassengerSnapshot(
      [group([key('design', ['connection', 'height'])])],
      state,
    );

    assert.deepEqual(latest, ['connection', 'height']);
  });

  it('falls back to the click-time snapshot if filters remove the row', () => {
    const state = createKeyPromptPreviewState([group([key('design', ['connection'])])], 'design');

    assert.deepEqual(resolveKeyPromptPassengerSnapshot([], state), ['connection']);
  });
});
