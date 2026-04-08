import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { repairField, repairCrossField } from '../repairField.js';

// ── Factories ────────────────────────────────────────────────────────────────

function makeValidResult(overrides = {}) {
  return {
    valid: true, value: 'black', confidence: 1.0,
    repairs: [], rejections: [], unknownReason: null, repairPrompt: null,
    ...overrides,
  };
}

function makeFailedResult(reason_code, detail = {}, overrides = {}) {
  return {
    valid: false, value: overrides.value ?? 'pink', confidence: 1.0,
    repairs: [], rejections: [{ reason_code, detail }],
    unknownReason: null, repairPrompt: null, ...overrides,
  };
}

function makeFieldRule(overrides = {}) {
  return {
    contract: { shape: 'scalar', type: 'string', unit: '', ...overrides.contract },
    parse: { template: 'text_field', ...overrides.parse },
    enum: { policy: 'closed' }, ...overrides,
  };
}

function makeLlmResponse(overrides = {}) {
  return {
    status: 'repaired', reason: null,
    decisions: [{ value: 'pink', decision: 'map_to_existing', resolved_to: 'magenta', reasoning: 'close color match' }],
    ...overrides,
  };
}

function stubCallLlm(response) {
  let called = false;
  let capturedArgs = null;
  const fn = async (args) => { called = true; capturedArgs = args; return response; };
  fn.wasCalled = () => called;
  fn.args = () => capturedArgs;
  return fn;
}

function throwingCallLlm(error) {
  return async () => { throw error; };
}

// ── short-circuits ───────────────────────────────────────────────────────────

describe('repairField — short-circuits', () => {
  it('returns no_repair_needed when already valid', async () => {
    const callLlm = stubCallLlm(makeLlmResponse());
    const result = await repairField({ validationResult: makeValidResult(), fieldKey: 'color', fieldRule: makeFieldRule(), callLlm });
    assert.equal(result.status, 'no_repair_needed');
    assert.equal(callLlm.wasCalled(), false);
  });

  it('returns prompt_skipped for shape-only rejection', async () => {
    const callLlm = stubCallLlm(makeLlmResponse());
    const result = await repairField({
      validationResult: makeFailedResult('wrong_shape', { expected: 'list', reason: 'expected list' }),
      fieldKey: 'colors', fieldRule: makeFieldRule(), callLlm,
    });
    assert.equal(result.status, 'prompt_skipped');
    assert.equal(callLlm.wasCalled(), false);
  });
});

// ── successful repairs (binary: pass re-validation or not) ──────────────────

describe('repairField — successful repairs', () => {
  it('P1: enum closed — map_to_existing passes re-validation', async () => {
    const callLlm = stubCallLlm(makeLlmResponse());
    const knownValues = { policy: 'closed', values: ['black', 'white', 'magenta'] };
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color', fieldRule: makeFieldRule(), knownValues, callLlm,
    });
    assert.equal(result.status, 'repaired');
    assert.equal(result.value, 'magenta');
  });

  it('P2: enum open — keep_new passes re-validation', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: 'midnight-blue', decision: 'keep_new', resolved_to: 'midnight-blue', reasoning: 'legit' }],
    });
    const callLlm = stubCallLlm(response);
    const knownValues = { policy: 'open_prefer_known', values: ['black', 'white'] };
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['midnight-blue'], policy: 'open_prefer_known' }, { value: 'midnight-blue' }),
      fieldKey: 'color', fieldRule: makeFieldRule(), knownValues, callLlm,
    });
    assert.equal(result.status, 'repaired');
  });

  it('P3: type coercion — numeric value passes re-validation', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: 'twenty', decision: 'map_to_existing', resolved_to: 20, reasoning: 'word to number' }],
    });
    const callLlm = stubCallLlm(response);
    const rule = makeFieldRule({ contract: { type: 'number' }, parse: { template: 'number_with_unit' } });
    const result = await repairField({
      validationResult: makeFailedResult('wrong_type', { expected: 'number', reason: 'not parseable' }, { value: 'twenty' }),
      fieldKey: 'weight', fieldRule: rule, callLlm,
    });
    assert.equal(result.status, 'repaired');
    assert.equal(result.value, 20);
  });

  it('P4: format — reformatted URL passes re-validation', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: 'badurl', decision: 'map_to_existing', resolved_to: 'https://example.com', reasoning: 'extracted url' }],
    });
    const callLlm = stubCallLlm(response);
    const rule = makeFieldRule({ parse: { template: 'url_field' } });
    const result = await repairField({
      validationResult: makeFailedResult('format_mismatch', { reason: 'url pattern' }, { value: 'badurl' }),
      fieldKey: 'spec_url', fieldRule: rule, callLlm,
    });
    assert.equal(result.status, 'repaired');
  });

  it('P5: component — mapped component passes re-validation', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: 'PAW 3950', decision: 'map_to_existing', resolved_to: 'PAW3950', reasoning: 'space removed' }],
    });
    const callLlm = stubCallLlm(response);
    const rule = makeFieldRule({ parse: { template: 'component_reference', component_type: 'sensor' } });
    const componentDb = { items: [{ name: 'PAW3950' }, { name: 'PMW3389' }] };
    const result = await repairField({
      validationResult: makeFailedResult('not_in_component_db', { value: 'PAW 3950', reason: 'not found' }, { value: 'PAW 3950' }),
      fieldKey: 'sensor', fieldRule: rule, componentDb, callLlm,
    });
    assert.equal(result.status, 'repaired');
  });

  it('P7: range — in-range value passes re-validation', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: '5000', decision: 'map_to_existing', resolved_to: 50, reasoning: 'likely kg not g' }],
    });
    const callLlm = stubCallLlm(response);
    const rule = makeFieldRule({ contract: { type: 'number', unit: 'g', range: { min: 5, max: 500 } } });
    const result = await repairField({
      validationResult: makeFailedResult('out_of_range', { min: 5, max: 500, actual: 5000 }, { value: 5000 }),
      fieldKey: 'weight', fieldRule: rule, callLlm,
    });
    assert.equal(result.status, 'repaired');
  });
});

