import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLearningProfile, persistLearningProfile } from '../selfImproveLoop.js';
import { SpecDb } from '../../../../db/specDb.js';

function makeSpecDb() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

const JOB = {
  productId: 'logitech-g502-x-plus',
  category: 'mouse',
  identityLock: { brand: 'Logitech', model: 'G502 X Plus', variant: '' },
};

function makeStorage() {
  const written = [];
  return {
    written,
    readJsonOrNull: async () => null,
    writeObject: async (key, buf, opts) => {
      written.push({ key, data: JSON.parse(buf.toString('utf8')), opts });
    },
  };
}

test('loadLearningProfile returns SQL row when profile exists', async () => {
  const specDb = makeSpecDb();
  const profileId = `mouse/${JOB.productId}`;
  specDb.upsertLearningProfile({
    profile_id: profileId,
    category: 'mouse',
    brand: 'Logitech',
    model: 'G502 X Plus',
    variant: '',
    runs_total: 3,
    validated_runs: 2,
    validated: 1,
    unknown_field_rate: 0.1,
    unknown_field_rate_avg: 0.12,
    parser_health_avg: 0.85,
    preferred_urls: ['https://example.com/g502'],
    feedback_urls: [],
    uncertain_fields: [],
    host_stats: [],
    critical_fields_below: [],
    last_run: {},
    parser_health: {},
    updated_at: '2026-03-27T12:00:00.000Z',
  });

  const result = await loadLearningProfile({
    storage: makeStorage(),
    config: {},
    category: 'mouse',
    job: JOB,
    specDb,
  });

  assert.ok(result.profile, 'profile should not be null');
  assert.equal(result.profile.runs_total, 3);
  assert.equal(result.profile.validated_runs, 2);
  assert.deepEqual(result.profile.preferred_urls, ['https://example.com/g502']);
});

test('loadLearningProfile returns null profile when not in SQL', async () => {
  const specDb = makeSpecDb();
  const result = await loadLearningProfile({
    storage: makeStorage(),
    config: {},
    category: 'mouse',
    job: JOB,
    specDb,
  });

  assert.equal(result.profile, null);
  assert.ok(result.profileId, 'profileId should still be set');
  assert.ok(result.profileKey, 'profileKey should still be set');
});

test('loadLearningProfile returns null profile when no specDb', async () => {
  const result = await loadLearningProfile({
    storage: makeStorage(),
    config: {},
    category: 'mouse',
    job: JOB,
    specDb: null,
  });

  assert.equal(result.profile, null);
});

test('persistLearningProfile writes to SQL and is readable back', async () => {
  const specDb = makeSpecDb();
  const storage = makeStorage();
  const learningProfile = {
    profileId: 'mouse-logitech-g502-x-plus-',
    profileKey: 'specs/outputs/_learning/mouse/profiles/mouse-logitech-g502-x-plus-.json',
    profile: null,
  };

  await persistLearningProfile({
    storage,
    config: {},
    category: 'mouse',
    job: JOB,
    sourceResults: [],
    summary: { validated: true, validated_reason: 'ok', confidence: 0.95, coverage_overall_percent: 80 },
    learningProfile,
    discoveryResult: { candidates: [] },
    runBase: 'specs/outputs/mouse/logitech-g502-x-plus/run-001',
    runId: 'run-001',
    specDb,
  });

  const sqlProfile = specDb.getLearningProfile(`mouse/${JOB.productId}`);
  assert.ok(sqlProfile, 'profile should exist in SQL');
  assert.equal(sqlProfile.category, 'mouse');
  assert.equal(sqlProfile.validated, true);

  // Run log should also be written
  const logWrite = storage.written.find((w) => w.key.includes('logs/learning.json'));
  assert.ok(logWrite, 'run log should be written');
});

test('persistLearningProfile without specDb still writes run log', async () => {
  const storage = makeStorage();
  const learningProfile = {
    profileId: 'mouse-logitech-g502-x-plus-',
    profileKey: 'specs/outputs/_learning/mouse/profiles/mouse-logitech-g502-x-plus-.json',
    profile: null,
  };

  await persistLearningProfile({
    storage,
    config: {},
    category: 'mouse',
    job: JOB,
    sourceResults: [],
    summary: { validated: false, coverage_overall_percent: 50 },
    learningProfile,
    discoveryResult: { candidates: [] },
    runBase: 'specs/outputs/mouse/logitech-g502-x-plus/run-002',
    runId: 'run-002',
    specDb: null,
  });

  const logWrite = storage.written.find((w) => w.key.includes('logs/learning.json'));
  assert.ok(logWrite, 'run log should be written even without specDb');
  // No profile JSON should be written (no _learning/...profiles/... key)
  const profileWrite = storage.written.find((w) => w.key.includes('profiles/'));
  assert.equal(profileWrite, undefined, 'no profile JSON should be written');
});
