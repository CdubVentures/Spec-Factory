/**
 * Shared structural blocks that both HTML and Markdown renderers consume.
 * Build once from ReportData; walk twice (one per skin) to produce the
 * final paired artifacts with byte-identical content.
 *
 * Single export:
 *   - buildReportStructure(reportData) → { sections: Section[], meta: object }
 *
 * A Section has { id, title, blocks }. A Block is one of:
 *   { kind: 'paragraph',  text }
 *   { kind: 'bulletList', items: string[] }
 *   { kind: 'table',      headers: string[], rows: string[][], caption? }
 *   { kind: 'codeBlock',  lang, text }
 *   { kind: 'details',    summary, blocks: Block[] }   // collapsible in HTML, always-expanded in MD
 *   { kind: 'subheading', level, text }
 *   { kind: 'note',       tone: 'info'|'warn'|'err'|'good', text }
 */

import { renderKeyFinderPreview } from './adapters/keyFinderAdapter.js';
import { composeTeachingSections, composeAuditorTask, composeAuditStandard } from './teaching.js';
import { KEY_FINDER_DEFAULT_TEMPLATE } from '../key/keyLlmAdapter.js';

const RUNTIME_SLOT_NAMES = new Set([
  'BRAND', 'MODEL', 'CATEGORY', 'VARIANT_SUFFIX', 'VARIANT_COUNT', 'FAMILY_SIZE',
  'IDENTITY_WARNING', 'PRODUCT_COMPONENTS', 'PRODUCT_SCOPED_FACTS', 'VARIANT_INVENTORY',
  'FIELD_IDENTITY_USAGE', 'PREVIOUS_DISCOVERY',
  'PRIMARY_FIELD_KEY', 'PRIMARY_FIELD_GUIDANCE', 'PRIMARY_FIELD_CONTRACT',
  'PRIMARY_SEARCH_HINTS', 'PRIMARY_CROSS_FIELD_CONSTRAINTS', 'PRIMARY_COMPONENT_KEYS',
  'ADDITIONAL_FIELD_KEYS', 'ADDITIONAL_FIELD_GUIDANCE', 'ADDITIONAL_FIELD_CONTRACT',
  'ADDITIONAL_CROSS_FIELD_CONSTRAINTS', 'ADDITIONAL_COMPONENT_KEYS',
  'RETURN_JSON_SHAPE',
]);

const GLOBAL_FRAGMENT_SLOT_KEYS = Object.freeze({
  SOURCE_TIER_STRATEGY: 'scalarSourceTierStrategy',
  SCALAR_SOURCE_GUIDANCE_CLOSER: 'scalarSourceGuidanceCloser',
  VALUE_CONFIDENCE_GUIDANCE: 'valueConfidenceRubric',
});

function buildHeaderBlocks(reportData) {
  const { category, generatedAt, stats } = reportData;
  return [
    {
      kind: 'paragraph',
      text: `Category: \`${category}\` · Generated: \`${generatedAt}\` · Total keys: ${stats.totalKeys} · Mandatory: ${stats.mandatoryCount} · Empty guidance: ${stats.emptyGuidanceCount} · Empty aliases: ${stats.emptyAliasesCount} · Empty search-hint domains: ${stats.emptySearchDomainsCount} · Patternless open enums: ${stats.patternlessOpenEnumsCount}`,
    },
    {
      kind: 'note',
      tone: 'info',
      text: 'This report reflects CURRENT STATE. No verdicts, no flags — Part 1 teaches the system so Part 7 gaps become visible to you. When you improve a rule, regenerate this report and diff against the prior version.',
    },
  ];
}

