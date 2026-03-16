const fs = require('fs');
const file = 'C:\\Users\\Chris\\AppData\\Local\\Temp\\spec-factory-runtime-defaults-23FjQ0\\storage-settings-gui-WXCgJV\\storage-target-local\\mouse\\mouse-razer-viper-v3-pro\\20260316085148-7e323b\\shared_logs\\runtime_events.jsonl';
const lines = fs.readFileSync(file, 'utf8').trim().split('\n');

// Find planner_queue_snapshot_written — this event proves discovery ran
const plannerSnapshot = lines.find(l => l.includes('planner_queue_snapshot'));
if (plannerSnapshot) {
  const j = JSON.parse(plannerSnapshot);
  console.log('planner_queue_snapshot event:', j.event);
  console.log('  approved_urls:', j.approved_count || j.approved_urls || '?');
  console.log('  candidate_urls:', j.candidate_count || '?');
}

// Check what comes between schema4_handoff_ready and the next event
let foundHandoff = false;
for (const l of lines) {
  const j = JSON.parse(l);
  if (j.event === 'schema4_handoff_ready') {
    foundHandoff = true;
    console.log('\nschema4_handoff_ready at', j.ts);
    continue;
  }
  if (foundHandoff) {
    console.log('NEXT event after handoff:', j.event, 'at', j.ts);
    foundHandoff = false;
  }
}
