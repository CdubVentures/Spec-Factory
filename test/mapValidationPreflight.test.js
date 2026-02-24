import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getWorkbookMapValidationOutcome,
  assertWorkbookMapValidationOrThrow,
  resolveWorkbookMapPayloadForSave,
} from '../tools/gui-react/src/pages/studio/mapValidationPreflight.js';

test('getWorkbookMapValidationOutcome prefers explicit valid flag', () => {
  const result = getWorkbookMapValidationOutcome({
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

test('getWorkbookMapValidationOutcome falls back to ok flag', () => {
  const result = getWorkbookMapValidationOutcome({
    ok: false,
    errors: [],
    warnings: [],
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, []);
});

test('getWorkbookMapValidationOutcome infers invalid when errors exist and no explicit flags', () => {
  const result = getWorkbookMapValidationOutcome({
    errors: ['key_list: sheet is required'],
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['key_list: sheet is required']);
});

test('assertWorkbookMapValidationOrThrow throws concise preflight error for hard failures', () => {
  assert.throws(
    () => assertWorkbookMapValidationOrThrow({
      result: {
        valid: false,
        errors: ['e1', 'e2', 'e3', 'e4'],
      },
      actionLabel: 'compile',
    }),
    /Workbook map validation failed before compile: e1; e2; e3 \(\+1 more\)/,
  );
});

test('resolveWorkbookMapPayloadForSave prefers normalized payload when available', () => {
  const fallback = { tooltip_source: { path: 'raw.json' } };
  const payload = resolveWorkbookMapPayloadForSave({
    result: {
      valid: true,
      normalized: { tooltip_source: { path: 'normalized.json' } },
    },
    fallback,
  });

  assert.deepEqual(payload, { tooltip_source: { path: 'normalized.json' } });
});

