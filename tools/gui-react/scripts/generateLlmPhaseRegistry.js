// WHY: O(1) Feature Scaling — auto-generates TypeScript phase registries from
// the backend SSOT (src/core/config/llmPhaseDefs.js). Adding a new LLM phase =
// add one entry in llmPhaseDefs.js + run this script. Zero manual frontend edits.
//
// Usage: node tools/gui-react/scripts/generateLlmPhaseRegistry.js
// Output: writes 4 .generated.ts files in the llm-config feature directory

import { LLM_PHASE_DEFS, LLM_PHASE_UI_GLOBAL, LLM_PHASE_UI_GLOBAL_PROMPTS, LLM_PHASE_GROUPS } from '../../../src/core/config/llmPhaseDefs.js';
import { FINDER_MODULES, deriveFinderPaths } from '../../../src/core/finder/finderModuleRegistry.js';
import { OPERATION_TYPES } from '../../../src/core/operations/operationTypeRegistry.js';
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

// WHY: Order the sidebar as [Global, non-discovery phases, Global Prompts, discovery finders]
// so Global Prompts sits at the top of the Discovery group it configures.
function orderedPhasesForUi() {
  const nonDiscovery = LLM_PHASE_DEFS.filter((p) => p.group !== 'discovery');
  const discovery = LLM_PHASE_DEFS.filter((p) => p.group === 'discovery');
  return [LLM_PHASE_UI_GLOBAL, ...nonDiscovery, LLM_PHASE_UI_GLOBAL_PROMPTS, ...discovery];
}

function generatePhaseTypes() {
  const allPhases = orderedPhasesForUi();
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
  lines.push(`  roles: ReadonlyArray<'plan' | 'triage' | 'reasoning' | 'write'>;`);
  lines.push(`  sharedWith?: ReadonlyArray<LlmPhaseId>;`);
  lines.push(`  group: LlmPhaseGroup;`);
  lines.push(`}\n`);

  return lines.join('\n');
}

// ── Generate llmPhaseRegistry.generated.ts ──

function generatePhaseRegistry() {
  const allPhases = orderedPhasesForUi();
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
  lines.push(`  writer: 'Writer',`);
  lines.push(`  indexing: 'Indexing Pipeline',`);
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
  lines.push('  reasoningBudget: number | null;');
  lines.push('  webSearch: boolean;');
  lines.push('  thinking: boolean;');
  lines.push('  thinkingEffort: string;');
  lines.push('  disableLimits: boolean;');
  lines.push('  jsonStrict: boolean;');
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
      phase.reasoningBudget !== undefined ||
      phase.webSearch !== undefined ||
      phase.thinking !== undefined ||
      phase.thinkingEffort !== undefined ||
      phase.disableLimits !== undefined ||
      phase.jsonStrict !== undefined
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
  reasoningBudget: number | null;
  webSearch: boolean;
  thinking: boolean;
  thinkingEffort: string;
  disableLimits: boolean;
  jsonStrict: boolean;
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
  llmReasoningBudget: number;
}

export interface PhaseOverrideRegistryEntry {
  uiPhaseId: LlmPhaseId;
  overrideKey: LlmOverridePhaseId;
  globalModel: keyof GlobalDraftSlice;
  groupToggle: keyof GlobalDraftSlice;
  globalTokens: keyof GlobalDraftSlice;
  globalTimeout: keyof GlobalDraftSlice;
  globalContextTokens: keyof GlobalDraftSlice;
  globalReasoningBudget: keyof GlobalDraftSlice;
  globalFallbackModel: keyof GlobalDraftSlice;
  globalFallbackReasoningModel: keyof GlobalDraftSlice;
}
`);

  // Generated registry entries
  // WHY: Writer is excluded — it has no global-model inheritance (it IS the writer).
  // resolvePhaseModel handles writer via a special branch, and uiPhaseIdToOverrideKey
  // returns 'writer' by identity below.
  lines.push('export const PHASE_OVERRIDE_REGISTRY: readonly PhaseOverrideRegistryEntry[] = [');
  for (const p of LLM_PHASE_DEFS) {
    if (p.globalModel === null) continue;
    lines.push(`  { uiPhaseId: ${quote(p.uiId)}, overrideKey: ${quote(p.id)}, globalModel: ${quote(p.globalModel)}, groupToggle: ${quote(p.groupToggle)}, globalTokens: ${quote(p.globalTokens)}, globalTimeout: ${quote(p.globalTimeout)}, globalContextTokens: ${quote(p.globalContextTokens)}, globalReasoningBudget: ${quote(p.globalReasoningBudget)}, globalFallbackModel: ${quote(p.globalFallbackModel)}, globalFallbackReasoningModel: ${quote(p.globalFallbackReasoningModel)} },`);
  }
  lines.push('];\n');

  // Derived maps + helper functions
  lines.push(`const PHASE_GLOBAL_MAP: ReadonlyMap<LlmOverridePhaseId, PhaseOverrideRegistryEntry> =
  new Map(PHASE_OVERRIDE_REGISTRY.map((e) => [e.overrideKey, e]));

