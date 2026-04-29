/**
 * Per-key doc structure builder.
 *
 * Produces a { meta, sections } tree for ONE field — used by the per-key doc
 * builder to hand to the shared renderHtmlFromStructure / renderMarkdownFromStructure
 * primitives. Same block kinds as the existing category report so the renderers
 * need no changes.
 *
 * Single export:
 *   - buildPerKeyDocStructure(keyRecord, opts) → { meta, sections }
 */

import { FIELD_RULE_SCHEMA, appliesTo, describeCurrent, describePossibleValues } from './contractSchemaCatalog.js';
import { expectedFieldStudioPatchFileName } from './fieldStudioPatch.js';

const SLOT_DESCRIPTIONS = Object.freeze([
  { slot: 'PRIMARY_FIELD_KEY', previewKey: 'header', note: 'Field key + display name header.' },
  { slot: 'PRIMARY_FIELD_GUIDANCE', previewKey: 'guidance', note: '`ai_assist.reasoning_note` prose. Empty when unauthored.' },
  { slot: 'PRIMARY_FIELD_CONTRACT', previewKey: 'contract', note: 'Type, shape, unit, rounding, list rules, enum values + policy, variance policy, aliases. Everything the LLM needs to emit a well-typed value.' },
  { slot: 'PRIMARY_SEARCH_HINTS', previewKey: 'searchHints', note: 'Preferred domain_hints + query_terms. Empty when unauthored or knob off.' },
  { slot: 'PRIMARY_CROSS_FIELD_CONSTRAINTS', previewKey: 'crossField', note: 'Cross-field relational constraints (lte/gte/eq/requires_*), normalized from `constraints` DSL and structured `cross_field_constraints`.' },
  { slot: 'PRIMARY_COMPONENT_KEYS', previewKey: 'componentRel', note: 'Relation pointer: this key is a component identity or belongs to a resolved component on this product.' },
]);

function buildHeaderSection(record, category, generatedAt, preview) {
  const reservedBanner = preview?.reserved
    ? {
      kind: 'note',
      tone: 'warn',
      text: `RESERVED KEY \u2014 this field is owned by **${preview.ownerLabel}** (\`${preview.owner}\`). keyFinder never sends a prompt for this key; the generic extraction pipeline handles it. Per-key doc shows the rule shape for reference only.`,
    }
    : null;

  const identityParagraph = {
    kind: 'paragraph',
    text: `Field key: \`${record.fieldKey}\` \u00B7 Display: **${record.displayName}** \u00B7 Group: \`${record.group}\` \u00B7 Category: \`${category}\``,
  };

  const priorityParagraph = {
    kind: 'paragraph',
    text: `Priority: \`${record.priority.required_level}\` \u00B7 \`${record.priority.availability}\` \u00B7 \`${record.priority.difficulty}\``,
  };

  const blocks = [identityParagraph, priorityParagraph];
  if (reservedBanner) blocks.unshift(reservedBanner);

  return {
    id: 'header',
    title: `\`${record.fieldKey}\` \u2014 ${record.displayName}`,
    level: 1,
    blocks,
  };
}

function buildPurposeSection(record, preview, category) {
  const shape = record.contract.shape === 'list' ? 'list' : 'scalar';
  const tierBundleLabel = preview?.tierBundle?.model
    ? `routes to tier \`${preview.tierBundle.name}\` \u2192 model \`${preview.tierBundle.model}\`${preview.tierBundle.webSearch ? ' with web search' : ''}${preview.tierBundle.useReasoning ? ', reasoning on' : ''}`
    : `routes via difficulty \`${record.priority.difficulty}\` (tier bundle unresolved in this report run)`;
  const sentences = [
    `Extracts **${record.displayName}** for every product in category \`${category}\`.`,
    `Grouped under \`${record.group}\`. Returns ${shape} of \`${record.contract.type}\`${record.contract.unit ? ` (unit: ${record.contract.unit})` : ''}.`,
    `Difficulty is \`${record.priority.difficulty}\`; ${tierBundleLabel}.`,
  ];
  if (preview?.reserved) {
    sentences.push(`This key is reserved \u2014 actual extraction runs through ${preview.ownerLabel}, not keyFinder. The per-key doc is for shape/reference only.`);
  }
  return {
    id: 'purpose',
    title: 'Purpose',
    level: 2,
    blocks: [{ kind: 'paragraph', text: sentences.join(' ') }],
  };
}

function detectArchetypes(record) {
  const archetypes = [];
  const type = String(record?.contract?.type || '').toLowerCase();
  const shape = String(record?.contract?.shape || 'scalar').toLowerCase();
  const enumSource = String(record?.enum?.source || '');
  const enumPolicy = String(record?.enum?.policy || '');

  const isComponentIdentity = (
    record?.component?.relation === 'parent'
    || (enumSource.startsWith('component_db.') && enumSource === `component_db.${record?.fieldKey}`)
  );
  if (isComponentIdentity) archetypes.push('component_identity');

  const isComponentFacet = (
    Boolean(record?.component_identity_projection?.facet)
    || (record?.component?.relation === 'subfield_of' && !isComponentIdentity)
    || Boolean(record?.componentDbProperty)
  );
  if (isComponentFacet) archetypes.push('component_facet');

  if (type === 'boolean') archetypes.push('boolean');

  const isNumeric = ['number', 'integer', 'float'].includes(type);
  if (isNumeric && shape === 'scalar') archetypes.push('numeric_scalar');
  if (isNumeric && shape === 'list') archetypes.push('numeric_list');

  const hasEnum = Boolean(enumPolicy) || (Array.isArray(record?.enum?.values) && record.enum.values.length > 0) || enumSource.startsWith('data_lists.');
  if (hasEnum && type === 'string' && shape === 'scalar' && !isComponentIdentity) archetypes.push('enum_scalar');
  if (hasEnum && shape === 'list') archetypes.push('enum_list');

  const pifEnabled = record?.ai_assist?.pif_priority_images?.enabled === true || record?.ai_assist?.pif_priority_images === true;
  if (pifEnabled) archetypes.push('visual_judgment');

  return archetypes;
}

