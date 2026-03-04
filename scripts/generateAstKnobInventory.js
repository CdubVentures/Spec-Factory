import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';
import { fileURLToPath } from 'node:url';

const ENV_PARSER_FUNCTIONS = new Set([
  'parseIntEnv',
  'parseFloatEnv',
  'parseBoolEnv',
  'parseJsonEnv',
]);

const KNOB_NAME_TOKENS = [
  'MAX',
  'MIN',
  'THRESHOLD',
  'WEIGHT',
  'BONUS',
  'PENALTY',
  'CAP',
  'LIMIT',
  'RETRY',
  'TIMEOUT',
  'CONCURRENCY',
  'TTL',
  'DELAY',
  'BUDGET',
  'ROUND',
  'SCORE',
  'CONFIDENCE',
  'ENABLED',
  'MODE',
];

function isDirectory(entry) {
  return entry && entry.isDirectory();
}

function isJavaScriptFile(filePath) {
  return filePath.endsWith('.js');
}

function listFilesRecursive(rootDir, predicate) {
  const output = [];
  function visit(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (isDirectory(entry)) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'gui-dist') {
          continue;
        }
        visit(fullPath);
        continue;
      }
      if (predicate(fullPath)) {
        output.push(fullPath);
      }
    }
  }
  visit(rootDir);
  return output;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (ch === '\r') continue;
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseTuningTokens(tuningCsvText) {
  const text = String(tuningCsvText || '').replace(/^\uFEFF/, '');
  const rows = parseCsv(text);
  const header = rows[0] || [];
  const phaseIndex = header.indexOf('Phase');
  const optionIndex = header.indexOf('Tuning Option');
  const currentIndex = header.indexOf('Current Setting');
  const summaryIndex = header.indexOf('Summary');
  const tokens = new Set();
  for (const row of rows.slice(1)) {
    const phase = String(row[phaseIndex] || '').trim();
    if (!phase || phase.startsWith('#')) continue;
    const option = String(row[optionIndex] || '').trim();
    const current = String(row[currentIndex] || '').trim();
    const summary = String(row[summaryIndex] || '').trim();
    if (/^[A-Z][A-Z0-9_]+$/.test(option)) {
      tokens.add(option);
    }
    const blob = `${current} ${summary}`;
    for (const match of blob.matchAll(/\benv:\s*([A-Z0-9_]+)/g)) {
      tokens.add(match[1]);
    }
    for (const match of blob.matchAll(/planned env:\s*([A-Z0-9_]+)/g)) {
      tokens.add(match[1]);
    }
  }
  return tokens;
}

function isAstNode(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.type === 'string';
}

function walkAst(node, parent, visit) {
  if (!isAstNode(node)) return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        walkAst(child, node, visit);
      }
      continue;
    }
    if (isAstNode(value)) {
      walkAst(value, node, visit);
    }
  }
}

function getMemberPropertyName(node) {
  if (!node || node.type !== 'MemberExpression') return null;
  if (node.computed) {
    if (node.property && node.property.type === 'Literal' && typeof node.property.value === 'string') {
      return node.property.value;
    }
    return null;
  }
  if (node.property && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return null;
}

function getProcessEnvKey(node) {
  if (!node || node.type !== 'MemberExpression') return null;
  const object = node.object;
  if (!object || object.type !== 'MemberExpression') return null;
  const baseObject = object.object;
  const baseProperty = getMemberPropertyName(object);
  if (!baseObject || baseObject.type !== 'Identifier' || baseObject.name !== 'process') return null;
  if (baseProperty !== 'env') return null;
  return getMemberPropertyName(node);
}

function isUpperSnake(value) {
  return /^[A-Z][A-Z0-9_]+$/.test(String(value || ''));
}

function isKnobLikeConstantName(name) {
  if (!isUpperSnake(name)) return false;
  return KNOB_NAME_TOKENS.some((token) => name.includes(token));
}

function normalizeFilePath(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}

function addOccurrence(map, key, occurrence) {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      name: key,
      occurrences: [occurrence],
    });
    return;
  }
  existing.occurrences.push(occurrence);
}

function sortOccurrences(occurrences) {
  return [...occurrences].sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });
}

