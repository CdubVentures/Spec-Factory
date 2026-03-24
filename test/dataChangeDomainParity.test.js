import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA_CHANGE_EVENT_DOMAIN_MAP } from '../src/core/events/dataChangeContract.js';
import { DATA_CHANGE_EVENT_DOMAIN_FALLBACK } from '../tools/gui-react/src/features/data-change/index.js';

function normalizedDomainSet(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(
    source
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean),
  )].sort();
}

test('backend and frontend data-change event domain maps stay in parity', () => {
  const backendEvents = Object.keys(DATA_CHANGE_EVENT_DOMAIN_MAP).sort();
  const frontendEvents = Object.keys(DATA_CHANGE_EVENT_DOMAIN_FALLBACK).sort();

  assert.deepEqual(frontendEvents, backendEvents);

  for (const eventName of backendEvents) {
    const backendDomains = normalizedDomainSet(DATA_CHANGE_EVENT_DOMAIN_MAP[eventName]);
    const frontendDomains = normalizedDomainSet(DATA_CHANGE_EVENT_DOMAIN_FALLBACK[eventName]);
    assert.deepEqual(
      frontendDomains,
      backendDomains,
      `domain mismatch for event '${eventName}'`,
    );
  }
});