const ARCHETYPE_REQUIRED_CONTENT = {
  component_identity: [
    'Canonical-form anchor is the component_db, NOT a format_hint regex. Do not author `enum.match.format_hint` for component-identity fields — value shapes are too irregular (maker part numbers, branded lines, generation suffixes, distributor codes) to capture in one pattern. Discipline lives in component_db curation + `open_prefer_known` policy + reasoning_note rules below.',
    'Anti-pattern bank — 4–6 concrete strings the LLM must reject (slugified marketing, host-brand-prefixed phrases, parenthesized PCB markings, generic class words, marketing adjectives).',
    'Host-brand-leak rule — the audited product\'s brand never appears inside this component identity.',
    'Identity-layer choice — host-branded line vs OEM model. Pick one and apply it across every facet of this component (identity + brand + link + properties).',
    'Marketing-evidence facet decomposition — a single PDP sentence may answer the *type* facet but not the identity. Identity from marketing-only ⇒ unk.',
    'Confidence ladder — component-page/teardown ≥90; branded-line marketing ≈70; generic-class marketing ≤40 ⇒ unk; sibling-inferred ⇒ unk.',
    'PCB-marking strip rule — strip parenthesized grade/color/lot tokens before emit.',
    'Roster completeness scan — read the category key map in this brief and decide structurally for every name-prefixed or conceptually-adjacent key (latency, date, link, generation, sub-feature variants) whether it should join the property roster, become a facet, or stay standalone. Identity audits own the structural decision; no name-adjacent key should be left unconsidered.',
    'Auto-generated facet shape — component identity fields automatically materialize `<key>_brand` and `<key>_link` as `component_identity_projection` facets. Do not list those facet keys in `component_sources.<key>.roles.properties[]`; record them as `identity_facet` in the roster audit. Optional non-standard facets such as `<key>_type` still require an explicit field rule decision.',
    'enum.policy default — pick `open_prefer_known` when the entity set is expected to grow (most component families: sensors, switches, panels, GPU chips, RAM modules). Reserve `closed` for genuinely finite/static sets where every new entity must be a deliberate human-curation gate. Do NOT pick `closed` because the current entity list happens to be enumerable today.',
    'Field-level aliases discipline — when `enum.source = component_db.<X>`, do not author `field_overrides.<component>.aliases`; leave it blank/absent. Component row aliases are component data, not Field Studio patch data.',
    'Component property invariance test — before promoting a candidate key into the property roster, ask: "does this value change across two different products that use the same component?" If yes → product field, leave standalone. If no → component property. Three universal failure modes: (1) lab/measurement results (`*_latency`, `*_response_time`, `measured_*`, `*_under_load`, `effective_*`, `*_at_<condition>`), (2) firmware/MCU-implemented feature toggles (motion-sync, software smoothing, vendor latency integrations, host-implemented signal processing), (3) product-exposed configuration / capability subsets (polling-rate ladders, exposed lift settings, exposed step lists, profile menus).',
  ],
  component_facet: [
    'Same anti-pattern bank as the parent identity (so the facet doesn\'t accept slugified marketing either).',
    'Brand-abbreviation expansion (when this is a brand facet) — emit the registered canonical from the data_list; raw 1–3 letter abbreviations without an alias mapping ⇒ unk.',
    'Facet decomposition — if the source proves a different facet (e.g. type but not identity), do not copy the same string across facets.',
    'For link facets — which kinds of pages are valid (maker component pages, datasheets, distributor part pages) vs invalid (host product pages, reviews, marketplace listings).',
  ],
  boolean: [
    'Explicit affirmation rule for `true` — what evidence in what form proves the affirmative state.',
    'Default-on-absence rule — ambiguous or absent evidence ⇒ `no`, never `yes`.',
    'Distinguish from not-applicable when the field is conditional.',
  ],
  numeric_scalar: [
    'Unit/symbol-strip rule — currency or unit symbols belong in `contract.unit`, never inside the value.',
    'Range/sanity rule — realistic bounds so the LLM rejects wildly out-of-range extractions.',
    'When multiple reportable forms exist (peak vs sustained, max vs nominal), name which form the field stores.',
    'Enum policy by value-space shape — `closed` and `open_prefer_known` auto-lock `enum.source` to `data_lists.<field_key>`. For a CONTINUOUS measurement (every product produces a unique reading) use `open` so no preferred-vocabulary list is created. Use `open_prefer_known`/`closed` only when the value space has discrete tiers with marketing-meaningful steps that should bias future extractions.',
    'Sibling-alias discipline — if this field has connection/mode/variant-qualified siblings in the category key map (e.g. `<key>_wired`, `<key>_peak`, `<key>_xmp`), the parent\'s aliases must include only mode-agnostic phrases. Move qualifier-bearing phrases to the relevant sibling.',
  ],
  numeric_list: [
    'Unit/symbol-strip rule applies to every list item.',
    'Item ordering rule (descending numeric is conventional for capability lists).',
    'Range/sanity rule per item.',
    'Enum policy by value-space shape — see numeric_scalar archetype.',
    'Sibling-alias discipline — see numeric_scalar archetype.',
  ],
  enum_scalar: [
    'Shape lock — emit a JSON string, never a 1-element list.',
    'Granularity rule — emit the canonical the enum carries; sub-specs the enum doesn\'t carry stay out of the value.',
    'Synonym-to-canonical rule — when source uses a synonym, emit the canonical the data_list defines; aliases handle the mapping.',
    'Sibling-alias discipline — if this field has mode/variant-qualified siblings, exclude qualifier-bearing phrases from the parent\'s aliases.',
    'format_hint when COMPOUND-pattern-bounded — if the value is a string combining counts/units/qualifiers/dimensions in one expression, AND the legitimate space falls into 1–4 consistent structural patterns, author `enum.match.format_hint` to enforce the shape. Goal is "a few patterns instead of chaos." Universal fits: `<N> zone (rgb|led)`, `<width>x<height>`, `CL<N>-<N>-<N>-<N>`, `<N>ms (<mode>)`, `<N>x <connector> <version>`. Do NOT use format_hint for plain number+unit values (`<N>g`, `<N>mm`, `<N> Hz`, `<N> GB`, `<N>-bit` — those are `type: number` + `contract.unit`), URLs, or component identities.',
  ],
  enum_list: [
    'List composition rule — product-wide union, per-variant union, or base/default-variant list.',
    'Item ordering rule — descending numeric, alphabetic, or source order.',
    'Pattern-conformant emission for pattern-bounded list enums.',
    'Sibling-alias discipline — see enum_scalar archetype.',
    'format_hint when COMPOUND-pattern-bounded — see enum_scalar archetype. Strong fit when list items follow compound patterns like `<N> zone (rgb|led)` or `<width>x<height>`. Skip when items reduce to one number + a unit (use `type: number` + `contract.unit`, list shape).',
  ],
  visual_judgment: [
    'Tier classification (A direct, B subtle, C non-visual) and the matching guidance shape.',
    'For Tier B — name the view, define the visible feature precisely, give threshold or relative-measurement rules, name when to return unk.',
    'Product-scoped variant interpretation — for yes/no fields, when one official edition with the visible trait makes the answer yes; for list-like visual fields, how to represent variant/design forms found.',
  ],
};

function shortenForCell(value, limit = 80) {
  const text = value === null || value === undefined ? '' : String(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3)}...`;
}

function buildBenchmarkDiffSection(record, benchmark) {
  if (!benchmark || !Array.isArray(benchmark.rows) || benchmark.rows.length === 0) return null;
  const summary = benchmark.fieldSummary || {};
  const summaryParts = [];
  if (typeof summary.correct === 'number') summaryParts.push(`correct ${summary.correct}`);
  if (typeof summary.wrong === 'number') summaryParts.push(`wrong ${summary.wrong}`);
  if (typeof summary.extra === 'number') summaryParts.push(`extra ${summary.extra}`);
  if (typeof summary.missing === 'number') summaryParts.push(`missing ${summary.missing}`);
  if (typeof summary.needs_review === 'number') summaryParts.push(`needs_review ${summary.needs_review}`);
  if (typeof summary.scored === 'number') summaryParts.push(`scored ${summary.scored}`);
  if (typeof summary.accuracy === 'number') summaryParts.push(`accuracy ${summary.accuracy}%`);

  const blocks = [
    {
      kind: 'paragraph',
      text: `Most recent benchmark for \`${record.fieldKey}\` (generated ${benchmark.generatedAt || 'unknown'}). Each row is one test product. Highest-leverage rows first (wrong, extra, missing, needs_review, then correct). Your enum + format_hint + reasoning_note must defeat every wrong/extra row and accept every benchmark expected value.`,
    },
  ];
  if (summaryParts.length > 0) {
    blocks.push({
      kind: 'paragraph',
      text: `Field-level scoreboard: ${summaryParts.join(' / ')}.`,
    });
  }

  const headers = ['Product', 'Status', 'Benchmark expects', 'App produced', 'Confidence', 'Reason'];
  const rows = benchmark.rows.map((row) => [
    row.productLabel || '-',
    row.status || '-',
    shortenForCell(row.benchmark, 80),
    shortenForCell(row.app, 80),
    row.appConfidence == null ? '-' : String(row.appConfidence),
    shortenForCell(row.reason, 60),
  ]);
  blocks.push({ kind: 'table', headers, rows });

  return {
    id: 'benchmark-diff',
    title: 'Benchmark diff for this key (per-product expected vs extracted)',
    level: 2,
    blocks,
  };
}

function stripAliasRequirements(items, aliasOutOfScope) {
  if (!aliasOutOfScope) return items;
  return items.filter((item) => !/\balias/i.test(item));
}

function buildSuccessBarSection(record, context = {}) {
  const archetypes = detectArchetypes(record);
  const aliasOutOfScope = isAliasOutOfScope(record, context);
  const archetypeBlocks = archetypes.length > 0
    ? archetypes.flatMap((archetype) => {
      const items = stripAliasRequirements(ARCHETYPE_REQUIRED_CONTENT[archetype] || [], aliasOutOfScope);
      if (items.length === 0) return [];
      return [
        { kind: 'subheading', level: 4, text: `${archetype.replace(/_/g, ' ')} archetype` },
        { kind: 'bulletList', items },
      ];
    })
    : [{ kind: 'paragraph', text: 'No archetype-specific content detected for this key beyond the universal rules. Apply the priority order above and the universal extraction rules from Part 1a.' }];

  return {
    id: 'success-bar',
    title: 'The 95% bar — what determines benchmark success for this key',
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: `Your enum, format pattern, and \`reasoning_note\` for \`${record.fieldKey}\` will be applied as-is to a re-run of this key against every test product in the category benchmark. Success bar is **≥95% match** across all test products. The other settings are infrastructure; the three knobs below determine whether you clear the bar.`,
      },
      {
        kind: 'bulletList',
        items: [
          aliasOutOfScope
            ? '**Enum vocabulary** — the values the runtime LLM is locked to. Wrong vocabulary, wrong granularity, or unexpanded abbreviations cap the key below 95%.'
            : '**Enum vocabulary** — the values the runtime LLM is locked to. Wrong vocabulary, wrong granularity, missing aliases, or unexpanded abbreviations cap the key below 95%.',
          '**Format pattern** (`enum.match.format_hint`) — for STRING values whose shape is compound (counts + units + qualifiers + dimensions in one expression) and falls into 1–4 consistent patterns. Skip for plain number+unit values (use `type: number` + `contract.unit`), URLs (use `type: url`), and component identities (use `component_db`).',
          '**Extraction guidance** (`ai_assist.reasoning_note`) — the only prose the runtime LLM literally reads on every extraction. Carries the anti-pattern bank, confidence ladder, and "when to return unk" rules the structured contract cannot express. This is the biggest of the three.',
        ],
      },
      {
        kind: 'paragraph',
        text: aliasOutOfScope
          ? 'When a benchmark exists for this category (`.workspace/reports/<category>/key-finder-benchmark/scorecard.json`), your enum canonicals MUST be the benchmark\'s exact strings; your format_hint MUST accept every benchmark expected value; your guidance MUST defeat any prior-run wrong values.'
          : 'When a benchmark exists for this category (`.workspace/reports/<category>/key-finder-benchmark/scorecard.json`), your enum canonicals MUST be the benchmark\'s exact strings (or carry explicit aliases mapping to them); your format_hint MUST accept every benchmark expected value; your guidance MUST defeat any prior-run wrong values.',
      },
      { kind: 'subheading', level: 3, text: 'Required content per archetype detected for this key' },
      ...archetypeBlocks,
    ],
  };
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '(unset)';
  if (Array.isArray(value)) return value.length === 0 ? '[]' : value.map((v) => `\`${v}\``).join(', ');
  if (typeof value === 'object') return `\`${JSON.stringify(value)}\``;
  return `\`${String(value)}\``;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function componentSourceType(row) {
  return String(row?.component_type || '').trim();
}

