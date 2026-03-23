// WHY: O(1) Feature Scaling — auto-generates RuntimeSettingDefaults interface,
// enum union types, and settingsDefaults.d.ts from the canonical registry.
// Adding a new setting = add one registry entry. Zero manual TS type edits.
//
// Usage: node tools/gui-react/scripts/generateManifestTypes.js
// Output: writes tools/gui-react/src/stores/runtimeSettingsManifestTypes.ts
//         writes src/shared/settingsDefaults.d.ts

import { RUNTIME_SETTINGS_REGISTRY, UI_SETTINGS_REGISTRY, STORAGE_SETTINGS_REGISTRY } from '../../../src/shared/settingsRegistry.js';

const REGISTRY_TYPE_TO_TS = {
  int: 'number',
  float: 'number',
  bool: 'boolean',
  string: 'string',
  enum: null,     // uses union type
  csv_enum: null, // uses union type (stored as string)
};

// WHY: Enum entries get named union types for type safety.
// The type name is derived from the registry key by convention.
const ENUM_TYPE_NAMES = {
  resumeMode: 'RuntimeResumeMode',
  scannedPdfOcrBackend: 'RuntimeOcrBackend',
  repairDedupeRule: 'RuntimeRepairDedupeRule',
  searchEngines: 'string', // csv_enum — stored as comma-separated string
  searchEnginesFallback: 'string',
  pdfPreferredBackend: 'string',
  staticDomMode: 'string',
  batchStrategy: 'string',
};

/**
 * Generate the TypeScript source for runtimeSettingsManifestTypes.ts
 * @param {ReadonlyArray<object>} registry - RUNTIME_SETTINGS_REGISTRY
 * @returns {string} TypeScript source code
 */
