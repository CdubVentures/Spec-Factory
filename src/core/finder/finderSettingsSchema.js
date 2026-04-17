import { z } from 'zod';

const commonFields = {
  key: z.string().min(1),
  uiLabel: z.string().optional(),
  uiTip: z.string().optional(),
  uiGroup: z.string().optional(),
  uiHero: z.boolean().optional(),
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
  })
  .refine((e) => e.allowed.includes(e.default), {
    message: 'enum default must be one of allowed values',
    path: ['default'],
  });

export const finderSettingsEntrySchema = z.discriminatedUnion('type', [
  boolEntry,
  intEntry,
  floatEntry,
  stringEntry,
  enumEntry,
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
    }
  }
  return result;
}
