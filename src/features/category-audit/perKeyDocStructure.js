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

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '(unset)';
  if (Array.isArray(value)) return value.length === 0 ? '[]' : value.map((v) => `\`${v}\``).join(', ');
  if (typeof value === 'object') return `\`${JSON.stringify(value)}\``;
  return `\`${String(value)}\``;
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
        text: `Audit \`required_level\`, \`availability\`, and \`difficulty\` as extraction/search strategy, not admin labels. Requiredness decides whether the site should try to publish the field for most products because it is distinguishable from public/spec/visual/identity evidence and belongs in benchmark-depth coverage; it is not restricted to lab-only measurements. Difficulty decides model/search strength after variant inventory, PIF images, aliases, and source hints are available.`,
      },
      {
        kind: 'table',
        headers: ['Knob', 'Current value', 'Audit question'],
        rows: [
          ['`priority.required_level`', displayValue(record.priority.required_level), 'Should this field be mandatory for a publish-grade, depth-tech product page? Mandatory should mean the value is buyer/site/benchmark useful and usually distinguishable from public/spec/visual/identity evidence: visible, identifiable from variant identity, listed in specs/docs, or generally exposed by credible sources. Missing proof still becomes unknown status with no submitted value.'],
          ['`priority.availability`', displayValue(record.priority.availability), 'How often should credible public sources expose this value: always, sometimes, or rare? Wrong availability wastes search budget or delays fields that should be searched early.'],
          ['`priority.difficulty`', displayValue(record.priority.difficulty), 'Can the configured context make this direct? Easy should cover direct spec/photo/PIF/variant lookup or straightforward canonical mapping; medium should cover normalization or light source comparison; hard should cover technical component reasoning, meaningful conflicts, aliases that change meaning, or source credibility calls. Very_hard is reserved for hidden/lab-grade fields such as proprietary internal component identities, instrumented latency/accuracy measurements, unresolved datasheet links, or lab-only metrics.'],
          ['Resolved tier bundle', formatTierBundle(preview), 'Does the resolved model/search strength match the remaining extraction effort after variant inventory, PIF images, aliases, and source hints?'],
          ['Benchmark-depth target', benchmarkText, 'Use benchmark data to calibrate the rule and guidance, not as prompt answers. The contract should explain how keyFinder can reproduce those values from public evidence.'],
        ],
      },
    ],
  };
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
  const variantInventoryUsage = record.ai_assist?.variant_inventory_usage;
  const variantInventoryCurrent = typeof variantInventoryUsage?.enabled === 'boolean'
    ? (variantInventoryUsage.enabled ? 'enabled' : 'disabled')
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
        text: 'Validate the whole field contract before editing guidance. A strong audit can say "no contract change" when shape, enum policy, requiredness, evidence, and consumer behavior are already correct; still leave guidance/examples/aliases/enum cleanup when those are the real improvement. Guidance last: only write `ai_assist.reasoning_note` after scheduling, value shape, enum/filter behavior, consumer-surface intent, unknown/not-applicable states, evidence/source rules, and example coverage are correct.',
      },
      {
        kind: 'table',
        headers: ['Order', 'Facet', 'Current value', 'Validation question'],
        rows: [
          ['1', 'Scheduling priority', priorityCurrent, 'Does requiredness match publish expectations, does availability match real product coverage, and does difficulty route to the right LLM tier?'],
          ['2', 'Value contract', contractCurrent, 'Does the emitted JSON primitive/list shape match how the value is stored, validated, compared, and filtered?'],
          ['3', 'Enum and filter surface', enumCurrent, 'Is the enum closed when finite, patterned when open, ordered consistently, and small enough for the consumer filter surface? Keep aliases/source phrases out of public enum chips unless intentionally public.'],
          ['4', 'Consumer-surface impact', consumerCurrent, 'Which surfaces should use this key: filter, list column, snapshot/spec row, comparison row, metric/card, search/SEO, or none? Does the shape support each intended surface without forcing the site to guess?'],
          ['5', 'Unknown / not-applicable states', unknownCurrent, 'Is false/no different from not-applicable and missing evidence? Use boolean only for true two-state facts. Never add `unk` to enum values or data lists; it is an LLM sentinel that should become status/unknown_reason with no submitted value. Use `n/a` only when not-applicable is intentionally stored or public; otherwise prefer blank/omitted as no submitted value. For measured conditional fields like battery_hours, keep the value numeric when hours are proven and leave no submitted value when not applicable or unproven.'],
          ['6', 'Evidence and sources', evidenceCurrent, 'Can the configured source tiers and evidence count actually prove this value without guessing?'],
          ['7', 'Example bank', '5-10 category-local examples', 'Do examples cover happy path, edge, unknown, not-applicable, conflict, and filter-risk cases before the prompt text is trusted?'],
          ['8', 'Variant inventory context', variantInventoryCurrent, 'Enable only when edition/SKU/release/colorway/PIF identity helps reject wrong-variant evidence without ambiguity. Most invariant model-level keys should not need it. List or variant-varying keys need a union vs exact/base/default rule in reasoning_note.'],
          ['9', 'PIF Priority Images', pifPriorityImagesCurrent, 'Enable only when default/base priority-view images help a visual key. Missing/unattachable images are not negative evidence. Edition-specific yes/no or list behavior belongs in reasoning_note.'],
          ['10', 'Guidance last', displayValue(record.ai_assist?.reasoning_note), 'Now write paste-ready guidance that fills only the remaining extraction judgment gap, or write "(empty - keep)" when no guidance is needed.'],
        ],
      },
    ],
  };
}

