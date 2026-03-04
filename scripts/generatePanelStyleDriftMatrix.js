import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const pagesRoot = path.resolve('tools/gui-react/src/pages');
const snapshotPath = path.resolve('implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json');
const matrixPath = path.resolve('implementation/ui-styling-system-standardization/panel-style-drift-matrix.md');
const shouldWrite = process.argv.includes('--write');

const IMPORT_PATTERN = /\bimport\s+(?:type\s+)?(?:[^'";]+from\s+)?['"]([^'"]+)['"]/g;
const SF_TOKEN_PATTERN = /\bsf-[a-z0-9-]+\b/g;
const COLOR_UTILITY_PATTERN = /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const RADIUS_TOKEN_PATTERN = /\brounded(?:-[a-z0-9]+|\[[^\]]+\])?/g;

function toPosixPath(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function titleCase(text) {
  return text
    .split(/[-_/]+/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function isSurfaceFile(filePath) {
  const rel = toPosixPath(filePath);
  const base = path.basename(filePath);
  if (!rel.startsWith('tools/gui-react/src/pages/')) return false;
  if (!base.endsWith('.tsx')) return false;
  if (base.endsWith('helpers.tsx')) return false;
  if (base === 'workbenchColumns.tsx') return false;
  if (rel.includes('/components/')) return false;
  return true;
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.jsx'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    if (!fs.statSync(candidate).isFile()) continue;
    if (!candidate.includes(`${path.sep}tools${path.sep}gui-react${path.sep}src${path.sep}`)) continue;
    return path.normalize(candidate);
  }
  return null;
}

function collectImports(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const imports = new Set();
  for (const match of text.matchAll(IMPORT_PATTERN)) {
    const resolved = resolveImport(filePath, match[1]);
    if (!resolved) continue;
    imports.add(resolved);
  }
  return [...imports].sort();
}

function collectSecondLevelImports(directImports, rootFile) {
  const secondLevel = new Set();
  const rootAbs = path.normalize(rootFile);
  const directSet = new Set(directImports.map((item) => path.normalize(item)));
  for (const importPath of directImports) {
    const nextImports = collectImports(importPath);
    for (const nestedImport of nextImports) {
      const nestedAbs = path.normalize(nestedImport);
      if (nestedAbs === rootAbs) continue;
      if (directSet.has(nestedAbs)) continue;
      secondLevel.add(nestedAbs);
    }
  }
  return [...secondLevel].sort();
}

function collectMetrics(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const sfCount = (text.match(SF_TOKEN_PATTERN) || []).length;
  const colorMatches = text.match(COLOR_UTILITY_PATTERN) || [];
  const colorCount = colorMatches.length;
  const colorUniqueCount = new Set(colorMatches).size;
  const roundedTokens = [...new Set(text.match(RADIUS_TOKEN_PATTERN) || [])].sort();
  return { sfCount, colorCount, colorUniqueCount, roundedTokens };
}

function classifyDrift(metrics) {
  if (metrics.colorCount <= 2 && metrics.roundedTokens.length <= 3 && metrics.sfCount >= 20) return 'aligned';
  if (metrics.colorCount === 0 && metrics.roundedTokens.length <= 2 && metrics.sfCount >= 5) return 'aligned';
  if (metrics.colorCount <= 15) return 'low';
  if (metrics.colorCount <= 60) return 'moderate';
  return 'high';
}

function groupRowsBySection(rows) {
  return rows.reduce((acc, row) => {
    const current = acc.get(row.section) || [];
    current.push(row);
    acc.set(row.section, current);
    return acc;
  }, new Map());
}

function buildRows() {
  const surfaceFiles = walk(pagesRoot)
    .filter(isSurfaceFile)
    .sort();

  return surfaceFiles.map((surfacePath) => {
    const relativeToPages = path.relative(pagesRoot, surfacePath).split(path.sep).join('/');
    const section = relativeToPages.includes('/') ? relativeToPages.split('/')[0] : 'root';
    const directImports = collectImports(surfacePath);
    const secondLevelImports = collectSecondLevelImports(directImports, surfacePath);
    const metrics = collectMetrics(surfacePath);
    const driftGrade = classifyDrift(metrics);
    return {
      section,
      surface: toPosixPath(surfacePath),
      directImports: directImports.map((item) => toPosixPath(item)),
      secondLevelImports: secondLevelImports.map((item) => toPosixPath(item)),
      metrics,
      driftGrade,
      status: driftGrade === 'aligned' ? 'aligned' : 'needs tuning',
    };
  });
}

function buildSnapshot(rows) {
  const counts = rows.reduce(
    (acc, row) => {
      acc[row.driftGrade] += 1;
      return acc;
    },
    { aligned: 0, low: 0, moderate: 0, high: 0 },
  );

  return {
    generatedAt: new Date().toISOString(),
    scope: 'Full page-and-panel style drift inventory with two-level nested component dependency expansion.',
    surfacesAnalyzed: rows.length,
    summary: counts,
    rows,
  };
}

function buildMarkdown(rows, snapshot) {
  const groups = groupRowsBySection(rows);
  const orderedSections = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const hotSpots = [...rows]
    .filter((row) => row.driftGrade === 'high')
    .sort((a, b) => b.metrics.colorCount - a.metrics.colorCount)
    .slice(0, 12);

  const lines = [];
  lines.push('# Panel Style Drift Matrix');
  lines.push('');
  lines.push(`Generated: ${snapshot.generatedAt.slice(0, 10)}`);
  lines.push('');
  lines.push('Scope: full side-by-side panel inventory across `tools/gui-react/src/pages`, including direct and second-level nested components plus style-drift metrics.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Total surfaces | Aligned | Low drift | Moderate drift | High drift |');
  lines.push('| --- | --- | --- | --- | --- |');
  lines.push(`| ${snapshot.surfacesAnalyzed} | ${snapshot.summary.aligned} | ${snapshot.summary.low} | ${snapshot.summary.moderate} | ${snapshot.summary.high} |`);
  lines.push('');
  lines.push('## Highest Drift Surfaces');
  lines.push('');
  lines.push('| Surface | Raw color refs | Unique raw colors | `sf-*` refs | Radius tokens | Drift grade |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  if (hotSpots.length === 0) {
    lines.push('| - | - | - | - | - | - |');
  } else {
    for (const row of hotSpots) {
      const radius = row.metrics.roundedTokens.length === 0 ? '-' : row.metrics.roundedTokens.join(', ');
      lines.push(`| ${row.surface} | ${row.metrics.colorCount} | ${row.metrics.colorUniqueCount} | ${row.metrics.sfCount} | ${radius} | ${row.driftGrade} |`);
    }
  }
  lines.push('');

  for (const section of orderedSections) {
    const sectionRows = groups.get(section) || [];
    const sectionLabel = titleCase(section);
    lines.push(`## ${sectionLabel}`);
    lines.push('');
    lines.push('| Surface | Direct nested components | Second-level nested components | Drift signal | Status |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const row of sectionRows) {
      const radius = row.metrics.roundedTokens.length === 0 ? '-' : row.metrics.roundedTokens.join(', ');
      const signal = `sf=${row.metrics.sfCount}, rawColor=${row.metrics.colorCount}, rawColorUnique=${row.metrics.colorUniqueCount}, radius=[${radius}], grade=${row.driftGrade}`;
      const direct = row.directImports.length === 0 ? '-' : row.directImports.join('<br>');
      const secondLevel = row.secondLevelImports.length === 0 ? '-' : row.secondLevelImports.join('<br>');
      lines.push(`| ${row.surface} | ${direct} | ${secondLevel} | ${signal} | ${row.status} |`);
    }
    lines.push('');
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('- This matrix is generated from source imports and class-token scans, not manual curation.');
  lines.push('- `rawColor` counts indicate residual utility-color density and are used as the primary drift heat signal.');
  lines.push('- Use this table as the single panel-by-panel backlog for migration waves.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const rows = buildRows();
  const snapshot = buildSnapshot(rows);
  const markdown = buildMarkdown(rows, snapshot);

  if (shouldWrite) {
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    fs.writeFileSync(matrixPath, markdown, 'utf8');
    console.log(`Updated ${toPosixPath(snapshotPath)} and ${toPosixPath(matrixPath)}`);
    return;
  }

  console.log(markdown);
}

main();
