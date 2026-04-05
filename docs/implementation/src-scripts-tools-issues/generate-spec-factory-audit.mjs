import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const outputJsonPath = path.join(__dirname, 'spec-factory-audit.data.json');
const outputJsPath = path.join(__dirname, 'spec-factory-audit.data.js');

const SCOPE_PREFIXES = ['src/', 'tools/', 'scripts/', 'e2e/', 'category_authority/', 'test/'];
const ROOT_FILES = new Set([
  'AGENTS.md',
  'AGENTS.testing.md',
  'AGENTS.testsCleanUp.md',
  'CLAUDE.md',
  'Dockerfile',
  'README.md',
  'SpecFactory.bat',
  'package-lock.json',
  'package.json',
  'playwright.config.ts',
  '.gitignore',
]);
const EXCLUDE_PREFIXES = [
  '.git/',
  '.claude/',
  '.server-state/',
  '.tmp/',
  '.workspace/',
  'debug/',
  'docs/',
  'gui-dist/',
  'node_modules/',
];

const CODE_EXTS = new Set(['.js', '.ts', '.tsx', '.mjs', '.cjs']);
const DOC_EXTS = new Set(['.md', '.txt', '.html']);
const DATA_EXTS = new Set(['.json', '.yml', '.yaml']);
const ASSET_EXTS = new Set(['.css', '.ico', '.png', '.jpg', '.jpeg', '.svg', '.gif']);
const MANUAL_SCRIPT_EXTS = new Set(['.ps1', '.py', '.pyw', '.bat']);

const TEST_PATTERN = /(^|\/)(?:__tests__|_tests|tests?|test)(\/|$)|\.(test|spec)\.[^.]+$/i;
const GENERATED_PATTERN = /(\.generated\.)|(\.d\.ts$)|(\.tsbuildinfo$)|(^tools\/dist\/)/i;
const BARREL_PATTERN = /(^|\/)index\.(js|ts|tsx|mjs|cjs)$/i;

const STATUS_ORDER = {
  DEAD_CANDIDATE: 0,
  DEFER: 1,
  FUTURE_PREWIRED: 2,
  MANUAL_OR_GENERATED: 3,
  ACTIVE_SUPPORT: 4,
  ACTIVE: 5,
};

const FOLDER_STATUS_ORDER = {
  DEAD_CANDIDATE: 0,
  DEFER: 1,
  FUTURE_PREWIRED: 2,
  MANUAL_OR_GENERATED: 3,
  ACTIVE_SUPPORT: 4,
  ACTIVE: 5,
  MIXED: 6,
};

const FUTURE_FOLDER_OVERRIDES = new Map([
  ['tools/gui-react/src/features/review', {
    why: 'Review grid UI is intentionally prewired for future hookup, not dead.',
    evidence: [
      'Current page registry still wires /review to ReviewPage.',
      'User explicitly called review grid/component review future-prewired.',
    ],
  }],
  ['tools/gui-react/src/pages/component-review', {
    why: 'Component review UI remains intentionally staged for later hookup.',
    evidence: [
      'Current page registry still wires /review-components.',
      'User explicitly called review grid/component review future-prewired.',
    ],
  }],
  ['tools/gui-react/src/pages/llm-settings', {
    why: 'Review LLM UI remains intentionally staged for later hookup.',
    evidence: [
      'Current page registry still wires /llm-settings.',
      'User explicitly called review LLM future-prewired.',
    ],
  }],
]);

const DEAD_FOLDER_OVERRIDES = new Map([
  ['src/app/api/contracts', {
    why: 'The folder exports legacy shape constants that nothing in the current tree imports anymore.',
    evidence: [
      '2/2 files have zero inbound refs from code or tests.',
      'Repo text search only found declarations for the exported key arrays.',
    ],
  }],
  ['tools/gui-react/src/pages/runtime', {
    why: 'These standalone runtime widgets are no longer routed or imported after the runtime-ops panel consolidation.',
    evidence: [
      '3/3 files have zero inbound refs from code or tests.',
      'The current page registry does not expose a runtime page route.',
    ],
  }],
]);

