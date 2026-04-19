import test from 'node:test';
import assert from 'node:assert/strict';
import { roleTokenCap } from '../routing.js';

// ---------------------------------------------------------------------------
// roleTokenCap: registry ceiling enforcement + role collapsing
// ---------------------------------------------------------------------------
// Contract:
//   Input: config, role, reason, registryEntry (optional)
//   Output: integer token cap
//   Invariant: never exceed registry maxOutputTokens when available
//   Invariant: llmMaxOutputTokensPlan/Reasoning/Triage remain user-tunable
//   Invariant: extract/validate/write collapse to the same path as plan default
//   Invariant: no fallback-specific branch — fallback shares the phase cap via routing

const TABLE = [
  {
    label: 'extract: user cap under registry ceiling → user cap wins',
    role: 'extract',
    reason: '',
    registryMaxOutput: 65536,
    configPlanCap: 4096,
    expected: 4096,
  },
  {
    label: 'extract: registry ceiling lower than user cap → ceiling wins',
    role: 'extract',
    reason: '',
    registryMaxOutput: 2048,
    configPlanCap: 4096,
    expected: 2048,
  },
  {
    label: 'plan: no registry entry → user cap unchanged',
    role: 'plan',
    reason: 'plan',
    registryMaxOutput: null,
    configPlanCap: 4096,
    expected: 4096,
  },
  {
    label: 'plan triage: triage cap under ceiling → triage cap',
    role: 'plan',
    reason: 'serp_selector',
    registryMaxOutput: 65536,
    configPlanCap: 4096,
    configTriageCap: 24000,
    expected: 24000,
  },
  {
    label: 'plan reasoning: reasoning cap under ceiling → reasoning cap',
    role: 'plan',
    reason: 'planner_reason',
    registryMaxOutput: 65536,
    configPlanCap: 4096,
    configReasoningCap: 8192,
    expected: 8192,
  },
  {
    label: 'validate: collapsed to plan default, user cap under ceiling',
    role: 'validate',
    reason: '',
    registryMaxOutput: 65536,
    configPlanCap: 4096,
    expected: 4096,
  },
  {
    label: 'write: collapsed to plan default, user cap under ceiling',
    role: 'write',
    reason: '',
    registryMaxOutput: 65536,
    configPlanCap: 4096,
    expected: 4096,
  },
  {
    label: 'plan: registry ceiling clamps user cap down',
    role: 'plan',
    reason: 'plan',
    registryMaxOutput: 1000,
    configPlanCap: 4096,
    expected: 1000,
  },
  {
    label: 'plan triage: registry ceiling clamps triage cap',
    role: 'plan',
    reason: 'serp_selector',
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

    const registryEntry = row.registryMaxOutput != null
      ? { tokenProfile: { maxOutputTokens: row.registryMaxOutput } }
      : undefined;

    const result = roleTokenCap(config, row.role, row.reason, registryEntry);
    assert.equal(result, row.expected, `${row.label}: expected ${row.expected}, got ${result}`);
  });
}
