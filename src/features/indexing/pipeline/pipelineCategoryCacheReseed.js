// WHY: Reseed surface for pipeline_category_cache.
// Reads loadCategoryConfig + buildIndexlabRuntimeCategoryConfig from JSON,
// projects only the pipeline-consumed properties into a single DB row.
// Per-field rules are stripped to the 11 keys the pipeline actually reads.

import { loadCategoryConfig } from '../../../categories/loader.js';
import { buildIndexlabRuntimeCategoryConfig } from '../../indexing/orchestration/shared/indexlabRuntimeFieldRules.js';

// WHY: The pipeline reads exactly these 10 per-field keys. Everything else
// (min_evidence_refs, contract.shape, contract.exact_match, ai_assist,
// component, enum, evidence, field_studio_hints, parse, variance_policy, etc.)
// is consumed by review/GUI or not produced by Field Studio.
// Stripping keeps the cache lean.
function projectFieldRules(fullFieldRules) {
  const fields = fullFieldRules?.fields || fullFieldRules || {};
  const projected = {};
  for (const [key, rule] of Object.entries(fields)) {
    projected[key] = {
      field_key: key,
      required_level: rule.required_level || rule.priority?.required_level || 'optional',
      difficulty: rule.difficulty || rule.priority?.difficulty || 'medium',
      availability: rule.availability || rule.priority?.availability || 'sometimes',
      display_name: rule.display_name || rule.ui?.label || key,
      group: rule.group || '',
      aliases: Array.isArray(rule.aliases) ? rule.aliases : [],
      search_hints: {
        query_terms: rule.search_hints?.query_terms || [],
        domain_hints: rule.search_hints?.domain_hints || [],
        content_types: rule.search_hints?.content_types || [],
      },
      ui: {
        tooltip_md: rule.ui?.tooltip_md || '',
        label: rule.ui?.label || rule.display_name || key,
      },
    };
  }
  return { fields: projected };
}

export async function reseedPipelineCategoryCacheFromJson({ specDb, helperRoot, storage = null, config = {} }) {
  if (!specDb) return { reseeded: false };
  const category = specDb.category;
  if (!category) return { reseeded: false };

  const effectiveConfig = { ...config, categoryAuthorityRoot: helperRoot };

  let categoryConfig;
  try {
    const authoring = await loadCategoryConfig(category, { storage, config: effectiveConfig });
    categoryConfig = buildIndexlabRuntimeCategoryConfig(authoring);
  } catch {
    return { reseeded: false };
  }

  specDb.upsertPipelineCategoryCache(category, {
    field_rules: projectFieldRules(categoryConfig.fieldRules),
    field_order: categoryConfig.fieldOrder || [],
    field_groups: categoryConfig.fieldGroups || {},
    required_fields: categoryConfig.requiredFields || [],
    critical_fields: categoryConfig.schema?.critical_fields || [],
    source_hosts: categoryConfig.sourceHosts || [],
    source_registry: categoryConfig.sourceRegistry || {},
    validated_registry: categoryConfig.validatedRegistry || {},
    denylist: categoryConfig.denylist || [],
    search_templates: categoryConfig.searchTemplates || [],
    spec_seeds: categoryConfig.specSeeds || [],
  });

  return { reseeded: true };
}