function findComponentSource(componentSources, type) {
  return (componentSources || []).find((row) => componentSourceType(row) === type) || null;
}

function isComponentIdentityRecord(record) {
  const source = String(record?.enum?.source || record?.rawRule?.enum?.source || '');
  return record?.component?.relation === 'parent'
    || (record?.fieldKey && source === `component_db.${record.fieldKey}`);
}

function componentIdentityProjection(record) {
  const projection = record?.component_identity_projection || record?.rawRule?.component_identity_projection;
  return projection && typeof projection === 'object' && !Array.isArray(projection) ? projection : null;
}

function autoFacetInfo(record, { componentSources = [], allKeyRecords = [] } = {}) {
  const projection = componentIdentityProjection(record);
  if (projection?.component_type && ['brand', 'link'].includes(String(projection.facet || ''))) {
    return {
      componentType: String(projection.component_type),
      facet: String(projection.facet),
    };
  }

  const match = String(record?.fieldKey || '').match(/^(.+)_(brand|link)$/);
  if (!match) return null;
  const [, componentType, facet] = match;
  const sourceHasParent = (componentSources || []).some((row) => componentSourceType(row) === componentType);
  const recordsHaveParent = (allKeyRecords || []).some((entry) => entry?.fieldKey === componentType && isComponentIdentityRecord(entry));
  if (!sourceHasParent && !recordsHaveParent) return null;
  return { componentType, facet };
}

function isAliasOutOfScope(record, context = {}) {
  return isComponentIdentityRecord(record) || Boolean(autoFacetInfo(record, context));
}

function buildContractPatchExample(record) {
  const contract = {
    type: record.contract.type || 'string',
    shape: record.contract.shape || 'scalar',
  };
  if (record.contract.unit) contract.unit = record.contract.unit;
  if (record.contract.rounding) contract.rounding = record.contract.rounding;
  if (record.contract.list_rules) contract.list_rules = record.contract.list_rules;
  if (record.contract.range) contract.range = record.contract.range;
  return contract;
}

function buildEnumPatchExample(record) {
  const currentPolicy = record.enum?.policy || 'open_prefer_known';
  if (record.component?.relation === 'parent') {
    return {
      policy: currentPolicy,
      source: `component_db.${record.component.type}`,
    };
  }
  if (typeof record.enum?.source === 'string' && record.enum.source.startsWith('component_db.')) {
    return {
      policy: currentPolicy,
      source: record.enum.source,
    };
  }
  if (typeof record.enum?.source === 'string' && record.enum.source.startsWith('data_lists.')) {
    return {
      policy: currentPolicy,
      source: record.enum.source,
    };
  }
  if ((record.enum?.values || []).length > 0 || record.enum?.policy) {
    return {
      policy: currentPolicy,
      source: `data_lists.${record.fieldKey}`,
    };
  }
  return null;
}

function buildDataListPatchExample(record, enumPatch) {
  if (!enumPatch?.source?.startsWith('data_lists.')) return [];
  const field = enumPatch.source.slice('data_lists.'.length) || record.fieldKey;
  return [{
    field,
    manual_values: Array.isArray(record.enum?.values) ? record.enum.values : [],
  }];
}

function componentPropertyTypeForContract(contract) {
  const type = String(contract?.type || 'string');
  return ['string', 'number', 'integer', 'boolean', 'date', 'url', 'range', 'mixed_number_range'].includes(type)
    ? type
    : 'string';
}

function buildSuggestedComponentProperty(record) {
  const out = {
    field_key: record.fieldKey,
    type: componentPropertyTypeForContract(record.contract),
    variance_policy: record.variance_policy || 'authoritative',
  };
  if (record.contract?.unit) out.unit = record.contract.unit;
  const constraints = (record.constraints || [])
    .map((constraint) => constraint?.raw || '')
    .filter(Boolean);
  if (constraints.length > 0) out.constraints = constraints;
  return out;
}

function normalizeComponentSourceProperty(property) {
  const out = {
    field_key: property.field_key || property.key,
    type: property.type || 'string',
    unit: property.unit || '',
    variance_policy: property.variance_policy || 'authoritative',
  };
  if (Array.isArray(property.constraints) && property.constraints.length > 0) {
    out.constraints = property.constraints;
  }
  if (property.component_only === true) out.component_only = true;
  if (property.tolerance !== null && property.tolerance !== undefined) {
    out.tolerance = property.tolerance;
  }
  return out;
}

function buildComponentSourcePatchExample(record, componentSources) {
  const componentType = record.component?.type || record.componentDbProperty?.type;
  if (!componentType) return [];
  const existing = findComponentSource(componentSources, componentType);
  const roles = existing?.roles || {};
  const properties = Array.isArray(roles.properties) ? roles.properties : [];
  const patchProperties = properties
    .map((property) => normalizeComponentSourceProperty(property))
    .filter((property) => property.field_key);
  if (
    record.componentDbProperty
    && !patchProperties.some((property) => property.field_key === record.fieldKey)
  ) {
    patchProperties.push(buildSuggestedComponentProperty(record));
  }
  return [{
    component_type: existing ? componentSourceType(existing) : componentType,
    roles: {
      properties: patchProperties,
    },
  }];
}

function buildPatchExample(record, category, ordinalNumber, componentSources) {
  const enumPatch = buildEnumPatchExample(record);
  const fieldOverride = {
    priority: cloneJson(record.priority),
    contract: buildContractPatchExample(record),
    ai_assist: {
      color_edition_context: {
        enabled: record.ai_assist?.color_edition_context?.enabled === true,
      },
      pif_priority_images: {
        enabled: record.ai_assist?.pif_priority_images?.enabled === true,
      },
      reasoning_note: `Paste-ready extraction guidance for ${record.fieldKey}.`,
    },
  };
  if (enumPatch) fieldOverride.enum = enumPatch;

  return {
    schema_version: 'field-studio-patch.v1',
    category,
    field_key: record.fieldKey,
    navigator_ordinal: ordinalNumber,
    verdict: 'minor_revise',
    patch: {
      field_overrides: {
        [record.fieldKey]: fieldOverride,
      },
      data_lists: buildDataListPatchExample(record, enumPatch),
      component_sources: buildComponentSourcePatchExample(record, componentSources),
    },
    audit: {
      sources_checked: [],
      products_checked: [],
      conclusion: '',
      adjacent_key_roster_decisions: [],
      schema_blocked_component_attributes: [],
      open_questions: [],
    },
  };
}

function formatTierBundle(preview) {
  const bundle = preview?.tierBundle || {};
  if (!bundle.model) return 'tier unresolved; audit `priority.difficulty` against category tier settings';
  const reasoning = bundle.useReasoning ? 'reasoning on' : 'reasoning off';
  const thinking = bundle.thinking ? `thinking on${bundle.thinkingEffort ? ` (${bundle.thinkingEffort})` : ''}` : 'thinking off';
  const search = bundle.webSearch ? 'web search on' : 'web search off';
  return `tier \`${bundle.name || 'unknown'}\` -> model \`${bundle.model}\`; ${reasoning}; ${thinking}; ${search}`;
}

function formatList(values) {
  return Array.isArray(values) && values.length > 0
    ? values.map((v) => `\`${v}\``).join(', ')
    : '-';
}

function formatComponentRelation(record) {
  if (record?.componentDbProperty) return `DB hint: \`${record.componentDbProperty.type}\``;
  if (!record?.component) return '-';
  const relation = record.component.relation === 'parent' ? 'identity' : 'subfield';
  return `${relation}: \`${record.component.type}\``;
}

function formatConstraintCount(record) {
  const count = Array.isArray(record?.constraints) ? record.constraints.length : 0;
  return count > 0 ? String(count) : '-';
}

function orderKeysByGroups(allKeyRecords, groups) {
  const byField = new Map((allKeyRecords || []).map((k) => [k.fieldKey, k]));
  const ordered = [];
  const seen = new Set();
  for (const group of groups || []) {
    for (const fieldKey of group.fieldKeys || []) {
      const candidate = byField.get(fieldKey);
      if (!candidate || seen.has(fieldKey)) continue;
      ordered.push(candidate);
      seen.add(fieldKey);
    }
  }
  for (const candidate of allKeyRecords || []) {
    if (seen.has(candidate.fieldKey)) continue;
    ordered.push(candidate);
    seen.add(candidate.fieldKey);
  }
  return ordered;
}

function buildCategoryKeyMapSection(record, allKeyRecords, groups) {
  const records = orderKeysByGroups((allKeyRecords && allKeyRecords.length > 0) ? allKeyRecords : [record], groups);
  return {
    id: 'category-key-map',
    title: `Category key map (${records.length} keys)`,
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: `All current keys in this category so the reviewer can audit \`${record.fieldKey}\` against grouping, sibling overlap, component ownership, variance policy, and cross-field dependencies instead of judging it in isolation.`,
      },
      {
        kind: 'table',
        headers: ['Field key', 'Group', 'Type · Shape', 'Enum', 'Difficulty', 'Component', 'Variance', 'Constraints'],
        rows: records.map((k) => [
          `\`${k.fieldKey}\``,
          `\`${k.group}\``,
          `${k.contract.type} · ${k.contract.shape}`,
          k.enum.values.length > 0 ? `${k.enum.values.length} · ${k.enum.policy || 'none'}` : '-',
          k.priority.difficulty,
          formatComponentRelation(k),
          k.variance_policy ? `\`${k.variance_policy}\`` : '-',
          formatConstraintCount(k),
        ]),
      },
    ],
  };
}

