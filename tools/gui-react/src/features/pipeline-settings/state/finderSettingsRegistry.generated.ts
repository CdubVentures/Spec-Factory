// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

// WHY: Derived from src/core/finder/finderModuleRegistry.js
// Drives <FinderSettingsRenderer />. Each entry is a typed primitive (bool/int/float/string/enum),
// optionally rendered via a named widget registered in the GUI widget registry.

import type { SettingWidgetName } from '../components/widgets/widgetRegistryNames.ts';

export type FinderSettingType = 'bool' | 'int' | 'float' | 'string' | 'enum' | 'intMap';

export interface FinderSettingsEntry {
  key: string;
  type: FinderSettingType;
  default: boolean | number | string | Record<string, number>;
  min?: number;
  max?: number;
  allowed?: readonly string[];
  optionLabels?: Record<string, string>;
  keys?: readonly string[];
  keyLabels?: Record<string, string>;
  uiLabel?: string;
  uiTip?: string;
  uiGroup?: string;
  uiHero?: boolean;
  uiRightPanel?: boolean;
  secret?: boolean;
  disabledBy?: string;
  allowEmpty?: boolean;
  hidden?: boolean;
  scope?: 'global' | 'category';
  widget?: SettingWidgetName;
  widgetProps?: Record<string, unknown>;
}

