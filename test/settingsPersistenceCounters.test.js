import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSettingsPersistenceCountersSnapshot,
  recordSettingsMigration,
  recordSettingsStaleRead,
  recordSettingsWriteAttempt,
  recordSettingsWriteOutcome,
  resetSettingsPersistenceCounters,
} from '../src/observability/settingsPersistenceCounters.js';

test('settings persistence counters track write attempts and outcomes by section/target', () => {
  resetSettingsPersistenceCounters();
  recordSettingsWriteAttempt({ sections: ['runtime'], target: 'runtime-settings-route' });
  recordSettingsWriteOutcome({ sections: ['runtime'], target: 'runtime-settings-route', success: true });
  recordSettingsWriteAttempt({ sections: ['runtime'], target: 'runtime-settings-route' });
  recordSettingsWriteOutcome({
    sections: ['runtime'],
    target: 'runtime-settings-route',
    success: false,
    reason: 'runtime_settings_persist_failed',
  });

  const snapshot = getSettingsPersistenceCountersSnapshot();
  assert.equal(snapshot.writes.attempt_total, 2);
  assert.equal(snapshot.writes.success_total, 1);
  assert.equal(snapshot.writes.failed_total, 1);
  assert.equal(snapshot.writes.by_section.runtime.attempt_total, 2);
  assert.equal(snapshot.writes.by_section.runtime.success_total, 1);
  assert.equal(snapshot.writes.by_section.runtime.failed_total, 1);
  assert.equal(snapshot.writes.by_target['runtime-settings-route'].attempt_total, 2);
  assert.equal(snapshot.writes.by_target['runtime-settings-route'].success_total, 1);
  assert.equal(snapshot.writes.by_target['runtime-settings-route'].failed_total, 1);
});

test('settings persistence counters track stale-read and migration telemetry', () => {
  resetSettingsPersistenceCounters();
  recordSettingsStaleRead({
    section: 'user-settings',
    reason: 'schema_version_outdated',
    fromVersion: 1,
    toVersion: 2,
  });
  recordSettingsMigration({
    fromVersion: 1,
    toVersion: 2,
  });

  const snapshot = getSettingsPersistenceCountersSnapshot();
  assert.equal(snapshot.stale_reads.total, 1);
  assert.equal(snapshot.stale_reads.by_reason.schema_version_outdated, 1);
  assert.equal(snapshot.stale_reads.by_from_version['1'], 1);
  assert.equal(snapshot.migrations.total, 1);
  assert.equal(snapshot.migrations.by_from_version['1'], 1);
  assert.equal(snapshot.migrations.by_to_version['2'], 1);
});
