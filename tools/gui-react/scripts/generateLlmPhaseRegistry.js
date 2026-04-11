// WHY: O(1) Feature Scaling — auto-generates TypeScript phase registries from
// the backend SSOT (src/core/config/llmPhaseDefs.js). Adding a new LLM phase =
// add one entry in llmPhaseDefs.js + run this script. Zero manual frontend edits.
//
// Usage: node tools/gui-react/scripts/generateLlmPhaseRegistry.js
// Output: writes 4 .generated.ts files in the llm-config feature directory

import { LLM_PHASE_DEFS, LLM_PHASE_UI_GLOBAL, LLM_PHASE_GROUPS } from '../../../src/core/config/llmPhaseDefs.js';
import { FINDER_MODULES } from '../../../src/core/finder/finderModuleRegistry.js';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = resolve(__dirname, '../src/features/llm-config/state');
const TYPES_DIR = resolve(__dirname, '../src/features/llm-config/types');
const OPS_DIR = resolve(__dirname, '../src/features/operations/state');

const HEADER = '// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.\n// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js\n';

function quote(s) { return `'${s}'`; }

// ── Generate llmPhaseTypes.generated.ts ──

function generatePhaseTypes() {
  const allPhases = [LLM_PHASE_UI_GLOBAL, ...LLM_PHASE_DEFS];
  const ids = allPhases.map((p) => p.uiId);

  const lines = [HEADER];

  // LlmPhaseId union
  lines.push(`export type LlmPhaseId =\n  ${ids.map((id) => `| ${quote(id)}`).join('\n  ')};\n`);

  // LlmPhaseGroup union
  const groupIds = LLM_PHASE_GROUPS;
  lines.push(`export type LlmPhaseGroup =\n  ${groupIds.map((g) => `| ${quote(g)}`).join('\n  ')};\n`);

  // LlmPhaseDefinition interface
  lines.push(`export interface LlmPhaseDefinition {`);
  lines.push(`  id: LlmPhaseId;`);
  lines.push(`  label: string;`);
  lines.push(`  subtitle: string;`);
  lines.push(`  tip: string;`);
  lines.push(`  roles: ReadonlyArray<'plan' | 'triage' | 'reasoning' | 'validate'>;`);
  lines.push(`  sharedWith?: ReadonlyArray<LlmPhaseId>;`);
  lines.push(`  group: LlmPhaseGroup;`);
  lines.push(`}\n`);

  return lines.join('\n');
}

// ── Generate llmPhaseRegistry.generated.ts ──

function generatePhaseRegistry() {
  const allPhases = [LLM_PHASE_UI_GLOBAL, ...LLM_PHASE_DEFS];
  const ids = allPhases.map((p) => p.uiId);

  const lines = [HEADER];
  lines.push("import type { LlmPhaseDefinition, LlmPhaseId } from '../types/llmPhaseTypes.generated.ts';\n");

  // LLM_PHASE_IDS
  lines.push(`export const LLM_PHASE_IDS = [\n  ${ids.map(quote).join(',\n  ')},\n] as const satisfies readonly LlmPhaseId[];\n`);

  // LLM_PHASES
  lines.push('export const LLM_PHASES: readonly LlmPhaseDefinition[] = [');
  for (const p of allPhases) {
    const sharedWith = p.sharedWith ? `, sharedWith: [${p.sharedWith.map(quote).join(', ')}]` : '';
    const group = p.group ? `, group: ${quote(p.group)}` : `, group: 'global'`;
    lines.push(`  { id: ${quote(p.uiId)}, label: ${quote(p.label)}, subtitle: ${quote(p.subtitle)}, tip: ${quote(p.tip)}, roles: [${p.roles.map(quote).join(', ')}]${sharedWith}${group} },`);
  }
  lines.push('] as const;\n');

  // LLM_PHASE_GROUP_LABELS — display labels for sidebar section dividers
  lines.push(`export const LLM_PHASE_GROUP_LABELS: Record<string, string> = {`);
  lines.push(`  global: 'Global',`);
  lines.push(`  indexing: 'Indexing Pipeline',`);
  lines.push(`  publish: 'Publish Pipeline',`);
  lines.push(`  discovery: 'Discovery',`);
  lines.push(`};\n`);

  return lines.join('\n');
}

// ── Generate llmPhaseOverrideTypes.generated.ts ──

