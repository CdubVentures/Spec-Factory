import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(
  ROOT,
  'docs',
  'implementation',
  'sql-full-migration',
  'schema-consolidation-plan.html'
);

const SURFACES = [
  {
    key: 'specdb',
    label: 'SpecDb',
    group: 'Primary',
    schemaFiles: ['src/db/specDbSchema.js'],
    description: 'Category-scoped runtime database backing the main SQL migration plan.',
  },
  {
    key: 'appdb',
    label: 'AppDb',
    group: 'Primary',
    schemaFiles: ['src/db/appDbSchema.js'],
    description: 'Global cross-category SQLite surface for brands, settings, and studio maps.',
  },
  {
    key: 'learning',
    label: 'Learning Stores',
    group: 'Auxiliary',
    schemaFiles: ['src/features/indexing/learning/learningStores.js'],
    description: 'Small auxiliary stores for lexicon, anchor, URL memory, and yield tracking.',
  },
  {
    key: 'enumstrict',
    label: 'Strict Enum Temp',
    group: 'Auxiliary',
    schemaFiles: ['src/db/stores/enumListStore.js'],
    description: 'Temporary strict-enum hardening table created during list-value cleanup.',
  },
];

const PRIMARY_PUBLIC_FILES = new Map([
  ['src/db/specDb.js', 'dot'],
  ['src/db/appDb.js', 'dot'],
  ['src/index/evidenceIndexDb.js', 'plain'],
  ['src/db/appDbSeed.js', 'plain'],
]);

const GENERIC_METHOD_STOPLIST = new Set([
  'constructor',
  'close',
  'counts',
  'isSeeded',
  'canonicalize',
  '_migrateTierColumns',
  '_evaluateConstraintExpr',
  '_ensureRow',
  'nowIso',
  'normalizeQuery',
  'makeQueryHash',
  'sha256Hex',
  'escapeFtsQuery',
]);

const CLASS_REFERENCE_TABLES = new Map([
  ['ComponentLexiconStore', ['learning:component_lexicon']],
  ['FieldAnchorsStore', ['learning:field_anchors']],
  ['UrlMemoryStore', ['learning:url_memory']],
  ['DomainFieldYieldStore', ['learning:domain_field_yield']],
]);

const CONSOLIDATION_NOTES = new Map([
  ['specdb:product_review_state', {
    recommendation: 'Delete',
    note: 'Previous consolidation plan marked this as orphaned.',
  }],
  ['specdb:data_authority_sync', {
    recommendation: 'Merge',
    note: 'Previous consolidation plan folds this into category_brain.',
  }],
  ['specdb:source_artifacts', {
    recommendation: 'Merge',
    note: 'Previous consolidation plan folds this into source_registry.',
  }],
  ['specdb:source_evidence_refs', {
    recommendation: 'Merge',
    note: 'Previous consolidation plan folds this into source_assertions.',
  }],
  ['specdb:key_review_runs', {
    recommendation: 'Merge',
    note: 'Previous consolidation plan folds this into key_review_state JSON payloads.',
  }],
  ['specdb:key_review_run_sources', {
    recommendation: 'Merge',
    note: 'Previous consolidation plan folds this into key_review_runs payloads.',
  }],
  ['specdb:key_review_audit', {
    recommendation: 'Merge',
    note: 'Previous consolidation plan folds this into key_review_state JSON payloads.',
  }],
  ['specdb:source_screenshots', {
    recommendation: 'Keep',
    note: 'Focused vertical table — separate from videos/PDFs by design.',
  }],
  ['specdb:source_videos', {
    recommendation: 'Keep',
    note: 'Focused vertical table — separate from screenshots/PDFs by design.',
  }],
  ['specdb:source_pdfs', {
    recommendation: 'Keep',
    note: 'Focused vertical table — separate from screenshots/videos by design.',
  }],
  ['specdb:bridge_events', {
    recommendation: 'Merge',
    note: 'Previous consolidation plan folds this into runtime_events/events.',
  }],
]);

