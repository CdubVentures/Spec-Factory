import { readFileSync } from 'fs';

const eventsPath = process.argv[2];
const content = readFileSync(eventsPath, 'utf8');
const lines = content.split('\n').filter(l => l.trim());

const allMethods = {};
const methodDocs = {};

for (const line of lines) {
  const e = JSON.parse(line);
  if (e.event === 'source_processed' && Array.isArray(e.payload?.candidates)) {
    const url = e.payload.url;
    for (const c of e.payload.candidates) {
      const m = c.method || 'unknown';
      allMethods[m] = (allMethods[m] || 0) + 1;
      if (!methodDocs[m]) methodDocs[m] = new Set();
      methodDocs[m].add(url);
    }
  }
}

console.log('=== SECTION 11: PARSER METHOD COVERAGE ===\n');
console.log('Method | Candidates | Docs | Status');
for (const [method, count] of Object.entries(allMethods).sort((a, b) => b[1] - a[1])) {
  const docs = methodDocs[method]?.size || 0;
  console.log(`  ${method} | ${count} | ${docs} docs | ACTIVE`);
}

const seen = new Set(Object.keys(allMethods));

console.log('\n=== MUST FIRE STATUS ===');
const mustFireChecks = [
  ['PM-01 static_dom', seen.has('dom') || seen.has('static_dom')],
  ['PM-05 main_article', seen.has('readability') || seen.has('main_article')],
  ['PM-06 html_spec_table', seen.has('spec_table_match') || seen.has('html_spec_table') || seen.has('html_table')],
  ['PM-08 json_ld', seen.has('ldjson') || seen.has('json_ld')],
  ['PM-12 opengraph', seen.has('opengraph')],
  ['PM-32 llm_extract', seen.has('llm_extract')],
  ['PM-34 deterministic_normalizer', seen.has('deterministic_normalizer')],
];

let confirmed = 0;
for (const [name, found] of mustFireChecks) {
  console.log(`  ${name}: ${found ? 'FIRED ✓' : 'NOT FOUND ✗'}`);
  if (found) confirmed++;
}
console.log(`\nMUST FIRE confirmed: ${confirmed} / 7`);

// NOT BUILT methods (should be 0)
console.log('\n=== NOT BUILT (expected 0) ===');
const notBuilt = ['image_ocr', 'office_docx', 'office_xlsx', 'office_pptx', 'office_mixed'];
for (const m of notBuilt) {
  console.log(`  ${m}: ${seen.has(m) ? 'FOUND (unexpected)' : '0 (correct)'}`);
}

// SHOULD FIRE
console.log('\n=== SHOULD FIRE ===');
const shouldFire = ['dom', 'html_table', 'microdata', 'twitter_card', 'llm_validate', 'consensus_policy_reducer'];
for (const m of shouldFire) {
  console.log(`  ${m}: ${seen.has(m) ? 'FIRED' : 'not seen'}`);
}

// Summary
console.log('\n=== SECTION 12: COVERAGE SUMMARY ===');
const phaseMap = {
  'P01 Static HTML': ['dom', 'static_dom'],
  'P02 Dynamic JS': ['dynamic_dom', 'graphql_replay'],
  'P03 Article Text': ['readability', 'main_article'],
  'P04 HTML Tables': ['spec_table_match', 'html_spec_table', 'html_table'],
  'P05 Structured Meta': ['ldjson', 'json_ld', 'embedded_state', 'microdata', 'opengraph', 'microformat', 'rdfa', 'twitter_card', 'network_json', 'adapter_api', 'instrumented_api'],
  'P06 Text PDF': ['pdf_text', 'pdf_kv', 'pdf_table'],
  'P07 Scanned PDF': ['scanned_pdf_ocr', 'scanned_pdf_text_ocr', 'scanned_pdf_kv_ocr', 'scanned_pdf_table_ocr'],
  'P08 Image OCR': ['image_ocr', 'screenshot_capture'],
  'P09 Chart/Graph': ['chart_data'],
  'P10 Office Docs': ['office_docx', 'office_xlsx', 'office_pptx', 'office_mixed'],
  'PP Cross-Cutting': ['llm_extract', 'llm_validate', 'deterministic_normalizer', 'consensus_policy_reducer', 'component_db_inference'],
};

let totalActive = 0;
let totalMethods = 0;
for (const [phase, methods] of Object.entries(phaseMap)) {
  const active = methods.filter(m => seen.has(m));
  const isActive = active.length > 0;
  if (isActive) totalActive++;
  totalMethods += active.length;
  console.log(`  ${phase}: ${isActive ? 'ACTIVE' : 'inactive'} | methods: ${active.join(', ') || '-'}`);
}
console.log(`\nPhases active: ${totalActive} / 10+1`);
console.log(`Methods observed: ${totalMethods} / 35`);
console.log(`All methods seen: ${[...seen].sort().join(', ')}`);