function buildSearchRoutingSection(record, preview, category) {
  const benchmarkText = 'the category benchmark/example set when available';
  return {
    id: 'search-routing',
    title: 'Search + routing contract',
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: `Audit \`required_level\`, \`availability\`, and \`difficulty\` as a search/routing contract using a "human Googler" yardstick. **Grade for the typical product in this category, not the best-documented flagship** — if only one or two brands publish the value but the rest of the category doesn't, the field is harder, less available, and likely non_mandatory even when the flagship's page hands you the answer.`,
      },
      {
        kind: 'table',
        headers: ['Knob', 'Current value', 'Audit question'],
        rows: [
          ['`priority.required_level`', displayValue(record.priority.required_level), '`mandatory` if a normal buyer can find this in public evidence (spec sheet, manufacturer page, credible review, canonical product render, or stated component identity) for the typical product in this category. `non_mandatory` if the value typically requires lab measurement, product disassembly, or proprietary internal-component identity work that public sources rarely expose. Mandatory + unk blocks publish; non_mandatory + unk resolves quietly.'],
          ['`priority.availability`', displayValue(record.priority.availability), '`always` = credible public sources expose this for nearly every product in the category (spec sheet, manufacturer page, or canonical render carries it as a matter of course). `sometimes` = uneven coverage; flagships usually publish it, budget/older/boutique brands often don\'t. `rare` = only specialist sources (lab benchmark sites, teardown reports, niche reviews) publish this, and only for a small fraction of the category.'],
          ['`priority.difficulty`', displayValue(record.priority.difficulty), '`easy` = answer is in the first SERP for the obvious query, OR visible in any product render / canonical photo (one query, one source). `medium` = page 2 of the same query, a refined query, OR a specific product angle / spec-table section is needed (still single-session). `hard` = multiple queries, multiple sites, light cross-analysis to confirm; the answer still exists in public text once found. `very_hard` = same multi-query effort PLUS deduction across signals (component lineage, indirect inference) OR lab-only / instrumented measurements OR proprietary internal-component identities behind unmarked silicon.'],
          ['Resolved tier bundle', formatTierBundle(preview), 'Does the resolved model/search strength match the difficulty grade for the typical product? A field graded `very_hard` needs the strongest model + reasoning + web search; an `easy` field should not burn that budget.'],
          ['Benchmark-depth target', benchmarkText, 'Use benchmark data to calibrate the difficulty grade and guidance, not as prompt answers. The contract should explain how keyFinder can reproduce those values from public evidence for the median product, not just the flagship.'],
        ],
      },
    ],
  };
}

function buildAuthoringChecklistSection(record, context = {}) {
  const aliasOutOfScope = isAliasOutOfScope(record, context);
  const priorityCurrent = [
    `priority.required_level=${displayValue(record.priority.required_level)}`,
    `priority.availability=${displayValue(record.priority.availability)}`,
    `priority.difficulty=${displayValue(record.priority.difficulty)}`,
  ].join(' | ');
  const contractCurrent = [
    `contract.type=${displayValue(record.contract.type)}`,
    `contract.shape=${displayValue(record.contract.shape)}`,
    `contract.unit=${displayValue(record.contract.unit)}`,
    `contract.rounding=${displayValue(record.contract.rounding)}`,
    `contract.list_rules=${displayValue(record.contract.list_rules)}`,
    `contract.range=${displayValue(record.contract.range)}`,
  ].join(' | ');
  const enumCurrent = [
    `enum.policy=${displayValue(record.enum.policy)}`,
    `enum.values=${record.enum.values.length}`,
    `filter_ui=${displayValue(record.enum.filterUi)}`,
  ].join(' | ');
  const evidenceCurrent = [
    `evidence.min_evidence_refs=${displayValue(record.evidence.min_evidence_refs)}`,
    `evidence.tier_preference=${displayValue(record.evidence.tier_preference)}`,
  ].join(' | ');
  const consumerCurrent = [
    'filter',
    'list',
    'snapshot/spec',
    'compare',
    'metric/card',
    'search/SEO',
  ].join(' | ');
  const unknownCurrent = [
    '`false`/`no`',
    '`n/a` as intentional data',
    'unknown status / no submitted value',
    'blank/omitted',
  ].join(' | ');
  const colorEditionContext = record.ai_assist?.color_edition_context;
  const colorEditionContextCurrent = typeof colorEditionContext?.enabled === 'boolean'
    ? (colorEditionContext.enabled ? 'enabled' : 'disabled')
    : 'No explicit setting';
  const pifPriorityImages = record.ai_assist?.pif_priority_images;
  const pifPriorityImagesCurrent = typeof pifPriorityImages?.enabled === 'boolean'
    ? (pifPriorityImages.enabled ? 'enabled' : 'disabled')
    : 'No explicit setting';

  return {
    id: 'authoring-checklist',
    title: 'Full field contract authoring order',
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: aliasOutOfScope
          ? 'Validate the whole field contract before editing guidance. A strong audit can say "no contract change" when shape, enum policy, requiredness, evidence, and consumer behavior are already correct; still leave guidance/examples/enum cleanup when those are the real improvement. Guidance last: only write `ai_assist.reasoning_note` after scheduling, value shape, enum/filter behavior, consumer-surface intent, unknown/not-applicable states, evidence/source rules, and example coverage are correct.'
          : 'Validate the whole field contract before editing guidance. A strong audit can say "no contract change" when shape, enum policy, requiredness, evidence, and consumer behavior are already correct; still leave guidance/examples/aliases/enum cleanup when those are the real improvement. Guidance last: only write `ai_assist.reasoning_note` after scheduling, value shape, enum/filter behavior, consumer-surface intent, unknown/not-applicable states, evidence/source rules, and example coverage are correct.',
      },
      {
        kind: 'table',
        headers: ['Order', 'Facet', 'Current value', 'Validation question'],
        rows: [
          ['1', 'Scheduling priority', priorityCurrent, 'Does requiredness match publish expectations, does availability match real product coverage, and does difficulty route to the right LLM tier?'],
          ['2', 'Value contract', contractCurrent, 'Does the emitted JSON primitive/list shape match how the value is stored, validated, compared, and filtered?'],
          ['3', 'Enum and filter surface', enumCurrent, aliasOutOfScope
            ? 'Is the enum closed when finite, patterned when open, ordered consistently, and small enough for the consumer filter surface? Keep source phrases out of public enum chips unless intentionally public.'
            : 'Is the enum closed when finite, patterned when open, ordered consistently, and small enough for the consumer filter surface? Keep aliases/source phrases out of public enum chips unless intentionally public.'],
          ['4', 'Consumer-surface impact', consumerCurrent, 'Which surfaces should use this key: filter, list column, snapshot/spec row, comparison row, metric/card, search/SEO, or none? Does the shape support each intended surface without forcing the site to guess?'],
          ['5', 'Unknown / not-applicable states', unknownCurrent, 'Is false/no different from not-applicable and missing evidence? Use boolean only for true two-state facts. Never add `unk` to enum values or data lists; it is an LLM sentinel that should become status/unknown_reason with no submitted value. Use `n/a` only when not-applicable is intentionally stored or public; otherwise prefer blank/omitted as no submitted value. For measured conditional fields like battery_hours, keep the value numeric when hours are proven and leave no submitted value when not applicable or unproven.'],
          ['6', 'Evidence and sources', evidenceCurrent, 'Can the configured source tiers and evidence count actually prove this value without guessing?'],
          ['7', 'Example bank', '5-10 category-local examples', 'Do examples cover happy path, edge, unknown, not-applicable, conflict, and filter-risk cases before the prompt text is trusted?'],
          ['8', 'Color & Edition Context', colorEditionContextCurrent, 'Decision test: does the color × edition × SKU × release_date table help the model decide this field\'s value? If yes, ON. If no, OFF. Two patterns where ON is correct: (A) scalar with variant table as classification context — the field has one value for the whole product, but variant names help the model classify it. Examples: mouse `design` classified by edition names like "Fortnite Edition" → `collaboration`; apparel `collection_type` (Limited / Anniversary / Standard) inferred from variant labels; watch `edition_type`. Contract stays scalar. (B) list of values across variants — the field holds all variant values together, set `contract.shape = list`. Examples: mouse `coating ["matte", "glossy"]` because Black ships matte and White ships glossy; apparel `material ["cotton", "poly_blend"]` (Solid is cotton, Heather is poly); watch `case_material ["steel", "gold"]`; phone `included_charger ["10w", "20w"]` per region. Leave OFF when neither applies: spec invariants where variant data adds nothing — components or measurements that don\'t change with colorway/edition. Examples: mouse `sensor_model` (same PCB across colors), watch `movement_caliber` (same caliber across colorways), phone `processor` (same chip across colors), car `engine_displacement` (same engine across paint), apparel `country_of_origin` (same factory across colorways). Reserved keys (color, edition, SKU, release_date, price, discontinued) are owned by their own finders and never authored here. When ON, paste a one-sentence mechanism note into reasoning_note so the runtime model knows how to use the variant table — as classification context (A) or as per-list-member attribution (B).'],
          ['9', 'PIF Priority Images', pifPriorityImagesCurrent, 'Decision test: can inspecting the default/base product photo (a) provide the answer directly, (b) corroborate text-source claims, or (c) disprove documentation when the photo contradicts what a source says? If any of those — ON. If none — OFF. Best for externally visible features a buyer could read off the canonical product shot — shapes, layouts, counts, port positions, body styles. Examples: mouse `shape` (ergonomic vs ambidextrous), `button_layout`, `side_button_count`; phone `port_count`, `camera_count`, `notch_style`; watch `case_shape`, `crown_position`, `lug_design`; apparel `collar_style`, `pocket_count`, `closure_type`; car `body_style`, `door_count`, `headlight_design`; TV `stand_type`, `port_layout`. OFF for spec/internal values no camera can reveal — measurements, ratings, components, internal identifiers. Examples: mouse `dpi`, `weight_g`, `polling_rate`, `sensor_model`; phone `processor`, `ram_gb`, `battery_capacity_mah`; watch `water_resistance_rating`, `movement_caliber`; apparel `fabric_weight_gsm`, `country_of_origin`; car `horsepower`, `fuel_economy_mpg`; TV `panel_type`, `refresh_rate_hz`. Two important rules: (1) "Priority" refers to PIF\'s ranked default-view photo set, not field importance — never enable just because a field feels important. (2) Only the default/base set is attached; edition-specific images (Fortnite Edition box art, regional packaging variants) are NOT routed by this toggle — if the field needs edition-specific visual interpretation, write that handling into reasoning_note. Missing or unparseable priority images are not negative evidence — absence does not flip the answer to false/no/empty; it just means the model falls back to text evidence alone.'],
          ['10', 'Guidance last', displayValue(record.ai_assist?.reasoning_note), 'Now write paste-ready guidance that fills only the remaining extraction judgment gap, or write "(empty - keep)" when no guidance is needed.'],
        ],
      },
    ],
  };
}