export function generateManifestTypes(registry) {
  const lines = [];
  const unionTypes = [];

  lines.push('// AUTO-GENERATED from RUNTIME_SETTINGS_REGISTRY — do not edit manually.');
  lines.push('// Run: node tools/gui-react/scripts/generateManifestTypes.js');
  lines.push('');

  // Collect enum union types
  for (const entry of registry) {
    if (entry.routeOnly) continue;
    if ((entry.type === 'enum' || entry.type === 'csv_enum') && entry.allowed) {
      const typeName = ENUM_TYPE_NAMES[entry.key] || ENUM_TYPE_NAMES[entry.cfgKey];
      if (typeName && typeName !== 'string' && !unionTypes.find(u => u.name === typeName)) {
        const members = entry.allowed.map(v => `'${v}'`).join(' | ');
        unionTypes.push({ name: typeName, members });
      }
    }
  }

  // Emit union types
  for (const { name, members } of unionTypes) {
    lines.push(`export type ${name} = ${members};`);
  }
  if (unionTypes.length > 0) lines.push('');

  // Emit interface
  lines.push('export interface RuntimeSettingDefaults {');
  for (const entry of registry) {
    if (entry.routeOnly) continue;
    const key = entry.cfgKey || entry.key;
    let tsType = REGISTRY_TYPE_TO_TS[entry.type];

    // For enum types, use named union or string
    if (tsType === null) {
      const typeName = ENUM_TYPE_NAMES[entry.key] || ENUM_TYPE_NAMES[entry.cfgKey];
      tsType = typeName || 'string';
    }

    lines.push(`  ${key}: ${tsType};`);

    // WHY: Aliased keys must appear under BOTH names to match derived defaults shape
    if (entry.cfgKey && entry.cfgKey !== entry.key) {
      lines.push(`  ${entry.key}: ${tsType};`);
    }
  }
  lines.push('}');
  lines.push('');
  lines.push("export type RuntimeProfile = 'standard';");
  lines.push("export type SearxngEngine = 'google' | 'bing' | 'google-proxy' | 'duckduckgo' | 'brave';");
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate settingsDefaults.d.ts — typed declarations for the JS settingsDefaults module.
 * WHY: The backend is JS ESM; frontend TS needs declarations for cross-boundary imports.
 * This replaces the old handwritten .d.ts that drifted from the registry.
 * @param {ReadonlyArray<object>} registry - RUNTIME_SETTINGS_REGISTRY
 * @param {{ storageRegistry?: ReadonlyArray<object>, uiRegistry?: ReadonlyArray<object> }} [opts]
 * @returns {string} TypeScript declaration source
 */
export function generateSettingsDefaultsDeclaration(registry, opts = {}) {
  const { storageRegistry = [], uiRegistry = [] } = opts;
  const lines = [];

  lines.push('// AUTO-GENERATED from RUNTIME_SETTINGS_REGISTRY — do not edit manually.');
  lines.push('// Run: node tools/gui-react/scripts/generateManifestTypes.js');
  lines.push('');

  // --- SETTINGS_DEFAULTS shape ---
  lines.push('export declare const SETTINGS_DEFAULTS: {');
  lines.push('  readonly convergence: Readonly<Record<string, number | boolean>>;');
  lines.push('  readonly runtime: Readonly<Record<string, string | number | boolean>>;');
  // WHY: Derive storage defaults shape from STORAGE_SETTINGS_REGISTRY.
  // Matches deriveStorageDefaults: excludes secret and computed entries.
  lines.push('  readonly storage: Readonly<{');
  for (const entry of storageRegistry) {
    if (entry.secret || entry.computed) continue;
    let tsType;
    if (entry.type === 'enum' && entry.allowed) {
      tsType = entry.allowed.map(v => `'${v}'`).join(' | ');
    } else if (entry.type === 'bool') {
      tsType = 'boolean';
    } else {
      tsType = 'string';
    }
    lines.push(`    ${entry.key}: ${tsType};`);
  }
  lines.push('  }>;');

  // WHY: Derive ui defaults shape from UI_SETTINGS_REGISTRY.
  lines.push('  readonly ui: Readonly<{');
  for (const entry of uiRegistry) {
    const tsType = entry.type === 'bool' ? 'boolean' : 'string';
    lines.push(`    ${entry.key}: ${tsType};`);
  }
  lines.push('  }>;');
  lines.push('  readonly autosave: Readonly<{');
  lines.push('    debounceMs: Readonly<{');
  lines.push('      runtime: number;');
  lines.push('      storage: number;');
  lines.push('      llmRoutes: number;');
  lines.push('      uiSettings: number;');
  lines.push('      studioDocs: number;');
  lines.push('      studioMap: number;');
  lines.push('    }>;');
  lines.push('    statusMs: Readonly<{');
  lines.push('      studioSavedIndicatorReset: number;');
  lines.push('    }>;');
  lines.push('  }>;');
  lines.push('};');
  lines.push('');

  // --- SETTINGS_OPTION_VALUES shape ---
  // WHY: Derive runtime option keys from the registry so new enums auto-appear
  const enumKeys = registry
    .filter(e => !e.routeOnly && (e.type === 'enum' || e.type === 'csv_enum') && e.allowed)
    .map(e => e.key);

  lines.push('export declare const SETTINGS_OPTION_VALUES: {');
  lines.push('  readonly runtime: Readonly<{');
  for (const key of enumKeys) {
    lines.push(`    ${key}: readonly string[];`);
  }
  lines.push('  }>;');
  // WHY: Derive storage option values from STORAGE_SETTINGS_REGISTRY.
  const storageEnumKeys = storageRegistry
    .filter(e => (e.type === 'enum' || e.type === 'csv_enum') && e.allowed)
    .map(e => e.key);

  lines.push('  readonly storage: Readonly<{');
  for (const key of storageEnumKeys) {
    const entry = storageRegistry.find(e => e.key === key);
    const union = entry.allowed.map(v => `'${v}'`).join(' | ');
    lines.push(`    ${key}: readonly (${union})[];`);
  }
  lines.push('  }>;');
  lines.push('};');
  lines.push('');

  // --- SEARXNG_AVAILABLE_ENGINES ---
  lines.push('export declare const SEARXNG_AVAILABLE_ENGINES: readonly string[];');
  lines.push('');

  return lines.join('\n');
}

// --- CLI: write the file when run directly ---
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Write runtimeSettingsManifestTypes.ts
  const outPath = path.resolve(
    import.meta.dirname,
    '../src/stores/runtimeSettingsManifestTypes.ts'
  );
  const content = generateManifestTypes(RUNTIME_SETTINGS_REGISTRY);
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote ${outPath} (${content.split('\n').length} lines)`);

  // Write settingsDefaults.d.ts
  const dtsPath = path.resolve(
    import.meta.dirname,
    '../../../src/shared/settingsDefaults.d.ts'
  );
  const dtsContent = generateSettingsDefaultsDeclaration(RUNTIME_SETTINGS_REGISTRY, {
    storageRegistry: STORAGE_SETTINGS_REGISTRY,
    uiRegistry: UI_SETTINGS_REGISTRY,
  });
  fs.writeFileSync(dtsPath, dtsContent, 'utf8');
  console.log(`Wrote ${dtsPath} (${dtsContent.split('\n').length} lines)`);
}
