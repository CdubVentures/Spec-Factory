import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REPAIR_LLM_SPEC,
  createRepairCallLlm,
} from '../repairLlmAdapter.js';

// ── SPEC constants (same pattern as colorEditionLlmAdapter.test.js) ──────────

describe('REPAIR_LLM_SPEC', () => {
  it('has phase=validate', () => {
    assert.equal(REPAIR_LLM_SPEC.phase, 'validate');
  });

  it('has reason=field_repair', () => {
    assert.equal(REPAIR_LLM_SPEC.reason, 'field_repair');
  });

  it('has role=validate', () => {
    assert.equal(REPAIR_LLM_SPEC.role, 'validate');
  });

  it('system includes common repair system prompt', () => {
    assert.ok(REPAIR_LLM_SPEC.system.includes('field value validator'));
    assert.ok(REPAIR_LLM_SPEC.system.includes('deterministic validation'));
  });

  it('system includes hallucination patterns', () => {
    assert.ok(REPAIR_LLM_SPEC.system.includes('HALLUCINATION RED FLAGS'));
    assert.ok(REPAIR_LLM_SPEC.system.includes('COLOR NAMES'));
    assert.ok(REPAIR_LLM_SPEC.system.includes('SENSOR/SWITCH NAMES'));
  });

  it('jsonSchema has status and decisions properties', () => {
    assert.ok(REPAIR_LLM_SPEC.jsonSchema.properties.status);
    assert.ok(REPAIR_LLM_SPEC.jsonSchema.properties.decisions);
    assert.ok(REPAIR_LLM_SPEC.jsonSchema.properties.reason);
  });

  it('jsonSchema does not include $schema', () => {
    assert.equal(REPAIR_LLM_SPEC.jsonSchema.$schema, undefined);
  });
});

// ── Factory: createRepairCallLlm ─────────────────────────────────────────────

describe('createRepairCallLlm', () => {
  it('returns a function', () => {
    const fn = createRepairCallLlm({
      callRoutedLlmFn: async () => ({}),
      config: {},
      logger: null,
    });
    assert.equal(typeof fn, 'function');
  });

  it('calls callRoutedLlmFn with phase=validate', async () => {
    let captured = null;
    const fn = createRepairCallLlm({
      callRoutedLlmFn: async (args) => { captured = args; return {}; },
      config: {},
      logger: null,
    });
    await fn({ user: 'test prompt', promptId: 'P1', fieldKey: 'color' });
    assert.equal(captured.phase, 'validate');
  });

  it('passes user message from domainArgs', async () => {
    let captured = null;
    const fn = createRepairCallLlm({
      callRoutedLlmFn: async (args) => { captured = args; return {}; },
      config: {},
      logger: null,
    });
    await fn({ user: 'The field color has enum policy closed...', promptId: 'P1', fieldKey: 'color' });
    assert.equal(captured.user, 'The field color has enum policy closed...');
  });

  it('passes dynamic reason with promptId (field_repair_P1)', async () => {
    let captured = null;
    const fn = createRepairCallLlm({
      callRoutedLlmFn: async (args) => { captured = args; return {}; },
      config: {},
      logger: null,
    });
    await fn({ user: 'test', promptId: 'P1', fieldKey: 'color' });
    assert.equal(captured.reason, 'field_repair_P1');
  });

  it('passes default reason when no promptId', async () => {
    let captured = null;
    const fn = createRepairCallLlm({
      callRoutedLlmFn: async (args) => { captured = args; return {}; },
      config: {},
      logger: null,
    });
    await fn({ user: 'test' });
    assert.equal(captured.reason, 'field_repair');
  });

  it('passes usageContext with promptId and fieldKey', async () => {
    let captured = null;
    const fn = createRepairCallLlm({
      callRoutedLlmFn: async (args) => { captured = args; return {}; },
      config: {},
      logger: null,
    });
    await fn({ user: 'test', promptId: 'P3', fieldKey: 'weight' });
    assert.equal(captured.usageContext.promptId, 'P3');
    assert.equal(captured.usageContext.fieldKey, 'weight');
  });

  it('passes system prompt from SPEC', async () => {
    let captured = null;
    const fn = createRepairCallLlm({
      callRoutedLlmFn: async (args) => { captured = args; return {}; },
      config: {},
      logger: null,
    });
    await fn({ user: 'test', promptId: 'P1', fieldKey: 'color' });
    assert.ok(captured.system.includes('field value validator'));
    assert.ok(captured.system.includes('HALLUCINATION'));
  });

  it('passes jsonSchema from SPEC', async () => {
    let captured = null;
    const fn = createRepairCallLlm({
      callRoutedLlmFn: async (args) => { captured = args; return {}; },
      config: {},
      logger: null,
    });
    await fn({ user: 'test', promptId: 'P1', fieldKey: 'color' });
    assert.equal(captured.jsonSchema.type, 'object');
    assert.ok(captured.jsonSchema.properties.decisions);
    assert.ok(!captured.jsonSchema.$schema, '$schema must be stripped');
  });

  it('forwards config and logger from deps', async () => {
    let captured = null;
    const cfg = { llmModelPlan: 'test-model' };
    const fn = createRepairCallLlm({
      callRoutedLlmFn: async (args) => { captured = args; return {}; },
      config: cfg,
      logger: 'test-logger',
    });
    await fn({ user: 'test' });
    assert.equal(captured.config, cfg);
    assert.equal(captured.logger, 'test-logger');
  });
});

// ── Integration: adapter + repairField end-to-end ────────────────────────────

describe('integration: adapter + repairField', () => {
  it('full chain: enum rejection → adapter → LLM call → repaired', async () => {
    // Dynamically import repairField to avoid circular issues
    const { repairField } = await import('../repair-adapter/repairField.js');

    let captured = null;
    const callLlm = createRepairCallLlm({
      callRoutedLlmFn: async (args) => {
        captured = args;
        return {
          status: 'repaired',
          reason: null,
          decisions: [{
            value: 'pink',
            decision: 'map_to_existing',
            resolved_to: 'magenta',
            confidence: 0.9,
            reasoning: 'close color match',
          }],
        };
      },
      config: {},
      logger: null,
    });

    const knownValues = { policy: 'closed', values: ['black', 'white', 'magenta'] };
    const result = await repairField({
      validationResult: {
        valid: false,
        value: 'pink',
        confidence: 1.0,
        repairs: [],
        rejections: [{ reason_code: 'enum_value_not_allowed', detail: { unknown: ['pink'], policy: 'closed' } }],
        unknownReason: null,
        repairPrompt: null,
      },
      fieldKey: 'color',
      fieldRule: { contract: { shape: 'scalar', type: 'string' }, parse: {} },
      knownValues,
      callLlm,
    });

    // Verify the repair succeeded
    assert.equal(result.status, 'repaired');
    assert.equal(result.value, 'magenta');

    // Verify the adapter passed correct args to callRoutedLlmFn
    assert.equal(captured.phase, 'validate');
    assert.ok(captured.reason.includes('P1'), `reason should include P1, got: ${captured.reason}`);
    assert.ok(captured.system.includes('field value validator'));
    assert.ok(captured.user.includes('pink'));
    assert.ok(captured.user.includes('closed'));
    assert.ok(captured.jsonSchema.properties.decisions);
    assert.equal(captured.usageContext.promptId, 'P1');
    assert.equal(captured.usageContext.fieldKey, 'color');
  });
});
