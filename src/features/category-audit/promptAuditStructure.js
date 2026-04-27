function code(value) {
  return `\`${String(value || '-')}\``;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function shortText(value, limit = 240) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '-';
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function jsonText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function formatPlaceholders(values) {
  return Array.isArray(values) && values.length > 0 ? values.map(code).join(', ') : '-';
}

function formatGlobalKeys(values) {
  return Array.isArray(values) && values.length > 0 ? values.map(code).join(', ') : '-';
}

function formatFlags(flags) {
  return Array.isArray(flags) && flags.length > 0 ? flags.join(' | ') : 'none';
}

function buildSummaryHeader(data) {
  return {
    id: 'header',
    title: `Prompt Audit Summary - ${code(data.category)}`,
    blocks: [
      {
        kind: 'paragraph',
        text: [
          `Category: ${code(data.category)}`,
          `Generated: ${code(data.generatedAt)}`,
          `Prompt surfaces: ${data.stats?.promptCount || 0}`,
          `Owners: ${data.stats?.ownerCount || 0}`,
          `Overrides: ${data.stats?.overrideCount || 0}`,
          `Flags: ${data.stats?.flagsCount || 0}`,
          `Global prompts: ${data.stats?.globalPromptCount || 0}`,
        ].join(' / '),
      },
      {
        kind: 'note',
        tone: 'info',
        text: 'Read-only prompt audit for CEF, PIF, image evaluation, RDF, and SKU. It explains the live prompt templates, resolved overrides, variables, global fragments, sample compiled text, and response schemas so category-specific prompt gaps can be reviewed in one pass.',
      },
    ],
  };
}

function buildSummaryContextSection() {
  return {
    id: 'audit-context',
    title: 'Audit Context',
    blocks: [
      {
        kind: 'paragraph',
        text: 'This report is the prompt-level companion to the Key Finder per-key audit. Key Finder audits individual field contracts; this prompt audit checks the finder prompts that own variants, product images, image evaluation, release dates, and SKUs.',
      },
      {
        kind: 'paragraph',
        text: 'Use the matrix to find category coverage risk quickly, then open `.workspace/reports/per-prompt/<category>/<owner>/<prompt>.md` for the full variable map, default/effective template, compiled sample, and response schema.',
      },
    ],
  };
}

function buildPromptSurfaceMatrix(data) {
  const rows = (data.prompts || []).map((prompt) => [
    prompt.ownerLabel || prompt.owner,
    prompt.title,
    code(prompt.moduleId),
    code(prompt.settingKey),
    code(prompt.storageScope),
    yesNo(prompt.overrideActive),
    String(prompt.variables?.length || 0),
    formatGlobalKeys(prompt.usedGlobalPrompts),
    formatFlags(prompt.flags),
  ]);

  return {
    id: 'prompt-surface-matrix',
    title: 'Prompt Surface Matrix',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Every audited prompt surface, including its settings owner, override status, variable count, linked global prompt fragments, and generated audit flags.',
      },
      {
        kind: 'table',
        headers: ['Owner', 'Prompt', 'Module', 'Setting', 'Scope', 'Override', 'Variables', 'Global prompts', 'Flags'],
        rows,
      },
    ],
  };
}

function buildGlobalPromptMatrix(data) {
  const rows = (data.globalPrompts || []).map((fragment) => [
    code(fragment.key),
    fragment.label || fragment.key,
    fragment.appliesTo || '-',
    yesNo(fragment.overrideActive),
    fragment.variables || '-',
    shortText(fragment.description),
    shortText(fragment.resolvedPreview),
  ]);

  return {
    id: 'global-prompt-fragment-matrix',
    title: 'Global Prompt Fragment Matrix',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Global prompt fragments available to the audited prompt surfaces. A per-prompt brief lists only the fragments used by that specific prompt.',
      },
      {
        kind: 'table',
        headers: ['Key', 'Label', 'Applies to', 'Override', 'Variables', 'Description', 'Resolved preview'],
        rows,
      },
    ],
  };
}

