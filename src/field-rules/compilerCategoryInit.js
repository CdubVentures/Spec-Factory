/**
 * Category initialization: scaffolding, default files, and template presets.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeFieldKey, normalizeToken, titleCase } from './compilerPrimitives.js';
import { ensureSharedSchemaPack, writeIfMissing, writeJsonStable } from './compilerFileOps.js';
import { buildAllEgDefaults, EG_LOCKED_KEYS } from '../features/studio/index.js';

export const TEMPLATE_PRESETS = {
  electronics: {
    common_identity: ['brand', 'model', 'variant', 'base_model', 'sku', 'mpn', 'gtin', 'category'],
    common_physical: ['weight', 'length', 'width', 'height', 'material', 'color'],
    common_connectivity: ['connection', 'wireless_technology', 'cable_type', 'cable_length'],
    common_editorial: ['overall_score', 'pros', 'cons', 'verdict', 'key_takeaway'],
    common_commerce: ['price_range', 'affiliate_links', 'images'],
    common_media: ['youtube_url', 'feature_image', 'gallery_images']
  }
};

function defaultCategorySchema(category, templateName) {
  return {
    category,
    template: templateName,
    field_order: [],
    critical_fields: [],
    expected_easy_fields: [],
    expected_sometimes_fields: [],
    deep_fields: [],
    editorial_fields: [],
    targets: {
      targetCompleteness: 0.9,
      targetConfidence: 0.8
    },
    required_fields: [],
    anchor_fields: {},
    search_templates: defaultSearchTemplates(category)
  };
}

function defaultSources() {
  return {
    approved: {
      manufacturer: [],
      lab: [],
      database: [],
      retailer: []
    },
    denylist: []
  };
}

function defaultSearchTemplates(category) {
  return [
    `${category} {brand} {model} specs`,
    `${category} {brand} {model} datasheet`,
    `${category} {brand} {model} manual pdf`
  ];
}

function starterFieldDefinition({ group, fieldKey }) {
  const normalizedGroup = normalizeFieldKey(group);
  const key = normalizeFieldKey(fieldKey);
  const isList = ['pros', 'cons', 'images', 'gallery_images', 'affiliate_links'].includes(key);
  const isUrl = key.includes('url');
  const isScore = key === 'overall_score';
  const dataType = isScore ? 'number' : (isUrl ? 'url' : 'string');
  const outputShape = isList ? 'list' : 'scalar';
  let requiredLevel = 'expected';
  let availability = 'expected';
  if (normalizedGroup === 'editorial') {
    requiredLevel = 'editorial';
    availability = 'editorial_only';
  } else if (normalizedGroup === 'commerce') {
    requiredLevel = 'commerce';
    availability = 'sometimes';
  } else if (normalizedGroup === 'media') {
    requiredLevel = 'optional';
    availability = 'sometimes';
  } else if (normalizedGroup === 'identity') {
    requiredLevel = ['brand', 'model', 'category'].includes(key) ? 'required' : 'expected';
    availability = 'expected';
  }
  return {
    group: normalizedGroup,
    field_key: key,
    display_name: titleCase(key),
    data_type: dataType,
    output_shape: outputShape,
    required_level: requiredLevel,
    availability,
    difficulty: 'easy',
    effort: isScore ? 4 : 3,
    unknown_reason_default: normalizedGroup === 'editorial'
      ? 'editorial_not_generated'
      : 'not_found_after_search',
    description: `Starter ${normalizedGroup} field`
  };
}

function starterFieldRows({ category, templateName }) {
  const preset = TEMPLATE_PRESETS[templateName] || TEMPLATE_PRESETS.electronics;
  const groups = {
    identity: preset.common_identity || [],
    physical: preset.common_physical || [],
    connectivity: preset.common_connectivity || [],
    performance: [],
    features: [],
    editorial: preset.common_editorial || [],
    commerce: preset.common_commerce || [],
    media: preset.common_media || []
  };
  const rows = [];
  for (const [group, fields] of Object.entries(groups)) {
    for (const fieldKey of fields) {
      rows.push(starterFieldDefinition({ group, fieldKey }));
    }
  }
  rows.push({
    group: 'performance',
    field_key: '',
    display_name: '',
    data_type: '',
    output_shape: '',
    required_level: '',
    availability: '',
    difficulty: '',
    effort: '',
    unknown_reason_default: '',
    description: `Add category-specific performance fields for '${category}'`
  });
  rows.push({
    group: 'features',
    field_key: '',
    display_name: '',
    data_type: '',
    output_shape: '',
    required_level: '',
    availability: '',
    difficulty: '',
    effort: '',
    unknown_reason_default: '',
    description: `Add category-specific feature fields for '${category}'`
  });
  return rows;
}

export async function initCategory({
  category,
  template = 'electronics',
  config = {}
}) {
  const normalizedCategory = normalizeFieldKey(category);
  if (!normalizedCategory) {
    throw new Error('category_required');
  }
  const templateName = normalizeToken(template) || 'electronics';

  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const helperCategoryRoot = path.join(helperRoot, normalizedCategory);
  const generatedRoot = path.join(helperCategoryRoot, '_generated');
  const overridesRoot = path.join(helperCategoryRoot, '_overrides');
  const categoryConfigRoot = helperCategoryRoot;

  await fs.mkdir(generatedRoot, { recursive: true });
  await fs.mkdir(overridesRoot, { recursive: true });
  const schemaProvision = await ensureSharedSchemaPack(helperRoot);

  const createdFiles = [];
  const maybeCreated = [
    [path.join(categoryConfigRoot, 'schema.json'), defaultCategorySchema(normalizedCategory, templateName)],
    [path.join(categoryConfigRoot, 'sources.json'), defaultSources()]
  ];

  for (const [filePath, payload] of maybeCreated) {
    if (await writeIfMissing(filePath, payload)) {
      createdFiles.push(filePath);
    }
  }
  return {
    category: normalizedCategory,
    template: templateName,
    created: true,
    created_files: createdFiles,
    shared_schema_root: schemaProvision.shared_root,
    shared_schema_copied: schemaProvision.copied,
    paths: {
      helper_category_root: helperCategoryRoot,
      generated_root: generatedRoot,
      overrides_root: overridesRoot,
      category_root: categoryConfigRoot
    }
  };
}

/**
 * Scaffold a new category end-to-end: init config files + compile field rules.
 * After success, loadCategoryConfig(category) will NOT throw.
 */