function buildSummarySection(reportData) {
  const { stats } = reportData;
  const rows = [
    ['Total keys', String(stats.totalKeys)],
    ['Mandatory', String(stats.mandatoryCount)],
    ['Groups', String(stats.groupCount)],
    ['Difficulty: easy', String(stats.tierDistribution.easy)],
    ['Difficulty: medium', String(stats.tierDistribution.medium)],
    ['Difficulty: hard', String(stats.tierDistribution.hard)],
    ['Difficulty: very_hard', String(stats.tierDistribution.very_hard)],
    ['Empty `reasoning_note`', String(stats.emptyGuidanceCount)],
    ['Empty `aliases`', String(stats.emptyAliasesCount)],
    ['Empty `search_hints.query_terms`', String(stats.emptyHintsCount)],
    ['Empty `search_hints.domain_hints`', String(stats.emptySearchDomainsCount)],
    ['Open enums without a dominant pattern', String(stats.patternlessOpenEnumsCount)],
  ];

  const blocks = [{ kind: 'table', headers: ['Metric', 'Value'], rows }];

  // Highest-risk candidates — surfaced upfront so the auditor sees the
  // spikes before walking the long tail. No judgement — pure ranking by
  // enum size (filter-UI impact) and patternless-ness.
  const topEnums = [...(reportData.enums || [])]
    .filter((e) => Array.isArray(e.values) && e.values.length > 15)
    .sort((a, b) => b.values.length - a.values.length)
    .slice(0, 10);
  if (topEnums.length > 0) {
    blocks.push({ kind: 'subheading', level: 3, text: 'Highest-risk enums (size + pattern coverage)' });
    blocks.push({
      kind: 'paragraph',
      text: 'Largest enums in this category, sorted by value count. Anything past 20 values is filter-fatigue territory (Part 1.5). Use this as a triage lead when writing your "Highest-risk corrections" response.',
    });
    blocks.push({
      kind: 'table',
      headers: ['Enum', 'Values', 'Policy', 'Top signature', 'Coverage %', 'Suspicious'],
      rows: topEnums.map((e) => [
        `\`${e.name}\``,
        String(e.values.length),
        e.policy || 'none',
        e.analysis?.topSignature?.signature ?? '-',
        e.analysis?.topSignature ? String(e.analysis.topSignature.coveragePct) : '-',
        String(e.analysis?.suspiciousValues?.length || 0),
      ]),
    });
  }

  // Cross-field constraints are visible at the category level so auditors can
  // judge relationship correctness before walking the per-key detail.
  const keysWithConstraints = (reportData.keys || [])
    .filter((k) => Array.isArray(k.constraints) && k.constraints.length > 0)
    .map((k) => k.fieldKey);
  if (keysWithConstraints.length > 0) {
    blocks.push({ kind: 'subheading', level: 3, text: 'Cross-field constraints present' });
    blocks.push({
      kind: 'note',
      tone: 'info',
      text: `The following ${keysWithConstraints.length} field(s) define cross-field constraints that render into live keyFinder prompts after normalization from \`constraints\` DSL or structured \`cross_field_constraints\`: ${keysWithConstraints.map((fk) => `\`${fk}\``).join(', ')}. Audit whether each relationship is correct and whether any grouped fields should move closer to their dependency.`,
    });
  }

  return { id: 'summary', title: 'Summary', blocks };
}

function buildTeachingSections() {
  return composeTeachingSections().map((s) => ({
    id: s.id,
    title: s.title,
    blocks: [
      { kind: 'paragraph', text: s.body },
      ...(Array.isArray(s.tables) ? s.tables.map((t) => ({ kind: 'table', headers: t.headers, rows: t.rows })) : []),
    ],
  }));
}

function buildGenericPromptSection(reportData) {
  const fragments = reportData.globalFragments || {};
  const resolvedTemplate = KEY_FINDER_DEFAULT_TEMPLATE
    .replace(/\{\{([A-Z_]+)\}\}/g, (match, name) => {
      if (RUNTIME_SLOT_NAMES.has(name)) return `<${name} — injected at call time; see Part 7 for per-key text>`;
      const key = GLOBAL_FRAGMENT_SLOT_KEYS[name] || camelize(name);
      return fragments[key] || `<${name} — fragment not configured>`;
    });

  const blocks = [
    {
      kind: 'paragraph',
      text: 'The block below is the FULL template text with every category-level fragment resolved to its current live wording. Runtime slots (brand, model, product components, identity warning tier, per-key contract etc.) are shown as labeled placeholders — per-key details appear in Part 7 for every field.',
    },
    {
      kind: 'note',
      tone: 'warn',
      text: 'Category-level fragments live in `globalPromptRegistry` and are overridable per category via the Global Prompts editor. To change every prompt in this category at once, edit the fragment — do NOT duplicate fragment text into individual `reasoning_note` cells.',
    },
    { kind: 'codeBlock', lang: 'text', text: resolvedTemplate },
  ];

  const perFragmentTable = {
    kind: 'table',
    headers: ['Fragment', 'Length (chars)', 'First 120 chars'],
    rows: Object.entries(fragments).map(([k, v]) => [
      k,
      String(String(v).length),
      String(v).replace(/\s+/g, ' ').slice(0, 120) + (String(v).length > 120 ? '…' : ''),
    ]),
  };
  blocks.push({ kind: 'subheading', level: 3, text: 'Resolved fragments at a glance' });
  blocks.push(perFragmentTable);

  return { id: 'generic-prompt', title: 'Part 2 — Generic category prompt (compiled)', blocks };
}

function camelize(upperSnake) {
  const parts = String(upperSnake).toLowerCase().split('_');
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

function buildTierBundlesSection(reportData) {
  const tiers = reportData.tierBundles || {};
  const order = ['easy', 'medium', 'hard', 'very_hard', 'fallback'];
  const rows = order.map((tier) => {
    const b = tiers[tier] || {};
    return [
      tier,
      String(b.model || '(empty)'),
      b.useReasoning ? 'yes' : 'no',
      String(b.reasoningModel || '(empty)'),
      b.thinking ? `yes (effort: ${b.thinkingEffort || 'default'})` : 'no',
      b.webSearch ? 'yes' : 'no',
    ];
  });
  return {
    id: 'tier-bundles',
    title: 'Part 3 — Tier bundles (this category)',
    blocks: [
      {
        kind: 'paragraph',
        text: 'A key\'s `difficulty` routes it to one of these bundles. Empty `model` inherits the entire `fallback` bundle.',
      },
      {
        kind: 'table',
        headers: ['Tier', 'Model', 'Reasoning', 'Reasoning model', 'Thinking', 'Web search'],
        rows,
      },
    ],
  };
}

function buildEnumInventorySection(reportData) {
  const blocks = [
    {
      kind: 'paragraph',
      text: 'Every enum declared in this category, with its policy, filter rendering on the website, value count, dominant structural signature, and suspicious value flags. String enums render as filter-toggle chips (one per value); numeric fields render as range bars.',
    },
  ];

  const overview = {
    kind: 'table',
    headers: ['Enum', 'Policy', 'Values', 'Top signature', 'Coverage %', 'Suspicious', 'Used by'],
    rows: reportData.enums.map((e) => [
      e.name,
      e.policy || '(none)',
      String(e.values.length),
      e.analysis?.topSignature?.signature ?? '-',
      e.analysis?.topSignature ? String(e.analysis.topSignature.coveragePct) : '-',
      String(e.analysis?.suspiciousValues?.length || 0),
      e.usedBy.length === 0 ? '(unused)' : e.usedBy.join(', '),
    ]),
  };
  blocks.push({ kind: 'subheading', level: 3, text: 'Overview' });
  blocks.push(overview);

  for (const e of reportData.enums) {
    const subBlocks = [
      {
        kind: 'paragraph',
        text: `Policy: \`${e.policy || 'none'}\` · Values: ${e.values.length} · Used by: ${e.usedBy.length === 0 ? '(unused)' : e.usedBy.join(', ')}`,
      },
    ];
    if (e.analysis?.signatureGroups?.length) {
      subBlocks.push({
        kind: 'table',
        headers: ['Signature', 'Count', 'Examples'],
        rows: e.analysis.signatureGroups.slice(0, 12).map((g) => [
          g.signature,
          String(g.count),
          g.values.slice(0, 4).join(' | ') + (g.values.length > 4 ? ' …' : ''),
        ]),
      });
    }
    if (e.analysis?.suspiciousValues?.length) {
      subBlocks.push({ kind: 'subheading', level: 4, text: 'Suspicious values' });
      subBlocks.push({
        kind: 'bulletList',
        items: e.analysis.suspiciousValues.map((s) => `\`${s.value}\` — ${s.reason}`),
      });
    }
    subBlocks.push({ kind: 'subheading', level: 4, text: 'Full value list' });
    subBlocks.push({
      kind: 'paragraph',
      text: e.values.length === 0 ? '(no values)' : e.values.map((v) => `\`${v}\``).join(', '),
    });
    blocks.push({
      kind: 'details',
      summary: `${e.name} — ${e.values.length} values, policy: ${e.policy || 'none'}`,
      blocks: subBlocks,
    });
  }

  return { id: 'enum-inventory', title: 'Part 4 — Enum inventory', blocks };
}

