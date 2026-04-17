// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

// WHY: Derived from src/core/finder/finderModuleRegistry.js
// Drives <FinderSettingsRenderer />. Each entry is a typed primitive (bool/int/float/string/enum),
// optionally rendered via a named widget registered in the GUI widget registry.

export type FinderSettingType = 'bool' | 'int' | 'float' | 'string' | 'enum';

export interface FinderSettingsEntry {
  key: string;
  type: FinderSettingType;
  default: boolean | number | string;
  min?: number;
  max?: number;
  allowed?: readonly string[];
  uiLabel?: string;
  uiTip?: string;
  uiGroup?: string;
  uiHero?: boolean;
  secret?: boolean;
  disabledBy?: string;
  allowEmpty?: boolean;
  hidden?: boolean;
  widget?: string;
  widgetProps?: Record<string, unknown>;
}

export const FINDER_IDS_WITH_SETTINGS = ['colorEditionFinder', 'productImageFinder', 'releaseDateFinder'] as const;
export type FinderIdWithSettings = typeof FINDER_IDS_WITH_SETTINGS[number];

export const FINDER_SETTINGS_REGISTRY: Record<FinderIdWithSettings, readonly FinderSettingsEntry[]> = {
  'colorEditionFinder': [
    { key: 'discoveryPromptTemplate', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'identityCheckPromptTemplate', type: 'string', default: "", allowEmpty: true, hidden: true },
  ],
  'productImageFinder': [
    { key: 'satisfactionThreshold', type: 'int', default: 3, min: 1, max: 20, uiLabel: 'Satisfaction Threshold', uiTip: 'Quality images per view required before that view is "satisfied"', uiGroup: 'Carousel Strategy' },
    { key: 'viewBudget', type: 'string', default: "", uiLabel: 'View Budget', uiTip: 'Active views + per-view attempt budgets. Empty = category defaults.', uiGroup: 'Carousel Strategy', allowEmpty: true, widget: 'viewBudget', widgetProps: {"childKeys":["viewAttemptBudget","viewAttemptBudgets"]} },
    { key: 'viewAttemptBudget', type: 'int', default: 5, min: 1, max: 50, uiLabel: 'Default View Attempt Budget', uiGroup: 'Carousel Strategy' },
    { key: 'viewAttemptBudgets', type: 'string', default: "", uiLabel: 'Per-View Attempt Budgets (JSON)', uiGroup: 'Carousel Strategy', allowEmpty: true },
    { key: 'reRunBudget', type: 'int', default: 1, min: 0, max: 5, uiLabel: 'Re-run Budget', uiTip: 'Extra LLM calls per view when re-looping an already-satisfied variant. 0 = skip.', uiGroup: 'Carousel Strategy' },
    { key: 'heroEnabled', type: 'bool', default: true, uiLabel: 'Hero Slots Enabled', uiGroup: 'Hero Slots' },
    { key: 'heroCount', type: 'int', default: 3, min: 1, max: 20, uiLabel: 'Hero Count', uiGroup: 'Hero Slots', disabledBy: 'heroEnabled' },
    { key: 'heroAttemptBudget', type: 'int', default: 3, min: 1, max: 20, uiLabel: 'Hero Attempt Budget', uiGroup: 'Hero Slots', disabledBy: 'heroEnabled' },
    { key: 'viewConfig', type: 'string', default: "", uiLabel: 'View Configuration', uiTip: 'Priority order and descriptions per view. Empty = category defaults.', uiGroup: 'Views', allowEmpty: true, widget: 'viewConfig' },
    { key: 'minWidth', type: 'int', default: 800, min: 100, max: 8000, uiLabel: 'Min Width', uiGroup: 'Image Quality' },
    { key: 'minHeight', type: 'int', default: 600, min: 100, max: 8000, uiLabel: 'Min Height', uiGroup: 'Image Quality' },
    { key: 'minFileSize', type: 'int', default: 50000, min: 1000, max: 50000000, uiLabel: 'Min File Size (bytes)', uiGroup: 'Image Quality' },
    { key: 'viewQualityConfig', type: 'string', default: "", uiLabel: 'Per-View Quality', uiTip: 'Per-view overrides of the quality thresholds. Empty = category defaults.', uiGroup: 'Image Quality', allowEmpty: true, widget: 'viewQualityGrid' },
    { key: 'evalEnabled', type: 'bool', default: true, uiLabel: 'Vision Evaluator Enabled', uiGroup: 'Vision Evaluation' },
    { key: 'evalThumbSize', type: 'int', default: 768, min: 256, max: 2048, uiLabel: 'Eval Thumbnail Size', uiTip: '512px tile boundary — 768 uses 4 tiles like 1024. Larger = more detail but more tokens.', uiGroup: 'Vision Evaluation', disabledBy: 'evalEnabled', widget: 'evalThumbSize' },
    { key: 'evalHeroCount', type: 'int', default: 3, min: 1, max: 20, uiLabel: 'Eval Hero Count', uiGroup: 'Vision Evaluation', disabledBy: 'evalEnabled' },
    { key: 'rmbgConcurrency', type: 'int', default: 0, min: 0, max: 32, uiLabel: 'RMBG Concurrency', uiTip: '0 = auto-detect from system RAM; >0 = fixed ONNX slot count', uiGroup: 'RMBG' },
    { key: 'viewPromptOverride', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'heroPromptOverride', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'evalPromptOverride', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'heroEvalPromptOverride', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'evalViewCriteria_top', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'evalViewCriteria_bottom', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'evalViewCriteria_left', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'evalViewCriteria_right', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'evalViewCriteria_front', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'evalViewCriteria_rear', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'evalViewCriteria_sangle', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'evalViewCriteria_angle', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'heroEvalCriteria', type: 'string', default: "", allowEmpty: true, hidden: true },
  ],
  'releaseDateFinder': [
    { key: 'discoveryPromptTemplate', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'perVariantAttemptBudget', type: 'int', default: 1, min: 1, max: 5, uiLabel: 'Per-Variant Attempt Budget', uiTip: 'LLM calls per variant before giving up. 1 = one shot; higher values enable retries with widening query strategy.', uiGroup: 'Discovery' },
    { key: 'minConfidence', type: 'int', default: 70, min: 0, max: 100, uiLabel: 'Min Confidence', uiTip: 'Minimum LLM confidence score (0-100) to accept a date candidate. Below this, the variant run is marked unknown.', uiGroup: 'Discovery' },
  ],
};
