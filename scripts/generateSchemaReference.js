#!/usr/bin/env node
/**
 * Generates docs/implementation/sql-full-migration/schema-reference.html
 * by parsing the actual schema DDL files. Single source of truth.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// ── Load schema sources ──
const specSchema = fs.readFileSync(path.join(root, 'src/db/specDbSchema.js'), 'utf8');
const appSchema = fs.readFileSync(path.join(root, 'src/db/appDbSchema.js'), 'utf8');
const migrationsSrc = fs.readFileSync(path.join(root, 'src/db/specDbMigrations.js'), 'utf8');

// ── Parse CREATE TABLE blocks ──
function parseTables(ddl) {
  const tables = [];
  const re = /CREATE\s+(VIRTUAL\s+)?TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*(?:USING\s+(\w+)\s*)?\(([^;]+?)\);/gis;
  let m;
  while ((m = re.exec(ddl)) !== null) {
    const isVirtual = !!m[1];
    const name = m[2];
    const engine = m[3] || null;
    const body = m[4];
    const columns = [];
    let pk = null;
    const fks = [];
    const uniques = [];

    for (const line of body.split('\n')) {
      const trimmed = line.trim().replace(/,$/, '');
      if (!trimmed || trimmed.startsWith('--')) continue;

      // Composite PK
      if (/^PRIMARY\s+KEY\s*\(/i.test(trimmed)) {
        const pkMatch = trimmed.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (pkMatch) pk = pkMatch[1].trim();
        continue;
      }
      // UNIQUE constraint
      if (/^UNIQUE\s*\(/i.test(trimmed)) {
        const uMatch = trimmed.match(/UNIQUE\s*\(([^)]+)\)/i);
        if (uMatch) uniques.push(uMatch[1].trim());
        continue;
      }
      // CHECK constraint (standalone)
      if (/^CHECK\s*\(/i.test(trimmed)) continue;

      // Virtual table columns (FTS5)
      if (isVirtual) {
        const colName = trimmed.replace(/,.*/, '').trim();
        if (colName && !colName.startsWith('content=') && !colName.startsWith('tokenize=')) {
          columns.push({ name: colName, type: 'TEXT', constraints: 'FTS5', isPk: false, fk: null });
        }
        continue;
      }

      // Regular column
      const colMatch = trimmed.match(/^(\w+)\s+(TEXT|INTEGER|REAL|BLOB)(.*)$/i);
      if (!colMatch) continue;
      const colName = colMatch[1];
      const colType = colMatch[2].toUpperCase();
      let rest = colMatch[3].trim();

      const isPk = /PRIMARY\s+KEY/i.test(rest);
      if (isPk && !pk) pk = colName;

      const fkMatch = rest.match(/REFERENCES\s+(\w+)\s*\((\w+)\)/i);
      let fk = null;
      if (fkMatch) {
        fk = `${fkMatch[1]}(${fkMatch[2]})`;
        fks.push({ col: colName, ref: fk });
      }

      // Clean up constraints display
      rest = rest.replace(/REFERENCES\s+\w+\s*\(\w+\)(\s+ON\s+DELETE\s+CASCADE)?/i, '').trim();
      rest = rest.replace(/PRIMARY\s+KEY(\s+AUTOINCREMENT)?/i, m => m).trim();

      columns.push({ name: colName, type: colType, constraints: rest, isPk, fk });
    }

    tables.push({ name, columns, pk, fks, uniques, isVirtual, engine });
  }
  return tables;
}

// ── Parse indexes ──
function parseIndexes(ddl) {
  const indexes = {};
  const re = /CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+ON\s+(\w+)\(([^)]+)\)([^;]*);/gi;
  let m;
  while ((m = re.exec(ddl)) !== null) {
    const isUnique = !!m[1];
    const idxName = m[2];
    const table = m[3];
    const cols = m[4].trim();
    const where = m[5]?.trim() || '';
    if (!indexes[table]) indexes[table] = [];
    indexes[table].push({ name: idxName, cols, isUnique, where });
  }
  return indexes;
}

// ── Parse migration columns ──
function parseMigrationColumns(src) {
  const adds = {};
  const re = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\s+(TEXT|INTEGER|REAL)([^`']*)/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const table = m[1];
    const col = m[2];
    const type = m[3].toUpperCase();
    const rest = m[4].trim().replace(/['"`]/g, '');
    if (!adds[table]) adds[table] = [];
    adds[table].push({ name: col, type, constraints: rest || '', isPk: false, fk: null, fromMigration: true });
  }
  return adds;
}