function buildGlobalPromptDetailsSection(data) {
  const details = (data.globalPrompts || []).map((fragment) => ({
    kind: 'details',
    summary: `${fragment.key} - ${fragment.label || fragment.key}`,
    blocks: [
      {
        kind: 'table',
        headers: ['Facet', 'Value'],
        rows: [
          ['Key', code(fragment.key)],
          ['Label', fragment.label || fragment.key],
          ['Applies to', fragment.appliesTo || '-'],
          ['Override active', yesNo(fragment.overrideActive)],
          ['Description', fragment.description || '-'],
        ],
      },
      {
        kind: 'table',
        headers: ['Variable', 'Required'],
        rows: fragment.variableRows?.length > 0
          ? fragment.variableRows.map((variable) => [code(`{{${variable.name}}}`), yesNo(variable.required)])
          : [['-', 'No variables declared.']],
      },
      { kind: 'subheading', level: 3, text: 'Default Global Prompt' },
      { kind: 'codeBlock', lang: 'text', text: fragment.defaultTemplate || '' },
      { kind: 'subheading', level: 3, text: 'Effective Global Prompt' },
      { kind: 'codeBlock', lang: 'text', text: fragment.resolvedTemplate || '' },
    ],
  }));

  return {
    id: 'global-prompt-fragment-details',
    title: 'Global Prompt Fragment Details',
    blocks: [
      {
        kind: 'paragraph',
        text: 'One expandable block per Global Prompts entry. Each block shows the source contract, required `{{...}}` variables, default template, and effective resolved template used for prompt compilation.',
      },
      ...details,
    ],
  };
}

function buildRiskSection(data) {
  const flagged = (data.prompts || []).filter((prompt) => Array.isArray(prompt.flags) && prompt.flags.length > 0);
  return {
    id: 'category-prompt-risk',
    title: 'Category Prompt Risk',
    blocks: [
      {
        kind: 'note',
        tone: flagged.length > 0 ? 'warn' : 'good',
        text: flagged.length > 0
          ? `${flagged.length} prompt surface(s) need review. Flags are not automatic failures; they identify generic fallbacks, category wording risk, or placeholder/template contract drift.`
          : 'No generated prompt audit flags for this category.',
      },
      {
        kind: 'table',
        headers: ['Owner', 'Prompt', 'Flags'],
        rows: flagged.length > 0
          ? flagged.map((prompt) => [prompt.ownerLabel || prompt.owner, prompt.title, formatFlags(prompt.flags)])
          : [['-', '-', 'No prompt flags generated.']],
      },
    ],
  };
}

export function buildPromptAuditSummaryStructure(data) {
  return {
    meta: {
      category: data.category,
      generatedAt: data.generatedAt,
    },
    sections: [
      buildSummaryHeader(data),
      buildSummaryContextSection(),
      buildPromptSurfaceMatrix(data),
      buildGlobalPromptMatrix(data),
      buildGlobalPromptDetailsSection(data),
      buildRiskSection(data),
    ],
  };
}

function buildPromptHeader(record, { category, generatedAt }) {
  return {
    id: 'header',
    title: record.title,
    blocks: [
      {
        kind: 'paragraph',
        text: [
          `Category: ${code(category)}`,
          `Owner: ${record.ownerLabel || record.owner}`,
          `Generated: ${code(generatedAt)}`,
        ].join(' / '),
      },
      {
        kind: 'note',
        tone: record.flags?.length > 0 ? 'warn' : 'info',
        text: record.flags?.length > 0
          ? `Audit flags: ${formatFlags(record.flags)}`
          : 'No generated audit flags for this prompt surface.',
      },
    ],
  };
}

function buildPromptContractSection(record) {
  return {
    id: 'prompt-contract',
    title: 'Prompt Contract',
    blocks: [
      {
        kind: 'table',
        headers: ['Facet', 'Value'],
        rows: [
          ['Owner', `${record.ownerLabel || record.owner} (${code(record.owner)})`],
          ['Phase', code(record.phaseId)],
          ['Prompt key', code(record.promptKey)],
          ['Module', code(record.moduleId)],
          ['Setting key', code(record.settingKey)],
          ['Storage scope', code(record.storageScope)],
          ['Override active', yesNo(record.overrideActive)],
          ['Default template placeholders', formatPlaceholders(record.templatePlaceholders)],
          ['Effective template placeholders', formatPlaceholders(record.effectivePlaceholders)],
          ['Unresolved placeholders after compile', formatPlaceholders(record.unresolvedPlaceholders)],
        ],
      },
    ],
  };
}

function buildVariableMatrixSection(record) {
  const rows = (record.variables || []).map((variable) => [
    code(`{{${variable.name}}}`),
    yesNo(variable.required),
    variable.category || '-',
    formatGlobalKeys(variable.globalSources),
    yesNo(variable.presentInDefault),
    yesNo(variable.presentInEffective),
    shortText(variable.sampleValue),
    variable.description || '-',
  ]);

  return {
    id: 'prompt-variable-matrix',
    title: 'Prompt Variable Matrix',
    blocks: [
      {
        kind: 'paragraph',
        text: 'All variables declared by the prompt contract. Global-source variables name the Global Prompts fragments that feed the slot; deterministic variables come from product identity, finder settings, or runtime state.',
      },
      {
        kind: 'table',
        headers: ['Variable', 'Required', 'Kind', 'Global sources', 'Default template', 'Effective template', 'Sample value', 'Description'],
        rows: rows.length > 0 ? rows : [['-', '-', '-', '-', '-', '-', '-', 'This prompt uses a full replacement body rather than a variable template.']],
      },
    ],
  };
}

