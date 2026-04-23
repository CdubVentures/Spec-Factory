// WHY: O(1) Feature Scaling — auto-generates TypeScript stage key arrays, types,
// and metadata from the backend SSOT (src/core/config/runtimeStageDefs.js).
// Adding a new prefetch/fetch/extraction stage = add one entry in runtimeStageDefs.js + run this script.
//
// Usage: node tools/gui-react/scripts/generateRuntimeStageKeys.js
// Output: writes 3 .generated.ts files in the runtime-ops panels directories.
//
// Extraction stage defs additionally emit EXTRACTION_SELECT_PROPS + EXTRACTION_SECTION_META
// (see generateExtractionKeys below). Adding a new extraction plugin thus requires
// only: (a) a stage def entry here, (b) a plugin registry entry, (c) a React panel
// component registered in extractionStageRegistry.ts. Zero per-plugin GUI boilerplate.

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

function jsonValue(v) {
  if (v == null) return 'null';
  if (typeof v === 'string') return `'${escapeTip(v)}'`;
  return JSON.stringify(v);
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

// WHY: Extraction is the only stage group with Settings-panel integration and
// with heterogeneous plugin-data responses. Generating its SELECT_PROPS + SECTION_META
// collapses 4 previously-hardcoded GUI files into one source of truth.
function generateExtractionKeys(defs) {
  const keys = defs.map((d) => d.key);
  const lines = [HEADER];

  // Stage-level (Worker Extract tab + stage tabs)
  lines.push(`export const EXTRACTION_STAGE_KEYS = [\n  ${keys.map(quote).join(',\n  ')},\n] as const;\n`);
  lines.push(`export type ExtractionTabKey = (typeof EXTRACTION_STAGE_KEYS)[number];\n`);

  lines.push(`export interface StageMeta {`);
  lines.push(`  readonly label: string;`);
  lines.push(`  readonly tip: string;`);
  lines.push(`  readonly tone: 'info' | 'warning' | 'accent';`);
  lines.push(`}\n`);

  lines.push(`export const EXTRACTION_STAGE_META: Record<ExtractionTabKey, StageMeta> = {`);
  for (const d of defs) {
    lines.push(`  ${quote(d.key)}: { label: ${quote(d.label)}, tip: '${escapeTip(d.tip)}', tone: ${quote(d.tone)} },`);
  }
  lines.push('};\n');

  // Panel context + select-props (O(1) boilerplate per plugin — generated).
  lines.push(`import type { ExtractionPhasesResponse, ExtractionPluginData } from '../../types.ts';\n`);
  lines.push(`export interface ExtractionPanelContext {`);
  lines.push(`  data: ExtractionPhasesResponse | undefined;`);
  lines.push(`  persistScope: string;`);
  lines.push(`  runId?: string;`);
  lines.push(`}\n`);
  lines.push(`const EMPTY_PLUGIN: ExtractionPluginData = { entries: [], total: 0 };\n`);

  lines.push(`export const EXTRACTION_SELECT_PROPS: Record<ExtractionTabKey, (ctx: ExtractionPanelContext) => Record<string, unknown>> = {`);
  for (const d of defs) {
    lines.push(`  ${quote(d.key)}: (ctx) => ({`);
    lines.push(`    data: ctx.data?.plugins?.${d.key} ?? EMPTY_PLUGIN,`);
    lines.push(`    persistScope: ctx.persistScope,`);
    lines.push(`    runId: ctx.runId ?? '',`);
    lines.push(`  }),`);
  }
  lines.push('};\n');

  // Settings-section metadata (keyed by Settings section id so SettingsCategoryRegistry
  // can derive extraction.sections[] without hardcoding each plugin).
  lines.push(`export interface ExtractionSectionMeta {`);
  lines.push(`  readonly sectionId: string;`);
  lines.push(`  readonly label: string;`);
  lines.push(`  readonly tip: string;`);
  lines.push(`  readonly iconPath: string | null;`);
  lines.push(`  readonly customComponent: string | null;`);
  lines.push(`  readonly stageKey: ExtractionTabKey;`);
  lines.push(`}\n`);

  const withSection = defs.filter((d) => d.settingsSection);
  lines.push(`export const EXTRACTION_SECTION_META: Record<string, ExtractionSectionMeta> = {`);
  for (const d of withSection) {
    const s = d.settingsSection;
    lines.push(`  ${quote(s.id)}: {`);
    lines.push(`    sectionId: ${quote(s.id)},`);
    lines.push(`    label: ${quote(s.label)},`);
    lines.push(`    tip: '${escapeTip(s.tip)}',`);
    lines.push(`    iconPath: ${jsonValue(s.iconPath)},`);
    lines.push(`    customComponent: ${jsonValue(s.customComponent)},`);
    lines.push(`    stageKey: ${quote(d.key)},`);
    lines.push(`  },`);
  }
  lines.push('};\n');

  // Ordered list of section ids — drives SettingsCategoryRegistry order.
  lines.push(`export const EXTRACTION_SECTION_ORDER: readonly string[] = [`);
  for (const d of withSection) {
    lines.push(`  ${quote(d.settingsSection.id)},`);
  }
  lines.push('] as const;\n');

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

const extraction = generateExtractionKeys(EXTRACTION_STAGE_DEFS);

writeFileSync(resolve(PANELS_DIR, 'prefetch/prefetchStageKeys.generated.ts'), prefetch);
writeFileSync(resolve(PANELS_DIR, 'fetch/fetchStageKeys.generated.ts'), fetch);
writeFileSync(resolve(PANELS_DIR, 'extraction/extractionStageKeys.generated.ts'), extraction);

console.log('Generated:');
console.log('  prefetch/prefetchStageKeys.generated.ts');
console.log('  fetch/fetchStageKeys.generated.ts');
console.log('  extraction/extractionStageKeys.generated.ts');
