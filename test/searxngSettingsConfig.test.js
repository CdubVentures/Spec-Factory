import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SETTINGS_PATH = 'tools/searxng/searxng/settings.yml';

function parseYamlScalar(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function readSearxngSettingsSummary() {
  const text = fs.readFileSync(SETTINGS_PATH, 'utf8');
  const lines = text.split(/\r?\n/);
  const stack = [];
  const keepOnlyEngines = [];
  const configuredEngines = [];
  let useDefaultSettingsValue = undefined;
  let autocomplete = undefined;

  for (const line of lines) {
    const withoutComment = line.replace(/\s+#.*$/, '');
    const trimmed = withoutComment.trim();
    if (!trimmed) continue;

    const indent = withoutComment.match(/^\s*/)?.[0]?.length || 0;
    while (stack.length && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const path = stack.map((entry) => entry.key).join('.');

    if (trimmed.startsWith('- name:')) {
      if (path === 'engines') {
        configuredEngines.push(parseYamlScalar(trimmed.slice('- name:'.length)));
      }
      continue;
    }

    if (trimmed.startsWith('- ')) {
      if (path === 'use_default_settings.engines.keep_only') {
        keepOnlyEngines.push(parseYamlScalar(trimmed.slice(2)));
      }
      continue;
    }

    const separator = trimmed.indexOf(':');
    if (separator < 0) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1);

    if (!rawValue.trim()) {
      stack.push({ indent, key });
      continue;
    }

    const value = parseYamlScalar(rawValue);
    const nextPath = path ? `${path}.${key}` : key;
    if (nextPath === 'use_default_settings') {
      useDefaultSettingsValue = value;
    } else if (nextPath === 'search.autocomplete') {
      autocomplete = value;
    }
  }

  return {
    keepOnlyEngines,
    configuredEngines,
    useDefaultSettingsValue,
    autocomplete,
  };
}

test('local searxng settings pin the supported engines and override autocomplete defaults', () => {
  const summary = readSearxngSettingsSummary();

  assert.notEqual(
    summary.useDefaultSettingsValue,
    true,
    'local searxng settings should not enable the full upstream default engine set',
  );

  assert.deepEqual(
    summary.keepOnlyEngines,
    ['google', 'bing', 'startpage', 'duckduckgo', 'brave'],
    'local searxng settings should keep only the supported upstream engines',
  );

  assert.deepEqual(
    summary.configuredEngines,
    ['google', 'bing', 'startpage', 'duckduckgo', 'brave'],
    'local searxng settings should explicitly configure only the supported engines',
  );

  assert.equal(
    summary.autocomplete,
    '',
    'local searxng settings should override autocomplete so upstream defaults do not reappear',
  );
});
