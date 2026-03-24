// WHY: Contract test for TS manifest types codegen.
// Verifies the generated output matches the expected interface shape
// and includes all registry entries.

import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import { generateManifestTypes } from '../tools/gui-react/scripts/generateManifestTypes.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../src/shared/settingsRegistry.js';

describe('generateManifestTypes', () => {
  const output = generateManifestTypes(RUNTIME_SETTINGS_REGISTRY);

  it('produces a non-empty string', () => {
    ok(typeof output === 'string' && output.length > 0);
  });

  it('contains the RuntimeSettingDefaults interface', () => {
    ok(output.includes('export interface RuntimeSettingDefaults {'));
  });

  it('contains a property for every non-routeOnly registry entry', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.routeOnly) continue;
      const key = entry.configKey || entry.key;
      ok(output.includes(`${key}:`), `missing property: ${key}`);
    }
  });

  it('int entries map to number type', () => {
    const intEntries = RUNTIME_SETTINGS_REGISTRY.filter(e => e.type === 'int' && !e.routeOnly);
    for (const entry of intEntries) {
      const key = entry.configKey || entry.key;
      const pattern = new RegExp(`${key}:\\s*number`);
      ok(pattern.test(output), `${key} should be typed as number`);
    }
  });

  it('bool entries map to boolean type', () => {
    const boolEntries = RUNTIME_SETTINGS_REGISTRY.filter(e => e.type === 'bool' && !e.routeOnly);
    for (const entry of boolEntries) {
      const key = entry.configKey || entry.key;
      const pattern = new RegExp(`${key}:\\s*boolean`);
      ok(pattern.test(output), `${key} should be typed as boolean`);
    }
  });

  it('float entries map to number type', () => {
    const floatEntries = RUNTIME_SETTINGS_REGISTRY.filter(e => e.type === 'float' && !e.routeOnly);
    for (const entry of floatEntries) {
      const key = entry.configKey || entry.key;
      const pattern = new RegExp(`${key}:\\s*number`);
      ok(pattern.test(output), `${key} should be typed as number`);
    }
  });

  it('string entries map to string type', () => {
    const stringEntries = RUNTIME_SETTINGS_REGISTRY.filter(e =>
      e.type === 'string' && !e.routeOnly
    );
    for (const entry of stringEntries) {
      const key = entry.configKey || entry.key;
      const pattern = new RegExp(`${key}:\\s*string`);
      ok(pattern.test(output), `${key} should be typed as string`);
    }
  });

  it('enum entries generate union types', () => {
    const enumEntries = RUNTIME_SETTINGS_REGISTRY.filter(e =>
      (e.type === 'enum' || e.type === 'csv_enum') && e.allowed && !e.routeOnly
    );
    ok(enumEntries.length > 0, 'should have at least one enum entry');
    for (const entry of enumEntries) {
      const key = entry.configKey || entry.key;
      ok(output.includes(`${key}:`), `missing enum property: ${key}`);
    }
  });

  it('contains exported union type definitions for enums', () => {
    ok(output.includes('RuntimeResumeMode'), 'should export RuntimeResumeMode');
    ok(output.includes('RuntimeRepairDedupeRule'), 'should export RuntimeRepairDedupeRule');
  });

  it('contains the auto-generated header comment', () => {
    ok(output.includes('AUTO-GENERATED'), 'should have auto-generated comment');
  });
});
