function normalizedToken(value, { lowercase = false } = {}) {
  const token = String(value || '').trim();
  if (!token) return '';
  return lowercase ? token.toLowerCase() : token;
}

function normalizedSectionTokens(sections) {
  const source = Array.isArray(sections) ? sections : [sections];
  const seen = new Set();
  const output = [];
  for (const rawSection of source) {
    const token = normalizedToken(rawSection, { lowercase: true });
    if (!token || seen.has(token)) continue;
    seen.add(token);
    output.push(token);
  }
  return output;
}

function incrementCounter(map, key, amount = 1) {
  if (!key) return;
  map[key] = Number(map[key] || 0) + Number(amount || 0);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createWriteSectionEntry() {
  return {
    attempt_total: 0,
    success_total: 0,
    failed_total: 0,
    last_attempt_at: null,
    last_success_at: null,
    last_failure_at: null,
    last_failure_reason: '',
  };
}

function ensureWriteSectionEntry(state, token) {
  if (!state.by_section[token]) {
    state.by_section[token] = createWriteSectionEntry();
  }
  return state.by_section[token];
}

function ensureWriteTargetEntry(state, token) {
  if (!state.by_target[token]) {
    state.by_target[token] = createWriteSectionEntry();
  }
  return state.by_target[token];
}

const state = {
  writes: {
    attempt_total: 0,
    success_total: 0,
    failed_total: 0,
    by_section: {},
    by_target: {},
    last_attempt_at: null,
    last_success_at: null,
    last_failure_at: null,
    last_failure_reason: '',
  },
  stale_reads: {
    total: 0,
    by_section: {},
    by_reason: {},
    by_from_version: {},
    by_to_version: {},
    last_detected_at: null,
    last_reason: '',
  },
  migrations: {
    total: 0,
    by_from_version: {},
    by_to_version: {},
    last_migration_at: null,
    last_from_version: null,
    last_to_version: null,
  },
};

function normalizeVersion(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resetSettingsPersistenceCounters() {
  state.writes.attempt_total = 0;
  state.writes.success_total = 0;
  state.writes.failed_total = 0;
  state.writes.by_section = {};
  state.writes.by_target = {};
  state.writes.last_attempt_at = null;
  state.writes.last_success_at = null;
  state.writes.last_failure_at = null;
  state.writes.last_failure_reason = '';

  state.stale_reads.total = 0;
  state.stale_reads.by_section = {};
  state.stale_reads.by_reason = {};
  state.stale_reads.by_from_version = {};
  state.stale_reads.by_to_version = {};
  state.stale_reads.last_detected_at = null;
  state.stale_reads.last_reason = '';

  state.migrations.total = 0;
  state.migrations.by_from_version = {};
  state.migrations.by_to_version = {};
  state.migrations.last_migration_at = null;
  state.migrations.last_from_version = null;
  state.migrations.last_to_version = null;
}

export function recordSettingsWriteAttempt({
  sections = [],
  target = '',
} = {}) {
  const ts = new Date().toISOString();
  const sectionTokens = normalizedSectionTokens(sections);
  const targetToken = normalizedToken(target, { lowercase: true });
  const writes = state.writes;

  writes.attempt_total += 1;
  writes.last_attempt_at = ts;

  for (const sectionToken of sectionTokens) {
    const sectionState = ensureWriteSectionEntry(writes, sectionToken);
    sectionState.attempt_total += 1;
    sectionState.last_attempt_at = ts;
  }

  if (targetToken) {
    const targetState = ensureWriteTargetEntry(writes, targetToken);
    targetState.attempt_total += 1;
    targetState.last_attempt_at = ts;
  }

  return {
    ts,
    sections: sectionTokens,
    target: targetToken,
  };
}

export function recordSettingsWriteOutcome({
  sections = [],
  target = '',
  success = false,
  reason = '',
} = {}) {
  const ts = new Date().toISOString();
  const sectionTokens = normalizedSectionTokens(sections);
  const targetToken = normalizedToken(target, { lowercase: true });
  const writes = state.writes;
  const failureReason = normalizedToken(reason, { lowercase: true }) || 'settings_persist_failed';

  if (success) {
    writes.success_total += 1;
    writes.last_success_at = ts;
  } else {
    writes.failed_total += 1;
    writes.last_failure_at = ts;
    writes.last_failure_reason = failureReason;
  }

  for (const sectionToken of sectionTokens) {
    const sectionState = ensureWriteSectionEntry(writes, sectionToken);
    if (success) {
      sectionState.success_total += 1;
      sectionState.last_success_at = ts;
    } else {
      sectionState.failed_total += 1;
      sectionState.last_failure_at = ts;
      sectionState.last_failure_reason = failureReason;
    }
  }

  if (targetToken) {
    const targetState = ensureWriteTargetEntry(writes, targetToken);
    if (success) {
      targetState.success_total += 1;
      targetState.last_success_at = ts;
    } else {
      targetState.failed_total += 1;
      targetState.last_failure_at = ts;
      targetState.last_failure_reason = failureReason;
    }
  }

  return {
    ts,
    sections: sectionTokens,
    target: targetToken,
    success: Boolean(success),
    ...(success ? {} : { reason: failureReason }),
  };
}

export function recordSettingsStaleRead({
  section = '',
  reason = '',
  fromVersion = 0,
  toVersion = 0,
} = {}) {
  const ts = new Date().toISOString();
  const sectionToken = normalizedToken(section, { lowercase: true }) || 'user-settings';
  const reasonToken = normalizedToken(reason, { lowercase: true }) || 'schema_version_outdated';
  const fromVersionToken = String(normalizeVersion(fromVersion));
  const toVersionToken = String(normalizeVersion(toVersion));

  state.stale_reads.total += 1;
  incrementCounter(state.stale_reads.by_section, sectionToken, 1);
  incrementCounter(state.stale_reads.by_reason, reasonToken, 1);
  incrementCounter(state.stale_reads.by_from_version, fromVersionToken, 1);
  incrementCounter(state.stale_reads.by_to_version, toVersionToken, 1);
  state.stale_reads.last_detected_at = ts;
  state.stale_reads.last_reason = reasonToken;

  return {
    ts,
    section: sectionToken,
    reason: reasonToken,
    fromVersion: normalizeVersion(fromVersion),
    toVersion: normalizeVersion(toVersion),
  };
}

export function recordSettingsMigration({
  fromVersion = 0,
  toVersion = 0,
} = {}) {
  const ts = new Date().toISOString();
  const fromVersionToken = String(normalizeVersion(fromVersion));
  const toVersionToken = String(normalizeVersion(toVersion));

  state.migrations.total += 1;
  incrementCounter(state.migrations.by_from_version, fromVersionToken, 1);
  incrementCounter(state.migrations.by_to_version, toVersionToken, 1);
  state.migrations.last_migration_at = ts;
  state.migrations.last_from_version = normalizeVersion(fromVersion);
  state.migrations.last_to_version = normalizeVersion(toVersion);

  return {
    ts,
    fromVersion: normalizeVersion(fromVersion),
    toVersion: normalizeVersion(toVersion),
  };
}

export function getSettingsPersistenceCountersSnapshot() {
  return cloneJson(state);
}