function buildConsumerSurfaceSection(record, context = {}) {
  const aliasOutOfScope = isAliasOutOfScope(record, context);
  return {
    id: 'consumer-surface',
    title: 'Consumer-surface impact',
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: `Spec Factory can store many shapes, but \`${record.fieldKey}\` still needs a declared consumer intent. Do not propose a contract edit just to leave a mark: "no contract change" is correct when the current contract already supports the site, Field Studio, publisher, and keyFinder. Use this section to decide whether the value should become a filter, list column, snapshot/spec row, comparison field, metric/card value, search/SEO token, or no consumer surface at all.`,
      },
      {
        kind: 'table',
        headers: ['Surface', 'Audit question'],
        rows: [
          ['Filter', aliasOutOfScope
            ? 'Should this be a public filter? If enum-backed, are the canonical values public chips, and are source phrases kept out of the chip list?'
            : 'Should this be a public filter? If enum-backed, are the canonical values public chips, and are aliases/source phrases kept out of the chip list?'],
          ['List / hub table', 'Should the value appear in product cards or listing tables? If yes, confirm label, unit, sorting, truncation, and list-vs-scalar display.'],
          ['Snapshot / spec row', 'Should the value appear as a product detail spec? If yes, confirm grouping, display label, units, and display-only/derived status.'],
          ['Comparison', 'Should users compare this value across products? If yes, confirm numeric/date/list semantics and whether higher/lower is better.'],
          ['Metric / card', 'Should the value feed a score, badge, gauge, or summary card? If yes, confirm the source field remains machine-clean and the card derives presentation.'],
          ['Search / SEO', aliasOutOfScope
            ? 'Should the value become searchable or appear in page text? If yes, confirm canonical terms so source wording does not pollute stored values.'
            : 'Should the value become searchable or appear in page text? If yes, confirm canonical terms and aliases so source wording does not pollute stored values.'],
          ['None', 'If no consumer surface should use this key, say so explicitly; the key can still exist for publisher gates, prompt context, or future derivation.'],
        ],
      },
    ],
  };
}

function buildContractSchemaSection(record, schemaCatalog, context = {}) {
  const rule = record.rawRule || {};
  const headers = ['Parameter', 'Current value', 'Possible values', 'Why it matters'];
  const aliasOutOfScope = isAliasOutOfScope(record, context);
  // WHY: dependency-toggle entries (variant_dependent, product_image_dependent)
  // are category-summary concerns, not per-key field knobs — exclude them so the
  // per-key brief stays focused on the field's own contract.
  const filteredCatalog = schemaCatalog.filter((entry) => {
    if (entry.studioWidget === 'dependency_toggle') return false;
    if (aliasOutOfScope && entry.path === 'aliases') return false;
    return true;
  });
  const rows = filteredCatalog.map((entry) => {
    const applies = appliesTo(entry, rule);
    const current = applies ? describeCurrent(entry, rule) : '(n/a)';
    const possible = describePossibleValues(entry);
    const whyItMatters = entry.doc;
    return [`\`${entry.path}\` \u00B7 ${entry.label}`, current, possible, whyItMatters];
  });

  return {
    id: 'contract-schema',
    title: 'Contract schema \u2014 every possible parameter',
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Every knob the compiled field rule supports. The **Current value** column reflects what is configured for THIS key today. `(unset)` means the knob exists but is not configured. `(n/a)` means the knob does not apply given the current contract (e.g. `list_rules.sort` only applies when `contract.shape = list`).',
      },
      { kind: 'table', headers, rows },
    ],
  };
}

function buildEnumSection(record) {
  const e = record.enum;
  if (!Array.isArray(e.values) || e.values.length === 0) return null;

  const blocks = [];
  blocks.push({
    kind: 'paragraph',
    text: `**Policy:** \`${e.policy || '(none)'}\` \u00B7 **Values:** ${e.values.length} \u00B7 **Filter UI:** \`${e.filterUi || 'n/a'}\`${e.source ? ` \u00B7 **Source:** \`${e.source}\`` : ''}`,
  });

  const analysis = e.analysis;
  if (analysis?.topSignature) {
    blocks.push({
      kind: 'paragraph',
      text: `Top structural signature: \`${analysis.topSignature.signature}\` \u00B7 covers ${analysis.topSignature.coveragePct}% of values`,
    });
  }
  if (analysis?.signatureGroups && analysis.signatureGroups.length > 1) {
    blocks.push({
      kind: 'table',
      headers: ['Signature', 'Count', 'Examples'],
      rows: analysis.signatureGroups.slice(0, 8).map((g) => [
        g.signature,
        String(g.count),
        g.values.slice(0, 3).join(' | ') + (g.values.length > 3 ? ' \u2026' : ''),
      ]),
    });
  }

  blocks.push({ kind: 'subheading', level: 4, text: 'All values' });
  blocks.push({ kind: 'paragraph', text: e.values.map((v) => `\`${v}\``).join(', ') });

  if (analysis?.suspiciousValues?.length > 0) {
    blocks.push({ kind: 'subheading', level: 4, text: 'Suspicious values' });
    blocks.push({
      kind: 'bulletList',
      items: analysis.suspiciousValues.map((s) => `\`${s.value}\` \u2014 ${s.reason}`),
    });
  }

  return {
    id: 'enum',
    title: `Enum (${e.values.length} values)`,
    level: 2,
    blocks,
  };
}

function buildExampleBankSection(record, category) {
  return {
    id: 'example-bank',
    title: 'Example bank recipe',
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: `For \`${record.fieldKey}\`, build a 5-10 product example bank before finalizing the rule. Use this category's benchmark data when available, then published candidates/product JSON, seed products, current component-source context, and source research. For brand-new categories, use representative products from the market to create the first calibration set. Do not paste benchmark answers into the live prompt; use them to author the contract and guidance.`,
      },
      {
        kind: 'note',
        tone: 'info',
        text: `Live validation rule for this key: use model knowledge to form hypotheses, but do not finalize this key's enum values, example bank, technical guidance, component claims, search hints, evidence expectations, or difficulty rating from memory alone. Validate this key against live public sources before proposing changes: check 3-5 representative products for ordinary cases, add 1-2 edge or rare products when the key has special values or filter-risk values, prefer manufacturer pages, official docs, datasheets, standards bodies, and instrumented review labs, and use retailer/spec database/community sources only as fallback or corroboration. Cite the sources checked under "References spot-checked". Use benchmark data only to understand the target answer shape and quality bar; do not copy benchmark answers into the live prompt or treat benchmark data as a substitute for public evidence.`,
      },
      {
        kind: 'table',
        headers: ['Bucket', 'Count', 'What it proves'],
        rows: [
          ['Common happy path', '2-3', `Normal ${category} products where the value is present and easy to source.`],
          ['Edge / rare value', '1-2', 'Boundary values, rare enum values, unusual units, unusually long lists, or uncommon component variants.'],
          ['Unknown / absent evidence', '1', 'A product where honest `unk` is the correct outcome because sources do not prove the field.'],
          ['Conflict / ambiguity', '1', 'Two credible sources disagree, labels are reused, or the field is often confused with a sibling key.'],
          ['Filter-risk', '1-2', 'Values that would create new enum chips, range extremes, pattern outliers, or consumer-facing clutter.'],
          ['Benchmark carry-forward', 'as available', 'Use hand-entered benchmark cells as calibration for the rule, then generalize the same recipe to every category.'],
        ],
      },
    ],
  };
}

function componentSourceRowsMayIncludeLine(record, facet) {
  if (facet) {
    return `- component_sources rows must not include "${record.fieldKey}" because it is an auto-generated identity facet of "${facet.componentType}".`;
  }
  return `- component_sources rows may include "${record.fieldKey}" in roles.properties.`;
}