function buildComponentInventorySection(reportData) {
  const blocks = [
    {
      kind: 'paragraph',
      text: 'Component databases back fields whose value IS a component identity and carry per-entity property rows that populate subfield values at runtime.',
    },
  ];

  const overview = {
    kind: 'table',
    headers: ['Type', 'Entities', 'Identity fields', 'Subfields', 'Field-backed DB properties not currently mapped', 'DB-only properties'],
    rows: reportData.components.map((c) => [
      c.type,
      String(c.entityCount),
      c.identityFields.length === 0 ? '-' : c.identityFields.join(', '),
      c.subfields.length === 0 ? '-' : c.subfields.join(', '),
      c.unmappedFieldProperties?.length ? c.unmappedFieldProperties.join(', ') : '-',
      c.dbOnlyProperties?.length ? c.dbOnlyProperties.join(', ') : '-',
    ]),
  };
  blocks.push({ kind: 'subheading', level: 3, text: 'Overview' });
  blocks.push(overview);

  for (const c of reportData.components) {
    const subBlocks = [];
    if (c.unmappedFieldProperties?.length || c.dbOnlyProperties?.length) {
      subBlocks.push({
        kind: 'paragraph',
        text: `Current component DB hints: field-backed DB properties not currently mapped ${c.unmappedFieldProperties?.length ? c.unmappedFieldProperties.map((field) => `\`${field}\``).join(', ') : '-'}; DB-only properties ${c.dbOnlyProperties?.length ? c.dbOnlyProperties.map((field) => `\`${field}\``).join(', ') : '-'}. These are evidence for from-scratch setup, not the authority. The auditor still decides component identity, component attribute, or standalone for every key.`,
      });
    }
    if (c.entities.length > 0) {
      const propKeys = Array.from(new Set(c.entities.flatMap((e) => Object.keys(e.properties)))).sort();
      subBlocks.push({
        kind: 'table',
        headers: ['Name', 'Maker', ...propKeys],
        rows: c.entities.slice(0, 50).map((e) => [
          e.name,
          e.maker || '-',
          ...propKeys.map((k) => formatPropertyValue(e.properties[k])),
        ]),
      });
      if (c.entities.length > 50) {
        subBlocks.push({ kind: 'paragraph', text: `(first 50 of ${c.entities.length} shown; full list lives in \`component_db/${c.type}.json\`)` });
      }
    }
    blocks.push({
      kind: 'details',
      summary: `${c.type} — ${c.entityCount} entities`,
      blocks: subBlocks,
    });
  }

  return { id: 'component-inventory', title: 'Part 5 — Component database inventory', blocks };
}

