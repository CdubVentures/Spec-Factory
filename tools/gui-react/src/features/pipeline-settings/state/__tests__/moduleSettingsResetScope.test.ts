import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

let findModuleIdForSection: (sectionId: string) => string | null;
let stringifyFinderSettingDefault: (entry: any) => string;
let buildModuleSettingsResetPayload: (finderId: string) => Record<string, string>;
let buildAllModuleSettingsResetPayloads: () => Array<{ moduleId: string; settings: Record<string, string> }>;

before(async () => {
  const mod = await loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/state/moduleSettingsResetScope.ts',
    { prefix: 'module-settings-reset-scope-' },
  );
  ({
    findModuleIdForSection,
    stringifyFinderSettingDefault,
    buildModuleSettingsResetPayload,
    buildAllModuleSettingsResetPayloads,
  } = mod);
});

describe('findModuleIdForSection', () => {
  it('maps module-cef to colorEditionFinder', () => {
    assert.equal(findModuleIdForSection('module-cef'), 'colorEditionFinder');
  });

  it('maps module-pif to productImageFinder', () => {
    assert.equal(findModuleIdForSection('module-pif'), 'productImageFinder');
  });

  it('maps module-rdf to releaseDateFinder', () => {
    assert.equal(findModuleIdForSection('module-rdf'), 'releaseDateFinder');
  });

  it('maps module-skf to skuFinder', () => {
    assert.equal(findModuleIdForSection('module-skf'), 'skuFinder');
  });

  it('maps module-kf to keyFinder', () => {
    assert.equal(findModuleIdForSection('module-kf'), 'keyFinder');
  });

  it('returns null for runtime category section', () => {
    assert.equal(findModuleIdForSection('global'), null);
  });

  it('returns null for unknown section id', () => {
    assert.equal(findModuleIdForSection('unknown-section'), null);
  });
});

describe('stringifyFinderSettingDefault', () => {
  it('stringifies bool defaults as "true"/"false"', () => {
    assert.equal(stringifyFinderSettingDefault({ key: 'x', type: 'bool', default: true }), 'true');
    assert.equal(stringifyFinderSettingDefault({ key: 'x', type: 'bool', default: false }), 'false');
  });

  it('stringifies int defaults as their number string', () => {
    assert.equal(stringifyFinderSettingDefault({ key: 'x', type: 'int', default: 42 }), '42');
  });

  it('stringifies float defaults as their number string', () => {
    assert.equal(stringifyFinderSettingDefault({ key: 'x', type: 'float', default: 0.5 }), '0.5');
  });

  it('stringifies string defaults verbatim', () => {
    assert.equal(stringifyFinderSettingDefault({ key: 'x', type: 'string', default: 'hello' }), 'hello');
  });

  it('stringifies intMap defaults in the registry key order', () => {
    const entry = {
      key: 'tiers',
      type: 'intMap',
      default: { c: 3, a: 1, b: 2 },
      keys: ['a', 'b', 'c'],
    };
    assert.equal(stringifyFinderSettingDefault(entry), '{"a":1,"b":2,"c":3}');
  });

  it('fills missing intMap keys with 0', () => {
    const entry = {
      key: 'tiers',
      type: 'intMap',
      default: { a: 1 },
      keys: ['a', 'b'],
    };
    assert.equal(stringifyFinderSettingDefault(entry), '{"a":1,"b":0}');
  });
});

describe('buildModuleSettingsResetPayload', () => {
  it('returns defaults for every visible entry in the colorEditionFinder schema', () => {
    const payload = buildModuleSettingsResetPayload('colorEditionFinder');
    assert.ok(Object.keys(payload).length > 0, 'payload must be non-empty');
    // Hidden prompt template keys must not appear.
    assert.equal('discoveryPromptTemplate' in payload, false);
    assert.equal('identityCheckPromptTemplate' in payload, false);
  });

  it('includes every visible key for productImageFinder', () => {
    const payload = buildModuleSettingsResetPayload('productImageFinder');
    assert.ok('satisfactionThreshold' in payload, 'must include satisfactionThreshold');
    assert.ok('heroEnabled' in payload, 'must include heroEnabled');
  });

  it('stringifies bool values correctly in the payload', () => {
    const payload = buildModuleSettingsResetPayload('productImageFinder');
    assert.equal(payload.heroEnabled, 'true');
  });

  it('returns a plain Record<string,string> shape', () => {
    const payload = buildModuleSettingsResetPayload('colorEditionFinder');
    for (const value of Object.values(payload)) {
      assert.equal(typeof value, 'string');
    }
  });
});

describe('buildAllModuleSettingsResetPayloads', () => {
  it('returns one entry per finder in FINDER_IDS_WITH_SETTINGS', () => {
    const batches = buildAllModuleSettingsResetPayloads();
    const moduleIds = batches.map((b) => b.moduleId).sort();
    assert.deepEqual(moduleIds, [
      'colorEditionFinder',
      'keyFinder',
      'productImageFinder',
      'releaseDateFinder',
      'skuFinder',
    ]);
  });

  it('each entry has a non-empty settings payload', () => {
    const batches = buildAllModuleSettingsResetPayloads();
    for (const { moduleId, settings } of batches) {
      assert.ok(
        Object.keys(settings).length > 0,
        `${moduleId} must produce a non-empty reset payload`,
      );
    }
  });

  it('each payload matches buildModuleSettingsResetPayload for the same finder', () => {
    const batches = buildAllModuleSettingsResetPayloads();
    for (const { moduleId, settings } of batches) {
      assert.deepEqual(settings, buildModuleSettingsResetPayload(moduleId));
    }
  });

  it('each payload is a Record<string,string>', () => {
    const batches = buildAllModuleSettingsResetPayloads();
    for (const { settings } of batches) {
      for (const value of Object.values(settings)) {
        assert.equal(typeof value, 'string');
      }
    }
  });
});
