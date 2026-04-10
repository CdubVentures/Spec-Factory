import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { compileRules } from '../../field-rules/compiler.js';
import { loadFieldRules } from '../../field-rules/loader.js';
import { seedSpecDb } from '../seed.js';
import { SpecDb } from '../specDb.js';
import { validateFieldStudioMap } from '../../ingest/categoryCompile.js';
import {
  approvedDomainsFromSources,
  createCategoryAuthorityHarness,
  createCategoryAuthorityWorkspace,
  readJson,
} from '../../../category_authority/_tests/helpers/categoryAuthorityContractHarness.js';

const CATEGORY = 'keyboard';
const harness = createCategoryAuthorityHarness({ category: CATEGORY, importMetaUrl: import.meta.url });

const EXPECTED_GROUPS = {
  identity: [
    'brand',
    'model',
    'base_model',
    'variant',
    'sku',
    'mpn',
    'gtin',
    'category',
  ],
  switch: [
    'switch_name',
    'switch_type',
    'switch_brand',
    'switch_feel',
    'switch_output_type',
    'actuation_force',
    'actuation_distance',
    'adjustable_actuation_min',
    'adjustable_actuation_max',
    'actuation_adjustment_step',
    'bottom_out_force',
    'total_travel',
    'switch_lifespan',
    'hot_swappable',
    'switch_pin_support',
    'switch_compatibility',
  ],
  layout: [
    'form_factor',
    'layout',
    'layout_standard',
    'key_count',
    'numpad',
    'function_row',
    'arrow_keys',
  ],
  keycaps: [
    'keycap_material',
    'keycap_profile',
    'keycap_thickness',
    'legends',
    'shine_through',
    'doubleshot',
  ],
  performance: [
    'polling_rate_wired',
    'polling_rate_wireless',
    'scan_rate',
    'single_key_latency',
    'multi_key_latency',
    'key_rollover',
    'anti_ghosting',
    'debounce_time',
    'rapid_trigger',
    'adjustable_input_granularity',
    'analog_input',
    'socd_cleaning',
  ],
  features: [
    'backlighting',
    'rgb_zones',
    'per_key_rgb',
    'software',
    'macro_keys',
    'media_controls',
    'onboard_memory',
    'onboard_profile_count',
    'knob_dial',
    'qmk_via_support',
    'os_mode_switch',
  ],
  connectivity: [
    'connection',
    'wired_interface',
    'wireless_technology',
    'bluetooth_version',
    'multi_device_pairing',
    'multi_device_pairing_count',
    'cable_type',
    'cable_length',
    'detachable_cable',
    'usb_passthrough',
  ],
  build: [
    'case_material',
    'plate_material',
    'mounting_style',
    'gasket_mount',
    'foam_dampening',
    'stabilizer_type',
    'stabilizer_mount',
    'stabilizer_lubed',
    'south_facing_leds',
  ],
  sound: [
    'typing_noise',
    'sound_profile',
    'sound_dampening',
  ],
  dimensions: [
    'width',
    'depth',
    'height_front',
    'height_rear',
    'weight',
    'typing_angle',
    'adjustable_feet',
  ],
  power: [
    'battery_capacity',
    'battery_life_off',
    'battery_life_rgb',
    'charging_method',
  ],
  general: [
    'release_date',
    'price_range',
    'discontinued',
    'color',
    'warranty',
    'included_accessories',
    'software_required',
    'compatible_os',
  ],
};

// WHY: EXPECTED_GROUPS covers the known group→field mapping for structural assertions.
// FIELD_ORDER is read from the compiled output at test time because the on-disk
// selected_keys evolves faster than this test file.
const GROUPED_FIELDS = new Set(Object.values(EXPECTED_GROUPS).flat());
const FIELD_SET = [...GROUPED_FIELDS].sort();