function formatPropertyValue(v) {
  if (v === null || v === undefined) return '-';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function summarizeGroupMembership(group, keyIndex) {
  let mandatory = 0;
  let emptyGuidance = 0;
  let emptyHints = 0;
  let patternlessOpen = 0;
  let componentIdentityCount = 0;
  let componentSubfieldCount = 0;
  const difficultyCounts = { easy: 0, medium: 0, hard: 0, very_hard: 0, other: 0 };
  for (const fk of group.fieldKeys) {
    const k = keyIndex[fk];
    if (!k) continue;
    if (k.priority.required_level === 'mandatory') mandatory++;
    if (!k.ai_assist.reasoning_note.trim()) emptyGuidance++;
    if (k.search_hints.query_terms.length === 0 && k.search_hints.domain_hints.length === 0) emptyHints++;
    if (k.enum.policy === 'open_prefer_known' && k.enum.values.length >= 4) {
      const top = k.enum.analysis?.topSignature;
      if (!top || top.coveragePct < 70) patternlessOpen++;
    }
    if (k.component?.relation === 'parent') componentIdentityCount++;
    if (k.component?.relation === 'subfield_of') componentSubfieldCount++;
    const d = k.priority.difficulty;
    if (difficultyCounts[d] !== undefined) difficultyCounts[d]++;
    else difficultyCounts.other++;
  }
  return {
    mandatory,
    emptyGuidance,
    emptyHints,
    patternlessOpen,
    componentIdentityCount,
    componentSubfieldCount,
    difficultyCounts,
  };
}

function findCrossGroupCouplings(group, keyIndex, keyToGroup) {
  const couplings = [];
  for (const fk of group.fieldKeys) {
    const k = keyIndex[fk];
    if (!k || !Array.isArray(k.constraints)) continue;
    for (const c of k.constraints) {
      const rightField = c.right && keyIndex[c.right] ? c.right : null;
      const leftField = c.left && keyIndex[c.left] ? c.left : null;
      const peerField = rightField || leftField;
      if (!peerField || peerField === fk) continue;
      const peerGroup = keyToGroup[peerField];
      if (peerGroup && peerGroup !== group.groupKey) {
        couplings.push({ from: fk, to: peerField, op: c.op, raw: c.raw, peerGroup });
      }
    }
  }
  return couplings;
}

function buildPerGroupDetailBlocks(group, keyIndex, keyToGroup) {
  const key = group.fieldKeys.map((fk) => keyIndex[fk]).filter(Boolean);
  const stats = summarizeGroupMembership(group, keyIndex);
  const couplings = findCrossGroupCouplings(group, keyIndex, keyToGroup);
  const otherDifficultyText = stats.difficultyCounts.other
    ? ` · other ${stats.difficultyCounts.other}`
    : '';

  const blocks = [];
  blocks.push({
    kind: 'paragraph',
    text: `**Members:** ${group.fieldKeys.length} keys · **Mandatory:** ${stats.mandatory} · **Difficulty mix:** easy ${stats.difficultyCounts.easy} · medium ${stats.difficultyCounts.medium} · hard ${stats.difficultyCounts.hard} · very_hard ${stats.difficultyCounts.very_hard}${otherDifficultyText}`,
  });
  blocks.push({
    kind: 'paragraph',
    text: `**Gap counters:** empty guidance ${stats.emptyGuidance} · empty hints ${stats.emptyHints} · patternless open enums ${stats.patternlessOpen} · component identities ${stats.componentIdentityCount} · component subfields ${stats.componentSubfieldCount}`,
  });

  blocks.push({ kind: 'subheading', level: 4, text: 'Member fields' });
  blocks.push({
    kind: 'table',
    headers: ['Field key', 'Display name', 'Type · Shape', 'R · A · D', 'Enum values', 'Guidance', 'Component'],
    rows: key.map((k) => [
      `\`${k.fieldKey}\``,
      k.displayName,
      `${k.contract.type} · ${k.contract.shape}`,
      `${k.priority.required_level === 'mandatory' ? 'M' : 'N'} · ${k.priority.availability} · ${k.priority.difficulty}`,
      k.enum.values.length > 0 ? String(k.enum.values.length) : '-',
      k.ai_assist.reasoning_note.trim() ? 'y' : '-',
      k.component ? `${k.component.relation === 'parent' ? 'IS' : 'in'} ${k.component.type}` : '-',
    ]),
  });

  if (couplings.length > 0) {
    blocks.push({ kind: 'subheading', level: 4, text: 'Cross-group couplings' });
    blocks.push({
      kind: 'paragraph',
      text: 'Fields in this group whose `constraints` point to fields in a different group. A coupling can mean (a) the constraint is correct and the groups are intentionally related, or (b) one of the two fields is misgrouped and should move.',
    });
    blocks.push({
      kind: 'bulletList',
      items: couplings.map((c) => `\`${c.from}\` (this group) — op \`${c.op}\` — \`${c.to}\` (group: \`${c.peerGroup}\`) · raw: \`${c.raw}\``),
    });
  }

  blocks.push({ kind: 'subheading', level: 4, text: 'Group audit questions' });
  blocks.push({
    kind: 'bulletList',
    items: [
      'Is every member field a good fit for this group? Which should move, to which group?',
      'Is any field conspicuously missing from this group? (check adjacent groups for mis-homed neighbors)',
      'Does the group name accurately describe the set? If not, propose a rename.',
      'Is the difficulty mix coherent for the evidence actually required by this group?',
      'Should this group split (too large / contains two clusters) or merge with a neighbor (reviewers always look at them together)?',
    ],
  });
  return blocks;
}

function buildGroupsSection(reportData) {
  const keyIndex = Object.fromEntries(reportData.keys.map((k) => [k.fieldKey, k]));
  const keyToGroup = {};
  for (const g of reportData.groups) for (const fk of g.fieldKeys) keyToGroup[fk] = g.groupKey;

  const overviewRows = reportData.groups.map((g) => {
    const s = summarizeGroupMembership(g, keyIndex);
    return [
      g.displayName,
      `\`${g.groupKey}\``,
      String(g.fieldKeys.length),
      String(s.mandatory),
      `${s.difficultyCounts.easy}/${s.difficultyCounts.medium}/${s.difficultyCounts.hard}/${s.difficultyCounts.very_hard}`,
      String(s.emptyGuidance),
      String(s.emptyHints),
      String(s.patternlessOpen),
    ];
  });

  const blocks = [
    {
      kind: 'paragraph',
      text: 'Field groups cluster related keys. Groups drive bundling policy (`groupBundlingOnly`), co-discovery, Field Studio sidebar organization, and future consumer-facing spec sections + filter groupings. Part 1.8 explains the mechanics; this part surfaces the current membership + gaps so you can audit group coherence.',
    },
    {
      kind: 'note',
      tone: 'info',
      text: 'Poor grouping is a silent tax. Bundling budget gets wasted on passengers that don\'t share a primary\'s evidence context; reviewers slog through unrelated fields back-to-back; future per-group publish-gate rules apply against the wrong set. Treat this section as load-bearing, not cosmetic.',
    },
    { kind: 'subheading', level: 3, text: 'Overview' },
    {
      kind: 'table',
      headers: ['Group', 'Group key', 'Keys', 'Mand', 'Diff (E/M/H/VH)', 'Empty guidance', 'Empty hints', 'Open enum w/o pattern'],
      rows: overviewRows,
    },
  ];

  for (const g of reportData.groups) {
    blocks.push({
      kind: 'details',
      summary: `${g.displayName} — ${g.fieldKeys.length} keys`,
      blocks: buildPerGroupDetailBlocks(g, keyIndex, keyToGroup),
    });
  }

  return { id: 'groups', title: 'Part 6 — Field groups', blocks };
}

function formatAuditValue(value) {
  if (value === null || value === undefined || value === '') return '(unset)';
  if (Array.isArray(value)) return value.length === 0 ? '[]' : value.map((v) => `\`${v}\``).join(', ');
  if (typeof value === 'object') return `\`${JSON.stringify(value)}\``;
  return `\`${String(value)}\``;
}

function formatTierBundleAuditValue(adapterPreview) {
  const bundle = adapterPreview?.tierBundle || {};
  if (!bundle.model) return 'tier unresolved; audit `priority.difficulty` against category tier settings';
  const reasoning = bundle.useReasoning ? 'reasoning on' : 'reasoning off';
  const thinking = bundle.thinking ? `thinking on${bundle.thinkingEffort ? ` (${bundle.thinkingEffort})` : ''}` : 'thinking off';
  const search = bundle.webSearch ? 'web search on' : 'web search off';
  return `tier \`${bundle.name || 'unknown'}\` -> model \`${bundle.model}\`; ${reasoning}; ${thinking}; ${search}`;
}

function buildSearchRoutingBlocks(key, adapterPreview) {
  const benchmarkText = 'the category benchmark/example set when available';
  return [
    { kind: 'subheading', level: 4, text: 'Search + routing contract' },
    {
      kind: 'paragraph',
      text: `Audit \`required_level\`, \`availability\`, and \`difficulty\` as extraction/search strategy, not admin labels. Requiredness decides whether the site should try to publish the field for most products because it is distinguishable from public/spec/visual/identity evidence and belongs in benchmark-depth coverage; it is not restricted to lab-only measurements. Difficulty decides model/search strength after variant inventory, PIF images, aliases, and source hints are available.`,
    },
    {
      kind: 'table',
      headers: ['Knob', 'Current value', 'Audit question'],
      rows: [
        ['`priority.required_level`', formatAuditValue(key.priority.required_level), 'Should this field be mandatory for a publish-grade, depth-tech product page? Mandatory should mean the value is buyer/site/benchmark useful and usually distinguishable from public/spec/visual/identity evidence: visible, identifiable from variant identity, listed in specs/docs, or generally exposed by credible sources. Missing proof still becomes unknown status with no submitted value.'],
        ['`priority.availability`', formatAuditValue(key.priority.availability), 'How often should credible public sources expose this value: always, sometimes, or rare? Wrong availability wastes search budget or delays fields that should be searched early.'],
        ['`priority.difficulty`', formatAuditValue(key.priority.difficulty), 'Can the configured context make this direct? Easy should cover direct spec/photo/PIF/variant lookup or straightforward canonical mapping; medium should cover normalization or light source comparison; hard should cover technical component reasoning, meaningful conflicts, aliases that change meaning, or source credibility calls. Very_hard is reserved for hidden/lab-grade fields such as proprietary internal component identities, instrumented latency/accuracy measurements, unresolved datasheet links, or lab-only metrics.'],
        ['Resolved tier bundle', formatTierBundleAuditValue(adapterPreview), 'Does the resolved model/search strength match the remaining extraction effort after variant inventory, PIF images, aliases, and source hints?'],
        ['Benchmark-depth target', benchmarkText, 'Use benchmark data to calibrate the rule and guidance, not as prompt answers. The contract should explain how keyFinder can reproduce those values from public evidence.'],
      ],
    },
  ];
}

function buildAuthoringChecklistBlocks(key) {
  const priorityCurrent = [
    `priority.required_level=${formatAuditValue(key.priority.required_level)}`,
    `priority.availability=${formatAuditValue(key.priority.availability)}`,
    `priority.difficulty=${formatAuditValue(key.priority.difficulty)}`,
  ].join(' | ');
  const contractCurrent = [
    `contract.type=${formatAuditValue(key.contract.type)}`,
    `contract.shape=${formatAuditValue(key.contract.shape)}`,
    `contract.unit=${formatAuditValue(key.contract.unit)}`,
    `contract.rounding=${formatAuditValue(key.contract.rounding)}`,
    `contract.list_rules=${formatAuditValue(key.contract.list_rules)}`,
    `contract.range=${formatAuditValue(key.contract.range)}`,
  ].join(' | ');
  const enumCurrent = [
    `enum.policy=${formatAuditValue(key.enum.policy)}`,
    `enum.values=${key.enum.values.length}`,
    `filter_ui=${formatAuditValue(key.enum.filterUi)}`,
  ].join(' | ');
  const evidenceCurrent = [
    `evidence.min_evidence_refs=${formatAuditValue(key.evidence.min_evidence_refs)}`,
    `evidence.tier_preference=${formatAuditValue(key.evidence.tier_preference)}`,
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
  const colorEditionContext = key.ai_assist?.color_edition_context;
  const colorEditionContextCurrent = typeof colorEditionContext?.enabled === 'boolean'
    ? (colorEditionContext.enabled ? 'enabled' : 'disabled')
    : 'No explicit setting';
  const pifPriorityImages = key.ai_assist?.pif_priority_images;
  const pifPriorityImagesCurrent = typeof pifPriorityImages?.enabled === 'boolean'
    ? (pifPriorityImages.enabled ? 'enabled' : 'disabled')
    : 'No explicit setting';

  return [
    { kind: 'subheading', level: 4, text: 'Full field contract authoring order' },
    {
      kind: 'paragraph',
      text: 'Validate the whole field contract before editing guidance. A strong audit can say "no contract change" when shape, enum policy, requiredness, evidence, and consumer behavior are already correct; still leave guidance/examples/aliases/enum cleanup when those are the real improvement. Guidance last: write `ai_assist.reasoning_note` only after scheduling, value shape, enum/filter behavior, consumer-surface intent, unknown/not-applicable states, evidence/source rules, and example coverage are correct.',
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
        ['8', 'Color & Edition Context', colorEditionContextCurrent, 'Enable only when edition/SKU/release/colorway/PIF identity helps reject wrong-variant evidence without ambiguity. Most invariant model-level keys should not need it. List or variant-varying keys need a union vs exact/base/default rule in reasoning_note.'],
        ['9', 'PIF Priority Images', pifPriorityImagesCurrent, 'Enable only when default/base priority-view images help a visual key. Missing/unattachable images are not negative evidence. Edition-specific yes/no or list behavior belongs in reasoning_note.'],
        ['10', 'Guidance last', formatAuditValue(key.ai_assist?.reasoning_note), 'Now write paste-ready guidance that fills only the remaining extraction judgment gap, or write "(empty - keep)" when no guidance is needed.'],
      ],
    },
  ];
}

function buildExampleBankRecipeBlocks(key) {
  return [
    { kind: 'subheading', level: 4, text: 'Example bank recipe' },
    {
      kind: 'paragraph',
      text: `Build a 5-10 product example bank for \`${key.fieldKey}\` before finalizing the rule. Prefer hand-entered benchmark data when available, then product JSON/candidates, seed products, component DB rows, and source research. For brand-new categories, use representative market products to create the first calibration set. Use examples to author the contract and guidance; do not paste benchmark answers into the live prompt.`,
    },
    {
      kind: 'table',
      headers: ['Bucket', 'Count', 'What it proves'],
      rows: [
        ['Common happy path', '2-3', 'Normal category products where the value is present and easy to source.'],
        ['Edge / rare value', '1-2', 'Boundary values, rare enum values, unusual units, unusually long lists, or uncommon component variants.'],
        ['Unknown / absent evidence', '1', 'A product where honest `unk` is the correct outcome because sources do not prove the field.'],
        ['Conflict / ambiguity', '1', 'Two credible sources disagree, labels are reused, or the field is often confused with a sibling key.'],
        ['Filter-risk', '1-2', 'Values that would create new enum chips, range extremes, pattern outliers, or consumer-facing clutter.'],
        ['Benchmark carry-forward', 'as available', 'Use benchmark cells as calibration for this key, then apply the same recipe to every category.'],
      ],
    },
  ];
}

function buildPerKeyBlocks(key, adapterPreview) {
  const priority = `${key.priority.required_level} · ${key.priority.availability} · ${key.priority.difficulty}`;
  const tier = adapterPreview.tierBundle;
  const headerParagraph = `**Group:** ${key.group} · **Priority (required · availability · difficulty):** ${priority} · **Resolved tier:** ${tier.name} → model \`${tier.model || '(inherit)'}\`${tier.useReasoning ? ' · reasoning on' : ''}${tier.webSearch ? ' · web search' : ''}`;

  const blocks = [{ kind: 'paragraph', text: headerParagraph }];
  blocks.push(...buildSearchRoutingBlocks(key, adapterPreview));
  blocks.push(...buildAuthoringChecklistBlocks(key));
  blocks.push(...buildExampleBankRecipeBlocks(key));

  // Contract — always present.
  blocks.push({ kind: 'subheading', level: 4, text: 'Contract' });
  blocks.push({ kind: 'codeBlock', lang: 'text', text: adapterPreview.contract || '(renderer produced no contract block)' });

  // Enum — only if values exist. Filter UI line inline with count so the
  // reviewer sees count + signature + values in one glance.
  if (key.enum.values.length > 0) {
    const topSig = key.enum.analysis?.topSignature;
    blocks.push({ kind: 'subheading', level: 4, text: `Enum (${key.enum.values.length} values · filter UI: ${key.enum.filterUi} · policy: ${key.enum.policy})` });
    if (topSig) {
      blocks.push({ kind: 'paragraph', text: `Top signature: \`${topSig.signature}\` · coverage ${topSig.coveragePct}%` });
    }
    if (key.enum.analysis?.signatureGroups?.length > 1) {
      blocks.push({
        kind: 'table',
        headers: ['Signature', 'Count'],
        rows: key.enum.analysis.signatureGroups.slice(0, 8).map((g) => [g.signature, String(g.count)]),
      });
    }
    blocks.push({ kind: 'paragraph', text: key.enum.values.map((v) => `\`${v}\``).join(', ') });
    if (key.enum.analysis?.suspiciousValues?.length) {
      blocks.push({
        kind: 'bulletList',
        items: key.enum.analysis.suspiciousValues.map((s) => `suspicious: \`${s.value}\` — ${s.reason}`),
      });
    }
  }

  // Aliases — only if present.
  if (key.aliases.length > 0) {
    blocks.push({ kind: 'subheading', level: 4, text: 'Aliases' });
    blocks.push({ kind: 'paragraph', text: key.aliases.map((a) => `\`${a}\``).join(', ') });
  }

  // Search hints — only if renderer produced content.
  if (adapterPreview.searchHints) {
    blocks.push({ kind: 'subheading', level: 4, text: 'Search hints' });
    blocks.push({ kind: 'codeBlock', lang: 'text', text: adapterPreview.searchHints });
  }

  // Cross-field constraints — only if defined. Alias-mismatch warning is
  // hoisted to the category-level Flags section; no per-key repetition.
  if (key.constraints.length > 0) {
    blocks.push({ kind: 'subheading', level: 4, text: 'Cross-field constraints' });
    blocks.push({
      kind: 'bulletList',
      items: key.constraints.map((c) => `\`${c.raw}\` → op=${c.op}, left=${c.left}, right=${c.right}`),
    });
    if (adapterPreview.crossField) {
      blocks.push({ kind: 'codeBlock', lang: 'text', text: adapterPreview.crossField });
    }
  }

  // Component relation — only if present.
  if (key.component) {
    blocks.push({ kind: 'subheading', level: 4, text: 'Component relation' });
    blocks.push({ kind: 'paragraph', text: `\`${key.component.relation}\` → \`${key.component.type}\` (source: \`${key.component.source}\`)` });
    if (adapterPreview.componentRel) {
      blocks.push({ kind: 'codeBlock', lang: 'text', text: adapterPreview.componentRel });
    }
  }
  if (key.componentDbProperty) {
    blocks.push({ kind: 'subheading', level: 4, text: 'Component relation' });
    blocks.push({
      kind: 'note',
      tone: 'info',
      text: `Existing component DB hint: \`${key.fieldKey}\` exists in \`${key.componentDbProperty.source}\` but is not currently mapped in \`component_sources.${key.componentDbProperty.type}.roles.properties[]\`. Use this only as setup evidence; the auditor still decides whether this key is a component identity, component attribute, or standalone.`,
    });
  }
  if (!key.component) {
    blocks.push({ kind: 'subheading', level: 4, text: 'Component setup decision' });
    blocks.push({
      kind: 'paragraph',
      text: 'Classify this key from scratch as component identity, component attribute, or standalone. Do not wait for an existing component DB property before proposing a component attribute. If it is an attribute, choose the parent component and add the field to patch.component_sources roles.properties[]. If it is an identity, use enum.source = component_db.<component_type>.',
    });
  }

  // Extraction guidance — always show a heading so a reviewer seeing NO
  // guidance block knows the cell is empty and needs authoring.
  blocks.push({ kind: 'subheading', level: 4, text: 'Extraction guidance (`reasoning_note`)' });
  if (adapterPreview.guidance) {
    blocks.push({ kind: 'codeBlock', lang: 'text', text: adapterPreview.guidance });
  } else {
    blocks.push({ kind: 'paragraph', text: '_empty — unauthored_' });
  }

  // Evidence config — one line, only if it deviates from the default
  // (min_evidence_refs > 1 or a non-default tier order).
  const hasInterestingEvidence = key.evidence.min_evidence_refs > 1 || (key.evidence.tier_preference.length > 0 && key.evidence.tier_preference.join(',') !== 'tier1,tier2,tier3');
  if (hasInterestingEvidence) {
    blocks.push({
      kind: 'paragraph',
      text: `**Evidence:** min_evidence_refs: ${key.evidence.min_evidence_refs} · tier_preference: ${key.evidence.tier_preference.join(', ') || '(default)'}`,
    });
  }

  return blocks;
}

function buildPerKeySections(reportData) {
  const keyIndex = Object.fromEntries(reportData.keys.map((k) => [k.fieldKey, k]));
  const sections = [];
  for (const group of reportData.groups) {
    const groupSubsections = group.fieldKeys.map((fk) => {
      const key = keyIndex[fk];
      const preview = renderKeyFinderPreview(key.rawRule, fk, {
        tierBundles: reportData.tierBundles,
        searchHintsEnabled: true,
        componentInjectionEnabled: true,
        knownValues: reportData.knownValues || null,
      });
      return {
        id: `key-${fk}`,
        title: `\`${fk}\` — ${key.displayName}`,
        blocks: buildPerKeyBlocks(key, preview),
        level: 3,
      };
    });
    sections.push({
      id: `grp-${group.groupKey}`,
      title: `${group.displayName} · ${group.fieldKeys.length} keys`,
      blocks: [],
      level: 2,
      children: groupSubsections,
    });
  }
  return sections;
}

function buildAuditorTaskSection() {
  const task = composeAuditorTask();
  return {
    id: task.id,
    title: task.title,
    blocks: [
      { kind: 'note', tone: 'good', text: 'Hand this document to a human reviewer or an LLM (Opus / GPT / Gemini / Claude Sonnet) exactly as-is. The handoff is self-contained — Part 1 teaches the system, Part 1a sets the audit standard, Parts 2–7 are the data, and the instructions below tell the reviewer what to return.' },
      { kind: 'paragraph', text: task.body },
    ],
    level: 2,
  };
}

function buildAuditStandardSection() {
  const std = composeAuditStandard();
  return {
    id: std.id,
    title: std.title,
    blocks: [{ kind: 'paragraph', text: std.body }],
    level: 2,
  };
}

export function buildReportStructure(reportData) {
  const header = {
    id: 'header',
    title: `Key Finder Audit — \`${reportData.category}\``,
    blocks: buildHeaderBlocks(reportData),
    level: 1,
  };
  const auditorTask = buildAuditorTaskSection();
  const auditStandard = buildAuditStandardSection();
  const summary = buildSummarySection(reportData);
  const teaching = {
    id: 'part-1-teaching',
    title: 'Part 1 — How the keyFinder pipeline works',
    blocks: [],
    level: 2,
    children: buildTeachingSections(),
  };
  const genericPrompt = buildGenericPromptSection(reportData);
  const tierBundles = buildTierBundlesSection(reportData);
  const enumInventory = buildEnumInventorySection(reportData);
  const componentInventory = buildComponentInventorySection(reportData);
  const groups = buildGroupsSection(reportData);
  const perKey = {
    id: 'part-7-per-key',
    title: 'Part 7 — Per-key detail',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Every field in this category, grouped as the website does. Each block shows the normalized rule state plus the exact prompt text each key-specific slot would inject.',
      },
    ],
    level: 2,
    children: buildPerKeySections(reportData),
  };

  return {
    meta: { category: reportData.category, generatedAt: reportData.generatedAt },
    sections: [header, auditorTask, auditStandard, summary, teaching, genericPrompt, tierBundles, enumInventory, componentInventory, groups, perKey],
  };
}
