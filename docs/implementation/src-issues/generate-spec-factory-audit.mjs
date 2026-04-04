import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const outputJsonPath = path.join(__dirname, 'spec-factory-audit.data.json');
const outputJsPath = path.join(__dirname, 'spec-factory-audit.data.js');

const TEST_GLOBS = [
  'src/**/*.test.js',
  'src/**/*.test.ts',
  'src/**/*.spec.js',
  'src/**/*.spec.ts',
  'tools/**/*.test.js',
  'tools/**/*.test.ts',
  'tools/**/*.spec.js',
  'tools/**/*.spec.ts',
  'e2e/**/*.spec.ts',
  'e2e/**/*.test.ts',
  'category_authority/**/*.test.js',
  'category_authority/**/*.spec.js',
];

const BUCKET_ORDER = {
  RETIRE: 0,
  COLLAPSE: 1,
  DEFER: 2,
  KEEP: 3,
};

const exactRetire = new Map([
  ['src/features/review/domain/tests/reviewGridData.categoryQueueContracts.test.js', {
    why: 'Completed queue-retirement residue. This file only asserts that an internal builder stays empty after the queue source was removed.',
    replaceWith: 'No direct replacement. Preserve queue-removal protection at the user-visible review route or workflow boundary if that behavior still matters.',
    finalDisposition: 'Retire after confirming no user-visible queue contract depends on the empty internal builder.',
  }],
]);

const exactCollapse = new Map([
  ['tools/gui-react/scripts/generateManifestTypes.test.js', {
    why: 'Codegen output and retired-knob checks are fragmented across string-level assertions.',
    replaceWith: 'One generated-types boundary test plus one registry-removal contract test.',
    finalDisposition: 'Collapse into fewer output-shape assertions and remove ghost-key scatter checks.',
  }],
  ['src/build/tests/generateTypes.test.js', {
    why: 'Artifact generation is covered through narrow string checks that overlap with field-rule compilation and generated output presence.',
    replaceWith: 'One file-emission contract plus one schema/type export smoke test.',
    finalDisposition: 'Collapse into a smaller artifact contract around generated files, not line-level text fragments.',
  }],
  ['src/core/events/tests/dataChangeDomainParity.test.js', {
    why: 'Backend/frontend parity is real, but this is duplicate mirror coverage for two maps that should converge on a smaller shared contract.',
    replaceWith: 'One shared data-change contract test at the transport boundary.',
    finalDisposition: 'Collapse after the domain map contract is enforced at one canonical boundary.',
  }],
  ['src/core/llm/tests/llmRegistrySSot.test.js', {
    why: 'Registry SSOT protections overlap with route-resolver and runtime-routing contract tests.',
    replaceWith: 'One registry contract plus one routing snapshot contract.',
    finalDisposition: 'Collapse duplicated registry authority checks.',
  }],
  ['src/core/config/tests/manifestRegistryDriftGuard.test.js', {
    why: 'Manifest drift guard overlaps with stronger registry and config contract surfaces.',
    replaceWith: 'Fold into one manifest contract test sourced from the canonical registry.',
    finalDisposition: 'Collapse redundant manifest drift coverage.',
  }],
  ['src/core/config/tests/manifestStructuralGuard.test.js', {
    why: 'Structural manifest guard duplicates other manifest and config assembly checks.',
    replaceWith: 'Merge into a single manifest boundary contract.',
    finalDisposition: 'Collapse structural manifest assertions into one contract surface.',
  }],
  ['src/shared/tests/settingsRegistryDerivations.test.js', {
    why: 'Registry-to-derived-surface coverage is spread across defaults, clamping maps, route maps, aliases, and retired-key assertions.',
    replaceWith: 'A smaller registry contract suite centered on runtime settings GET, PUT, and defaults behavior.',
    finalDisposition: 'Collapse derivation scatter into a smaller settings boundary suite.',
  }],
  ['src/shared/tests/settingsRegistryCompleteness.test.js', {
    why: 'Registry completeness overlaps with route-surface and UI-metadata coverage elsewhere.',
    replaceWith: 'One registry well-formedness contract plus one route exposure contract.',
    finalDisposition: 'Collapse completeness checks into fewer registry-boundary tests.',
  }],
  ['src/shared/tests/settingsDefaultsEnvSync.test.js', {
    why: 'Retired-key absence is asserted through runtime, config, and manifest internals in one file, which is broader than the boundary that actually matters.',
    replaceWith: 'Keep a single config/API boundary contract for retired settings; remove internal scatter checks.',
    finalDisposition: 'Collapse knob-removal scatter into fewer public-surface assertions.',
  }],
  ['src/features/settings-authority/tests/runtimeSettingsValueTypesSsot.test.js', {
    why: 'This is another registry-derivation mirror over an internal type map rather than a user-facing boundary.',
    replaceWith: 'Cover value typing through the runtime settings API/serialization boundary.',
    finalDisposition: 'Collapse internal type-map SSOT coverage into boundary-level settings contracts.',
  }],
  ['tools/gui-react/src/registries/__tests__/pageRegistryContract.test.js', {
    why: 'One registry file drives multiple derived surfaces, but the current test re-proves each derivation separately.',
    replaceWith: 'One registry shape contract plus one route exposure test.',
    finalDisposition: 'Collapse derived tab/route duplication into a smaller page-registry contract.',
  }],
  ['tools/gui-react/src/features/studio/workbench/__tests__/systemMappingCoverage.test.js', {
    why: 'Field-map, tooltip, dead-knob, and parser coverage are bundled as broad drift checks over one mapping surface.',
    replaceWith: 'One public mapping contract plus one tooltip-format contract.',
    finalDisposition: 'Collapse broad coverage assertions into focused behavior contracts.',
  }],
]);