const DEAD_FILE_OVERRIDES = new Map([
  ['src/app/api/contracts/processStatusShape.js', {
    why: 'Legacy process-status shape constant with no remaining consumers in the current tree.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'Text search only found the declaration site.',
    ],
  }],
  ['src/app/api/contracts/runtimeTypeShapes.js', {
    why: 'Legacy runtime trace/frontier shape constants with no remaining consumers in the current tree.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'Text search only found the declaration site.',
    ],
  }],
  ['src/features/catalog/products/backfillProductJsons.js', {
    why: 'One-time migration residue kept after the backfill completed.',
    evidence: [
      'File header explicitly labels it as a one-time backfill.',
      'No inbound refs from runtime code or tests.',
    ],
  }],
  ['tools/gui-react/src/api/graphql.ts', {
    why: 'Unused GraphQL helper left behind while the GUI stays on the REST client.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'Repo search found no graphqlQuery consumers.',
    ],
  }],
  ['tools/gui-react/src/features/llm-config/sections/LlmModelCatalogSection.tsx', {
    why: 'Unused older model-catalog panel left behind after the LLM config page converged on the global/all-models flow.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'Current LLM config page lazy-loads Global and Phase sections instead.',
    ],
  }],
  ['tools/gui-react/src/features/storage-manager/state/useStorageOverview.ts', {
    why: 'Unused storage-overview hook left behind after the panel converged on useStorageRuns.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'Current StorageManagerPanel calls useStorageRuns directly.',
    ],
  }],
  ['tools/gui-react/src/features/studio/components/MappingConstraintEditor.tsx', {
    why: 'Unused mapping-constraint editor residue after constraint editing moved elsewhere.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'Current studio shells wire MappingStudioTab and KeyConstraintEditor, not this component.',
    ],
  }],
  ['tools/gui-react/src/pages/product/AvailabilityGuidance.tsx', {
    why: 'Unused product-page helper component left behind after ProductPage inlined the current detail view.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'Repo search found no AvailabilityGuidance consumers.',
    ],
  }],
  ['tools/gui-react/src/pages/product/HelperLlmStatus.tsx', {
    why: 'Unused product-page helper component left behind after ProductPage inlined the current detail view.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'Repo search found no HelperLlmStatus consumers.',
    ],
  }],
  ['tools/gui-react/src/pages/product/PipelineProgress.tsx', {
    why: 'Unused product-page helper component left behind after ProductPage inlined the current pipeline strip.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'Repo search found no PipelineProgress consumers.',
    ],
  }],
  ['tools/gui-react/src/pages/runtime/EventLog.tsx', {
    why: 'Standalone runtime widget no longer mounted anywhere in the GUI.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'The runtime page route is gone from the registry.',
    ],
  }],
  ['tools/gui-react/src/pages/runtime/ProcessOutput.tsx', {
    why: 'Standalone runtime widget no longer mounted anywhere in the GUI.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'The runtime page route is gone from the registry.',
    ],
  }],
  ['tools/gui-react/src/pages/runtime/QueueSnapshot.tsx', {
    why: 'Standalone runtime widget no longer mounted anywhere in the GUI.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'The runtime page route is gone from the registry.',
    ],
  }],
]);

const DEFER_FILE_OVERRIDES = new Map([
  ['src/indexlab/buildFieldHistories.js', {
    why: 'Still looks orphaned, but the remaining indexlab surface is in motion and the last evidence trail is too weak to call dead cleanly.',
    evidence: [
      'No inbound refs from runtime code or tests.',
      'Name and placement still look like an ad hoc analysis utility.',
    ],
  }],
]);

const MANUAL_SCRIPT_PREFIXES = [
  'scripts/',
  'scripts/live-audits/',
  'tools/architecture/',
  'tools/gui-react/scripts/',
];

