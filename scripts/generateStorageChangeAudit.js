import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(
  ROOT,
  'docs',
  'implementation',
  'sql-full-migration',
  'storage-audit-and-consolidation-plan.html'
);

const PHASES = [
  {
    key: 'phase-a',
    title: 'Phase A: Prefix Path Translation Bug',
    target: 'Strip storage key prefixes before joining local output roots.',
    primaryFiles: [
      'src/s3/storage.js',
      'src/shared/storageKeyPrefixes.js',
    ],
    patterns: [
      { label: 'resolveLocalPath', regex: /\bresolveLocalPath\b/ },
      { label: 'listKeys', regex: /\blistKeys\b/ },
      { label: 'LocalStorage', regex: /\bLocalStorage\b/ },
      { label: 'OUTPUT_KEY_PREFIX', regex: /\bOUTPUT_KEY_PREFIX\b/ },
      { label: 'resolveOutputKey', regex: /\bresolveOutputKey\b/ },
      { label: 'writeBufferDual', regex: /\bwriteBufferDual\b/ },
      { label: 'writeJsonDual', regex: /\bwriteJsonDual\b/ },
    ],
    legacyPatterns: [
      { label: 'specs/outputs', regex: /specs\/outputs/ },
      { label: 'double-nesting', regex: /output\/specs\/outputs|specs\/outputs\/specs\/outputs/ },
    ],
  },
  {
    key: 'phase-b',
    title: 'Phase B: Unified Defaults to .workspace',
    target: 'Make .workspace the single default runtime root for output, runs, and DBs.',
    primaryFiles: [
      'src/core/config/runtimeArtifactRoots.js',
      'src/shared/settingsRegistry.js',
      'src/api/bootstrap/createBootstrapEnvironment.js',
      'src/api/bootstrap/createBootstrapSessionLayer.js',
    ],
    patterns: [
      { label: '.workspace', regex: /\.workspace(?:\/|\\|')/ },
      { label: 'defaultLocalOutputRoot', regex: /\bdefaultLocalOutputRoot\b/ },
      { label: 'defaultIndexLabRoot', regex: /\bdefaultIndexLabRoot\b/ },
      { label: 'persistentAppDataRoot', regex: /\bpersistentAppDataRoot\b/ },
      { label: 'specDbDir', regex: /\bspecDbDir\b/ },
      { label: 'app.sqlite', regex: /app\.sqlite/ },
    ],
    legacyPatterns: [
      { label: '.specfactory_tmp', regex: /\.specfactory_tmp/ },
      { label: 'LOCALAPPDATA', regex: /LOCALAPPDATA|localappdata/i },
      { label: 'spec-factory AppData', regex: /spec-factory[\\/](?:indexlab|output)/i },
    ],
  },
  {
    key: 'phase-c',
    title: 'Phase C: Hardcoded Legacy Root References',
    target: 'Remove hardcoded .specfactory_tmp and old output-root assumptions from source, tests, scripts, and docs.',
    primaryFiles: [
      'src/app/api/specDbRuntime.js',
      'src/app/cli/cliHelpers.js',
      'src/app/cli/commands/dataUtilityCommands.js',
      'src/app/cli/commands/pipelineCommands.js',
      'src/app/cli/commands/migrateToSqliteCommand.js',
      'src/features/indexing/orchestration/shared/runtimeHelpers.js',
      'src/features/indexing/orchestration/bootstrap/loadLearningStoreHintsForRun.js',
      'src/api/guiServerRuntimeConfig.js',
      'src/research/frontierDb.js',
      'SpecFactory.bat',
      'scripts/verify-wave4.js',
    ],
    patterns: [
      { label: '.specfactory_tmp', regex: /\.specfactory_tmp/ },
      { label: 'spec.sqlite', regex: /spec\.sqlite/ },
      { label: 'specDbDir', regex: /\bspecDbDir\b/ },
      { label: 'crawl probe temp', regex: /crawl[_-]probe/i },
      { label: 'phase9 export', regex: /phase9|all_products\.sqlite/i },
    ],
    legacyPatterns: [
      { label: 'hardcoded tmp root', regex: /\.specfactory_tmp/ },
    ],
  },
  {
    key: 'phase-d',
    title: 'Phase D: Run Directory Convergence',
    target: 'Converge run screenshots, video, analysis, traces, and checkpoints under one .workspace run root.',
    primaryFiles: [
      'src/indexlab/runtimeBridgeArtifacts.js',
      'src/indexlab/runSummarySerializer.js',
      'src/features/indexing/api/builders/runArtifactReaders.js',
      'src/features/indexing/api/builders/indexlabDataBuilders.js',
      'src/pipeline/checkpoint/seedFromCheckpoint.js',
      'src/api/services/indexLabProcessCompletion.js',
    ],
    patterns: [
      { label: 'INDEXLAB_ROOT', regex: /\bINDEXLAB_ROOT\b/ },
      { label: 'run_artifacts', regex: /\brun_artifacts\b/ },
      { label: 'runtimeBridgeArtifacts', regex: /\bruntimeBridgeArtifacts\b/ },
      { label: 'runSummarySerializer', regex: /\brunSummarySerializer\b/ },
      { label: 'out_root', regex: /\bout_root\b/ },
      { label: 's3key', regex: /\bs3key\b/ },
      { label: 'screenshots/video', regex: /screenshots|source_screenshots|source_videos|video\// },
      { label: 'summary.json', regex: /summary\.json/ },
      { label: 'run.json', regex: /\brun\.json\b/ },
    ],
    legacyPatterns: [
      { label: 'indexlab AppData root', regex: /indexlab[\\/].*run\.json/i },
      { label: 'published specs output', regex: /published|latest\/summary\.json|latest\/normalized\.json/i },
    ],
  },
  {
    key: 'phase-e',
    title: 'Phase E: Frontier, Learning, Crawlee, and Junk Cleanup',
    target: 'Move frontier and learning storage, stop writing junk to legacy roots, and formalize runtime-only directories.',
    primaryFiles: [
      'src/research/frontierDb.js',
      'src/features/indexing/learning/learningStores.js',
      'src/features/crawl/crawlSession.js',
      'src/features/crawl/videoCleanup.js',
      'tools/crawl-probe.mjs',
    ],
    patterns: [
      { label: '_intel/frontier', regex: /_intel[\\/]frontier|frontier\.db/i },
      { label: 'frontier.sqlite', regex: /frontier\.sqlite/i },
      { label: 'data/learning', regex: /data[\\/]learning/i },
      { label: '_learning', regex: /_learning/ },
      { label: 'Crawlee storage', regex: /\bstorage[\\/]|key_value_stores|request_queues/ },
      { label: '.server-state', regex: /\.server-state/ },
      { label: 'debug root', regex: /\bdebug[\\/]/i },
      { label: 'crawl probe reports', regex: /crawl[_-]probe[_-]reports|crawl[_-]probe/i },
    ],
    legacyPatterns: [
      { label: '_intel', regex: /_intel[\\/]frontier/i },
      { label: 'data/learning', regex: /data[\\/]learning/i },
      { label: 'project storage root', regex: /PROJECT\\storage|storage[\\/]$/i },
    ],
  },
  {
    key: 'phase-f',
    title: 'Phase F: Ignore Rules and Docs Alignment',
    target: 'Make .workspace, .server-state, and the remaining runtime roots explicit in docs and ignore rules.',
    primaryFiles: [
      '.gitignore',
      'CLAUDE.md',
      'docs/01-project-overview/folder-map.md',
      'docs/04-features/storage-and-run-data.md',
      'docs/implementation/sql-full-migration/storage-audit-and-consolidation-plan.html',
    ],
    patterns: [
      { label: '.gitignore', regex: /\.workspace\/|\.specfactory_tmp\/|_intel\/|specs\// },
      { label: 'CLAUDE runtime dirs', regex: /Runtime data directories|\.workspace\/|\.server-state\// },
      { label: 'storage docs', regex: /storage-and-run-data|storage audit|runtime root/i },
    ],
    legacyPatterns: [
      { label: '.specfactory_tmp docs', regex: /\.specfactory_tmp/ },
      { label: 'AppData docs', regex: /LOCALAPPDATA|spec-factory[\\/]output|spec-factory[\\/]indexlab/i },
    ],
  },
  {
    key: 'phase-g',
    title: 'Phase G: Cleanup Policies and Runtime Retention',
    target: 'Add bounded retention for runs, snapshots, and temporary runtime state.',
    primaryFiles: [
      'src/features/crawl/videoCleanup.js',
      'src/api/bootstrap/createBootstrapEnvironment.js',
      'src/features/settings-authority/userSettingsService.js',
    ],
    patterns: [
      { label: 'videoCleanup', regex: /\bvideoCleanup\b/ },
      { label: 'snapshot retention', regex: /snapshot|snapshots/i },
      { label: 'prune/purge', regex: /\bprune\b|\bpurge\b/i },
      { label: 'bulk-delete', regex: /bulk-delete|deleteRun|delete runs/i },
    ],
    legacyPatterns: [
      { label: 'uncapped snapshots', regex: /_runtime[\\/]snapshots|snapshot/i },
      { label: 'run accumulation', regex: /runs[\\/]|indexlab[\\/]/i },
    ],
  },
];

const ROOT_CONCERNS = [
  {
    key: 'workspace-root',
    title: '.workspace Target Root',
    summary: 'Target runtime root for db, runs, products, and billing.',
    primaryFiles: [
      'src/core/config/runtimeArtifactRoots.js',
      'src/shared/settingsRegistry.js',
    ],
    patterns: [
      { label: '.workspace', regex: /\.workspace(?:\/|\\|')/ },
      { label: 'defaultLocalOutputRoot', regex: /\bdefaultLocalOutputRoot\b/ },
      { label: 'defaultIndexLabRoot', regex: /\bdefaultIndexLabRoot\b/ },
      { label: 'specDbDir', regex: /\bspecDbDir\b/ },
    ],
  },
  {
    key: 'legacy-appdata',
    title: '%LOCALAPPDATA% / spec-factory Legacy Root',
    summary: 'Legacy hidden runtime root that the consolidation plan is replacing.',
    primaryFiles: [
      'src/core/config/runtimeArtifactRoots.js',
      'src/s3/storage.js',
    ],
    patterns: [
      { label: 'LOCALAPPDATA', regex: /LOCALAPPDATA|localappdata/i },
      { label: 'spec-factory output', regex: /spec-factory[\\/]output/i },
      { label: 'spec-factory indexlab', regex: /spec-factory[\\/]indexlab/i },
      { label: 'persistentAppDataRoot', regex: /\bpersistentAppDataRoot\b/ },
    ],
  },
  {
    key: 'legacy-tmp',
    title: '.specfactory_tmp Legacy Root',
    summary: 'Old scratch root with live DBs, reports, and orphaned artifacts.',
    primaryFiles: [
      'src/shared/settingsRegistry.js',
      'src/app/api/specDbRuntime.js',
      'src/app/cli/cliHelpers.js',
    ],
    patterns: [
      { label: '.specfactory_tmp', regex: /\.specfactory_tmp/ },
      { label: 'spec.sqlite', regex: /spec\.sqlite/ },
      { label: 'crawl probe reports', regex: /crawl[_-]probe[_-]reports|crawl[_-]probe/i },
      { label: 'phase9 export', regex: /phase9|all_products\.sqlite/i },
    ],
  },
  {
    key: 'runtime-storage-manager',
    title: 'Storage Relocation and Runtime-Ops Surface',
    summary: 'Routes, runtime state, and UI files that expose storage origin/state and relocation behavior.',
    primaryFiles: [
      'src/api/services/indexLabProcessCompletion.js',
      'src/features/indexing/api/runtimeOpsRoutes.js',
      'tools/gui-react/src/features/storage-manager/state/useStorageRuns.ts',
      'tools/gui-react/src/features/storage-manager/state/useRunDetail.ts',
      'tools/gui-react/src/features/storage-manager/state/useStorageActions.ts',
    ],
    patterns: [
      { label: '/storage/', regex: /\/storage\// },
      { label: 'storage_state', regex: /\bstorage_state\b/ },
      { label: 'storage_origin', regex: /\bstorage_origin\b/ },
      { label: 'storage_destination', regex: /\bstorage_destination\b|\bstorageDestination\b/ },
      { label: 'relocated_at', regex: /\brelocated_at\b/ },
      { label: 'out_root', regex: /\bout_root\b/ },
      { label: 'runDataRelocation', regex: /relocat/i },
    ],
  },
];

const KIND_ORDER = new Map([
  ['source', 0],
  ['ui', 1],
  ['ops', 2],
  ['tooling', 3],
  ['tests', 4],
  ['docs', 5],
  ['compiled', 6],
  ['other', 7],
]);

const LOAD_HINTS = [
  /\bread(?:Json|Text|File|Dir|Directory|Run|Summary|Artifacts?|Keys?)\b/i,
  /\bsafeRead[A-Z_]/,
  /\blist(?:Keys|Files|Runs?)\b/i,
  /\bresolve(?:OutputKey|LocalPath)\b/,
  /\bscanAndSeed[A-Z_]/,
  /\bload[A-Z_]/,
];

const WRITE_HINTS = [
  /\bwrite(?:Json|Buffer|File|Object|Checkpoint)\b/i,
  /\bpersist/i,
  /\bpublish/i,
  /\bcleanup/i,
  /\barchive/i,
  /\brelocat/i,
  /\bcopy(?:File|Dir)?\b/i,
  /\bmkdir\b/i,
  /\brename\b/i,
  /\bdelete[A-Z_]/,
  /\bprune\b/i,
  /\bpurge\b/i,
  /\bupdateRunStorageLocation\b/,
  /\bbuildCrawlCheckpoint\b/,
];

const PROPAGATE_HINTS = [
  /routes?/i,
  /routecontext/i,
  /processruntime/i,
  /processlifecyclestate/i,
  /storage-manager/i,
  /useStorage/i,
  /useRunDetail/i,
  /types\.ts$/i,
  /contracts?/i,
  /README/i,
];

const LOAD_SIGNAL_LABELS = new Set([
  'resolveLocalPath',
  'listKeys',
  'resolveOutputKey',
  'run.json',
  'summary.json',
  'storage_state',
  'storage_origin',
  'storage_destination',
  'relocated_at',
  'out_root',
  '.workspace',
  'LOCALAPPDATA',
  '.specfactory_tmp',
  'INDEXLAB_ROOT',
  'defaultLocalOutputRoot',
  'defaultIndexLabRoot',
  'persistentAppDataRoot',
  'specDbDir',
]);

const WRITE_SIGNAL_LABELS = new Set([
  'writeBufferDual',
  'writeJsonDual',
  'run_artifacts',
  'screenshots/video',
  'videoCleanup',
  'snapshot retention',
  'prune/purge',
  'bulk-delete',
  'runDataRelocation',
  'phase9 export',
  '.workspace',
  'INDEXLAB_ROOT',
]);

function normalizeRel(relPath) {
  return String(relPath || '').replace(/\\/g, '/');
}

function shell(command, args) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function getTrackedFiles() {
  return shell('git', ['ls-files', '-co', '--exclude-standard'])
    .split(/\r?\n/)
    .map((line) => normalizeRel(line.trim()))
    .filter(Boolean);
}

function shouldReadAsText(relPath) {
  const lower = relPath.toLowerCase();
  const binaryExts = [
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svgz', '.pdf',
    '.zip', '.7z', '.gz', '.tar', '.sqlite', '.db', '.mp4', '.webm', '.mov',
    '.avi', '.mp3', '.wav', '.woff', '.woff2', '.ttf', '.eot', '.dll', '.exe',
    '.node', '.lnk', '.psd', '.ai', '.sketch', '.tsbuildinfo',
  ];
  return !binaryExts.some((ext) => lower.endsWith(ext));
}

function readText(relPath) {
  if (!shouldReadAsText(relPath)) {
    return null;
  }
  try {
    const text = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    return text.includes('\u0000') ? null : text;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function fileKind(relPath) {
  const lower = relPath.toLowerCase();
  if (lower.startsWith('tools/dist/') || lower.startsWith('gui-dist/') || lower.includes('/dist/')) {
    return 'compiled';
  }
  if (lower.startsWith('docs/')) {
    return 'docs';
  }
  if (lower.startsWith('tools/gui-react/')) {
    return 'ui';
  }
  if (
    lower.includes('/__tests__/') ||
    lower.includes('/tests/') ||
    lower.endsWith('.test.js') ||
    lower.endsWith('.test.ts') ||
    lower.endsWith('.spec.js') ||
    lower.endsWith('.spec.ts')
  ) {
    return 'tests';
  }
  if (
    lower.startsWith('scripts/') ||
    lower === 'specfactory.bat' ||
    lower.endsWith('.bat') ||
    lower.endsWith('.ps1')
  ) {
    return 'ops';
  }
  if (lower.startsWith('tools/')) {
    return 'tooling';
  }
  if (lower.startsWith('src/')) {
    return 'source';
  }
  return 'other';
}

function fileKindLabel(kind) {
  switch (kind) {
    case 'source':
      return 'source';
    case 'ui':
      return 'ui';
    case 'ops':
      return 'ops';
    case 'tooling':
      return 'tooling';
    case 'tests':
      return 'tests';
    case 'docs':
      return 'docs';
    case 'compiled':
      return 'compiled';
    default:
      return 'other';
  }
}

function compareMatches(left, right) {
  if (left.isPrimary !== right.isPrimary) {
    return left.isPrimary ? -1 : 1;
  }
  const leftOrder = KIND_ORDER.get(left.kind) ?? 99;
  const rightOrder = KIND_ORDER.get(right.kind) ?? 99;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.file.localeCompare(right.file);
}

function patternMatches(relPath, text, regex) {
  regex.lastIndex = 0;
  if (regex.test(relPath)) {
    return true;
  }
  regex.lastIndex = 0;
  return regex.test(text);
}

function collectLabels(relPath, text, patterns = []) {
  const labels = [];
  for (const pattern of patterns) {
    if (patternMatches(relPath, text, pattern.regex)) {
      labels.push(pattern.label);
    }
  }
  return labels;
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function classifyRoles(relPath, text, entry) {
  const roles = new Set();
  const kind = fileKind(relPath);
  const lowerPath = relPath.toLowerCase();
  const lowerText = String(text || '').toLowerCase();
  const combined = `${lowerPath}\n${lowerText}`;

  if (entry.isPrimary) {
    roles.add('owner');
  }
  if (entry.legacyLabels.length > 0) {
    roles.add('legacy');
  }
  if (
    entry.matchedLabels.some((label) => LOAD_SIGNAL_LABELS.has(label))
    || matchesAny(text, LOAD_HINTS)
  ) {
    roles.add('load');
  }
  if (
    entry.matchedLabels.some((label) => WRITE_SIGNAL_LABELS.has(label))
    || matchesAny(text, WRITE_HINTS)
  ) {
    roles.add('write');
  }
  if (
    kind === 'docs' ||
    kind === 'ui' ||
    kind === 'tests' ||
    matchesAny(combined, PROPAGATE_HINTS)
  ) {
    roles.add('propagate');
  }
  if (kind === 'ops' || kind === 'tooling') {
    roles.add('ops');
  }
  return roles;
}

function buildSignalStats(matches, key) {
  const counts = new Map();
  for (const entry of matches) {
    const labels = key === 'legacy' ? entry.legacyLabels : entry.matchedLabels;
    for (const label of labels) {
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.label.localeCompare(right.label);
    });
}

function uniqueMatches(matches, predicate) {
  return matches.filter(predicate).sort(compareMatches);
}

function analyzeSection(definition, trackedFiles, fileSet, textByFile) {
  const primaryFiles = definition.primaryFiles.map(normalizeRel);
  const presentPrimary = new Set(primaryFiles.filter((relPath) => fileSet.has(relPath)));
  const missingPrimaryFiles = primaryFiles.filter((relPath) => !presentPrimary.has(relPath));
  const matches = [];

  for (const relPath of trackedFiles) {
    const text = textByFile.get(relPath) || '';
    const isPrimary = presentPrimary.has(relPath);
    const matchedLabels = collectLabels(relPath, text, definition.patterns);
    const legacyLabels = collectLabels(relPath, text, definition.legacyPatterns || []);

    if (!isPrimary && matchedLabels.length === 0 && legacyLabels.length === 0) {
      continue;
    }

    const entry = {
      file: relPath,
      kind: fileKind(relPath),
      isPrimary,
      matchedLabels,
      legacyLabels,
    };
    entry.roles = sortStrings(classifyRoles(relPath, text, entry));
    matches.push(entry);
  }

  matches.sort(compareMatches);

  const runtimeKinds = new Set(['source', 'ui', 'ops', 'tooling', 'other']);
  const nonDocKinds = new Set(['source', 'ui', 'ops', 'tooling', 'other']);

  return {
    ...definition,
    presentPrimaryFiles: sortStrings(presentPrimary),
    missingPrimaryFiles,
    matches,
    matchedFileCount: matches.length,
    loadFiles: uniqueMatches(matches, (entry) => (
      !entry.isPrimary &&
      entry.roles.includes('load') &&
      nonDocKinds.has(entry.kind)
    )),
    writeFiles: uniqueMatches(matches, (entry) => (
      !entry.isPrimary &&
      entry.roles.includes('write') &&
      nonDocKinds.has(entry.kind)
    )),
    propagationFiles: uniqueMatches(matches, (entry) => (
      !entry.isPrimary &&
      entry.roles.includes('propagate')
    )),
    legacyFiles: uniqueMatches(matches, (entry) => !entry.isPrimary && entry.legacyLabels.length > 0),
    compiledFiles: uniqueMatches(matches, (entry) => entry.kind === 'compiled'),
    runtimeFiles: uniqueMatches(matches, (entry) => runtimeKinds.has(entry.kind)),
    signalStats: buildSignalStats(matches, 'matched'),
    legacySignalStats: buildSignalStats(matches, 'legacy'),
  };
}

function buildTouchLedger(phaseAudits, concernAudits) {
  const byFile = new Map();

  function apply(sectionType, section, entry) {
    let row = byFile.get(entry.file);
    if (!row) {
      row = {
        file: entry.file,
        kind: entry.kind,
        roles: new Set(),
        labels: new Set(),
        legacyLabels: new Set(),
        phaseTitles: new Set(),
        concernTitles: new Set(),
      };
      byFile.set(entry.file, row);
    }

    for (const role of entry.roles) {
      row.roles.add(role);
    }
    for (const label of entry.matchedLabels) {
      row.labels.add(label);
    }
    for (const label of entry.legacyLabels) {
      row.legacyLabels.add(label);
    }

    if (sectionType === 'phase') {
      row.phaseTitles.add(section.title);
    } else {
      row.concernTitles.add(section.title);
    }
  }

  for (const phase of phaseAudits) {
    for (const entry of phase.matches) {
      apply('phase', phase, entry);
    }
  }

  for (const concern of concernAudits) {
    for (const entry of concern.matches) {
      apply('concern', concern, entry);
    }
  }

  return [...byFile.values()]
    .map((row) => ({
      ...row,
      roles: sortStrings(row.roles),
      labels: sortStrings(row.labels),
      legacyLabels: sortStrings(row.legacyLabels),
      phaseTitles: sortStrings(row.phaseTitles),
      concernTitles: sortStrings(row.concernTitles),
      phaseCount: row.phaseTitles.size,
      concernCount: row.concernTitles.size,
      score: row.phaseTitles.size + row.concernTitles.size,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      const leftOrder = KIND_ORDER.get(left.kind) ?? 99;
      const rightOrder = KIND_ORDER.get(right.kind) ?? 99;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.file.localeCompare(right.file);
    });
}

function badge(text, tone = 'neutral') {
  return `<span class="badge ${tone}">${escapeHtml(text)}</span>`;
}

function renderRoleBadges(entry) {
  const badges = [badge(fileKindLabel(entry.kind), 'kind')];
  if (entry.isPrimary) badges.push(badge('primary', 'owner'));
  if (entry.roles.includes('load')) badges.push(badge('load', 'read'));
  if (entry.roles.includes('write')) badges.push(badge('write', 'write'));
  if (entry.roles.includes('propagate') && !['docs', 'tests', 'ui'].includes(entry.kind)) {
    badges.push(badge('propagate', 'prop'));
  }
  if (entry.legacyLabels.length > 0) badges.push(badge('legacy', 'legacy'));
  return badges.join('');
}

function renderFileList(entries, emptyMessage) {
  if (!entries.length) {
    return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  }

  return `<ul class="file-list">${entries.map((entry) => {
    const signalParts = [];
    if (entry.matchedLabels.length > 0) {
      signalParts.push(`signals: ${escapeHtml(entry.matchedLabels.join(', '))}`);
    }
    if (entry.legacyLabels.length > 0) {
      signalParts.push(`legacy: ${escapeHtml(entry.legacyLabels.join(', '))}`);
    }

    return `
      <li>
        <div class="path-row">
          <code>${escapeHtml(entry.file)}</code>
          <div class="badge-row">${renderRoleBadges(entry)}</div>
        </div>
        ${signalParts.length > 0 ? `<div class="muted small">${signalParts.join(' | ')}</div>` : ''}
      </li>
    `;
  }).join('')}</ul>`;
}

function renderStringList(values, emptyMessage) {
  if (!values.length) {
    return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  }
  return `<ul class="file-list">${values.map((value) => `
    <li>
      <div class="path-row">
        <code>${escapeHtml(value)}</code>
        <div class="badge-row">${badge('missing', 'warn')}</div>
      </div>
    </li>
  `).join('')}</ul>`;
}

function renderSignalTable(rows, emptyMessage, tone = 'neutral') {
  if (!rows.length) {
    return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  }
  return `
    <table class="signal-table">
      <thead>
        <tr><th>Signal</th><th>Files</th></tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td><span class="signal-label ${tone}">${escapeHtml(row.label)}</span></td>
            <td>${escapeHtml(String(row.count))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderSectionCard(section, typeLabel) {
  return `
    <article class="audit-card filter-target" id="${escapeHtml(section.key)}">
      <div class="audit-header">
        <div>
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.target || section.summary || '')}</p>
        </div>
        <div class="badge-row">
          ${badge(`${section.matchedFileCount} touched files`, 'surface')}
          ${badge(`${section.presentPrimaryFiles.length} primary`, 'owner')}
          ${badge(`${section.loadFiles.length} loaders`, 'read')}
          ${badge(`${section.writeFiles.length} writers`, 'write')}
          ${badge(`${section.propagationFiles.length} propagation`, 'prop')}
          ${section.legacyFiles.length > 0 ? badge(`${section.legacyFiles.length} legacy refs`, 'legacy') : ''}
        </div>
      </div>

      <div class="bucket-grid">
        <section class="bucket">
          <h4>Primary Implementation Owners</h4>
          ${renderFileList(section.matches.filter((entry) => entry.isPrimary), 'No primary files configured.')}
        </section>
        <section class="bucket">
          <h4>Loads From / Reads</h4>
          ${renderFileList(section.loadFiles, 'No loader/read files detected.')}
        </section>
        <section class="bucket">
          <h4>Writes To / Emits</h4>
          ${renderFileList(section.writeFiles, 'No writer/emitter files detected.')}
        </section>
        <section class="bucket">
          <h4>Propagates Through</h4>
          ${renderFileList(section.propagationFiles, 'No propagation/UI/doc/test files detected.')}
        </section>
        <section class="bucket">
          <h4>Legacy Reference Files</h4>
          ${renderFileList(section.legacyFiles, 'No legacy-root references detected.')}
        </section>
        <section class="bucket">
          <h4>Compiled Mirrors / Missing Primaries</h4>
          ${renderFileList(section.compiledFiles, 'No compiled mirror files detected.')}
          ${section.missingPrimaryFiles.length > 0 ? `
            <div class="bucket-sub">
              <h5>Configured Primaries Not Found</h5>
              ${renderStringList(section.missingPrimaryFiles, 'None.')}
            </div>
          ` : ''}
        </section>
      </div>

      <div class="signal-grid">
        <section class="bucket">
          <h4>Matched Signals</h4>
          ${renderSignalTable(section.signalStats, 'No matched signals.', 'neutral')}
        </section>
        <section class="bucket">
          <h4>Legacy Signals</h4>
          ${renderSignalTable(section.legacySignalStats, 'No legacy signals.', 'legacy')}
        </section>
      </div>

      <details class="full-list">
        <summary>${escapeHtml(typeLabel)} Touch Ledger (${escapeHtml(String(section.matches.length))} files)</summary>
        ${renderFileList(section.matches, 'No touched files.')}
      </details>
    </article>
  `;
}

function renderTopFilesTable(rows) {
  return `
    <table class="ledger-table filter-target">
      <thead>
        <tr>
          <th>File</th>
          <th>Kind</th>
          <th>Phases</th>
          <th>Concerns</th>
          <th>Roles</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td><code>${escapeHtml(row.file)}</code></td>
            <td>${escapeHtml(fileKindLabel(row.kind))}</td>
            <td>${escapeHtml(String(row.phaseCount))}</td>
            <td>${escapeHtml(String(row.concernCount))}</td>
            <td>${escapeHtml(row.roles.join(', ') || 'none')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderLedgerTable(rows) {
  return `
    <table class="ledger-table">
      <thead>
        <tr>
          <th>File</th>
          <th>Kind</th>
          <th>Phase Coverage</th>
          <th>Concern Coverage</th>
          <th>Signals</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr class="filter-target">
            <td><code>${escapeHtml(row.file)}</code></td>
            <td>${escapeHtml(fileKindLabel(row.kind))}</td>
            <td>
              ${row.phaseTitles.length > 0 ? row.phaseTitles.map((value) => badge(value, 'surface')).join('') : '<span class="muted">None</span>'}
            </td>
            <td>
              ${row.concernTitles.length > 0 ? row.concernTitles.map((value) => badge(value, 'prop')).join('') : '<span class="muted">None</span>'}
            </td>
            <td>
              ${row.labels.length > 0 ? `<div class="muted small">signals: ${escapeHtml(row.labels.join(', '))}</div>` : ''}
              ${row.legacyLabels.length > 0 ? `<div class="muted small">legacy: ${escapeHtml(row.legacyLabels.join(', '))}</div>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function buildHtml(audit) {
  const excludedTopFiles = new Set([
    'scripts/generateStorageChangeAudit.js',
    'docs/implementation/sql-full-migration/storage-audit-and-consolidation-plan.html',
  ]);
  const topRows = audit.ledger
    .filter((row) => !excludedTopFiles.has(row.file))
    .slice(0, 24);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Storage Audit and Consolidation Plan</title>
<style>
:root {
  --bg: #0f172a;
  --panel: #111827;
  --line: rgba(148, 163, 184, 0.24);
  --text: #e5eefc;
  --muted: #9fb0c9;
  --accent: #7dd3fc;
  --green: #86efac;
  --amber: #fcd34d;
  --red: #fca5a5;
  --violet: #c4b5fd;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background:
    radial-gradient(circle at top left, rgba(125, 211, 252, 0.12), transparent 34%),
    radial-gradient(circle at top right, rgba(196, 181, 253, 0.10), transparent 28%),
    linear-gradient(180deg, #0b1120 0%, #0f172a 50%, #0b1220 100%);
  color: var(--text);
  font-family: "Segoe UI", Arial, sans-serif;
}
main {
  max-width: 1460px;
  margin: 0 auto;
  padding: 28px 24px 48px;
}
h1, h2, h3, h4, h5, p { margin: 0; }
h1 { font-size: clamp(2rem, 4vw, 3.15rem); line-height: 1.08; }
h2 { font-size: 1.7rem; margin-top: 34px; }
h3 { font-size: 1.22rem; }
h4 { font-size: 0.96rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; }
h5 { font-size: 0.88rem; color: var(--muted); margin-bottom: 8px; }
p { line-height: 1.62; }
.hero,
.panel,
.audit-card,
.bucket,
.overview-card {
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: 0 18px 40px rgba(2, 8, 23, 0.28);
}
.hero {
  padding: 28px;
  display: grid;
  gap: 18px;
}
.hero p { color: var(--muted); max-width: 1000px; }
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.filter-bar input {
  width: min(640px, 100%);
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.92);
  color: var(--text);
  padding: 12px 14px;
  font: inherit;
}
.stat-grid,
.overview-grid,
.bucket-grid,
.signal-grid {
  display: grid;
  gap: 16px;
}
.stat-grid {
  margin-top: 18px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.overview-grid,
.bucket-grid {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}
.signal-grid {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  margin-top: 16px;
}
.panel { padding: 22px; margin-top: 22px; }
.stat-card,
.overview-card {
  padding: 18px;
}
.stat-card {
  background: rgba(15, 23, 42, 0.86);
  border: 1px solid var(--line);
  border-radius: 18px;
}
.stat-card .value {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 6px;
}
.stat-card .label,
.muted { color: var(--muted); }
.small { font-size: 0.84rem; }
.badge-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 0.77rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  border: 1px solid transparent;
}
.badge.neutral { background: rgba(125, 211, 252, 0.10); color: var(--accent); border-color: rgba(125, 211, 252, 0.28); }
.badge.surface { background: rgba(14, 116, 144, 0.22); color: #bae6fd; border-color: rgba(125, 211, 252, 0.34); }
.badge.owner { background: rgba(134, 239, 172, 0.12); color: var(--green); border-color: rgba(134, 239, 172, 0.30); }
.badge.read { background: rgba(125, 211, 252, 0.10); color: #bfdbfe; border-color: rgba(125, 211, 252, 0.28); }
.badge.write { background: rgba(252, 211, 77, 0.12); color: var(--amber); border-color: rgba(252, 211, 77, 0.28); }
.badge.prop { background: rgba(196, 181, 253, 0.12); color: var(--violet); border-color: rgba(196, 181, 253, 0.28); }
.badge.legacy { background: rgba(252, 165, 165, 0.12); color: var(--red); border-color: rgba(252, 165, 165, 0.32); }
.badge.kind { background: rgba(148, 163, 184, 0.10); color: var(--muted); border-color: rgba(148, 163, 184, 0.24); }
.badge.warn { background: rgba(252, 211, 77, 0.14); color: var(--amber); border-color: rgba(252, 211, 77, 0.32); }
.audit-card {
  padding: 22px;
  margin-top: 18px;
}
.audit-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.audit-header p { color: var(--muted); margin-top: 8px; max-width: 980px; }
.bucket {
  padding: 18px;
}
.bucket-sub { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); }
.file-list {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  max-height: 320px;
  overflow: auto;
}
.file-list li {
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  padding: 10px 0;
}
.file-list li:last-child { border-bottom: none; }
.path-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
code {
  font-family: "Consolas", "SFMono-Regular", monospace;
  font-size: 0.85rem;
  color: #dbeafe;
  word-break: break-word;
}
.empty {
  color: var(--muted);
  margin-top: 14px;
  line-height: 1.6;
}
.full-list {
  margin-top: 18px;
  border-top: 1px solid var(--line);
  padding-top: 16px;
}
.full-list summary {
  cursor: pointer;
  color: var(--accent);
  font-weight: 700;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 14px;
}
th, td {
  text-align: left;
  padding: 12px 10px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
th {
  color: var(--muted);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.signal-table th:last-child,
.signal-table td:last-child { width: 90px; }
.signal-label {
  display: inline-block;
  border-radius: 10px;
  padding: 4px 8px;
  font-size: 0.8rem;
  font-weight: 700;
}
.signal-label.neutral { background: rgba(125, 211, 252, 0.10); color: var(--accent); }
.signal-label.legacy { background: rgba(252, 165, 165, 0.12); color: var(--red); }
.footer-note {
  margin-top: 26px;
  color: var(--muted);
  line-height: 1.7;
}
@media (max-width: 900px) {
  .audit-header,
  .path-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
</head>
<body>
<main>
  <section class="hero">
    <div>
      <h1>Storage Audit and Consolidation Plan</h1>
      <p>
        Static repo audit generated from <code>git ls-files -co --exclude-standard</code> on ${escapeHtml(audit.generatedAt)}.
        This version turns the earlier storage plan into a file-level implementation map: every matched phase and root concern now shows the files that own the change, the files that load/read from it, the files that write/emit to it, the files that propagate it through routes, UI, tests, and docs, plus a full touched-file ledger.
      </p>
      <p>
        Working decision kept from the earlier plan: <code>.workspace/</code> is the intended unified runtime root. This audit is static source analysis, not live disk tracing.
      </p>
    </div>
    <div class="filter-bar">
      <input id="storageFilter" type="search" placeholder="Filter by phase, concern, signal, or file path">
    </div>
  </section>

  <section class="stat-grid">
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.scannedFileCount))}</div><div class="label">Tracked Files Scanned</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.textFileCount))}</div><div class="label">Text Files Parsed</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.skippedFileCount))}</div><div class="label">Binary / Unreadable Skipped</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.touchedFileCount))}</div><div class="label">Touched Files</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.phaseCount))}</div><div class="label">Change Phases</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.concernCount))}</div><div class="label">Root Concerns</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.legacyReferenceFileCount))}</div><div class="label">Legacy Ref Files</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.compiledMirrorCount))}</div><div class="label">Compiled Mirrors</div></div>
  </section>

  <section class="panel">
    <h2>Audit Basis</h2>
    <div class="overview-grid" style="margin-top:16px;">
      <div class="overview-card">
        <h4>Coverage Rule</h4>
        <p class="muted">Every tracked or unignored file was considered. A file is included in the storage ledger when it is a configured primary owner or when it matches one of the phase/concern signals.</p>
      </div>
      <div class="overview-card">
        <h4>Loads / Writes / Propagation</h4>
        <p class="muted">These are heuristic buckets. They are intended to answer the same question as the schema audit: what code loads from the storage surface, what code writes to it, and what code exposes or depends on it downstream.</p>
      </div>
      <div class="overview-card">
        <h4>Legacy Honesty</h4>
        <p class="muted">Legacy-root references are surfaced separately so stale docs, tests, and compiled mirrors do not masquerade as live storage owners. Missing configured primaries are called out instead of silently skipped.</p>
      </div>
      <div class="overview-card">
        <h4>Limit</h4>
        <p class="muted">This is a static implementation audit. Dynamic path composition and runtime-only file moves can still need manual validation after code changes land.</p>
      </div>
    </div>
  </section>

  <section class="panel">
    <h2>Highest-Overlap Files</h2>
    <p class="footer-note">These files show up in the most phase/concern buckets and are the main implementation choke points for the consolidation.</p>
    ${renderTopFilesTable(topRows)}
  </section>

  <section class="panel">
    <h2>Phase Audit</h2>
    <p class="footer-note">Each phase below includes the concrete owner files plus the full repo touch surface around that change.</p>
    ${audit.phaseAudits.map((section) => renderSectionCard(section, 'Phase')).join('')}
  </section>

  <section class="panel">
    <h2>Root Concern Audit</h2>
    <p class="footer-note">These cross-cutting concerns collapse the phase data into the runtime roots and storage-state surfaces that the codebase has to converge.</p>
    ${audit.concernAudits.map((section) => renderSectionCard(section, 'Concern')).join('')}
  </section>

  <section class="panel">
    <h2>Repo-Wide Touch Ledger</h2>
    <p class="footer-note">This is the exhaustive touched-file matrix for the storage consolidation surface. Search filters this table in-place.</p>
    ${renderLedgerTable(audit.ledger)}
  </section>

  <p class="footer-note">
    Generated by <code>scripts/generateStorageChangeAudit.js</code>. Refresh this HTML after any storage-root, path-resolution, runtime-ops, or storage-state changes.
  </p>