const collapseRules = [
  {
    test: (file) => /src\/features\/review\/domain\/tests\/componentReviewDataLaneState\./i.test(file),
    why: 'This state surface is split into many narrow files that all prove slices of the same review-lane contract.',
    replaceWith: 'Table-driven review-lane boundary tests around candidate selection, metadata, layout, and variance state.',
    finalDisposition: 'Collapse the lane-state cluster into a few stronger boundary fixtures.',
  },
  {
    test: (file) => /src\/indexlab\/tests\/searchPlanningContext\./i.test(file),
    why: 'The planner context contract is fragmented across structure, ordering, metrics, tiers, unions, and catalog slices.',
    replaceWith: 'A smaller set of end-to-end planner-context fixtures that prove whole-flow outputs.',
    finalDisposition: 'Collapse search-planning context shards into flow-level contracts.',
  },
  {
    test: (file) => /src\/api\/tests\/reviewGridStateRuntime\./i.test(file),
    why: 'These files cover one review-grid state machine through multiple narrow helper-focused entry points.',
    replaceWith: 'One state-machine contract suite at the public review-grid mutation boundary.',
    finalDisposition: 'Collapse review-grid runtime shards into fewer state-transition tests.',
  },
  {
    test: (file) => /src\/features\/indexing\/api\/builders\/tests\/searchPlanPrefetchLiveWiring\./i.test(file),
    why: 'The same live prefetch builder is exercised through several narrowly partitioned event variants.',
    replaceWith: 'One builder contract for snapshot/needset supersession plus one runtime validation flow when edits are made.',
    finalDisposition: 'Collapse event-variant fragmentation in the live prefetch wiring cluster.',
  },
  {
    test: (file) => /tools\/gui-react\/src\/features\/studio\/state\/__tests__\/studioPage/i.test(file),
    why: 'The studio page state surface is split across many controller/view/derived-state contracts that appear to overlap heavily.',
    replaceWith: 'A smaller page-state contract suite organized by major user workflows.',
    finalDisposition: 'Collapse studio page fragmentation into workflow-level state tests.',
  },
  {
    test: (file) => /tools\/gui-react\/src\/features\/llm-config\/state\/__tests__\/llmModelDropdownOptions\./i.test(file),
    why: 'Dropdown derivation behavior is partitioned into several narrow merge/sort/filter contracts.',
    replaceWith: 'One table-driven dropdown contract.',
    finalDisposition: 'Collapse dropdown option derivation shards.',
  },
  {
    test: (file) => /tools\/gui-react\/src\/features\/runtime-ops\/selectors\/__tests__\/searchResultsHelpers\./i.test(file),
    why: 'Helper coverage is fragmented across one selector family with overlapping inputs and outputs.',
    replaceWith: 'One table-driven selector contract.',
    finalDisposition: 'Collapse helper shards into a single selector contract.',
  },
  {
    test: (file) => /src\/features\/review\/domain\/tests\/reviewGridData\./i.test(file),
    why: 'The review-grid data surface is spread across payload, layout, identity, product artifact, and field-state files.',
    replaceWith: 'A smaller set of review-grid payload contracts centered on user-visible rows and mutations.',
    finalDisposition: 'Collapse duplicated review-grid data coverage.',
  },
  {
    test: (file) => /src\/features\/review\/domain\/tests\/keyReviewState\./i.test(file),
    why: 'Key-review state behavior is fragmented across several small tests around one state contract.',
    replaceWith: 'One table-driven key-review state contract.',
    finalDisposition: 'Collapse key-review state shards.',
  },
];