function generatePhaseOverrideTypes() {
  const ids = LLM_PHASE_DEFS.map((p) => p.id);

  const lines = [HEADER];
  lines.push('export interface LlmPhaseOverride {');
  lines.push('  baseModel: string;');
  lines.push('  reasoningModel: string;');
  lines.push('  fallbackModel: string;');
  lines.push('  fallbackReasoningModel: string;');
  lines.push('  fallbackUseReasoning: boolean;');
  lines.push('  fallbackThinking: boolean;');
  lines.push('  fallbackThinkingEffort: string;');
  lines.push('  fallbackWebSearch: boolean;');
  lines.push('  useReasoning: boolean;');
  lines.push('  maxOutputTokens: number | null;');
  lines.push('  timeoutMs: number | null;');
  lines.push('  maxContextTokens: number | null;');
  lines.push('  webSearch: boolean;');
  lines.push('  thinking: boolean;');
  lines.push('  thinkingEffort: string;');
  lines.push('  disableLimits: boolean;');
  lines.push('  jsonStrict: boolean;');
  lines.push('  writerModel: string;');
  lines.push('  writerReasoningModel: string;');
  lines.push('  writerUseReasoning: boolean;');
  lines.push('  writerThinking: boolean;');
  lines.push('  writerThinkingEffort: string;');
  lines.push('}\n');

  lines.push(`export type LlmOverridePhaseId = ${ids.map(quote).join(' | ')};\n`);

  lines.push('export type LlmPhaseOverrides = {');
  lines.push('  [K in LlmOverridePhaseId]?: Partial<LlmPhaseOverride>;');
  lines.push('};\n');

  return lines.join('\n');
}

// ── Generate llmPhaseOverridesBridge.generated.ts ──

