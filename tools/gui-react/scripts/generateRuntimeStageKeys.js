// WHY: O(1) Feature Scaling — auto-generates TypeScript stage key arrays, types,
// and metadata from the backend SSOT (src/core/config/runtimeStageDefs.js).
// Adding a new prefetch/fetch/extraction stage = add one entry in runtimeStageDefs.js + run this script.
//
// Usage: node tools/gui-react/scripts/generateRuntimeStageKeys.js
// Output: writes 3 .generated.ts files in the runtime-ops panels directories

import { PREFETCH_STAGE_DEFS, FETCH_STAGE_DEFS, EXTRACTION_STAGE_DEFS } from '../../../src/core/config/runtimeStageDefs.js';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANELS_DIR = resolve(__dirname, '../src/features/runtime-ops/panels');

const HEADER = '// AUTO-GENERATED from src/core/config/runtimeStageDefs.js \u2014 do not edit manually.\n// Run: node tools/gui-react/scripts/generateRuntimeStageKeys.js\n';

function quote(s) { return `'${s}'`; }

function escapeTip(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function generateStageKeys(defs, keysName, typeName, metaName) {
  const keys = defs.map((d) => d.key);

  const lines = [HEADER];

  // Key array + derived type
  lines.push(`export const ${keysName} = [\n  ${keys.map(quote).join(',\n  ')},\n] as const;\n`);
  lines.push(`export type ${typeName} = (typeof ${keysName})[number];\n`);

  // StageMeta interface
  lines.push(`export interface StageMeta {`);
  lines.push(`  readonly label: string;`);
  lines.push(`  readonly tip: string;`);
  lines.push(`  readonly tone: 'info' | 'warning' | 'accent';`);
  lines.push(`}\n`);

  // Metadata record
  lines.push(`export const ${metaName}: Record<${typeName}, StageMeta> = {`);
  for (const d of defs) {
    lines.push(`  ${quote(d.key)}: { label: ${quote(d.label)}, tip: '${escapeTip(d.tip)}', tone: ${quote(d.tone)} },`);
  }
  lines.push('};\n');

  return lines.join('\n');
}

// ── Main ──

const prefetch = generateStageKeys(
  PREFETCH_STAGE_DEFS,
  'PREFETCH_STAGE_KEYS',
  'PrefetchTabKey',
  'PREFETCH_STAGE_META',
);

const fetch = generateStageKeys(
  FETCH_STAGE_DEFS,
  'FETCH_STAGE_KEYS',
  'FetchTabKey',
  'FETCH_STAGE_META',
);

const extraction = generateStageKeys(
  EXTRACTION_STAGE_DEFS,
  'EXTRACTION_STAGE_KEYS',
  'ExtractionTabKey',
  'EXTRACTION_STAGE_META',
);

writeFileSync(resolve(PANELS_DIR, 'prefetch/prefetchStageKeys.generated.ts'), prefetch);
writeFileSync(resolve(PANELS_DIR, 'fetch/fetchStageKeys.generated.ts'), fetch);
writeFileSync(resolve(PANELS_DIR, 'extraction/extractionStageKeys.generated.ts'), extraction);

console.log('Generated:');
console.log('  prefetch/prefetchStageKeys.generated.ts');
console.log('  fetch/fetchStageKeys.generated.ts');
console.log('  extraction/extractionStageKeys.generated.ts');
