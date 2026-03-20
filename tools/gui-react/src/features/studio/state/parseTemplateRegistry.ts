export const PARSE_TEMPLATES = [
  '', 'text_field', 'number_with_unit', 'boolean_yes_no_unk',
  'component_reference', 'date_field', 'url_field',
  'list_of_numbers_with_unit', 'list_numbers_or_ranges_with_unit',
  'list_of_tokens_delimited', 'token_list', 'text_block',
] as const;

export type ParseTemplate = (typeof PARSE_TEMPLATES)[number];

export const UNIT_BEARING_TEMPLATES: ReadonlySet<string> = new Set([
  'number_with_unit',
  'list_of_numbers_with_unit',
  'list_numbers_or_ranges_with_unit',
]);

export function isUnitBearingTemplate(template: string): boolean {
  return UNIT_BEARING_TEMPLATES.has(template);
}

const TEMPLATE_OUTPUT_TYPE: Record<string, string> = {
  boolean_yes_no_unk: 'boolean',
  number_with_unit: 'number',
  list_of_numbers_with_unit: 'number',
  list_numbers_or_ranges_with_unit: 'number',
  url_field: 'url',
  date_field: 'date',
  list_of_tokens_delimited: 'list',
  token_list: 'list',
  component_reference: 'component_ref',
  text_field: 'string',
  text_block: 'string',
};

export function resolveOutputType(template: string): string {
  return TEMPLATE_OUTPUT_TYPE[template] ?? 'string';
}