function generatePhaseOverridesBridge() {
  const lines = [HEADER];

  lines.push("import type { LlmOverridePhaseId, LlmPhaseOverride, LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes.generated.ts';");
  lines.push("import type { LlmPhaseId } from '../types/llmPhaseTypes.generated.ts';\n");

  // Static helper functions (unchanged regardless of phase list)
  lines.push(`export function parsePhaseOverrides(json: string): LlmPhaseOverrides {
  if (!json || !json.trim() || json.trim() === '{}') return {};
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as LlmPhaseOverrides;
  } catch {
    return {};
  }
}

export function serializePhaseOverrides(overrides: LlmPhaseOverrides): string {
  const keys = Object.keys(overrides) as LlmOverridePhaseId[];
  const hasContent = keys.some((k) => {
    const phase = overrides[k];
    if (!phase) return false;
    return (
      (phase.baseModel !== undefined && phase.baseModel !== '') ||
      (phase.reasoningModel !== undefined && phase.reasoningModel !== '') ||
      (phase.fallbackModel !== undefined && phase.fallbackModel !== '') ||
      (phase.fallbackReasoningModel !== undefined && phase.fallbackReasoningModel !== '') ||
      phase.fallbackUseReasoning !== undefined ||
      phase.fallbackThinking !== undefined ||
      phase.fallbackThinkingEffort !== undefined ||
      phase.fallbackWebSearch !== undefined ||
      phase.useReasoning !== undefined ||
      phase.maxOutputTokens !== undefined ||
      phase.timeoutMs !== undefined ||
      phase.maxContextTokens !== undefined ||
      phase.webSearch !== undefined ||
      phase.thinking !== undefined ||
      phase.thinkingEffort !== undefined ||
      phase.disableLimits !== undefined ||
      phase.jsonStrict !== undefined ||
      (phase.writerModel !== undefined && phase.writerModel !== '') ||
      (phase.writerReasoningModel !== undefined && phase.writerReasoningModel !== '') ||
      phase.writerUseReasoning !== undefined ||
      phase.writerThinking !== undefined ||
      phase.writerThinkingEffort !== undefined
    );
  });
  if (!hasContent) return '{}';
  return JSON.stringify(overrides);
}

export interface ResolvedPhaseModel {
  baseModel: string;
  reasoningModel: string;
  fallbackModel: string;
  fallbackReasoningModel: string;
  fallbackUseReasoning: boolean;
  fallbackThinking: boolean;
  fallbackThinkingEffort: string;
  fallbackWebSearch: boolean;
  effectiveFallbackModel: string;
  useReasoning: boolean;
  maxOutputTokens: number | null;
  timeoutMs: number | null;
  maxContextTokens: number | null;
  webSearch: boolean;
  thinking: boolean;
  thinkingEffort: string;
  disableLimits: boolean;
  jsonStrict: boolean;
  writerModel: string;
  writerReasoningModel: string;
  writerUseReasoning: boolean;
  writerThinking: boolean;
  writerThinkingEffort: string;
  effectiveWriterModel: string;
  effectiveModel: string;
}

export interface GlobalDraftSlice {
  llmModelPlan: string;
  llmModelReasoning: string;
  llmPlanFallbackModel: string;
  llmReasoningFallbackModel: string;
  llmPlanUseReasoning: boolean;
  llmMaxOutputTokensPlan: number;
  llmMaxOutputTokensTriage: number;
  llmTimeoutMs: number;
  llmMaxTokens: number;
}

export interface PhaseOverrideRegistryEntry {
  uiPhaseId: LlmPhaseId;
  overrideKey: LlmOverridePhaseId;
  globalModel: keyof GlobalDraftSlice;
  groupToggle: keyof GlobalDraftSlice;
  globalTokens: keyof GlobalDraftSlice;
  globalTimeout: keyof GlobalDraftSlice;
  globalContextTokens: keyof GlobalDraftSlice;
  globalFallbackModel: keyof GlobalDraftSlice;
  globalFallbackReasoningModel: keyof GlobalDraftSlice;
}
`);

  // Generated registry entries
  lines.push('export const PHASE_OVERRIDE_REGISTRY: readonly PhaseOverrideRegistryEntry[] = [');
  for (const p of LLM_PHASE_DEFS) {
    lines.push(`  { uiPhaseId: ${quote(p.uiId)}, overrideKey: ${quote(p.id)}, globalModel: ${quote(p.globalModel)}, groupToggle: ${quote(p.groupToggle)}, globalTokens: ${quote(p.globalTokens)}, globalTimeout: ${quote(p.globalTimeout)}, globalContextTokens: ${quote(p.globalContextTokens)}, globalFallbackModel: ${quote(p.globalFallbackModel)}, globalFallbackReasoningModel: ${quote(p.globalFallbackReasoningModel)} },`);
  }
  lines.push('];\n');

  // Derived maps + helper functions
  lines.push(`const PHASE_GLOBAL_MAP: ReadonlyMap<LlmOverridePhaseId, PhaseOverrideRegistryEntry> =
  new Map(PHASE_OVERRIDE_REGISTRY.map((e) => [e.overrideKey, e]));

const UI_TO_OVERRIDE: ReadonlyMap<LlmPhaseId, LlmOverridePhaseId> =
  new Map(PHASE_OVERRIDE_REGISTRY.map((e) => [e.uiPhaseId, e.overrideKey]));

export function uiPhaseIdToOverrideKey(uiPhaseId: LlmPhaseId): LlmOverridePhaseId | undefined {
  return UI_TO_OVERRIDE.get(uiPhaseId);
}

// WHY: Composite keys ("providerId:modelId") are a routing concern.
// Display should always use the bare model ID.
function stripComposite(key: string): string {
  const i = key.indexOf(':');
  return i > 0 ? key.slice(i + 1) : key;
}

export function resolvePhaseModel(
  overrides: LlmPhaseOverrides,
  phaseId: LlmOverridePhaseId,
  globalDraft: GlobalDraftSlice,
): ResolvedPhaseModel | null {
  const mapping = PHASE_GLOBAL_MAP.get(phaseId);
  if (!mapping) return null;

  const phaseOverride: Partial<LlmPhaseOverride> = overrides[phaseId] || {};

  const baseModel = phaseOverride.baseModel || (globalDraft[mapping.globalModel] as string);
  const reasoningModel = phaseOverride.reasoningModel || globalDraft.llmModelReasoning;
  const fallbackModel = phaseOverride.fallbackModel || (globalDraft[mapping.globalFallbackModel] as string);
  const fallbackReasoningModel = phaseOverride.fallbackReasoningModel || (globalDraft[mapping.globalFallbackReasoningModel] as string);
  const fallbackUseReasoning = phaseOverride.fallbackUseReasoning ?? false;
  const fallbackThinking = phaseOverride.fallbackThinking ?? false;
  const fallbackThinkingEffort = phaseOverride.fallbackThinkingEffort ?? '';
  const fallbackWebSearch = phaseOverride.fallbackWebSearch ?? false;
  const useReasoning = phaseOverride.useReasoning ?? (globalDraft[mapping.groupToggle] as boolean) ?? false;
  const maxOutputTokens = phaseOverride.maxOutputTokens ?? (globalDraft[mapping.globalTokens] as number);
  const timeoutMs = phaseOverride.timeoutMs ?? (globalDraft[mapping.globalTimeout] as number);
  const maxContextTokens = phaseOverride.maxContextTokens ?? (globalDraft[mapping.globalContextTokens] as number);
  const webSearch = phaseOverride.webSearch ?? false;
  const thinking = phaseOverride.thinking ?? false;
  const thinkingEffort = phaseOverride.thinkingEffort ?? '';
  const disableLimits = phaseOverride.disableLimits ?? false;
  const jsonStrict = phaseOverride.jsonStrict ?? true;
  const writerModel = phaseOverride.writerModel || '';
  const writerReasoningModel = phaseOverride.writerReasoningModel || '';
  const writerUseReasoning = phaseOverride.writerUseReasoning ?? false;
  const writerThinking = phaseOverride.writerThinking ?? false;
  const writerThinkingEffort = phaseOverride.writerThinkingEffort ?? '';

  return {
    baseModel,
    reasoningModel,
    fallbackModel,
    fallbackReasoningModel,
    fallbackUseReasoning,
    fallbackThinking,
    fallbackThinkingEffort,
    fallbackWebSearch,
    effectiveFallbackModel: fallbackUseReasoning ? fallbackReasoningModel : fallbackModel,
    useReasoning,
    maxOutputTokens,
    timeoutMs,
    maxContextTokens,
    webSearch,
    thinking,
    thinkingEffort,
    disableLimits,
    jsonStrict,
    writerModel,
    writerReasoningModel,
    writerUseReasoning,
    writerThinking,
    writerThinkingEffort,
    effectiveWriterModel: stripComposite(writerUseReasoning ? writerReasoningModel : writerModel),
    effectiveModel: stripComposite(useReasoning ? reasoningModel : baseModel),
  };
}
`);

  return lines.join('\n');
}