const CONVENTIONAL_ENTRYPOINTS = new Set([
  'src/app/api/guiServer.js',
  'src/app/cli/indexlab.js',
  'src/app/cli/smokeLocal.js',
  'src/app/cli/spec.js',
  'tools/build-exe.mjs',
  'tools/build-setup-exe.mjs',
  'tools/check-env-example-sync.mjs',
  'tools/gui-launcher.mjs',
  'tools/render-authority-mermaid.mjs',
  'tools/setup-deps.mjs',
  'tools/specfactory-launcher.mjs',
  'tools/gui-react/src/main.tsx',
]);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function listScopedFiles() {
  const output = execFileSync('rg', ['--files', '.'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((row) => toPosix(row).replace(/^\.\//, ''))
    .filter((file) => !EXCLUDE_PREFIXES.some((prefix) => file.startsWith(prefix)))
    .filter((file) => ROOT_FILES.has(file) || SCOPE_PREFIXES.some((prefix) => file.startsWith(prefix)))
    .sort();
}

function fileExt(file) {
  return path.posix.extname(file).toLowerCase();
}

function isCodeFile(file) {
  return CODE_EXTS.has(fileExt(file));
}

function isTestFile(file) {
  return TEST_PATTERN.test(file);
}

function isGeneratedFile(file) {
  return GENERATED_PATTERN.test(file);
}

function isDocFile(file) {
  return DOC_EXTS.has(fileExt(file));
}

function isDataFile(file) {
  return DATA_EXTS.has(fileExt(file));
}

function isAssetFile(file) {
  return ASSET_EXTS.has(fileExt(file));
}

function isManualScriptFile(file) {
  return MANUAL_SCRIPT_EXTS.has(fileExt(file));
}

function isManualScriptPrefix(file) {
  return MANUAL_SCRIPT_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function isConfigFile(file) {
  return (
    file === 'package.json' ||
    file === 'package-lock.json' ||
    file === 'playwright.config.ts' ||
    file === 'Dockerfile' ||
    file === '.gitignore' ||
    file === 'SpecFactory.bat' ||
    file === 'tools/gui-react/vite.config.ts' ||
    file === 'tools/gui-react/tailwind.config.ts' ||
    file === 'tools/gui-react/postcss.config.js'
  );
}

function isBarrelFile(file) {
  return BARREL_PATTERN.test(file);
}

function isRootToolingFile(file) {
  return (
    file.startsWith('tools/') &&
    !file.startsWith('tools/dist/') &&
    !file.startsWith('tools/gui-react/') &&
    !isTestFile(file)
  );
}

function majorArea(file) {
  const parts = file.split('/');
  if (parts[0] === 'tools' && parts[1] === 'gui-react') {
    return parts.slice(0, Math.min(parts.length - 1, 4)).join('/');
  }
  return parts.slice(0, Math.min(parts.length - 1, 3)).join('/');
}

function futureOverride(file) {
  for (const [prefix, meta] of FUTURE_FOLDER_OVERRIDES.entries()) {
    if (file === prefix || file.startsWith(`${prefix}/`)) {
      return { prefix, ...meta };
    }
  }
  return null;
}

function deadFolderOverride(file) {
  for (const [prefix, meta] of DEAD_FOLDER_OVERRIDES.entries()) {
    if (file === prefix || file.startsWith(`${prefix}/`)) {
      return { prefix, ...meta };
    }
  }
  return null;
}

function resolveSpecifier(fromFile, specifier, fileSet) {
  const candidates = [];
  const addCandidates = (raw) => {
    if (path.posix.extname(raw)) {
      candidates.push(raw);
      return;
    }
    for (const ext of CODE_EXTS) {
      candidates.push(`${raw}${ext}`);
    }
    for (const ext of CODE_EXTS) {
      candidates.push(path.posix.join(raw, `index${ext}`));
    }
  };

  if (specifier.startsWith('.')) {
    const raw = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
    addCandidates(raw);
  } else if (specifier.startsWith('@/')) {
    addCandidates(path.posix.join('tools/gui-react/src', specifier.slice(2)));
  } else {
    return null;
  }

  return candidates.find((candidate) => fileSet.has(candidate)) || null;
}

function parseImportSpecifiers(text) {
  const specs = new Set();
  const patterns = [
    /import\s+(?:[^'"`]*?\s+from\s+)?['"]([^'"\n]+)['"]/g,
    /export\s+[^'"`]*?from\s+['"]([^'"\n]+)['"]/g,
    /require\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    /import\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      specs.add(match[1]);
    }
  }
  return [...specs];
}

async function collectEntryTargets() {
  const entryTargets = new Set(CONVENTIONAL_ENTRYPOINTS);
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const scriptPattern = /(^|[\s"'`])([A-Za-z0-9_./-]+\.(?:js|mjs|ts|tsx|cjs))(?=$|[\s"'`])/g;

  for (const command of Object.values(packageJson.scripts || {})) {
    for (const match of command.matchAll(scriptPattern)) {
      entryTargets.add(toPosix(match[2]).replace(/^\.\//, ''));
    }
  }

  return entryTargets;
}

async function buildGraphs(scopedFiles) {
  const codeFiles = scopedFiles.filter(isCodeFile);
  const runtimeFiles = codeFiles.filter((file) => !isGeneratedFile(file));
  const runtimeNonTestFiles = runtimeFiles.filter((file) => !isTestFile(file));

  const codeSet = new Set(codeFiles);
  const runtimeSet = new Set(runtimeFiles);
  const runtimeNonTestSet = new Set(runtimeNonTestFiles);

  const inbound = new Map(runtimeFiles.map((file) => [file, {
    nonTest: 0,
    test: 0,
    total: 0,
    importers: new Set(),
  }]));

  const inboundNonTest = new Map(runtimeNonTestFiles.map((file) => [file, {
    nonTest: 0,
    test: 0,
    total: 0,
    importers: new Set(),
  }]));

  for (const file of codeFiles) {
    const absolute = path.join(repoRoot, file);
    const text = await fs.readFile(absolute, 'utf8');
    const specs = parseImportSpecifiers(text);
    const seen = new Set();
    for (const spec of specs) {
      const resolved = resolveSpecifier(file, spec, codeSet);
      if (!resolved || resolved === file || seen.has(resolved)) continue;
      seen.add(resolved);

      if (runtimeSet.has(resolved)) {
        const stats = inbound.get(resolved);
        stats.total += 1;
        stats.importers.add(file);
        if (isTestFile(file)) stats.test += 1;
        else stats.nonTest += 1;
      }

      if (runtimeNonTestSet.has(resolved)) {
        const stats = inboundNonTest.get(resolved);
        stats.total += 1;
        stats.importers.add(file);
        if (isTestFile(file)) stats.test += 1;
        else stats.nonTest += 1;
      }
    }
  }

  return { codeFiles, runtimeFiles, runtimeNonTestFiles, inbound, inboundNonTest };
}

function buildEvidence(stats, extra = []) {
  const evidence = [
    `Non-test inbound refs: ${stats?.nonTest || 0}`,
    `Test inbound refs: ${stats?.test || 0}`,
  ];
  return uniqueSorted([...evidence, ...extra]);
}

function classifyFile(file, stats, entryTargets) {
  const ext = fileExt(file);
  const future = futureOverride(file);
  if (future) {
    return {
      status: 'FUTURE_PREWIRED',
      note: future.why,
      evidence: buildEvidence(stats, future.evidence),
    };
  }

  const deadExact = DEAD_FILE_OVERRIDES.get(file);
  if (deadExact) {
    return {
      status: 'DEAD_CANDIDATE',
      note: deadExact.why,
      evidence: buildEvidence(stats, deadExact.evidence),
    };
  }

  const deadFolder = deadFolderOverride(file);
  if (deadFolder) {
    return {
      status: 'DEAD_CANDIDATE',
      note: deadFolder.why,
      evidence: buildEvidence(stats, deadFolder.evidence),
    };
  }

  const deferExact = DEFER_FILE_OVERRIDES.get(file);
  if (deferExact) {
    return {
      status: 'DEFER',
      note: deferExact.why,
      evidence: buildEvidence(stats, deferExact.evidence),
    };
  }

  if (isGeneratedFile(file)) {
    return {
      status: 'MANUAL_OR_GENERATED',
      note: 'Generated build/type artifact. Keep out of dead-file calls unless the generating path is removed.',
      evidence: buildEvidence(stats, ['Matches generated/build artifact pattern.']),
    };
  }

  if (isDocFile(file)) {
    return {
      status: 'ACTIVE_SUPPORT',
      note: 'Documentation/support file that still belongs to the implementation surface.',
      evidence: buildEvidence(stats),
    };
  }

  if (isTestFile(file) || file.startsWith('e2e/') || file.startsWith('test/')) {
    return {
      status: 'ACTIVE_SUPPORT',
      note: 'Test coverage, fixture, or harness support.',
      evidence: buildEvidence(stats),
    };
  }

  if (isConfigFile(file)) {
    return {
      status: 'ACTIVE_SUPPORT',
      note: 'Config or conventional tool surface; import reachability is not the right liveness test here.',
      evidence: buildEvidence(stats),
    };
  }

  if (entryTargets.has(file)) {
    return {
      status: 'ACTIVE',
      note: 'Direct command/build entrypoint confirmed from the current repo command surface.',
      evidence: buildEvidence(stats, ['Referenced directly by package/config command surface.']),
    };
  }

  if (file.includes('/test-utils/')) {
    return {
      status: 'ACTIVE_SUPPORT',
      note: 'Dedicated test utility/support surface.',
      evidence: buildEvidence(stats),
    };
  }

  if (isRootToolingFile(file)) {
    return {
      status: 'MANUAL_OR_GENERATED',
      note: 'Tooling/operator surface under tools/. Zero inbound refs are expected unless another tool script composes it.',
      evidence: buildEvidence(stats),
    };
  }

  if (isManualScriptPrefix(file) || isManualScriptFile(file)) {
    return {
      status: 'MANUAL_OR_GENERATED',
      note: 'Manual operator/generator/audit script. Zero inbound refs are expected for this kind of file.',
      evidence: buildEvidence(stats),
    };
  }

  if (isDataFile(file) || isAssetFile(file) || file.startsWith('category_authority/')) {
    return {
      status: 'ACTIVE_SUPPORT',
      note: 'Data, authority, or asset support file.',
      evidence: buildEvidence(stats),
    };
  }

  if (CODE_EXTS.has(ext)) {
    if ((stats?.nonTest || 0) > 0) {
      return {
        status: 'ACTIVE',
        note: 'Reachable from the current runtime/build code graph.',
        evidence: buildEvidence(stats),
      };
    }

    if (isBarrelFile(file)) {
      return {
        status: 'ACTIVE_SUPPORT',
        note: 'Conventional barrel/entry file. Zero inbound refs alone are not enough to call it dead.',
        evidence: buildEvidence(stats, ['Matches index/barrel naming convention.']),
      };
    }

    if ((stats?.test || 0) > 0) {
      return {
        status: 'DEFER',
        note: 'Only test-reachable today. Runtime ownership is unclear, so this stays out of the dead bucket for now.',
        evidence: buildEvidence(stats),
      };
    }

    return {
      status: 'DEFER',
      note: 'Zero inbound refs and no explicit entrypoint. This is suspicious, but not strong enough for a dead call without more direct proof.',
      evidence: buildEvidence(stats),
    };
  }

  return {
    status: 'ACTIVE_SUPPORT',
    note: 'Support file kept in scope.',
    evidence: buildEvidence(stats),
  };
}

function classifyKind(file) {
  if (isTestFile(file) || file.startsWith('e2e/') || file.startsWith('test/')) return 'test';
  if (isGeneratedFile(file)) return 'generated';
  if (isManualScriptPrefix(file) || isManualScriptFile(file) || file === 'SpecFactory.bat') return 'manual-script';
  if (isConfigFile(file)) return 'config';
  if (isDocFile(file)) return 'doc';
  if (isDataFile(file)) return 'data';
  if (isAssetFile(file)) return 'asset';
  if (isCodeFile(file)) return 'runtime-code';
  return 'support';
}

function buildFileRow(file, stats, entryTargets) {
  const classification = classifyFile(file, stats, entryTargets);
  return {
    path: file,
    dir: path.posix.dirname(file),
    majorArea: majorArea(file),
    ext: fileExt(file) || '(none)',
    kind: classifyKind(file),
    status: classification.status,
    note: classification.note,
    evidence: classification.evidence,
    inboundNonTest: stats?.nonTest || 0,
    inboundTest: stats?.test || 0,
    entrypoint: entryTargets.has(file),
    zeroInbound: (stats?.nonTest || 0) === 0 && (stats?.test || 0) === 0,
  };
}

function compareRows(a, b, orderMap = STATUS_ORDER) {
  if (orderMap[a.status] !== orderMap[b.status]) {
    return orderMap[a.status] - orderMap[b.status];
  }
  return a.path.localeCompare(b.path);
}

function addFolderAncestor(folderMap, dir, row) {
  if (!dir || dir === '.') return;
  if (!folderMap.has(dir)) {
    folderMap.set(dir, []);
  }
  folderMap.get(dir).push(row);
  const parent = path.posix.dirname(dir);
  if (parent && parent !== dir && parent !== '.') {
    addFolderAncestor(folderMap, parent, row);
  }
}

function summarizeStatuses(rows) {
  const counts = {
    ACTIVE: 0,
    ACTIVE_SUPPORT: 0,
    FUTURE_PREWIRED: 0,
    MANUAL_OR_GENERATED: 0,
    DEFER: 0,
    DEAD_CANDIDATE: 0,
  };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
}

function classifyFolder(pathKey, rows) {
  const future = FUTURE_FOLDER_OVERRIDES.get(pathKey);
  if (future) {
    return {
      status: 'FUTURE_PREWIRED',
      note: future.why,
      evidence: future.evidence,
    };
  }

  const dead = DEAD_FOLDER_OVERRIDES.get(pathKey);
  if (dead) {
    return {
      status: 'DEAD_CANDIDATE',
      note: dead.why,
      evidence: dead.evidence,
    };
  }

  const counts = summarizeStatuses(rows);
  const statuses = uniqueSorted(rows.map((row) => row.status));

  if (statuses.length === 1) {
    return {
      status: statuses[0],
      note: `All descendant files currently land in ${statuses[0]}.`,
      evidence: [],
    };
  }

  if (
    counts.DEAD_CANDIDATE > 0 &&
    counts.ACTIVE === 0 &&
    counts.ACTIVE_SUPPORT === 0 &&
    counts.FUTURE_PREWIRED === 0 &&
    counts.MANUAL_OR_GENERATED === 0
  ) {
    return {
      status: 'DEAD_CANDIDATE',
      note: 'No active descendants remain; the folder is made entirely of dead candidates and defers.',
      evidence: [],
    };
  }

  if (
    counts.FUTURE_PREWIRED > 0 &&
    counts.ACTIVE === 0 &&
    counts.ACTIVE_SUPPORT === 0 &&
    counts.DEAD_CANDIDATE === 0 &&
    counts.MANUAL_OR_GENERATED === 0
  ) {
    return {
      status: 'FUTURE_PREWIRED',
      note: 'Descendants are staged future surfaces rather than live active routes.',
      evidence: [],
    };
  }

  if (counts.DEFER > 0 && counts.ACTIVE === 0 && counts.ACTIVE_SUPPORT === 0 && counts.DEAD_CANDIDATE === 0) {
    return {
      status: 'DEFER',
      note: 'The folder remains ambiguous/transitional in the current tree.',
      evidence: [],
    };
  }

  if (counts.ACTIVE + counts.ACTIVE_SUPPORT === rows.length) {
    return {
      status: 'ACTIVE',
      note: 'Descendants remain active or active-support surfaces.',
      evidence: [],
    };
  }

  return {
    status: 'MIXED',
    note: 'Contains a mix of active, staged, deferred, or dead-candidate files.',
    evidence: [],
  };
}

function buildFolderRows(fileRows) {
  const folderMap = new Map();
  for (const row of fileRows) {
    addFolderAncestor(folderMap, row.dir, row);
  }

  const rows = [];
  for (const [pathKey, descendants] of folderMap.entries()) {
    const classification = classifyFolder(pathKey, descendants);
    const counts = summarizeStatuses(descendants);
    const kindCounts = descendants.reduce((acc, row) => {
      acc[row.kind] = (acc[row.kind] || 0) + 1;
      return acc;
    }, {});

    rows.push({
      path: pathKey,
      status: classification.status,
      note: classification.note,
      evidence: classification.evidence,
      fileCount: descendants.length,
      codeFileCount: descendants.filter((row) => row.kind === 'runtime-code').length,
      deadCandidateCount: counts.DEAD_CANDIDATE,
      futurePrewiredCount: counts.FUTURE_PREWIRED,
      deferCount: counts.DEFER,
      manualOrGeneratedCount: counts.MANUAL_OR_GENERATED,
      activeCount: counts.ACTIVE,
      activeSupportCount: counts.ACTIVE_SUPPORT,
      dominantKinds: Object.entries(kindCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([kind]) => kind),
      sampleDeadFiles: descendants
        .filter((row) => row.status === 'DEAD_CANDIDATE')
        .map((row) => row.path)
        .slice(0, 5),
    });
  }

  return rows.sort((a, b) => {
    if (FOLDER_STATUS_ORDER[a.status] !== FOLDER_STATUS_ORDER[b.status]) {
      return FOLDER_STATUS_ORDER[a.status] - FOLDER_STATUS_ORDER[b.status];
    }
    return a.path.localeCompare(b.path);
  });
}

function countBy(rows, key) {
  const result = {};
  for (const row of rows) {
    result[row[key]] = (result[row[key]] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort((a, b) => a[0].localeCompare(b[0])));
}

function topRows(rows, predicate, count, sortFn) {
  return rows.filter(predicate).sort(sortFn).slice(0, count);
}

function isConcreteHotspot(row) {
  const depth = row.path.split('/').length;
  if (['src', 'tools', 'scripts', 'e2e', 'category_authority', 'test'].includes(row.path)) {
    return false;
  }
  if (row.fileCount > 100) {
    return false;
  }
  if (depth >= 3) return true;
  return row.fileCount <= 40;
}

async function main() {
  const scopedFiles = listScopedFiles();
  const entryTargets = await collectEntryTargets();
  const graphs = await buildGraphs(scopedFiles);
  const fileRows = scopedFiles
    .map((file) => buildFileRow(file, graphs.inbound.get(file) || graphs.inboundNonTest.get(file) || null, entryTargets))
    .sort(compareRows);
  const folderRows = buildFolderRows(fileRows);

  const zeroInboundRuntime = graphs.runtimeNonTestFiles.filter((file) => {
    const stats = graphs.inboundNonTest.get(file);
    return (stats?.nonTest || 0) === 0;
  });

  const deadCandidateFiles = fileRows.filter((row) => row.status === 'DEAD_CANDIDATE');
  const futurePrewiredFiles = fileRows.filter((row) => row.status === 'FUTURE_PREWIRED');
  const deferFiles = fileRows.filter((row) => row.status === 'DEFER');
  const deadCandidateFolders = folderRows.filter((row) => row.status === 'DEAD_CANDIDATE');
  const futurePrewiredFolders = folderRows.filter((row) => row.status === 'FUTURE_PREWIRED');

  const deadFolderHighlights = DEAD_FOLDER_OVERRIDES.size
    ? [...DEAD_FOLDER_OVERRIDES.keys()]
      .map((folder) => folderRows.find((row) => row.path === folder))
      .filter(Boolean)
    : [];

  const futureFolderHighlights = FUTURE_FOLDER_OVERRIDES.size
    ? [...FUTURE_FOLDER_OVERRIDES.keys()]
      .map((folder) => folderRows.find((row) => row.path === folder))
      .filter(Boolean)
    : [];

  const deferHotspots = topRows(
    folderRows,
    (row) => row.deferCount > 0 && isConcreteHotspot(row),
    18,
    (a, b) => {
      const ratioA = a.deferCount / Math.max(a.fileCount, 1);
      const ratioB = b.deferCount / Math.max(b.fileCount, 1);
      if (ratioB !== ratioA) return ratioB - ratioA;
      if (b.deferCount !== a.deferCount) return b.deferCount - a.deferCount;
      return a.path.localeCompare(b.path);
    },
  );

  const data = {
    generatedAt: new Date().toISOString(),
    auditVersion: 'repo-file-audit-v2',
    scope: {
      includes: [
        'src/**',
        'tools/**',
        'scripts/**',
        'e2e/**',
        'category_authority/**',
        'test/**',
        ...[...ROOT_FILES],
      ],
      excludes: [
        'docs/**',
        'node_modules/**',
        '.git/**',
        '.claude/**',
        '.server-state/**',
        '.tmp/**',
        '.workspace/**',
        'debug/**',
        'gui-dist/**',
      ],
      fileCount: scopedFiles.length,
      codeFileCount: graphs.codeFiles.length,
      runtimeCodeFileCount: graphs.runtimeNonTestFiles.length,
      zeroInboundRuntimeCodeCount: zeroInboundRuntime.length,
    },
    glossary: {
      ACTIVE: 'Live runtime/build surface with current code-graph or command-surface reachability.',
      ACTIVE_SUPPORT: 'Config, docs, tests, fixtures, data, and similar support files kept as part of the active repo surface.',
      FUTURE_PREWIRED: 'Intentionally staged future feature. Do not treat as dead in this pass.',
      MANUAL_OR_GENERATED: 'Manual operator/generator script or generated artifact where zero inbound refs are expected.',
      DEFER: 'Suspicious or transitional surface without enough proof to call dead cleanly.',
      DEAD_CANDIDATE: 'High-confidence orphan or migration residue with direct current-tree evidence.',
      MIXED: 'Folder contains a mix of active, staged, deferred, or dead-candidate descendants.',
    },
    majorShifts: [
      'This pass replaces the old test-only audit with a repo-wide implementation-surface audit.',
      'Current API ownership is under src/app/api; prior src/api paths are no longer the live tree.',
      'Review grid UI, component review UI, and review LLM UI are protected as future-prewired surfaces per the user instruction.',
    ],
    summary: {
      fileStatuses: countBy(fileRows, 'status'),
      fileKinds: countBy(fileRows, 'kind'),
      folderStatuses: countBy(folderRows, 'status'),
      deadCandidateFileCount: deadCandidateFiles.length,
      deadCandidateFolderCount: deadCandidateFolders.length,
      futurePrewiredFileCount: futurePrewiredFiles.length,
      futurePrewiredFolderCount: futurePrewiredFolders.length,
      deferFileCount: deferFiles.length,
    },
    keyFindings: [
      {
        status: 'FUTURE_PREWIRED',
        title: 'Review surfaces stay protected',
        note: 'Review grid, component review, and review LLM are intentionally prewired future surfaces, not dead code.',
        paths: [...FUTURE_FOLDER_OVERRIDES.keys()],
      },
      {
        status: 'DEAD_CANDIDATE',
        title: 'Dead folder: current API contract residue',
        note: 'Legacy shape constants remain in src/app/api/contracts but nothing imports them now.',
        paths: ['src/app/api/contracts'],
      },
      {
        status: 'DEAD_CANDIDATE',
        title: 'Dead folder: orphaned runtime widgets',
        note: 'The old runtime page widgets are no longer routed or imported after runtime-ops consolidation.',
        paths: ['tools/gui-react/src/pages/runtime'],
      },
      {
        status: 'DEAD_CANDIDATE',
        title: 'Confirmed dead single-file residue exists in product, storage, studio, and LLM config UI',
        note: 'These files have direct no-consumer evidence and clearer replacements already wired elsewhere.',
        paths: [
          'tools/gui-react/src/pages/product/AvailabilityGuidance.tsx',
          'tools/gui-react/src/pages/product/HelperLlmStatus.tsx',
          'tools/gui-react/src/pages/product/PipelineProgress.tsx',
          'tools/gui-react/src/features/storage-manager/state/useStorageOverview.ts',
          'tools/gui-react/src/features/studio/components/MappingConstraintEditor.tsx',
          'tools/gui-react/src/features/llm-config/sections/LlmModelCatalogSection.tsx',
        ],
      },
      {
        status: 'DEFER',
        title: 'A wider zero-inbound layer still needs follow-up, not blind deletion',
        note: 'Many remaining suspects are barrels, manual scripts, test-only modules, or runtime-ops subcomponents that need a narrower follow-up before deletion.',
        paths: deferHotspots.slice(0, 6).map((row) => row.path),
      },
    ],
    protectedFutureFolders: futureFolderHighlights,
    deadCandidateFolders: deadFolderHighlights,
    deadCandidateFiles: deadCandidateFiles,
    deferHotspots,
    folderRows,
    fileRows,
  };

  await fs.writeFile(outputJsonPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.writeFile(outputJsPath, `window.SPEC_FACTORY_AUDIT_DATA = ${JSON.stringify(data, null, 2)};\n`, 'utf8');

  const deadFolderList = deadFolderHighlights.map((row) => row.path).join(', ');
  const deadFileCount = deadCandidateFiles.length;
  const futureCount = futurePrewiredFiles.length;
  console.log(
    `Wrote repo-wide audit: ${scopedFiles.length} files, ${graphs.runtimeNonTestFiles.length} non-test code files, ` +
    `${deadFileCount} dead-candidate files, ${deadFolderHighlights.length} dead-candidate folders, ` +
    `${futureCount} future-prewired files.`,
  );
  if (deadFolderList) {
    console.log(`Dead folder highlights: ${deadFolderList}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
