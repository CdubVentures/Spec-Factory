import type {
  DataListEntry,
  EnumEntry,
  FieldRule,
} from '../../../types/studio.ts';

export interface StudioEnumDataListEntry {
  field: string;
  label?: string;
  normalize: string;
  delimiter: string;
  manual_values: string[];
}

export interface DeriveStudioEnumDataListsInput {
  rawEnumLists: readonly (DataListEntry | EnumEntry)[];
  rules: Record<string, FieldRule>;
  egLockedKeys: readonly string[];
  knownValues: Record<string, string[]>;
}

const KEY_MATCHED_ENUM_POLICIES = new Set([
  'closed',
  'closed_with_curation',
  'open_prefer_known',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeToken(value: unknown): string {
  return String(value || '').trim();
}

function humanizeFieldKey(field: string): string {
  return field
    .split('_')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function labelOfField(
  field: string,
  rules: Record<string, FieldRule>,
): string {
  const rule = rules[field];
  const uiBlock = isRecord(rule?.ui) ? rule.ui : {};
  return normalizeToken(uiBlock.label || rule?.label) || humanizeFieldKey(field);
}

function enumPolicyOf(rule: FieldRule): string {
  const enumBlock = isRecord(rule.enum) ? rule.enum : {};
  return normalizeToken(rule.enum_policy || enumBlock.policy);
}

function enumSourceOf(rule: FieldRule): unknown {
  const enumBlock = isRecord(rule.enum) ? rule.enum : {};
  return rule.enum_source ?? enumBlock.source;
}

function isNonDataListEnumSource(source: unknown): boolean {
  if (typeof source === 'string') {
    const normalized = source.trim();
    return normalized === 'yes_no' || normalized.startsWith('component_db.');
  }
  if (!isRecord(source)) return false;
  const sourceType = normalizeToken(source.type);
  const sourceRef = normalizeToken(source.ref);
  return sourceType === 'component_db' || sourceRef === 'yes_no';
}

function enumSourceToken(source: unknown): string {
  if (typeof source === 'string') return source.trim();
  if (!isRecord(source)) return '';
  return [
    normalizeToken(source.type),
    normalizeToken(source.ref),
  ].join(':');
}

function valuesOf(entry: DataListEntry | EnumEntry): string[] {
  if (Array.isArray(entry.values)) return entry.values.map(String);
  if (Array.isArray(entry.manual_values)) return entry.manual_values.map(String);
  return [];
}

function normalizeEntry(
  entry: DataListEntry | EnumEntry,
  rules: Record<string, FieldRule>,
): StudioEnumDataListEntry | null {
  const field = normalizeToken(entry.field);
  if (!field) return null;
  return {
    field,
    label: labelOfField(field, rules),
    normalize: normalizeToken(entry.normalize) || 'lower_trim',
    delimiter: normalizeToken(entry.delimiter),
    manual_values: valuesOf(entry),
  };
}

function sortEnumDataLists(
  entries: StudioEnumDataListEntry[],
): StudioEnumDataListEntry[] {
  return [...entries].sort((left, right) =>
    (left.label || humanizeFieldKey(left.field)).localeCompare(
      right.label || humanizeFieldKey(right.field),
      undefined,
      { sensitivity: 'base' },
    ) || left.field.localeCompare(right.field, undefined, { sensitivity: 'base' }),
  );
}

export function deriveStudioEnumDataLists({
  rawEnumLists,
  rules,
  egLockedKeys,
  knownValues,
}: DeriveStudioEnumDataListsInput): StudioEnumDataListEntry[] {
  const entries = new Map<string, StudioEnumDataListEntry>();
  for (const rawEntry of rawEnumLists) {
    const entry = normalizeEntry(rawEntry, rules);
    if (entry) entries.set(entry.field, entry);
  }

  for (const [fieldKey, rule] of Object.entries(rules || {})) {
    const field = normalizeToken(fieldKey);
    if (!field || entries.has(field)) continue;
    const policy = enumPolicyOf(rule);
    if (!KEY_MATCHED_ENUM_POLICIES.has(policy)) continue;
    if (isNonDataListEnumSource(enumSourceOf(rule))) continue;
    entries.set(field, {
      field,
      label: labelOfField(field, rules),
      normalize: 'lower_trim',
      delimiter: '',
      manual_values: [],
    });
  }

  for (const egKey of egLockedKeys) {
    const field = normalizeToken(egKey);
    if (!field || entries.has(field)) continue;
    const egValues = knownValues[field];
    if (!Array.isArray(egValues) || egValues.length === 0) continue;
    entries.set(field, {
      field,
      label: labelOfField(field, rules),
      normalize: 'lower_trim',
      delimiter: '',
      manual_values: egValues.map(String),
    });
  }

  return sortEnumDataLists(Array.from(entries.values()));
}

export function buildStudioEnumDataListSeedVersion({
  rawEnumLists,
  rules,
  egLockedKeys,
  knownValues,
}: DeriveStudioEnumDataListsInput): string {
  const rawTokens = rawEnumLists
    .map((entry) => [
      normalizeToken(entry.field),
      normalizeToken(entry.normalize),
      normalizeToken(entry.delimiter),
      valuesOf(entry).join('\u001f'),
    ].join(':'))
    .sort();
  const ruleTokens = Object.entries(rules || {})
    .map(([fieldKey, rule]) => [
      normalizeToken(fieldKey),
      labelOfField(normalizeToken(fieldKey), rules),
      enumPolicyOf(rule),
      enumSourceToken(enumSourceOf(rule)),
    ].join(':'))
    .sort();
  const egTokens = egLockedKeys
    .map((field) => [
      normalizeToken(field),
      Array.isArray(knownValues[field]) ? knownValues[field].map(String).join('\u001f') : '',
    ].join(':'))
    .sort();
  return [rawTokens.join('|'), ruleTokens.join('|'), egTokens.join('|')].join('||');
}