// ── Generate finderModuleRegistry.generated.ts (Operations Tracker) ──

function generateFinderModuleRegistry() {
  const lines = [HEADER];
  lines.push('// WHY: Derived from src/core/finder/finderModuleRegistry.js');
  lines.push('// Eliminates hardcoded MODULE_STYLES / MODULE_LABELS in OperationsTracker.\n');

  // FinderModuleType union
  const types = FINDER_MODULES.map(m => m.moduleType);
  lines.push(`export type FinderModuleType =\n  ${types.map(t => `| ${quote(t)}`).join('\n  ')};\n`);

  // MODULE_STYLES map
  lines.push('export const MODULE_STYLES: Readonly<Record<string, string>> = {');
  for (const m of FINDER_MODULES) {
    lines.push(`  ${quote(m.moduleType)}: ${quote(m.chipStyle)},`);
  }
  lines.push('};\n');

  // MODULE_LABELS map
  lines.push('export const MODULE_LABELS: Readonly<Record<string, string>> = {');
  for (const m of FINDER_MODULES) {
    lines.push(`  ${quote(m.moduleType)}: ${quote(m.moduleLabel)},`);
  }
  lines.push('};\n');

  return lines.join('\n');
}

// ── Generate phaseSchemaRegistry.generated.js (backend — phase prompt/schema preview) ──