const EXPECTED_MANUAL_ENUM_FIELDS = [
  'category',
  'switch_type',
  'switch_brand',
  'switch_feel',
  'switch_output_type',
  'hot_swappable',
  'switch_pin_support',
  'switch_compatibility',
  'form_factor',
  'layout',
  'layout_standard',
  'numpad',
  'function_row',
  'arrow_keys',
  'keycap_material',
  'keycap_profile',
  'legends',
  'shine_through',
  'doubleshot',
  'connection',
  'wired_interface',
  'wireless_technology',
  'bluetooth_version',
  'multi_device_pairing',
  'cable_type',
  'detachable_cable',
  'usb_passthrough',
  'key_rollover',
  'anti_ghosting',
  'rapid_trigger',
  'analog_input',
  'socd_cleaning',
  'adjustable_input_granularity',
  'backlighting',
  'rgb_zones',
  'per_key_rgb',
  'software',
  'macro_keys',
  'media_controls',
  'onboard_memory',
  'knob_dial',
  'qmk_via_support',
  'os_mode_switch',
  'case_material',
  'plate_material',
  'mounting_style',
  'gasket_mount',
  'foam_dampening',
  'stabilizer_type',
  'stabilizer_mount',
  'stabilizer_lubed',
  'south_facing_leds',
  'adjustable_feet',
  'typing_noise',
  'sound_profile',
  'sound_dampening',
  'charging_method',
  'discontinued',
  'color',
  'included_accessories',
  'software_required',
  'compatible_os',
];

const EXPECTED_DATA_LIST_FIELDS = [
  'switch_type',
  'switch_brand',
  'switch_feel',
  'switch_output_type',
  'hot_swappable',
  'switch_pin_support',
  'switch_compatibility',
  'form_factor',
  'layout_standard',
  'keycap_material',
  'keycap_profile',
  'connection',
  'wired_interface',
  'wireless_technology',
  'key_rollover',
  'analog_input',
  'backlighting',
  'media_controls',
  'software',
  'case_material',
  'plate_material',
  'mounting_style',
  'stabilizer_type',
  'stabilizer_mount',
  'charging_method',
  'compatible_os',
];

const EXPECTED_REQUIRED_FIELDS = [
  'brand',
  'model',
  'switch_name',
  'form_factor',
  'connection',
  'key_count',
  'weight',
];

const EXPECTED_CRITICAL_FIELDS = [
  'switch_name',
  'form_factor',
  'connection',
];

const EXPECTED_DEEP_FIELDS = [
  'actuation_force',
  'single_key_latency',
  'multi_key_latency',
  'sound_profile',
];

const EXPECTED_EASY_FIELDS = [
  'key_count',
  'connection',
  'cable_type',
  'backlighting',
];

const EXPECTED_SOMETIMES_FIELDS = [
  'battery_capacity',
  'knob_dial',
  'qmk_via_support',
  'sound_dampening',
];

const EXPECTED_SWITCH_COMPONENT_PROPERTIES = [
  'switch_feel',
  'switch_output_type',
  'actuation_force',
  'actuation_distance',
  'bottom_out_force',
  'total_travel',
  'switch_lifespan',
  'hot_swappable',
];

function sorted(values) {
  return [...values].sort();
}

test('keyboard control-plane contract matches the curated field map', async () => {
  const full = await harness.readCategoryJson('_generated', 'field_rules.json');
  const compiledFieldKeys = Object.keys(full.fields || {});
  // All grouped fields must be present in compiled output
  for (const gf of GROUPED_FIELDS) {
    assert.ok(compiledFieldKeys.includes(gf), `Expected field ${gf} missing from compiled output`);
  }

  for (const [groupKey, fieldKeys] of Object.entries(EXPECTED_GROUPS)) {
    for (const fieldKey of fieldKeys) {
      const field = full.fields[fieldKey];
      assert.equal(field?.key, fieldKey, `Missing field contract for ${fieldKey}`);
      assert.equal(field?.field_key, fieldKey, `field_key mismatch for ${fieldKey}`);
      assert.equal(field?.group, groupKey, `group mismatch for ${fieldKey}`);
      assert.equal(Array.isArray(field?.aliases), true, `aliases missing for ${fieldKey}`);
      assert.equal(Boolean(field?.contract), true, `contract missing for ${fieldKey}`);
      assert.equal(Boolean(field?.enum), true, `enum missing for ${fieldKey}`);
      assert.equal(Boolean(field?.evidence), true, `evidence missing for ${fieldKey}`);
      assert.equal(Boolean(field?.parse), true, `parse missing for ${fieldKey}`);
      assert.equal(Boolean(field?.priority), true, `priority missing for ${fieldKey}`);
      assert.equal(Boolean(field?.search_hints), true, `search_hints missing for ${fieldKey}`);
      assert.equal(Boolean(field?.ui), true, `ui missing for ${fieldKey}`);
    }
  }
});

