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

const SLOT_DESCRIPTIONS = Object.freeze([
  { slot: 'PRIMARY_FIELD_KEY', previewKey: 'header', note: 'Field key + display name header.' },
  { slot: 'PRIMARY_FIELD_GUIDANCE', previewKey: 'guidance', note: '`ai_assist.reasoning_note` prose. Empty when unauthored.' },
  { slot: 'PRIMARY_FIELD_CONTRACT', previewKey: 'contract', note: 'Type, shape, unit, rounding, list rules, enum values + policy, variance policy, aliases. Everything the LLM needs to emit a well-typed value.' },
  { slot: 'PRIMARY_SEARCH_HINTS', previewKey: 'searchHints', note: 'Preferred domain_hints + query_terms. Empty when unauthored or knob off.' },
  { slot: 'PRIMARY_CROSS_FIELD_CONSTRAINTS', previewKey: 'crossField', note: 'Cross-field relational constraints (lte/gte/eq/requires_*), normalized from `constraints` DSL and structured `cross_field_constraints`.' },
  { slot: 'PRIMARY_COMPONENT_KEYS', previewKey: 'componentRel', note: 'Relation pointer — "This key IS the sensor component identity" or "belongs to the sensor component on this product".' },
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

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '(unset)';
  if (Array.isArray(value)) return value.length === 0 ? '[]' : value.map((v) => `\`${v}\``).join(', ');
  if (typeof value === 'object') return `\`${JSON.stringify(value)}\``;
  return `\`${String(value)}\``;
}

function buildAuthoringChecklistSection(record) {
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

  return {
    id: 'authoring-checklist',
    title: 'Full field contract authoring order',
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Validate the whole field contract before editing guidance. Guidance last: only write `ai_assist.reasoning_note` after scheduling, value shape, enum/filter behavior, evidence/source rules, and example coverage are correct.',
      },
      {
        kind: 'table',
        headers: ['Order', 'Facet', 'Current value', 'Validation question'],
        rows: [
          ['1', 'Scheduling priority', priorityCurrent, 'Does requiredness match publish expectations, does availability match real product coverage, and does difficulty route to the right LLM tier?'],
          ['2', 'Value contract', contractCurrent, 'Does the emitted JSON primitive/list shape match how the value is stored, validated, compared, and filtered?'],
          ['3', 'Enum and filter surface', enumCurrent, 'Is the enum closed when finite, patterned when open, and small enough for the consumer filter surface?'],
          ['4', 'Evidence and sources', evidenceCurrent, 'Can the configured source tiers and evidence count actually prove this value without guessing?'],
          ['5', 'Example bank', '5-10 category-local examples', 'Do examples cover happy path, edge, unknown, conflict, and filter-risk cases before the prompt text is trusted?'],
          ['6', 'Guidance last', displayValue(record.ai_assist?.reasoning_note), 'Now write paste-ready guidance that fills only the remaining extraction judgment gap.'],
        ],
      },
    ],
  };
}

function buildContractSchemaSection(record, schemaCatalog) {
  const rule = record.rawRule || {};
  const headers = ['Parameter', 'Current value', 'Possible values', 'Why it matters'];
  const rows = schemaCatalog.map((entry) => {
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
        text: `For \`${record.fieldKey}\`, build a 5-10 product example bank before finalizing the rule. Use this category's benchmark data when available, then published candidates/product JSON, seed products, known component rows, and source research. For brand-new categories, use representative products from the market to create the first calibration set. Do not paste benchmark answers into the live prompt; use them to author the contract and guidance.`,
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

function buildComponentSection(record, componentInventory) {
  const c = record.component;
  const blocks = [];

  if (!c) {
    blocks.push({ kind: 'paragraph', text: 'Standalone \u2014 no component relation. This key is not an identity for any `component_db/<type>.json` and does not appear as a subfield on any component entity.' });
  } else if (c.relation === 'parent') {
    blocks.push({
      kind: 'paragraph',
      text: `**IS the ${c.type} component identity.** The value of this field IS the canonical component name (e.g. \`PMW3950\` for a sensor). When resolved on a product, the component\u2019s subfield values flow through \`PRODUCT_COMPONENTS\` on every future prompt.`,
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
      text: `**Subfield of the ${c.type} component.** When the \`${c.type}\` identity is resolved on a product, this value flows into the prompt as part of \`PRODUCT_COMPONENTS\`. Edits to this field should usually go into the component_db row rather than per-product.`,
    });
  }

  return {
    id: 'component',
    title: 'Component relation',
    level: 2,
    blocks,
  };
}

function buildCrossFieldSection(record) {
  if (!Array.isArray(record.constraints) || record.constraints.length === 0) return null;
  return {
    id: 'cross-field',
    title: 'Cross-field constraints',
    level: 2,
    blocks: [
      {
        kind: 'note',
        tone: 'info',
        text: 'These constraints render into the live keyFinder prompt via `PRIMARY_CROSS_FIELD_CONSTRAINTS`. Audit whether the relationship is correct, whether the target field is the right authority, and whether the constraint should affect grouping or guidance.',
      },
      {
        kind: 'bulletList',
        items: record.constraints.map((c) => `\`${c.raw}\` \u2192 op=\`${c.op}\`, left=\`${c.left}\`, right=\`${c.right}\``),
      },
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

function buildFullPromptSection(preview) {
  if (!preview || preview.reserved || !preview.systemPrompt) return null;
  return {
    id: 'full-prompt',
    title: 'Full compiled preview prompt',
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: 'The exact text keyFinder would send for this key. Product identity is a placeholder (`<BRAND>` / `<MODEL>`) so the shape is visible without a real product. Runtime slots like `PRODUCT_COMPONENTS` and `KNOWN_PRODUCT_FIELDS` render empty when the placeholder has no resolved context.',
      },
      { kind: 'codeBlock', lang: 'text', text: preview.systemPrompt },
    ],
  };
}

function buildPerSlotSection(preview) {
  if (!preview || preview.reserved || !preview.slotRendering) return null;
  const slot = preview.slotRendering;
  const blocks = [
    {
      kind: 'paragraph',
      text: 'Per-slot breakdown of the key-specific portions of the prompt. Each block below is the exact text the renderer produced for its slot. Empty blocks mean the slot is unauthored or the knob is off.',
    },
  ];
  for (const desc of SLOT_DESCRIPTIONS) {
    const text = String(slot[desc.previewKey] || '').trim();
    blocks.push({ kind: 'subheading', level: 4, text: `\`{{${desc.slot}}}\`` });
    blocks.push({ kind: 'paragraph', text: desc.note });
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
  componentInventory = [],
  preview,
}) {
  const sections = [
    buildHeaderSection(keyRecord, category, generatedAt, preview),
    buildPurposeSection(keyRecord, preview, category),
    buildAuthoringChecklistSection(keyRecord),
    buildContractSchemaSection(keyRecord, schemaCatalog),
    buildEnumSection(keyRecord),
    buildComponentSection(keyRecord, componentInventory),
    buildCrossFieldSection(keyRecord),
    buildSiblingsSection(keyRecord, siblingsInGroup),
    buildExampleBankSection(keyRecord, category),
    buildFullPromptSection(preview),
    buildPerSlotSection(preview),
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
    },
    sections,
  };
}