function phaseUiId(phaseId) {
  // colorFinder → color-finder, imageFinder → image-finder
  return phaseId.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function generateFinderPhaseSchemaRegistry() {
  const SRC_ROOT = resolve(__dirname, '../../../src');
  const lines = ['// AUTO-GENERATED from src/core/finder/finderModuleRegistry.js — do not edit manually.'];
  lines.push('// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js\n');
  lines.push("import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';\n");

  // Static imports for each finder module's adapter + schema
  for (const m of FINDER_MODULES) {
    if (!m.promptBuilderExport || !m.responseSchemaExport) continue;
    const adapterPath = `../../../${m.featurePath}/${m.promptBuilderExport.replace(/^build/, '').replace(/Prompt$/, '').replace(/([A-Z])/g, (_, c, i) => i === 0 ? c.toLowerCase() : c)}`;
    // Use featurePath to derive the actual source file paths
    lines.push(`import { ${m.promptBuilderExport} } from '../../../${m.featurePath}/${m.featurePath.split('-').map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1)).join('')}LlmAdapter.js';`);
    lines.push(`import { ${m.responseSchemaExport} } from '../../../${m.featurePath}/${m.featurePath.split('-').map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1)).join('')}Schema.js';`);
  }

  lines.push('\nexport const FINDER_PHASE_SCHEMAS = Object.freeze({');
  for (const m of FINDER_MODULES) {
    if (!m.promptBuilderExport || !m.responseSchemaExport) continue;
    const uiId = phaseUiId(m.phase);
    lines.push(`  ${quote(uiId)}: {`);
    lines.push(`    system_prompt: ${m.promptBuilderExport}({ product: { brand: '{brand}', model: '{model}' } }),`);
    lines.push(`    response_schema: zodToLlmSchema(${m.responseSchemaExport}),`);
    lines.push(`  },`);
  }
  lines.push('});\n');

  return lines.join('\n');
}

// ── Generate finderPanelRegistry.generated.ts (Indexing Lab panels) ──

function generateFinderPanelRegistry() {
  const lines = [HEADER];
  lines.push('// WHY: Derived from src/core/finder/finderModuleRegistry.js');
  lines.push('// Indexing Lab auto-renders panels from this registry. Zero manual imports.\n');
  lines.push("import { lazy } from 'react';\n");

  lines.push('export const FINDER_PANELS = [');
  for (const m of FINDER_MODULES) {
    if (!m.panelFeaturePath || !m.panelExport) continue;
    lines.push(`  {`);
    lines.push(`    id: ${quote(m.id)},`);
    lines.push(`    component: lazy(() => import('../../${m.panelFeaturePath}/components/${m.panelExport}.tsx').then(m => ({ default: m.${m.panelExport} }))),`);
    lines.push(`  },`);
  }
  lines.push('] as const;\n');

  return lines.join('\n');
}

// ── Generate moduleSettingsSections.generated.ts (Pipeline Settings sidebar) ──

function generateModuleSettingsSections() {
  const lines = [HEADER];
  lines.push('// WHY: Derived from src/core/finder/finderModuleRegistry.js');
  lines.push('// Pipeline Settings auto-renders module sections from this registry.\n');

  lines.push('export const MODULE_SETTINGS_SECTIONS = [');
  for (const m of FINDER_MODULES) {
    if (!m.settingsLabel) continue;
    const sectionId = `module-${m.moduleType}`;
    lines.push(`  {`);
    lines.push(`    id: ${quote(sectionId)} as const,`);
    lines.push(`    moduleId: ${quote(m.id)},`);
    lines.push(`    label: ${quote(m.settingsLabel)},`);
    lines.push(`    subtitle: ${quote(m.settingsSubtitle || '')},`);
    lines.push(`    tip: ${quote(m.settingsTip || '')},`);
    lines.push(`    group: 'modules',`);
    lines.push(`  },`);
  }
  lines.push('] as const;\n');

  lines.push('export type ModuleSettingsSectionId = typeof MODULE_SETTINGS_SECTIONS[number][\'id\'];\n');

  return lines.join('\n');
}

// ── Main ──

const phaseTypes = generatePhaseTypes();
const registry = generatePhaseRegistry();
const overrideTypes = generatePhaseOverrideTypes();
const bridge = generatePhaseOverridesBridge();
const finderRegistry = generateFinderModuleRegistry();
const finderPhaseSchemas = generateFinderPhaseSchemaRegistry();
const finderPanels = generateFinderPanelRegistry();
const moduleSettingsSections = generateModuleSettingsSections();

const INDEXING_DIR = resolve(__dirname, '../src/features/indexing/state');
const PIPELINE_DIR = resolve(__dirname, '../src/features/pipeline-settings/state');
const BACKEND_SCHEMA_DIR = resolve(__dirname, '../../../src/features/indexing/pipeline/shared');

writeFileSync(resolve(TYPES_DIR, 'llmPhaseTypes.generated.ts'), phaseTypes);
writeFileSync(resolve(STATE_DIR, 'llmPhaseRegistry.generated.ts'), registry);
writeFileSync(resolve(TYPES_DIR, 'llmPhaseOverrideTypes.generated.ts'), overrideTypes);
writeFileSync(resolve(STATE_DIR, 'llmPhaseOverridesBridge.generated.ts'), bridge);
writeFileSync(resolve(OPS_DIR, 'finderModuleRegistry.generated.ts'), finderRegistry);
writeFileSync(resolve(BACKEND_SCHEMA_DIR, 'phaseSchemaRegistry.generated.js'), finderPhaseSchemas);
writeFileSync(resolve(INDEXING_DIR, 'finderPanelRegistry.generated.ts'), finderPanels);
writeFileSync(resolve(PIPELINE_DIR, 'moduleSettingsSections.generated.ts'), moduleSettingsSections);

console.log('Generated:');
console.log('  types/llmPhaseTypes.generated.ts');
console.log('  state/llmPhaseRegistry.generated.ts');
console.log('  types/llmPhaseOverrideTypes.generated.ts');
console.log('  state/llmPhaseOverridesBridge.generated.ts');
console.log('  operations/state/finderModuleRegistry.generated.ts');
console.log('  backend/phaseSchemaRegistry.generated.js');
console.log('  indexing/state/finderPanelRegistry.generated.ts');
console.log('  pipeline-settings/state/moduleSettingsSections.generated.ts');
