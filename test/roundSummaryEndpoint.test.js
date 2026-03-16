import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoundSummaryFromEvents } from '../src/api/roundSummary.js';

describe('buildRoundSummaryFromEvents', () => {
  it('builds round summary from run_completed event', () => {
    const events = [
      { event: 'needset_computed', needset_size: 25, total_fields: 60 },
      { event: 'run_completed', confidence: 0.82, validated: true, missing_required_fields: ['weight', 'sensor'], critical_fields_below_pass_target: ['dpi'] }
    ];
    const result = buildRoundSummaryFromEvents(events);
    assert.equal(result.round_count, 1);
    assert.equal(result.stop_reason, null);
    assert.equal(result.rounds.length, 1);
    assert.equal(result.rounds[0].round, 0);
    assert.equal(result.rounds[0].confidence, 0.82);
    assert.equal(result.rounds[0].validated, true);
    assert.equal(result.rounds[0].needset_size, 25);
    assert.equal(result.rounds[0].missing_required_count, 2);
    assert.equal(result.rounds[0].critical_count, 1);
  });

  it('returns empty result for empty events', () => {
    const result = buildRoundSummaryFromEvents([]);
    assert.equal(result.round_count, 0);
    assert.equal(result.stop_reason, null);
    assert.deepStrictEqual(result.rounds, []);
  });

  it('returns empty result for null events', () => {
    const result = buildRoundSummaryFromEvents(null);
    assert.equal(result.round_count, 0);
    assert.equal(result.stop_reason, null);
    assert.deepStrictEqual(result.rounds, []);
  });

  it('handles run_completed without needset_computed', () => {
    const events = [
      { event: 'run_completed', confidence: 0.7, validated: false, missing_required_fields: [], critical_fields_below_pass_target: [] }
    ];
    const result = buildRoundSummaryFromEvents(events);
    assert.equal(result.round_count, 1);
    assert.equal(result.rounds[0].needset_size, 0);
    assert.equal(result.rounds[0].confidence, 0.7);
  });

  it('handles wrapped run_completed with payload envelope', () => {
    const events = [
      { event: 'needset_computed', payload: { needset_size: 30, total_fields: 55 } },
      { event: 'run_completed', payload: { confidence: 0.85, validated: true, missing_required_fields: ['weight'], critical_fields_below_pass_target: [] } }
    ];
    const result = buildRoundSummaryFromEvents(events);
    assert.equal(result.round_count, 1);
    assert.equal(result.rounds[0].confidence, 0.85);
    assert.equal(result.rounds[0].validated, true);
    assert.equal(result.rounds[0].needset_size, 30);
    assert.equal(result.rounds[0].missing_required_count, 1);
  });
});
