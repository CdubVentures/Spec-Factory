import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackEvents,
  makeEvent,
} from './helpers/runtimeOpsPhase132DataBuildersHarness.js';

test('buildFallbackEvents: returns empty arrays for no events', () => {
  const result = buildFallbackEvents([], {});
  assert.ok(result && typeof result === 'object');
  assert.ok(Array.isArray(result.events));
  assert.ok(Array.isArray(result.host_profiles));
  assert.equal(result.events.length, 0);
  assert.equal(result.host_profiles.length, 0);
});

test('buildFallbackEvents: maps scheduler_fallback_started events', () => {
  const events = [
    makeEvent('scheduler_fallback_started', {
      url: 'https://a.com/page',
      from_mode: 'http',
      to_mode: 'playwright',
      reason: '403 Forbidden',
      attempt: 1,
    }),
  ];
  const result = buildFallbackEvents(events, {});
  assert.equal(result.events.length, 1);
  const row = result.events[0];
  assert.equal(row.url, 'https://a.com/page');
  assert.equal(row.host, 'a.com');
  assert.equal(row.from_mode, 'http');
  assert.equal(row.to_mode, 'playwright');
  assert.equal(row.reason, '403 Forbidden');
  assert.equal(row.attempt, 1);
  assert.equal(row.result, 'pending');
});

test('buildFallbackEvents: maps scheduler_fallback_succeeded events', () => {
  const events = [
    makeEvent('scheduler_fallback_started', {
      url: 'https://a.com/page',
      from_mode: 'http',
      to_mode: 'playwright',
      reason: '403',
      attempt: 1,
    }, '2026-02-23T12:00:00.000Z'),
    makeEvent('scheduler_fallback_succeeded', {
      url: 'https://a.com/page',
      from_mode: 'http',
      to_mode: 'playwright',
      elapsed_ms: 1200,
    }, '2026-02-23T12:00:02.000Z'),
  ];
  const result = buildFallbackEvents(events, {});
  const succeeded = result.events.find((e) => e.result === 'succeeded');
  assert.ok(succeeded);
  assert.equal(succeeded.elapsed_ms, 1200);
});

test('buildFallbackEvents: maps scheduler_fallback_exhausted events', () => {
  const events = [
    makeEvent('scheduler_fallback_exhausted', {
      url: 'https://a.com/page',
      from_mode: 'http',
      to_mode: 'playwright',
      reason: 'all modes failed',
      attempt: 3,
    }),
  ];
  const result = buildFallbackEvents(events, {});
  assert.ok(result.events.length >= 1);
  const row = result.events.find((e) => e.result === 'exhausted');
  assert.ok(row);
});

test('buildFallbackEvents: builds host profiles with success rate', () => {
  const events = [
    makeEvent('scheduler_fallback_started', {
      url: 'https://a.com/1',
      from_mode: 'http',
      to_mode: 'playwright',
      reason: '403',
      attempt: 1,
    }, '2026-02-23T12:00:00.000Z'),
    makeEvent('scheduler_fallback_succeeded', {
      url: 'https://a.com/1',
      from_mode: 'http',
      to_mode: 'playwright',
      elapsed_ms: 500,
    }, '2026-02-23T12:00:01.000Z'),
    makeEvent('scheduler_fallback_started', {
      url: 'https://a.com/2',
      from_mode: 'http',
      to_mode: 'crawlee',
      reason: '403',
      attempt: 1,
    }, '2026-02-23T12:00:02.000Z'),
    makeEvent('scheduler_fallback_exhausted', {
      url: 'https://a.com/2',
      from_mode: 'http',
      to_mode: 'crawlee',
      reason: 'all failed',
      attempt: 3,
    }, '2026-02-23T12:00:03.000Z'),
  ];
  const result = buildFallbackEvents(events, {});
  assert.ok(result.host_profiles.length >= 1);
  const profile = result.host_profiles.find((p) => p.host === 'a.com');
  assert.ok(profile);
  assert.equal(profile.fallback_total, 2);
  assert.equal(profile.success_count, 1);
  assert.equal(profile.exhaustion_count, 1);
  assert.ok(profile.success_rate >= 0 && profile.success_rate <= 1);
  assert.ok(Array.isArray(profile.modes_used));
});

