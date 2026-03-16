const fs = require('fs');
const file = 'C:\\Users\\Chris\\AppData\\Local\\Temp\\spec-factory-runtime-defaults-23FjQ0\\storage-settings-gui-WXCgJV\\storage-target-local\\mouse\\mouse-razer-viper-v3-pro\\20260316085148-7e323b\\shared_logs\\runtime_events.jsonl';
const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
// Print ALL keys from run_context
for (const l of lines) {
  const j = JSON.parse(l);
  if (j.event === 'run_context') {
    console.log('Keys:', Object.keys(j).join(', '));
    console.log('identity_lock_status:', j.identity_lock_status);
    // The key insight: search must have run (we have 11 source_discovery_only events)
    // which means URLs were found. The question is whether discoverCandidateSources ran.
    break;
  }
}
// Check the first 5 events by timestamp
console.log('\nFirst 5 events:');
const sorted = lines.map(l => JSON.parse(l)).sort((a,b) => (a.ts||'').localeCompare(b.ts||''));
for (const e of sorted.slice(0, 5)) {
  console.log(e.ts, e.event);
}
// Check events around 08:51:54 (when schema4_handoff_ready fires)
console.log('\nEvents around 08:51:54-55:');
for (const e of sorted) {
  if (e.ts >= '2026-03-16T08:51:54' && e.ts <= '2026-03-16T08:51:55') {
    console.log(e.ts, e.event);
  }
}
