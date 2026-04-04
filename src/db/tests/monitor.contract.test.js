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

const CATEGORY = 'monitor';
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
  display_panel: [
    'screen_size',
    'panel_type',
    'resolution',
    'aspect_ratio',
    'pixel_density',
    'subpixel_layout',
    'panel_bit_depth',
    'frc',
    'curved',
    'curve_radius',
    'panel_coating',
    'panel_manufacturer',
    'native_colors',
  ],
  performance: [
    'refresh_rate',
    'max_refresh_rate_displayport',
    'max_refresh_rate_hdmi',
    'response_time_gtg',
    'response_time_mprt',
    'response_time_120hz',
    'response_time_60hz',
    'overshoot_max_refresh',
    'overshoot_120hz',
    'overshoot_60hz',
    'input_lag',
    'input_lag_max_refresh',
    'input_lag_120hz',
    'input_lag_60hz',
    'adaptive_sync',
    'vrr_range',
    'variable_refresh_rate',
    'overdrive',
    'motion_blur_reduction',
  ],
  color_image_quality: [
    'brightness_sdr',
    'brightness_hdr_peak',
    'contrast_ratio',
    'contrast_ratio_dynamic',
    'color_gamut_srgb',
    'color_gamut_dci_p3',
    'color_gamut_adobe_rgb',
    'color_accuracy_delta_e',
    'hdr_support',
    'factory_calibrated',
    'backlight_type',
    'local_dimming_zones',
    'wide_color_gamut',
    'reflections',
    'horizontal_viewing_angle',
    'vertical_viewing_angle',
    'gray_uniformity_50',
    'black_uniformity',
    'text_clarity',
    'gradient_handling',
  ],
  connectivity: [
    'hdmi_ports',
    'hdmi_version',
    'displayport_ports',
    'displayport_version',
    'display_stream_compression',
    'thunderbolt_ports',
    'thunderbolt_version',
    'usb_c_ports',
    'usb_hub',
    'ethernet_rj45',
    'headphone_jack',
    'audio_output',
    'kvm_switch',
    'daisy_chain',
  ],
  dimensions_weight: [
    'weight_without_stand',
    'weight_with_stand',
    'width',
    'height',
    'depth',
    'height_with_stand',
    'vesa_mount',
  ],
  ergonomics: [
    'height_adjustment',
    'tilt_range',
    'swivel_range',
    'pivot_rotation',
    'wall_mountable',
  ],
  features: [
    'speakers',
    'webcam',
    'microphone',
    'pip_pbp',
    'flicker_free',
    'flicker_frequency',
    'low_blue_light',
    'crosshair_overlay',
    'usb_power_delivery_watts',
    'cables_included',
    'osd_type',
    'ps5_compatibility',
    'xbox_series_xs_compatibility',
    'macos_compatibility',
  ],
  power: [
    'power_consumption_typical',
    'power_consumption_max',
    'energy_rating',
  ],
  general: [
    'release_date',
    'price_range',
    'discontinued',
    'color',
    'warranty',
    'cable_length',
    'cable_type',
    'material',
  ],
};

const FIELD_ORDER = Object.values(EXPECTED_GROUPS).flat();
const FIELD_SET = [...FIELD_ORDER].sort();

const EXPECTED_MANUAL_ENUM_FIELDS = [
  'category',
  'panel_type',
  'resolution',
  'aspect_ratio',
  'subpixel_layout',
  'panel_bit_depth',
  'frc',
  'curved',
  'curve_radius',
  'panel_coating',
  'panel_manufacturer',
  'native_colors',
  'refresh_rate',
  'adaptive_sync',
  'variable_refresh_rate',
  'overdrive',
  'motion_blur_reduction',
  'text_clarity',
  'gradient_handling',
  'hdr_support',
  'factory_calibrated',
  'backlight_type',
  'wide_color_gamut',
  'hdmi_ports',
  'hdmi_version',
  'displayport_ports',
  'displayport_version',
  'display_stream_compression',
  'thunderbolt_ports',
  'thunderbolt_version',
  'usb_c_ports',
  'usb_hub',
  'ethernet_rj45',
  'headphone_jack',
  'audio_output',
  'kvm_switch',
  'daisy_chain',
  'vesa_mount',
  'pivot_rotation',
  'wall_mountable',
  'speakers',
  'webcam',
  'microphone',
  'pip_pbp',
  'flicker_free',
  'low_blue_light',
  'crosshair_overlay',
  'cables_included',
  'osd_type',
  'ps5_compatibility',
  'xbox_series_xs_compatibility',
  'macos_compatibility',
  'energy_rating',
  'price_range',
  'discontinued',
  'color',
  'warranty',
  'cable_type',
  'material',
];

const EXPECTED_DATA_LIST_FIELDS = [
  'panel_type',
  'resolution',
  'aspect_ratio',
  'subpixel_layout',
  'panel_bit_depth',
  'adaptive_sync',
  'hdr_support',
  'backlight_type',
  'text_clarity',
  'gradient_handling',
  'hdmi_version',
  'displayport_version',
  'display_stream_compression',
  'thunderbolt_version',
  'ethernet_rj45',
  'webcam',
  'microphone',
  'usb_hub',
  'audio_output',
  'speakers',
  'cables_included',
  'osd_type',
  'ps5_compatibility',
  'xbox_series_xs_compatibility',
  'macos_compatibility',
];