function buildMappingStudioPatchGuidance(record, { identity, facet, aliasOutOfScope }) {
  const lines = [
    '- Component Source Mapping belongs under patch.component_sources. Use it for component type and property variance only. Component entity names, makers, and source URLs are outside this Field Studio patch.',
  ];
  if (aliasOutOfScope) {
    lines.push(`- Do not author \`field_overrides.${record.fieldKey}.aliases\`; leave aliases blank/absent for component identity and auto facet keys.`);
  }
  if (facet) {
    lines.push(`- \`${record.fieldKey}\` is an auto-generated identity facet of \`${facet.componentType}\`; do not add it to \`component_sources.${facet.componentType}.roles.properties[]\` and do not author aliases for it.`);
  }
  lines.push(
    `- For every key, decide from scratch whether it is a component identity, component attribute, or standalone. Do not wait for an existing component DB property before proposing a component attribute. If this field should inherit from a resolved component, patch component_sources by adding "${record.fieldKey}" to roles.properties[] for the chosen component type. If no, leave component_sources unchanged and explain why it stays standalone.`,
    '- A component identity patch may also define the component\'s normal product-backed attributes and strictly component-only attributes in the same component_sources row. Product-backed attributes have component_only omitted or false and publish as product fields. Strictly component-only attributes set "component_only": true and stay scoped to the component DB only.',
    '- Patch ownership: when component_type equals the audited field_key, the importer treats roles.properties[] as the complete replacement roster for that component and removes omitted stale attributes. When component_type belongs to another parent, the importer only upserts the audited property row so sibling attributes stay intact.',
    '- Component source parameters: component_type is the parent component key and must match a self-locked parent field_overrides.<component_type>.enum.source = "component_db.<component_type>"; roles.properties is the attribute list. Source-level priority is retired; keep priority under field_overrides.<field_key>.priority.',
    '- Component identity keys cannot be open enum keys. They must self-lock with enum.source = "component_db.<same_key>" and the matching component_sources[].component_type.',
    '- For component identity keys, the component DB is already the lookup/lock path. Use `open_prefer_known` by default with `enum.source = "component_db.<same_key>"` so known rows are preferred and evidence-backed new entities can be marked for curation. Use `closed` only for genuinely finite/static component sets where every new entity must be pre-curated before extraction.',
  );
  if (identity) {
    lines.push(`- \`${record.fieldKey}_brand\` and \`${record.fieldKey}_link\` are auto-generated identity facets when "${record.fieldKey}" is the component identity; do not list \`${record.fieldKey}_brand\` or \`${record.fieldKey}_link\` under \`component_sources.${record.fieldKey}.roles.properties[]\`. Keep them out of the property roster and record them as \`identity_facet\` in audit.adjacent_key_roster_decisions[].`);
  }
  lines.push(
    '- Decide component membership by semantic ownership and invariance first, not by the current primitive type. Boolean, date, url, range, mixed_number_range, and list-shaped fields can be component attributes when the value is invariant for the component. If the semantic ownership is component-backed but the patch schema cannot encode the needed shape or type, leave the unsupported edit out of patch.component_sources and record it under audit.schema_blocked_component_attributes[] with field_key, component_type, expected_type, expected_shape, variance_policy, and reason.',
    '- Component attribute parameters: field_key is the product field or component-only attribute key; type is string, number, integer, boolean, date, url, range, or mixed_number_range; unit is the display/storage unit for numeric values; variance_policy controls how component values relate to product values; tolerance is an optional numeric margin for upper_bound, lower_bound, or range checks; constraints are cross-property rules; component_only true means the attribute is component-scoped and should not become a product field. Component-only attributes do not require matching field_overrides entries.',
  );
  if (identity) {
    lines.push('- For a component identity audit, scan name-prefixed and adjacent keys (brand, link, type, date, latency, settings, boolean feature flags, mode-specific siblings) and record every decision in audit.adjacent_key_roster_decisions[] as component_property, component_only_property, identity_facet, standalone, or schema_blocked. Identity audits own the full roster; do not leave adjacent keys unclassified.');
  }
  lines.push(
    '- UI control mapping: Variance = Authoritative -> "variance_policy": "authoritative"; Variance = Upper Bound -> "variance_policy": "upper_bound"; Variance = Lower Bound -> "variance_policy": "lower_bound"; Variance = Range -> "variance_policy": "range"; Allow Product Override -> "variance_policy": "override_allowed"; Tolerance -> "tolerance": 5; Component only / scoped -> "component_only": true.',
    `- Enum Data Lists belong under patch.data_lists. Use only field and manual_values; return the final ordered canonical values when replacing a list; keep source phrases out of public chips${aliasOutOfScope ? '' : ' and keep aliases out of public chips'}. List-level priority, normalize settings, and AI guidance are retired; key priority and extraction guidance stay under patch.field_overrides.${record.fieldKey}.`,
  );
  return lines.join('\n');
}

function keyNavigatorPrimaryLine(record, aliasOutOfScope) {
  if (aliasOutOfScope) {
    return `- Field contract, priority, evidence, enum policy, constraints, search_hints, and ai_assist belong under patch.field_overrides.${record.fieldKey}.`;
  }
  return `- Field contract, priority, evidence, enum policy, constraints, field-name aliases for standalone/product fields, search_hints, and ai_assist belong under patch.field_overrides.${record.fieldKey}.`;
}

function buildComponentDataGapRule(aliasOutOfScope) {
  return aliasOutOfScope
    ? '- This audit is for Field Studio setup only. If live research exposes missing/stale component entities, rows, properties, or source URLs, mention them after the JSON as a separate component-data gap. Do not put those row edits into the Field Studio patch.'
    : '- This audit is for Field Studio setup only. If live research exposes missing/stale component entities, rows, properties, or source URLs, mention them after the JSON as a separate component-data gap. Do not put those row edits into the Field Studio patch.';
}

function buildPerKeyLlmAuditPromptSection(record, category, navigatorOrdinal = '', componentSources = [], allKeyRecords = []) {
  const ordinalNumber = navigatorOrdinal ? Number(navigatorOrdinal) : null;
  const fieldToken = navigatorOrdinal ? `${navigatorOrdinal}-${record.fieldKey}` : record.fieldKey;
  const context = { componentSources, allKeyRecords };
  const identity = isComponentIdentityRecord(record);
  const facet = autoFacetInfo(record, context);
  const aliasOutOfScope = isAliasOutOfScope(record, context);
  const fileName = expectedFieldStudioPatchFileName({
    category,
    fieldKey: record.fieldKey,
    navigatorOrdinal: ordinalNumber,
  });
  const ordinalJson = ordinalNumber == null ? 'null' : String(ordinalNumber);
  const exampleJson = JSON.stringify(buildPatchExample(record, category, ordinalNumber, componentSources), null, 2);
  const componentRowsLine = componentSourceRowsMayIncludeLine(record, facet);
  const mappingStudioPatchGuidance = buildMappingStudioPatchGuidance(record, { identity, facet, aliasOutOfScope });
  const keyNavigatorPatchGuidance = keyNavigatorPrimaryLine(record, aliasOutOfScope);
  const componentDataGapRule = buildComponentDataGapRule(aliasOutOfScope);

  return {
    id: 'llm-audit-prompt',
    title: 'Copy/paste LLM audit prompt',
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: `Paste this per-key doc into an LLM, then paste the prompt below. The first deliverable must be a strict JSON patch first, named ${fileName}, so the returned file can be imported directly into Field Studio settings.`,
      },
      {
        kind: 'codeBlock',
        lang: 'text',
        text: `You are auditing one Spec Factory field key: ${category}.${record.fieldKey}.

Use the per-key doc above as the source of truth. Your job is not to extract a product value. Your job is to improve this key's Field Studio setup: Mapping Studio settings and Key Navigator settings only. Audit the category key as if the human is configuring the key in Field Studio. Do not ask for concrete component database/entity row edits.

Return a downloadable JSON file first named ${fileName}. If your interface supports file artifacts, create that file, verify it exists, and link it before any prose. If your interface cannot attach files, put the exact file contents in a fenced json block before any commentary. Do not return markdown, bullets, comments, trailing commas, or prose inside the JSON.

The JSON must be strict and importable:
- schema_version must be "field-studio-patch.v1".
- category must be "${category}".
- field_key must be "${record.fieldKey}".
- navigator_ordinal must be ${ordinalJson}.
- verdict must be one of keep, minor_revise, major_revise, schema_decision.
- patch may contain only data_lists, field_overrides, and component_sources.
- Omit every setting path that should stay as-is. Do not use prose sentinels.
- null means clear this setting. Arrays replace arrays. Objects deep-merge.
- field_overrides may patch only "${record.fieldKey}".
- data_lists rows must use field "${record.fieldKey}".
- data_lists rows use only field and manual_values.
- component_sources rows use only component_type and roles.properties[].
- component_sources[].roles may contain only properties.
- component_sources[].roles.properties[] rows may contain only field_key, type, unit, variance_policy, tolerance, constraints, and component_only.
${componentRowsLine}
- audit may include adjacent_key_roster_decisions[] and schema_blocked_component_attributes[] for structural handoff notes that are not direct Field Studio edits.
- Enum policy/source shape: open has no enum source; closed and open_prefer_known use the key-matched list data_lists.${record.fieldKey}. Do not invent custom list names.

Expected file: ${fileName}
Sort/key token: ${fieldToken}

Use this exact envelope. Delete any empty arrays/unchanged paths before returning a real patch, but keep the same strict shape:

\`\`\`json
${exampleJson}
\`\`\`

For a keep verdict, return the same envelope with "patch": {}.

Mapping Studio patch guidance:
${mappingStudioPatchGuidance}

Key Navigator patch guidance:
${keyNavigatorPatchGuidance}
- Use ai_assist.color_edition_context only when color/edition identity helps reject wrong-variant evidence without ambiguity.
- Use ai_assist.pif_priority_images only when default/base priority-view images add visual evidence value.
- Put final paste-ready prompt guidance in ai_assist.reasoning_note.

Live validation:
- Use model knowledge to form hypotheses, then validate this key with live public sources before finalizing enum values, examples, technical claims, component-source settings, search hints, evidence expectations, or difficulty.
- Check 3-7 manufacturer, official documentation, standards, datasheet, credible lab, or authorized distributor sources.
- Check 5-10 representative products/classes when the key has meaningful variants or filter-risk values.
- Use benchmark data only to understand target shape and quality. Do not copy benchmark answers into the live prompt or treat benchmarks as public evidence.

After the JSON file, include a short prose audit with: verdict, key risks, References spot-checked, example bank, and open questions.

Rules:
${componentDataGapRule}
- Keep the JSON compact enough to review in one editor pane.`,
      },
    ],
  };
}
function formatPropertyPreview(properties) {
  const entries = Object.entries(properties || {});
  if (entries.length === 0) return '-';
  return entries.slice(0, 8).map(([key, value]) => `${key}=${Array.isArray(value) ? value.join('+') : String(value)}`).join(' | ')
    + (entries.length > 8 ? ' | ...' : '');
}