</main>
<script>
const filterInput = document.getElementById('storageFilter');
const filterTargets = Array.from(document.querySelectorAll('.filter-target'));
filterInput.addEventListener('input', () => {
  const needle = filterInput.value.trim().toLowerCase();
  for (const target of filterTargets) {
    const text = target.textContent.toLowerCase();
    target.style.display = needle && !text.includes(needle) ? 'none' : '';
  }
});
</script>
</body>
</html>`;
}

function main() {
  const trackedFiles = getTrackedFiles();
  const fileSet = new Set(trackedFiles);
  const textByFile = new Map();

  for (const relPath of trackedFiles) {
    const text = readText(relPath);
    if (text != null) {
      textByFile.set(relPath, text);
    }
  }

  const phaseAudits = PHASES.map((definition) => analyzeSection(definition, trackedFiles, fileSet, textByFile));
  const concernAudits = ROOT_CONCERNS.map((definition) => analyzeSection(definition, trackedFiles, fileSet, textByFile));
  const ledger = buildTouchLedger(phaseAudits, concernAudits);

  const audit = {
    generatedAt: new Date().toISOString(),
    scannedFileCount: trackedFiles.length,
    textFileCount: textByFile.size,
    skippedFileCount: trackedFiles.length - textByFile.size,
    touchedFileCount: ledger.length,
    phaseCount: phaseAudits.length,
    concernCount: concernAudits.length,
    legacyReferenceFileCount: ledger.filter((row) => row.legacyLabels.length > 0).length,
    compiledMirrorCount: ledger.filter((row) => row.kind === 'compiled').length,
    phaseAudits,
    concernAudits,
    ledger,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, buildHtml(audit), 'utf8');
  process.stdout.write(`Wrote ${normalizeRel(path.relative(ROOT, OUTPUT_PATH))}\n`);
}

main();