// ── Store ownership map ──
const storeMap = {
  candidates: 'candidateStore', candidate_reviews: 'candidateStore',
  component_identity: 'componentStore', component_aliases: 'componentStore', component_values: 'componentStore',
  enum_lists: 'enumListStore', list_values: 'enumListStore',
  item_field_state: 'itemStateStore', item_component_links: 'itemStateStore', item_list_links: 'itemStateStore', product_review_state: 'itemStateStore',
  key_review_state: 'keyReviewStore', key_review_runs: 'keyReviewStore', key_review_run_sources: 'keyReviewStore', key_review_audit: 'keyReviewStore',
  product_queue: 'queueProductStore', products: 'queueProductStore', product_runs: 'queueProductStore', audit_log: 'queueProductStore', curation_suggestions: 'queueProductStore', component_review_queue: 'queueProductStore',
  llm_route_matrix: 'llmRouteSourceStore', source_registry: 'llmRouteSourceStore', source_artifacts: 'llmRouteSourceStore', source_assertions: 'llmRouteSourceStore', source_evidence_refs: 'llmRouteSourceStore',
  llm_cache: 'sourceIntelStore', learning_profiles: 'sourceIntelStore', category_brain: 'sourceIntelStore', source_corpus: 'sourceIntelStore', runtime_events: 'sourceIntelStore', bridge_events: 'sourceIntelStore', source_intel_domains: 'sourceIntelStore', source_intel_field_rewards: 'sourceIntelStore',
  crawl_sources: 'artifactStore', source_screenshots: 'artifactStore', source_pdfs: 'artifactStore', source_videos: 'artifactStore',
  runs: 'runMetaStore', run_artifacts: 'runArtifactStore',
  billing_entries: 'billingStore', field_history: 'fieldHistoryStore', field_studio_map: 'fieldStudioMapStore',
  knob_snapshots: 'telemetryIndexStore', query_index: 'telemetryIndexStore', url_index: 'telemetryIndexStore', prompt_index: 'telemetryIndexStore',
  brand_domains: 'specDb (direct)', data_authority_sync: 'specDb (direct)',
  evidence_documents: 'evidenceIndex', evidence_chunks: 'evidenceIndex', evidence_facts: 'evidenceIndex', evidence_chunks_fts: 'evidenceIndex',
  brands: 'appDb', brand_categories: 'appDb', brand_renames: 'appDb', settings: 'appDb', studio_maps: 'appDb',
  url_crawl_ledger: 'crawlLedgerStore', query_cooldowns: 'crawlLedgerStore',
};

// ── Domain groups ──
const specDbGroups = [
  { label: 'Candidate Pipeline', tables: ['candidates', 'candidate_reviews'] },
  { label: 'Component Identity', tables: ['component_identity', 'component_aliases', 'component_values'] },
  { label: 'Enum / List Management', tables: ['enum_lists', 'list_values'] },
  { label: 'Item State', tables: ['item_field_state', 'item_component_links', 'item_list_links', 'product_review_state'] },
  { label: 'Catalog & Queue', tables: ['products', 'product_queue', 'product_runs', 'curation_suggestions', 'component_review_queue', 'audit_log'] },
  { label: 'LLM Route Configuration', tables: ['llm_route_matrix'] },
  { label: 'Source Capture', tables: ['source_registry', 'source_artifacts', 'source_assertions', 'source_evidence_refs'] },
  { label: 'Key Review', tables: ['key_review_state', 'key_review_runs', 'key_review_run_sources', 'key_review_audit'] },
  { label: 'Billing', tables: ['billing_entries'] },
  { label: 'Source Intelligence', tables: ['source_intel_domains', 'source_intel_field_rewards'] },
  { label: 'Learning & Cache', tables: ['llm_cache', 'learning_profiles', 'category_brain', 'source_corpus'] },
  { label: 'Runtime Events', tables: ['runtime_events', 'bridge_events'] },
  { label: 'Runs & Artifacts', tables: ['runs', 'run_artifacts'] },
  { label: 'Evidence Index', tables: ['evidence_documents', 'evidence_chunks', 'evidence_facts', 'evidence_chunks_fts'] },
  { label: 'Brand / Domain', tables: ['brand_domains'] },
  { label: 'Data Sync', tables: ['data_authority_sync'] },
  { label: 'Field History', tables: ['field_history'] },
  { label: 'Crawl Artifacts', tables: ['crawl_sources', 'source_screenshots', 'source_videos', 'source_pdfs'] },
  { label: 'Telemetry Indexes', tables: ['knob_snapshots', 'query_index', 'url_index', 'prompt_index'] },
  { label: 'Field Studio', tables: ['field_studio_map'] },
  { label: 'Crawl Ledger', tables: ['url_crawl_ledger', 'query_cooldowns'] },
];