function buildGlobalSourcesSection(record, globalPrompts) {
  const byKey = new Map((globalPrompts || []).map((fragment) => [fragment.key, fragment]));
  const rows = (record.usedGlobalPrompts || []).map((key) => {
    const fragment = byKey.get(key);
    return [
      code(key),
      fragment?.label || key,
      fragment?.appliesTo || '-',
      fragment?.variables || '-',
      shortText(fragment?.resolvedPreview),
    ];
  });
  const detailBlocks = (record.usedGlobalPrompts || []).map((key) => {
    const fragment = byKey.get(key);
    if (!fragment) return null;
    return {
      kind: 'details',
      summary: `${key} - ${fragment.label || key}`,
      blocks: [
        {
          kind: 'table',
          headers: ['Variable', 'Required'],
          rows: fragment.variableRows?.length > 0
            ? fragment.variableRows.map((variable) => [code(`{{${variable.name}}}`), yesNo(variable.required)])
            : [['-', 'No variables declared.']],
        },
        { kind: 'subheading', level: 3, text: 'Default Global Prompt' },
        { kind: 'codeBlock', lang: 'text', text: fragment.defaultTemplate || '' },
        { kind: 'subheading', level: 3, text: 'Effective Global Prompt' },
        { kind: 'codeBlock', lang: 'text', text: fragment.resolvedTemplate || '' },
      ],
    };
  }).filter(Boolean);

  return {
    id: 'global-prompt-sources',
    title: 'Global Prompt Sources',
    blocks: [
      {
        kind: 'table',
        headers: ['Key', 'Label', 'Applies to', 'Variables', 'Resolved preview'],
        rows: rows.length > 0 ? rows : [['-', '-', '-', '-', 'No global prompt fragments are declared for this prompt surface.']],
      },
      ...detailBlocks,
    ],
  };
}

function buildUserMessageSection(record) {
  const rows = (record.userMessageInfo || []).map((entry) => [
    code(entry.field),
    entry.description || '-',
  ]);

  return {
    id: 'user-message-fields',
    title: 'User Message Fields',
    blocks: [
      {
        kind: 'table',
        headers: ['Field', 'Description'],
        rows: rows.length > 0 ? rows : [['-', 'No separate user-message fields are declared for this prompt surface.']],
      },
    ],
  };
}

function buildTemplateSection(record) {
  const blocks = [
    { kind: 'subheading', level: 3, text: 'Default Template' },
    { kind: 'codeBlock', lang: 'text', text: record.defaultTemplate || '' },
    { kind: 'subheading', level: 3, text: 'Effective Template' },
    { kind: 'codeBlock', lang: 'text', text: record.effectiveTemplate || '' },
  ];

  return {
    id: 'prompt-templates',
    title: 'Prompt Templates',
    blocks,
  };
}

function buildCompiledPromptSection(record) {
  return {
    id: 'full-compiled-sample-prompt',
    title: 'Full Compiled Sample Prompt',
    blocks: [
      {
        kind: 'paragraph',
        text: 'A sample prompt compiled through the live prompt builder with placeholder product identity. It is for audit shape and category prompt coverage, not a product extraction answer.',
      },
      { kind: 'codeBlock', lang: 'text', text: record.compiledPrompt || '' },
    ],
  };
}

function buildSchemaSection(record) {
  return {
    id: 'response-schema',
    title: 'Response Schema',
    blocks: [
      { kind: 'codeBlock', lang: 'json', text: jsonText(record.responseSchema) },
    ],
  };
}

export function buildPromptAuditPromptStructure(record, { category, generatedAt, globalPrompts }) {
  return {
    meta: {
      category,
      generatedAt,
      owner: record.owner,
      slug: record.slug,
    },
    sections: [
      buildPromptHeader(record, { category, generatedAt }),
      buildPromptContractSection(record),
      buildVariableMatrixSection(record),
      buildGlobalSourcesSection(record, globalPrompts),
      buildUserMessageSection(record),
      buildTemplateSection(record),
      buildCompiledPromptSection(record),
      buildSchemaSection(record),
    ],
  };
}
