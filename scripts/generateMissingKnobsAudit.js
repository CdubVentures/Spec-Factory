import ExcelJS from 'exceljs';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';

const wb = new ExcelJS.Workbook();
wb.creator = 'Spec Factory Audit';
wb.created = new Date();

// ─── helpers ───
function styleHeader(ws) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 24;
  return row;
}

function addBorders(ws) {
  for (let i = 1; i <= ws.rowCount; i++) {
    ws.getRow(i).eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    });
  }
}

function stripeRows(ws, color) {
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    if (i % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    }
    row.alignment = { vertical: 'top', wrapText: true };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Sheet 1: Missing Knobs — truly not surfaced in any GUI panel
// ═══════════════════════════════════════════════════════════════════════
const ws1 = wb.addWorksheet('Missing Knobs', {
  properties: { tabColor: { argb: 'FFCC0000' } },
});

ws1.columns = [
  { header: 'Key', key: 'key', width: 44 },
  { header: 'Default Value', key: 'defaultValue', width: 26 },
  { header: 'Type', key: 'type', width: 10 },
  { header: 'GUI Section (Proposed)', key: 'section', width: 34 },
  { header: 'GUI Group (Proposed)', key: 'group', width: 36 },
  { header: 'Description', key: 'description', width: 72 },
  { header: 'Priority', key: 'priority', width: 12 },
  { header: 'Category', key: 'category', width: 18 },
];

const hdr1 = styleHeader(ws1);
hdr1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B0000' } };

const missingRows = [
  // ── Truly missing runtime keys ──
  {
    key: 'manufacturerAutoPromote', defaultValue: 'true', type: 'boolean',
    section: 'Run Setup', group: 'Manufacturer Research',
    description: 'Automatically promote manufacturer-discovered URLs to primary source candidates without requiring manual review in the curation queue.',
    priority: 'Low', category: 'Runtime',
  },
  {
    key: 'llmPlanDiscoveryQueries', defaultValue: 'true', type: 'boolean',
    section: 'Planner & Triage', group: 'Planner Configuration',
    description: 'Allow the LLM planner to generate discovery search queries using model intelligence. When off, only deterministic query templates from field rules are used.',
    priority: 'Medium', category: 'Runtime',
  },
  {
    key: 'categoryAuthorityRoot', defaultValue: 'category_authority', type: 'string',
    section: 'Automation', group: 'Helper Files & Authority',
    description: 'Root directory path for category authority data files. Contains field rules, seed catalogs, suggestions, and per-category overrides.',
    priority: 'Low', category: 'Runtime',
  },
  {
    key: 'helperFilesEnabled', defaultValue: 'true', type: 'boolean',
    section: 'Automation', group: 'Helper Files & Authority',
    description: 'Master toggle for the entire helper-files runtime substrate. When off, no helper file data (seeds, overrides, suggestions, lexicons) is loaded at runtime.',
    priority: 'High', category: 'Runtime',
  },
  {
    key: 'helperFilesRoot', defaultValue: 'category_authority', type: 'string',
    section: 'Automation', group: 'Helper Files & Authority',
    description: 'Root directory path for helper files. Defaults to same path as categoryAuthorityRoot. Change to separate helper data from category authority data.',
    priority: 'Low', category: 'Runtime',
  },
  {
    key: 'indexingHelperFilesEnabled', defaultValue: 'false', type: 'boolean',
    section: 'Automation', group: 'Helper Files & Authority',
    description: 'Enable helper-files integration specifically within indexing pipeline runs. Separate from the general helperFilesEnabled toggle — allows selective use during indexing vs standalone runs.',
    priority: 'Medium', category: 'Runtime',
  },
  {
    key: 'fetchBudgetMs', defaultValue: '45000', type: 'number',
    section: 'Fetch & Network', group: 'Throughput & Scheduling',
    description: 'Total time budget (ms) for all fetch operations within a single convergence round. When exceeded, remaining fetch tasks are deferred to the next round.',
    priority: 'High', category: 'Runtime',
  },
  {
    key: 'concurrency', defaultValue: '4', type: 'number',
    section: 'Fetch & Network', group: 'Throughput & Scheduling',
    description: 'Legacy general-purpose concurrency alias. Overlaps with fetchConcurrency — retained for backward compatibility with older CLI scripts and env overrides.',
    priority: 'Low', category: 'Runtime (legacy)',
  },
  {
    key: 'dynamicFetchPolicyMap', defaultValue: '{}', type: 'object',
    section: 'Browser Rendering', group: 'Dynamic Fetch Policies',
    description: 'Legacy raw-object alias for dynamicFetchPolicyMapJson. Kept for backward compatibility — the JSON-string version is rendered in the GUI.',
    priority: 'Low', category: 'Runtime (legacy)',
  },

  // ── Missing llmMaxOutputTokens per-role companions ──
  {
    key: 'llmMaxOutputTokensPlan', defaultValue: '2048', type: 'number',
    section: 'Role Routing', group: 'Planner Role (add alongside llmTokensPlan)',
    description: 'Maximum output tokens for the Planner LLM role. Defaults to same as llmTokensPlan. Allows capping output independently of input context window.',
    priority: 'Medium', category: 'Token Companion',
  },
  {
    key: 'llmMaxOutputTokensTriage', defaultValue: '2048', type: 'number',
    section: 'Role Routing', group: 'Triage Role (add alongside llmTokensTriage)',
    description: 'Maximum output tokens for the Triage LLM role. Defaults to same as llmTokensTriage. Independent output cap for SERP classification responses.',
    priority: 'Medium', category: 'Token Companion',
  },
  {
    key: 'llmMaxOutputTokensFast', defaultValue: '1536', type: 'number',
    section: 'Role Routing', group: 'Fast Role (add alongside llmTokensFast)',
    description: 'Maximum output tokens for the Fast LLM role. Defaults to same as llmTokensFast. Caps quick-classification and simple extraction outputs.',
    priority: 'Medium', category: 'Token Companion',
  },
  {
    key: 'llmMaxOutputTokensReasoning', defaultValue: '4096', type: 'number',
    section: 'Role Routing', group: 'Reasoning Role (add alongside llmTokensReasoning)',
    description: 'Maximum output tokens for the Reasoning LLM role. Defaults to same as llmTokensReasoning. Caps deep analysis and conflict resolution outputs.',
    priority: 'Medium', category: 'Token Companion',
  },
  {
    key: 'llmMaxOutputTokensExtract', defaultValue: '900', type: 'number',
    section: 'Role Routing', group: 'Extract Role (add alongside llmTokensExtract)',
    description: 'Maximum output tokens for the Extract LLM role. Defaults to same as llmTokensExtract. Caps field extraction structured outputs.',
    priority: 'Medium', category: 'Token Companion',
  },
  {
    key: 'llmMaxOutputTokensValidate', defaultValue: '900', type: 'number',
    section: 'Role Routing', group: 'Validate Role (add alongside llmTokensValidate)',
    description: 'Maximum output tokens for the Validate LLM role. Defaults to same as llmTokensValidate. Caps cross-reference validation outputs.',
    priority: 'Medium', category: 'Token Companion',
  },
  {
    key: 'llmMaxOutputTokensWrite', defaultValue: '800', type: 'number',
    section: 'Role Routing', group: 'Write Role (add alongside llmTokensWrite)',
    description: 'Maximum output tokens for the Write LLM role. Defaults to same as llmTokensWrite. Caps summary and description generation outputs.',
    priority: 'Medium', category: 'Token Companion',
  },
  {
    key: 'llmMaxOutputTokensPlanFallback', defaultValue: '2048', type: 'number',
    section: 'Fallback Routing', group: 'Fallback Plan Lane',
    description: 'Max output tokens for fallback Plan model. Defaults to same as llmTokensPlanFallback. Active only when llmFallbackEnabled is on.',
    priority: 'Low', category: 'Token Companion',
  },
  {
    key: 'llmMaxOutputTokensExtractFallback', defaultValue: '4096', type: 'number',
    section: 'Fallback Routing', group: 'Fallback Extract Lane',
    description: 'Max output tokens for fallback Extract model. Defaults to same as llmTokensExtractFallback. Active only when llmFallbackEnabled is on.',
    priority: 'Low', category: 'Token Companion',
  },
  {
    key: 'llmMaxOutputTokensValidateFallback', defaultValue: '4096', type: 'number',
    section: 'Fallback Routing', group: 'Fallback Validate Lane',
    description: 'Max output tokens for fallback Validate model. Defaults to same as llmTokensValidateFallback. Active only when llmFallbackEnabled is on.',
    priority: 'Low', category: 'Token Companion',
  },
  {
    key: 'llmMaxOutputTokensWriteFallback', defaultValue: '2048', type: 'number',
    section: 'Fallback Routing', group: 'Fallback Write Lane',
    description: 'Max output tokens for fallback Write model. Defaults to same as llmTokensWriteFallback. Active only when llmFallbackEnabled is on.',
    priority: 'Low', category: 'Token Companion',
  },

  // ── Missing convergence keys (not in any CONVERGENCE_KNOB_GROUP) ──
  {
    key: 'consensusTier4OverrideThreshold', defaultValue: '0.9', type: 'number',
    section: 'Convergence', group: 'Consensus - Tier Weights (add to existing group)',
    description: 'Confidence threshold above which a Tier-4 (low authority) source can override higher-tier consensus. Prevents low-tier noise from flipping established values unless extremely high confidence.',
    priority: 'Medium', category: 'Convergence',
  },
  {
    key: 'consensusMinConfidence', defaultValue: '0.7', type: 'number',
    section: 'Convergence', group: 'Consensus - Advanced (new group)',
    description: 'Minimum confidence score a consensus result must reach to be accepted as valid. Values below this threshold are marked low-confidence and may trigger additional extraction rounds.',
    priority: 'Medium', category: 'Convergence',
  },
];

for (const row of missingRows) {
  ws1.addRow(row);
}

stripeRows(ws1, 'FFF9E8E8');
addBorders(ws1);

// Color priority cells
for (let i = 2; i <= ws1.rowCount; i++) {
  const pCell = ws1.getRow(i).getCell('priority');
  if (pCell.value === 'High') {
    pCell.font = { bold: true, color: { argb: 'FFCC0000' } };
  } else if (pCell.value === 'Medium') {
    pCell.font = { bold: true, color: { argb: 'FFD4760A' } };
  } else {
    pCell.font = { color: { argb: 'FF888888' } };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Sheet 2: Aliases — keys rendered under a different name
// ═══════════════════════════════════════════════════════════════════════
const ws2 = wb.addWorksheet('Aliases (Already Rendered)', {
  properties: { tabColor: { argb: 'FF4472C4' } },
});

ws2.columns = [
  { header: 'Backend Key (Not Directly Rendered)', key: 'backendKey', width: 40 },
  { header: 'Rendered As (Canonical GUI Key)', key: 'renderedAs', width: 40 },
  { header: 'Default Value', key: 'defaultValue', width: 24 },
  { header: 'Type', key: 'type', width: 10 },
  { header: 'GUI Section', key: 'section', width: 24 },
  { header: 'Notes', key: 'notes', width: 60 },
];

const hdr2 = styleHeader(ws2);
hdr2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E5090' } };

const aliases = [
  { backendKey: 'llmModelPlan', renderedAs: 'planLlmModel', defaultValue: 'gemini-2.5-flash-lite', type: 'string', section: 'Planner & Triage', notes: 'Same model selection. planLlmModel is the canonical GUI key used for the Planner model selector.' },
  { backendKey: 'llmModelTriage', renderedAs: 'triageLlmModel', defaultValue: 'gemini-2.5-flash-lite', type: 'string', section: 'Planner & Triage', notes: 'Same model selection. triageLlmModel is the canonical GUI key used for the Triage model selector.' },
  { backendKey: 'llmPlanFallbackModel', renderedAs: 'llmFallbackPlanModel', defaultValue: 'gemini-2.5-flash-lite', type: 'string', section: 'Fallback Routing', notes: 'Reversed word order alias (Plan+Fallback vs Fallback+Plan). Both resolve to the same setting.' },
  { backendKey: 'llmExtractFallbackModel', renderedAs: 'llmFallbackExtractModel', defaultValue: 'gemini-2.5-flash-lite', type: 'string', section: 'Fallback Routing', notes: 'Reversed word order alias. Both resolve to the same fallback extract model setting.' },
  { backendKey: 'llmValidateFallbackModel', renderedAs: 'llmFallbackValidateModel', defaultValue: 'gemini-2.5-flash-lite', type: 'string', section: 'Fallback Routing', notes: 'Reversed word order alias. Both resolve to the same fallback validate model setting.' },
  { backendKey: 'llmWriteFallbackModel', renderedAs: 'llmFallbackWriteModel', defaultValue: 'gemini-2.5-flash-lite', type: 'string', section: 'Fallback Routing', notes: 'Reversed word order alias. Both resolve to the same fallback write model setting.' },
  { backendKey: 'indexingResumeMode', renderedAs: 'resumeMode', defaultValue: 'auto', type: 'string', section: 'Run Setup', notes: 'Indexing-prefixed alias. resumeMode is the canonical GUI key in the Resume & Re-extract group.' },
  { backendKey: 'indexingResumeMaxAgeHours', renderedAs: 'resumeWindowHours', defaultValue: '48', type: 'number', section: 'Run Setup', notes: 'Different name, same semantics: max age of run data before resume ignores it. resumeWindowHours is rendered.' },
  { backendKey: 'indexingReextractAfterHours', renderedAs: 'reextractAfterHours', defaultValue: '24', type: 'number', section: 'Run Setup', notes: 'Indexing-prefixed alias. reextractAfterHours is the canonical GUI key in the Resume & Re-extract group.' },
  { backendKey: 'indexingReextractEnabled', renderedAs: 'reextractIndexed', defaultValue: 'true', type: 'boolean', section: 'Run Setup', notes: 'Different name, same semantics: whether to re-extract from already-indexed sources. reextractIndexed is rendered.' },
];

for (const row of aliases) {
  ws2.addRow(row);
}

stripeRows(ws2, 'FFEDF2FA');
addBorders(ws2);

// ═══════════════════════════════════════════════════════════════════════
// Sheet 3: Summary statistics
// ═══════════════════════════════════════════════════════════════════════
const ws3 = wb.addWorksheet('Summary', {
  properties: { tabColor: { argb: 'FF70AD47' } },
});

ws3.columns = [
  { header: 'Metric', key: 'metric', width: 48 },
  { header: 'Count', key: 'count', width: 12 },
  { header: 'Notes', key: 'notes', width: 68 },
];

const hdr3 = styleHeader(ws3);
hdr3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF375623' } };

const runtimeCount = Object.keys(SETTINGS_DEFAULTS.runtime).length;
const convergenceCount = Object.keys(SETTINGS_DEFAULTS.convergence).length;

const summaryRows = [
  { metric: 'Total Runtime Settings (backend)', count: runtimeCount, notes: 'All keys in SETTINGS_DEFAULTS.runtime' },
  { metric: 'Total Convergence Settings (backend)', count: convergenceCount, notes: 'All keys in SETTINGS_DEFAULTS.convergence' },
  { metric: 'Total Backend Settings', count: runtimeCount + convergenceCount, notes: 'Runtime + Convergence combined' },
  { metric: '', count: '', notes: '' },
  { metric: 'Runtime Keys Rendered in Pipeline Settings GUI', count: runtimeCount - 31, notes: 'Matched in RuntimeFlow*Section.tsx files' },
  { metric: 'Convergence Keys in Knob Groups (Convergence tab)', count: 25, notes: '25 of 29 keys are in CONVERGENCE_KNOB_GROUPS, rendered as sliders/toggles' },
  { metric: 'Total Rendered Anywhere in GUI', count: (runtimeCount - 31) + 25, notes: 'Pipeline Settings Runtime Flow + Convergence tab' },
  { metric: '', count: '', notes: '' },
  { metric: 'Aliases (rendered under a different key name)', count: 10, notes: 'Backend has key X, GUI renders equivalent key Y with same default — NOT missing' },
  { metric: '', count: '', notes: '' },
  { metric: 'TOTAL NOT SURFACED IN GUI (Missing Knobs sheet)', count: 24, notes: 'All rows on the Missing Knobs sheet — these have no GUI control' },
  { metric: '', count: '', notes: '' },
  { metric: 'Breakdown by category:', count: '', notes: '' },
  { metric: '  Truly Missing Runtime Keys', count: 7, notes: 'manufacturerAutoPromote, llmPlanDiscoveryQueries, categoryAuthorityRoot, helperFilesEnabled, helperFilesRoot, indexingHelperFilesEnabled, fetchBudgetMs' },
  { metric: '  Legacy / Cross-Layer Duplicates', count: 2, notes: 'concurrency (legacy alias), dynamicFetchPolicyMap (legacy alias)' },
  { metric: '  Max-Output-Token Companions (primary roles)', count: 7, notes: 'llmMaxOutputTokens{Plan,Triage,Fast,Reasoning,Extract,Validate,Write} — paired with rendered llmTokens* keys' },
  { metric: '  Max-Output-Token Companions (fallback roles)', count: 4, notes: 'llmMaxOutputTokens{Plan,Extract,Validate,Write}Fallback — paired with rendered fallback token keys' },
  { metric: '  Missing Convergence Keys', count: 2, notes: 'consensusTier4OverrideThreshold, consensusMinConfidence' },
  { metric: '', count: '', notes: '' },
  { metric: 'HIGH PRIORITY (should add soon)', count: 2, notes: 'helperFilesEnabled, fetchBudgetMs — affect runtime behavior significantly' },
  { metric: 'MEDIUM PRIORITY (useful controls)', count: 13, notes: '7 primary token companions + llmPlanDiscoveryQueries, indexingHelperFilesEnabled, consensusTier4OverrideThreshold, consensusMinConfidence + llmMaxOutputTokensPlanFallback, llmMaxOutputTokensExtractFallback' },
  { metric: 'LOW PRIORITY (legacy/niche/debug)', count: 8, notes: 'Legacy aliases, path configs, remaining fallback token companions' },
];

for (const row of summaryRows) {
  ws3.addRow(row);
}

// Highlight total rows
for (let i = 2; i <= ws3.rowCount; i++) {
  const row = ws3.getRow(i);
  row.alignment = { vertical: 'top', wrapText: true };
  const val = row.getCell('metric').value;
  if (val && (val.startsWith('TOTAL') || val.startsWith('ACTIONABLE'))) {
    row.font = { bold: true, size: 11 };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  } else if (val && val.startsWith('HIGH')) {
    row.font = { bold: true, color: { argb: 'FFCC0000' } };
  }
}

addBorders(ws3);

// Freeze + auto-filter all sheets
ws1.autoFilter = { from: 'A1', to: 'H1' };
ws2.autoFilter = { from: 'A1', to: 'F1' };
ws3.autoFilter = { from: 'A1', to: 'C1' };
ws1.views = [{ state: 'frozen', ySplit: 1 }];
ws2.views = [{ state: 'frozen', ySplit: 1 }];
ws3.views = [{ state: 'frozen', ySplit: 1 }];

const outPath = 'docs/config/MISSING_GUI_KNOBS_AUDIT_v2.xlsx';
await wb.xlsx.writeFile(outPath);
console.log('Written: ' + outPath);
console.log('Sheet 1 — Missing Knobs: ' + missingRows.length + ' rows');
console.log('Sheet 2 — Aliases: ' + aliases.length + ' rows');
console.log('Sheet 3 — Summary');
