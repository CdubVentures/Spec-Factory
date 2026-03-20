// WHY: O(1) Feature Scaling — auto-generates RuntimeSettingDefaults interface
// and enum union types from the canonical RUNTIME_SETTINGS_REGISTRY.
// Adding a new setting = add one registry entry. Zero manual TS type edits.
//
// Usage: node tools/gui-react/scripts/generateManifestTypes.js
// Output: writes tools/gui-react/src/stores/runtimeSettingsManifestTypes.ts

import { RUNTIME_SETTINGS_REGISTRY } from '../../../src/shared/settingsRegistry.js';

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

// --- CLI: write the file when run directly ---
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const outPath = path.resolve(
    import.meta.dirname,
    '../src/stores/runtimeSettingsManifestTypes.ts'
  );
  const content = generateManifestTypes(RUNTIME_SETTINGS_REGISTRY);
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote ${outPath} (${content.split('\n').length} lines)`);
}
