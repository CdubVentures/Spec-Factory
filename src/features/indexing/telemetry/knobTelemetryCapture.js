// WHY: Captures config-vs-default snapshots for knob drift detection.
// Each snapshot records which knobs diverge from manifest defaults.

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