const UI_TO_OVERRIDE: ReadonlyMap<LlmPhaseId, LlmOverridePhaseId> =
  new Map(PHASE_OVERRIDE_REGISTRY.map((e) => [e.uiPhaseId, e.overrideKey]));

export function uiPhaseIdToOverrideKey(uiPhaseId: LlmPhaseId): LlmOverridePhaseId | undefined {
  // WHY: Writer is a first-class phase but has no PHASE_OVERRIDE_REGISTRY entry
  // (it has no global-model inheritance). Identity mapping for the writer case.
  if (uiPhaseId === 'writer') return 'writer';
  return UI_TO_OVERRIDE.get(uiPhaseId);
}

// WHY: Composite keys ("providerId:modelId") are a routing concern.
// Display should always use the bare model ID.
function stripComposite(key: string): string {
  const i = key.indexOf(':');
  return i > 0 ? key.slice(i + 1) : key;
}

// WHY: Writer has no global-model inheritance and no webSearch, and its
// jsonStrict is locked to true (writer always enforces the schema). Fallback
// inherits the global fallback unless explicitly overridden. All limits default
// to the global plan/timeout/context/reasoning settings.
function resolveWriterPhaseModel(
  overrides: LlmPhaseOverrides,
  globalDraft: GlobalDraftSlice,
): ResolvedPhaseModel {
  const wo: Partial<LlmPhaseOverride> = overrides.writer ?? {};
  const baseModel = wo.baseModel ?? '';
  const reasoningModel = wo.reasoningModel || globalDraft.llmModelReasoning || '';
  const fallbackModel = wo.fallbackModel || globalDraft.llmPlanFallbackModel || '';
  const fallbackReasoningModel = wo.fallbackReasoningModel || globalDraft.llmReasoningFallbackModel || '';
  const useReasoning = wo.useReasoning ?? false;
  const fallbackUseReasoning = wo.fallbackUseReasoning ?? false;
  return {
    baseModel,
    reasoningModel,
    fallbackModel,
    fallbackReasoningModel,
    fallbackUseReasoning,
    fallbackThinking: wo.fallbackThinking ?? false,
    fallbackThinkingEffort: wo.fallbackThinkingEffort ?? '',
    fallbackWebSearch: false,
    effectiveFallbackModel: fallbackUseReasoning ? fallbackReasoningModel : fallbackModel,
    useReasoning,
    maxOutputTokens: wo.maxOutputTokens ?? globalDraft.llmMaxOutputTokensPlan,
    timeoutMs: wo.timeoutMs ?? globalDraft.llmTimeoutMs,
    maxContextTokens: wo.maxContextTokens ?? globalDraft.llmMaxTokens,
    reasoningBudget: wo.reasoningBudget ?? globalDraft.llmReasoningBudget,
    webSearch: false,
    thinking: wo.thinking ?? false,
    thinkingEffort: wo.thinkingEffort ?? '',
    disableLimits: wo.disableLimits ?? false,
    jsonStrict: true,
    effectiveModel: stripComposite(useReasoning ? reasoningModel : baseModel),
  };
}

