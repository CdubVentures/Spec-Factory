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
import { composeTeachingSections, composeAuditorTask } from './teaching.js';
import { KEY_FINDER_DEFAULT_TEMPLATE } from '../key/keyLlmAdapter.js';

const RUNTIME_SLOT_NAMES = new Set([
  'BRAND', 'MODEL', 'VARIANT_SUFFIX', 'VARIANT_COUNT',
  'IDENTITY_WARNING', 'PRODUCT_COMPONENTS', 'KNOWN_PRODUCT_FIELDS', 'PREVIOUS_DISCOVERY',
  'PRIMARY_FIELD_KEY', 'PRIMARY_FIELD_GUIDANCE', 'PRIMARY_FIELD_CONTRACT',
  'PRIMARY_SEARCH_HINTS', 'PRIMARY_CROSS_FIELD_CONSTRAINTS', 'PRIMARY_COMPONENT_KEYS',
  'ADDITIONAL_FIELD_KEYS', 'ADDITIONAL_FIELD_GUIDANCE', 'ADDITIONAL_FIELD_CONTRACT',
  'ADDITIONAL_CROSS_FIELD_CONSTRAINTS', 'ADDITIONAL_COMPONENT_KEYS',
  'RETURN_JSON_SHAPE',
]);

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
  return {
    id: 'summary',
    title: 'Summary',
    blocks: [{ kind: 'table', headers: ['Metric', 'Value'], rows }],
  };
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
      const key = camelize(name);
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
      text: 'Component databases back fields whose value IS a component identity (e.g. `sensor`, `switch`, `encoder`) and carry per-entity property rows that populate subfield values at runtime.',
    },
  ];

  const overview = {
    kind: 'table',
    headers: ['Type', 'Entities', 'Identity fields', 'Subfields'],
    rows: reportData.components.map((c) => [
      c.type,
      String(c.entityCount),
      c.identityFields.length === 0 ? '-' : c.identityFields.join(', '),
      c.subfields.length === 0 ? '-' : c.subfields.join(', '),
    ]),
  };
  blocks.push({ kind: 'subheading', level: 3, text: 'Overview' });
  blocks.push(overview);

  for (const c of reportData.components) {
    const subBlocks = [];
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

  const blocks = [];
  blocks.push({
    kind: 'paragraph',
    text: `**Members:** ${group.fieldKeys.length} keys · **Mandatory:** ${stats.mandatory} · **Difficulty mix:** easy ${stats.difficultyCounts.easy} · medium ${stats.difficultyCounts.medium} · hard ${stats.difficultyCounts.hard} · very_hard ${stats.difficultyCounts.very_hard}${stats.difficultyCounts.other ? ` · other ${stats.difficultyCounts.other}` : ''}`,
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
      'Is the difficulty mix coherent (identity anchors should be mostly hard / very_hard)?',
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

function buildPerKeyBlocks(key, adapterPreview) {
  const priority = `${key.priority.required_level} · ${key.priority.availability} · ${key.priority.difficulty}`;
  const tier = adapterPreview.tierBundle;
  const headerParagraph = `**Group:** ${key.group} · **Priority (required · availability · difficulty):** ${priority} · **Resolved tier:** ${tier.name} → model \`${tier.model || '(inherit)'}\`${tier.useReasoning ? ' · reasoning on' : ''}${tier.webSearch ? ' · web search' : ''}`;

  const blocks = [{ kind: 'paragraph', text: headerParagraph }];

  blocks.push({ kind: 'subheading', level: 4, text: 'Contract (PRIMARY_FIELD_CONTRACT)' });
  blocks.push({ kind: 'codeBlock', lang: 'text', text: adapterPreview.contract || '(empty — renderer produced no contract block)' });

  blocks.push({ kind: 'subheading', level: 4, text: `Enum (filter UI: ${key.enum.filterUi})` });
  if (key.enum.values.length > 0) {
    blocks.push({ kind: 'paragraph', text: `Policy: \`${key.enum.policy}\` · Values: ${key.enum.values.length}${key.enum.analysis?.topSignature ? ` · Top signature: \`${key.enum.analysis.topSignature.signature}\` (coverage ${key.enum.analysis.topSignature.coveragePct}%)` : ''}` });
    if (key.enum.analysis?.signatureGroups?.length > 1) {
      blocks.push({
        kind: 'table',
        headers: ['Signature', 'Count'],
        rows: key.enum.analysis.signatureGroups.slice(0, 8).map((g) => [g.signature, String(g.count)]),
      });
    }
    blocks.push({ kind: 'paragraph', text: key.enum.values.map((v) => `\`${v}\``).join(', ') });
  } else {
    blocks.push({ kind: 'paragraph', text: 'No enum values declared.' });
  }

  blocks.push({ kind: 'subheading', level: 4, text: 'Aliases' });
  blocks.push({ kind: 'paragraph', text: key.aliases.length > 0 ? key.aliases.map((a) => `\`${a}\``).join(', ') : '(none)' });

  blocks.push({ kind: 'subheading', level: 4, text: 'Search hints (PRIMARY_SEARCH_HINTS)' });
  blocks.push({ kind: 'codeBlock', lang: 'text', text: adapterPreview.searchHints || '(empty — no domain or query hints on this rule)' });

  blocks.push({ kind: 'subheading', level: 4, text: 'Cross-field constraints' });
  if (key.constraints.length > 0) {
    blocks.push({ kind: 'paragraph', text: 'Defined in compiled rule (string DSL):' });
    blocks.push({
      kind: 'bulletList',
      items: key.constraints.map((c) => `\`${c.raw}\` → op=${c.op}, left=${c.left}, right=${c.right}`),
    });
  } else {
    blocks.push({ kind: 'paragraph', text: 'No constraints defined.' });
  }
  blocks.push({ kind: 'paragraph', text: 'Rendered in live prompt (PRIMARY_CROSS_FIELD_CONSTRAINTS):' });
  blocks.push({ kind: 'codeBlock', lang: 'text', text: adapterPreview.crossField || '(empty — renderer emits nothing; alias mismatch between compiled `constraints` and renderer\'s `cross_field_constraints`)' });

  blocks.push({ kind: 'subheading', level: 4, text: 'Component relation (PRIMARY_COMPONENT_KEYS)' });
  if (key.component) {
    blocks.push({ kind: 'paragraph', text: `\`${key.component.relation}\` → \`${key.component.type}\` (source: \`${key.component.source}\`)` });
    blocks.push({ kind: 'codeBlock', lang: 'text', text: adapterPreview.componentRel || '(belongs-to relation — no prompt pointer emitted; subfield values flow through PRODUCT_COMPONENTS at runtime)' });
  } else {
    blocks.push({ kind: 'paragraph', text: 'No component relation.' });
  }

  blocks.push({ kind: 'subheading', level: 4, text: 'Extraction guidance (PRIMARY_FIELD_GUIDANCE)' });
  blocks.push({ kind: 'codeBlock', lang: 'text', text: adapterPreview.guidance || '(empty — `ai_assist.reasoning_note` is blank on this rule)' });

  blocks.push({ kind: 'subheading', level: 4, text: 'Evidence config' });
  blocks.push({ kind: 'paragraph', text: `min_evidence_refs: ${key.evidence.min_evidence_refs} · tier_preference: ${key.evidence.tier_preference.join(', ') || '(default)'}` });

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
      { kind: 'note', tone: 'good', text: 'Hand this document to a human reviewer or an LLM (Opus / GPT / Gemini / Claude Sonnet) exactly as-is. The handoff is self-contained — Part 1 teaches the system, Parts 2–7 are the data, and the instructions below tell the reviewer what to return.' },
      { kind: 'paragraph', text: task.body },
    ],
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
    sections: [header, auditorTask, summary, teaching, genericPrompt, tierBundles, enumInventory, componentInventory, groups, perKey],
  };
}
