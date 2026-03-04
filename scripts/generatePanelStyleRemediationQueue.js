import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const snapshotPath = path.resolve('implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json');
const queuePath = path.resolve('implementation/ui-styling-system-standardization/panel-style-remediation-queue.md');
const shouldWrite = process.argv.includes('--write');

const DRIFT_WEIGHT = {
  high: 3,
  moderate: 2,
  low: 1,
  aligned: 0,
};

function toPosix(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function readSnapshot() {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`missing panel drift snapshot: ${toPosix(snapshotPath)}`);
  }
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
}

function compareRows(a, b) {
  if (DRIFT_WEIGHT[b.driftGrade] !== DRIFT_WEIGHT[a.driftGrade]) {
    return DRIFT_WEIGHT[b.driftGrade] - DRIFT_WEIGHT[a.driftGrade];
  }
  if (b.metrics.colorCount !== a.metrics.colorCount) {
    return b.metrics.colorCount - a.metrics.colorCount;
  }
  if (a.metrics.sfCount !== b.metrics.sfCount) {
    return a.metrics.sfCount - b.metrics.sfCount;
  }
  return a.surface.localeCompare(b.surface);
}

function estimateComplexity(row) {
  if (row.metrics.sfCount >= 40 && row.metrics.colorCount <= 140) return 'low';
  if (row.metrics.sfCount >= 20 && row.metrics.colorCount <= 220) return 'medium';
  return 'high';
}

function assignWave(row) {
  if (row.driftGrade === 'high' && row.metrics.sfCount >= 40) return 'wave-1';
  if (row.driftGrade === 'high') return 'wave-2';
  if (row.driftGrade === 'moderate' && row.metrics.sfCount >= 20) return 'wave-2';
  if (row.driftGrade === 'moderate') return 'wave-3';
  return 'wave-4';
}

function buildSectionSummary(rows) {
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.section) || {
      section: row.section,
      high: 0,
      moderate: 0,
      low: 0,
      aligned: 0,
      rawColor: 0,
      rawColorUnique: 0,
    };
    current[row.driftGrade] += 1;
    current.rawColor += row.metrics.colorCount;
    current.rawColorUnique += Number.isInteger(row.metrics.colorUniqueCount)
      ? row.metrics.colorUniqueCount
      : row.metrics.colorCount;
    map.set(row.section, current);
  }
  return [...map.values()].sort((a, b) => {
    if (b.high !== a.high) return b.high - a.high;
    if (b.rawColor !== a.rawColor) return b.rawColor - a.rawColor;
    return a.section.localeCompare(b.section);
  });
}

function buildWaveSummary(rows) {
  const map = new Map();
  for (const row of rows) {
    const wave = assignWave(row);
    const current = map.get(wave) || {
      wave,
      count: 0,
      rawColor: 0,
      rawColorUnique: 0,
      high: 0,
      moderate: 0,
      low: 0,
    };
    current.count += 1;
    current.rawColor += row.metrics.colorCount;
    current.rawColorUnique += Number.isInteger(row.metrics.colorUniqueCount)
      ? row.metrics.colorUniqueCount
      : row.metrics.colorCount;
    current[row.driftGrade] += 1;
    map.set(wave, current);
  }
  return [...map.values()].sort((a, b) => a.wave.localeCompare(b.wave));
}

function buildMarkdown(snapshot) {
  const candidateRows = snapshot.rows
    .filter((row) => row.driftGrade !== 'aligned')
    .sort(compareRows);
  const sectionSummary = buildSectionSummary(snapshot.rows);
  const waveSummary = buildWaveSummary(candidateRows);
  const queueRows = candidateRows.slice(0, 36);
  const generatedDate = snapshot.generatedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  const lines = [];
  lines.push('# Panel Style Remediation Queue');
  lines.push('');
  lines.push(`Generated: ${generatedDate}`);
  lines.push(`Snapshot: ${toPosix(snapshotPath)}`);
  lines.push('');
  lines.push('## Queue Contract');
  lines.push('');
  lines.push('- Prioritize by `driftGrade` then `rawColor` density.');
  lines.push('- Keep edits semantic (`sf-*` primitives and semantic token aliases only).');
  lines.push('- Lock every migrated slice with a targeted drift guard assertion.');
  lines.push('');
  lines.push('## Snapshot Summary');
  lines.push('');
  lines.push('| Total surfaces | Aligned | Low drift | Moderate drift | High drift |');
  lines.push('| --- | --- | --- | --- | --- |');
  lines.push(`| ${snapshot.surfacesAnalyzed} | ${snapshot.summary.aligned} | ${snapshot.summary.low} | ${snapshot.summary.moderate} | ${snapshot.summary.high} |`);
  lines.push('');
  lines.push('## Section Heat Ranking');
  lines.push('');
  lines.push('| Section | High | Moderate | Low | Aligned | Raw color refs | Unique raw colors |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const section of sectionSummary) {
    lines.push(`| ${section.section} | ${section.high} | ${section.moderate} | ${section.low} | ${section.aligned} | ${section.rawColor} | ${section.rawColorUnique} |`);
  }
  lines.push('');
  lines.push('## Wave Summary');
  lines.push('');
  lines.push('| Wave | Surfaces | High | Moderate | Low | Raw color refs | Unique raw colors |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const wave of waveSummary) {
    lines.push(`| ${wave.wave} | ${wave.count} | ${wave.high} | ${wave.moderate} | ${wave.low} | ${wave.rawColor} | ${wave.rawColorUnique} |`);
  }
  lines.push('');
  lines.push('## Ranked Remediation Queue');
  lines.push('');
  lines.push('| Rank | Surface | Section | Grade | Raw color refs | Unique raw colors | `sf-*` refs | Radius tokens | Suggested wave | Complexity |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  queueRows.forEach((row, index) => {
    const radius = row.metrics.roundedTokens.length === 0 ? '-' : row.metrics.roundedTokens.join(', ');
    const uniqueRawColors = Number.isInteger(row.metrics.colorUniqueCount)
      ? row.metrics.colorUniqueCount
      : row.metrics.colorCount;
    lines.push(`| ${index + 1} | ${row.surface} | ${row.section} | ${row.driftGrade} | ${row.metrics.colorCount} | ${uniqueRawColors} | ${row.metrics.sfCount} | ${radius} | ${assignWave(row)} | ${estimateComplexity(row)} |`);
  });
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- `wave-1` favors high-drift files already rich in `sf-*` usage for low-risk, high-yield cleanup.');
  lines.push('- `wave-2` targets the remaining high-drift set plus higher-density moderate files.');
  lines.push('- `wave-3/4` covers moderate and low residuals after high-drift burn down.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const snapshot = readSnapshot();
  const markdown = buildMarkdown(snapshot);

  if (!shouldWrite) {
    console.log(markdown);
    return;
  }

  fs.writeFileSync(queuePath, markdown, 'utf8');
  console.log(`Updated ${toPosix(queuePath)}`);
}

main();
