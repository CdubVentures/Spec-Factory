const fs = require('fs');
const runId = process.argv[2] || '20260316082231-f92d12';
const base = `C:\\Users\\Chris\\AppData\\Local\\Temp\\spec-factory-runtime-defaults-23FjQ0\\storage-settings-gui-WXCgJV\\storage-target-local\\mouse\\mouse-razer-viper-v3-pro\\${runId}`;

// Check indexlab/needset.json
const paths = [
  `${base}\\indexlab\\needset.json`,
  `${base}\\latest_snapshot\\needset.json`,
  `${base}\\run_output\\analysis\\needset.json`,
];
for (const p of paths) {
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const bundles = Array.isArray(j.bundles) ? j.bundles.length : 0;
    const bwq = Array.isArray(j.bundles) ? j.bundles.filter(b => b.queries && b.queries.length > 0).length : 0;
    const pi = j.profile_influence;
    console.log(`\n=== ${p.split(runId)[1]} ===`);
    console.log(`bundles: ${bundles} (${bwq} w/queries) | profile_influence: ${pi ? 'mfr=' + pi.manufacturer_html + ' total_q=' + pi.total_queries : 'NULL'} | deltas: ${Array.isArray(j.deltas) ? j.deltas.length : 0} | fields: ${Array.isArray(j.fields) ? j.fields.length : 0} | schema_version: ${j.schema_version || '(none)'} | scope: ${j.scope || '(none)'}`);
  } catch (e) {
    console.log(`\n${p.split(runId)[1]}: not found`);
  }
}

// Check events
const eventsPath = `${base}\\indexlab\\_runtime\\events.jsonl`;
try {
  const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n');
  console.log(`\n=== events.jsonl (${lines.length} total) ===`);
  let i = 0;
  for (const l of lines) {
    const j = JSON.parse(l);
    if (j.event === 'needset_computed') {
      i++;
      const bundles = Array.isArray(j.bundles) ? j.bundles.length : 0;
      const bwq = Array.isArray(j.bundles) ? j.bundles.filter(b => b.queries && b.queries.length > 0).length : 0;
      const pi = j.profile_influence;
      console.log(`needset #${i} | scope: ${j.scope || '(none)'} | bundles: ${bundles} (${bwq} w/queries) | pi: ${pi ? 'mfr=' + pi.manufacturer_html + ' total_q=' + pi.total_queries : 'NULL'} | fields: ${Array.isArray(j.fields) ? j.fields.length : 0} | schema_version: ${j.schema_version || '(none)'}`);
    }
  }
  console.log(`Total needset_computed: ${i}`);
} catch (e) {
  console.log('events.jsonl: not found at', eventsPath);
}