// ── failure cases ────────────────────────────────────────────────────────────

describe('repairField — failure cases', () => {
  it('rerun_recommended when LLM says so', async () => {
    const response = makeLlmResponse({ status: 'rerun_recommended', reason: 'garbled' });
    const callLlm = stubCallLlm(response);
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color', fieldRule: makeFieldRule(),
      knownValues: { policy: 'closed', values: ['black'] }, callLlm,
    });
    assert.equal(result.status, 'rerun_recommended');
  });

  it('still_failed when LLM repair fails re-validation', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: 'pink', decision: 'map_to_existing', resolved_to: 'sparkle', reasoning: 'guess' }],
    });
    const callLlm = stubCallLlm(response);
    const knownValues = { policy: 'closed', values: ['black', 'white'] };
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color', fieldRule: makeFieldRule(), knownValues, callLlm,
    });
    assert.equal(result.status, 'still_failed');
  });

  it('still_failed when Zod parse fails', async () => {
    const callLlm = stubCallLlm({ bad: 'response' });
    const result = await repairField({
      validationResult: makeFailedResult('wrong_type', { expected: 'number', reason: 'fail' }),
      fieldKey: 'weight', fieldRule: makeFieldRule(), callLlm,
    });
    assert.equal(result.status, 'still_failed');
    assert.ok(result.error);
  });

  it('still_failed when callLlm throws', async () => {
    const callLlm = throwingCallLlm(new Error('API timeout'));
    const result = await repairField({
      validationResult: makeFailedResult('wrong_type', { expected: 'number', reason: 'fail' }),
      fieldKey: 'weight', fieldRule: makeFieldRule(), callLlm,
    });
    assert.equal(result.status, 'still_failed');
    assert.ok(result.error.includes('API timeout'));
  });
});

// ── decisions (reject/set_unk) ──────────────────────────────────────────────

describe('repairField — decisions', () => {
  it('set_unk produces unk value', async () => {
    const callLlm = stubCallLlm(makeLlmResponse({
      decisions: [{ value: 'pink', decision: 'set_unk', resolved_to: null, reasoning: 'unknown' }],
    }));
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color', fieldRule: makeFieldRule(),
      knownValues: { policy: 'closed', values: ['black'] }, callLlm,
    });
    assert.equal(result.revalidation.value, 'unk');
  });

  it('reject produces unk value', async () => {
    const callLlm = stubCallLlm(makeLlmResponse({
      decisions: [{ value: 'pink', decision: 'reject', resolved_to: null, reasoning: 'hallucination' }],
    }));
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color', fieldRule: makeFieldRule(),
      knownValues: { policy: 'closed', values: ['black'] }, callLlm,
    });
    assert.equal(result.revalidation.value, 'unk');
  });

  it('low-confidence decision still applied (re-validation is the gate)', async () => {
    const callLlm = stubCallLlm(makeLlmResponse({
      decisions: [{ value: 'pink', decision: 'map_to_existing', resolved_to: 'magenta', reasoning: 'wild guess' }],
    }));
    const knownValues = { policy: 'closed', values: ['magenta', 'black'] };
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color', fieldRule: makeFieldRule(), knownValues, callLlm,
    });
    // WHY: confidence 0.1 is still applied — re-validation passes because 'magenta' is in known values
    assert.equal(result.status, 'repaired');
    assert.equal(result.value, 'magenta');
  });
});

