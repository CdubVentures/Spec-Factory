// WHY: Type declaration for the JS ESM field-rule schema registry, consumed by GUI TypeScript.

export type FieldRuleKind =
  | 'enum'
  | 'string'
  | 'integer'
  | 'number-nullable'
  | 'boolean'
  | 'string-list'
  | 'ordered-list'
  | 'constraint-list'
  | 'component-ref'
  | 'enum-or-freeform'
  | 'prose'
  | 'group-ref';

export interface FieldRuleSchemaEntry {
  path: string;
  label: string;
  kind: FieldRuleKind;
  options?: readonly string[];
  appliesWhen?: Readonly<Record<string, string | readonly string[]>>;
  doc: string;
  studioTipKey?: string;
  studioTip?: string;
  studioTogglePath?: string;
  studioControlLabel?: string;
  studioAriaLabel?: string;
  studioFallback?: string | number | boolean;
  studioLegacyPath?: string;
  studioOptions?: readonly string[];
  studioWidget?: string;
  studioDefault?: readonly string[];
  studioPlaceholder?: string;
  studioSuggestionsKey?: string;
  studioOptionLabels?: readonly string[];
  studioTrueDescription?: string;
  studioFalseDescription?: string;
  studioTrueAriaLabel?: string;
  studioFalseAriaLabel?: string;
}

export interface FieldRuleAiAssistToggleControl {
  path: string;
  label: string;
  ariaLabel: string;
  tooltipKey: string;
}

export interface FieldRulePriorityControl {
  path: string;
  label: string;
  legacyPath: string;
  fallback: string;
  tooltipKey: string;
  options: readonly string[];
}

export interface FieldRuleEvidenceControl {
  path: string;
  label: string;
  tooltipKey: string;
  widget: string;
  legacyPath?: string;
  ariaLabel?: string;
  defaultValue?: readonly string[];
  options?: readonly string[];
}

export interface FieldRuleSearchHintControl {
  path: string;
  label: string;
  tooltipKey: string;
  placeholder: string;
  suggestionsKey?: string;
}

export interface FieldRuleConstraintControl {
  path: string;
  label: string;
}

export interface FieldRuleComponentTypeControl {
  path: string;
  label: string;
  tooltipKey: string;
}

export interface FieldRuleContractDependencyControl {
  path: string;
  label: string;
  trueDescription: string;
  falseDescription: string;
  trueAriaLabel: string;
  falseAriaLabel: string;
}

export interface FieldRuleStudioControl {
  path: string;
  label: string;
  tooltipKey?: string;
  widget: string;
  fallback?: string | number | boolean;
  options?: readonly string[];
  optionLabels?: readonly string[];
  placeholder?: string;
}

export const FIELD_RULE_KINDS: ReadonlySet<FieldRuleKind>;

export const FIELD_RULE_SCHEMA: readonly FieldRuleSchemaEntry[];

export const FIELD_RULE_STUDIO_TIPS: Readonly<Record<string, string>>;

export const FIELD_RULE_AI_ASSIST_TOGGLE_CONTROLS: readonly FieldRuleAiAssistToggleControl[];

export const FIELD_RULE_PRIORITY_CONTROLS: readonly FieldRulePriorityControl[];

export const FIELD_RULE_EVIDENCE_CONTROLS: readonly FieldRuleEvidenceControl[];

export const FIELD_RULE_SEARCH_HINT_CONTROLS: readonly FieldRuleSearchHintControl[];

export const FIELD_RULE_CONSTRAINT_CONTROL: Readonly<FieldRuleConstraintControl>;

export const FIELD_RULE_COMPONENT_TYPE_CONTROL: Readonly<FieldRuleComponentTypeControl>;

export const FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS: readonly FieldRuleContractDependencyControl[];

export const FIELD_RULE_CONTRACT_CONTROLS: readonly FieldRuleStudioControl[];

export const FIELD_RULE_ENUM_CONTROLS: readonly FieldRuleStudioControl[];
