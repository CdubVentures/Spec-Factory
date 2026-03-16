const fs = require('fs');
const eventsFile = 'C:\\Users\\Chris\\AppData\\Local\\Temp\\spec-factory-runtime-defaults-23FjQ0\\storage-settings-gui-WXCgJV\\storage-target-local\\mouse\\mouse-razer-viper-v3-pro\\20260316085148-7e323b\\shared_logs\\runtime_events.jsonl';
const lines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n');
const discoveryEvents = ['brand_resolved', 'search_plan_generated', 'search_results_collected', 'serp_triage_completed', 'domains_classified'];
for (const l of lines) {
  const j = JSON.parse(l);
  if (discoveryEvents.includes(j.event)) {
    console.log(`event: ${j.event} | runId present: ${!!j.runId} | runId: ${j.runId || 'MISSING'} | keys: ${Object.keys(j).slice(0,8).join(',')}`);
  }
}
// Also check run_events.ndjson for comparison
const runEventsFile = eventsFile.replace('shared_logs/runtime_events.jsonl', 'indexlab/run_events.ndjson');
const runLines = fs.readFileSync(runEventsFile, 'utf8').trim().split('\n');
const firstEvent = JSON.parse(runLines[0]);
console.log('\nFirst run_events.ndjson event: event=' + firstEvent.event + ' runId=' + (firstEvent.run_id || firstEvent.runId || 'MISSING'));
