import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoundConfig } from '../src/runner/roundConfigBuilder.js';

// ────────────────────────────────────────────────────────
// Part 1: llmMaxCallsPerProductFast removal
// Round 0 must use llmMaxCallsPerRound directly, no fast cap
// ────────────────────────────────────────────────────────

test('round 0 uses llmMaxCallsPerRound directly (llmMaxCallsPerProductFast is dead)', () => {
  const baseConfig = {
    llmMaxCallsPerRound: 7,
    llmMaxCallsPerProductFast: 2,
  };
  const result = buildRoundConfig(baseConfig, { round: 0 });
  // WHY: llmMaxCallsPerProductFast is retired — round 0 should use llmMaxCallsPerRound
  assert.equal(result.llmMaxCallsPerRound, 7);
});

test('round 0 uses llmMaxCallsPerRound fallback of 4 when not set', () => {
  const baseConfig = {
  };
  const result = buildRoundConfig(baseConfig, { round: 0 });
  assert.equal(result.llmMaxCallsPerRound, 4);
});

test('round 0 with llmMaxCallsPerRound=0 falls back to default 4', () => {
  const baseConfig = {
    llmMaxCallsPerRound: 0,
  };
  const result = buildRoundConfig(baseConfig, { round: 0 });
  // WHY: 0 is falsy, so || 4 fallback produces 4, then Math.max(1, 4) = 4
  assert.equal(result.llmMaxCallsPerRound, 4);
});

test('round 1+ still uses llmMaxCallsPerRound (floor 16 applied for round > 0)', () => {
  const baseConfig = {
    llmMaxCallsPerRound: 20,
  };
  const result = buildRoundConfig(baseConfig, { round: 1 });
  // round > 0 has a floor of 16, so 20 passes through
  assert.equal(result.llmMaxCallsPerRound, 20);
});
