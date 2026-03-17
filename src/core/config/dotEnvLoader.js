// WHY: .env file parser extracted from src/config.js (Phase 4).
// Separated because it's a self-contained utility with no config domain dependencies.

import fs from 'node:fs';
import path from 'node:path';

function parseDotEnvValue(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) {
    return '';
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
  }

  const commentIndex = trimmed.indexOf(' #');
  return (commentIndex >= 0 ? trimmed.slice(0, commentIndex) : trimmed).trim();
}

export function loadDotEnvFile(dotEnvPath = '.env', options = {}) {
  const overrideExisting = typeof options === 'boolean'
    ? options
    : Boolean(options?.overrideExisting);
  const overrideExistingKeys = Array.isArray(options?.overrideExistingKeys)
    ? new Set(options.overrideExistingKeys.map((key) => String(key || '').trim()).filter(Boolean))
    : null;
  const fullPath = path.resolve(dotEnvPath);
  let content = '';

  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const withoutExport = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;
    const separatorIndex = withoutExport.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = withoutExport.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    const hasExistingValue = process.env[key] !== undefined && process.env[key] !== '';
    const shouldOverrideKey = overrideExisting || Boolean(overrideExistingKeys?.has(key));
    if (hasExistingValue && !shouldOverrideKey) {
      continue;
    }

    const rawValue = withoutExport.slice(separatorIndex + 1);
    process.env[key] = parseDotEnvValue(rawValue);
  }

  return true;
}