const appDbGroups = [
  { label: 'Global State', tables: ['brands', 'brand_categories', 'brand_renames', 'settings', 'studio_maps'] },
];

// ── Parse everything ──
const specTables = parseTables(specSchema);
const appTables = parseTables(appSchema);
const allTables = [...specTables, ...appTables];
const tableMap = Object.fromEntries(allTables.map(t => [t.name, t]));

const specIndexes = { ...parseIndexes(specSchema), ...parseIndexes(migrationsSrc) };
const appIndexes = parseIndexes(appSchema);
const allIndexes = { ...specIndexes, ...appIndexes };

// Merge migration columns
const migCols = parseMigrationColumns(migrationsSrc);
for (const [table, cols] of Object.entries(migCols)) {
  if (tableMap[table]) {
    for (const col of cols) {
      if (!tableMap[table].columns.find(c => c.name === col.name)) {
        tableMap[table].columns.push(col);
      }
    }
  }
}

// ── HTML generators ──
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function renderTableCard(t) {
  const store = storeMap[t.name] || '—';
  const colCount = t.columns.length;
  const hasFk = t.fks.length > 0;
  const pkLabel = t.pk || '—';

  let tagsHtml = `<span class="tag tag-pk">PK: ${esc(pkLabel)}</span>`;
  if (hasFk) tagsHtml += `<span class="tag tag-fk">FK</span>`;
  if (t.isVirtual) tagsHtml += `<span class="tag tag-virtual">${esc(t.engine || 'VIRTUAL')}</span>`;
  tagsHtml += `<span class="tag tag-cols">${colCount} cols</span>`;
  tagsHtml += `<span class="tag tag-store">${esc(store)}</span>`;

  let colRows = '';
  for (const c of t.columns) {
    const rowClass = c.isPk ? ' class="pk-row"' : '';
    let constr = esc(c.constraints);
    if (c.fk) constr += ` <span class="fk-indicator">FK &rarr; ${esc(c.fk)}</span>`;
    if (c.fromMigration) constr += ` <span class="migr-indicator">via migration</span>`;
    colRows += `<tr${rowClass}><td class="cn">${esc(c.name)}</td><td class="ct">${esc(c.type)}</td><td class="cc">${constr}</td></tr>\n`;
  }

  const idxList = allIndexes[t.name] || [];
  let idxHtml = '';
  if (idxList.length || t.uniques.length) {
    idxHtml = '<div class="idx-section"><div class="idx-label">Indexes</div>';
    for (const u of t.uniques) {
      idxHtml += `<div class="idx-item">UNIQUE(${esc(u)})</div>`;
    }
    for (const idx of idxList) {
      const u = idx.isUnique ? 'UNIQUE ' : '';
      const w = idx.where ? ` ${esc(idx.where)}` : '';
      idxHtml += `<div class="idx-item">${u}${esc(idx.name)} (${esc(idx.cols)})${w}</div>`;
    }
    idxHtml += '</div>';
  }

  return `<details class="table-card" data-table="${esc(t.name)}">
  <summary><span class="tname">${esc(t.name)}</span><span class="tags">${tagsHtml}</span></summary>
  <div class="card-body">
    <table class="col-table"><thead><tr><th>Column</th><th>Type</th><th>Constraints</th></tr></thead>
    <tbody>${colRows}</tbody></table>
    ${idxHtml}
  </div>
</details>`;
}

