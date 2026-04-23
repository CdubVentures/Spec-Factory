/**
 * Contract schema catalog — the SSOT "every possible parameter" surface that
 * the per-key doc builder renders so an LLM author sees EVERY knob available
 * when configuring a field rule, alongside the current value.
 *
 * Each entry describes ONE rule parameter:
 *   - path:       dot-notation accessor into the compiled rule
 *   - label:      human column name
 *   - kind:       value kind (drives render + describePossibleValues)
 *   - options:    allowed values (for kind='enum' / 'ordered-list')
 *   - appliesWhen: { 'other.path': expected-value-or-array } — row only
 *                  meaningfully applies when all conditions hold (e.g. list
 *                  rules only apply when shape=list)
 *   - doc:        one-line teaching string ("why it matters") rendered in the table
 *
 * Hand-authored rather than derived from a JSON schema because the per-row
 * teaching text is the high-signal part — we want to tell the LLM "this
 * controls filter-UI rendering", not just "this is a string".
 *
 * Exports:
 *   - FIELD_RULE_SCHEMA  (frozen array)
 *   - KNOWN_KINDS        (Set<string>)
 *   - getIn              (dot-notation accessor)
 *   - appliesTo          (evaluates appliesWhen)
 *   - describeCurrent    (renders current value cell)
 *   - describePossibleValues (renders possible-values cell)
 */

export const KNOWN_KINDS = new Set([
  'enum',
  'string',
  'integer',
  'number-nullable',
  'boolean',
  'string-list',
  'ordered-list',
  'constraint-list',
  'component-ref',
  'enum-or-freeform',
  'prose',
  'group-ref',
]);