function buildConsumerSurfaceSection(record) {
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
          ['Filter', 'Should this be a public filter? If enum-backed, are the canonical values public chips, and are aliases/source phrases kept out of the chip list?'],
          ['List / hub table', 'Should the value appear in product cards or listing tables? If yes, confirm label, unit, sorting, truncation, and list-vs-scalar display.'],
          ['Snapshot / spec row', 'Should the value appear as a product detail spec? If yes, confirm grouping, display label, units, and display-only/derived status.'],
          ['Comparison', 'Should users compare this value across products? If yes, confirm numeric/date/list semantics and whether higher/lower is better.'],
          ['Metric / card', 'Should the value feed a score, badge, gauge, or summary card? If yes, confirm the source field remains machine-clean and the card derives presentation.'],
          ['Search / SEO', 'Should the value become searchable or appear in page text? If yes, confirm canonical terms and aliases so source wording does not pollute stored values.'],
          ['None', 'If no consumer surface should use this key, say so explicitly; the key can still exist for publisher gates, prompt context, or future derivation.'],
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

function buildPerKeyLlmAuditPromptSection(record, category, navigatorOrdinal = '') {
  const ordinalNumber = navigatorOrdinal ? Number(navigatorOrdinal) : null;
  const fieldToken = navigatorOrdinal ? `${navigatorOrdinal}-${record.fieldKey}` : record.fieldKey;
  const fileName = expectedFieldStudioPatchFileName({
    category,
    fieldKey: record.fieldKey,
    navigatorOrdinal: ordinalNumber,
  });
  const ordinalJson = ordinalNumber == null ? 'null' : String(ordinalNumber);

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
- component_sources rows must either be the component type itself or include "${record.fieldKey}" in roles.properties.

Expected file: ${fileName}
Sort/key token: ${fieldToken}

Use this exact envelope:

\`\`\`json
{
  "schema_version": "field-studio-patch.v1",
  "category": "${category}",
  "field_key": "${record.fieldKey}",
  "navigator_ordinal": ${ordinalJson},
  "verdict": "minor_revise",
  "patch": {
    "field_overrides": {
      "${record.fieldKey}": {
        "priority": {
          "required_level": "mandatory",
          "availability": "always",
          "difficulty": "medium"
        },
        "contract": {
          "type": "string",
          "shape": "scalar"
        },
        "enum": {
          "policy": "open_prefer_known",
          "source": "data_lists.${record.fieldKey}"
        },
        "ai_assist": {
          "variant_inventory_usage": {
            "enabled": false
          },
          "pif_priority_images": {
            "enabled": false
          },
          "reasoning_note": "Paste-ready extraction guidance for ${record.fieldKey}."
        }
      }
    },
    "data_lists": [
      {
        "field": "${record.fieldKey}",
        "mode": "manual",
        "normalize": "lower_trim",
        "manual_values": []
      }
    ],
    "component_sources": [
      {
        "component_type": "sensor",
        "roles": {
          "properties": [
            {
              "field_key": "${record.fieldKey}",
              "variance_policy": "authoritative"
            }
          ]
        }
      }
    ]
  },
  "audit": {
    "sources_checked": [],
    "products_checked": [],
    "conclusion": "",
    "open_questions": []
  }
}
\`\`\`

For a keep verdict, return the same envelope with "patch": {}.

Mapping Studio patch guidance:
- Component Source Mapping belongs under patch.component_sources. Use it for source/type, primary identifier role, maker role, aliases/name variants, reference URLs/links, component _link fields, and property variance. A component _link field should point to a manufacturer component page, datasheet/spec-sheet PDF, or authorized component distributor page; not eBay, forums, or pages that merely mention the component.
- Enum Data Lists belong under patch.data_lists. Return the final ordered canonical values when replacing a list; keep aliases/source phrases out of public chips.

Key Navigator patch guidance:
- Field contract, priority, evidence, enum policy, constraints, aliases, search_hints, and ai_assist belong under patch.field_overrides.${record.fieldKey}.
- Use ai_assist.variant_inventory_usage only when variant identity helps reject wrong-variant evidence without ambiguity.
- Use ai_assist.pif_priority_images only when default/base priority-view images add visual evidence value.
- Put final paste-ready prompt guidance in ai_assist.reasoning_note.

Live validation:
- Use model knowledge to form hypotheses, then validate this key with live public sources before finalizing enum values, examples, technical claims, component-source settings, search hints, evidence expectations, or difficulty.
- Check 3-7 manufacturer, official documentation, standards, datasheet, credible lab, or authorized distributor sources.
- Check 5-10 representative products/classes when the key has meaningful variants or filter-risk values.
- Use benchmark data only to understand target shape and quality. Do not copy benchmark answers into the live prompt or treat benchmarks as public evidence.

After the JSON file, include a short prose audit with: verdict, key risks, References spot-checked, example bank, and open questions.

Rules:
- This audit is for Field Studio setup only. If live research exposes missing/stale component entities, rows, aliases, properties, or source URLs, mention them after the JSON as a separate component-data gap. Do not put those row edits into the Field Studio patch.
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

function buildComponentSection(record, componentInventory) {
  const c = record.component;
  const blocks = [];

  if (!c) {
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
      headers: ['Component', 'Entities', 'Identity fields', 'Subfields', 'Relevant to this key?'],
      rows: inventory.map((entry) => [
        `\`${entry.type}\``,
        String(entry.entityCount),
        formatList(entry.identityFields),
        formatList(entry.subfields),
        c?.type === entry.type ? 'yes' : '-',
      ]),
    });
  }

  const relevant = c ? inventory.find((entry) => entry.type === c.type) : null;
  if (relevant) {
    blocks.push({ kind: 'subheading', level: 4, text: `Relevant component detail: ${c.type}` });
    blocks.push({
      kind: 'paragraph',
      text: `Audit component variance here too. Confirm whether \`${record.fieldKey}\` should inherit from the \`${c.type}\` component database, whether the field-level \`variance_policy\` (\`${record.variance_policy || '(unset)'}\`) matches component property policy, and whether component constraints are present on the right property.`,
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
      blocks.push({ kind: 'paragraph', text: `(first 50 of ${relevant.entities.length} shown; full list lives in \`component_db/${c.type}.json\`)` });
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

function buildFullPromptSection(preview) {
  if (!preview || preview.reserved || !preview.systemPrompt) return null;
  return {
    id: 'full-prompt',
    title: 'Full compiled preview prompt',
    level: 2,
    blocks: [
      {
        kind: 'paragraph',
        text: 'The exact text keyFinder would send for this key. Product identity is a placeholder (`<BRAND>` / `<MODEL>`) so the shape is visible without a real product. Runtime slots like `PRODUCT_COMPONENTS`, `PRODUCT_SCOPED_FACTS`, and `VARIANT_INVENTORY` render empty when the placeholder has no resolved context.',
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
  allKeyRecords = [],
  groups = [],
  componentInventory = [],
  preview,
  navigatorOrdinal = '',
}) {
  const sections = [
    buildHeaderSection(keyRecord, category, generatedAt, preview),
    buildPurposeSection(keyRecord, preview, category),
    buildSearchRoutingSection(keyRecord, preview, category),
    buildAuthoringChecklistSection(keyRecord),
    buildCategoryKeyMapSection(keyRecord, allKeyRecords, groups),
    buildContractSchemaSection(keyRecord, schemaCatalog),
    buildConsumerSurfaceSection(keyRecord),
    buildEnumSection(keyRecord),
    buildComponentSection(keyRecord, componentInventory),
    buildCrossFieldSection(keyRecord, allKeyRecords),
    buildSiblingsSection(keyRecord, siblingsInGroup),
    buildExampleBankSection(keyRecord, category),
    buildPerKeyLlmAuditPromptSection(keyRecord, category, navigatorOrdinal),
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
      navigatorOrdinal,
    },
    sections,
  };
}
