/**
 * Compact category-level signoff summary for Key Finder audits.
 *
 * This intentionally excludes the long teaching sections, compiled prompt, and
 * per-key scripts. Those belong in per-key docs; this file is the final
 * category-level matrix a human auditor can scan after individual key changes.
 */

function code(value) {
  return `\`${String(value || '-')}\``;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function enabledState(value) {
  if (typeof value?.enabled !== 'boolean') return 'unset';
  return value.enabled ? 'on' : 'off';
}

function shortList(values, limit = 3) {
  const list = Array.isArray(values) ? values.filter(Boolean).map(String) : [];
  if (list.length === 0) return '-';
  const head = list.slice(0, limit).join(', ');
  return list.length > limit ? `${head} +${list.length - limit}` : head;
}

function formatPriority(key) {
  const required = key.priority?.required_level === 'mandatory' ? 'M' : 'N';
  return `${required} / ${key.priority?.availability || '-'} / ${key.priority?.difficulty || '-'}`;
}

function formatContract(key) {
  const unit = key.contract?.unit ? ` ${key.contract.unit}` : '';
  const range = key.contract?.range
    ? ` range:${key.contract.range.min ?? '-'}-${key.contract.range.max ?? '-'}`
    : '';
  return `${key.contract?.type || '-'} / ${key.contract?.shape || '-'}${unit}${range} / variant:${yesNo(key.variant_dependent)}`;
}

function formatEnum(key) {
  const values = Array.isArray(key.enum?.values) ? key.enum.values : [];
  const top = key.enum?.analysis?.topSignature;
  const signature = top ? ` / pattern:${top.signature} ${top.coveragePct}%` : '';
  const suspicious = key.enum?.analysis?.suspiciousValues?.length
    ? ` / suspicious:${key.enum.analysis.suspiciousValues.length}`
    : '';
  return `${key.enum?.policy || '-'} / ${key.enum?.source || '-'} / values:${values.length} / ${key.enum?.filterUi || '-'}${signature}${suspicious}`;
}

function formatComponent(key) {
  if (!key.component) return '-';
  return `${key.component.type} / ${key.component.relation || '-'}${key.component.source ? ` / ${key.component.source}` : ''}`;
}

function formatEvidence(key) {
  const refs = key.evidence?.min_evidence_refs ?? 0;
  const tiers = shortList(key.evidence?.tier_preference);
  return `refs:${refs} / tiers:${tiers}`;
}

function formatDependencies(key) {
  return [
    `Product Image Dependent:${yesNo(key.product_image_dependent)}`,
    `Variant inventory:${enabledState(key.ai_assist?.variant_inventory_usage)}`,
    `PIF priority images:${enabledState(key.ai_assist?.pif_priority_images)}`,
  ].join(' / ');
}

function formatReadiness(key) {
  const constraints = Array.isArray(key.constraints) ? key.constraints.length : 0;
  return [
    `guidance:${key.ai_assist?.reasoning_note?.trim() ? 'yes' : 'empty'}`,
    `aliases:${Array.isArray(key.aliases) ? key.aliases.length : 0}`,
    `queries:${Array.isArray(key.search_hints?.query_terms) ? key.search_hints.query_terms.length : 0}`,
    `domains:${Array.isArray(key.search_hints?.domain_hints) ? key.search_hints.domain_hints.length : 0}`,
    `constraints:${constraints}`,
  ].join(' / ');
}

function buildHeaderBlocks(reportData) {
  const { category, generatedAt, stats } = reportData;
  return [
    {
      kind: 'paragraph',
      text: `Category: ${code(category)} / Generated: ${code(generatedAt)} / Keys: ${stats.totalKeys} / Groups: ${stats.groupCount} / Mandatory: ${stats.mandatoryCount} / Product Image Dependent: ${stats.productImageDependentCount || 0}`,
    },
    {
      kind: 'note',
      tone: 'info',
      text: 'High-level final signoff summary. Use this file to audit category readiness, Product Image Dependent choices, enum/component risk, and open follow-up after individual per-key audits are complete.',
    },
    {
      kind: 'note',
      tone: 'warn',
      text: 'Detailed per-key scripts and prompt previews live under `.workspace/reports/per-key/<category>/`. This summary intentionally does not duplicate those scripts.',
    },
  ];
}

function buildKeyMatrixSection(reportData) {
  const rows = (reportData.keys || []).map((key) => [
    `${code(key.fieldKey)} ${key.displayName || ''}`.trim(),
    key.group || '-',
    formatPriority(key),
    formatContract(key),
    formatEnum(key),
    formatComponent(key),
    formatEvidence(key),
    formatDependencies(key),
    formatReadiness(key),
  ]);

  return {
    id: 'key-matrix',
    title: 'Key Matrix',
    blocks: [
      {
        kind: 'paragraph',
        text: 'One row per key. This is the first-pass page for final category signoff: scan dependency choices, contract shape, enum/filter risk, component ownership, evidence requirements, and readiness gaps before approving the category.',
      },
      {
        kind: 'table',
        headers: ['Key', 'Group', 'Priority', 'Contract', 'Enum', 'Component', 'Evidence', 'Dependencies', 'Readiness'],
        rows,
      },
    ],
  };
}

function buildAuditContextSection() {
  return {
    id: 'audit-context',
    title: 'Audit Context',
    blocks: [
      {
        kind: 'paragraph',
        text: 'This file is the final category-level signoff surface after the individual per-key audits have been completed. The auditor is checking whether the category is coherent as a system: scheduling, value contracts, enum/filter surfaces, component ownership, evidence rules, variant/PIF dependencies, and remaining gaps.',
      },
      {
        kind: 'paragraph',
        text: 'The per-key briefs are still the source for detailed prompt previews and paste-ready change-file instructions. Returned human/pro audit text files should stay in `.workspace/reports/<category>/`; this high-level summary uses the compiled rule state to show what still needs category-level approval.',
      },
      {
        kind: 'table',
        headers: ['Rule', 'What the auditor must know'],
        rows: [
          ['This is not product extraction', 'Do not fill product values here. Audit the field contract and whether future keyFinder runs can extract the value correctly.'],
          ['Requiredness is coverage strategy', '`mandatory` means publish-grade pages should try to produce the field for most products when public/spec/visual/component evidence can distinguish it. It is not an admin label.'],
          ['Difficulty is routing', '`easy` means direct spec/photo/PIF/variant lookup or canonical mapping; `medium` means normalization/light comparison; `hard` means technical component reasoning, conflicts, aliases that change meaning, source credibility, or lab-grade ambiguity.'],
          ['Unknown / false / n/a', '`false` is a proven negative, `n/a` is an intentional not-applicable value only when the contract wants it, and unknown means no submitted value plus an unknown reason. Do not add `unk` as an enum value.'],
          ['Enums and filters', 'Closed enums must be finite public chips. Open/preferred enums can accept new evidence-backed values, but aliases, source phrases, and marketing copy should not become public filter chips by accident.'],
          ['Evidence and sources', 'Evidence refs are minimum proof count. Prefer configured tier order; when sources conflict, exact product/SKU and higher-tier evidence win over sibling models or aggregators.'],
          ['Component identity', 'Parent component keys identify a component; subfields inherit from that component only when the component identity is proven for the exact product.'],
          ['component `_link` fields', 'Component link fields must point to the exact component maker page, datasheet/spec PDF, support PDF, maker docs, or an authorized component distributor fallback. Avoid product pages, reviews, marketplaces, forums, and random resale listings.'],
          ['Variant inventory', 'Use when edition/SKU/release/colorway identity can change the answer or prevent wrong-variant evidence. Leave off for invariant model-level keys.'],
          ['PIF priority images', 'Use when default/base priority-view images help prove a visual key. Missing or unattachable images are not negative evidence.'],
          ['Product Image Dependent', 'Use only for keys whose resolved value should gate PIF because it prevents wrong product images or gives PIF essential visual/source identity context.'],
        ],
      },
    ],
  };
}

function buildMatrixLegendSection() {
  return {
    id: 'matrix-legend',
    title: 'Matrix Legend',
    blocks: [
      {
        kind: 'table',
        headers: ['Column', 'Meaning'],
        rows: [
          ['Key', 'Compiled field key and display label. This is the contract name downstream code and per-key docs use.'],
          ['Group', 'Category grouping used for sibling checks, UI organization, and audit batching.'],
          ['Priority', 'Priority = `M/N / availability / difficulty`. `M` means mandatory; `N` means non-mandatory. Availability is expected public-source coverage; difficulty is model/search routing strength.'],
          ['Contract', 'Contract = `type / shape unit range / variant:<yes|no>`. This is the emitted value shape, validation expectation, and variant-dependence flag.'],
          ['Enum', 'Enum = `policy / source / values / filter UI`, plus dominant pattern and suspicious count when available. This is where filter bloat and closed/open mistakes show up.'],
          ['Component', 'Component type, relation, and source. `parent` identifies the component; `subfield_of` derives from an identified component.'],
          ['Evidence', 'Minimum refs and preferred source tiers. This tells whether one source is enough or whether corroboration is required.'],
          ['Dependencies', 'Product Image Dependent, variant-inventory usage, and PIF-priority-image usage. This is the dependency/scheduling audit surface.'],
          ['Readiness', 'Counts for guidance, aliases, search query terms, domain hints, and constraints. Empty counts are triage leads, not automatic failures.'],
        ],
      },
    ],
  };
}

function buildFinalSignoffSection() {
  return {
    id: 'final-signoff-checklist',
    title: 'Final Signoff Checklist',
    blocks: [
      {
        kind: 'table',
        headers: ['Checkpoint', 'Pass condition'],
        rows: [
          ['Coverage', 'Mandatory keys are truly publish-grade and non-mandatory keys are not hiding fields users expect on most products.'],
          ['Contracts', 'Type, shape, unit, range, list behavior, and variant flags match how the value is stored, validated, filtered, and compared.'],
          ['Enums', 'Closed enums are finite and public; open/preferred enums have sane sources and do not turn aliases or source phrases into noisy UI chips.'],
          ['Unknown handling', 'False, no, n/a, blank, omitted, and unknown statuses are distinct where the contract needs them.'],
          ['Dependencies', 'PIF dependency, variant inventory, and PIF priority image toggles are enabled only where they change correctness.'],
          ['Components', 'Component parent/subfield relationships do not let unproven component facts leak into product fields.'],
          ['Evidence', 'Minimum refs and tier preferences match the risk of the field and the sources that realistically prove it.'],
          ['Per-key returns', 'Human/pro returned change files have been reviewed for every key that needed contract, enum, evidence, dependency, or guidance changes.'],
          ['Final category approval', 'Remaining red flags are intentional, documented, or queued as follow-up; otherwise the category is not ready for signoff.'],
        ],
      },
    ],
  };
}

function buildPifDependencySection(reportData) {
  const deps = (reportData.keys || []).filter((key) => key.product_image_dependent);
  const rows = deps.map((key) => [
    code(key.fieldKey),
    key.displayName || key.fieldKey,
    key.group || '-',
    formatContract(key),
    formatPriority(key),
    key.ai_assist?.reasoning_note?.trim() || '(no guidance)',
  ]);

  return {
    id: 'product-image-dependent',
    title: 'Product Image Dependent',
    blocks: [
      {
        kind: 'paragraph',
        text: 'This is the central place to audit PIF dependency choices. A key marked Product Image Dependent must resolve before PIF runs; its resolved value is injected into PIF discovery, hero, and evaluation prompts as an image identity fact. Enable it only for source-visible or pixel-visible identity facts that prevent wrong product images.',
      },
      {
        kind: 'note',
        tone: deps.length > 0 ? 'info' : 'good',
        text: deps.length > 0
          ? `${deps.length} key(s) currently gate PIF. If any are not visually/source useful, remove the dependency so PIF is not blocked by irrelevant scalar work.`
          : 'No keys currently gate PIF for this category. That is acceptable when images do not need prior scalar identity facts.',
      },
      {
        kind: 'table',
        headers: ['Key', 'Label', 'Group', 'Contract', 'Priority', 'Current guidance'],
        rows: rows.length > 0 ? rows : [['-', '-', '-', '-', '-', 'No Product Image Dependent keys configured.']],
      },
    ],
  };
}

function buildRiskRollupSection(reportData) {
  const stats = reportData.stats || {};
  const statRows = [
    ['Total keys', String(stats.totalKeys || 0)],
    ['Mandatory keys', String(stats.mandatoryCount || 0)],
    ['Groups', String(stats.groupCount || 0)],
    ['Product Image Dependent keys', String(stats.productImageDependentCount || 0)],
    ['Variant dependent keys', String(stats.variantDependentCount || 0)],
    ['Empty guidance', String(stats.emptyGuidanceCount || 0)],
    ['Empty aliases', String(stats.emptyAliasesCount || 0)],
    ['Empty query terms', String(stats.emptyHintsCount || 0)],
    ['Empty domain hints', String(stats.emptySearchDomainsCount || 0)],
    ['Patternless open enums', String(stats.patternlessOpenEnumsCount || 0)],
  ];

  const enumRows = [...(reportData.enums || [])]
    .filter((entry) => Array.isArray(entry.values) && entry.values.length > 0)
    .sort((a, b) => b.values.length - a.values.length)
    .slice(0, 15)
    .map((entry) => [
      code(entry.name),
      entry.policy || '-',
      String(entry.values.length),
      entry.analysis?.topSignature?.signature || '-',
      entry.analysis?.topSignature ? String(entry.analysis.topSignature.coveragePct) : '-',
      String(entry.analysis?.suspiciousValues?.length || 0),
      shortList(entry.usedBy, 5),
    ]);

  return {
    id: 'risk-rollups',
    title: 'Risk Rollups',
    blocks: [
      { kind: 'table', headers: ['Metric', 'Value'], rows: statRows },
      { kind: 'subheading', level: 3, text: 'Largest enums' },
      {
        kind: 'table',
        headers: ['Enum', 'Policy', 'Values', 'Top pattern', 'Coverage %', 'Suspicious', 'Used by'],
        rows: enumRows.length > 0 ? enumRows : [['-', '-', '0', '-', '-', '0', '-']],
      },
    ],
  };
}

function buildGroupSection(reportData) {
  const keyIndex = Object.fromEntries((reportData.keys || []).map((key) => [key.fieldKey, key]));
  const rows = (reportData.groups || []).map((group) => {
    const keys = group.fieldKeys.map((fieldKey) => keyIndex[fieldKey]).filter(Boolean);
    return [
      group.displayName || group.groupKey,
      code(group.groupKey),
      String(keys.length),
      String(keys.filter((key) => key.priority?.required_level === 'mandatory').length),
      String(keys.filter((key) => key.product_image_dependent).length),
      String(keys.filter((key) => key.ai_assist?.reasoning_note?.trim()).length),
      shortList(group.fieldKeys, 8),
    ];
  });

  return {
    id: 'groups',
    title: 'Groups',
    blocks: [
      {
        kind: 'table',
        headers: ['Group', 'Key', 'Keys', 'Mandatory', 'PIF deps', 'Guided', 'Members'],
        rows: rows.length > 0 ? rows : [['-', '-', '0', '0', '0', '0', '-']],
      },
    ],
  };
}

function buildComponentSection(reportData) {
  const rows = (reportData.components || []).map((component) => [
    code(component.type),
    String(component.entityCount || 0),
    shortList(component.identityFields, 6),
    shortList(component.subfields, 6),
  ]);

  return {
    id: 'components',
    title: 'Components',
    blocks: [
      {
        kind: 'table',
        headers: ['Component', 'Entities', 'Identity fields', 'Subfields'],
        rows: rows.length > 0 ? rows : [['-', '0', '-', '-']],
      },
    ],
  };
}

export function buildSummaryReportStructure(reportData) {
  return {
    meta: {
      category: reportData.category,
      generatedAt: reportData.generatedAt,
    },
    sections: [
      {
        id: 'header',
        title: `Key Finder Summary - ${code(reportData.category)}`,
        blocks: buildHeaderBlocks(reportData),
      },
      buildAuditContextSection(),
      buildMatrixLegendSection(),
      buildFinalSignoffSection(),
      buildKeyMatrixSection(reportData),
      buildPifDependencySection(reportData),
      buildRiskRollupSection(reportData),
      buildGroupSection(reportData),
      buildComponentSection(reportData),
    ],
  };
}
