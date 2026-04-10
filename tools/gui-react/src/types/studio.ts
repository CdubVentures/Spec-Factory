// GENERATED from src/features/studio/contracts/studioSchemas.js
// Do not edit manually. Run: node scripts/generate-studio-types.js

export interface FieldRule {
  key?: string;
  label?: string;
  group?: string;
  required_level?: string;
  contract?: {
    type?: string;
    unit?: string | null;
    shape?: string;
    [k: string]: unknown;
  };
  parse?: {
    template?: string;
    [k: string]: unknown;
  };
  constraints?: string[];
  enum_name?: string;
  ui?: {
    group?: string;
    label?: string;
    order?: number;
    aliases?: string[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface PriorityProfile {
  required_level?: string;
  availability?: string;
  difficulty?: string;
  effort?: number;
}

export interface AiAssistConfig {
  mode?: string | null;
  model_strategy?: string;
  max_calls?: number | null;
  max_tokens?: number | null;
  reasoning_note?: string;
}

export interface ComponentSourceProperty {
  field_key?: string;
  variance_policy?: 'authoritative' | 'upper_bound' | 'lower_bound' | 'range' | 'override_allowed';
  tolerance?: number | null;
  constraints?: string[];
  [k: string]: unknown;
}

export interface ComponentSource {
  type?: string;
  component_type?: string;
  roles?: {
    maker?: string;
    aliases?: string[];
    links?: string[];
    properties?: ComponentSourceProperty[];
    [k: string]: unknown;
  };
  priority?: PriorityProfile;
  ai_assist?: AiAssistConfig;
  [k: string]: unknown;
}

export interface EnumEntry {
  field: string;
  normalize?: string;
  values?: string[];
  delimiter?: string;
  manual_values?: string[];
  priority?: PriorityProfile;
  ai_assist?: AiAssistConfig;
  [k: string]: unknown;
}

export interface DataListEntry {
  field: string;
  normalize?: string;
  delimiter?: string;
  manual_values?: string[];
  priority?: PriorityProfile;
  ai_assist?: AiAssistConfig;
  mode?: string;
  sheet?: string;
  value_column?: string;
  header_row?: number;
  row_start?: number;
  row_end?: number;
  [k: string]: unknown;
}

export interface StudioConfig {
  version?: number;
  tooltip_source?: {
    path?: string;
    [k: string]: unknown;
  };
  component_sources?: ComponentSource[];
  enum_lists?: EnumEntry[];
  data_lists?: DataListEntry[];
  selected_keys?: string[];
  field_overrides?: Record<string, unknown>;
  expectations?: Record<string, unknown>;
  field_groups?: string[];
  identity?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface StudioPayload {
  category: string;
  fieldRules: Record<string, FieldRule>;
  fieldOrder: string[];
  uiFieldCatalog: Record<string, unknown> | null;
  guardrails: Record<string, unknown> | null;
  compiledAt: string | null;
  mapSavedAt: string | null;
  compileStale: boolean;
  egLockedKeys?: string[];
  egEditablePaths?: string[];
  egToggles?: Record<string, boolean>;
  registeredColors?: string[];
}

export interface FieldStudioMapResponse {
  file_path: string;
  map: StudioConfig;
  error?: string;
  [k: string]: unknown;
}

export interface TooltipBankResponse {
  entries: Record<string, unknown>;
  files: string[];
  configuredPath: string;
}

export interface ArtifactEntry {
  name: string;
  size: number;
  updated: string;
}

export interface KnownValuesResponse {
  category: string;
  source: string | null;
  fields: Record<string, string[]>;
  enum_lists: EnumEntry[];
}

export interface ComponentDbItem {
  name: string;
  maker: string;
  aliases: string[];
}

export type ComponentDbResponse = Record<string, ComponentDbItem[]>;