export async function scaffoldCategory({ category, template = 'electronics', config = {} }) {
  const initResult = await initCategory({ category, template, config });

  const preset = TEMPLATE_PRESETS[template] || TEMPLATE_PRESETS.electronics;
  const selectedKeys = [
    ...(preset.common_identity || []),
    ...(preset.common_physical || []),
    ...(preset.common_connectivity || []),
    ...(preset.common_editorial || []),
    ...(preset.common_commerce || []),
    ...(preset.common_media || []),
  ];

  // WHY: EG-locked fields are always present in every category.
  // Seed them into the initial field_overrides so the compile chain picks them up.
  // O(1): buildAllEgDefaults() derives from EG_PRESET_REGISTRY.
  const egOverrides = buildAllEgDefaults();

  // Ensure EG keys are in selected_keys (at the end of the general section).
  for (const k of EG_LOCKED_KEYS) {
    if (!selectedKeys.includes(k)) selectedKeys.push(k);
  }

  // Dynamic import avoids circular dep (compiler.js imports from this file)
  const { compileRules } = await import('./compiler.js');
  const compileResult = await compileRules({
    category: initResult.category,
    fieldStudioMap: { version: 1, selected_keys: selectedKeys, field_overrides: egOverrides },
    config,
  });

  return { ...initResult, compileResult };
}
