// WHY: O(1) codegen — reads Zod schemas from the backend SSOT and generates
// plain TypeScript interfaces for the GUI frontend. No Zod runtime in the GUI.
// Run: node scripts/generate-studio-types.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FieldRuleSchema,
  StudioPayloadSchema,
  PriorityProfileSchema,
  AiAssistConfigSchema,
  ComponentSourcePropertySchema,
  ComponentSourceSchema,
  EnumEntrySchema,
  StudioConfigSchema,
  FieldStudioMapResponseSchema,
  TooltipBankResponseSchema,
  ArtifactEntrySchema,
  KnownValuesResponseSchema,
  ComponentDbItemSchema,
  ComponentDbResponseSchema,
} from '../src/features/studio/contracts/studioSchemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TYPES = [
  ['FieldRule', FieldRuleSchema],
  ['PriorityProfile', PriorityProfileSchema],
  ['AiAssistConfig', AiAssistConfigSchema],
  ['ComponentSourceProperty', ComponentSourcePropertySchema],
  ['ComponentSource', ComponentSourceSchema],
  ['EnumEntry', EnumEntrySchema],
  ['StudioConfig', StudioConfigSchema],
  ['StudioPayload', StudioPayloadSchema],
  ['FieldStudioMapResponse', FieldStudioMapResponseSchema],
  ['TooltipBankResponse', TooltipBankResponseSchema],
  ['ArtifactEntry', ArtifactEntrySchema],
  ['KnownValuesResponse', KnownValuesResponseSchema],
  ['ComponentDbItem', ComponentDbItemSchema],
];

const registry = new Map(TYPES.map(([name, schema]) => [schema, name]));

function isOptional(schema) {
  if (schema.constructor.name === 'ZodOptional') return true;
  if (schema.constructor.name === 'ZodNullable') return isOptional(schema._def.innerType);
  return false;
}

function isNullable(schema) {
  if (schema.constructor.name === 'ZodNullable') return true;
  if (schema.constructor.name === 'ZodOptional') return isNullable(schema._def.innerType);
  return false;
}

function unwrap(schema) {
  const n = schema.constructor.name;
  if (n === 'ZodOptional' || n === 'ZodNullable') return unwrap(schema._def.innerType);
  return schema;
}

function hasPassthrough(schema) {
  return schema._def?.catchall?.constructor?.name === 'ZodUnknown';
}

function zodToTs(schema, indent = '  ') {
  if (registry.has(schema)) return registry.get(schema);
  const n = schema.constructor.name;
  if (n === 'ZodString') return 'string';
  if (n === 'ZodNumber') return 'number';
  if (n === 'ZodBoolean') return 'boolean';
  if (n === 'ZodNull') return 'null';
  if (n === 'ZodUnknown') return 'unknown';
  if (n === 'ZodOptional') return zodToTs(schema._def.innerType, indent);
  if (n === 'ZodNullable') return `${zodToTs(schema._def.innerType, indent)} | null`;
  if (n === 'ZodArray') return `${zodToTs(schema._def.element, indent)}[]`;
  if (n === 'ZodEnum') return schema.options.map(v => `'${v}'`).join(' | ');
  if (n === 'ZodRecord') return `Record<string, ${zodToTs(schema._def.valueType, indent)}>`;
  if (n === 'ZodObject') return inlineObject(schema, indent);
  return 'unknown';
}

function inlineObject(schema, indent) {
  const lines = ['{'];
  for (const [key, field] of Object.entries(schema.shape)) {
    const opt = isOptional(field) ? '?' : '';
    const inner = unwrap(field);
    let ts = zodToTs(inner, indent + '  ');
    if (isNullable(field)) ts += ' | null';
    lines.push(`${indent}  ${key}${opt}: ${ts};`);
  }
  if (hasPassthrough(schema)) lines.push(`${indent}  [k: string]: unknown;`);
  lines.push(`${indent}}`);
  return lines.join('\n');
}

function generateInterface(name, schema) {
  const lines = [`export interface ${name} {`];
  for (const [key, field] of Object.entries(schema.shape)) {
    const opt = isOptional(field) ? '?' : '';
    const inner = unwrap(field);
    let ts = zodToTs(inner, '  ');
    if (isNullable(field)) ts += ' | null';
    lines.push(`  ${key}${opt}: ${ts};`);
  }
  if (hasPassthrough(schema)) lines.push('  [k: string]: unknown;');
  lines.push('}');
  return lines.join('\n');
}

const output = [
  '// GENERATED from src/features/studio/contracts/studioSchemas.js',
  '// Do not edit manually. Run: node scripts/generate-studio-types.js',
  '',
];

for (const [name, schema] of TYPES) {
  output.push(generateInterface(name, schema));
  output.push('');
}

output.push('export type ComponentDbResponse = Record<string, ComponentDbItem[]>;');
output.push('');

const outPath = path.resolve(__dirname, '../tools/gui-react/src/types/studio.ts');
fs.writeFileSync(outPath, output.join('\n'));
console.log(`Generated ${outPath}`);
