import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLlmKeyGateErrors, hasLlmKeyGateErrors, deriveSerperKeyGateError } from '../llmKeyGateHelpers.js';

function makeRoute(model, keyPresent) {
  return { primary: { provider: 'test-provider', model, api_key_present: keyPresent }, fallback: null };
}

describe('deriveLlmKeyGateErrors', () => {
  it('returns [] for undefined snapshot', () => {
    assert.deepEqual(deriveLlmKeyGateErrors(undefined), []);
  });

  it('returns [] for null snapshot', () => {
    assert.deepEqual(deriveLlmKeyGateErrors(null), []);
  });

  it('returns [] for empty object snapshot', () => {
    assert.deepEqual(deriveLlmKeyGateErrors({}), []);
  });

  it('returns [] when all roles have keys', () => {
    const snapshot = {
      plan: makeRoute('gemini-2.5-flash', true),
      triage: makeRoute('gemini-2.5-flash', true),
    };
    assert.deepEqual(deriveLlmKeyGateErrors(snapshot), []);
  });

  it('returns error when role has model but missing key and no fallback', () => {
    const snapshot = {
      plan: makeRoute('gemini-2.5-flash', false),
    };
    const errors = deriveLlmKeyGateErrors(snapshot);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].role, 'plan');
    assert.equal(errors[0].model, 'gemini-2.5-flash');
  });

  it('returns error when both primary and fallback lack keys', () => {
    const snapshot = {
      plan: {
        primary: { provider: 'openai', model: 'gpt-4o', api_key_present: false },
        fallback: { provider: 'openai', model: 'gpt-4o-mini', api_key_present: false },
      },
    };
    const errors = deriveLlmKeyGateErrors(snapshot);
    assert.equal(errors.length, 1);
  });

  it('returns [] when primary lacks key but fallback has key', () => {
    const snapshot = {
      plan: {
        primary: { provider: 'openai', model: 'gpt-4o', api_key_present: false },
        fallback: { provider: 'gemini', model: 'gemini-2.5-flash', api_key_present: true },
      },
    };
    assert.deepEqual(deriveLlmKeyGateErrors(snapshot), []);
  });

  it('returns multiple errors for multiple failing roles', () => {
    const snapshot = {
      plan: makeRoute('gpt-4o', false),
      triage: makeRoute('gpt-4o', false),
      extract: makeRoute('gemini-2.5-flash', true),
    };
    const errors = deriveLlmKeyGateErrors(snapshot);
    assert.equal(errors.length, 2);
    const roles = errors.map((e) => e.role);
    assert.ok(roles.includes('plan'));
    assert.ok(roles.includes('triage'));
  });

  it('returns [] when model is null or empty (nothing to gate)', () => {
    const snapshot = {
      plan: makeRoute(null, false),
      triage: makeRoute('', false),
    };
    assert.deepEqual(deriveLlmKeyGateErrors(snapshot), []);
  });

  it('returns [] when primary is null', () => {
    const snapshot = { plan: { primary: null, fallback: null } };
    assert.deepEqual(deriveLlmKeyGateErrors(snapshot), []);
  });

  it('maps roles to correct labels', () => {
    const snapshot = {
      plan: makeRoute('x', false),
      triage: makeRoute('x', false),
      extract: makeRoute('x', false),
      validate: makeRoute('x', false),
      write: makeRoute('x', false),
    };
    const errors = deriveLlmKeyGateErrors(snapshot);
    const labelMap = Object.fromEntries(errors.map((e) => [e.role, e.label]));
    assert.equal(labelMap.plan, 'Needset / Search Planner');
    assert.equal(labelMap.triage, 'Brand Resolver / SERP Selector');
    assert.equal(labelMap.extract, 'Extraction');
    assert.equal(labelMap.validate, 'Validation');
    assert.equal(labelMap.write, 'Write');
  });
});

describe('hasLlmKeyGateErrors', () => {
  it('returns false for valid config', () => {
    assert.equal(hasLlmKeyGateErrors({ plan: makeRoute('x', true) }), false);
  });

  it('returns true when keys are missing', () => {
    assert.equal(hasLlmKeyGateErrors({ plan: makeRoute('x', false) }), true);
  });

  it('returns false for null/undefined', () => {
    assert.equal(hasLlmKeyGateErrors(null), false);
    assert.equal(hasLlmKeyGateErrors(undefined), false);
  });
});

describe('deriveSerperKeyGateError', () => {
  it('returns null when Serper is not enabled', () => {
    assert.equal(deriveSerperKeyGateError({ enabled: false, configured: false, credit: null }), null);
  });

  it('returns null when enabled and configured', () => {
    assert.equal(deriveSerperKeyGateError({ enabled: true, configured: true, credit: 2500 }), null);
  });

  it('returns error when enabled but not configured', () => {
    const err = deriveSerperKeyGateError({ enabled: true, configured: false, credit: null });
    assert.ok(err);
    assert.equal(err.role, 'serper');
    assert.equal(err.label, 'Serper Search');
  });

  it('returns null for null/undefined input', () => {
    assert.equal(deriveSerperKeyGateError(null), null);
    assert.equal(deriveSerperKeyGateError(undefined), null);
  });
});
