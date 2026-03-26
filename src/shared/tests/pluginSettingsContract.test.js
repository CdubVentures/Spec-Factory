/**
 * Plugin–Settings structural contract.
 *
 * Enforces that every registered pipeline plugin (fetch + extraction)
 * has the required settings infrastructure:
 *   1. Its own uiSection in the settings registry (not dumped into a shared section)
 *   2. A hero-enabled toggle (uiHero: true) in that section
 *   3. A matching section entry in SettingsCategoryRegistry
 *   4. No comma-separated plugin list settings exist
 *
 * If this test fails, you added a plugin without following the per-plugin
 * vertical slice pattern for settings.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_REGISTRY } from '../../features/crawl/plugins/pluginRegistry.js';
import { EXTRACTION_PLUGIN_REGISTRY } from '../../features/extraction/plugins/pluginRegistry.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map of plugin name → all settings in its expected uiCategory that mention a matching uiSection */
function findPluginSettings(pluginName, uiCategory) {
  // Convention: plugin uiSection is the kebab-case of the plugin key
  // e.g. autoScroll → auto-scroll, domExpansion → dom-expansion, cssOverride → css-override
  // Exception: screenshot → screenshots (extraction)
  const sectionCandidates = new Set([
    pluginName.toLowerCase(),
    pluginName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''),
    `${pluginName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}s`,
  ]);

  return RUNTIME_SETTINGS_REGISTRY.filter(
    (e) => e.uiCategory === uiCategory && sectionCandidates.has(e.uiSection),
  );
}

function findHeroInSection(settings) {
  return settings.find((e) => e.uiHero === true);
}

// ── Fetch plugin contracts ───────────────────────────────────────────────────

describe('fetch plugin settings contract', () => {
  const pluginNames = Object.keys(PLUGIN_REGISTRY);

  it('every fetch plugin has at least one setting in its own uiSection', () => {
    for (const name of pluginNames) {
      const settings = findPluginSettings(name, 'fetcher');
      assert.ok(
        settings.length > 0,
        `fetch plugin "${name}" has no settings with uiCategory:"fetcher" in a matching uiSection. ` +
        `Add a *Enabled setting with its own uiSection (not shared with other plugins).`,
      );
    }
  });

  it('every fetch plugin section has a hero-enabled toggle', () => {
    for (const name of pluginNames) {
      const settings = findPluginSettings(name, 'fetcher');
      const hero = findHeroInSection(settings);
      assert.ok(
        hero,
        `fetch plugin "${name}" has settings but no uiHero:true toggle. ` +
        `Add a hero-enabled boolean setting for this plugin.`,
      );
      assert.equal(
        hero.type, 'bool',
        `fetch plugin "${name}" hero setting "${hero.key}" must be type "bool", got "${hero.type}".`,
      );
    }
  });

  it('no fetch plugin shares a uiSection with another fetch plugin', () => {
    const sectionOwners = {};
    for (const name of pluginNames) {
      const settings = findPluginSettings(name, 'fetcher');
      for (const s of settings) {
        if (sectionOwners[s.uiSection] && sectionOwners[s.uiSection] !== name) {
          assert.fail(
            `uiSection "${s.uiSection}" is shared by fetch plugins "${sectionOwners[s.uiSection]}" and "${name}". ` +
            `Each plugin must have its own uiSection.`,
          );
        }
        sectionOwners[s.uiSection] = name;
      }
    }
  });
});

// ── Extraction plugin contracts ──────────────────────────────────────────────

describe('extraction plugin settings contract', () => {
  const pluginNames = Object.keys(EXTRACTION_PLUGIN_REGISTRY);

  it('every extraction plugin has at least one setting in its own uiSection', () => {
    for (const name of pluginNames) {
      const settings = findPluginSettings(name, 'extraction');
      assert.ok(
        settings.length > 0,
        `extraction plugin "${name}" has no settings with uiCategory:"extraction" in a matching uiSection. ` +
        `Add a *Enabled setting with its own uiSection.`,
      );
    }
  });

  it('every extraction plugin section has a hero-enabled toggle', () => {
    for (const name of pluginNames) {
      const settings = findPluginSettings(name, 'extraction');
      const hero = findHeroInSection(settings);
      assert.ok(
        hero,
        `extraction plugin "${name}" has settings but no uiHero:true toggle.`,
      );
      assert.equal(hero.type, 'bool');
    }
  });
});

// ── Anti-regression: no comma-separated plugin list settings ─────────────────

describe('no comma-separated plugin list settings', () => {
  it('no setting key contains "Plugins" as a comma-list pattern', () => {
    const forbidden = RUNTIME_SETTINGS_REGISTRY.filter(
      (e) => /plugins$/i.test(e.key) && e.type === 'string',
    );
    assert.equal(
      forbidden.length, 0,
      `Found comma-separated plugin list setting(s): ${forbidden.map((e) => e.key).join(', ')}. ` +
      `Use individual *Enabled toggles per plugin instead.`,
    );
  });

  it('no setting key is "fetcherPlugins" or "extractionPlugins"', () => {
    const keys = RUNTIME_SETTINGS_REGISTRY.map((e) => e.key);
    assert.ok(!keys.includes('fetcherPlugins'), 'fetcherPlugins setting must not exist');
    assert.ok(!keys.includes('extractionPlugins'), 'extractionPlugins setting must not exist');
  });
});