test('buildFallbackEvents: sorts events newest-first', () => {
  const events = [
    makeEvent('scheduler_fallback_started', {
      url: 'https://a.com/1',
      from_mode: 'http',
      to_mode: 'playwright',
      reason: '403',
      attempt: 1,
    }, '2026-02-23T12:00:00.000Z'),
    makeEvent('scheduler_fallback_started', {
      url: 'https://b.com/2',
      from_mode: 'http',
      to_mode: 'crawlee',
      reason: '403',
      attempt: 1,
    }, '2026-02-23T13:00:00.000Z'),
  ];
  const result = buildFallbackEvents(events, {});
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].host, 'b.com');
  assert.equal(result.events[1].host, 'a.com');
});

test('buildFallbackEvents: respects limit option', () => {
  const events = [
    makeEvent('scheduler_fallback_started', { url: 'https://a.com/1', from_mode: 'http', to_mode: 'playwright', reason: '403', attempt: 1 }, '2026-02-23T12:00:00.000Z'),
    makeEvent('scheduler_fallback_started', { url: 'https://b.com/2', from_mode: 'http', to_mode: 'crawlee', reason: '403', attempt: 1 }, '2026-02-23T12:01:00.000Z'),
    makeEvent('scheduler_fallback_started', { url: 'https://c.com/3', from_mode: 'http', to_mode: 'playwright', reason: '403', attempt: 1 }, '2026-02-23T12:02:00.000Z'),
  ];
  const result = buildFallbackEvents(events, { limit: 2 });
  assert.equal(result.events.length, 2);
});

test('buildFallbackEvents: handles missing payload fields gracefully', () => {
  const events = [
    makeEvent('scheduler_fallback_started', {}),
  ];
  const result = buildFallbackEvents(events, {});
  assert.equal(result.events.length, 1);
  const row = result.events[0];
  assert.equal(row.url, '');
  assert.equal(row.from_mode, '');
  assert.equal(row.to_mode, '');
  assert.equal(row.attempt, 0);
});

test('buildFallbackEvents: host profile modes_used collects distinct modes', () => {
  const events = [
    makeEvent('scheduler_fallback_started', { url: 'https://a.com/1', from_mode: 'http', to_mode: 'playwright', reason: '403', attempt: 1 }),
    makeEvent('scheduler_fallback_started', { url: 'https://a.com/2', from_mode: 'http', to_mode: 'crawlee', reason: '403', attempt: 1 }),
    makeEvent('scheduler_fallback_started', { url: 'https://a.com/3', from_mode: 'http', to_mode: 'playwright', reason: '403', attempt: 1 }),
  ];
  const result = buildFallbackEvents(events, {});
  const profile = result.host_profiles.find((p) => p.host === 'a.com');
  assert.ok(profile);
  assert.ok(profile.modes_used.includes('playwright'));
  assert.ok(profile.modes_used.includes('crawlee'));
  assert.ok(profile.modes_used.includes('http'));
});

test('buildFallbackEvents: fetch_finished with fallback flag creates event', () => {
  const events = [
    makeEvent('fetch_finished', {
      url: 'https://a.com/page',
      status_code: 200,
      fallback: true,
      fallback_from: 'http',
      fallback_to: 'playwright',
      fallback_reason: 'timeout',
      elapsed_ms: 800,
    }),
  ];
  const result = buildFallbackEvents(events, {});
  assert.ok(result.events.length >= 1);
  const row = result.events[0];
  assert.equal(row.url, 'https://a.com/page');
  assert.equal(row.result, 'succeeded');
});