function normalizeRel(relPath) {
  return relPath.replace(/\\/g, '/');
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
  const absolutePath = path.join(ROOT, relPath);
  try {
    const text = fs.readFileSync(absolutePath, 'utf8');
    if (text.includes('\u0000')) {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingle) {
      if (!escaped && char === "'") {
        inSingle = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inDouble) {
      if (!escaped && char === '"') {
        inDouble = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inTemplate) {
      if (!escaped && char === '`') {
        inTemplate = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    escaped = false;

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === "'") {
      inSingle = true;
      continue;
    }

    if (char === '"') {
      inDouble = true;
      continue;
    }

    if (char === '`') {
      inTemplate = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractDefinitions(relPath, text) {
  const definitions = [];
  const seen = new Set();

  const patterns = [
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g,
    /(?:^|\n)\s{2,}(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g,
    /(?:^|\n)\s*(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g,
  ];

  const blocked = new Set(['if', 'for', 'while', 'switch', 'catch']);

  for (const regex of patterns) {
    for (const match of text.matchAll(regex)) {
      const name = match[1];
      if (!name || blocked.has(name)) {
        continue;
      }
      const openIndex = text.indexOf('{', match.index + match[0].length - 1);
      if (openIndex < 0) {
        continue;
      }
      const closeIndex = findMatchingBrace(text, openIndex);
      if (closeIndex < 0) {
        continue;
      }
      const key = `${match.index}:${name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      definitions.push({
        file: relPath,
        name,
        start: match.index,
        body: text.slice(openIndex, closeIndex + 1),
      });
    }
  }

  return definitions.sort((left, right) => left.start - right.start);
}

function extractPreparedAliases(text, tableEntries) {
  const aliases = new Map();
  const aliasRegex = /(?:this\.)?([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(?:this\.)?db\.prepare\(/g;
  const matches = [...text.matchAll(aliasRegex)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const alias = match[1];
    const nextIndex = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const segment = text.slice(match.index, nextIndex);
    const refs = analyzeTextForAllTables(segment, tableEntries);
    if (refs.size > 0) {
      aliases.set(alias, refs);
    }
  }
  return aliases;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectKinds(text, tableName) {
  const escaped = escapeRegex(tableName);
  const kinds = new Set();

  const schemaRegex = new RegExp(
    `CREATE\\s+(?:VIRTUAL\\s+)?TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${escaped}\\b`,
    'i'
  );
  const insertRegex = new RegExp(
    `(?:INSERT(?:\\s+OR\\s+[A-Z_]+)?\\s+INTO|REPLACE\\s+INTO)\\s+${escaped}\\b`,
    'i'
  );
  const updateRegex = new RegExp(`UPDATE\\s+${escaped}\\b`, 'i');
  const deleteRegex = new RegExp(`DELETE\\s+FROM\\s+${escaped}\\b`, 'i');
  const fromRegex = new RegExp(`\\bFROM\\s+${escaped}\\b`, 'i');
  const joinRegex = new RegExp(`\\bJOIN\\s+${escaped}\\b`, 'i');
  const matchRegex = new RegExp(`\\b${escaped}\\b\\s+MATCH\\b`, 'i');
  const quotedRegex = new RegExp(`['"\`]${escaped}['"\`]`);
  const sqliteMasterRegex = new RegExp(`name\\s*=\\s*['"\`]${escaped}['"\`]`, 'i');

  if (schemaRegex.test(text)) {
    kinds.add('schema');
  }
  if (insertRegex.test(text) || updateRegex.test(text) || deleteRegex.test(text)) {
    kinds.add('write');
  }
  if (fromRegex.test(text) || joinRegex.test(text) || matchRegex.test(text) || sqliteMasterRegex.test(text)) {
    kinds.add('read');
  }
  if (quotedRegex.test(text) || kinds.size > 0) {
    kinds.add('mention');
  }

  return kinds;
}

function analyzeTextForAllTables(text, tableEntries) {
  const refs = new Map();
  for (const entry of tableEntries) {
    const kinds = detectKinds(text, entry.table);
    if (kinds.size > 0) {
      refs.set(entry.key, kinds);
    }
  }
  return refs;
}

function mergeKindMaps(target, source) {
  let changed = false;
  for (const [tableKey, kinds] of source.entries()) {
    let targetKinds = target.get(tableKey);
    if (!targetKinds) {
      targetKinds = new Set();
      target.set(tableKey, targetKinds);
    }
    for (const kind of kinds) {
      if (!targetKinds.has(kind)) {
        targetKinds.add(kind);
        changed = true;
      }
    }
  }
  return changed;
}

function applyMethodKindHeuristic(name, refs) {
  const lower = String(name || '').toLowerCase();
  const readPrefixes = ['get', 'list', 'load', 'find', 'search', 'query', 'has', 'build'];
  const writePrefixes = [
    'insert', 'upsert', 'set', 'update', 'delete', 'remove', 'record',
    'mark', 'sync', 'save', 'ensure', 'reset', 'purge', 'seed', 'clear',
  ];

  const isReadLike = readPrefixes.some((prefix) => lower.startsWith(prefix));
  const isWriteLike = writePrefixes.some((prefix) => lower.startsWith(prefix));

  if (isReadLike === isWriteLike) {
    return;
  }

  for (const kinds of refs.values()) {
    if (isReadLike) {
      kinds.delete('write');
      if (kinds.has('read')) {
        kinds.add('mention');
      }
    } else if (isWriteLike) {
      kinds.delete('read');
      if (kinds.has('write')) {
        kinds.add('mention');
      }
    }
  }
}

function getSurface(key) {
  return SURFACES.find((surface) => surface.key === key);
}

function buildLogicalTables(textByFile) {
  const tables = [];

  for (const surface of SURFACES) {
    for (const relPath of surface.schemaFiles) {
      const text = textByFile.get(relPath) || '';
      const createRegex = /(?:^|\n)\s*CREATE\s+(VIRTUAL\s+)?TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
      for (const match of text.matchAll(createRegex)) {
        const kind = match[1] ? 'virtual' : 'table';
        const table = match[2];
        const key = `${surface.key}:${table}`;
        if (tables.some((entry) => entry.key === key)) {
          continue;
        }
        tables.push({
          key,
          surfaceKey: surface.key,
          table,
          kind,
          primarySchemaFiles: new Set([relPath]),
          schemaFiles: new Set([relPath]),
          directReadFiles: new Set(),
          directWriteFiles: new Set(),
          mentionFiles: new Set(),
          indirectReadFiles: new Set(),
          indirectWriteFiles: new Set(),
          ambiguousTouchFiles: new Set(),
          readMethods: new Set(),
          writeMethods: new Set(),
        });
      }
    }
  }

  return tables;
}

function preferTableForFile(candidates, relPath, text) {
  if (candidates.length === 1) {
    return candidates[0];
  }

  const lower = relPath.toLowerCase();

  if (text.includes('AppDb') || text.includes('app.sqlite') || text.includes('appDb')) {
    const appCandidate = candidates.find((entry) => entry.surfaceKey === 'appdb');
    if (appCandidate) {
      return appCandidate;
    }
  }

  if (
    text.includes('SpecDb') ||
    text.includes('spec.sqlite') ||
    text.includes('specDb') ||
    text.includes('specDbDir')
  ) {
    const specCandidate = candidates.find((entry) => entry.surfaceKey === 'specdb');
    if (specCandidate) {
      return specCandidate;
    }
  }

  if (
    text.includes('evidence_chunks_fts') ||
    text.includes('indexDocument') ||
    text.includes('searchEvidenceByField') ||
    lower.includes('evidenceindex')
  ) {
    const specEvidence = candidates.find((entry) => entry.surfaceKey === 'specdb');
    if (specEvidence) {
      return specEvidence;
    }
  }

  if (
    text.includes('ComponentLexiconStore') ||
    text.includes('FieldAnchorsStore') ||
    text.includes('UrlMemoryStore') ||
    text.includes('DomainFieldYieldStore')
  ) {
    const learning = candidates.find((entry) => entry.surfaceKey === 'learning');
    if (learning) {
      return learning;
    }
  }

  return candidates[0];
}

function buildAliasMap(textByFile, tableEntries) {
  const aliases = new Map();
  for (const [relPath, text] of textByFile.entries()) {
    if (
      relPath === 'src/db/specDbStatements.js' ||
      relPath === 'src/db/appDb.js'
    ) {
      for (const [alias, refs] of extractPreparedAliases(text, tableEntries).entries()) {
        aliases.set(alias, refs);
      }
    }
  }
  return aliases;
}

function buildDefinitions(textByFile, tableEntries, aliasMap) {
  const relevantPrefixes = [
    'src/db/',
    'src/index/evidenceIndexDb.js',
    'src/features/indexing/learning/learningStores.js',
  ];

  const definitions = [];
  for (const [relPath, text] of textByFile.entries()) {
    if (!relevantPrefixes.some((prefix) => relPath.startsWith(prefix))) {
      continue;
    }
    definitions.push(...extractDefinitions(relPath, text));
  }

  for (const definition of definitions) {
    definition.refs = analyzeTextForAllTables(definition.body, tableEntries);
    for (const [alias, refs] of aliasMap.entries()) {
      const aliasRegex = new RegExp(`(?:\\.|\\b)${escapeRegex(alias)}\\b`);
      if (aliasRegex.test(definition.body)) {
        mergeKindMaps(definition.refs, refs);
      }
    }
  }

  const lookupDefinitions = definitions.filter((definition) => {
    if (GENERIC_METHOD_STOPLIST.has(definition.name)) {
      return false;
    }
    if (definition.name.startsWith('_')) {
      return false;
    }
    if (/^[A-Z]/.test(definition.name)) {
      return false;
    }
    if (definition.name.startsWith('create')) {
      return false;
    }
    return definition.refs.size > 0;
  });

  for (const definition of definitions) {
    for (const source of lookupDefinitions) {
      if (source.file === definition.file && source.start === definition.start) {
        continue;
      }
      const dotCallRegex = new RegExp(`\\.${escapeRegex(source.name)}\\s*\\(`);
      const sameFileCallRegex = new RegExp(`\\b${escapeRegex(source.name)}\\s*\\(`);
      if (
        dotCallRegex.test(definition.body) ||
        (source.file === definition.file && sameFileCallRegex.test(definition.body))
      ) {
        mergeKindMaps(definition.refs, source.refs);
      }
    }
    applyMethodKindHeuristic(definition.name, definition.refs);
  }

  return definitions;
}

function addDirectTouchData(tableEntries, textByFile) {
  const groupedByTable = new Map();
  for (const entry of tableEntries) {
    if (!groupedByTable.has(entry.table)) {
      groupedByTable.set(entry.table, []);
    }
    groupedByTable.get(entry.table).push(entry);
  }

  for (const [relPath, text] of textByFile.entries()) {
    for (const [tableName, candidates] of groupedByTable.entries()) {
      const kinds = detectKinds(text, tableName);
      if (kinds.size === 0) {
        continue;
      }
      const entry = preferTableForFile(candidates, relPath, text);
      if (kinds.has('schema')) {
        entry.schemaFiles.add(relPath);
      }
      if (kinds.has('write')) {
        entry.directWriteFiles.add(relPath);
      }
      if (kinds.has('read')) {
        entry.directReadFiles.add(relPath);
      }
      if (kinds.has('mention')) {
        entry.mentionFiles.add(relPath);
      }

      if (candidates.length > 1) {
        for (const candidate of candidates) {
          if (candidate.key !== entry.key) {
            candidate.ambiguousTouchFiles.add(relPath);
          }
        }
      }
    }
  }
}

function addIndirectTouchData(tableEntries, definitions, textByFile) {
  const publicDefinitions = definitions.filter((definition) => {
    const callStyle = PRIMARY_PUBLIC_FILES.get(definition.file);
    if (!callStyle) {
      return false;
    }
    if (GENERIC_METHOD_STOPLIST.has(definition.name) || definition.name.startsWith('_')) {
      return false;
    }
    return definition.refs.size > 0;
  });

  for (const definition of publicDefinitions) {
    const callStyle = PRIMARY_PUBLIC_FILES.get(definition.file);
    const pattern = callStyle === 'dot'
      ? new RegExp(`\\.${escapeRegex(definition.name)}\\s*\\(`)
      : new RegExp(`\\b${escapeRegex(definition.name)}\\s*\\(`);

    for (const [relPath, text] of textByFile.entries()) {
      if (relPath === definition.file) {
        continue;
      }
      if (!pattern.test(text)) {
        continue;
      }

      for (const [tableKey, kinds] of definition.refs.entries()) {
        const entry = tableEntries.find((item) => item.key === tableKey);
        if (!entry) {
          continue;
        }
        if (kinds.has('read')) {
          entry.indirectReadFiles.add(relPath);
          entry.readMethods.add(definition.name);
        }
        if (kinds.has('write')) {
          entry.indirectWriteFiles.add(relPath);
          entry.writeMethods.add(definition.name);
        }
      }
    }
  }

  for (const [className, tableKeys] of CLASS_REFERENCE_TABLES.entries()) {
    const pattern = new RegExp(`\\b${escapeRegex(className)}\\b`);
    for (const [relPath, text] of textByFile.entries()) {
      if (relPath === 'src/features/indexing/learning/learningStores.js') {
        continue;
      }
      if (!pattern.test(text)) {
        continue;
      }
      for (const tableKey of tableKeys) {
        const entry = tableEntries.find((item) => item.key === tableKey);
        if (entry) {
          entry.mentionFiles.add(relPath);
        }
      }
    }
  }
}

function collectExcludedSchemas(textByFile, tableEntries) {
  const knownNames = new Set(tableEntries.map((entry) => entry.table));
  const excluded = [];
  const createRegex = /(?:^|\n)\s*CREATE\s+(VIRTUAL\s+)?TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([A-Za-z_][A-Za-z0-9_]*)/gi;

  for (const [relPath, text] of textByFile.entries()) {
    for (const match of text.matchAll(createRegex)) {
      const tableName = match[2];
      const kind = match[1] ? 'virtual' : 'table';
      if (knownNames.has(tableName)) {
        continue;
      }
      excluded.push({
        file: relPath,
        table: tableName,
        kind,
      });
    }
  }

  return excluded.sort((left, right) => {
    if (left.table !== right.table) {
      return left.table.localeCompare(right.table);
    }
    return left.file.localeCompare(right.file);
  });
}

function sortSet(value) {
  return [...value].sort((left, right) => left.localeCompare(right));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pathListMarkup(items) {
  if (items.length === 0) {
    return '<div class="empty">None detected in the tracked scan.</div>';
  }
  return `<ul class="file-list">${items
    .map((item) => `<li><code>${escapeHtml(item)}</code></li>`)
    .join('')}</ul>`;
}

function badge(label, tone = 'neutral') {
  return `<span class="badge ${tone}">${escapeHtml(label)}</span>`;
}

function tableRecommendationMarkup(entry) {
  const note = CONSOLIDATION_NOTES.get(entry.key);
  if (!note) {
    return '';
  }
  const tone = note.recommendation === 'Delete'
    ? 'danger'
    : note.recommendation === 'Merge'
      ? 'warn'
      : 'neutral';
  return `
    <div class="recommendation">
      ${badge(note.recommendation, tone)}
      <span>${escapeHtml(note.note)}</span>
    </div>
  `;
}

function sectionMarkup(title, files, summary) {
  return `
    <div class="touch-section">
      <div class="touch-title">${escapeHtml(title)} <span>${escapeHtml(summary)}</span></div>
      ${pathListMarkup(files)}
    </div>
  `;
}

function renderTableCard(entry) {
  const primarySchemaFiles = sortSet(entry.primarySchemaFiles);
  const schemaFiles = sortSet(entry.schemaFiles);
  const directReadFiles = sortSet(entry.directReadFiles);
  const directWriteFiles = sortSet(entry.directWriteFiles);
  const indirectReadFiles = sortSet(entry.indirectReadFiles);
  const indirectWriteFiles = sortSet(entry.indirectWriteFiles);
  const ambiguousTouchFiles = sortSet(entry.ambiguousTouchFiles);
  const readMethods = sortSet(entry.readMethods);
  const writeMethods = sortSet(entry.writeMethods);
  const allTouches = new Set([
    ...schemaFiles,
    ...directReadFiles,
    ...directWriteFiles,
    ...indirectReadFiles,
    ...indirectWriteFiles,
    ...entry.mentionFiles,
  ]);
  const totalTouchFiles = sortSet(allTouches);
  const surface = getSurface(entry.surfaceKey);

  return `
    <details class="table-card">
      <summary>
        <div class="summary-left">
          <span class="table-name">${escapeHtml(entry.table)}</span>
          ${badge(entry.kind === 'virtual' ? 'FTS' : 'TABLE', entry.kind === 'virtual' ? 'info' : 'neutral')}
          ${badge(surface.label, 'surface')}
        </div>
        <div class="summary-right">
          ${badge(`${totalTouchFiles.length} touch files`, 'info')}
          ${badge(`${directWriteFiles.length + indirectWriteFiles.length} load/write`, 'warn')}
          ${badge(`${directReadFiles.length + indirectReadFiles.length} read/propagate`, 'good')}
        </div>
      </summary>
      <div class="table-body">
        ${tableRecommendationMarkup(entry)}
        <div class="meta-grid">
          <div class="meta-card">
            <div class="meta-label">Primary schema file</div>
            ${pathListMarkup(primarySchemaFiles)}
          </div>
          <div class="meta-card">
            <div class="meta-label">All DDL touchers</div>
            ${pathListMarkup(schemaFiles)}
          </div>
          <div class="meta-card">
            <div class="meta-label">Reader methods</div>
            ${readMethods.length ? `<div class="method-list">${readMethods.map((name) => `<code>${escapeHtml(name)}</code>`).join('')}</div>` : '<div class="empty">No read API wrappers inferred.</div>'}
          </div>
          <div class="meta-card">
            <div class="meta-label">Writer methods</div>
            ${writeMethods.length ? `<div class="method-list">${writeMethods.map((name) => `<code>${escapeHtml(name)}</code>`).join('')}</div>` : '<div class="empty">No write API wrappers inferred.</div>'}
          </div>
        </div>
        ${sectionMarkup(
          'Loads from / write path',
          sortSet(new Set([...directWriteFiles, ...indirectWriteFiles])),
          `${directWriteFiles.length} direct SQL/DDL, ${indirectWriteFiles.length} API call sites`
        )}
        ${sectionMarkup(
          'Propagates to / read path',
          sortSet(new Set([...directReadFiles, ...indirectReadFiles])),
          `${directReadFiles.length} direct SQL/DDL, ${indirectReadFiles.length} API call sites`
        )}
        ${sectionMarkup(
          'All touch files',
          totalTouchFiles,
          `${totalTouchFiles.length} tracked files`
        )}
        ${ambiguousTouchFiles.length > 0 ? sectionMarkup(
          'Ambiguous same-name surface hits',
          ambiguousTouchFiles,
          'Same table name appears in multiple schema surfaces; inspect manually if needed'
        ) : ''}
      </div>
    </details>
  `;
}

function renderSurfaceSection(surface, entries) {
  const sortedEntries = entries.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind.localeCompare(right.kind);
    }
    return left.table.localeCompare(right.table);
  });

  const touchCount = sortedEntries.reduce((sum, entry) => {
    const touchFiles = new Set([
      ...entry.schemaFiles,
      ...entry.directReadFiles,
      ...entry.directWriteFiles,
      ...entry.indirectReadFiles,
      ...entry.indirectWriteFiles,
      ...entry.mentionFiles,
    ]);
    return sum + touchFiles.size;
  }, 0);

  return `
    <section class="surface-section" data-surface="${escapeHtml(surface.key)}">
      <div class="surface-header">
        <div>
          <h2>${escapeHtml(surface.label)}</h2>
          <p>${escapeHtml(surface.description)}</p>
        </div>
        <div class="surface-stats">
          ${badge(`${sortedEntries.length} logical tables`, 'surface')}
          ${badge(`${touchCount} summed touch-file hits`, 'info')}
        </div>
      </div>
      <div class="surface-body">
        ${sortedEntries.map((table) => renderTableCard(table)).join('')}
      </div>
    </section>
  `;
}

function buildHtml(audit) {
  const surfacesByGroup = new Map();
  for (const surface of SURFACES) {
    if (!surfacesByGroup.has(surface.group)) {
      surfacesByGroup.set(surface.group, []);
    }
    const entries = audit.tables.filter((entry) => entry.surfaceKey === surface.key);
    if (entries.length > 0) {
      surfacesByGroup.get(surface.group).push(renderSurfaceSection(surface, entries));
    }
  }

  const excludedRows = audit.excludedSchemas.length > 0
    ? audit.excludedSchemas.map((item) => `
        <tr>
          <td><code>${escapeHtml(item.table)}</code></td>
          <td>${escapeHtml(item.kind)}</td>
          <td><code>${escapeHtml(item.file)}</code></td>
        </tr>
      `).join('')
    : '<tr><td colspan="3">No one-off schema surfaces detected outside the logical inventory.</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Schema Surface Audit and Consolidation Plan</title>
<style>
:root {
  --bg: #0b1220;
  --panel: rgba(13, 23, 42, 0.9);
  --panel-2: rgba(15, 32, 61, 0.88);
  --line: rgba(148, 163, 184, 0.18);
  --text: #e5eef9;
  --muted: #91a3bf;
  --accent: #7dd3fc;
  --good: #6ee7b7;
  --warn: #fbbf24;
  --danger: #fb7185;
  --surface: #93c5fd;
  --chip: rgba(30, 41, 59, 0.9);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", "Helvetica Neue", sans-serif;
  color: var(--text);
  background:
    radial-gradient(circle at top left, rgba(125, 211, 252, 0.16), transparent 32%),
    radial-gradient(circle at top right, rgba(251, 191, 36, 0.12), transparent 25%),
    linear-gradient(160deg, #020617 0%, #0f172a 48%, #111827 100%);
}
main {
  max-width: 1500px;
  margin: 0 auto;
  padding: 40px 20px 72px;
}
h1, h2, h3, p { margin: 0; }
.hero { display: grid; gap: 18px; margin-bottom: 24px; }
.hero h1 { font-size: clamp(2rem, 3.8vw, 3rem); letter-spacing: 0.02em; }
.hero p {
  max-width: 1100px;
  color: var(--muted);
  line-height: 1.65;
  font-size: 0.98rem;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 14px;
  margin: 28px 0;
}
.stat-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 18px;
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.24);
  backdrop-filter: blur(12px);
}
.stat-card .value { font-size: 2rem; font-weight: 700; }
.stat-card .label {
  margin-top: 8px;
  color: var(--muted);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.overview,
.excluded,
.surface-section {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 24px;
  margin-top: 22px;
  box-shadow: 0 20px 48px rgba(2, 6, 23, 0.22);
  backdrop-filter: blur(12px);
}
.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
  margin-top: 18px;
}
.overview-card {
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
}
.overview-card h3 { font-size: 1rem; margin-bottom: 8px; }
.overview-card p { color: var(--muted); line-height: 1.6; }
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 5px 10px;
  border: 1px solid transparent;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: var(--chip);
}
.badge.good { color: var(--good); border-color: rgba(110, 231, 183, 0.32); }
.badge.warn { color: var(--warn); border-color: rgba(251, 191, 36, 0.28); }
.badge.danger { color: var(--danger); border-color: rgba(251, 113, 133, 0.28); }
.badge.info { color: var(--accent); border-color: rgba(125, 211, 252, 0.28); }
.badge.surface { color: var(--surface); border-color: rgba(147, 197, 253, 0.28); }
.badge.neutral { color: var(--text); border-color: var(--line); }
.surface-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.surface-header h2 { font-size: 1.5rem; margin-bottom: 8px; }
.surface-header p {
  color: var(--muted);
  max-width: 900px;
  line-height: 1.6;
}
.surface-stats { display: flex; gap: 8px; flex-wrap: wrap; }
.table-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.72);
  margin-top: 12px;
  overflow: hidden;
}
.table-card summary {
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 16px 18px;
  cursor: pointer;
}
.table-card summary::-webkit-details-marker { display: none; }
.summary-left,
.summary-right {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.table-name {
  font-family: "Consolas", "SFMono-Regular", monospace;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.table-body { border-top: 1px solid var(--line); padding: 18px; }
.recommendation {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.meta-card,
.touch-section {
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px;
}
.meta-label,
.touch-title {
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin-bottom: 10px;
}
.touch-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.touch-title span { font-size: 0.76rem; letter-spacing: 0.04em; }
.touch-section { margin-top: 12px; }
.file-list {
  list-style: none;
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow: auto;
}
.file-list li {
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  padding-bottom: 6px;
}
.file-list li:last-child { border-bottom: none; padding-bottom: 0; }
code {
  font-family: "Consolas", "SFMono-Regular", monospace;
  font-size: 0.84rem;
  color: #dbeafe;
}
.method-list { display: flex; flex-wrap: wrap; gap: 8px; }
.empty { color: var(--muted); line-height: 1.6; }
.group-header {
  margin-top: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}
.group-header h2 { font-size: 1.65rem; }
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 16px;
}
th, td {
  text-align: left;
  padding: 12px 10px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
th {
  color: var(--muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.filter-bar {
  margin-top: 18px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.filter-bar input {
  width: min(560px, 100%);
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.9);
  color: var(--text);
  padding: 12px 14px;
  font: inherit;
}
.footer-note { margin-top: 28px; color: var(--muted); line-height: 1.6; }
@media (max-width: 900px) {
  .table-card summary,
  .surface-header,
  .group-header,
  .touch-title { flex-direction: column; align-items: flex-start; }
}
</style>
</head>
<body>
<main>
  <section class="hero">
    <div>
      <h1>Schema Surface Audit and Consolidation Plan</h1>
      <p>
        Static repo audit generated from the tracked/unignored workspace on ${escapeHtml(audit.generatedAt)}.
        The scan walks ${escapeHtml(String(audit.scannedFileCount))} files, inventories live schema surfaces,
        and records per-table file touch points as direct SQL/DDL, inferred write-path callers, and inferred
        read-path callers. This keeps the old consolidation discussion grounded in the files that actually load
        data into each table and the files that read data back out.
      </p>
    </div>
    <div class="filter-bar">
      <input id="tableFilter" type="search" placeholder="Filter table names or file paths in this HTML view">
    </div>
  </section>

  <section class="stat-grid">
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.scannedFileCount))}</div><div class="label">Tracked Files Scanned</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.tableCount))}</div><div class="label">Logical Tables</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.virtualTableCount))}</div><div class="label">Virtual Tables</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.surfaceCount))}</div><div class="label">Schema Surfaces</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(String(audit.touchFileHitCount))}</div><div class="label">Summed Touch Hits</div></div>
  </section>

  <section class="overview">
    <h2>Audit Basis</h2>
    <div class="overview-grid">
      <div class="overview-card">
        <h3>What counted</h3>
        <p>Every file from <code>git ls-files -co --exclude-standard</code>. Direct touch detection looks for SQL and DDL context, not casual word matches, and API propagation is inferred from public DB wrapper call sites.</p>
      </div>
      <div class="overview-card">
        <h3>How to read the cards</h3>
        <p><strong>Loads from / write path</strong> means direct inserts/updates/deletes plus first-order caller files. <strong>Propagates to / read path</strong> means direct selects/joins plus first-order caller files.</p>
      </div>
      <div class="overview-card">
        <h3>Consolidation hypothesis kept</h3>
        <p>The prior plan&apos;s delete/merge calls are preserved as badges on the affected SpecDb tables so the new file-level audit stays tied to the earlier consolidation intent instead of replacing it.</p>
      </div>
      <div class="overview-card">
        <h3>Known limits</h3>
        <p>This is a static scan. Dynamic SQL and deeply indirect runtime flows can still require manual inspection. Same-name tables across different surfaces are called out in an ambiguity section when detected.</p>
      </div>
    </div>
  </section>

  ${[...surfacesByGroup.entries()].map(([group, sections]) => `
    <div class="group-header">
      <h2>${escapeHtml(group)} Schema Surfaces</h2>
      ${badge(`${sections.length} surfaces`, 'surface')}
    </div>
    ${sections.join('')}
  `).join('')}

  <section class="excluded">
    <h2>Excluded One-Off or Test-Only DDL</h2>
    <p class="footer-note">These tables were detected in source, test, or export helpers but are not part of the logical inventory above. They are listed here so the scan does not silently skip them.</p>
    <table>
      <thead>
        <tr><th>Table</th><th>Kind</th><th>File</th></tr>
      </thead>
      <tbody>
        ${excludedRows}
      </tbody>
    </table>
  </section>

  <p class="footer-note">
    Generated by <code>scripts/generateSchemaTouchAudit.js</code>. If the schema or DB wrapper surface changes,
    rerun the generator to refresh this HTML.
  </p>
