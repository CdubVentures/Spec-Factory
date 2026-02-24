import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_SHELL_PATH = resolve('tools/gui-react/src/components/layout/AppShell.tsx');

test('AppShell subscribes to test-import-progress channel', () => {
  const source = readFileSync(APP_SHELL_PATH, 'utf8');
  const subscribeCallMatch = source.match(/wsManager\.subscribe\(\[([\s\S]*?)\],\s*category\)/);
  assert.ok(subscribeCallMatch, 'expected AppShell wsManager.subscribe call');
  const channelsLiteral = subscribeCallMatch[1];
  assert.match(channelsLiteral, /'test-import-progress'/);
});

test('AppShell does not subscribe to queue channel', () => {
  const source = readFileSync(APP_SHELL_PATH, 'utf8');
  const subscribeCallMatch = source.match(/wsManager\.subscribe\(\[([\s\S]*?)\],\s*category\)/);
  assert.ok(subscribeCallMatch, 'expected AppShell wsManager.subscribe call');
  const channelsLiteral = subscribeCallMatch[1];
  assert.doesNotMatch(channelsLiteral, /'queue'/);
});