function formatPolicyPreview(policies) {
  const entries = Object.entries(policies || {});
  if (entries.length === 0) return '-';
  return entries.slice(0, 8).map(([key, value]) => `${key}=${value}`).join(' | ')
    + (entries.length > 8 ? ' | ...' : '');
}

function formatConstraintPreview(constraints) {
  const entries = Object.entries(constraints || {});
  if (entries.length === 0) return '-';
  return entries.slice(0, 8).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(' | ') : String(value)}`).join(' | ')
    + (entries.length > 8 ? ' | ...' : '');
}

function sourceList(value) {
  return Array.isArray(value) && value.length > 0 ? value.map((entry) => `\`${entry}\``).join(', ') : '-';
}

function formatComponentSourceCell(value) {
  if (value === true) return '`true`';
  if (value === false) return '`false`';
  if (Array.isArray(value)) return sourceList(value);
  if (value === null || value === undefined || value === '') return '-';
  return `\`${String(value)}\``;
}

function buildComponentSourceMappingBlocks(record, componentSources) {
  const c = record.component || record.componentDbProperty;
  if (!c?.type) return [];
  const source = findComponentSource(componentSources, c.type);
  if (!source) {
    return [{
      kind: 'note',
      tone: 'warn',
      text: `No current \`component_sources.${c.type}\` mapping row was loaded. If this key should be component-backed, the auditor must create a component source row with \`component_type\` and \`roles.properties[]\`.`,
    }];
  }

  const roles = source.roles || {};
  const properties = Array.isArray(roles.properties) ? roles.properties : [];
  const displaySource = buildComponentSourcePatchExample({ component: { type: c.type } }, [source])[0] || {
    component_type: componentSourceType(source),
    roles: { properties: [] },
  };
  const displayPatchSource = buildComponentSourcePatchExample(record, [source])[0] || displaySource;
  const blocks = [
    { kind: 'subheading', level: 4, text: `Current component source mapping: ${c.type}` },
    {
      kind: 'paragraph',
      text: 'This is the Mapping Studio row that declares the component type and property mappings. Component entity names, makers, aliases, and URLs are outside this Field Studio patch.',
    },
    {
      kind: 'table',
      headers: ['Component', 'Property count'],
      rows: [[
        `\`${componentSourceType(source)}\``,
        String(properties.length),
      ]],
    },
    {
      kind: 'table',
      headers: ['Property field_key', 'Type', 'Unit', 'Variance policy', 'Component-only', 'Constraints', 'Relevant to this key?'],
      rows: properties.length > 0
        ? properties.map((property) => [
          formatComponentSourceCell(property.field_key || property.key),
          formatComponentSourceCell(property.type),
          formatComponentSourceCell(property.unit),
          formatComponentSourceCell(property.variance_policy),
          formatComponentSourceCell(property.component_only === true),
          formatComponentSourceCell(property.constraints),
          (property.field_key || property.key) === record.fieldKey ? 'yes' : '-',
        ])
        : [['-', '-', '-', '-', '-', '-', '-']],
    },
    ...(record.componentDbProperty ? [{
      kind: 'note',
      tone: 'info',
      text: `Patch example below keeps the current \`${c.type}\` mapping and appends \`${record.fieldKey}\` as a candidate component property row because the component DB already carries that property. Remove that row if the from-scratch audit decides this field should remain product-specific.`,
    }] : []),
    {
      kind: 'codeBlock',
      lang: 'json',
      text: JSON.stringify(displayPatchSource, null, 2),
    },
  ];
  return blocks;
}

function buildFromScratchComponentDecisionBlocks(record) {
  return [
    { kind: 'subheading', level: 4, text: 'From-scratch component setup decision' },
    {
      kind: 'paragraph',
      text: `Decide this key from scratch, even when current Mapping Studio rows are empty: Component identity, Component attribute, or Standalone. Component identity means the field value is the canonical component name and should use \`enum.source = component_db.<component_type>\`. Component attribute means this field belongs under a parent component and should be listed in \`component_sources.<component_type>.roles.properties[]\` with \`field_key\`, \`type\`, \`unit\`, \`variance_policy\`, and constraints as needed. Standalone means normal Field Navigator/Data List setup with no component_sources row. Make the membership decision from semantic ownership and invariance first; boolean, date, range, url, and list-shaped fields can still be component attributes when the value belongs to the component.`,
    },
    {
      kind: 'paragraph',
      text: `Current component data is only evidence for the setup decision. A valid from-scratch setup can create a component identity or component attribute even when no current component DB property exists.`,
    },
  ];
}

function buildComponentSection(record, componentInventory, componentSources = []) {
  const c = record.component;
  const componentGap = record.componentDbProperty;
  const relevantType = c?.type || componentGap?.type;
  const blocks = [];

  blocks.push(...buildFromScratchComponentDecisionBlocks(record));

  if (!c && componentGap) {
    blocks.push({
      kind: 'note',
      tone: 'info',
      text: `Existing component DB hint: \`${record.fieldKey}\` appears as a property in \`component_db/${componentGap.type}.json\`, but it is not currently mapped in \`component_sources.${componentGap.type}.roles.properties[]\`. Treat that as evidence to consider, not proof that this key must be component-backed. Concrete component entity values stay outside this Field Studio patch.`,
    });
  } else if (!c) {
    blocks.push({ kind: 'paragraph', text: 'Standalone \u2014 no component relation. This key is not an identity for any `component_db/<type>.json` and does not appear as a subfield on any component entity.' });
  } else if (c.relation === 'parent') {
    blocks.push({
      kind: 'paragraph',
      text: `**IS the ${c.type} component identity.** The value of this field IS the canonical component name for this category. When resolved on a product, the component\u2019s subfield values flow through \`PRODUCT_COMPONENTS\` on every future prompt.`,
    });
    const invEntry = (componentInventory || []).find((i) => i.type === c.type);
    if (invEntry) {
      blocks.push({
        kind: 'paragraph',
        text: `Component DB: \`component_db/${c.type}.json\` \u00B7 ${invEntry.entityCount} known entities \u00B7 subfields: ${invEntry.subfields.length === 0 ? '(none)' : invEntry.subfields.map((f) => `\`${f}\``).join(', ')}`,
      });
    }
  } else if (c.relation === 'subfield_of') {
    blocks.push({
      kind: 'paragraph',
      text: `**Subfield of the ${c.type} component.** When the \`${c.type}\` identity is resolved on a product, this value flows into the prompt as part of \`PRODUCT_COMPONENTS\`. For this audit, recommend only Field Studio source-mapping settings; concrete component row edits are separate component-data cleanup.`,
    });
  }

  const inventory = componentInventory || [];
  blocks.push({ kind: 'subheading', level: 4, text: 'All current components' });
  if (inventory.length === 0) {
    blocks.push({ kind: 'paragraph', text: '_No component DB inventory was loaded for this category._' });
  } else {
    blocks.push({
      kind: 'table',
      headers: ['Component', 'Entities', 'Identity fields', 'Subfields', 'Component-only properties', 'Field-backed DB properties not currently mapped', 'DB-only properties', 'Relevant to this key?'],
      rows: inventory.map((entry) => [
        `\`${entry.type}\``,
        String(entry.entityCount),
        formatList(entry.identityFields),
        formatList(entry.subfields),
        formatList(entry.componentOnlyProperties),
        formatList(entry.unmappedFieldProperties),
        formatList(entry.dbOnlyProperties),
        relevantType === entry.type ? 'yes' : '-',
      ]),
    });
  }

  const relevant = relevantType ? inventory.find((entry) => entry.type === relevantType) : null;
  blocks.push(...buildComponentSourceMappingBlocks(record, componentSources));
  if (relevant) {
    blocks.push({ kind: 'subheading', level: 4, text: `Relevant component detail: ${relevantType}` });
    blocks.push({
      kind: 'paragraph',
      text: `Audit component variance here too. Confirm whether \`${record.fieldKey}\` should inherit from the \`${relevantType}\` component database, whether the field-level \`variance_policy\` (\`${record.variance_policy || '(unset)'}\`) matches component property policy, and whether component constraints are present on the right property.`,
    });
    blocks.push({
      kind: 'table',
      headers: ['Entity', 'Maker', 'Aliases', 'Properties', 'Variance policies', 'Constraints'],
      rows: relevant.entities.slice(0, 50).map((entity) => [
        entity.name || '-',
        entity.maker || '-',
        formatList(entity.aliases),
        formatPropertyPreview(entity.properties),
        formatPolicyPreview(entity.variance_policies),
        formatConstraintPreview(entity.constraints),
      ]),
    });
    if (relevant.entities.length > 50) {
      blocks.push({ kind: 'paragraph', text: `(first 50 of ${relevant.entities.length} shown; full list lives in \`component_db/${relevant.type}.json\`)` });
    }
  }

  return {
    id: 'component',
    title: 'Component relation',
    level: 2,
    blocks,
  };
}

