export function createIndexingMetricsHandler({
  jsonRes,
  toInt,
  config,
  storage,
  OUTPUT_ROOT,
  collectLlmModels,
  llmProviderFromModel,
  resolvePricingForModel,
  resolveTokenProfileForModel,
  resolveLlmRoleDefaults,
  resolveLlmKnobDefaults,
  llmRoutingSnapshot,
  buildLlmMetrics,
  buildIndexingDomainChecklist,
  buildReviewMetrics,
}) {
  return async function handleIndexingMetrics(parts, params, method, _req, res) {
    if (parts[0] !== 'indexing' || method !== 'GET') return false;

    if (parts[1] === 'llm-config') {
      const models = collectLlmModels(config);
      const modelPricing = models.map((modelName) => ({
        model: modelName,
        provider: llmProviderFromModel(modelName),
        ...resolvePricingForModel(config, modelName)
      }));
      const modelTokenProfiles = models.map((modelName) => ({
        model: modelName,
        ...resolveTokenProfileForModel(config, modelName)
      }));
      const roleDefaults = resolveLlmRoleDefaults(config);
      const knobDefaults = resolveLlmKnobDefaults(config);
      const roleTokenDefaults = {
        plan: toInt(knobDefaults.phase_02_planner?.token_cap, 1200),
        fast: toInt(knobDefaults.fast_pass?.token_cap, 1200),
        triage: toInt(knobDefaults.phase_03_triage?.token_cap, 1200),
        reasoning: toInt(knobDefaults.reasoning_pass?.token_cap, 4096),
        extract: toInt(knobDefaults.extract_role?.token_cap, 1200),
        validate: toInt(knobDefaults.validate_role?.token_cap, 1200),
        write: toInt(knobDefaults.write_role?.token_cap, 1200)
      };
      const fallbackDefaults = {
        enabled: Boolean(
          String(config.llmPlanFallbackModel || '').trim()
          || String(config.llmExtractFallbackModel || '').trim()
          || String(config.llmValidateFallbackModel || '').trim()
          || String(config.llmWriteFallbackModel || '').trim()
        ),
        plan: String(config.llmPlanFallbackModel || '').trim(),
        extract: String(config.llmExtractFallbackModel || '').trim(),
        validate: String(config.llmValidateFallbackModel || '').trim(),
        write: String(config.llmWriteFallbackModel || '').trim(),
        plan_tokens: toInt(config.llmMaxOutputTokensPlanFallback, roleTokenDefaults.plan),
        extract_tokens: toInt(config.llmMaxOutputTokensExtractFallback, roleTokenDefaults.extract),
        validate_tokens: toInt(config.llmMaxOutputTokensValidateFallback, roleTokenDefaults.validate),
        write_tokens: toInt(config.llmMaxOutputTokensWriteFallback, roleTokenDefaults.write)
      };
      return jsonRes(res, 200, {
        generated_at: new Date().toISOString(),
        phase2: {
          enabled_default: true,
          model_default: roleDefaults.plan
        },
        phase3: {
          enabled_default: Boolean(config.llmSerpRerankEnabled),
          model_default: roleDefaults.triage
        },
        model_defaults: roleDefaults,
        token_defaults: roleTokenDefaults,
        fallback_defaults: fallbackDefaults,
        routing_snapshot: llmRoutingSnapshot(config),
        model_options: models,
        token_presets: Array.isArray(config.llmOutputTokenPresets)
          ? config.llmOutputTokenPresets.map((value) => toInt(value, 0)).filter((value) => value > 0)
          : [256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 8192],
        pricing_defaults: resolvePricingForModel(config, ''),
        model_pricing: modelPricing,
        model_token_profiles: modelTokenProfiles,
        knob_defaults: knobDefaults,
        pricing_meta: {
          as_of: String(config.llmPricingAsOf || '').trim() || null,
          sources: config.llmPricingSources && typeof config.llmPricingSources === 'object'
            ? config.llmPricingSources
            : {}
        }
      });
    }

    // Indexing metrics: LLM usage rollup
    if (parts[1] === 'llm-metrics') {
      try {
        const period = String(params.get('period') || 'week').trim() || 'week';
        const model = String(params.get('model') || '').trim();
        const category = String(params.get('category') || '').trim();
        const runLimit = Math.max(10, toInt(params.get('runLimit'), 120));
        const result = await buildLlmMetrics({
          storage,
          config,
          period,
          model,
          category,
          runLimit
        });
        return jsonRes(res, 200, {
          command: 'llm-metrics',
          ...result
        });
      } catch (err) {
        return jsonRes(res, 500, { error: err?.message || 'llm_metrics_failed' });
      }
    }

    // Indexing metrics: domain checklist + manufacturer milestones + yield
    if (parts[1] === 'domain-checklist' && parts[2]) {
      try {
        const category = String(parts[2] || '').trim();
        if (!category) return jsonRes(res, 400, { error: 'category_required' });
        const productId = String(params.get('productId') || '').trim();
        const runId = String(params.get('runId') || '').trim();
        const windowMinutes = Math.max(5, toInt(params.get('windowMinutes'), 120));
        const includeUrls = String(params.get('includeUrls') || '').trim().toLowerCase() === 'true';
        const result = await buildIndexingDomainChecklist({
          storage,
          config,
          outputRoot: OUTPUT_ROOT,
          category,
          productId,
          runId,
          windowMinutes,
          includeUrls
        });
        return jsonRes(res, 200, {
          command: 'indexing',
          action: 'domain-checklist',
          ...result
        });
      } catch (err) {
        return jsonRes(res, 500, { error: err?.message || 'indexing_domain_checklist_failed' });
      }
    }

    // Indexing metrics: human review velocity/throughput
    if (parts[1] === 'review-metrics' && parts[2]) {
      try {
        const category = String(parts[2] || '').trim();
        const windowHours = Math.max(1, toInt(params.get('windowHours'), 24));
        if (!category) return jsonRes(res, 400, { error: 'category_required' });
        const result = await buildReviewMetrics({
          config,
          category,
          windowHours
        });
        return jsonRes(res, 200, {
          command: 'review',
          action: 'metrics',
          ...result
        });
      } catch (err) {
        return jsonRes(res, 500, { error: err?.message || 'review_metrics_failed' });
      }
    }

    return false;
  };
}
