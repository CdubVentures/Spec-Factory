import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_ROUTE_TYPE_FILE = 'tools/gui-react/src/types/llmSettings.ts';
const DEFAULT_OUTPUT_FILE = 'implementation/gui-persistence/04-LLM-ROUTE-FIELD-USAGE-AUDIT.json';
const EXCLUDED_ROUTE_KEYS = new Set(['id', 'category']);

export const DEFAULT_RUNTIME_USAGE_FILES = [
  'src/features/indexing/orchestration/shared/runtimeHelpers.js',
  'src/features/indexing/extraction/extractCandidatesLLM.js'
];

function resolveRepoPath(repoRoot, relativePath) {
  return path.resolve(repoRoot, relativePath);
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractLlmRouteFieldKeys({
  repoRoot = process.cwd(),
  typeFile = FRONTEND_ROUTE_TYPE_FILE
} = {}) {
  const typePath = resolveRepoPath(repoRoot, typeFile);
  const source = readUtf8(typePath);
  const interfaceMatch = source.match(/export interface LlmRouteRow\s*\{([\s\S]*?)\n\}/);
  if (!interfaceMatch) {
    throw new Error(`Unable to parse LlmRouteRow interface in ${typeFile}`);
  }
  const keys = interfaceMatch[1]
    .split(/\r?\n/)
    .map((line) => {
      const keyMatch = line.match(/^\s*([a-zA-Z0-9_]+)\??\s*:/);
      return keyMatch ? keyMatch[1] : '';
    })
    .filter(Boolean)
    .filter((key) => !EXCLUDED_ROUTE_KEYS.has(key));
  return [...new Set(keys)];
}

function collectKeyUsageInFile({ key, filePath, fileText }) {
  const escaped = escapeRegex(key);
  const linePatterns = [
    new RegExp(`\\?\\.\\s*${escaped}\\b`, 'g'),
    new RegExp(`\\.\\s*${escaped}\\b`, 'g'),
    new RegExp(`\\[\\s*['"]${escaped}['"]\\s*\\]`, 'g'),
    new RegExp(`(?:^|[,{\\s])(?:${escaped}|'${escaped}'|"${escaped}")\\s*:`, 'g')
  ];
  const lines = fileText.split(/\r?\n/);
  let matchCount = 0;
  const sampleLines = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineHitCount = linePatterns.reduce((total, pattern) => total + ((line.match(pattern) || []).length), 0);
    if (lineHitCount <= 0) {
      continue;
    }
    matchCount += lineHitCount;
    if (sampleLines.length < 10) {
      sampleLines.push(`${filePath}:${index + 1}: ${line.trim()}`);
    }
  }
  return {
    matchCount,
    sampleLines
  };
}

export function buildLlmRouteFieldUsageAudit({
  repoRoot = process.cwd(),
  runtimeUsageFiles = DEFAULT_RUNTIME_USAGE_FILES
} = {}) {
  const keys = extractLlmRouteFieldKeys({ repoRoot });
  const runtimeFiles = (Array.isArray(runtimeUsageFiles) ? runtimeUsageFiles : [])
    .map((filePath) => String(filePath || '').trim())
    .filter(Boolean);
  const runtimeFileContents = runtimeFiles.map((filePath) => ({
    filePath,
    text: readUtf8(resolveRepoPath(repoRoot, filePath))
  }));

  const results = keys
    .map((key) => {
      const matchesByFile = {};
      const sampleRuntimeMatches = [];
      let totalMatchesInRuntimeFiles = 0;
      for (const runtimeFile of runtimeFileContents) {
        const usage = collectKeyUsageInFile({
          key,
          filePath: runtimeFile.filePath,
          fileText: runtimeFile.text
        });
        matchesByFile[runtimeFile.filePath] = usage.matchCount;
        totalMatchesInRuntimeFiles += usage.matchCount;
        for (const sample of usage.sampleLines) {
          if (sampleRuntimeMatches.length >= 12) {
            break;
          }
          sampleRuntimeMatches.push(sample);
        }
      }
      return {
        key,
        totalMatchesInRuntimeFiles,
        matchesByFile,
        sampleRuntimeMatches
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  const dormantKeys = results
    .filter((row) => Number(row.totalMatchesInRuntimeFiles || 0) === 0)
    .map((row) => row.key);

  return {
    generatedAt: new Date().toISOString(),
    keysCount: keys.length,
    runtimeFiles,
    dormantKeys,
    results
  };
}

export function writeLlmRouteFieldUsageAudit({
  repoRoot = process.cwd(),
  outputFile = DEFAULT_OUTPUT_FILE,
  runtimeUsageFiles = DEFAULT_RUNTIME_USAGE_FILES
} = {}) {
  const outputPath = resolveRepoPath(repoRoot, outputFile);
  const audit = buildLlmRouteFieldUsageAudit({
    repoRoot,
    runtimeUsageFiles
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  return {
    outputFile,
    outputPath,
    audit
  };
}