export function resolvePhaseModel(
  overrides: LlmPhaseOverrides,
  phaseId: LlmOverridePhaseId,
  globalDraft: GlobalDraftSlice,
): ResolvedPhaseModel | null {
  if (phaseId === 'writer') return resolveWriterPhaseModel(overrides, globalDraft);

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
  const reasoningBudget = phaseOverride.reasoningBudget ?? (globalDraft[mapping.globalReasoningBudget] as number);
  const webSearch = phaseOverride.webSearch ?? false;
  const thinking = phaseOverride.thinking ?? false;
  const thinkingEffort = phaseOverride.thinkingEffort ?? '';
  const disableLimits = phaseOverride.disableLimits ?? false;
  const jsonStrict = phaseOverride.jsonStrict ?? true;

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
    reasoningBudget,
    webSearch,
    thinking,
    thinkingEffort,
    disableLimits,
    jsonStrict,
    effectiveModel: stripComposite(useReasoning ? reasoningModel : baseModel),
  };
}
`);

  return lines.join('\n');
}

// ── Generate operationTypeRegistry.generated.ts (Operations Tracker) ──
// WHY: Merges finder modules (from finderModuleRegistry.js) and non-finder types
// (from operationTypeRegistry.js) into one complete map. Adding a new operation
// type = add one entry in the backend registry + run this script.

function generateOperationTypeRegistry() {
  const lines = [HEADER];
  lines.push('// WHY: Derived from src/core/finder/finderModuleRegistry.js + src/core/operations/operationTypeRegistry.js');
  lines.push('// Complete map of all operation types. Zero hardcoded entries in UI components.\n');

  // OperationType union (all types)
  const finderTypes = FINDER_MODULES.map(m => m.moduleType);
  const nonFinderTypes = OPERATION_TYPES.map(t => t.type);
  const allTypes = [...finderTypes, ...nonFinderTypes];
  lines.push(`export type OperationType =\n  ${allTypes.map(t => `| ${quote(t)}`).join('\n  ')};\n`);

  // MODULE_STYLES map (complete)
  lines.push('export const MODULE_STYLES: Readonly<Record<string, string>> = {');
  for (const m of FINDER_MODULES) {
    lines.push(`  ${quote(m.moduleType)}: ${quote(m.chipStyle)},`);
  }
  for (const t of OPERATION_TYPES) {
    lines.push(`  ${quote(t.type)}: ${quote(t.chipStyle)},`);
  }
  lines.push('};\n');

  // MODULE_LABELS map (complete)
  lines.push('export const MODULE_LABELS: Readonly<Record<string, string>> = {');
  for (const m of FINDER_MODULES) {
    lines.push(`  ${quote(m.moduleType)}: ${quote(m.moduleLabel)},`);
  }
  for (const t of OPERATION_TYPES) {
    lines.push(`  ${quote(t.type)}: ${quote(t.label)},`);
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
    const { featurePath, adapterModule, schemaModule } = deriveFinderPaths(m.id);
    lines.push(`import { ${m.promptBuilderExport} } from '../../../${featurePath}/${adapterModule}.js';`);
    lines.push(`import { ${m.responseSchemaExport} } from '../../../${featurePath}/${schemaModule}.js';`);
  }

  // WHY: Scalar finders (variantFieldProducer + defaultTemplateExport) get a
  // derived prompt_templates overlay in phaseSchemaRegistry.js via
  // buildScalarFinderPromptTemplates. Import their default templates + optional
  // slot-bag exports here so the overlay loop can reference them by phaseUiId.
  const scalarFinders = FINDER_MODULES.filter(
    (m) =>
      (m.moduleClass === 'variantFieldProducer' || m.moduleClass === 'productFieldProducer')
      && m.defaultTemplateExport,
  );
  for (const m of scalarFinders) {
    const { featurePath, adapterModule } = deriveFinderPaths(m.id);
    const slotExports = [
      m.defaultTemplateExport,
      m.sourceVariantGuidanceSlotsExport,
      m.variantDisambiguationSlotsExport,
    ].filter(Boolean);
    lines.push(`import { ${slotExports.join(', ')} } from '../../../${featurePath}/${adapterModule}.js';`);
  }

  lines.push('\nexport const FINDER_PHASE_SCHEMAS = Object.freeze({');
  for (const m of FINDER_MODULES) {
    if (!m.promptBuilderExport || !m.responseSchemaExport) continue;
    const uiId = phaseUiId(m.phase);
    lines.push(`  ${quote(uiId)}: {`);
    lines.push(`    system_prompt: ${m.promptBuilderExport}({ product: { brand: '{brand}', model: '{model}', category: '{category}' } }),`);
    lines.push(`    response_schema: zodToLlmSchema(${m.responseSchemaExport}),`);
    lines.push(`  },`);
  }
  lines.push('});\n');

  lines.push('// WHY: O(1) scalar-finder overlay — adding a new variantFieldProducer with');
  lines.push('// defaultTemplateExport yields a full prompt_templates overlay in');
  lines.push('// phaseSchemaRegistry.js automatically. No hand-written block required.');
  lines.push('export const FINDER_SCALAR_DEFAULT_TEMPLATES = Object.freeze({');
  for (const m of scalarFinders) {
    const uiId = phaseUiId(m.phase);
    const parts = [`moduleId: ${quote(m.id)}`, `defaultTemplate: ${m.defaultTemplateExport}`];
    if (m.sourceVariantGuidanceSlotsExport) {
      parts.push(`sourceVariantGuidanceSlots: ${m.sourceVariantGuidanceSlotsExport}`);
    }
    if (m.variantDisambiguationSlotsExport) {
      parts.push(`variantDisambiguationSlots: ${m.variantDisambiguationSlotsExport}`);
    }
    lines.push(`  ${quote(uiId)}: { ${parts.join(', ')} },`);
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
    const { panelFeaturePath, panelExport } = deriveFinderPaths(m.id);
    lines.push(`  {`);
    lines.push(`    id: ${quote(m.id)},`);
    lines.push(`    label: ${quote(m.moduleLabel || m.id)},`);
    lines.push(`    moduleClass: ${quote(m.moduleClass || '')},`);
    lines.push(`    scopeLevel: ${quote(deriveScopeLevel(m.moduleClass))},`);
    lines.push(`    routePrefix: ${quote(m.routePrefix || '')},`);
    lines.push(`    moduleType: ${quote(m.moduleType || '')},`);
    lines.push(`    phase: ${quote(m.phase || '')},`);
    if (m.valueKey) lines.push(`    valueKey: ${quote(m.valueKey)},`);
    if (m.panelTitle) lines.push(`    panelTitle: ${quote(m.panelTitle)},`);
    if (m.panelTip) lines.push(`    panelTip: ${quote(m.panelTip)},`);
    if (m.valueLabelPlural) lines.push(`    valueLabelPlural: ${quote(m.valueLabelPlural)},`);
    lines.push(`    component: lazy(() => import('../../${panelFeaturePath}/components/${panelExport}.tsx').then(m => ({ default: m.${panelExport} }))),`);
    lines.push(`  },`);
  }
  lines.push('] as const;\n');

  return lines.join('\n');
}

// WHY: Discovery-history drawer dispatches on scopeLevel — derived from moduleClass.
// variantGenerator → product-scoped (flat), variantFieldProducer → variant-scoped
// (2-level), variantArtifactProducer → variant+mode-scoped (3-level),
// productFieldProducer → field_key-scoped (keyFinder: one section per field_key
// that ran, each with URLs + queries aggregated across runs).
function deriveScopeLevel(moduleClass) {
  if (moduleClass === 'variantGenerator') return 'product';
  if (moduleClass === 'variantFieldProducer') return 'variant';
  if (moduleClass === 'variantArtifactProducer') return 'variant+mode';
  if (moduleClass === 'productFieldProducer') return 'field_key';
  return '';
}

// ── Generate moduleSettingsSections.generated.ts (Pipeline Settings sidebar) ──

function generateModuleSettingsSections() {
  const lines = [HEADER];
  lines.push('// WHY: Derived from src/core/finder/finderModuleRegistry.js');
  lines.push('// Pipeline Settings auto-renders module sections from this registry.');
  lines.push('// Form bodies are rendered by <FinderSettingsRenderer /> driven by finderSettingsRegistry.generated.ts.\n');

  lines.push('export const MODULE_SETTINGS_SECTIONS = [');
  for (const m of FINDER_MODULES) {
    if (!m.settingsLabel) continue;
    const sectionId = `module-${m.moduleType}`;
    const scope = m.settingsScope === 'global' ? 'global' : 'category';
    lines.push(`  {`);
    lines.push(`    id: ${quote(sectionId)} as const,`);
    lines.push(`    moduleId: ${quote(m.id)},`);
    lines.push(`    label: ${quote(m.settingsLabel)},`);
    lines.push(`    subtitle: ${quote(m.settingsSubtitle || '')},`);
    lines.push(`    tip: ${quote(m.settingsTip || '')},`);
    lines.push(`    iconName: ${quote(m.iconName || 'default')} as const,`);
    lines.push(`    settingsScope: ${quote(scope)} as const,`);
    lines.push(`    group: 'modules',`);
    lines.push(`  },`);
  }
  lines.push('] as const;\n');

  // Narrow moduleId tuple — lets consumers (panel props, hooks, type guards) use the literal union
  // instead of plain `string`, catching typos at compile time without hand-maintaining a type alias.
  const moduleIdEntries = FINDER_MODULES.filter((m) => m.settingsLabel).map((m) => quote(m.id));
  lines.push(`export const MODULE_IDS = [${moduleIdEntries.join(', ')}] as const;`);
  lines.push('export type ModuleSettingsModuleId = typeof MODULE_IDS[number];\n');

  lines.push('export type ModuleSettingsSectionId = typeof MODULE_SETTINGS_SECTIONS[number][\'id\'];\n');

  // WHY: Scope lookup — authority hook and panel read this to branch on
  // global vs category without re-scanning sections. Derived at codegen time
  // so consumers avoid the runtime .find() cost.
  lines.push('export type ModuleSettingsScope = \'global\' | \'category\';');
  lines.push('export const MODULE_SETTINGS_SCOPE_BY_ID: Record<ModuleSettingsModuleId, ModuleSettingsScope> = {');
  for (const m of FINDER_MODULES) {
    if (!m.settingsLabel) continue;
    const scope = m.settingsScope === 'global' ? 'global' : 'category';
    lines.push(`  ${quote(m.id)}: ${quote(scope)},`);
  }
  lines.push('};\n');

  return lines.join('\n');
}

// ── Generate finderSettingsRegistry.generated.ts (typed per-finder settings schema) ──

function serializeSettingEntry(entry) {
  const parts = [
    `key: ${quote(entry.key)}`,
    `type: ${quote(entry.type)}`,
    `default: ${JSON.stringify(entry.default)}`,
  ];
  if (entry.min !== undefined) parts.push(`min: ${entry.min}`);
  if (entry.max !== undefined) parts.push(`max: ${entry.max}`);
  if (entry.allowed !== undefined) {
    parts.push(`allowed: [${entry.allowed.map(quote).join(', ')}] as const`);
  }
  if (entry.optionLabels !== undefined) {
    parts.push(`optionLabels: ${JSON.stringify(entry.optionLabels)}`);
  }
  if (entry.keys !== undefined) {
    parts.push(`keys: [${entry.keys.map(quote).join(', ')}] as const`);
  }
  if (entry.keyLabels !== undefined) {
    parts.push(`keyLabels: ${JSON.stringify(entry.keyLabels)}`);
  }
  if (entry.uiLabel !== undefined) parts.push(`uiLabel: ${quote(entry.uiLabel)}`);
  if (entry.uiTip !== undefined) parts.push(`uiTip: ${quote(entry.uiTip)}`);
  if (entry.uiGroup !== undefined) parts.push(`uiGroup: ${quote(entry.uiGroup)}`);
  if (entry.uiHero !== undefined) parts.push(`uiHero: ${entry.uiHero}`);
  if (entry.uiRightPanel !== undefined) parts.push(`uiRightPanel: ${entry.uiRightPanel}`);
  if (entry.secret !== undefined) parts.push(`secret: ${entry.secret}`);
  if (entry.disabledBy !== undefined) parts.push(`disabledBy: ${quote(entry.disabledBy)}`);
  if (entry.allowEmpty !== undefined) parts.push(`allowEmpty: ${entry.allowEmpty}`);
  if (entry.hidden !== undefined) parts.push(`hidden: ${entry.hidden}`);
  if (entry.widget !== undefined) parts.push(`widget: ${quote(entry.widget)}`);
  if (entry.widgetProps !== undefined) {
    parts.push(`widgetProps: ${JSON.stringify(entry.widgetProps)}`);
  }
  return `{ ${parts.join(', ')} }`;
}

function generateFinderSettingsRegistry() {
  const lines = [HEADER];
  lines.push('// WHY: Derived from src/core/finder/finderModuleRegistry.js');
  lines.push('// Drives <FinderSettingsRenderer />. Each entry is a typed primitive (bool/int/float/string/enum),');
  lines.push('// optionally rendered via a named widget registered in the GUI widget registry.\n');

  lines.push(`export type FinderSettingType = 'bool' | 'int' | 'float' | 'string' | 'enum' | 'intMap';\n`);

  lines.push('export interface FinderSettingsEntry {');
  lines.push('  key: string;');
  lines.push('  type: FinderSettingType;');
  lines.push('  default: boolean | number | string | Record<string, number>;');
  lines.push('  min?: number;');
  lines.push('  max?: number;');
  lines.push('  allowed?: readonly string[];');
  lines.push('  optionLabels?: Record<string, string>;');
  lines.push('  keys?: readonly string[];');
  lines.push('  keyLabels?: Record<string, string>;');
  lines.push('  uiLabel?: string;');
  lines.push('  uiTip?: string;');
  lines.push('  uiGroup?: string;');
  lines.push('  uiHero?: boolean;');
  lines.push('  uiRightPanel?: boolean;');
  lines.push('  secret?: boolean;');
  lines.push('  disabledBy?: string;');
  lines.push('  allowEmpty?: boolean;');
  lines.push('  hidden?: boolean;');
  lines.push('  widget?: string;');
  lines.push('  widgetProps?: Record<string, unknown>;');
  lines.push('}\n');

  const finderIds = FINDER_MODULES
    .filter((m) => Array.isArray(m.settingsSchema))
    .map((m) => quote(m.id));
  lines.push(`export const FINDER_IDS_WITH_SETTINGS = [${finderIds.join(', ')}] as const;`);
  lines.push('export type FinderIdWithSettings = typeof FINDER_IDS_WITH_SETTINGS[number];\n');

  lines.push('export const FINDER_SETTINGS_REGISTRY: Record<FinderIdWithSettings, readonly FinderSettingsEntry[]> = {');
  for (const m of FINDER_MODULES) {
    if (!Array.isArray(m.settingsSchema)) continue;
    lines.push(`  ${quote(m.id)}: [`);
    for (const entry of m.settingsSchema) {
      lines.push(`    ${serializeSettingEntry(entry)},`);
    }
    lines.push(`  ],`);
  }
  lines.push('};\n');

  return lines.join('\n');
}

// ── Generate billingCallTypeRegistry.generated.ts ──

// WHY: Flattens `phase.billing.reasons[]` across LLM_PHASE_DEFS into the
// frontend billing registry. Phase declaration order drives group order.
function flattenBillingRows() {
  const rows = [];
  for (const phase of LLM_PHASE_DEFS) {
    if (!phase.billing || !Array.isArray(phase.billing.reasons)) continue;
    for (const r of phase.billing.reasons) {
      rows.push({ reason: r.reason, label: r.label, color: r.color, group: phase.billing.group });
    }
  }
  return rows;
}

function generateBillingCallTypeRegistry() {
  const rows = flattenBillingRows();
  const lines = [HEADER];
  lines.push("// WHY: Single source of truth for billing reason → display label + chart color.");
  lines.push("// Derived from billing blocks on LLM_PHASE_DEFS entries. Adding a new LLM call");
  lines.push("// source = add a `billing` block to the owning phase in llmPhaseDefs.js.\n");

  lines.push('export interface BillingCallTypeEntry {');
  lines.push('  readonly reason: string;');
  lines.push('  readonly label: string;');
  lines.push('  readonly color: string;');
  lines.push('  readonly group: string;');
  lines.push('}\n');

  lines.push('export const BILLING_CALL_TYPE_REGISTRY: readonly BillingCallTypeEntry[] = Object.freeze([');
  for (const row of rows) {
    lines.push(`  { reason: ${quote(row.reason)}, label: ${quote(row.label)}, color: ${quote(row.color)}, group: ${quote(row.group)} },`);
  }
  lines.push(']);\n');

  lines.push('export const BILLING_CALL_TYPE_FALLBACK: BillingCallTypeEntry = Object.freeze({');
  lines.push("  reason: 'unknown',");
  lines.push("  label: 'Other',");
  lines.push("  color: 'var(--sf-billing-other-1, #94a3b8)',");
  lines.push("  group: 'Other',");
  lines.push('});\n');

  lines.push('export const BILLING_CALL_TYPE_MAP: Readonly<Record<string, BillingCallTypeEntry>> = Object.freeze(');
  lines.push('  Object.fromEntries(BILLING_CALL_TYPE_REGISTRY.map((e) => [e.reason, e])),');
  lines.push(');\n');

  lines.push('export function resolveBillingCallType(reason: string): BillingCallTypeEntry {');
  lines.push('  return BILLING_CALL_TYPE_MAP[reason] ?? BILLING_CALL_TYPE_FALLBACK;');
  lines.push('}\n');

  lines.push('export const BILLING_CALL_TYPE_GROUPS: readonly string[] = Object.freeze(');
  lines.push('  [...new Set(BILLING_CALL_TYPE_REGISTRY.map((e) => e.group))],');
  lines.push(');');

  return lines.join('\n') + '\n';
}

// ── Main ──

const phaseTypes = generatePhaseTypes();
const registry = generatePhaseRegistry();
const overrideTypes = generatePhaseOverrideTypes();
const bridge = generatePhaseOverridesBridge();
const finderRegistry = generateOperationTypeRegistry();
const finderPhaseSchemas = generateFinderPhaseSchemaRegistry();
const finderPanels = generateFinderPanelRegistry();
const moduleSettingsSections = generateModuleSettingsSections();
const finderSettingsRegistry = generateFinderSettingsRegistry();
const billingRegistry = generateBillingCallTypeRegistry();

const INDEXING_DIR = resolve(__dirname, '../src/features/indexing/state');
const PIPELINE_DIR = resolve(__dirname, '../src/features/pipeline-settings/state');
const BACKEND_SCHEMA_DIR = resolve(__dirname, '../../../src/features/indexing/pipeline/shared');
const BILLING_DIR = resolve(__dirname, '../src/features/billing');

writeFileSync(resolve(TYPES_DIR, 'llmPhaseTypes.generated.ts'), phaseTypes);
writeFileSync(resolve(STATE_DIR, 'llmPhaseRegistry.generated.ts'), registry);
writeFileSync(resolve(TYPES_DIR, 'llmPhaseOverrideTypes.generated.ts'), overrideTypes);
writeFileSync(resolve(STATE_DIR, 'llmPhaseOverridesBridge.generated.ts'), bridge);
writeFileSync(resolve(OPS_DIR, 'operationTypeRegistry.generated.ts'), finderRegistry);
writeFileSync(resolve(BACKEND_SCHEMA_DIR, 'phaseSchemaRegistry.generated.js'), finderPhaseSchemas);
writeFileSync(resolve(INDEXING_DIR, 'finderPanelRegistry.generated.ts'), finderPanels);
writeFileSync(resolve(PIPELINE_DIR, 'moduleSettingsSections.generated.ts'), moduleSettingsSections);
writeFileSync(resolve(PIPELINE_DIR, 'finderSettingsRegistry.generated.ts'), finderSettingsRegistry);
writeFileSync(resolve(BILLING_DIR, 'billingCallTypeRegistry.generated.ts'), billingRegistry);

console.log('Generated:');
console.log('  types/llmPhaseTypes.generated.ts');
console.log('  state/llmPhaseRegistry.generated.ts');
console.log('  types/llmPhaseOverrideTypes.generated.ts');
console.log('  state/llmPhaseOverridesBridge.generated.ts');
console.log('  operations/state/operationTypeRegistry.generated.ts');
console.log('  backend/phaseSchemaRegistry.generated.js');
console.log('  indexing/state/finderPanelRegistry.generated.ts');
console.log('  pipeline-settings/state/moduleSettingsSections.generated.ts');
console.log('  pipeline-settings/state/finderSettingsRegistry.generated.ts');
console.log('  billing/billingCallTypeRegistry.generated.ts');
