import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_MANIFEST_KEYS } from '../src/core/config/manifest.js';

const REPO_ROOT = process.cwd();

const FILES_TO_SCAN = [
  'src/config.js',
  'src/api/guiServer.js',
  'src/api/routes/configRoutes.js',
  'src/catalog/activeFilteringLoader.js',
  'tools/gui-launcher.mjs',
];

const IGNORE_ENV_KEYS = new Set([
  'USERPROFILE',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'SystemRoot',
  '__GUI_DIST_ROOT',
]);

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function collectReferencedEnvKeys(raw) {
  const keys = new Set();
  const patterns = [
    /process\.env\.([A-Z0-9_]+)/g,
    /parse(?:Int|Float|Bool|Json)Env\('([A-Z0-9_]+)'/g,
    /envToken\('([A-Z0-9_]+)'/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(raw)) !== null) {
      if (match[1]) keys.add(match[1]);
    }
  }
  return keys;
}

function main() {
  const definedKeys = new Set(CONFIG_MANIFEST_KEYS);

  const referencedKeys = new Set();
  for (const relativePath of FILES_TO_SCAN) {
    const fullPath = path.join(REPO_ROOT, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    const raw = readText(fullPath);
    const fileKeys = collectReferencedEnvKeys(raw);
    for (const key of fileKeys) referencedKeys.add(key);
  }

  const missing = [...referencedKeys]
    .filter((key) => !definedKeys.has(key))
    .filter((key) => !IGNORE_ENV_KEYS.has(key))
    .filter((key) => key.length > 1)
    .sort();

  if (missing.length > 0) {
    console.error('[env-check] Missing keys in config manifest:');
    for (const key of missing) {
      console.error(`- ${key}`);
    }
    process.exit(1);
  }

  console.log(`[env-check] OK (${referencedKeys.size} referenced keys covered)`);
}

main();