function renderGroups(groups) {
  let html = '';
  for (const g of groups) {
    const cards = g.tables.map(name => tableMap[name]).filter(Boolean).map(renderTableCard).join('\n');
    if (!cards) continue;
    html += `<div class="domain-group">
  <div class="domain-label">${esc(g.label)}</div>
  ${cards}
</div>\n`;
  }
  return html;
}

// ── Assemble full HTML ──
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Spec Factory \u2014 Schema Reference</title>
<style>
:root {
  --bg: #09090b; --s1: #18181b; --s2: #27272a; --s3: #3f3f46;
  --border: rgba(161,161,170,0.12); --border-f: rgba(161,161,170,0.25);
  --text: #fafafa; --t2: #a1a1aa; --t3: #71717a;
  --accent: #3b82f6; --accent-s: rgba(59,130,246,0.12);
  --green: #22c55e; --green-s: rgba(34,197,94,0.12);
  --amber: #f59e0b; --amber-s: rgba(245,158,11,0.12);
  --violet: #8b5cf6; --violet-s: rgba(139,92,246,0.12);
  --rose: #f43f5e; --cyan: #06b6d4;
  --mono: "SF Mono","Cascadia Code","Fira Code","JetBrains Mono",Consolas,monospace;
  --sans: "Inter","Segoe UI",system-ui,-apple-system,sans-serif;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:15px;-webkit-font-smoothing:antialiased}
body{font-family:var(--sans);background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh}
.page{max-width:1280px;margin:0 auto;padding:48px 24px 96px}
.header{margin-bottom:48px}
.header h1{font-size:2rem;font-weight:700;letter-spacing:-0.03em;margin-bottom:8px}
.header p{color:var(--t2);max-width:720px;font-size:0.92rem}
.header .meta{display:flex;gap:24px;margin-top:16px;font-size:0.8rem;color:var(--t3);text-transform:uppercase;letter-spacing:0.06em;font-weight:600}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;background:var(--border);border-radius:12px;overflow:hidden;margin-bottom:48px}
.stat{background:var(--s1);padding:20px 24px;display:flex;flex-direction:column;gap:4px}
.stat .n{font-size:1.75rem;font-weight:700;letter-spacing:-0.02em}
.stat .l{font-size:0.75rem;color:var(--t3);text-transform:uppercase;letter-spacing:0.08em;font-weight:600}
.surface{margin-bottom:56px}
.surface-head{display:flex;align-items:baseline;gap:12px;margin-bottom:6px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.surface-head h2{font-size:1.35rem;font-weight:700;letter-spacing:-0.02em}
.surface-desc{color:var(--t2);font-size:0.88rem;margin-bottom:24px;max-width:800px}
.domain-group{margin-bottom:32px}
.domain-label{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--t3);margin-bottom:8px;padding-left:2px}
.table-card{background:var(--s1);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;overflow:hidden;transition:border-color 0.15s}
.table-card:hover{border-color:var(--border-f)}
.table-card summary{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;list-style:none;font-size:0.9rem}
.table-card summary::-webkit-details-marker{display:none}
.table-card summary::after{content:"+";font-size:1.1rem;font-weight:300;color:var(--t3);transition:transform 0.15s;margin-left:8px}
.table-card[open] summary::after{content:"\\2212"}
.tname{font-family:var(--mono);font-weight:600;font-size:0.88rem;letter-spacing:-0.01em}
.tags{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.tag{font-size:0.68rem;font-weight:700;letter-spacing:0.04em;padding:2px 8px;border-radius:99px;text-transform:uppercase;white-space:nowrap}
.tag-store{background:var(--accent-s);color:var(--accent)}
.tag-pk{background:var(--green-s);color:var(--green)}
.tag-fk{background:var(--violet-s);color:var(--violet)}
.tag-virtual{background:var(--amber-s);color:var(--amber)}
.tag-cols{background:var(--s2);color:var(--t2)}
.card-body{border-top:1px solid var(--border);padding:16px}
.col-table{width:100%;border-collapse:collapse;font-size:0.82rem}
.col-table th{text-align:left;padding:6px 10px;font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3);border-bottom:1px solid var(--border)}
.col-table td{padding:5px 10px;border-bottom:1px solid var(--border);vertical-align:top}
.col-table tr:last-child td{border-bottom:none}
.col-table .cn{font-family:var(--mono);font-weight:500;color:var(--text);font-size:0.82rem}
.col-table .ct{font-family:var(--mono);color:var(--t3);font-size:0.78rem}
.col-table .cc{color:var(--t2);font-size:0.78rem}
.pk-row .cn{color:var(--green)}
.fk-indicator{color:var(--violet);font-size:0.72rem}
.migr-indicator{color:var(--amber);font-size:0.68rem;font-weight:600;text-transform:uppercase;letter-spacing:0.04em}
.idx-section{margin-top:12px}
.idx-label{font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3);margin-bottom:4px}
.idx-item{font-family:var(--mono);font-size:0.78rem;color:var(--t2);padding:2px 0}
.filter-wrap{margin-bottom:32px}
.filter-input{width:min(480px,100%);background:var(--s1);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font:inherit;font-size:0.88rem;color:var(--text);outline:none;transition:border-color 0.15s}
.filter-input:focus{border-color:var(--accent)}
.filter-input::placeholder{color:var(--t3)}
@media(max-width:768px){.page{padding:24px 16px 64px}.header h1{font-size:1.5rem}.stats{grid-template-columns:repeat(2,1fr)}.tags{gap:4px}.table-card summary{flex-wrap:wrap;gap:8px}}
</style>
</head>
<body>
<div class="page">

