import type { ComponentType } from 'react';

// ── Workbench types ──────────────────────────────────────────────────

export interface WorkbenchRow {
  // Identity (always visible)
  key: string;
  displayName: string;
  group: string;

  // Contract
  variantDependent: boolean;
  pifDependent: boolean;
  contractType: string;
  contractShape: string;
  contractUnit: string;
  contractRange: string;        // "0–24000" or ""
  listRulesSummary: string;     // "dedup·asc·winner_only" or ""
  roundingSummary: string;      // "0·nearest" or ""

  // Priority
  requiredLevel: string;
  availability: string;
  difficulty: string;

  // Ai Assist
  variantInventoryUsage: boolean;
  pifPriorityImages: boolean;
  reasoningNoteFilled: boolean;

  // Enum
  enumPolicy: string;
  enumSource: string;
  knownValuesCount: number;

  // Components
  componentType: string;        // this field IS a component_db field (e.g., "sensor")
  matchCfgSummary: string;      // "fuzzy 0.85·name 0.6" or ""
  belongsToComponent: string;   // this field is a PROPERTY of a component (e.g., dpi → "sensor")
  propertyVariance: string;     // resolved variance for the property ("" | "authoritative" | "upper_bound" | …)

  // Constraints
  constraintsCount: number;
  constraintVariables: string;

  // Evidence
  minEvidenceRefs: number;
  tierPreference: string;

  // Tooltip
  tooltipMdFilled: boolean;

  // Search
  aliasesCount: number;
  queryTermsCount: number;
  domainHintsCount: number;
  contentTypesCount: number;

  // UI (legacy — surfaced only in debug/all presets)
  uiInputControl: string;
  uiOrder: number;

  // Meta
  egLocked: boolean;
  draftDirty: boolean;

  // Compile status
  hasErrors: boolean;
  hasWarnings: boolean;
  compileMessages: string[];

  // Internal refs
  _rule: Record<string, unknown>;
}

export type ColumnPreset =
  | 'minimal'
  | 'contract'
  | 'priority'
  | 'aiAssist'
  | 'enums'
  | 'components'
  | 'constraints'
  | 'evidence'
  | 'tooltip'
  | 'search'
  | 'debug'
  | 'all';

export type DrawerTab =
  | 'contract'
  | 'priority'
  | 'aiAssist'
  | 'enum'
  | 'components'
  | 'constraints'
  | 'evidence'
  | 'tooltip'
  | 'search';

// WHY: Drawer body components and table cells render the same SystemBadges slot
// for a given dot-path. Centralized so both surfaces import from one place.
export type BadgeSlot = ComponentType<{ p: string }>;