const EXPECTED_REQUIRED_FIELDS = [
  'screen_size',
  'resolution',
  'panel_type',
  'refresh_rate',
  'width',
  'height',
  'weight_without_stand',
];

const EXPECTED_CRITICAL_FIELDS = [
  'resolution',
  'panel_type',
  'refresh_rate',
  'hdmi_version',
  'displayport_version',
];

const EXPECTED_DEEP_FIELDS = [
  'response_time_gtg',
  'response_time_120hz',
  'input_lag_60hz',
  'input_lag',
  'color_accuracy_delta_e',
  'display_stream_compression',
  'gray_uniformity_50',
  'horizontal_viewing_angle',
];

const EXPECTED_EASY_FIELDS = [
  'screen_size',
  'aspect_ratio',
  'hdmi_ports',
  'hdmi_version',
  'displayport_ports',
  'displayport_version',
  'ps5_compatibility',
];

const EXPECTED_SOMETIMES_FIELDS = [
  'panel_manufacturer',
  'local_dimming_zones',
  'thunderbolt_ports',
  'thunderbolt_version',
  'ethernet_rj45',
  'webcam',
  'microphone',
  'macos_compatibility',
];

const EXPECTED_PANEL_COMPONENT_PROPERTIES = [
  'panel_bit_depth',
  'frc',
  'subpixel_layout',
  'native_colors',
];

function sorted(values) {
  return [...values].sort();
}

test('monitor control-plane contract matches the curated field map', async () => {
  const full = await harness.readCategoryJson('_generated', 'field_rules.json');
  assert.equal(Object.keys(full.fields || {}).length, FIELD_ORDER.length);
  assert.deepEqual(Object.keys(full.fields || {}).sort(), FIELD_SET);

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

test('monitor field studio map mirrors the contract and seeds curated enums/components', async () => {
  const map = await harness.readCategoryJson('_control_plane', 'field_studio_map.json');

  assert.equal(map.version, 2);
  assert.equal(map.field_studio_source_path, '');
  assert.deepEqual(map.selected_keys, FIELD_ORDER);
  assert.deepEqual(Object.keys(map.field_overrides || {}).sort(), FIELD_SET);
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
  assert.equal(map.component_sources[0]?.component_type, 'panel');
  assert.equal(map.component_sources[0]?.mode, 'scratch');
  assert.equal(String(map.component_sources[0]?.roles?.primary_identifier || '').toLowerCase(), 'panel_type');
  assert.equal(String(map.component_sources[0]?.roles?.maker || '').toLowerCase(), 'panel_manufacturer');
  assert.deepEqual(
    (map.component_sources[0]?.roles?.properties || []).map((entry) => entry.field_key),
    EXPECTED_PANEL_COMPONENT_PROPERTIES,
  );

  const manualEnumKeys = Object.keys(map.manual_enum_values || {});
  assert.equal(manualEnumKeys.length >= 60, true);
  for (const fieldKey of EXPECTED_MANUAL_ENUM_FIELDS) {
    assert.equal(Array.isArray(map.manual_enum_values?.[fieldKey]), true, `manual enum values missing for ${fieldKey}`);
    assert.equal(map.manual_enum_values[fieldKey].length > 0, true, `manual enum values empty for ${fieldKey}`);
  }

  const dataLists = Array.isArray(map.data_lists) ? map.data_lists : [];
  const dataListFields = dataLists.map((entry) => entry.field);
  assert.equal(dataLists.length >= 25, true);
  for (const fieldKey of EXPECTED_DATA_LIST_FIELDS) {
    assert.equal(dataListFields.includes(fieldKey), true, `data list missing for ${fieldKey}`);
  }
});

test('monitor field studio map passes Studio validation for scratch-backed panel component sources', async () => {
  const map = await harness.readCategoryJson('_control_plane', 'field_studio_map.json');

  const checked = validateFieldStudioMap(map);

  assert.equal(checked.valid, true, checked.errors.join('\n'));
  assert.deepEqual(checked.errors, []);
});

test('monitor search hints use approved real hostnames instead of tier tokens', async () => {
  const [full, map, sources] = await Promise.all([
    harness.readCategoryJson('_generated', 'field_rules.json'),
    harness.readCategoryJson('_control_plane', 'field_studio_map.json'),
    harness.readCategoryJson('sources.json'),
  ]);
  const approvedDomains = approvedDomainsFromSources(sources);
  const forbiddenTokens = new Set(['manufacturer', 'lab', 'retailer', 'database', 'community', 'support', 'manual', 'pdf']);

  for (const fieldKey of FIELD_ORDER) {
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

test('monitor compile and seed pipeline produces the expected runtime contract', async () => {
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

    assert.equal(Object.keys(generatedFieldRules.fields || {}).length >= FIELD_ORDER.length, true);
    assert.equal(Array.isArray(generatedGroups.groups), true);
    assert.equal(generatedGroups.groups.length, Object.keys(EXPECTED_GROUPS).length);
    assert.equal(Array.isArray(generatedCrossRules.rules), true);
    assert.equal(generatedCrossRules.rules.length >= 12, true);
    assert.equal(Object.keys(generatedKnownValues.enums || generatedKnownValues.fields || {}).length >= 60, true);

    const loaded = await loadFieldRules(CATEGORY, {
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    assert.equal(Object.keys(loaded.rules?.fields || {}).length >= FIELD_ORDER.length, true);
    assert.equal(Array.isArray(loaded.crossValidation), true);
    assert.equal(loaded.crossValidation.length >= 12, true);

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
