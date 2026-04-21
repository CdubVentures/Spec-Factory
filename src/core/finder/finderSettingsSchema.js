import { z } from 'zod';

const commonFields = {
  key: z.string().min(1),
  uiLabel: z.string().optional(),
  uiTip: z.string().optional(),
  uiGroup: z.string().optional(),
  uiHero: z.boolean().optional(),
  uiRightPanel: z.boolean().optional(),
  secret: z.boolean().optional(),
  disabledBy: z.string().optional(),
  allowEmpty: z.boolean().optional(),
  hidden: z.boolean().optional(),
  widget: z.string().min(1).optional(),
  widgetProps: z.record(z.string(), z.unknown()).optional(),
};

const boolEntry = z.object({
  ...commonFields,
  type: z.literal('bool'),
  default: z.boolean(),
});

const intEntry = z.object({
  ...commonFields,
  type: z.literal('int'),
  default: z.number().int(),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
});

const floatEntry = z.object({
  ...commonFields,
  type: z.literal('float'),
  default: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
});

const stringEntry = z.object({
  ...commonFields,
  type: z.literal('string'),
  default: z.string(),
});

const enumEntry = z
  .object({
    ...commonFields,
    type: z.literal('enum'),
    default: z.string(),
    allowed: z.array(z.string()).min(1),
    optionLabels: z.record(z.string(), z.string()).optional(),
  })
  .refine((e) => e.allowed.includes(e.default), {
    message: 'enum default must be one of allowed values',
    path: ['default'],
  })
  .refine(
    (e) => {
      if (!e.optionLabels) return true;
      const allowed = new Set(e.allowed);
      return Object.keys(e.optionLabels).every((k) => allowed.has(k));
    },
    { message: 'enum optionLabels keys must all appear in allowed', path: ['optionLabels'] },
  );

const intMapEntry = z
  .object({
    ...commonFields,
    type: z.literal('intMap'),
    keys: z.array(z.string().min(1)).min(1),
    keyLabels: z.record(z.string(), z.string()),
    default: z.record(z.string(), z.number().int()),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  })
  .refine(
    (e) => {
      const declared = new Set(e.keys);
      const labels = Object.keys(e.keyLabels);
      return labels.length === declared.size && labels.every((k) => declared.has(k));
    },
    { message: 'intMap keyLabels must have exactly the keys declared in keys', path: ['keyLabels'] },
  )
  .refine(
    (e) => {
      const declared = new Set(e.keys);
      const defaults = Object.keys(e.default);
      return defaults.length === declared.size && defaults.every((k) => declared.has(k));
    },
    { message: 'intMap default must have exactly the keys declared in keys', path: ['default'] },
  )
  .refine(
    (e) => (e.min === undefined ? true : Object.values(e.default).every((v) => v >= e.min)),
    { message: 'intMap default value is below declared min', path: ['default'] },
  )
  .refine(
    (e) => (e.max === undefined ? true : Object.values(e.default).every((v) => v <= e.max)),
    { message: 'intMap default value is above declared max', path: ['default'] },
  );

export const finderSettingsEntrySchema = z.discriminatedUnion('type', [
  boolEntry,
  intEntry,
  floatEntry,
  stringEntry,
  enumEntry,
  intMapEntry,
]);

export const finderSettingsSchema = z.array(finderSettingsEntrySchema);

export function validateFinderSettingsSchema(schema) {
  return finderSettingsSchema.parse(schema);
}

export function deriveFinderSettingsDefaults(schema) {
  const entries = finderSettingsSchema.parse(schema);
  const result = {};
  for (const entry of entries) {
    switch (entry.type) {
      case 'bool':
        result[entry.key] = entry.default ? 'true' : 'false';
        break;
      case 'int':
      case 'float':
        result[entry.key] = String(entry.default);
        break;
      case 'string':
      case 'enum':
        result[entry.key] = entry.default;
        break;
      case 'intMap': {
        // WHY: serialize in declared key order, not object-literal order, so the
        // stored JSON string is stable across environments and hash-comparable.
        const ordered = {};
        for (const k of entry.keys) ordered[k] = entry.default[k];
        result[entry.key] = JSON.stringify(ordered);
        break;
      }
    }
  }
  return result;
}
