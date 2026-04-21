// WHY: Boundary contract — every module that shows in the Pipeline Settings
// sidebar must have a typed settings schema in the generated finder registry,
// and every schema entry must be structurally valid. Catches a missed registry
// field or stale codegen at test time, before the browser renders an empty tab.

import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { MODULE_SETTINGS_SECTIONS } from '../moduleSettingsSections.generated.ts';
import {
  FINDER_SETTINGS_REGISTRY,
  FINDER_IDS_WITH_SETTINGS,
  type FinderSettingsEntry,
} from '../finderSettingsRegistry.generated.ts';

const ALLOWED_TYPES: ReadonlySet<string> = new Set(['bool', 'int', 'float', 'string', 'enum', 'intMap']);

describe('finder settings registry contract', () => {
  it('every sidebar section has a corresponding entry in FINDER_SETTINGS_REGISTRY', () => {
    for (const section of MODULE_SETTINGS_SECTIONS) {
      const schema = FINDER_SETTINGS_REGISTRY[section.moduleId as keyof typeof FINDER_SETTINGS_REGISTRY];
      ok(schema, `Missing settings schema for moduleId="${section.moduleId}" (section "${section.id}")`);
    }
  });

  it('every registry moduleId matches a sidebar section (no orphans)', () => {
    const sectionIds = new Set(MODULE_SETTINGS_SECTIONS.map((s) => s.moduleId));
    for (const moduleId of FINDER_IDS_WITH_SETTINGS) {
      ok(sectionIds.has(moduleId), `Orphan settings schema for "${moduleId}" — no matching section`);
    }
  });

  it('every schema entry has a structurally valid shape', () => {
    for (const moduleId of FINDER_IDS_WITH_SETTINGS) {
      const schema = FINDER_SETTINGS_REGISTRY[moduleId];
      for (const entry of schema) {
        ok(entry.key && entry.key.length > 0, `entry.key is required (${moduleId})`);
        ok(ALLOWED_TYPES.has(entry.type), `entry.type "${entry.type}" not allowed (${moduleId}.${entry.key})`);
        ok(
          entry.default !== undefined,
          `entry.default is required (${moduleId}.${entry.key})`,
        );
        if (entry.type === 'enum') {
          ok(
            Array.isArray(entry.allowed) && entry.allowed.length > 0,
            `enum entry must declare allowed values (${moduleId}.${entry.key})`,
          );
          ok(
            entry.allowed!.includes(entry.default as string),
            `enum default "${entry.default}" must be one of allowed (${moduleId}.${entry.key})`,
          );
        }
        if (entry.type === 'intMap') {
          ok(
            Array.isArray(entry.keys) && entry.keys.length > 0,
            `intMap entry must declare keys (${moduleId}.${entry.key})`,
          );
          ok(
            entry.keyLabels && typeof entry.keyLabels === 'object',
            `intMap entry must declare keyLabels (${moduleId}.${entry.key})`,
          );
          ok(
            entry.default && typeof entry.default === 'object',
            `intMap default must be an object (${moduleId}.${entry.key})`,
          );
          const defaultKeys = new Set(Object.keys(entry.default as Record<string, number>));
          for (const k of entry.keys!) {
            ok(
              defaultKeys.has(k),
              `intMap default missing key "${k}" (${moduleId}.${entry.key})`,
            );
          }
        }
      }
    }
  });

  it('widget entries reference non-empty widget names', () => {
    for (const moduleId of FINDER_IDS_WITH_SETTINGS) {
      for (const entry of FINDER_SETTINGS_REGISTRY[moduleId]) {
        if (entry.widget !== undefined) {
          ok(entry.widget.length > 0, `widget name must be non-empty (${moduleId}.${entry.key})`);
        }
      }
    }
  });

  it('widget childKeys reference keys that exist in the same schema', () => {
    for (const moduleId of FINDER_IDS_WITH_SETTINGS) {
      const schema = FINDER_SETTINGS_REGISTRY[moduleId];
      const existingKeys = new Set(schema.map((e: FinderSettingsEntry) => e.key));
      for (const entry of schema) {
        const child = (entry.widgetProps as { childKeys?: readonly string[] } | undefined)?.childKeys;
        if (Array.isArray(child)) {
          for (const k of child) {
            ok(
              existingKeys.has(k),
              `widget childKey "${k}" not found in schema (${moduleId}.${entry.key})`,
            );
          }
        }
      }
    }
  });

  it('registry + sidebar sets are equal in size', () => {
    strictEqual(
      FINDER_IDS_WITH_SETTINGS.length,
      MODULE_SETTINGS_SECTIONS.length,
      'FINDER_IDS_WITH_SETTINGS count must equal MODULE_SETTINGS_SECTIONS count',
    );
  });
});