// ── list field ───────────────────────────────────────────────────────────────

describe('repairField — list field', () => {
  it('repairs list with mapped + keep_new items', async () => {
    const response = makeLlmResponse({
      decisions: [
        { value: 'pink', decision: 'map_to_existing', resolved_to: 'magenta', reasoning: 'match' },
        { value: 'teal', decision: 'keep_new', resolved_to: 'teal', reasoning: 'legit' },
      ],
    });
    const callLlm = stubCallLlm(response);
    const knownValues = { policy: 'open_prefer_known', values: ['black', 'white', 'magenta'] };
    const rule = makeFieldRule({ contract: { shape: 'list', type: 'string' } });
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink', 'teal'], policy: 'open_prefer_known' }, { value: ['pink', 'teal'] }),
      fieldKey: 'colors', fieldRule: rule, knownValues, callLlm,
    });
    assert.ok(result.revalidation);
  });

  it('drops rejected items from list', async () => {
    const response = makeLlmResponse({
      decisions: [
        { value: 'pink', decision: 'map_to_existing', resolved_to: 'magenta', reasoning: 'match' },
        { value: 'sparkle-unicorn', decision: 'reject', resolved_to: null, reasoning: 'hallucination' },
      ],
    });
    const callLlm = stubCallLlm(response);
    const knownValues = { policy: 'closed', values: ['black', 'white', 'magenta'] };
    const rule = makeFieldRule({ contract: { shape: 'list', type: 'string' } });
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink', 'sparkle-unicorn'], policy: 'closed' }, { value: ['pink', 'sparkle-unicorn'] }),
      fieldKey: 'colors', fieldRule: rule, knownValues, callLlm,
    });
    assert.ok(result.revalidation);
  });
});

// ── callLlm contract ─────────────────────────────────────────────────────────

describe('repairField — callLlm contract', () => {
  it('passes system, user, jsonSchema to callLlm', async () => {
    const callLlm = stubCallLlm(makeLlmResponse());
    const knownValues = { policy: 'closed', values: ['black', 'magenta'] };
    await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color', fieldRule: makeFieldRule(), knownValues, callLlm,
    });
    const args = callLlm.args();
    assert.ok(args.system);
    assert.ok(args.user);
    assert.ok(args.jsonSchema);
    assert.ok(args.system.includes('field value validator'));
  });
});

// ── repairCrossField — P6 ────────────────────────────────────────────────────

describe('repairCrossField — P6', () => {
  it('no_repair_needed for empty failures', async () => {
    const result = await repairCrossField({ crossFieldFailures: [], fields: {}, productName: 'Test', fieldRules: {}, callLlm: stubCallLlm({}) });
    assert.equal(result.status, 'no_repair_needed');
  });

  it('calls LLM with P6 prompt', async () => {
    const callLlm = stubCallLlm(makeLlmResponse({
      decisions: [{ value: 'battery_hours', decision: 'map_to_existing', resolved_to: 'unk', reasoning: 'wireless needs battery' }],
    }));
    const result = await repairCrossField({
      crossFieldFailures: [{ rule_id: 'wireless_battery', constraint: 'conditional', pass: false, action: 'reject_candidate' }],
      fields: { connection: 'wireless', battery_hours: 'unk' },
      productName: 'Razer Viper V3',
      fieldRules: { connection: makeFieldRule(), battery_hours: makeFieldRule({ contract: { type: 'number' } }) },
      callLlm,
    });
    assert.equal(result.promptId, 'P6');
    assert.ok(callLlm.wasCalled());
  });

  it('rerun_recommended when LLM says so', async () => {
    const callLlm = stubCallLlm(makeLlmResponse({ status: 'rerun_recommended' }));
    const result = await repairCrossField({
      crossFieldFailures: [{ rule_id: 'test', constraint: 'conditional', pass: false, action: 'reject_candidate' }],
      fields: { a: 1 }, productName: 'Test', fieldRules: {}, callLlm,
    });
    assert.equal(result.status, 'rerun_recommended');
  });

  it('still_failed when callLlm throws', async () => {
    const callLlm = throwingCallLlm(new Error('network error'));
    const result = await repairCrossField({
      crossFieldFailures: [{ rule_id: 'test', constraint: 'conditional', pass: false, action: 'reject_candidate' }],
      fields: { a: 1 }, productName: 'Test', fieldRules: {}, callLlm,
    });
    assert.equal(result.status, 'still_failed');
  });
});