</main>
<script>
const filterInput = document.getElementById('tableFilter');
const cards = Array.from(document.querySelectorAll('.table-card'));
filterInput.addEventListener('input', () => {
  const needle = filterInput.value.trim().toLowerCase();
  for (const card of cards) {
    const text = card.textContent.toLowerCase();
    card.style.display = needle && !text.includes(needle) ? 'none' : '';
  }
});
</script>
</body>
</html>`;
}

function finalizeTables(tableEntries) {
  return tableEntries
    .map((entry) => ({
      ...entry,
      note: CONSOLIDATION_NOTES.get(entry.key) || null,
    }))
    .sort((left, right) => {
      if (left.surfaceKey !== right.surfaceKey) {
        return left.surfaceKey.localeCompare(right.surfaceKey);
      }
      if (left.kind !== right.kind) {
        return left.kind.localeCompare(right.kind);
      }
      return left.table.localeCompare(right.table);
    });
}

function main() {
  const trackedFiles = getTrackedFiles();
  const textByFile = new Map();
  for (const relPath of trackedFiles) {
    const text = readText(relPath);
    if (text != null) {
      textByFile.set(relPath, text);
    }
  }

  const tableEntries = buildLogicalTables(textByFile);
  const aliasMap = buildAliasMap(textByFile, tableEntries);
  const definitions = buildDefinitions(textByFile, tableEntries, aliasMap);

  addDirectTouchData(tableEntries, textByFile);
  addIndirectTouchData(tableEntries, definitions, textByFile);

  const finalizedTables = finalizeTables(tableEntries);
  const excludedSchemas = collectExcludedSchemas(textByFile, tableEntries);
  const touchFileHitCount = finalizedTables.reduce((sum, entry) => {
    const touches = new Set([
      ...entry.schemaFiles,
      ...entry.directReadFiles,
      ...entry.directWriteFiles,
      ...entry.indirectReadFiles,
      ...entry.indirectWriteFiles,
      ...entry.mentionFiles,
    ]);
    return sum + touches.size;
  }, 0);

  const audit = {
    generatedAt: new Date().toISOString(),
    scannedFileCount: trackedFiles.length,
    tableCount: finalizedTables.filter((entry) => entry.kind === 'table').length,
    virtualTableCount: finalizedTables.filter((entry) => entry.kind === 'virtual').length,
    surfaceCount: SURFACES.length,
    touchFileHitCount,
    tables: finalizedTables,
    excludedSchemas,
  };

  fs.writeFileSync(OUTPUT_PATH, buildHtml(audit), 'utf8');
  process.stdout.write(`Wrote ${normalizeRel(path.relative(ROOT, OUTPUT_PATH))}\n`);
}

main();