test('keyboard field studio map mirrors the contract and seeds curated enums/components', async () => {
  const map = await harness.readCategoryJson('_control_plane', 'field_studio_map.json');

  assert.equal(map.version, 2);
  assert.equal(map.field_studio_source_path, '');
  // All grouped fields must be in selected_keys and field_overrides
  const selectedSet = new Set(map.selected_keys);
  for (const gf of GROUPED_FIELDS) {
    assert.ok(selectedSet.has(gf), `Expected field ${gf} missing from selected_keys`);
  }
  const overrideSet = new Set(Object.keys(map.field_overrides || {}));
  for (const gf of GROUPED_FIELDS) {
    assert.ok(overrideSet.has(gf), `Expected field ${gf} missing from field_overrides`);
  }
  assert.deepEqual(sorted(map.expectations?.required_fields || []), sorted(EXPECTED_REQUIRED_FIELDS));
  assert.deepEqual(sorted(map.expectations?.critical_fields || []), sorted(EXPECTED_CRITICAL_FIELDS));
  assert.deepEqual(sorted(map.expectations?.deep_fields || []), sorted(EXPECTED_DEEP_FIELDS));
  assert.deepEqual(sorted(map.expectations?.expected_easy_fields || []), sorted(EXPECTED_EASY_FIELDS));
  assert.deepEqual(
    sorted(map.expectations?.expected_sometimes_fields || []),
    sorted(EXPECTED_SOMETIMES_FIELDS),
  );
  assert.equal(Array.isArray(map.component_sources), true);
  assert.equal(map.component_sources.length >= 1, true);
  assert.equal(map.component_sources[0]?.component_type, 'switch');
  assert.equal(map.component_sources[0]?.mode, 'scratch');
  assert.equal(String(map.component_sources[0]?.roles?.primary_identifier || '').toLowerCase(), 'switch_name');
  assert.equal(String(map.component_sources[0]?.roles?.maker || '').toLowerCase(), 'switch_brand');
  assert.deepEqual(
    (map.component_sources[0]?.roles?.properties || []).map((entry) => entry.field_key),
    EXPECTED_SWITCH_COMPONENT_PROPERTIES,
  );

  // Verify manual enum values exist via data_lists[*].manual_values (sole surviving path)
  const mapDataLists = Array.isArray(map.data_lists) ? map.data_lists : [];
  const dataListFieldMap = Object.fromEntries(mapDataLists.map((dl) => [dl.field, dl.manual_values || dl.values || []]));
  assert.equal(Object.keys(dataListFieldMap).length >= 40, true);
  for (const fieldKey of EXPECTED_MANUAL_ENUM_FIELDS) {
    assert.ok(Array.isArray(dataListFieldMap[fieldKey]), `data_lists manual values missing for ${fieldKey}`);
    assert.ok(dataListFieldMap[fieldKey].length > 0, `data_lists manual values empty for ${fieldKey}`);
  }

  const dataLists = Array.isArray(map.data_lists) ? map.data_lists : [];
  const dataListFields = dataLists.map((entry) => entry.field);
  assert.equal(dataLists.length >= 12, true);
  for (const fieldKey of EXPECTED_DATA_LIST_FIELDS) {
    assert.equal(dataListFields.includes(fieldKey), true, `data list missing for ${fieldKey}`);
  }
});

test('keyboard field studio map passes Studio validation for scratch-backed component sources', async () => {
  const map = await harness.readCategoryJson('_control_plane', 'field_studio_map.json');

  const checked = validateFieldStudioMap(map);

  assert.equal(checked.valid, true, checked.errors.join('\n'));
  assert.deepEqual(checked.errors, []);
});