function buildInventoryRows(map, inTuningSet) {
  return [...map.values()]
    .map((row) => ({
      name: row.name,
      inTuningCsv: inTuningSet.has(row.name),
      occurrenceCount: row.occurrences.length,
      occurrences: sortOccurrences(row.occurrences),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function parseFileToAst(filePath, parseErrors) {
  const source = fs.readFileSync(filePath, 'utf8');
  try {
    return parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      allowHashBang: true,
    });
  } catch (error) {
    parseErrors.push({
      file: filePath.replaceAll('\\', '/'),
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function generateAstKnobInventory({ repoRoot }) {
  const sourceRoot = path.join(repoRoot, 'src');
  const tuningCsvPath = path.join(repoRoot, 'implementation', 'ai-indexing-plans', 'tuning.csv');
  const tuningTokens = parseTuningTokens(fs.readFileSync(tuningCsvPath, 'utf8'));
  const files = listFilesRecursive(sourceRoot, isJavaScriptFile);
  const envKnobMap = new Map();
  const constantKnobMap = new Map();
  const parseErrors = [];

  for (const filePath of files) {
    const ast = parseFileToAst(filePath, parseErrors);
    if (!ast) continue;
    const relPath = normalizeFilePath(repoRoot, filePath);
    walkAst(ast, null, (node, parent) => {
      if (
        node.type === 'CallExpression' &&
        node.callee &&
        node.callee.type === 'Identifier' &&
        ENV_PARSER_FUNCTIONS.has(node.callee.name)
      ) {
        const firstArg = node.arguments[0];
        if (firstArg && firstArg.type === 'Literal' && typeof firstArg.value === 'string' && isUpperSnake(firstArg.value)) {
          addOccurrence(envKnobMap, firstArg.value, {
            file: relPath,
            line: firstArg.loc?.start.line || 0,
            column: firstArg.loc?.start.column || 0,
            detector: 'parse-env-call',
          });
        }
      }

      const processEnvKey = getProcessEnvKey(node);
      if (processEnvKey && isUpperSnake(processEnvKey)) {
        addOccurrence(envKnobMap, processEnvKey, {
          file: relPath,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          detector: 'process-env-member',
        });
      }

      if (
        node.type === 'VariableDeclarator' &&
        parent &&
        parent.type === 'VariableDeclaration' &&
        parent.kind === 'const' &&
        node.id &&
        node.id.type === 'Identifier' &&
        node.init &&
        isKnobLikeConstantName(node.id.name)
      ) {
        const constantId = `${relPath}#${node.id.name}`;
        addOccurrence(constantKnobMap, constantId, {
          file: relPath,
          line: node.id.loc?.start.line || 0,
          column: node.id.loc?.start.column || 0,
          detector: 'const-declaration',
        });
      }
    });
  }

  const envKnobs = buildInventoryRows(envKnobMap, tuningTokens);
  const constantKnobs = [...constantKnobMap.values()]
    .map((row) => {
      const constantName = row.name.split('#').pop() || row.name;
      return {
        id: row.name,
        name: constantName,
        inTuningCsv: tuningTokens.has(constantName),
        occurrenceCount: row.occurrences.length,
        occurrences: sortOccurrences(row.occurrences),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const envMissingFromTuning = envKnobs.filter((row) => !row.inTuningCsv);
  const constantMissingFromTuning = constantKnobs.filter((row) => !row.inTuningCsv);

  return {
    schemaVersion: 1,
    roots: {
      sourceRoot: normalizeFilePath(repoRoot, sourceRoot),
      tuningCsv: normalizeFilePath(repoRoot, tuningCsvPath),
    },
    summary: {
      scannedFileCount: files.length,
      parseErrorCount: parseErrors.length,
      tuningTokenCount: tuningTokens.size,
      envKnobCount: envKnobs.length,
      envKnobsMissingFromTuningCount: envMissingFromTuning.length,
      constantKnobCount: constantKnobs.length,
      constantKnobsMissingFromTuningCount: constantMissingFromTuning.length,
      totalMissingFromTuningCount: envMissingFromTuning.length + constantMissingFromTuning.length,
    },
    parseErrors: parseErrors
      .map((row) => ({
        file: normalizeFilePath(repoRoot, row.file),
        message: row.message,
      }))
      .sort((a, b) => a.file.localeCompare(b.file)),
    envKnobs,
    envKnobsMissingFromTuning: envMissingFromTuning,
    constantKnobs,
    constantKnobsMissingFromTuning: constantMissingFromTuning,
  };
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runCli() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '..');
  const snapshotPath = path.join(
    repoRoot,
    'implementation',
    'ai-indexing-plans',
    'ast-knob-inventory.snapshot.json',
  );

  const args = new Set(process.argv.slice(2));
  const inventory = generateAstKnobInventory({ repoRoot });

  if (args.has('--write')) {
    writeJsonFile(snapshotPath, inventory);
    process.stdout.write(`[ast-knob-inventory] wrote ${normalizeFilePath(repoRoot, snapshotPath)}\n`);
  }

  if (args.has('--check')) {
    const expected = readJsonFile(snapshotPath);
    const pass = JSON.stringify(expected) === JSON.stringify(inventory);
    if (!pass) {
      process.stderr.write(
        '[ast-knob-inventory] snapshot mismatch. Run: node scripts/generateAstKnobInventory.js --write\n',
      );
      process.exitCode = 1;
      return;
    }
  }

  process.stdout.write(
    `[ast-knob-inventory] files=${inventory.summary.scannedFileCount} env=${inventory.summary.envKnobCount} constants=${inventory.summary.constantKnobCount} missing=${inventory.summary.totalMissingFromTuningCount}\n`,
  );
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && modulePath === invokedPath) {
  runCli();
}