export const FINDER_IDS_WITH_SETTINGS = ['colorEditionFinder', 'productImageFinder', 'releaseDateFinder', 'skuFinder', 'keyFinder'] as const;
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
    { key: 'carouselScoredViews', type: 'string', default: "", uiLabel: 'Carousel Views', uiTip: 'Check target views for the scored carousel denominator; placeholders can fill extra view slots.', uiGroup: 'Carousel Scoring', allowEmpty: true, widget: 'carouselScoring', widgetProps: {"childKeys":["carouselOptionalViews","carouselExtraTarget"]} },
    { key: 'carouselOptionalViews', type: 'string', default: "", uiLabel: 'Carousel Placeholder Views', uiTip: 'Canonical view placeholders that can fill/overfill the carousel count without increasing the scored-view denominator.', uiGroup: 'Carousel Scoring', allowEmpty: true },
    { key: 'carouselExtraTarget', type: 'int', default: 3, min: 0, max: 20, uiLabel: 'Additional Image Target', uiTip: 'Inner-ring target for additional non-scored carousel images. Filled extras can exceed this target.', uiGroup: 'Carousel Scoring' },
    { key: 'heroEnabled', type: 'bool', default: true, uiLabel: 'Hero Slots Enabled', uiGroup: 'Hero Slots', scope: 'global' },
    { key: 'heroCount', type: 'int', default: 3, min: 1, max: 20, uiLabel: 'Hero Count', uiGroup: 'Hero Slots', disabledBy: 'heroEnabled', scope: 'global' },
    { key: 'heroAttemptBudget', type: 'int', default: 3, min: 1, max: 20, uiLabel: 'Hero Attempt Budget', uiGroup: 'Hero Slots', disabledBy: 'heroEnabled', scope: 'global' },
    { key: 'viewConfig', type: 'string', default: "", uiLabel: 'View Configuration', uiTip: 'Priority order and descriptions per view. Empty = category defaults.', uiGroup: 'Views (Single Run)', allowEmpty: true, widget: 'viewConfig' },
    { key: 'singleRunSecondaryHints', type: 'string', default: "", uiLabel: 'Priority View Run Secondary Hints', uiTip: 'Views mentioned in the ADDITIONAL section when the Priority View button runs (besides the priority views from View Configuration). Empty = none.', uiGroup: 'Prompt Hints', allowEmpty: true, widget: 'viewHintsList' },
    { key: 'individualViewRunSecondaryHints', type: 'string', default: "", uiLabel: 'Individual View Run Secondary Hints', uiTip: 'Views mentioned in the ADDITIONAL section when one of the per-view buttons (Top, Bottom, ...) runs (besides the focus view itself). Empty = none.', uiGroup: 'Prompt Hints', allowEmpty: true, widget: 'viewHintsList' },
    { key: 'loopRunSecondaryHints', type: 'string', default: "", uiLabel: 'Loop Run Secondary Hints', uiTip: 'Views mentioned in the ADDITIONAL section per Loop iteration (besides the focus view). Empty = none.', uiGroup: 'Prompt Hints', allowEmpty: true, widget: 'viewHintsList' },
    { key: 'priorityViewRunImageHistoryEnabled', type: 'bool', default: false, uiLabel: 'Priority View Run Image History', uiTip: 'Inject accepted image history for the variant into Priority View Run prompts. Exact duplicates are discouraged, but better versions, alternate crops, and different useful angles remain welcome.', uiGroup: 'Image History', scope: 'global' },
    { key: 'individualViewRunImageHistoryEnabled', type: 'bool', default: false, uiLabel: 'Individual View Run Image History', uiTip: 'Inject accepted image history for the variant into per-view button prompts. Exact duplicates are discouraged without blocking better versions or alternate angles.', uiGroup: 'Image History', scope: 'global' },
    { key: 'loopRunImageHistoryEnabled', type: 'bool', default: false, uiLabel: 'Loop Run Image History', uiTip: 'Inject accepted image history for the variant into Loop prompts across view and hero iterations.', uiGroup: 'Image History', scope: 'global' },
    { key: 'priorityViewRunLinkValidationEnabled', type: 'bool', default: false, uiLabel: 'Priority View Run Link Validation', uiTip: 'Inject the link-validation checklist and known candidate outcomes into Priority View Run prompts.', uiGroup: 'Link Validation', scope: 'global' },
    { key: 'individualViewRunLinkValidationEnabled', type: 'bool', default: false, uiLabel: 'Individual View Run Link Validation', uiTip: 'Inject the link-validation checklist and known candidate outcomes into per-view button prompts.', uiGroup: 'Link Validation', scope: 'global' },
    { key: 'loopRunLinkValidationEnabled', type: 'bool', default: false, uiLabel: 'Loop Run Link Validation', uiTip: 'Inject the link-validation checklist and known candidate outcomes into Loop prompts across view and hero iterations.', uiGroup: 'Link Validation', scope: 'global' },
    { key: 'minWidth', type: 'int', default: 800, min: 100, max: 8000, uiLabel: 'Min Width', uiGroup: 'Image Quality' },
    { key: 'minHeight', type: 'int', default: 600, min: 100, max: 8000, uiLabel: 'Min Height', uiGroup: 'Image Quality' },
    { key: 'minFileSize', type: 'int', default: 50000, min: 1000, max: 50000000, uiLabel: 'Min File Size (bytes)', uiGroup: 'Image Quality' },
    { key: 'viewQualityConfig', type: 'string', default: "", uiLabel: 'Per-View Quality', uiTip: 'Per-view overrides of the quality thresholds. Empty = category defaults.', uiGroup: 'Image Quality', allowEmpty: true, widget: 'viewQualityGrid' },
    { key: 'evalEnabled', type: 'bool', default: true, uiLabel: 'Vision Evaluator Enabled', uiGroup: 'Vision Evaluation', scope: 'global' },
    { key: 'evalThumbSize', type: 'int', default: 768, min: 256, max: 2048, uiLabel: 'Eval Thumbnail Size', uiTip: '512px tile boundary — 768 uses 4 tiles like 1024. Larger = more detail but more tokens.', uiGroup: 'Vision Evaluation', disabledBy: 'evalEnabled', scope: 'global', widget: 'evalThumbSize' },
    { key: 'evalHeroCount', type: 'int', default: 3, min: 1, max: 20, uiLabel: 'Eval Hero Count', uiGroup: 'Vision Evaluation', disabledBy: 'evalEnabled', scope: 'global' },
    { key: 'rmbgConcurrency', type: 'int', default: 0, min: 0, max: 32, uiLabel: 'RMBG Concurrency', uiTip: '0 = auto-detect from system RAM; >0 = fixed ONNX slot count', uiGroup: 'RMBG', scope: 'global' },
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
    { key: 'urlHistoryEnabled', type: 'bool', default: false, uiLabel: 'URL history', uiTip: 'When on, prior run URLs are injected into the prompt so the LLM can avoid re-crawling them. Scoped per variant per mode (view/hero). Off by default.', uiGroup: 'Discovery History', scope: 'global' },
    { key: 'queryHistoryEnabled', type: 'bool', default: false, uiLabel: 'Query history', uiTip: 'When on, prior run search queries are injected into the prompt. Scoped per variant per mode. Off by default — queries rot faster than URLs.', uiGroup: 'Discovery History', scope: 'global' },
  ],
  'releaseDateFinder': [
    { key: 'discoveryPromptTemplate', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'perVariantAttemptBudget', type: 'int', default: 3, min: 1, max: 5, uiLabel: 'Per-Variant Attempt Budget', uiTip: 'Max LLM calls per variant on the first Loop. 1 = single shot. Higher values retry until either (a) the publisher gate publishes the candidate, or (b) the LLM returns a definitive "unknown" with a reason. Only applies to "Loop" / "Loop All"; plain "Run" is always single-shot.', uiGroup: 'Discovery' },
    { key: 'reRunBudget', type: 'int', default: 1, min: 0, max: 5, uiLabel: 'Re-run Budget', uiTip: 'Extra LLM calls per variant when you click Loop again on an already-resolved variant. 0 = skip resolved variants entirely (no LLM call). 1+ = allow N more attempts to refine the date with new evidence. "Already-resolved" means the publisher has accepted a release_date for that variant. Ignored on the first Loop.', uiGroup: 'Discovery' },
    { key: 'urlHistoryEnabled', type: 'bool', default: false, uiLabel: 'URL history', uiTip: 'When on, prior run URLs are injected into the prompt so the LLM can avoid re-crawling them. Variant-scoped for RDF. Off by default.', uiGroup: 'Discovery History' },
    { key: 'queryHistoryEnabled', type: 'bool', default: false, uiLabel: 'Query history', uiTip: 'When on, prior run search queries are injected into the prompt. Off by default — queries rot faster than URLs.', uiGroup: 'Discovery History' },
  ],
  'skuFinder': [
    { key: 'discoveryPromptTemplate', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'perVariantAttemptBudget', type: 'int', default: 3, min: 1, max: 5, uiLabel: 'Per-Variant Attempt Budget', uiTip: 'Max LLM calls per variant on the first Loop. 1 = single shot. Higher values retry until either (a) the publisher gate publishes the candidate, or (b) the LLM returns a definitive "unknown" with a reason. Only applies to "Loop" / "Loop All"; plain "Run" is always single-shot.', uiGroup: 'Discovery' },
    { key: 'reRunBudget', type: 'int', default: 1, min: 0, max: 5, uiLabel: 'Re-run Budget', uiTip: 'Extra LLM calls per variant when you click Loop again on an already-resolved variant. 0 = skip resolved variants entirely (no LLM call). 1+ = allow N more attempts to refine the MPN with new evidence. "Already-resolved" means the publisher has accepted a sku for that variant. Ignored on the first Loop.', uiGroup: 'Discovery' },
    { key: 'urlHistoryEnabled', type: 'bool', default: false, uiLabel: 'URL history', uiTip: 'When on, prior run URLs are injected into the prompt so the LLM can avoid re-crawling them. Variant-scoped for SKF. Off by default.', uiGroup: 'Discovery History' },
    { key: 'queryHistoryEnabled', type: 'bool', default: false, uiLabel: 'Query history', uiTip: 'When on, prior run search queries are injected into the prompt. Off by default — queries rot faster than URLs.', uiGroup: 'Discovery History' },
  ],
  'keyFinder': [
    { key: 'discoveryPromptTemplate', type: 'string', default: "", allowEmpty: true, hidden: true },
    { key: 'budgetRequiredPoints', type: 'intMap', default: {"mandatory":2,"non_mandatory":1}, min: 0, max: 20, keys: ['mandatory', 'non_mandatory'] as const, keyLabels: {"mandatory":"Mandatory","non_mandatory":"Non-mandatory"}, uiLabel: 'Required level points', uiTip: 'Points contributed by each required-level tier when computing a key’s attempt budget.', uiGroup: 'Budget Scoring' },
    { key: 'budgetAvailabilityPoints', type: 'intMap', default: {"always":1,"sometimes":2,"rare":3}, min: 0, max: 20, keys: ['always', 'sometimes', 'rare'] as const, keyLabels: {"always":"Always","sometimes":"Sometimes","rare":"Rare"}, uiLabel: 'Availability points', uiTip: 'Points contributed by how often sources carry this field (rarer fields earn more retries).', uiGroup: 'Budget Scoring' },
    { key: 'budgetDifficultyPoints', type: 'intMap', default: {"easy":1,"medium":2,"hard":3,"very_hard":4}, min: 0, max: 20, keys: ['easy', 'medium', 'hard', 'very_hard'] as const, keyLabels: {"easy":"Easy","medium":"Medium","hard":"Hard","very_hard":"Very hard"}, uiLabel: 'Difficulty points', uiTip: 'Points contributed by extraction difficulty (harder reasoning earns more attempts).', uiGroup: 'Budget Scoring' },
    { key: 'budgetVariantPointsPerExtra', type: 'float', default: 0.25, min: 0, max: 10, uiLabel: 'Family points per extra', uiTip: 'Points added to the per-key attempt budget for each product-family member beyond the first. Product family is brand + base_model; CEF color/edition variants do not affect this count. Raw budget accrues the fractional value; final attempts = ceil(raw).', uiGroup: 'Budget Scoring' },
    { key: 'budgetFloor', type: 'int', default: 3, min: 1, max: 20, uiLabel: 'Budget floor', uiTip: 'Minimum per-key attempts, regardless of axis sum.', uiGroup: 'Budget Scoring' },
    { key: 'reloopRunBudget', type: 'int', default: 1, min: 0, max: 10, uiLabel: 'Re-loop budget (on already-published key)', uiTip: 'When Loop is clicked on a primary that is already published, attempts is capped to this value. Passengers still pack per the bundling knobs — this is the "Run + passengers with budget 1" shortcut. Set to 0 to disable the shortcut entirely; Loop on a published key returns final_status="skipped_resolved".', uiGroup: 'Budget Scoring' },
    { key: 'budgetPreviewDisplay', type: 'string', default: "", uiLabel: 'Live preview', uiTip: 'Computed attempt budgets for every difficulty × availability combination, split by required-level tier.', uiGroup: 'Budget Scoring', uiRightPanel: true, allowEmpty: true, widget: 'keyFinderBudgetPreview' },
    { key: 'bundlingEnabled', type: 'bool', default: false, uiLabel: 'Bundling', uiTip: 'Pack same-group passenger keys onto the primary call during Loop / Smart Loop. Off = single-key calls only.', uiGroup: 'Bundling' },
    { key: 'alwaysSoloRun', type: 'bool', default: true, uiLabel: 'Always solo Run', uiTip: 'When ON (default), per-key Run never packs passengers regardless of bundlingEnabled — that is the focused-key-run contract. Turn OFF to restore legacy bundled-Run behavior. Loop-mode ignores this knob and always packs when bundlingEnabled=true.', uiGroup: 'Bundling' },
    { key: 'groupBundlingOnly', type: 'bool', default: true, uiLabel: 'Group bundling only', uiTip: 'When ON, passengers must share the primary’s group. When OFF, bundling may reach across groups.', uiGroup: 'Bundling' },
    { key: 'bundlingPassengerCost', type: 'intMap', default: {"easy":1,"medium":2,"hard":4,"very_hard":8}, min: 0, max: 64, keys: ['easy', 'medium', 'hard', 'very_hard'] as const, keyLabels: {"easy":"Easy","medium":"Medium","hard":"Hard","very_hard":"Very hard"}, uiLabel: 'Passenger cost', uiTip: 'Base point cost to carry a passenger of each difficulty before family-size surcharge.', uiGroup: 'Bundling' },
    { key: 'bundlingPassengerVariantCostPerExtra', type: 'float', default: 0.25, min: 0, max: 10, uiLabel: 'Passenger family cost per extra', uiTip: 'Additional passenger-cost points added for each product-family member beyond the first. Product family is brand + base_model; CEF color/edition variants do not affect this count. Example: easy base cost 1 plus 0.25 means family size 2 costs 1.25, size 3 costs 1.5, size 4 costs 1.75.', uiGroup: 'Bundling' },
    { key: 'bundlingPoolPerPrimary', type: 'intMap', default: {"easy":6,"medium":4,"hard":2,"very_hard":1}, min: 0, max: 32, keys: ['easy', 'medium', 'hard', 'very_hard'] as const, keyLabels: {"easy":"Easy primary","medium":"Medium primary","hard":"Hard primary","very_hard":"Very hard primary"}, uiLabel: 'Primary pool', uiTip: 'Passenger-point budget each primary can carry. Higher = more passengers allowed; 0 = solo only.', uiGroup: 'Bundling' },
    { key: 'passengerDifficultyPolicy', type: 'enum', default: "less_or_equal", allowed: ['less_or_equal', 'same_only', 'any_but_very_hard', 'any_but_hard_very_hard'] as const, optionLabels: {"less_or_equal":"Same or easier than primary","same_only":"Same difficulty as primary","any_but_very_hard":"Any except very hard","any_but_hard_very_hard":"Any except hard and very hard"}, uiLabel: 'Passenger difficulty', uiTip: 'Which passenger difficulties are eligible to ride along with the primary key.', uiGroup: 'Bundling' },
    { key: 'passengerExcludeAtConfidence', type: 'int', default: 95, min: 0, max: 100, uiLabel: 'Exclude passengers at confidence ≥', uiTip: '"Good enough" exclusion. When > 0 AND Min evidence > 0, peers whose top candidate confidence is at or above this threshold AND meets the evidence minimum are dropped from the passenger pool. Below either threshold, peers keep retrying. 0 = disabled (only published peers are dropped).', uiGroup: 'Bundling' },
    { key: 'passengerExcludeMinEvidence', type: 'int', default: 3, min: 0, max: 50, uiLabel: 'Exclude passengers min evidence', uiTip: 'Companion to "Exclude passengers at confidence ≥". Evidence count (substantive, excluding identity_only refs) that a peer’s top candidate must reach alongside the confidence threshold to be excluded. Both knobs must be > 0 for the exclusion rule to engage.', uiGroup: 'Bundling' },
    { key: 'bundlingSortAxisOrder', type: 'string', default: "difficulty,required_level,availability", uiLabel: 'Bulk and bundling sort order', uiTip: 'Drag to reorder how passenger keys are packed and how Run Group, Run All Groups, Loop Group, and Loop All Groups dispatch keys. Each axis sorts ascending within itself (difficulty: easy < medium < hard < very_hard; required_level: mandatory < non_mandatory; availability: always < sometimes < rare). The first row is most significant. Default: difficulty first ("easy wins first"), required_level as tiebreaker, availability last. currentRides + field_key remain deterministic tiebreakers for passenger packing.', uiGroup: 'Bundling', widget: 'bundlingSortAxisOrder' },
    { key: 'bundlingOverlapCapEasy', type: 'int', default: 2, min: 0, max: 32, uiLabel: 'Overlap cap — easy', uiTip: 'Max concurrent passenger rides for easy peers before the packer skips them. Prevents wasting budget by sending the same easy key out as passenger on many simultaneous calls. 0 = never pack this tier as passenger.', uiGroup: 'Bundling' },
    { key: 'bundlingOverlapCapMedium', type: 'int', default: 4, min: 0, max: 32, uiLabel: 'Overlap cap — medium', uiTip: 'Max concurrent passenger rides for medium peers.', uiGroup: 'Bundling' },
    { key: 'bundlingOverlapCapHard', type: 'int', default: 6, min: 0, max: 32, uiLabel: 'Overlap cap — hard', uiTip: 'Max concurrent passenger rides for hard peers.', uiGroup: 'Bundling' },
    { key: 'bundlingOverlapCapVeryHard', type: 'int', default: 0, min: 0, max: 32, uiLabel: 'Overlap cap — very hard', uiTip: 'Max concurrent rides for very_hard peers. 0 = uncapped (distinct from easy/medium/hard where 0 means never pack). Very_hard peers are expensive; re-harvesting is always net-positive.', uiGroup: 'Bundling' },
    { key: 'componentInjectionEnabled', type: 'bool', default: true, uiLabel: 'Component values', uiTip: 'Inject a per-key relation pointer ("this key belongs to the sensor component" / "this key IS the sensor component identity") for the primary + each passenger. The component candidate table/resolved row context itself is always on for component runs - this only toggles the short per-key pointer.', uiGroup: 'Context Injection' },
    { key: 'knownFieldsInjectionEnabled', type: 'bool', default: true, uiLabel: 'Known fields', uiTip: 'Inject already-published non-component field values on this product as a shared context block.', uiGroup: 'Context Injection' },
    { key: 'searchHintsInjectionEnabled', type: 'bool', default: true, uiLabel: 'Search hints', uiTip: 'Inject domain_hints + query_terms for the PRIMARY key only (passengers inherit the primary session).', uiGroup: 'Context Injection' },
    { key: 'urlHistoryEnabled', type: 'bool', default: true, uiLabel: 'URL history', uiTip: 'Inject prior-run URLs for the PRIMARY key so the LLM avoids re-crawling them. Per-key scope for keyFinder (different from RDF/SKU variant scope). Passengers inherit the primary’s search session and do not get their own URL history dumps.', uiGroup: 'Discovery History (primary key only)' },
    { key: 'queryHistoryEnabled', type: 'bool', default: true, uiLabel: 'Query history', uiTip: 'Inject prior-run search queries for the PRIMARY key. Passengers inherit the primary’s search session.', uiGroup: 'Discovery History (primary key only)' },
  ],
};
