import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { EXTRACTION_PLUGIN_REGISTRY } from '../pluginRegistry.js';
import { EXTRACTION_STAGE_DEFS } from '../../../../core/config/runtimeStageDefs.js';

// WHY: Contract test that enforces every extraction plugin is fully wired.
// Adding a new plugin to EXTRACTION_PLUGIN_REGISTRY without wiring the rest
// will fail this test and tell you exactly what's missing.

const registryKeys = Object.keys(EXTRACTION_PLUGIN_REGISTRY).sort();
const stageDefKeys = EXTRACTION_STAGE_DEFS.map((d) => d.key).sort();

describe('extraction plugin registry contract', () => {
  // ── 1. Every registered plugin has a stage def (panel + tab wiring) ──

  it('every plugin in EXTRACTION_PLUGIN_REGISTRY has a matching EXTRACTION_STAGE_DEF', () => {
    const missing = registryKeys.filter((k) => !stageDefKeys.includes(k));
    assert.deepEqual(
      missing, [],
      `Plugin(s) registered but missing from EXTRACTION_STAGE_DEFS (no panel/tab): ${missing.join(', ')}. ` +
      'Add an entry to src/core/config/runtimeStageDefs.js and run codegen.',
    );
  });

  // ── 2. Every stage def has a registered plugin (no phantom tabs) ──

  it('every EXTRACTION_STAGE_DEF has a matching plugin in EXTRACTION_PLUGIN_REGISTRY', () => {
    const phantom = stageDefKeys.filter((k) => !registryKeys.includes(k));
    assert.deepEqual(
      phantom, [],
      `Stage def(s) exist but no plugin registered: ${phantom.join(', ')}. ` +
      'Either add the plugin to EXTRACTION_PLUGIN_REGISTRY or remove the stage def.',
    );
  });

  // ── 3. Every plugin has the required contract shape ──

  for (const [name, plugin] of Object.entries(EXTRACTION_PLUGIN_REGISTRY)) {
    it(`plugin "${name}" has required 'name' field matching registry key`, () => {
      assert.equal(plugin.name, name, `plugin.name should be '${name}'`);
    });

    it(`plugin "${name}" has required 'onExtract' function`, () => {
      assert.equal(typeof plugin.onExtract, 'function');
    });

    it(`plugin "${name}" has 'phase' field ('capture' | 'transform' | 'lifecycle')`, () => {
      const valid = ['capture', 'transform', 'lifecycle'];
      const phase = plugin.phase || 'capture';
      assert.ok(valid.includes(phase), `phase should be one of ${valid.join('/')}, got '${phase}'`);
    });

    it(`plugin "${name}" has 'summarize' function for event telemetry`, () => {
      assert.equal(
        typeof plugin.summarize, 'function',
        `Plugin "${name}" must have a summarize(result) method for event telemetry. ` +
        'This method returns a JSON-serializable summary (no Buffers).',
      );
    });
  }

  // ── 4. Stage defs have required metadata ──

  for (const def of EXTRACTION_STAGE_DEFS) {
    it(`stage def "${def.key}" has label, tip, and tone`, () => {
      assert.ok(def.label, `stage def "${def.key}" must have a label`);
      assert.ok(def.tip, `stage def "${def.key}" must have a tip`);
      assert.ok(['info', 'warning', 'accent'].includes(def.tone), `stage def "${def.key}" tone must be info/warning/accent`);
    });
  }
});
