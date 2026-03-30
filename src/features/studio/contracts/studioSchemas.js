// WHY: O(1) Feature Scaling — SSOT for all studio shape contracts.
// API response schemas are strict envelopes. Domain schemas use .passthrough()
// for open-ended objects matching [k: string]: unknown in the TS interfaces.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Leaf domain schemas (dependencies of API schemas)
// ---------------------------------------------------------------------------

export const PriorityProfileSchema = z.object({
  required_level: z.string().optional(),
  availability: z.string().optional(),
  difficulty: z.string().optional(),
  effort: z.number().optional(),
});

export const AiAssistConfigSchema = z.object({
  mode: z.string().nullable().optional(),
  model_strategy: z.string().optional(),
  max_calls: z.number().nullable().optional(),
  max_tokens: z.number().nullable().optional(),
  reasoning_note: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Composed domain schemas (.passthrough for [k: string]: unknown)
// ---------------------------------------------------------------------------

export const FieldRuleSchema = z.object({
  key: z.string().optional(),
  label: z.string().optional(),
  group: z.string().optional(),
  required_level: z.string().optional(),
  contract: z.object({
    type: z.string().optional(),
    unit: z.string().nullable().optional(),
    shape: z.string().optional(),
  }).passthrough().optional(),
  parse: z.object({
    template: z.string().optional(),
  }).passthrough().optional(),
  constraints: z.array(z.string()).optional(),
  enum_name: z.string().optional(),
  ui: z.object({
    group: z.string().optional(),
    label: z.string().optional(),
    order: z.number().optional(),
    aliases: z.array(z.string()).optional(),
  }).passthrough().optional(),
}).passthrough();

export const EnumEntrySchema = z.object({
  field: z.string(),
  normalize: z.string().optional(),
  values: z.array(z.string()).optional(),
  delimiter: z.string().optional(),
  manual_values: z.array(z.string()).optional(),
  priority: PriorityProfileSchema.optional(),
  ai_assist: AiAssistConfigSchema.optional(),
}).passthrough();

export const ComponentSourcePropertySchema = z.object({
  field_key: z.string().optional(),
  variance_policy: z.enum([
    'authoritative', 'upper_bound', 'lower_bound', 'range', 'override_allowed',
  ]).optional(),
  tolerance: z.number().nullable().optional(),
  constraints: z.array(z.string()).optional(),
}).passthrough();

export const ComponentSourceSchema = z.object({
  type: z.string().optional(),
  component_type: z.string().optional(),
  roles: z.object({
    maker: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    links: z.array(z.string()).optional(),
    properties: z.array(ComponentSourcePropertySchema).optional(),
  }).passthrough().optional(),
  priority: PriorityProfileSchema.optional(),
  ai_assist: AiAssistConfigSchema.optional(),
}).passthrough();

export const StudioConfigSchema = z.object({
  version: z.number().optional(),
  tooltip_source: z.object({
    path: z.string().optional(),
  }).passthrough().optional(),
  component_sources: z.array(ComponentSourceSchema).optional(),
  enum_lists: z.array(EnumEntrySchema).optional(),
  selected_keys: z.array(z.string()).optional(),
  field_overrides: z.record(z.string(), z.unknown()).optional(),
  manual_enum_values: z.record(z.string(), z.array(z.string())).optional(),
  expectations: z.record(z.string(), z.unknown()).optional(),
  identity: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// API response schemas (strict envelopes)
// ---------------------------------------------------------------------------

export const StudioPayloadSchema = z.object({
  category: z.string(),
  fieldRules: z.record(z.string(), FieldRuleSchema),
  fieldOrder: z.array(z.string()),
  uiFieldCatalog: z.record(z.string(), z.unknown()).nullable(),
  guardrails: z.record(z.string(), z.unknown()).nullable(),
  compiledAt: z.string().nullable(),
  mapSavedAt: z.string().nullable(),
  compileStale: z.boolean(),
});

// WHY: .passthrough() — choosePreferredStudioMap returns raw objects with pass-through keys
export const FieldStudioMapResponseSchema = z.object({
  file_path: z.string(),
  map: StudioConfigSchema,
  error: z.string().optional(),
}).passthrough();

export const TooltipBankResponseSchema = z.object({
  entries: z.record(z.string(), z.unknown()),
  files: z.array(z.string()),
  configuredPath: z.string(),
});

export const ArtifactEntrySchema = z.object({
  name: z.string(),
  size: z.number(),
  updated: z.string(),
});

export const KnownValuesResponseSchema = z.object({
  category: z.string(),
  source: z.string().nullable(),
  fields: z.record(z.string(), z.array(z.string())),
  enum_lists: z.array(EnumEntrySchema),
});

export const ComponentDbItemSchema = z.object({
  name: z.string(),
  maker: z.string(),
  aliases: z.array(z.string()),
});

export const ComponentDbResponseSchema = z.record(
  z.string(),
  z.array(ComponentDbItemSchema),
);

// ---------------------------------------------------------------------------
// Derived key arrays (O(1) — replaces studioShapes.js)
// ---------------------------------------------------------------------------

export const STUDIO_PAYLOAD_KEYS = Object.freeze(Object.keys(StudioPayloadSchema.shape));
export const FIELD_STUDIO_MAP_RESPONSE_KEYS = Object.freeze(Object.keys(FieldStudioMapResponseSchema.shape));
export const TOOLTIP_BANK_RESPONSE_KEYS = Object.freeze(Object.keys(TooltipBankResponseSchema.shape));
export const ARTIFACT_ENTRY_KEYS = Object.freeze(Object.keys(ArtifactEntrySchema.shape));
export const KNOWN_VALUES_RESPONSE_KEYS = Object.freeze(Object.keys(KnownValuesResponseSchema.shape));
export const COMPONENT_DB_ITEM_KEYS = Object.freeze(Object.keys(ComponentDbItemSchema.shape));
