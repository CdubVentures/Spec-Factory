import test from 'node:test';
import assert from 'node:assert/strict';
import { roleTokenCap } from '../src/core/llm/client/routing.js';

// ---------------------------------------------------------------------------
// Phase 1 — roleTokenCap: dead-branch removal + registry ceiling enforcement
// ---------------------------------------------------------------------------
// Contract:
//   Input: config, role, reason, isFallback, registryEntry (optional)
//   Output: integer token cap
//   Invariant: never exceed registry maxOutputTokens when available
//   Invariant: llmMaxOutputTokensPlan/Reasoning/Triage remain user-tunable
//   Invariant: extract/validate/write collapse to the same path as plan default

const TABLE = [
  {
    label: 'extract: user cap under registry ceiling → user cap wins',
    role: 'extract',
    reason: '',
    isFallback: false,
    registryMaxOutput: 65536,
    configPlanCap: 4096,
    expected: 4096,
  },
  {
    label: 'extract: registry ceiling lower than user cap → ceiling wins',
    role: 'extract',
    reason: '',
    isFallback: false,
    registryMaxOutput: 2048,
    configPlanCap: 4096,
    expected: 2048,
  },
  {
    label: 'plan: no registry entry → user cap unchanged',
    role: 'plan',
    reason: 'plan',
    isFallback: false,
    registryMaxOutput: null,
    configPlanCap: 4096,
    expected: 4096,
  },
  {
    label: 'plan triage: triage cap under ceiling → triage cap',
    role: 'plan',
    reason: 'serp_selector',
    isFallback: false,
    registryMaxOutput: 65536,
    configPlanCap: 4096,
    configTriageCap: 24000,
    expected: 24000,
  },
  {
    label: 'plan reasoning: reasoning cap under ceiling → reasoning cap',
    role: 'plan',
    reason: 'planner_reason',
    isFallback: false,
    registryMaxOutput: 65536,
    configPlanCap: 4096,
    configReasoningCap: 8192,
    expected: 8192,
  },
  {
    label: 'plan fallback: isFallback uses plan fallback cap',
    role: 'plan',
    reason: 'plan',
    isFallback: true,
    registryMaxOutput: 65536,
    configPlanCap: 4096,
    configFallbackCap: 1024,
    expected: 1024,
  },
  {
    label: 'validate: collapsed to plan default, user cap under ceiling',
    role: 'validate',
    reason: '',
    isFallback: false,
    registryMaxOutput: 65536,
    configPlanCap: 4096,
    expected: 4096,
  },
  {
    label: 'write: collapsed to plan default, user cap under ceiling',
    role: 'write',
    reason: '',
    isFallback: false,
    registryMaxOutput: 65536,
    configPlanCap: 4096,
    expected: 4096,
  },
  {
    label: 'plan: registry ceiling clamps user cap down',
    role: 'plan',
    reason: 'plan',
    isFallback: false,
    registryMaxOutput: 1000,
    configPlanCap: 4096,
    expected: 1000,
  },
  {
    label: 'plan triage: registry ceiling clamps triage cap',
    role: 'plan',
    reason: 'serp_selector',
    isFallback: false,
    registryMaxOutput: 256,
    configPlanCap: 4096,
    configTriageCap: 512,
    expected: 256,
  },
];

for (const row of TABLE) {
  test(`roleTokenCap: ${row.label}`, () => {
    const config = {
      llmMaxOutputTokens: 1200,
      llmMaxOutputTokensPlan: row.configPlanCap,
    };
    if (row.configTriageCap !== undefined) {
      config.llmMaxOutputTokensTriage = row.configTriageCap;
    }
    if (row.configReasoningCap !== undefined) {
      config.llmMaxOutputTokensReasoning = row.configReasoningCap;
    }
    if (row.configFallbackCap !== undefined) {
      config.llmMaxOutputTokensPlanFallback = row.configFallbackCap;
    }

    const registryEntry = row.registryMaxOutput != null
      ? { tokenProfile: { maxOutputTokens: row.registryMaxOutput } }
      : undefined;

    const result = roleTokenCap(config, row.role, row.reason, row.isFallback, registryEntry);
    assert.equal(result, row.expected, `${row.label}: expected ${row.expected}, got ${result}`);
  });
}