export const FIELD_RULE_SCHEMA = Object.freeze([
  {
    path: 'priority.required_level',
    label: 'Required level',
    kind: 'enum',
    options: ['mandatory', 'non_mandatory'],
    doc: 'Drives needset scheduling, unk-block publish gate, and per-key LLM budget. Mandatory fields block publish when unk.',
  },
  {
    path: 'priority.availability',
    label: 'Availability',
    kind: 'enum',
    options: ['always', 'sometimes', 'rare'],
    doc: 'Primary sort key in bundling and needset scheduling. Common fields run before rare ones.',
  },
  {
    path: 'priority.difficulty',
    label: 'Difficulty',
    kind: 'enum',
    options: ['easy', 'medium', 'hard', 'very_hard'],
    doc: 'Routes to a tier bundle which selects model + reasoning + thinking + web search.',
  },
  {
    path: 'contract.type',
    label: 'Data type',
    kind: 'enum',
    options: ['string', 'number', 'integer', 'boolean', 'date'],
    doc: 'Drives JSON primitive emission AND filter-UI control — numeric types render as range sliders, strings as toggle chips.',
  },
  {
    path: 'contract.shape',
    label: 'Shape',
    kind: 'enum',
    options: ['scalar', 'list'],
    doc: 'Scalar = single value. List = array with dedupe+sort via list_rules; filter UI becomes multi-select.',
  },
  {
    path: 'contract.unit',
    label: 'Unit',
    kind: 'string',
    doc: 'Storage contract — numeric values stored unit-less, unit applied at render (e.g. "g", "mm", "ms", "hz").',
  },
  {
    path: 'contract.rounding.decimals',
    label: 'Rounding decimals',
    kind: 'integer',
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'Precision for equality compare in the index. Without it, 128 and 128.0000001 survive as different values.',
  },
  {
    path: 'contract.rounding.mode',
    label: 'Rounding mode',
    kind: 'enum',
    options: ['nearest', 'floor', 'ceil', 'half_even'],
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'How to round at precision boundaries. Defaults to nearest.',
  },
  {
    path: 'contract.list_rules.dedupe',
    label: 'List dedupe',
    kind: 'boolean',
    appliesWhen: { 'contract.shape': 'list' },
    doc: 'Removes duplicate values from the emitted list. Usually on for filter-facet lists.',
  },
  {
    path: 'contract.list_rules.sort',
    label: 'List sort',
    kind: 'enum',
    options: ['none', 'asc', 'desc', 'insert'],
    appliesWhen: { 'contract.shape': 'list' },
    doc: 'Stable list order. Use desc for numeric lists where highest-first is the consumer convention (e.g. polling_rate).',
  },
  {
    path: 'contract.range.min',
    label: 'Range min',
    kind: 'number-nullable',
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'Numeric lower bound. Stops the LLM from guessing out-of-range values.',
  },
  {
    path: 'contract.range.max',
    label: 'Range max',
    kind: 'number-nullable',
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'Numeric upper bound. Stops the LLM from emitting dpi=1,000,000 and similar hallucinations.',
  },
  {
    path: 'enum.policy',
    label: 'Enum policy',
    kind: 'enum',
    options: ['closed', 'open_prefer_known', 'open'],
    doc: 'closed = reject non-listed. open_prefer_known = accept new with needs_curation. open = trust evidence. Mismatched policy is the most common source of enum pollution.',
  },
  {
    path: 'enum.values',
    label: 'Enum values',
    kind: 'string-list',
    doc: 'Vocabulary for this field. Each non-numeric value becomes a filter chip on the consumer site. Value count is a UX metric: \u226410 healthy, 11\u201315 fine, 16\u201320 tolerable, 21\u201330 fatigue, 30+ broken.',
  },
  {
    path: 'enum.source',
    label: 'Enum source',
    kind: 'enum-or-freeform',
    options: ['(inline)', 'data_lists.<name>'],
    doc: 'Inline values on the rule, or a reference to a shared data list in known_values.',
  },
  {
    path: 'aliases',
    label: 'Aliases',
    kind: 'string-list',
    doc: 'Source-text synonyms the LLM normalizes to the canonical value before emitting (e.g. "pixart pmw 3950" \u2192 "pmw3950").',
  },
  {
    path: 'variance_policy',
    label: 'Variance policy',
    kind: 'enum',
    options: ['authoritative', 'upper_bound', 'lower_bound', 'majority_vote'],
    doc: 'How to resolve disagreeing sources when a product has multiple variants. Left empty for scalar fields without variant variance.',
  },
  {
    path: 'ai_assist.reasoning_note',
    label: 'Extraction guidance',
    kind: 'prose',
    doc: 'The ONE editable extraction-guidance slot. Visual cues, semantic disambiguation, gotchas. Do NOT duplicate anything the generic template already renders (enum list, source tiers, unk policy, evidence contract).',
  },
  {
    path: 'search_hints.domain_hints',
    label: 'Preferred source domains',
    kind: 'string-list',
    doc: 'Hint set the LLM web search prioritizes for this field. Typically manufacturer + a handful of review domains.',
  },
  {
    path: 'search_hints.query_terms',
    label: 'Search query terms',
    kind: 'string-list',
    doc: 'Candidate queries for the LLM search. Keep field-specific; generic product queries belong at the product level.',
  },
  {
    path: 'constraints',
    label: 'Cross-field constraints',
    kind: 'constraint-list',
    doc: 'DSL: "<field> <op> <target>" where op \u2208 {lte, lt, gte, gt, eq}. Example: "sensor_date <= release_date". KNOWN BUG: renderer reads cross_field_constraints; compiled rules store constraints (alias mismatch; unreachable until fixed).',
  },
  {
    path: 'component.type',
    label: 'Component type',
    kind: 'component-ref',
    doc: 'When this field IS the identity of a component database (e.g. "sensor", "switch", "encoder"). Blank for standalone fields or for subfields (subfield relation comes from the component_db properties list).',
  },
  {
    path: 'evidence.min_evidence_refs',
    label: 'Min evidence refs',
    kind: 'integer',
    doc: 'Minimum independent supporting evidence URLs to accept a value. Identity-anchoring fields (sensor, switch, form_factor) should be \u22652.',
  },
  {
    path: 'evidence.tier_preference',
    label: 'Evidence tier preference',
    kind: 'ordered-list',
    options: ['tier1', 'tier2', 'tier3'],
    doc: 'Ordered list from most authoritative to least. Default order is tier1 \u2192 tier2 \u2192 tier3; override per field when a lower-tier source is preferred (e.g. instrumented review labs over first-party for polling_rate).',
  },
  {
    path: 'group',
    label: 'Group',
    kind: 'group-ref',
    doc: 'Field group (mirrors ui.group). Drives bundling pool eligibility when groupBundlingOnly is on, plus sidebar/section organization in Field Studio and (future) consumer site.',
  },
]);