test('keyboard search hints use approved real hostnames instead of tier tokens', async () => {
  const [full, map, sources] = await Promise.all([
    harness.readCategoryJson('_generated', 'field_rules.json'),
    harness.readCategoryJson('_control_plane', 'field_studio_map.json'),
    harness.readCategoryJson('sources.json'),
  ]);
  const approvedDomains = approvedDomainsFromSources(sources);
  const forbiddenTokens = new Set(['manufacturer', 'lab', 'retailer', 'database', 'community', 'support', 'manual', 'pdf']);

  for (const fieldKey of GROUPED_FIELDS) {
    const field = full.fields[fieldKey];
    const override = map.field_overrides[fieldKey];
    for (const payload of [field, override]) {
      const domainHints = payload?.search_hints?.domain_hints || [];
      assert.equal(domainHints.length >= 3, true, `Too few domain hints for ${fieldKey}`);
      assert.equal(payload?.search_hints?.query_templates?.length > 0, true, `query_templates missing for ${fieldKey}`);
      assert.equal(payload?.search_hints?.query_terms?.length > 0, true, `query_terms missing for ${fieldKey}`);
      for (const domainHint of domainHints) {
        const normalized = String(domainHint || '').trim().toLowerCase();
        assert.equal(normalized.includes('.'), true, `Non-domain hint for ${fieldKey}: ${domainHint}`);
        assert.equal(forbiddenTokens.has(normalized), false, `Tier token leaked into ${fieldKey}: ${domainHint}`);
        assert.equal(approvedDomains.has(normalized), true, `Unapproved domain for ${fieldKey}: ${domainHint}`);
      }
    }
  }
});

test('keyboard compile and seed pipeline produces the expected runtime contract', async () => {
  const {
    tempRoot,
    helperRoot,
    localCategoryRoot,
    dbPath,
    cleanup,
  } = await createCategoryAuthorityWorkspace({
    category: CATEGORY,
    categoryRoot: harness.categoryRoot,
  });

  try {
    const compileResult = await compileRules({
      category: CATEGORY,
      config: {
        categoryAuthorityRoot: helperRoot,
        preferFieldStudioCompile: true,
      },
    });

    assert.equal(compileResult?.compiled, true);

    const generatedFieldRules = await readJson(path.join(localCategoryRoot, '_generated', 'field_rules.json'));
    const generatedGroups = await readJson(path.join(localCategoryRoot, '_generated', 'field_groups.json'));
    const generatedCrossRules = await readJson(path.join(localCategoryRoot, '_generated', 'cross_validation_rules.json'));
    const generatedKnownValues = await readJson(path.join(localCategoryRoot, '_generated', 'known_values.json'));

    assert.equal(Object.keys(generatedFieldRules.fields || {}).length >= GROUPED_FIELDS.size, true);
    assert.equal(Array.isArray(generatedGroups.groups), true);
    assert.ok(generatedGroups.groups.length >= Object.keys(EXPECTED_GROUPS).length);
    assert.equal(Array.isArray(generatedCrossRules.rules), true);
    assert.equal(generatedCrossRules.rules.length >= 5, true);
    assert.equal(Object.keys(generatedKnownValues.enums || generatedKnownValues.fields || {}).length >= 40, true);

    const loaded = await loadFieldRules(CATEGORY, {
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    assert.equal(Object.keys(loaded.rules?.fields || {}).length >= GROUPED_FIELDS.size, true);
    assert.equal(Array.isArray(loaded.crossValidation), true);
    assert.equal(loaded.crossValidation.length >= 5, true);

    const db = new SpecDb({ dbPath, category: CATEGORY });
    try {
      const seedResult = await seedSpecDb({
        db,
        config: {
          categoryAuthorityRoot: helperRoot,
          localOutputRoot: path.join(tempRoot, 'out'),
        },
        category: CATEGORY,
        fieldRules: loaded,
      });

      assert.equal(seedResult.list_values_seeded > 0, true);
      assert.equal(db.isSeeded(), true);
    } finally {
      db.close();
    }
  } finally {
    await cleanup();
  }
});