const deferRules = [
  {
    test: (file) => /characterization/i.test(file),
    why: 'Characterization tests lock current behavior but do not explain the enduring contract well enough to safely retire or consolidate yet.',
    finalDisposition: 'Defer until the protected behavior is restated as a smaller explicit contract.',
  },
  {
    test: (file) => /golden/i.test(file),
    why: 'Golden-master tests are holdover proof while the runtime shape is in flux.',
    finalDisposition: 'Defer until the golden snapshot is replaced with narrower behavior contracts.',
  },
  {
    test: (file) => /src\/features\/indexing\/api\/builders\/tests\/eventProcessingEngine\.test\.js$/i.test(file),
    why: 'This runtime-ops golden master is explicitly a migration holdover for an engine refactor.',
    finalDisposition: 'Defer until the builder migration lands and the final public panel contract is restated.',
  },
];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function listTestFiles() {
  const args = ['--files'];
  for (const glob of TEST_GLOBS) {
    args.push('-g', glob);
  }
  args.push('.');
  const output = execFileSync('rg', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((row) => toPosix(row))
    .map((row) => row.replace(/^\.\//, ''))
    .sort();
}

function majorArea(file) {
  const parts = file.split('/');
  if (parts[0] === 'tools' && parts[1] === 'gui-react') {
    return parts.slice(0, Math.min(parts.length - 1, 4)).join('/');
  }
  return parts.slice(0, Math.min(parts.length - 1, 3)).join('/');
}

function clusterKey(file) {
  const dir = path.posix.dirname(file);
  const base = path.posix.basename(file)
    .replace(/\.(test|spec)\.[^.]+$/, '')
    .replace(/\.(test|spec)$/, '');
  const prefix = base.split('.')[0];
  return `${dir}/${prefix}`;
}

function dominantBucket(rows) {
  const counts = new Map();
  for (const row of rows) {
    counts.set(row.bucket, (counts.get(row.bucket) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return BUCKET_ORDER[a[0]] - BUCKET_ORDER[b[0]];
    })[0][0];
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function buildTags(file, text, clusterCount) {
  const tags = [];
  if (/(e2e\/|runtime|live|browser|queue|routing|orchestration|fetch|search|ops|publish|pipeline|gui|review|api|process|worker|websocket)/i.test(file)) {
    tags.push('runtime-critical');
  }
  if (/contract|contracts|roundtrip|schema/i.test(file)) {
    tags.push('contract');
  }
  if (/wiring/i.test(file)) {
    tags.push('wiring');
  }
  if (/parity|coverage|completeness|ssot|guard|drift/i.test(file)) {
    tags.push('drift-guard');
  }
  if (/characterization|golden/i.test(file)) {
    tags.push('characterization');
  }
  if (/readFileSync|readFile\(/.test(text)) {
    tags.push('artifact-read');
  }
  if (/loadBundledModule|pathToFileURL/.test(text)) {
    tags.push('module-contract');
  }
  if (clusterCount > 1) {
    tags.push(`cluster:${clusterCount}`);
  }
  return uniqueSorted(tags);
}

function classify(file, text, clusterCount) {
  const tags = buildTags(file, text, clusterCount);

  if (exactRetire.has(file)) {
    const entry = exactRetire.get(file);
    return {
      bucket: 'RETIRE',
      why: entry.why,
      replaceWith: entry.replaceWith,
      finalDisposition: entry.finalDisposition,
      tags,
    };
  }

  for (const rule of deferRules) {
    if (rule.test(file, text, clusterCount)) {
      return {
        bucket: 'DEFER',
        why: rule.why,
        replaceWith: 'Keep current proof in place until a smaller explicit contract is designed and characterized behavior is restated.',
        finalDisposition: rule.finalDisposition,
        tags,
      };
    }
  }

  if (exactCollapse.has(file)) {
    const entry = exactCollapse.get(file);
    return {
      bucket: 'COLLAPSE',
      why: entry.why,
      replaceWith: entry.replaceWith,
      finalDisposition: entry.finalDisposition,
      tags,
    };
  }

  for (const rule of collapseRules) {
    if (rule.test(file, text, clusterCount)) {
      return {
        bucket: 'COLLAPSE',
        why: rule.why,
        replaceWith: rule.replaceWith,
        finalDisposition: rule.finalDisposition,
        tags,
      };
    }
  }

  return {
    bucket: 'KEEP',
    why: tags.includes('runtime-critical')
      ? 'Protects runtime behavior, external contract, orchestration, or a user-visible workflow.'
      : 'Protects a meaningful contract, artifact, or domain behavior without obvious duplication.',
    replaceWith: 'No replacement required in this audit pass.',
    finalDisposition: 'Keep as-is.',
    tags,
  };
}

function makePriorityMove(title, match, recommendation, reason, rows) {
  const matching = rows.filter((row) => match(row.path));
  return {
    title,
    files: matching.length,
    buckets: Object.fromEntries(
      ['RETIRE', 'COLLAPSE', 'DEFER', 'KEEP']
        .map((bucket) => [bucket, matching.filter((row) => row.bucket === bucket).length])
        .filter(([, count]) => count > 0),
    ),
    reason,
    recommendation,
    samplePaths: matching.slice(0, 6).map((row) => row.path),
  };
}

const files = listTestFiles();
const clusterCounts = new Map();
for (const file of files) {
  const key = clusterKey(file);
  clusterCounts.set(key, (clusterCounts.get(key) || 0) + 1);
}

const fileContents = new Map(
  await Promise.all(
    files.map(async (file) => {
      const absolute = path.join(repoRoot, file);
      const text = await fs.readFile(absolute, 'utf8');
      return [file, text];
    }),
  ),
);

const rows = files.map((file) => {
  const text = fileContents.get(file) || '';
  const clusterCount = clusterCounts.get(clusterKey(file)) || 1;
  const result = classify(file, text, clusterCount);
  return {
    path: file,
    area: majorArea(file),
    cluster: clusterKey(file),
    bucket: result.bucket,
    why: result.why,
    replaceWith: result.replaceWith,
    proof: 'Audit-only classification from local repo state. No test deletions, rewrites, or live validation were executed in this pass.',
    finalDisposition: result.finalDisposition,
    tags: result.tags,
  };
});

rows.sort((a, b) => {
  const bucketDelta = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
  if (bucketDelta !== 0) return bucketDelta;
  return a.path.localeCompare(b.path);
});

const summary = {
  total: rows.length,
  counts: {
    KEEP: rows.filter((row) => row.bucket === 'KEEP').length,
    COLLAPSE: rows.filter((row) => row.bucket === 'COLLAPSE').length,
    RETIRE: rows.filter((row) => row.bucket === 'RETIRE').length,
    DEFER: rows.filter((row) => row.bucket === 'DEFER').length,
  },
  runtimeCritical: rows.filter((row) => row.tags.includes('runtime-critical')).length,
  driftGuards: rows.filter((row) => row.tags.includes('drift-guard')).length,
  characterizationHoldovers: rows.filter((row) => row.tags.includes('characterization')).length,
  artifactReadTests: rows.filter((row) => row.tags.includes('artifact-read')).length,
};

const areaCounts = new Map();
for (const row of rows) {
  areaCounts.set(row.area, (areaCounts.get(row.area) || 0) + 1);
}

const clusterRows = new Map();
for (const row of rows) {
  if (!clusterRows.has(row.cluster)) {
    clusterRows.set(row.cluster, []);
  }
  clusterRows.get(row.cluster).push(row);
}

const topClusters = [...clusterRows.entries()]
  .map(([cluster, clusterItems]) => ({
    cluster,
    count: clusterItems.length,
    bucket: dominantBucket(clusterItems),
    paths: clusterItems.map((row) => row.path),
  }))
  .filter((entry) => entry.count > 1)
  .sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
  })
  .slice(0, 24);

const priorityMoves = [
  makePriorityMove(
    'Collapse review lane-state shards',
    (file) => /componentReviewDataLaneState\./i.test(file),
    'Replace with 4-6 table-driven boundary tests around lane payloads, candidate selection, metadata, and layout.',
    'This is the single largest fragmented cluster in the suite and the strongest surface-reduction target.',
    rows,
  ),
  makePriorityMove(
    'Collapse planner/search-context shards',
    (file) => /searchPlanningContext\.|searchPlanPrefetchLiveWiring\./i.test(file),
    'Consolidate into whole-flow planner fixtures plus one runtime validation path when live behavior changes.',
    'Planner coverage is split across many closely related output slices.',
    rows,
  ),
  makePriorityMove(
    'Collapse review-grid state/data duplication',
    (file) => /reviewGridStateRuntime\.|reviewGridData\.|keyReviewState\./i.test(file),
    'Move to smaller state-machine and payload-boundary suites.',
    'Review-grid behavior is covered through many helper-oriented files for the same state surfaces.',
    rows,
  ),
  makePriorityMove(
    'Collapse settings derivation scatter',
    (file) => /settingsRegistry|settingsDefaultsEnvSync|runtimeSettingsValueTypesSsot|generateManifestTypes|generateTypes|manifestRegistryDriftGuard|manifestStructuralGuard/i.test(file),
    'Keep one runtime settings API/config boundary contract and one UI exposure contract; retire internal mirror checks.',
    'Settings retirement and derivation coverage is spread across registry, manifest, payload, and generated surfaces.',
    rows,
  ),
  makePriorityMove(
    'Retire completed queue residue',
    (file) => /reviewGridData\.categoryQueueContracts\.test\.js$/i.test(file),
    'Delete after confirming no user-visible queue workflow depends on the empty internal builder.',
    'This file exists to freeze the absence of a retired internal queue enumerator, not to protect a live product workflow.',
    rows,
  ),
];

const data = {
  generatedAt: new Date().toISOString(),
  generatedFrom: 'docs/implementation/src-issues/generate-spec-factory-audit.mjs',
  repoRoot: toPosix(repoRoot),
  scope: {
    definition: 'Repo-wide runnable test files matching *.test.* or *.spec.* under src/, tools/, e2e/, and category_authority/.',
    inScopeTests: rows.length,
    outOfScope: [
      'Audit notes and .audit.md files',
      'node_modules/',
      'Non-test helper modules',
      'No production code changes in this pass',
    ],
  },
  status: {
    label: 'Classification complete / retirement execution deferred',
    detail: 'This pass classifies every in-scope runnable test file and updates the canonical audit artifact. No test files were deleted, rewritten, or live-validated here, so the implementation phase remains partially proven until the recommended collapses and retirements are actually executed.',
  },
  methodology: [
    'KEEP when a file protects runtime behavior, a real API/UI/config contract, or an external artifact contract without obvious duplication.',
    'COLLAPSE when several files prove the same surface through derivation, wiring, parity, or narrow shards of one state machine.',
    'RETIRE only when a file is clear completed-retirement residue that no longer protects a meaningful runtime or user-facing contract.',
    'DEFER for characterization and golden-master holdovers where the enduring contract is still unclear or actively in migration.',
  ],
  proof: [
    'Inventory proof: local rg-based scan over runnable test-file globs.',
    'Classification proof: every in-scope file received a bucket plus rationale, replacement guidance, proof note, and final disposition.',
    'Execution note: this is an audit-only documentation pass; no test-surface changes were applied, so there is no green-suite or live-validation claim here.',
  ],
  summary,
  byArea: [...areaCounts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 18),
  priorityMoves,
  topClusters,
  rows,
};

await fs.writeFile(outputJsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
await fs.writeFile(outputJsPath, `window.__SPEC_FACTORY_AUDIT__ = ${JSON.stringify(data, null, 2)};\n`, 'utf8');

console.log(`Wrote ${path.relative(repoRoot, outputJsonPath)}`);
console.log(`Wrote ${path.relative(repoRoot, outputJsPath)}`);