/** Dot-notation accessor tolerating null intermediate links. */
export function getIn(obj, path) {
  if (obj == null || !path) return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Evaluate an entry's appliesWhen against a rule. Missing appliesWhen means
 * the row always applies. Values may be a single expected value or an array
 * of acceptable values.
 */
export function appliesTo(entry, rule) {
  if (!entry || !entry.appliesWhen) return true;
  for (const [path, expected] of Object.entries(entry.appliesWhen)) {
    const actual = getIn(rule, path);
    const list = Array.isArray(expected) ? expected : [expected];
    if (!list.includes(actual)) return false;
  }
  return true;
}

function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return true;
  return false;
}

function renderListSummary(list, prefix = 'value') {
  const arr = Array.isArray(list) ? list.filter((v) => v !== null && v !== undefined && v !== '') : [];
  if (arr.length === 0) return '(unset)';
  const head = arr.slice(0, 6).map((v) => String(v)).join(', ');
  const tail = arr.length > 6 ? `, \u2026 (+${arr.length - 6})` : '';
  return `${arr.length} ${prefix}${arr.length === 1 ? '' : 's'}: ${head}${tail}`;
}

/**
 * Render the "current value" cell for a given entry + rule. Returns a string
 * safe to drop into a markdown / HTML table cell. Unset knobs surface as
 * "(unset)" so the reader sees a catalog of configurable slots, not a wall
 * of empty cells.
 */
export function describeCurrent(entry, rule) {
  if (!entry) return '(unset)';
  const v = getIn(rule, entry.path);
  if (isEmptyValue(v)) return '(unset)';
  switch (entry.kind) {
    case 'string-list':
      return renderListSummary(v);
    case 'ordered-list':
      return renderListSummary(v);
    case 'constraint-list': {
      const arr = Array.isArray(v) ? v : [];
      if (arr.length === 0) return '(unset)';
      const head = arr.slice(0, 3).map((c) => (typeof c === 'string' ? c : c?.raw || JSON.stringify(c))).join(' \u00B7 ');
      return `${arr.length} constraint${arr.length === 1 ? '' : 's'}: ${head}${arr.length > 3 ? ' \u2026' : ''}`;
    }
    case 'boolean':
      return v ? 'true' : 'false';
    case 'number-nullable':
    case 'integer':
      return String(v);
    case 'prose': {
      const s = String(v).trim();
      if (!s) return '(unset)';
      if (s.length <= 160) return s;
      return s.slice(0, 157) + '\u2026';
    }
    default:
      return String(v);
  }
}

/**
 * Render the "possible values" cell — the catalog of choices available for
 * this knob. Enum entries show the literal option set; free-form kinds show
 * a kind hint.
 */
export function describePossibleValues(entry) {
  if (!entry) return '';
  switch (entry.kind) {
    case 'enum':
      return (entry.options || []).map((o) => `\`${o}\``).join(' \u00B7 ');
    case 'enum-or-freeform':
      return `${(entry.options || []).map((o) => `\`${o}\``).join(' \u00B7 ')} (or free-form)`;
    case 'ordered-list':
      return `ordered list of ${(entry.options || []).map((o) => `\`${o}\``).join(' \u00B7 ')}`;
    case 'boolean':
      return '`true` \u00B7 `false`';
    case 'integer':
      return 'integer (e.g. `0`, `1`, `2`)';
    case 'number-nullable':
      return 'number or `null`';
    case 'string':
      return 'free-form string';
    case 'string-list':
      return 'list of free-form strings';
    case 'constraint-list':
      return 'list of DSL strings: `<field> <lte|lt|gte|gt|eq> <target>`';
    case 'component-ref':
      return 'component type name from `component_db/` (e.g. `sensor`, `switch`, `encoder`)';
    case 'group-ref':
      return 'group key from `field_groups.json`';
    case 'prose':
      return 'free-form prose (the editable extraction-guidance slot)';
    default:
      return '';
  }
}
