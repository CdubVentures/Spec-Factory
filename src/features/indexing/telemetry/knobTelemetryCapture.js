// WHY: Captures config-vs-default snapshots for knob drift detection.
// Each snapshot records which knobs diverge from manifest defaults.

import fs from 'node:fs';

/**
 * Compare resolved config against manifest defaults.
 */
const SENSITIVE_PATTERNS = /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i;
function redact(knob, value) {
  if (SENSITIVE_PATTERNS.test(knob) && value && value !== 'undefined' && value !== '') {
    return '***REDACTED***';
  }
  return value;
}

export function captureKnobSnapshot(config, defaults) {
  const keys = Object.keys(defaults);
  const entries = [];
  let mismatchCount = 0;

  for (const knob of keys) {
    const configValue = String(config[knob]);
    const defaultValue = String(defaults[knob]);
    const effectiveValue = configValue;
    const match = configValue === defaultValue;
    if (!match) mismatchCount++;
    entries.push({ knob, config_value: redact(knob, configValue), default_value: redact(knob, defaultValue), effective_value: redact(knob, effectiveValue), match });
  }

  return {
    ts: new Date().toISOString(),
    entries,
    mismatch_count: mismatchCount,
    total_knobs: keys.length,
  };
}

/**
 * Append a knob snapshot to the NDJSON log.
 */
export function recordKnobSnapshot(snapshot, logPath) {
  const line = JSON.stringify(snapshot);
  fs.appendFileSync(logPath, line + '\n', 'utf8');
}

/**
 * Apply redaction + sort to pre-fetched snapshot rows.
 * Pure function — no I/O. Works with both NDJSON-parsed and SQL rows.
 */
export function computeKnobSnapshots(snapshots) {
  const results = [];
  for (const snap of snapshots) {
    if (Array.isArray(snap.entries)) {
      for (const entry of snap.entries) {
        entry.config_value = redact(entry.knob, entry.config_value);
        entry.default_value = redact(entry.knob, entry.default_value);
        entry.effective_value = redact(entry.knob, entry.effective_value);
      }
    }
    results.push(snap);
  }
  results.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));
  return results;
}

/**
 * Read all knob snapshots from the NDJSON log, sorted by ts ascending.
 */
export function readKnobSnapshots(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const parsed = [];
  for (const line of lines) {
    try { parsed.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return computeKnobSnapshots(parsed);
}