function collectConstraints(allKeyRecords, record) {
  const records = (allKeyRecords && allKeyRecords.length > 0) ? allKeyRecords : [record];
  return records.flatMap((key) => (key.constraints || []).map((constraint) => ({
    owner: key.fieldKey,
    ownerGroup: key.group,
    ...constraint,
  })));
}

function constraintTouchesField(constraint, fieldKey) {
  return constraint.left === fieldKey || constraint.right === fieldKey;
}

function buildCrossFieldSection(record, allKeyRecords) {
  const constraints = collectConstraints(allKeyRecords, record);
  const touching = constraints.filter((constraint) => constraintTouchesField(constraint, record.fieldKey));
  return {
    id: 'cross-field',
    title: `Cross-field constraints (${constraints.length})`,
    level: 2,
    blocks: [
      {
        kind: 'note',
        tone: 'info',
        text: 'Constraints render into live keyFinder prompts via `PRIMARY_CROSS_FIELD_CONSTRAINTS`. This map includes every category constraint, and marks which rows touch this key so a dependency authored on a sibling field is still visible here.',
      },
      constraints.length === 0
        ? { kind: 'paragraph', text: '_No cross-field constraints are configured in this category._' }
        : {
          kind: 'table',
          headers: ['Owner key', 'Owner group', 'Constraint', 'Op', 'Relation to this key'],
          rows: constraints.map((c) => [
            `\`${c.owner}\``,
            `\`${c.ownerGroup || 'ungrouped'}\``,
            `\`${c.raw}\``,
            `\`${c.op}\``,
            constraintTouchesField(c, record.fieldKey) ? 'touches this key' : 'category context',
          ]),
        },
      touching.length === 0
        ? { kind: 'paragraph', text: `No constraints directly touch \`${record.fieldKey}\`; use the category map above to spot grouping or dependency opportunities.` }
        : { kind: 'paragraph', text: `${touching.length} constraint(s) touch this key. Confirm direction, target authority, group placement, and whether the relationship belongs in guidance or only in the contract.` },
    ],
  };
}

function buildSiblingsSection(record, siblingsInGroup) {
  const others = (siblingsInGroup || []).filter((s) => s.fieldKey !== record.fieldKey);
  if (others.length === 0) {
    return {
      id: 'siblings',
      title: 'Sibling fields in this group',
      level: 2,
      blocks: [{ kind: 'paragraph', text: '_This key is the only member of its group in the compiled rule set._' }],
    };
  }
  return {
    id: 'siblings',
    title: `Sibling fields in this group (${others.length})`,
    level: 2,
    blocks: [
      { kind: 'paragraph', text: `Other keys in \`${record.group}\`. Useful context when deciding whether this field\u2019s scope overlaps a neighbor\u2019s.` },
      {
        kind: 'table',
        headers: ['Field key', 'Display', 'Type \u00B7 Shape', 'Difficulty', 'Guidance?'],
        rows: others.map((s) => [
          `\`${s.fieldKey}\``,
          s.displayName,
          `${s.contract.type} \u00B7 ${s.contract.shape}`,
          s.priority.difficulty,
          String(s.ai_assist?.reasoning_note || '').trim() ? 'y' : '\u2014',
        ]),
      },
    ],
  };
}

function redactAliasPreviewText(text, aliasOutOfScope) {
  const value = String(text || '');
  if (!aliasOutOfScope) return value;
  return value
    .split(/\r?\n/)
    .filter((line) => !/\balias/i.test(line))
    .join('\n')
    .trim();
}

function slotDescription(desc, aliasOutOfScope) {
  if (!aliasOutOfScope || desc.slot !== 'PRIMARY_FIELD_CONTRACT') return desc.note;
  return 'Type, shape, unit, rounding, list rules, enum values + policy, variance policy. Everything the LLM needs to emit a well-typed value.';
}

function buildFullPromptSection(preview, context = {}, record = null) {
  if (!preview || preview.reserved || !preview.systemPrompt) return null;
  const aliasOutOfScope = record ? isAliasOutOfScope(record, context) : false;
  const promptText = redactAliasPreviewText(preview.systemPrompt, aliasOutOfScope);
  return {
    id: 'full-prompt',
    title: 'Full compiled preview prompt',
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: 'The exact text keyFinder would send for this key. Product identity is a placeholder (`<BRAND>` / `<MODEL>`) so the shape is visible without a real product. Runtime slots like `PRODUCT_COMPONENTS`, `PRODUCT_SCOPED_FACTS`, and `VARIANT_INVENTORY` render empty when the placeholder has no resolved context.',
      },
      { kind: 'codeBlock', lang: 'text', text: promptText },
    ],
  };
}

function buildPerSlotSection(preview, context = {}, record = null) {
  if (!preview || preview.reserved || !preview.slotRendering) return null;
  const aliasOutOfScope = record ? isAliasOutOfScope(record, context) : false;
  const slot = preview.slotRendering;
  const blocks = [
    {
      kind: 'paragraph',
      text: 'Per-slot breakdown of the key-specific portions of the prompt. Each block below is the exact text the renderer produced for its slot. Empty blocks mean the slot is unauthored or the knob is off.',
    },
  ];
  for (const desc of SLOT_DESCRIPTIONS) {
    const text = redactAliasPreviewText(slot[desc.previewKey], aliasOutOfScope);
    blocks.push({ kind: 'subheading', level: 4, text: `\`{{${desc.slot}}}\`` });
    blocks.push({ kind: 'paragraph', text: slotDescription(desc, aliasOutOfScope) });
    if (text) {
      blocks.push({ kind: 'codeBlock', lang: 'text', text });
    } else {
      blocks.push({ kind: 'paragraph', text: '_empty \u2014 unauthored or knob off_' });
    }
  }
  // RETURN_JSON_SHAPE is composed at prompt-build time; not in slot rendering but worth mentioning.
  blocks.push({ kind: 'subheading', level: 4, text: '`{{RETURN_JSON_SHAPE}}`' });
  blocks.push({ kind: 'paragraph', text: 'Response envelope composed from the primary + passenger list. Appears verbatim at the end of the full prompt above.' });
  return {
    id: 'per-slot',
    title: 'Per-slot breakdown',
    level: 2,
    blocks,
  };
}

function buildReservedOwnerSection(preview) {
  if (!preview?.reserved) return null;
  return {
    id: 'reserved-owner',
    title: `Owned by ${preview.ownerLabel}`,
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: `This key does not flow through keyFinder \u2014 it is handled by **${preview.ownerLabel}** (finder module \`${preview.owner}\`). The per-key rule shape is still rendered above so editors have one doc per field, but the \"Full compiled preview prompt\" section is intentionally omitted (there is no keyFinder prompt to show). To see the actual prompt this key triggers, look at the owning finder's module settings.`,
      },
    ],
  };
}

/**
 * @param {object} keyRecord — one entry from extractReportData().keys
 * @param {object} opts
 * @param {string} opts.category
 * @param {string} opts.generatedAt
 * @param {Array}  opts.schemaCatalog         — FIELD_RULE_SCHEMA
 * @param {Array}  [opts.siblingsInGroup]     — other keyRecords in the same group
 * @param {Array}  [opts.componentInventory]  — reportData.components
 * @param {object} opts.preview               — from composePerKeyPromptPreview
 */
export function buildPerKeyDocStructure(keyRecord, {
  category,
  generatedAt,
  schemaCatalog,
  siblingsInGroup = [],
  allKeyRecords = [],
  groups = [],
  componentInventory = [],
  componentSources = [],
  preview,
  navigatorOrdinal = '',
  benchmark = null,
}) {
  const context = { componentSources, allKeyRecords };
  const sections = [
    buildHeaderSection(keyRecord, category, generatedAt, preview),
    buildPurposeSection(keyRecord, preview, category),
    buildSuccessBarSection(keyRecord, context),
    buildBenchmarkDiffSection(keyRecord, benchmark),
    buildSearchRoutingSection(keyRecord, preview, category),
    buildAuthoringChecklistSection(keyRecord, context),
    buildCategoryKeyMapSection(keyRecord, allKeyRecords, groups),
    buildContractSchemaSection(keyRecord, schemaCatalog, context),
    buildConsumerSurfaceSection(keyRecord, context),
    buildEnumSection(keyRecord),
    buildComponentSection(keyRecord, componentInventory, componentSources),
    buildCrossFieldSection(keyRecord, allKeyRecords),
    buildSiblingsSection(keyRecord, siblingsInGroup),
    buildExampleBankSection(keyRecord, category),
    buildPerKeyLlmAuditPromptSection(keyRecord, category, navigatorOrdinal, componentSources, allKeyRecords),
    buildFullPromptSection(preview, context, keyRecord),
    buildPerSlotSection(preview, context, keyRecord),
    buildReservedOwnerSection(preview),
  ].filter(Boolean);

  return {
    meta: {
      fieldKey: keyRecord.fieldKey,
      displayName: keyRecord.displayName,
      group: keyRecord.group,
      category,
      generatedAt,
      reserved: Boolean(preview?.reserved),
      navigatorOrdinal,
    },
    sections,
  };
}
