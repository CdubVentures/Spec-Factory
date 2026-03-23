// WHY: O(1) Feature Scaling — auto-generates LlmRouteRow interface,
// boolean/prompt-flag key arrays, and column labels from LLM_ROUTE_COLUMN_REGISTRY.
// Adding a route matrix column = add one registry entry + run codegen.
//
// Usage: node tools/gui-react/scripts/generateLlmRouteTypes.js
// Output: writes tools/gui-react/src/types/llmRouteTypes.generated.ts

import { LLM_ROUTE_COLUMN_REGISTRY } from '../../../src/db/specDbSchema.js';

const REGISTRY_TYPE_TO_TS = {
  int: 'number',
  bool: 'boolean',
  string: 'string',
};

// WHY: Some columns have narrower TS types than the generic 'string'.
// This map overrides the type for specific keys, matching existing hand-written types.
const COLUMN_TYPE_OVERRIDES = {
  scope: 'LlmScope',
};

/**
 * Generate the TypeScript source for llmRouteTypes.generated.ts
 * @param {ReadonlyArray<object>} registry - LLM_ROUTE_COLUMN_REGISTRY
 * @returns {string} TypeScript source code
 */
export function generateLlmRouteTypes(registry) {
  const lines = [];

  lines.push('// AUTO-GENERATED from LLM_ROUTE_COLUMN_REGISTRY — do not edit manually.');
  lines.push('// Run: node tools/gui-react/scripts/generateLlmRouteTypes.js');
  lines.push('');

  // Column keys const array
  const allKeys = registry.map(c => c.key);
  lines.push(`export const LLM_ROUTE_COLUMN_KEYS = [${allKeys.map(k => `'${k}'`).join(', ')}] as const;`);
  lines.push('export type LlmRouteColumnKey = typeof LLM_ROUTE_COLUMN_KEYS[number];');
  lines.push('');

  // Boolean keys
  const boolKeys = registry.filter(c => c.type === 'bool').map(c => c.key);
  lines.push(`export const LLM_ROUTE_BOOLEAN_COLUMN_KEYS = [${boolKeys.map(k => `'${k}'`).join(', ')}] as const;`);
  lines.push('export type LlmRouteBooleanKey = typeof LLM_ROUTE_BOOLEAN_COLUMN_KEYS[number];');
  lines.push('');

  // Prompt flag keys
  const promptKeys = registry.filter(c => c.promptFlag).map(c => c.key);
  lines.push(`export const LLM_ROUTE_PROMPT_FLAG_KEYS = [${promptKeys.map(k => `'${k}'`).join(', ')}] as const;`);
  lines.push('export type LlmRoutePromptFlagKey = typeof LLM_ROUTE_PROMPT_FLAG_KEYS[number];');
  lines.push('');

  // Collect type imports needed for overrides
  const typeImports = new Set();
  for (const col of registry) {
    const override = COLUMN_TYPE_OVERRIDES[col.key];
    if (override && override !== 'string' && override !== 'number' && override !== 'boolean') {
      typeImports.add(override);
    }
  }
  if (typeImports.size > 0) {
    lines.unshift(`import type { ${[...typeImports].join(', ')} } from './llmSettings.ts';`);
    // Re-add header after import
    lines.unshift('');
  }

  // LlmRouteRow interface
  lines.push('export interface LlmRouteRow {');
  lines.push('  id?: number;');
  lines.push('  category?: string;');
  for (const col of registry) {
    const tsType = COLUMN_TYPE_OVERRIDES[col.key] || REGISTRY_TYPE_TO_TS[col.type] || 'string';
    lines.push(`  ${col.key}: ${tsType};`);
  }
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
    '../src/types/llmRouteTypes.generated.ts',
  );
  const content = generateLlmRouteTypes(LLM_ROUTE_COLUMN_REGISTRY);
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote ${outPath} (${content.split('\n').length} lines)`);
}
