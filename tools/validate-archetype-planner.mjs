/**
 * Archetype Query Planner — Validation Pass 1
 * Runs NeedSet → Brand Resolver → Search Profile for 3 mouse products.
 * Captures full output for audit evidence.
 */
import { loadCategoryConfig } from '../src/categories/loader.js';
import { computeNeedSet } from '../src/indexlab/needsetEngine.js';
import { buildSearchProfile } from '../src/features/indexing/search/queryBuilder.js';
import fs from 'node:fs';
import path from 'node:path';

const SEEDS = [
  {
    productId: 'mouse-razer-viper-v3-pro',
    brand: 'Razer',
    model: 'Viper V3 Pro',
    variant: '',
    profile: 'flagship wireless / mainstream review coverage'
  },
  {
    productId: 'mouse-endgame-gear-xm1r',
    brand: 'Endgame Gear',
    model: 'XM1r',
    variant: '',
    profile: 'wired / lighter source footprint'
  },
  {
    productId: 'mouse-cooler-master-mm712-30th-anniversary-edition',
    brand: 'Cooler Master',
    model: 'MM712 30th Anniversary Edition',
    variant: '',
    profile: 'variant-heavy / manual-support-heavy'
  }
];

const OUTPUT_DIR = path.resolve('tools/validation-output');

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load category config
  console.log('=== Loading category config for mouse ===');
  const categoryConfig = await loadCategoryConfig('mouse', {
    config: {
      categoryAuthorityRoot: 'category_authority',
      enableSourceRegistry: true,
      localMode: true,
      localInputRoot: 'fixtures/s3'
    }
  });

  console.log(`fieldOrder: ${categoryConfig.fieldOrder?.length} fields`);
  console.log(`sourceHosts: ${categoryConfig.sourceHosts?.length} hosts`);
  console.log(`searchTemplates: ${categoryConfig.searchTemplates?.length} templates`);
  console.log(`sourceRegistry keys: ${Object.keys(categoryConfig.sourceRegistry || {}).length}`);

  const results = [];

  for (const seed of SEEDS) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`=== ${seed.brand} ${seed.model} (${seed.profile}) ===`);
    console.log(`${'='.repeat(70)}`);

    // Stage 1: NeedSet
    console.log('\n--- Stage 1: NeedSet ---');
    const needSet = computeNeedSet({
      runId: `validation-${Date.now()}`,
      category: 'mouse',
      productId: seed.productId,
      fieldOrder: categoryConfig.fieldOrder,
      provenance: {},
      fieldRules: categoryConfig.fieldRules,
      fieldReasoning: {},
      constraintAnalysis: {},
      identityContext: {
        status: 'locked',
        confidence: 1.0,
        manufacturer: seed.brand,
        model: seed.model
      },
      brand: seed.brand,
      model: seed.model,
      baseModel: '',
      aliases: [],
      settings: {},
      previousFieldHistories: {},
      round: 0,
    });

    const missingFields = needSet.planner_seed?.unresolved_fields || [];
    const criticalMissing = needSet.planner_seed?.missing_critical_fields || [];
    console.log(`  schema_version: ${needSet.schema_version}`);
    console.log(`  total fields: ${needSet.fields?.length}`);
    console.log(`  unresolved: ${missingFields.length}`);
    console.log(`  critical missing: ${criticalMissing.length}`);
    console.log(`  identity.state: ${needSet.identity?.state}`);

    // Stage 2: Brand Resolution (deterministic — no LLM)
    console.log('\n--- Stage 2: Brand Resolution (deterministic) ---');
    // Brand resolver needs storage/LLM — use deterministic fallback
    const brandResolution = {
      officialDomain: `${seed.brand.toLowerCase().replace(/\s+/g, '')}.com`,
      aliases: [`${seed.brand.toLowerCase().replace(/\s+/g, '')}.com`],
      supportDomain: '',
      confidence: 0.6,
      reasoning: ['deterministic_fallback: no LLM available']
    };
    console.log(`  officialDomain: ${brandResolution.officialDomain}`);
    console.log(`  aliases: ${JSON.stringify(brandResolution.aliases)}`);

    // Stage 3: Search Profile
    console.log('\n--- Stage 3: Search Profile ---');
    const job = {
      category: 'mouse',
      productId: seed.productId,
      identityLock: {
        brand: seed.brand,
        model: seed.model,
        variant: seed.variant
      },
      brand: seed.brand,
      model: seed.model,
      variant: seed.variant
    };

    const searchProfile = buildSearchProfile({
      job,
      categoryConfig,
      missingFields,
      maxQueries: 48,
      brandResolution,
      aliasValidationCap: 12,
      fieldTargetQueriesCap: 3,
      docHintQueriesCap: 3
    });

    // Collect metrics
    const domainHints = new Set(
      searchProfile.query_rows.map((r) => r.domain_hint).filter(Boolean)
    );
    const docHints = new Set(
      searchProfile.query_rows.map((r) => r.doc_hint).filter(Boolean)
    );
    const siteQueries = searchProfile.queries.filter((q) => q.includes('site:'));
    const siteHostCounts = {};
    for (const q of siteQueries) {
      const match = q.match(/site:(\S+)/);
      if (match) {
        siteHostCounts[match[1]] = (siteHostCounts[match[1]] || 0) + 1;
      }
    }
    const duplicateSiteHosts = Object.entries(siteHostCounts)
      .filter(([, count]) => count > 1)
      .map(([host, count]) => `${host}(${count})`);

    // Check for field-stuffed queries (>3 field terms in one query)
    const fieldStuffed = searchProfile.queries.filter((q) => {
      const fieldTerms = (categoryConfig.fieldOrder || []).filter((f) =>
        q.toLowerCase().includes(f.replace(/_/g, ' '))
      );
      return fieldTerms.length > 3;
    });

    // Archetype diversity
    const archetypeKeys = Object.keys(searchProfile.archetype_summary || {});
    const hintSources = Object.entries(searchProfile.hint_source_counts || {});

    console.log(`  category: ${searchProfile.category}`);
    console.log(`  identity: ${JSON.stringify(searchProfile.identity)}`);
    console.log(`  focus_fields: ${searchProfile.focus_fields?.length}`);
    console.log(`  base_templates: ${searchProfile.base_templates?.length} (${searchProfile.base_templates?.length > 0 ? 'OK' : 'EMPTY!'})`);
    console.log(`  query_rows: ${searchProfile.query_rows?.length}`);
    console.log(`  queries: ${searchProfile.queries?.length}`);
    console.log(`  variant_guard_terms: ${searchProfile.variant_guard_terms?.length}`);
    console.log(`  identity_aliases: ${searchProfile.identity_aliases?.length}`);
    console.log(`  distinct domain_hints: ${domainHints.size} — ${[...domainHints].join(', ')}`);
    console.log(`  distinct doc_hints: ${docHints.size} — ${[...docHints].join(', ')}`);
    console.log(`  site: queries: ${siteQueries.length}`);
    console.log(`  duplicate site: hosts: ${duplicateSiteHosts.length > 0 ? duplicateSiteHosts.join(', ') : 'NONE'}`);
    console.log(`  field-stuffed queries: ${fieldStuffed.length}`);
    console.log(`  archetype_summary keys: ${archetypeKeys.join(', ')}`);
    console.log(`  hint_source_counts: ${JSON.stringify(Object.fromEntries(hintSources))}`);
    console.log(`  archetype_summary: ${JSON.stringify(searchProfile.archetype_summary)}`);
    console.log(`  coverage_analysis: ${JSON.stringify(searchProfile.coverage_analysis)}`);

    // Top-level key check
    const requiredKeys = [
      'category', 'identity', 'variant_guard_terms', 'identity_aliases',
      'alias_reject_log', 'query_reject_log', 'focus_fields', 'base_templates',
      'query_rows', 'queries', 'targeted_queries', 'field_target_queries',
      'doc_hint_queries', 'hint_source_counts', 'archetype_summary', 'coverage_analysis'
    ];
    const missingKeys = requiredKeys.filter((k) => !(k in searchProfile));
    console.log(`  missing required keys: ${missingKeys.length > 0 ? missingKeys.join(', ') : 'NONE'}`);

    // Write artifacts
    const artifactPath = path.join(OUTPUT_DIR, `${seed.productId}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify({
      seed,
      needSet: {
        schema_version: needSet.schema_version,
        identity: needSet.identity,
        field_count: needSet.fields?.length,
        planner_seed: needSet.planner_seed,
        fields_sample: needSet.fields?.slice(0, 5)
      },
      brandResolution,
      searchProfile: {
        category: searchProfile.category,
        identity: searchProfile.identity,
        variant_guard_terms: searchProfile.variant_guard_terms,
        focus_fields: searchProfile.focus_fields,
        base_templates: searchProfile.base_templates,
        queries: searchProfile.queries,
        query_rows: searchProfile.query_rows,
        targeted_queries: searchProfile.targeted_queries,
        archetype_summary: searchProfile.archetype_summary,
        coverage_analysis: searchProfile.coverage_analysis,
        hint_source_counts: searchProfile.hint_source_counts,
        field_rule_gate_counts: searchProfile.field_rule_gate_counts,
        identity_aliases_count: searchProfile.identity_aliases?.length,
        alias_reject_log_count: searchProfile.alias_reject_log?.length,
        query_reject_log_count: searchProfile.query_reject_log?.length
      },
      metrics: {
        distinct_domain_hints: [...domainHints],
        distinct_doc_hints: [...docHints],
        site_query_count: siteQueries.length,
        duplicate_site_hosts: duplicateSiteHosts,
        field_stuffed_count: fieldStuffed.length,
        archetype_keys: archetypeKeys,
        missing_required_keys: missingKeys,
        base_templates_empty: searchProfile.base_templates?.length === 0
      }
    }, null, 2));

    console.log(`  artifact written: ${artifactPath}`);

    results.push({
      seed,
      needSetOk: Boolean(needSet.schema_version && needSet.fields?.length > 0),
      brandOk: Boolean(brandResolution.officialDomain),
      profileOk: Boolean(searchProfile.queries?.length > 0 && missingKeys.length === 0),
      domainHintCount: domainHints.size,
      docHintCount: docHints.size,
      duplicateSiteHosts,
      fieldStuffedCount: fieldStuffed.length,
      baseTemplatesEmpty: searchProfile.base_templates?.length === 0,
      archetypeKeys,
      queryCount: searchProfile.queries?.length
    });
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('=== VALIDATION SUMMARY ===');
  console.log(`${'='.repeat(70)}`);
  for (const r of results) {
    const status = r.needSetOk && r.brandOk && r.profileOk
      && r.duplicateSiteHosts.length === 0
      && r.fieldStuffedCount === 0
      && !r.baseTemplatesEmpty
      && r.domainHintCount >= 3
      ? 'PASS' : 'ISSUE';
    console.log(`  [${status}] ${r.seed.brand} ${r.seed.model}: ` +
      `queries=${r.queryCount}, domain_hints=${r.domainHintCount}, ` +
      `doc_hints=${r.docHintCount}, ` +
      `dup_site=${r.duplicateSiteHosts.length}, ` +
      `field_stuffed=${r.fieldStuffedCount}, ` +
      `archetypes=[${r.archetypeKeys.join(',')}]`);
  }

  const allPass = results.every((r) =>
    r.needSetOk && r.brandOk && r.profileOk
    && r.duplicateSiteHosts.length === 0
    && r.fieldStuffedCount === 0
    && !r.baseTemplatesEmpty
  );
  console.log(`\nOVERALL: ${allPass ? 'PASS' : 'ISSUES FOUND'}`);
}

run().catch((err) => {
  console.error('VALIDATION FAILED:', err);
  process.exit(1);
});
