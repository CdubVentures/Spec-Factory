import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getFieldStudioMapValidationOutcome,
  assertFieldStudioMapValidationOrThrow,
} from '../mapValidationPreflight.js';

test('getFieldStudioMapValidationOutcome prefers explicit valid flag', () => {
  const result = getFieldStudioMapValidationOutcome({
    valid: true,
    errors: ['should be ignored when valid=true'],
    warnings: ['warn'],
    normalized: { key_list: { sheet: 'Data' } },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, ['should be ignored when valid=true']);
  assert.deepEqual(result.warnings, ['warn']);
  assert.deepEqual(result.normalized, { key_list: { sheet: 'Data' } });
});

test('getFieldStudioMapValidationOutcome falls back to ok flag', () => {
  const result = getFieldStudioMapValidationOutcome({
    ok: false,
    errors: [],
    warnings: [],
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, []);
});

test('getFieldStudioMapValidationOutcome infers invalid when errors exist and no explicit flags', () => {
  const result = getFieldStudioMapValidationOutcome({
    errors: ['key_list: sheet is required'],
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['key_list: sheet is required']);
});

test('assertFieldStudioMapValidationOrThrow throws concise preflight error for hard failures', () => {
  assert.throws(
    () => assertFieldStudioMapValidationOrThrow({
      result: {
        valid: false,
        errors: ['e1', 'e2', 'e3', 'e4'],
      },
      actionLabel: 'compile',
    }),
    /Field Studio map validation failed before compile: e1; e2; e3 \(\+1 more\)/,
  );
});

test('assertFieldStudioMapValidationOrThrow allows legacy map-only failures during compile when explicitly enabled', () => {
  const outcome = assertFieldStudioMapValidationOrThrow({
    result: {
      valid: false,
      errors: [
        'key_list: sheet is required',
      ],
      warnings: [],
    },
    actionLabel: 'compile',
    allowLegacyCompileBypass: true,
  });

  assert.equal(outcome.valid, true);
  assert.equal(
    outcome.warnings.some((warning) => warning.includes('legacy map validation mismatch')),
    true,
  );
});

test('assertFieldStudioMapValidationOrThrow does not bypass legacy errors for save mapping', () => {
  assert.throws(
    () => assertFieldStudioMapValidationOrThrow({
      result: {
        valid: false,
        errors: [
          'key_list: sheet is required',
        ],
      },
      actionLabel: 'save mapping',
      allowLegacyCompileBypass: true,
    }),
    /Field Studio map validation failed before save mapping:/,
  );
});

test('assertFieldStudioMapValidationOrThrow does not bypass when non-legacy errors are present', () => {
  assert.throws(
    () => assertFieldStudioMapValidationOrThrow({
      result: {
        valid: false,
        errors: [
          'key_list: sheet is required',
          'component_sources: type is required',
        ],
      },
      actionLabel: 'compile',
      allowLegacyCompileBypass: true,
    }),
    /Field Studio map validation failed before compile:/,
  );
});
