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
    { key: 'urlHistoryEnabled', type: 'bool', default: false, uiLabel: 'URL history', uiTip: 'When on, prior run URLs are injected into the prompt so the LLM can avoid re-crawling them. Product-scoped for CEF. Off by default.', uiGroup: 'Discovery History' },
    { key: 'queryHistoryEnabled', type: 'bool', default: false, uiLabel: 'Query history', uiTip: 'When on, prior run search queries are injected into the prompt. Off by default — queries rot faster than URLs.', uiGroup: 'Discovery History' },
  ],
  'productImageFinder': [
    { key: 'satisfactionThreshold', type: 'int', default: 3, min: 1, max: 20, uiLabel: 'Satisfaction Threshold', uiTip: 'Quality images per view required before that view is "satisfied"', uiGroup: 'Carousel Strategy (Loop Run)' },
    { key: 'viewBudget', type: 'string', default: "", uiLabel: 'View Budget', uiTip: 'Active views + per-view attempt budgets. Empty = category defaults.', uiGroup: 'Carousel Strategy (Loop Run)', allowEmpty: true, widget: 'viewBudget', widgetProps: {"childKeys":["viewAttemptBudget","viewAttemptBudgets"]} },
    { key: 'viewAttemptBudget', type: 'int', default: 5, min: 1, max: 50, uiLabel: 'Default View Attempt Budget', uiTip: 'Max LLM calls per view on the first Loop. Each call targets one priority view; images for other views are kept as side-catches. A view stops when it collects Satisfaction Threshold quality images OR this budget is exhausted. Plain "Run" ignores this — Run is single-shot across all priority views.', uiGroup: 'Carousel Strategy (Loop Run)' },
    { key: 'viewAttemptBudgets', type: 'string', default: "", uiLabel: 'Per-View Attempt Budgets (JSON)', uiTip: 'JSON overrides per view (e.g. {"top":8,"left":3}). Any view not listed falls back to Default View Attempt Budget.', uiGroup: 'Carousel Strategy (Loop Run)', allowEmpty: true },
    { key: 'reRunBudget', type: 'int', default: 1, min: 0, max: 5, uiLabel: 'Re-run Budget', uiTip: 'Extra LLM calls per view when you click Loop again on an already-satisfied variant. 0 = skip satisfied views entirely (no LLM call); Loop moves straight to unsatisfied views or hero. 1+ = allow N more targeted calls per satisfied view to fill gaps. Ignored on the first Loop.', uiGroup: 'Carousel Strategy (Loop Run)' },
    { key: 'heroEnabled', type: 'bool', default: true, uiLabel: 'Hero Slots Enabled', uiGroup: 'Hero Slots' },
    { key: 'heroCount', type: 'int', default: 3, min: 1, max: 20, uiLabel: 'Hero Count', uiGroup: 'Hero Slots', disabledBy: 'heroEnabled' },
    { key: 'heroAttemptBudget', type: 'int', default: 3, min: 1, max: 20, uiLabel: 'Hero Attempt Budget', uiGroup: 'Hero Slots', disabledBy: 'heroEnabled' },
    { key: 'viewConfig', type: 'string', default: "", uiLabel: 'View Configuration', uiTip: 'Priority order and descriptions per view. Empty = category defaults.', uiGroup: 'Views (Single Run)', allowEmpty: true, widget: 'viewConfig' },
    { key: 'singleRunSecondaryHints', type: 'string', default: "", uiLabel: 'Single Run Secondary Hints', uiTip: 'Views mentioned in the ADDITIONAL section of single-run prompts (besides the priority views). Empty = none.', uiGroup: 'Prompt Hints', allowEmpty: true, widget: 'viewHintsList' },
    { key: 'loopRunSecondaryHints', type: 'string', default: "", uiLabel: 'Loop Run Secondary Hints', uiTip: 'Views mentioned in the ADDITIONAL section of loop-run prompts (besides the focus view). Empty = none.', uiGroup: 'Prompt Hints', allowEmpty: true, widget: 'viewHintsList' },
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
    { key: 'loopViewPrompt_top', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'loopViewPrompt_bottom', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'loopViewPrompt_left', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'loopViewPrompt_right', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'loopViewPrompt_front', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'loopViewPrompt_rear', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'loopViewPrompt_sangle', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'loopViewPrompt_angle', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'priorityViewPrompt_top', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'priorityViewPrompt_bottom', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'priorityViewPrompt_left', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'priorityViewPrompt_right', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'priorityViewPrompt_front', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'priorityViewPrompt_rear', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'priorityViewPrompt_sangle', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'priorityViewPrompt_angle', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'additionalViewPrompt_top', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'additionalViewPrompt_bottom', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'additionalViewPrompt_left', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'additionalViewPrompt_right', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'additionalViewPrompt_front', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'additionalViewPrompt_rear', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'additionalViewPrompt_sangle', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'additionalViewPrompt_angle', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'urlHistoryEnabled', type: 'bool', default: false, uiLabel: 'URL history', uiTip: 'When on, prior run URLs are injected into the prompt so the LLM can avoid re-crawling them. Scoped per variant per mode (view/hero). Off by default.', uiGroup: 'Discovery History' },
    { key: 'queryHistoryEnabled', type: 'bool', default: false, uiLabel: 'Query history', uiTip: 'When on, prior run search queries are injected into the prompt. Scoped per variant per mode. Off by default — queries rot faster than URLs.', uiGroup: 'Discovery History' },
  ],
  'releaseDateFinder': [
    { key: 'discoveryPromptTemplate', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'perVariantAttemptBudget', type: 'int', default: 3, min: 1, max: 5, uiLabel: 'Per-Variant Attempt Budget', uiTip: 'Max LLM calls per variant on the first Loop. 1 = single shot. Higher values retry until either (a) the publisher gate publishes the candidate, or (b) the LLM returns a definitive "unknown" with a reason. Only applies to "Loop" / "Loop All"; plain "Run" is always single-shot.', uiGroup: 'Discovery' },
    { key: 'reRunBudget', type: 'int', default: 1, min: 0, max: 5, uiLabel: 'Re-run Budget', uiTip: 'Extra LLM calls per variant when you click Loop again on an already-resolved variant. 0 = skip resolved variants entirely (no LLM call). 1+ = allow N more attempts to refine the date with new evidence. "Already-resolved" means the publisher has accepted a release_date for that variant. Ignored on the first Loop.', uiGroup: 'Discovery' },
    { key: 'urlHistoryEnabled', type: 'bool', default: false, uiLabel: 'URL history', uiTip: 'When on, prior run URLs are injected into the prompt so the LLM can avoid re-crawling them. Variant-scoped for RDF. Off by default.', uiGroup: 'Discovery History' },
    { key: 'queryHistoryEnabled', type: 'bool', default: false, uiLabel: 'Query history', uiTip: 'When on, prior run search queries are injected into the prompt. Off by default — queries rot faster than URLs.', uiGroup: 'Discovery History' },
  ],
};
