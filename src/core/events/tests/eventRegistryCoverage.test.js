import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DATA_CHANGE_EVENT_DOMAIN_MAP,
} from '../dataChangeContract.js';
import {
  KNOWN_DATA_CHANGE_DOMAINS,
} from '../../../../tools/gui-react/src/features/data-change/index.js';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full.endsWith('.js') ? [full] : [];
  });
}

function isProductionFile(file) {
  const normalized = file.replace(/\\/g, '/');
  return !normalized.includes('/tests/') && !normalized.includes('/__tests__/');
}

function lineOf(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function dataChangeEmitCalls() {
  const files = ['src/core', 'src/features', 'src/app']
    .flatMap(walk)
    .filter(isProductionFile);
  return files.flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const calls = [];
    const directRe = /emitDataChange\s*\(\s*\{([\s\S]*?)\n\s*\}\s*\)/g;
    let match;
    while ((match = directRe.exec(source))) {
      const body = match[1];
      const event = body.match(/event\s*:\s*['"]([^'"]+)['"]/)?.[1] || '';
      if (!event) continue;
      calls.push({
        kind: 'emitDataChange',
        file,
        line: lineOf(source, match.index),
        event,
        hasBroadcastWs: /\bbroadcastWs\b/.test(body),
      });
    }
    const emitArgsRe = /emitArgs\s*:\s*\{([\s\S]*?)\n\s*\}/g;
    while ((match = emitArgsRe.exec(source))) {
      const body = match[1];
      const event = body.match(/event\s*:\s*['"]([^'"]+)['"]/)?.[1] || '';
      if (!event) continue;
      calls.push({
        kind: 'emitArgs',
        file,
        line: lineOf(source, match.index),
        event,
        hasBroadcastWs: true,
      });
    }
    return calls;
  });
}

test('all production data-change emits use registered event names', () => {
  const registeredEvents = new Set(Object.keys(DATA_CHANGE_EVENT_DOMAIN_MAP));
  const missing = dataChangeEmitCalls()
    .filter((call) => !registeredEvents.has(call.event))
    .map((call) => `${call.event} at ${call.file}:${call.line}`);

  assert.deepEqual(missing, []);
});

test('direct production data-change emits include broadcastWs', () => {
  const missingBroadcast = dataChangeEmitCalls()
    .filter((call) => call.kind === 'emitDataChange')
    .filter((call) => !call.hasBroadcastWs)
    .map((call) => `${call.event} at ${call.file}:${call.line}`);

  assert.deepEqual(missingBroadcast, []);
});

test('registered data-change domains all have frontend invalidation templates', () => {
  const knownDomains = new Set(KNOWN_DATA_CHANGE_DOMAINS);
  const unknownDomains = Object.entries(DATA_CHANGE_EVENT_DOMAIN_MAP)
    .flatMap(([event, domains]) => domains.map((domain) => ({ event, domain })))
    .filter(({ domain }) => !knownDomains.has(domain))
    .map(({ event, domain }) => `${event}:${domain}`);

  assert.deepEqual(unknownDomains, []);
});

test('frontend data-change domains all have at least one registered event', () => {
  const eventDomains = new Set(
    Object.values(DATA_CHANGE_EVENT_DOMAIN_MAP).flatMap((domains) => domains),
  );
  const orphanDomains = KNOWN_DATA_CHANGE_DOMAINS
    .filter((domain) => !eventDomains.has(domain));

  assert.deepEqual(orphanDomains, []);
});
