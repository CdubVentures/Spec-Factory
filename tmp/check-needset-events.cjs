const fs = require('fs');
const runId = process.argv[2] || '20260316082231-f92d12';
const eventsFile = 'C:\\Users\\Chris\\AppData\\Local\\Temp\\spec-factory-runtime-defaults-23FjQ0\\storage-settings-gui-WXCgJV\\storage-target-local\\output\\_runtime\\events.jsonl';
const lines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n');
let i = 0;
for (const l of lines) {
  const j = JSON.parse(l);
  if (j.runId !== runId) continue;
  if (j.event !== 'needset_computed') continue;
  i++;
  const bundles = Array.isArray(j.bundles) ? j.bundles.length : 0;
  const bundlesWithQueries = Array.isArray(j.bundles) ? j.bundles.filter(b => b.queries && b.queries.length > 0).length : 0;
  const pi = j.profile_influence;
  console.log(`#${i} | ts: ${j.ts} | scope: ${j.scope || '(none)'} | bundles: ${bundles} (${bundlesWithQueries} w/queries) | profile_influence: ${pi ? 'YES total_queries=' + pi.total_queries : 'NULL'} | deltas: ${Array.isArray(j.deltas) ? j.deltas.length : 0} | fields: ${Array.isArray(j.fields) ? j.fields.length : 0} | schema_version: ${j.schema_version || '(none)'}`);
}
console.log(`Total needset_computed events: ${i}`);
