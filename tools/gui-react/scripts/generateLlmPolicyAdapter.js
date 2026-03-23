// WHY: O(1) Feature Scaling — auto-generates TypeScript interfaces, FLAT_TO_GROUP,
// FLAT_TOP_LEVEL maps, and assembleLlmPolicyFromFlat() from the backend registry SSOT.
// Adding a new LLM policy field = add one registry entry with policyGroup/policyField +
// run codegen. Zero manual frontend code changes.
//
// Usage: node tools/gui-react/scripts/generateLlmPolicyAdapter.js
// Output: writes tools/gui-react/src/features/llm-config/state/llmPolicyAdapter.generated.ts

import {
  LLM_POLICY_GROUPS,
  TOP_LEVEL_KEYS,
  JSON_KEYS,
  LLM_POLICY_FLAT_KEYS,
} from '../../../src/core/llm/llmPolicySchema.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../../../src/shared/settingsRegistry.js';

// --- Build flat-key → registry-type lookup for reader selection + TS type inference ---
function buildFlatKeyTypeMap() {
  const map = new Map();
  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    map.set(entry.key, entry.type);
    if (entry.configKey && entry.configKey !== entry.key) {
      map.set(entry.configKey, entry.type);
    }
  }
  return map;
}

function tsTypeFor(registryType) {
  if (registryType === 'bool') return 'boolean';
  if (registryType === 'int' || registryType === 'float') return 'number';
  return 'string';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate the TypeScript source for llmPolicyAdapter.generated.ts
 * @returns {string} TypeScript source code
 */
export function generateLlmPolicyAdapter() {
  const lines = [];
  const flatKeyToType = buildFlatKeyTypeMap();

  function readerFor(flatKey) {
    const type = flatKeyToType.get(flatKey);
    if (type === 'bool') return `readBool(source, '${flatKey}')`;
    if (type === 'int' || type === 'float') return `readNum(source, '${flatKey}')`;
    return `readStr(source, '${flatKey}')`;
  }

  lines.push('// AUTO-GENERATED from registry policyGroup/policyField metadata — do not edit manually.');
  lines.push('// Run: node tools/gui-react/scripts/generateLlmPolicyAdapter.js');
  lines.push('');
  lines.push("import type { LlmPhaseOverride } from '../types/llmPhaseOverrideTypes';");
  lines.push("import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';");
  lines.push('');

  // ── Generated TypeScript interfaces for each policy group ──
  const groupNames = Object.keys(LLM_POLICY_GROUPS);
  for (const group of groupNames) {
    const fields = LLM_POLICY_GROUPS[group];
    const interfaceName = `LlmPolicy${capitalize(group)}`;
    lines.push(`export interface ${interfaceName} {`);
    for (const [field, flatKey] of Object.entries(fields)) {
      const tsType = tsTypeFor(flatKeyToType.get(flatKey));
      lines.push(`  ${field}: ${tsType};`);
    }
    lines.push('}');
    lines.push('');
  }

  // ── LlmPolicyGroup union type ──
  const groupUnion = groupNames.map((g) => `'${g}'`).join(' | ');
  lines.push(`export type LlmPolicyGroup = ${groupUnion};`);
  lines.push('');

  // ── Composite LlmPolicy interface ──
  lines.push('export interface LlmPolicy {');
  for (const group of groupNames) {
    const interfaceName = `LlmPolicy${capitalize(group)}`;
    lines.push(`  ${group}: ${interfaceName};`);
  }
  // JSON blob fields (not derivable from registry — use hand-written types)
  lines.push('  phaseOverrides: Record<string, Partial<LlmPhaseOverride>>;');
  lines.push('  providerRegistry: LlmProviderEntry[];');
  // Top-level scalars
  for (const [policyKey, flatKey] of Object.entries(TOP_LEVEL_KEYS)) {
    const tsType = tsTypeFor(flatKeyToType.get(flatKey));
    lines.push(`  ${policyKey}: ${tsType};`);
  }
  lines.push('}');
  lines.push('');

  // ── FLAT_TO_GROUP map ──
  lines.push('export const FLAT_TO_GROUP: Record<string, { group: LlmPolicyGroup; field: string }> = {');
  for (const [group, fields] of Object.entries(LLM_POLICY_GROUPS)) {
    for (const [field, flatKey] of Object.entries(fields)) {
      const pad = ' '.repeat(Math.max(1, 42 - flatKey.length));
      lines.push(`  ${flatKey}:${pad}{ group: '${group}', field: '${field}' },`);
    }
  }
  lines.push('};');
  lines.push('');

  // ── FLAT_TOP_LEVEL map ──
  lines.push('export const FLAT_TOP_LEVEL: Record<string, string> = {');
  for (const [policyKey, flatKey] of Object.entries(TOP_LEVEL_KEYS)) {
    lines.push(`  ${flatKey}: '${policyKey}',`);
  }
  lines.push('};');
  lines.push('');

  // ── LLM_POLICY_MANAGED_KEYS ──
  lines.push('export const LLM_POLICY_MANAGED_KEYS = [');
  for (const key of LLM_POLICY_FLAT_KEYS) {
    lines.push(`  '${key}',`);
  }
  lines.push('] as const;');
  lines.push('');

  // ── Reader utilities ──
  lines.push('// --- Reader utilities (inlined for zero-dependency assembly) ---');
  lines.push('');
  lines.push('function readStr(source: Record<string, unknown>, key: string): string {');
  lines.push("  return String(source[key] ?? '');");
  lines.push('}');
  lines.push('');
  lines.push('function readNum(source: Record<string, unknown>, key: string): number {');
  lines.push('  const raw = source[key];');
  lines.push('  if (raw === undefined || raw === null) return 0;');
  lines.push('  const parsed = Number(raw);');
  lines.push('  return Number.isFinite(parsed) ? parsed : 0;');
  lines.push('}');
  lines.push('');
  lines.push('function readBool(source: Record<string, unknown>, key: string): boolean {');
  lines.push('  return Boolean(source[key] ?? false);');
  lines.push('}');
  lines.push('');
  lines.push('function safeJsonParse<T>(value: unknown, fallback: T): T {');
  lines.push("  if (value === undefined || value === null || value === '') return fallback;");
  lines.push('  try { return JSON.parse(String(value)); } catch { return fallback; }');
  lines.push('}');
  lines.push('');

  // ── assembleLlmPolicyFromFlat() ──
  lines.push('export function assembleLlmPolicyFromFlat(source: Record<string, unknown>): LlmPolicy {');
  lines.push('  return {');

  for (const [group, fields] of Object.entries(LLM_POLICY_GROUPS)) {
    lines.push(`    ${group}: {`);
    for (const [field, flatKey] of Object.entries(fields)) {
      lines.push(`      ${field}: ${readerFor(flatKey)},`);
    }
    lines.push('    },');
  }

  const JSON_FALLBACKS = { phaseOverrides: '{}', providerRegistry: '[]' };
  for (const [policyKey, flatKey] of Object.entries(JSON_KEYS)) {
    const fallback = JSON_FALLBACKS[policyKey] || '{}';
    lines.push(`    ${policyKey}: safeJsonParse(source.${flatKey}, ${fallback}),`);
  }

  for (const [policyKey, flatKey] of Object.entries(TOP_LEVEL_KEYS)) {
    lines.push(`    ${policyKey}: ${readerFor(flatKey)},`);
  }

  lines.push('  };');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// --- CLI: write the file when run directly ---
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const outPath = path.resolve(
    import.meta.dirname,
    '../src/features/llm-config/state/llmPolicyAdapter.generated.ts',
  );
  const content = generateLlmPolicyAdapter();
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote ${outPath} (${content.split('\n').length} lines)`);
}