<header class="header">
  <h1>Schema Reference</h1>
  <p>Complete inventory of all SQL tables across Spec Factory's two database surfaces. Each table shows its columns, primary key, foreign keys, indexes, and owning store module.</p>
  <div class="meta">
    <span>Generated ${new Date().toISOString().slice(0, 10)}</span>
    <span>Post-consolidation</span>
  </div>
</header>

<div class="stats">
  <div class="stat"><div class="n">${specTables.filter(t => !t.isVirtual).length}</div><div class="l">SpecDb Tables</div></div>
  <div class="stat"><div class="n">${specTables.filter(t => t.isVirtual).length}</div><div class="l">Virtual (FTS)</div></div>
  <div class="stat"><div class="n">${appTables.length}</div><div class="l">AppDb Tables</div></div>
  <div class="stat"><div class="n">18</div><div class="l">Store Modules</div></div>
  <div class="stat"><div class="n">${allTables.length}</div><div class="l">Total Tables</div></div>
</div>

<div class="filter-wrap">
  <input class="filter-input" id="filter" type="search" placeholder="Filter tables or columns\u2026">
</div>

<section class="surface">
  <div class="surface-head">
    <h2>SpecDb</h2>
    <span class="tag" style="background:var(--accent-s);color:var(--accent)">Per-Category</span>
    <span class="tag tag-cols">${specTables.length} tables</span>
  </div>
  <p class="surface-desc">One SQLite database per category (<code>.workspace/db/{category}/spec.sqlite</code>). Holds all domain data: products, candidates, components, reviews, evidence, billing, telemetry, source intelligence, URL crawl ledger, and query cooldowns.</p>
  ${renderGroups(specDbGroups)}
</section>

<section class="surface">
  <div class="surface-head">
    <h2>AppDb</h2>
    <span class="tag" style="background:var(--green-s);color:var(--green)">Global</span>
    <span class="tag tag-cols">${appTables.length} tables</span>
  </div>
  <p class="surface-desc">Single global database at <code>.workspace/db/app.sqlite</code>. Cross-category state: brands, user settings, and field studio maps.</p>
  ${renderGroups(appDbGroups)}
</section>


</div>

<script>
const filter = document.getElementById('filter');
filter?.addEventListener('input', () => {
  const q = filter.value.toLowerCase();
  document.querySelectorAll('.table-card').forEach(card => {
    const name = card.dataset.table || '';
    const body = card.querySelector('.card-body')?.textContent?.toLowerCase() || '';
    card.style.display = (name.includes(q) || body.includes(q)) ? '' : 'none';
  });
  document.querySelectorAll('.domain-group').forEach(group => {
    const visible = [...group.querySelectorAll('.table-card')].filter(c => c.style.display !== 'none');
    group.style.display = visible.length ? '' : 'none';
  });
});
</script>
</body>
</html>`;

const outPath = path.join(root, 'docs/implementation/sql-full-migration/schema-reference.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log(`Written ${(html.length / 1024).toFixed(1)}KB to ${path.relative(root, outPath)}`);
console.log(`Tables: ${specTables.length} spec + ${appTables.length} app = ${allTables.length} total`);
