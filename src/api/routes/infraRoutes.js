import { emitDataChange } from '../events/dataChangeContract.js';
import { buildRunId } from '../../utils/common.js';

export function registerInfraRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    listDirs,
    canonicalSlugify,
    HELPER_ROOT,
    DIST_ROOT,
    fs,
    path,
    getSearxngStatus,
    startSearxngStack,
    startProcess,
    stopProcess,
    processStatus,
    isProcessRunning,
    waitForProcessExit,
    broadcastWs,
  } = ctx;

  return async function handleInfraRoutes(parts, params, method, req, res) {
    // Health
    if (parts[0] === 'health' || (parts.length === 0 && method === 'GET')) {
      return jsonRes(res, 200, {
        ok: true,
        service: 'gui-server',
        dist_root: DIST_ROOT,
        cwd: process.cwd(),
        isPkg: typeof process.pkg !== 'undefined',
      });
    }

    // Categories
    if (parts[0] === 'categories' && method === 'GET') {
      const includeTest = params.get('includeTest') === 'true';
      const cats = (await listDirs(HELPER_ROOT)).filter(c => {
        if (c === '_global') return false;          // shared config, never a category
        if (c.startsWith('_test_')) return includeTest;
        return !c.startsWith('_');
      });
      return jsonRes(res, 200, cats.length > 0 ? cats : ['mouse']);
    }

    // POST /api/v1/categories  { name }
    if (parts[0] === 'categories' && method === 'POST') {
      const body = await readJsonBody(req);
      const slug = canonicalSlugify(body?.name);
      if (!slug) return jsonRes(res, 400, { ok: false, error: 'category_name_required' });
      const catDir = path.join(HELPER_ROOT, slug);
      try { await fs.access(catDir); return jsonRes(res, 409, { ok: false, error: 'category_already_exists', slug }); } catch {}
      await fs.mkdir(catDir, { recursive: true });
      // Create stub subdirs so the category is functional
      await fs.mkdir(path.join(catDir, '_control_plane'), { recursive: true });
      await fs.mkdir(path.join(catDir, '_generated'), { recursive: true });
      const cats = (await listDirs(HELPER_ROOT)).filter(c => c !== '_global' && !c.startsWith('_'));
      emitDataChange({
        broadcastWs,
        event: 'category-created',
        category: 'all',
        meta: { slug },
      });
      return jsonRes(res, 201, { ok: true, slug, categories: cats });
    }

    // SearXNG runtime controls
    if (parts[0] === 'searxng' && parts[1] === 'status' && method === 'GET') {
      try {
        const status = await getSearxngStatus();
        return jsonRes(res, 200, status);
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'searxng_status_failed',
          message: err?.message || 'searxng_status_failed'
        });
      }
    }

    if (parts[0] === 'searxng' && parts[1] === 'start' && method === 'POST') {
      try {
        const startResult = await startSearxngStack();
        if (!startResult.ok) {
          return jsonRes(res, 500, {
            error: startResult.error || 'searxng_start_failed',
            status: startResult.status || null
          });
        }
        return jsonRes(res, 200, startResult);
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'searxng_start_failed',
          message: err?.message || 'searxng_start_failed'
        });
      }
    }

    // Process control - IndexLab mode only
    if (parts[0] === 'process' && parts[1] === 'start' && method === 'POST') {
      const body = await readJsonBody(req);
      const {
        category,
        productId,
        brand,
        model: modelName,
        variant,
        sku,
        seedUrls,
        mode = 'indexlab',
        extractionMode,
        profile,
        dryRun,
        fetchConcurrency,
        perHostMinDelayMs,
        dynamicCrawleeEnabled,
        crawleeHeadless,
        crawleeRequestHandlerTimeoutSecs,
        dynamicFetchRetryBudget,
        dynamicFetchRetryBackoffMs,
        fetchSchedulerEnabled,
        fetchSchedulerMaxRetries,
        fetchSchedulerFallbackWaitMs,
        preferHttpFetcher,
        pageGotoTimeoutMs,
        pageNetworkIdleTimeoutMs,
        postLoadWaitMs,
        frontierDbPath,
        frontierEnableSqlite,
        frontierStripTrackingParams,
        frontierQueryCooldownSeconds,
        frontierCooldown404Seconds,
        frontierCooldown404RepeatSeconds,
        frontierCooldown410Seconds,
        frontierCooldownTimeoutSeconds,
        frontierCooldown403BaseSeconds,
        frontierCooldown429BaseSeconds,
        frontierBackoffMaxExponent,
        frontierPathPenaltyNotfoundThreshold,
        frontierBlockedDomainThreshold,
        frontierRepairSearchEnabled,
        repairDedupeRule,
        automationQueueStorageEngine,
        autoScrollEnabled,
        autoScrollPasses,
        autoScrollDelayMs,
        graphqlReplayEnabled,
        maxGraphqlReplays,
        maxNetworkResponsesPerPage,
        robotsTxtCompliant,
        robotsTxtTimeoutMs,
        dynamicFetchPolicyMapJson,
        searchProfileCapMapJson,
        serpRerankerWeightMapJson,
        fetchSchedulerInternalsMapJson,
        retrievalInternalsMapJson,
        evidencePackLimitsMapJson,
        identityGateThresholdBoundsMapJson,
        parsingConfidenceBaseMapJson,
        runtimeTraceEnabled,
        runtimeTraceFetchRing,
        runtimeTraceLlmRing,
        runtimeTraceLlmPayloads,
        eventsJsonWrite,
        queueJsonWrite,
        billingJsonWrite,
        brainJsonWrite,
        intelJsonWrite,
        corpusJsonWrite,
        learningJsonWrite,
        cacheJsonWrite,
        authoritySnapshotEnabled,
        daemonConcurrency,
        daemonGracefulShutdownTimeoutMs,
        importsRoot,
        importsPollSeconds,
        runtimeScreencastEnabled,
        runtimeScreencastFps,
        runtimeScreencastQuality,
        runtimeScreencastMaxWidth,
        runtimeScreencastMaxHeight,
        scannedPdfOcrEnabled,
        scannedPdfOcrPromoteCandidates,
        scannedPdfOcrBackend,
        scannedPdfOcrMaxPages,
        scannedPdfOcrMaxPairs,
        scannedPdfOcrMinCharsPerPage,
        scannedPdfOcrMinLinesPerPage,
        scannedPdfOcrMinConfidence,
        resumeMode,
        resumeWindowHours,
        indexingResumeSeedLimit,
        indexingResumePersistLimit,
        indexingSchemaPacketsValidationEnabled,
        indexingSchemaPacketsValidationStrict,
        reextractAfterHours,
        reextractIndexed,
        discoveryEnabled,
        fetchCandidateSources,
        discoveryMaxQueries,
        discoveryResultsPerQuery,
        discoveryMaxDiscovered,
        discoveryQueryConcurrency,
        manufacturerBroadDiscovery,
        manufacturerSeedSearchUrls,
        maxUrlsPerProduct,
        maxCandidateUrls,
        maxPagesPerDomain,
        uberMaxUrlsPerProduct,
        uberMaxUrlsPerDomain,
        maxRunSeconds,
        maxJsonBytes,
        maxPdfBytes,
        pdfBackendRouterEnabled,
        pdfPreferredBackend,
        pdfBackendRouterTimeoutMs,
        pdfBackendRouterMaxPages,
        pdfBackendRouterMaxPairs,
        pdfBackendRouterMaxTextPreviewChars,
        capturePageScreenshotEnabled,
        capturePageScreenshotFormat,
        capturePageScreenshotQuality,
        capturePageScreenshotMaxBytes,
        capturePageScreenshotSelectors,
        runtimeCaptureScreenshots,
        runtimeScreenshotMode,
        visualAssetCaptureEnabled,
        visualAssetCaptureMaxPerSource,
        visualAssetStoreOriginal,
        visualAssetRetentionDays,
        visualAssetPhashEnabled,
        visualAssetReviewFormat,
        visualAssetReviewLgMaxSide,
        visualAssetReviewSmMaxSide,
        visualAssetReviewLgQuality,
        visualAssetReviewSmQuality,
        visualAssetRegionCropMaxSide,
        visualAssetRegionCropQuality,
        visualAssetLlmMaxBytes,
        visualAssetMinWidth,
        visualAssetMinHeight,
        visualAssetMinSharpness,
        visualAssetMinEntropy,
        visualAssetMaxPhashDistance,
        visualAssetHeroSelectorMapJson,
        chartExtractionEnabled,
        runtimeControlFile,
        articleExtractorV2Enabled,
        articleExtractorMinChars,
        articleExtractorMinScore,
        articleExtractorMaxChars,
        articleExtractorDomainPolicyMapJson,
        htmlTableExtractorV2,
        staticDomExtractorEnabled,
        staticDomMode,
        staticDomTargetMatchThreshold,
        staticDomMaxEvidenceSnippets,
        structuredMetadataExtructEnabled,
        structuredMetadataExtructUrl,
        structuredMetadataExtructTimeoutMs,
        structuredMetadataExtructMaxItemsPerSurface,
        structuredMetadataExtructCacheEnabled,
        structuredMetadataExtructCacheLimit,
        domSnippetMaxChars,
        specDbDir,
        helperFilesEnabled,
        helperFilesRoot,
        helperSupportiveEnabled,
        helperSupportiveFillMissing,
        helperSupportiveMaxSources,
        helperAutoSeedTargets,
        helperActiveSyncLimit,
        fieldRewardHalfLifeDays,
        batchStrategy,
        driftDetectionEnabled,
        driftPollSeconds,
        driftScanMaxProducts,
        driftAutoRepublish,
        reCrawlStaleAfterDays,
        aggressiveModeEnabled,
        aggressiveConfidenceThreshold,
        aggressiveMaxSearchQueries,
        aggressiveEvidenceAuditEnabled,
        aggressiveEvidenceAuditBatchSize,
        aggressiveMaxTimePerProductMs,
        aggressiveThoroughFromRound,
        aggressiveRound1MaxUrls,
        aggressiveRound1MaxCandidateUrls,
        aggressiveLlmMaxCallsPerRound,
        aggressiveLlmMaxCallsPerProductTotal,
        aggressiveLlmTargetMaxFields,
        aggressiveLlmDiscoveryPasses,
        aggressiveLlmDiscoveryQueryCap,
        uberAggressiveEnabled,
        uberMaxRounds,
        cortexEnabled,
        cortexAsyncEnabled,
        cortexBaseUrl,
        cortexApiKey,
        cortexAsyncBaseUrl,
        cortexAsyncSubmitPath,
        cortexAsyncStatusPath,
        cortexSyncTimeoutMs,
        cortexAsyncPollIntervalMs,
        cortexAsyncMaxWaitMs,
        cortexModelFast,
        cortexModelAudit,
        cortexModelDom,
        cortexModelReasoningDeep,
        cortexModelVision,
        cortexModelSearchFast,
        cortexModelRerankFast,
        cortexModelSearchDeep,
        cortexAutoStart,
        cortexAutoRestartOnAuth,
        cortexEnsureReadyTimeoutMs,
        cortexStartReadyTimeoutMs,
        cortexFailureThreshold,
        cortexCircuitOpenMs,
        cortexEscalateConfidenceLt,
        cortexEscalateIfConflict,
        cortexEscalateCriticalOnly,
        cortexMaxDeepFieldsPerProduct,
        outputMode,
        localMode,
        mirrorToS3,
        mirrorToS3Input,
        localInputRoot,
        localOutputRoot,
        runtimeEventsKey,
        writeMarkdownSummary,
        awsRegion,
        s3Bucket,
        s3InputPrefix,
        s3OutputPrefix,
        eloSupabaseAnonKey,
        eloSupabaseEndpoint,
        llmEnabled,
        llmWriteSummary,
        llmProvider,
        llmBaseUrl,
        openaiApiKey,
        anthropicApiKey,
        allowBelowPassTargetFill,
        indexingHelperFilesEnabled,
        llmPlanProvider,
        llmPlanBaseUrl,
        convergenceIdentityFailFastRounds,
        identityGatePublishThreshold,
        manufacturerDeepResearchEnabled,
        maxManufacturerUrlsPerProduct,
        maxManufacturerPagesPerDomain,
        manufacturerReserveUrls,
        userAgent,
        selfImproveEnabled,
        learningConfidenceThreshold,
        componentLexiconDecayDays,
        componentLexiconExpireDays,
        fieldAnchorsDecayDays,
        urlMemoryDecayDays,
        maxHypothesisItems,
        hypothesisAutoFollowupRounds,
        hypothesisFollowupUrlsPerRound,
        endpointSignalLimit,
        endpointSuggestionLimit,
        endpointNetworkScanLimit,
        searchProvider,
        searxngBaseUrl,
        bingSearchEndpoint,
        bingSearchKey,
        googleCseCx,
        googleCseKey,
        duckduckgoBaseUrl,
        disableGoogleCse,
        cseRescueOnlyMode,
        cseRescueRequiredIteration,
        duckduckgoEnabled,
        duckduckgoTimeoutMs,
        phase2LlmEnabled,
        phase2LlmModel,
        phase3LlmTriageEnabled,
        phase3LlmModel,
        llmModelPlan,
        llmModelFast,
        llmModelTriage,
        llmModelReasoning,
        llmModelExtract,
        llmModelValidate,
        llmModelWrite,
        llmTokensPlan,
        llmTokensFast,
        llmTokensTriage,
        llmTokensReasoning,
        llmTokensExtract,
        llmTokensValidate,
        llmTokensWrite,
        llmFallbackEnabled,
        llmPlanFallbackModel,
        llmPlanApiKey,
        llmExtractFallbackModel,
        llmValidateFallbackModel,
        llmWriteFallbackModel,
        llmTokensPlanFallback,
        llmTokensExtractFallback,
        llmTokensValidateFallback,
        llmTokensWriteFallback,
        llmExtractionCacheEnabled,
        llmExtractionCacheDir,
        llmExtractionCacheTtlMs,
        llmMaxCallsPerProductTotal,
        llmMaxCallsPerProductFast,
        needsetEvidenceDecayDays,
        needsetEvidenceDecayFloor,
        needsetRequiredWeightIdentity,
        needsetRequiredWeightCritical,
        needsetRequiredWeightRequired,
        needsetRequiredWeightExpected,
        needsetRequiredWeightOptional,
        needsetMissingMultiplier,
        needsetTierDeficitMultiplier,
        needsetMinRefsDeficitMultiplier,
        needsetConflictMultiplier,
        needsetIdentityLockThreshold,
        needsetIdentityProvisionalThreshold,
        needsetDefaultIdentityAuditLimit,
        consensusMethodWeightNetworkJson,
        consensusMethodWeightAdapterApi,
        consensusMethodWeightStructuredMeta,
        consensusMethodWeightPdf,
        consensusMethodWeightTableKv,
        consensusMethodWeightDom,
        consensusMethodWeightLlmExtractBase,
        consensusPolicyBonus,
        consensusWeightedMajorityThreshold,
        consensusStrictAcceptanceDomainCount,
        consensusRelaxedAcceptanceDomainCount,
        consensusInstrumentedFieldThreshold,
        consensusConfidenceScoringBase,
        consensusPassTargetIdentityStrong,
        consensusPassTargetNormal,
        retrievalTierWeightTier1,
        retrievalTierWeightTier2,
        retrievalTierWeightTier3,
        retrievalTierWeightTier4,
        retrievalTierWeightTier5,
        retrievalDocKindWeightManualPdf,
        retrievalDocKindWeightSpecPdf,
        retrievalDocKindWeightSupport,
        retrievalDocKindWeightLabReview,
        retrievalDocKindWeightProductPage,
        retrievalDocKindWeightOther,
        retrievalMethodWeightTable,
        retrievalMethodWeightKv,
        retrievalMethodWeightJsonLd,
        retrievalMethodWeightLlmExtract,
        retrievalMethodWeightHelperSupportive,
        retrievalAnchorScorePerMatch,
        retrievalIdentityScorePerMatch,
        retrievalUnitMatchBonus,
        retrievalDirectFieldMatchBonus,
        identityGateBaseMatchThreshold,
        identityGateEasyAmbiguityReduction,
        identityGateMediumAmbiguityReduction,
        identityGateHardAmbiguityReduction,
        identityGateVeryHardAmbiguityIncrease,
        identityGateExtraHardAmbiguityIncrease,
        identityGateMissingStrongIdPenalty,
        identityGateHardMissingStrongIdIncrease,
        identityGateVeryHardMissingStrongIdIncrease,
        identityGateExtraHardMissingStrongIdIncrease,
        identityGateNumericTokenBoost,
        identityGateNumericRangeThreshold,
        qualityGateIdentityThreshold,
        evidenceTextMaxChars,
        llmExtractMaxTokens,
        llmExtractMaxSnippetsPerBatch,
        llmExtractMaxSnippetChars,
        llmExtractSkipLowSignal,
        llmExtractReasoningBudget,
        llmReasoningMode,
        llmReasoningBudget,
        llmMonthlyBudgetUsd,
        llmPerProductBudgetUsd,
        llmDisableBudgetGuards,
        llmMaxCallsPerRound,
        llmMaxOutputTokens,
        llmVerifySampleRate,
        llmMaxBatchesPerProduct,
        llmMaxEvidenceChars,
        llmMaxTokens,
        llmTimeoutMs,
        llmCostInputPer1M,
        llmCostOutputPer1M,
        llmCostCachedInputPer1M,
        llmVerifyMode,
        seed,
        fields,
        providers,
        indexlabOut,
        replaceRunning = true
      } = body;
      const cat = category || 'mouse';

      if (String(mode || 'indexlab').trim() !== 'indexlab') {
        return jsonRes(res, 400, {
          error: 'unsupported_process_mode',
          message: 'Only indexlab mode is supported in GUI process/start.'
        });
      }

      const rawRequestedRunId = String(body?.requestedRunId || body?.runId || '').trim();
      const requestedRunId = /^[A-Za-z0-9._-]{8,96}$/.test(rawRequestedRunId)
        ? rawRequestedRunId
        : buildRunId();

      const cliArgs = ['indexlab', '--local', '--run-id', requestedRunId];

      cliArgs.push('--category', cat);

      if (productId) {
        cliArgs.push('--product-id', String(productId).trim());
      } else if (seed) {
        cliArgs.push('--seed', String(seed).trim());
      }
      if (brand) cliArgs.push('--brand', String(brand).trim());
      if (modelName) cliArgs.push('--model', String(modelName).trim());
      if (variant) cliArgs.push('--variant', String(variant).trim());
      if (sku) cliArgs.push('--sku', String(sku).trim());
      const normalizedSeedUrls = Array.isArray(seedUrls)
        ? seedUrls.map((u) => String(u || '').trim()).filter(Boolean).join(',')
        : String(seedUrls || '').trim();
      if (normalizedSeedUrls) cliArgs.push('--seed-urls', normalizedSeedUrls);
      const normalizedFields = Array.isArray(fields)
        ? fields.map((value) => String(value || '').trim()).filter(Boolean).join(',')
        : String(fields || '').trim();
      if (normalizedFields) {
        cliArgs.push('--fields', normalizedFields);
      }
      const normalizedProviders = Array.isArray(providers)
        ? providers.map((value) => String(value || '').trim()).filter(Boolean).join(',')
        : String(providers || '').trim();
      if (normalizedProviders) {
        cliArgs.push('--providers', normalizedProviders);
      }
      const hasDiscoveryOverride = typeof discoveryEnabled === 'boolean';
      if (hasDiscoveryOverride) {
        cliArgs.push('--discovery-enabled', discoveryEnabled ? 'true' : 'false');
      }
      const normalizedSearchProvider = String(searchProvider || '').trim().toLowerCase();
      if (normalizedSearchProvider) {
        const allowedSearchProviders = new Set(['none', 'google', 'bing', 'searxng', 'duckduckgo', 'dual']);
        if (!allowedSearchProviders.has(normalizedSearchProvider)) {
          return jsonRes(res, 400, {
            error: 'invalid_search_provider',
            message: `Unsupported searchProvider '${normalizedSearchProvider}'.`
          });
        }
        cliArgs.push('--search-provider', normalizedSearchProvider);
      }
      if (hasDiscoveryOverride && discoveryEnabled && (!normalizedSearchProvider || normalizedSearchProvider === 'none')) {
        return jsonRes(res, 400, {
          error: 'discovery_provider_required',
          message: 'discoveryEnabled=true requires searchProvider (google|bing|searxng|duckduckgo|dual).'
        });
      }
      if (indexlabOut) {
        cliArgs.push('--out', String(indexlabOut).trim());
      }

      // Extraction mode (--mode flag)
      if (extractionMode && ['balanced', 'aggressive', 'uber_aggressive'].includes(extractionMode)) {
        cliArgs.push('--mode', extractionMode);
      }

      // Run profile (fast / standard / thorough)
      if (profile && ['fast', 'standard', 'thorough'].includes(profile)) {
        cliArgs.push('--profile', profile);
      }

      // Dry run
      if (dryRun) {
        cliArgs.push('--dry-run');
      }

      const envOverrides = {
        FETCH_SCHEDULER_ENABLED: 'true',
        PREFER_HTTP_FETCHER: 'false',
        DYNAMIC_CRAWLEE_ENABLED: 'false',
      };
      if (typeof fetchCandidateSources === 'boolean') {
        envOverrides.FETCH_CANDIDATE_SOURCES = fetchCandidateSources ? 'true' : 'false';
      }
      const parsedDiscoveryMaxQueries = Number.parseInt(String(discoveryMaxQueries ?? ''), 10);
      if (Number.isFinite(parsedDiscoveryMaxQueries) && parsedDiscoveryMaxQueries >= 1) {
        envOverrides.DISCOVERY_MAX_QUERIES = String(Math.max(1, Math.min(100, parsedDiscoveryMaxQueries)));
      }
      const parsedDiscoveryResultsPerQuery = Number.parseInt(String(discoveryResultsPerQuery ?? ''), 10);
      if (Number.isFinite(parsedDiscoveryResultsPerQuery) && parsedDiscoveryResultsPerQuery >= 1) {
        envOverrides.DISCOVERY_RESULTS_PER_QUERY = String(Math.max(1, Math.min(100, parsedDiscoveryResultsPerQuery)));
      }
      const parsedDiscoveryMaxDiscovered = Number.parseInt(String(discoveryMaxDiscovered ?? ''), 10);
      if (Number.isFinite(parsedDiscoveryMaxDiscovered) && parsedDiscoveryMaxDiscovered >= 1) {
        envOverrides.DISCOVERY_MAX_DISCOVERED = String(Math.max(1, Math.min(2000, parsedDiscoveryMaxDiscovered)));
      }
      const parsedDiscoveryQueryConcurrency = Number.parseInt(String(discoveryQueryConcurrency ?? ''), 10);
      if (Number.isFinite(parsedDiscoveryQueryConcurrency) && parsedDiscoveryQueryConcurrency >= 1) {
        envOverrides.DISCOVERY_QUERY_CONCURRENCY = String(Math.max(1, Math.min(64, parsedDiscoveryQueryConcurrency)));
      }
      if (typeof manufacturerBroadDiscovery === 'boolean') {
        envOverrides.MANUFACTURER_BROAD_DISCOVERY = manufacturerBroadDiscovery ? 'true' : 'false';
      }
      if (typeof manufacturerSeedSearchUrls === 'boolean') {
        envOverrides.MANUFACTURER_SEED_SEARCH_URLS = manufacturerSeedSearchUrls ? 'true' : 'false';
      }
      const parsedMaxUrlsPerProduct = Number.parseInt(String(maxUrlsPerProduct ?? ''), 10);
      if (Number.isFinite(parsedMaxUrlsPerProduct) && parsedMaxUrlsPerProduct >= 1) {
        envOverrides.MAX_URLS_PER_PRODUCT = String(Math.max(1, Math.min(1000, parsedMaxUrlsPerProduct)));
      }
      const parsedMaxCandidateUrls = Number.parseInt(String(maxCandidateUrls ?? ''), 10);
      if (Number.isFinite(parsedMaxCandidateUrls) && parsedMaxCandidateUrls >= 1) {
        envOverrides.MAX_CANDIDATE_URLS = String(Math.max(1, Math.min(5000, parsedMaxCandidateUrls)));
      }
      const parsedMaxPagesPerDomain = Number.parseInt(String(maxPagesPerDomain ?? ''), 10);
      if (Number.isFinite(parsedMaxPagesPerDomain) && parsedMaxPagesPerDomain >= 1) {
        envOverrides.MAX_PAGES_PER_DOMAIN = String(Math.max(1, Math.min(100, parsedMaxPagesPerDomain)));
      }
      const parsedUberMaxUrlsPerProduct = Number.parseInt(String(uberMaxUrlsPerProduct ?? ''), 10);
      if (Number.isFinite(parsedUberMaxUrlsPerProduct) && parsedUberMaxUrlsPerProduct >= 1) {
        envOverrides.UBER_MAX_URLS_PER_PRODUCT = String(Math.max(1, Math.min(2000, parsedUberMaxUrlsPerProduct)));
      }
      const parsedUberMaxUrlsPerDomain = Number.parseInt(String(uberMaxUrlsPerDomain ?? ''), 10);
      if (Number.isFinite(parsedUberMaxUrlsPerDomain) && parsedUberMaxUrlsPerDomain >= 1) {
        envOverrides.UBER_MAX_URLS_PER_DOMAIN = String(Math.max(1, Math.min(100, parsedUberMaxUrlsPerDomain)));
      }
      const parsedMaxRunSeconds = Number.parseInt(String(maxRunSeconds ?? ''), 10);
      if (Number.isFinite(parsedMaxRunSeconds) && parsedMaxRunSeconds >= 30) {
        envOverrides.MAX_RUN_SECONDS = String(Math.max(30, Math.min(86400, parsedMaxRunSeconds)));
      }
      const parsedMaxJsonBytes = Number.parseInt(String(maxJsonBytes ?? ''), 10);
      if (Number.isFinite(parsedMaxJsonBytes) && parsedMaxJsonBytes >= 1024) {
        envOverrides.MAX_JSON_BYTES = String(Math.max(1024, Math.min(100_000_000, parsedMaxJsonBytes)));
      }
      const parsedMaxPdfBytes = Number.parseInt(String(maxPdfBytes ?? ''), 10);
      if (Number.isFinite(parsedMaxPdfBytes) && parsedMaxPdfBytes >= 1024) {
        envOverrides.MAX_PDF_BYTES = String(Math.max(1024, Math.min(100_000_000, parsedMaxPdfBytes)));
      }
      if (typeof pdfBackendRouterEnabled === 'boolean') {
        envOverrides.PDF_BACKEND_ROUTER_ENABLED = pdfBackendRouterEnabled ? 'true' : 'false';
      }
      const normalizedPdfPreferredBackend = String(pdfPreferredBackend || '').trim();
      if (normalizedPdfPreferredBackend) {
        envOverrides.PDF_PREFERRED_BACKEND = normalizedPdfPreferredBackend;
      }
      const parsedPdfBackendRouterTimeoutMs = Number.parseInt(String(pdfBackendRouterTimeoutMs ?? ''), 10);
      if (Number.isFinite(parsedPdfBackendRouterTimeoutMs) && parsedPdfBackendRouterTimeoutMs >= 1000) {
        envOverrides.PDF_BACKEND_ROUTER_TIMEOUT_MS = String(Math.max(1000, Math.min(600_000, parsedPdfBackendRouterTimeoutMs)));
      }
      const parsedPdfBackendRouterMaxPages = Number.parseInt(String(pdfBackendRouterMaxPages ?? ''), 10);
      if (Number.isFinite(parsedPdfBackendRouterMaxPages) && parsedPdfBackendRouterMaxPages >= 1) {
        envOverrides.PDF_BACKEND_ROUTER_MAX_PAGES = String(Math.max(1, Math.min(1000, parsedPdfBackendRouterMaxPages)));
      }
      const parsedPdfBackendRouterMaxPairs = Number.parseInt(String(pdfBackendRouterMaxPairs ?? ''), 10);
      if (Number.isFinite(parsedPdfBackendRouterMaxPairs) && parsedPdfBackendRouterMaxPairs >= 1) {
        envOverrides.PDF_BACKEND_ROUTER_MAX_PAIRS = String(Math.max(1, Math.min(100_000, parsedPdfBackendRouterMaxPairs)));
      }
      const parsedPdfBackendRouterMaxTextPreviewChars = Number.parseInt(String(pdfBackendRouterMaxTextPreviewChars ?? ''), 10);
      if (Number.isFinite(parsedPdfBackendRouterMaxTextPreviewChars) && parsedPdfBackendRouterMaxTextPreviewChars >= 256) {
        envOverrides.PDF_BACKEND_ROUTER_MAX_TEXT_PREVIEW_CHARS = String(Math.max(256, Math.min(200_000, parsedPdfBackendRouterMaxTextPreviewChars)));
      }
      if (typeof capturePageScreenshotEnabled === 'boolean') {
        envOverrides.CAPTURE_PAGE_SCREENSHOT_ENABLED = capturePageScreenshotEnabled ? 'true' : 'false';
      }
      const normalizedCapturePageScreenshotFormat = String(capturePageScreenshotFormat || '').trim();
      if (normalizedCapturePageScreenshotFormat) {
        envOverrides.CAPTURE_PAGE_SCREENSHOT_FORMAT = normalizedCapturePageScreenshotFormat;
      }
      const parsedCapturePageScreenshotQuality = Number.parseInt(String(capturePageScreenshotQuality ?? ''), 10);
      if (Number.isFinite(parsedCapturePageScreenshotQuality) && parsedCapturePageScreenshotQuality >= 1) {
        envOverrides.CAPTURE_PAGE_SCREENSHOT_QUALITY = String(Math.max(1, Math.min(100, parsedCapturePageScreenshotQuality)));
      }
      const parsedCapturePageScreenshotMaxBytes = Number.parseInt(String(capturePageScreenshotMaxBytes ?? ''), 10);
      if (Number.isFinite(parsedCapturePageScreenshotMaxBytes) && parsedCapturePageScreenshotMaxBytes >= 1024) {
        envOverrides.CAPTURE_PAGE_SCREENSHOT_MAX_BYTES = String(Math.max(1024, Math.min(100_000_000, parsedCapturePageScreenshotMaxBytes)));
      }
      const normalizedCapturePageScreenshotSelectors = String(capturePageScreenshotSelectors || '').trim();
      if (normalizedCapturePageScreenshotSelectors) {
        envOverrides.CAPTURE_PAGE_SCREENSHOT_SELECTORS = normalizedCapturePageScreenshotSelectors;
      }
      if (typeof runtimeCaptureScreenshots === 'boolean') {
        envOverrides.RUNTIME_CAPTURE_SCREENSHOTS = runtimeCaptureScreenshots ? 'true' : 'false';
      }
      const normalizedRuntimeScreenshotMode = String(runtimeScreenshotMode || '').trim();
      if (normalizedRuntimeScreenshotMode) {
        envOverrides.RUNTIME_SCREENSHOT_MODE = normalizedRuntimeScreenshotMode;
      }
      if (typeof visualAssetCaptureEnabled === 'boolean') {
        envOverrides.VISUAL_ASSET_CAPTURE_ENABLED = visualAssetCaptureEnabled ? 'true' : 'false';
      }
      const parsedVisualAssetCaptureMaxPerSource = Number.parseInt(String(visualAssetCaptureMaxPerSource ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetCaptureMaxPerSource) && parsedVisualAssetCaptureMaxPerSource >= 1) {
        envOverrides.VISUAL_ASSET_CAPTURE_MAX_PER_SOURCE = String(Math.max(1, Math.min(100, parsedVisualAssetCaptureMaxPerSource)));
      }
      if (typeof visualAssetStoreOriginal === 'boolean') {
        envOverrides.VISUAL_ASSET_STORE_ORIGINAL = visualAssetStoreOriginal ? 'true' : 'false';
      }
      const parsedVisualAssetRetentionDays = Number.parseInt(String(visualAssetRetentionDays ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetRetentionDays) && parsedVisualAssetRetentionDays >= 1) {
        envOverrides.VISUAL_ASSET_RETENTION_DAYS = String(Math.max(1, Math.min(3650, parsedVisualAssetRetentionDays)));
      }
      if (typeof visualAssetPhashEnabled === 'boolean') {
        envOverrides.VISUAL_ASSET_PHASH_ENABLED = visualAssetPhashEnabled ? 'true' : 'false';
      }
      const normalizedVisualAssetReviewFormat = String(visualAssetReviewFormat || '').trim();
      if (normalizedVisualAssetReviewFormat) {
        envOverrides.VISUAL_ASSET_REVIEW_FORMAT = normalizedVisualAssetReviewFormat;
      }
      const parsedVisualAssetReviewLgMaxSide = Number.parseInt(String(visualAssetReviewLgMaxSide ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetReviewLgMaxSide) && parsedVisualAssetReviewLgMaxSide >= 128) {
        envOverrides.VISUAL_ASSET_REVIEW_LG_MAX_SIDE = String(Math.max(128, Math.min(4096, parsedVisualAssetReviewLgMaxSide)));
      }
      const parsedVisualAssetReviewSmMaxSide = Number.parseInt(String(visualAssetReviewSmMaxSide ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetReviewSmMaxSide) && parsedVisualAssetReviewSmMaxSide >= 128) {
        envOverrides.VISUAL_ASSET_REVIEW_SM_MAX_SIDE = String(Math.max(128, Math.min(4096, parsedVisualAssetReviewSmMaxSide)));
      }
      const parsedVisualAssetReviewLgQuality = Number.parseInt(String(visualAssetReviewLgQuality ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetReviewLgQuality) && parsedVisualAssetReviewLgQuality >= 1) {
        envOverrides.VISUAL_ASSET_REVIEW_LG_QUALITY = String(Math.max(1, Math.min(100, parsedVisualAssetReviewLgQuality)));
      }
      const parsedVisualAssetReviewSmQuality = Number.parseInt(String(visualAssetReviewSmQuality ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetReviewSmQuality) && parsedVisualAssetReviewSmQuality >= 1) {
        envOverrides.VISUAL_ASSET_REVIEW_SM_QUALITY = String(Math.max(1, Math.min(100, parsedVisualAssetReviewSmQuality)));
      }
      const parsedVisualAssetRegionCropMaxSide = Number.parseInt(String(visualAssetRegionCropMaxSide ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetRegionCropMaxSide) && parsedVisualAssetRegionCropMaxSide >= 128) {
        envOverrides.VISUAL_ASSET_REGION_CROP_MAX_SIDE = String(Math.max(128, Math.min(4096, parsedVisualAssetRegionCropMaxSide)));
      }
      const parsedVisualAssetRegionCropQuality = Number.parseInt(String(visualAssetRegionCropQuality ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetRegionCropQuality) && parsedVisualAssetRegionCropQuality >= 1) {
        envOverrides.VISUAL_ASSET_REGION_CROP_QUALITY = String(Math.max(1, Math.min(100, parsedVisualAssetRegionCropQuality)));
      }
      const parsedVisualAssetLlmMaxBytes = Number.parseInt(String(visualAssetLlmMaxBytes ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetLlmMaxBytes) && parsedVisualAssetLlmMaxBytes >= 1024) {
        envOverrides.VISUAL_ASSET_LLM_MAX_BYTES = String(Math.max(1024, Math.min(100_000_000, parsedVisualAssetLlmMaxBytes)));
      }
      const parsedVisualAssetMinWidth = Number.parseInt(String(visualAssetMinWidth ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetMinWidth) && parsedVisualAssetMinWidth >= 1) {
        envOverrides.VISUAL_ASSET_MIN_WIDTH = String(Math.max(1, Math.min(10_000, parsedVisualAssetMinWidth)));
      }
      const parsedVisualAssetMinHeight = Number.parseInt(String(visualAssetMinHeight ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetMinHeight) && parsedVisualAssetMinHeight >= 1) {
        envOverrides.VISUAL_ASSET_MIN_HEIGHT = String(Math.max(1, Math.min(10_000, parsedVisualAssetMinHeight)));
      }
      const parsedVisualAssetMinSharpness = Number.parseFloat(String(visualAssetMinSharpness ?? ''));
      if (Number.isFinite(parsedVisualAssetMinSharpness)) {
        envOverrides.VISUAL_ASSET_MIN_SHARPNESS = String(Math.max(0, Math.min(1000, parsedVisualAssetMinSharpness)));
      }
      const parsedVisualAssetMinEntropy = Number.parseFloat(String(visualAssetMinEntropy ?? ''));
      if (Number.isFinite(parsedVisualAssetMinEntropy)) {
        envOverrides.VISUAL_ASSET_MIN_ENTROPY = String(Math.max(0, Math.min(100, parsedVisualAssetMinEntropy)));
      }
      const parsedVisualAssetMaxPhashDistance = Number.parseInt(String(visualAssetMaxPhashDistance ?? ''), 10);
      if (Number.isFinite(parsedVisualAssetMaxPhashDistance) && parsedVisualAssetMaxPhashDistance >= 0) {
        envOverrides.VISUAL_ASSET_MAX_PHASH_DISTANCE = String(Math.max(0, Math.min(128, parsedVisualAssetMaxPhashDistance)));
      }
      const normalizedVisualAssetHeroSelectorMapJson = String(visualAssetHeroSelectorMapJson || '').trim();
      if (normalizedVisualAssetHeroSelectorMapJson) {
        envOverrides.VISUAL_ASSET_HERO_SELECTOR_MAP_JSON = normalizedVisualAssetHeroSelectorMapJson;
      }
      if (typeof chartExtractionEnabled === 'boolean') {
        envOverrides.CHART_EXTRACTION_ENABLED = chartExtractionEnabled ? 'true' : 'false';
      }
      const normalizedRuntimeControlFile = String(runtimeControlFile || '').trim();
      if (normalizedRuntimeControlFile) {
        envOverrides.RUNTIME_CONTROL_FILE = normalizedRuntimeControlFile;
      }
      if (typeof articleExtractorV2Enabled === 'boolean') {
        envOverrides.ARTICLE_EXTRACTOR_V2 = articleExtractorV2Enabled ? 'true' : 'false';
      }
      const parsedArticleExtractorMinChars = Number.parseInt(String(articleExtractorMinChars ?? ''), 10);
      if (Number.isFinite(parsedArticleExtractorMinChars) && parsedArticleExtractorMinChars >= 50) {
        envOverrides.ARTICLE_EXTRACTOR_MIN_CHARS = String(Math.max(50, Math.min(200_000, parsedArticleExtractorMinChars)));
      }
      const parsedArticleExtractorMinScore = Number.parseInt(String(articleExtractorMinScore ?? ''), 10);
      if (Number.isFinite(parsedArticleExtractorMinScore) && parsedArticleExtractorMinScore >= 1) {
        envOverrides.ARTICLE_EXTRACTOR_MIN_SCORE = String(Math.max(1, Math.min(100, parsedArticleExtractorMinScore)));
      }
      const parsedArticleExtractorMaxChars = Number.parseInt(String(articleExtractorMaxChars ?? ''), 10);
      if (Number.isFinite(parsedArticleExtractorMaxChars) && parsedArticleExtractorMaxChars >= 256) {
        envOverrides.ARTICLE_EXTRACTOR_MAX_CHARS = String(Math.max(256, Math.min(500_000, parsedArticleExtractorMaxChars)));
      }
      const normalizedArticleExtractorDomainPolicyMapJson = String(articleExtractorDomainPolicyMapJson || '').trim();
      if (normalizedArticleExtractorDomainPolicyMapJson) {
        envOverrides.ARTICLE_EXTRACTOR_DOMAIN_POLICY_MAP_JSON = normalizedArticleExtractorDomainPolicyMapJson;
      }
      if (typeof htmlTableExtractorV2 === 'boolean') {
        envOverrides.HTML_TABLE_EXTRACTOR_V2 = htmlTableExtractorV2 ? 'true' : 'false';
      }
      if (typeof staticDomExtractorEnabled === 'boolean') {
        envOverrides.STATIC_DOM_EXTRACTOR_ENABLED = staticDomExtractorEnabled ? 'true' : 'false';
      }
      const normalizedStaticDomMode = String(staticDomMode || '').trim();
      if (normalizedStaticDomMode) {
        envOverrides.STATIC_DOM_MODE = normalizedStaticDomMode;
      }
      const parsedStaticDomTargetMatchThreshold = Number.parseFloat(String(staticDomTargetMatchThreshold ?? ''));
      if (Number.isFinite(parsedStaticDomTargetMatchThreshold)) {
        envOverrides.STATIC_DOM_TARGET_MATCH_THRESHOLD = String(Math.max(0, Math.min(1, parsedStaticDomTargetMatchThreshold)));
      }
      const parsedStaticDomMaxEvidenceSnippets = Number.parseInt(String(staticDomMaxEvidenceSnippets ?? ''), 10);
      if (Number.isFinite(parsedStaticDomMaxEvidenceSnippets) && parsedStaticDomMaxEvidenceSnippets >= 10) {
        envOverrides.STATIC_DOM_MAX_EVIDENCE_SNIPPETS = String(Math.max(10, Math.min(500, parsedStaticDomMaxEvidenceSnippets)));
      }
      if (typeof structuredMetadataExtructEnabled === 'boolean') {
        envOverrides.STRUCTURED_METADATA_EXTRUCT_ENABLED = structuredMetadataExtructEnabled ? 'true' : 'false';
      }
      const normalizedStructuredMetadataExtructUrl = String(structuredMetadataExtructUrl || '').trim();
      if (normalizedStructuredMetadataExtructUrl) {
        envOverrides.STRUCTURED_METADATA_EXTRUCT_URL = normalizedStructuredMetadataExtructUrl;
      }
      const parsedStructuredMetadataExtructTimeoutMs = Number.parseInt(String(structuredMetadataExtructTimeoutMs ?? ''), 10);
      if (Number.isFinite(parsedStructuredMetadataExtructTimeoutMs) && parsedStructuredMetadataExtructTimeoutMs >= 250) {
        envOverrides.STRUCTURED_METADATA_EXTRUCT_TIMEOUT_MS = String(Math.max(250, Math.min(15_000, parsedStructuredMetadataExtructTimeoutMs)));
      }
      const parsedStructuredMetadataExtructMaxItemsPerSurface = Number.parseInt(String(structuredMetadataExtructMaxItemsPerSurface ?? ''), 10);
      if (Number.isFinite(parsedStructuredMetadataExtructMaxItemsPerSurface) && parsedStructuredMetadataExtructMaxItemsPerSurface >= 1) {
        envOverrides.STRUCTURED_METADATA_EXTRUCT_MAX_ITEMS_PER_SURFACE = String(Math.max(1, Math.min(1000, parsedStructuredMetadataExtructMaxItemsPerSurface)));
      }
      if (typeof structuredMetadataExtructCacheEnabled === 'boolean') {
        envOverrides.STRUCTURED_METADATA_EXTRUCT_CACHE_ENABLED = structuredMetadataExtructCacheEnabled ? 'true' : 'false';
      }
      const parsedStructuredMetadataExtructCacheLimit = Number.parseInt(String(structuredMetadataExtructCacheLimit ?? ''), 10);
      if (Number.isFinite(parsedStructuredMetadataExtructCacheLimit) && parsedStructuredMetadataExtructCacheLimit >= 32) {
        envOverrides.STRUCTURED_METADATA_EXTRUCT_CACHE_LIMIT = String(Math.max(32, Math.min(5000, parsedStructuredMetadataExtructCacheLimit)));
      }
      const parsedDomSnippetMaxChars = Number.parseInt(String(domSnippetMaxChars ?? ''), 10);
      if (Number.isFinite(parsedDomSnippetMaxChars) && parsedDomSnippetMaxChars >= 600) {
        envOverrides.DOM_SNIPPET_MAX_CHARS = String(Math.max(600, Math.min(20_000, parsedDomSnippetMaxChars)));
      }
      const normalizedSpecDbDir = String(specDbDir || '').trim();
      if (normalizedSpecDbDir) {
        envOverrides.SPEC_DB_DIR = normalizedSpecDbDir;
      }
      if (typeof helperFilesEnabled === 'boolean') {
        envOverrides.HELPER_FILES_ENABLED = helperFilesEnabled ? 'true' : 'false';
      }
      const normalizedHelperFilesRoot = String(helperFilesRoot || '').trim();
      if (normalizedHelperFilesRoot) {
        envOverrides.HELPER_FILES_ROOT = normalizedHelperFilesRoot;
      }
      if (typeof helperSupportiveEnabled === 'boolean') {
        envOverrides.HELPER_SUPPORTIVE_ENABLED = helperSupportiveEnabled ? 'true' : 'false';
      }
      if (typeof helperSupportiveFillMissing === 'boolean') {
        envOverrides.HELPER_SUPPORTIVE_FILL_MISSING = helperSupportiveFillMissing ? 'true' : 'false';
      }
      const parsedHelperSupportiveMaxSources = Number.parseInt(String(helperSupportiveMaxSources ?? ''), 10);
      if (Number.isFinite(parsedHelperSupportiveMaxSources) && parsedHelperSupportiveMaxSources >= 0) {
        envOverrides.HELPER_SUPPORTIVE_MAX_SOURCES = String(Math.max(0, Math.min(100, parsedHelperSupportiveMaxSources)));
      }
      if (typeof helperAutoSeedTargets === 'boolean') {
        envOverrides.HELPER_AUTO_SEED_TARGETS = helperAutoSeedTargets ? 'true' : 'false';
      }
      const parsedHelperActiveSyncLimit = Number.parseInt(String(helperActiveSyncLimit ?? ''), 10);
      if (Number.isFinite(parsedHelperActiveSyncLimit) && parsedHelperActiveSyncLimit >= 0) {
        envOverrides.HELPER_ACTIVE_SYNC_LIMIT = String(Math.max(0, Math.min(5000, parsedHelperActiveSyncLimit)));
      }
      const parsedFieldRewardHalfLifeDays = Number.parseInt(String(fieldRewardHalfLifeDays ?? ''), 10);
      if (Number.isFinite(parsedFieldRewardHalfLifeDays) && parsedFieldRewardHalfLifeDays >= 1) {
        envOverrides.FIELD_REWARD_HALF_LIFE_DAYS = String(Math.max(1, Math.min(365, parsedFieldRewardHalfLifeDays)));
      }
      const normalizedBatchStrategy = String(batchStrategy || '').trim();
      if (normalizedBatchStrategy) {
        envOverrides.BATCH_STRATEGY = normalizedBatchStrategy;
      }
      if (typeof driftDetectionEnabled === 'boolean') {
        envOverrides.DRIFT_DETECTION_ENABLED = driftDetectionEnabled ? 'true' : 'false';
      }
      const parsedDriftPollSeconds = Number.parseInt(String(driftPollSeconds ?? ''), 10);
      if (Number.isFinite(parsedDriftPollSeconds) && parsedDriftPollSeconds >= 60) {
        envOverrides.DRIFT_POLL_SECONDS = String(Math.max(60, Math.min(604_800, parsedDriftPollSeconds)));
      }
      const parsedDriftScanMaxProducts = Number.parseInt(String(driftScanMaxProducts ?? ''), 10);
      if (Number.isFinite(parsedDriftScanMaxProducts) && parsedDriftScanMaxProducts >= 1) {
        envOverrides.DRIFT_SCAN_MAX_PRODUCTS = String(Math.max(1, Math.min(10_000, parsedDriftScanMaxProducts)));
      }
      if (typeof driftAutoRepublish === 'boolean') {
        envOverrides.DRIFT_AUTO_REPUBLISH = driftAutoRepublish ? 'true' : 'false';
      }
      const parsedReCrawlStaleAfterDays = Number.parseInt(String(reCrawlStaleAfterDays ?? ''), 10);
      if (Number.isFinite(parsedReCrawlStaleAfterDays) && parsedReCrawlStaleAfterDays >= 1) {
        envOverrides.RECRAWL_STALE_AFTER_DAYS = String(Math.max(1, Math.min(3650, parsedReCrawlStaleAfterDays)));
      }
      if (typeof aggressiveModeEnabled === 'boolean') {
        envOverrides.AGGRESSIVE_MODE_ENABLED = aggressiveModeEnabled ? 'true' : 'false';
      }
      const parsedAggressiveConfidenceThreshold = Number.parseFloat(String(aggressiveConfidenceThreshold ?? ''));
      if (Number.isFinite(parsedAggressiveConfidenceThreshold)) {
        envOverrides.AGGRESSIVE_CONFIDENCE_THRESHOLD = String(Math.max(0, Math.min(1, parsedAggressiveConfidenceThreshold)));
      }
      const parsedAggressiveMaxSearchQueries = Number.parseInt(String(aggressiveMaxSearchQueries ?? ''), 10);
      if (Number.isFinite(parsedAggressiveMaxSearchQueries) && parsedAggressiveMaxSearchQueries >= 1) {
        envOverrides.AGGRESSIVE_MAX_SEARCH_QUERIES = String(Math.max(1, Math.min(100, parsedAggressiveMaxSearchQueries)));
      }
      if (typeof aggressiveEvidenceAuditEnabled === 'boolean') {
        envOverrides.AGGRESSIVE_EVIDENCE_AUDIT_ENABLED = aggressiveEvidenceAuditEnabled ? 'true' : 'false';
      }
      const parsedAggressiveEvidenceAuditBatchSize = Number.parseInt(String(aggressiveEvidenceAuditBatchSize ?? ''), 10);
      if (Number.isFinite(parsedAggressiveEvidenceAuditBatchSize) && parsedAggressiveEvidenceAuditBatchSize >= 1) {
        envOverrides.AGGRESSIVE_EVIDENCE_AUDIT_BATCH_SIZE = String(Math.max(1, Math.min(500, parsedAggressiveEvidenceAuditBatchSize)));
      }
      const parsedAggressiveMaxTimePerProductMs = Number.parseInt(String(aggressiveMaxTimePerProductMs ?? ''), 10);
      if (Number.isFinite(parsedAggressiveMaxTimePerProductMs) && parsedAggressiveMaxTimePerProductMs >= 1000) {
        envOverrides.AGGRESSIVE_MAX_TIME_PER_PRODUCT_MS = String(Math.max(1000, Math.min(3_600_000, parsedAggressiveMaxTimePerProductMs)));
      }
      const parsedAggressiveThoroughFromRound = Number.parseInt(String(aggressiveThoroughFromRound ?? ''), 10);
      if (Number.isFinite(parsedAggressiveThoroughFromRound) && parsedAggressiveThoroughFromRound >= 1) {
        envOverrides.AGGRESSIVE_THOROUGH_FROM_ROUND = String(Math.max(1, Math.min(12, parsedAggressiveThoroughFromRound)));
      }
      const parsedAggressiveRound1MaxUrls = Number.parseInt(String(aggressiveRound1MaxUrls ?? ''), 10);
      if (Number.isFinite(parsedAggressiveRound1MaxUrls) && parsedAggressiveRound1MaxUrls >= 1) {
        envOverrides.AGGRESSIVE_ROUND1_MAX_URLS = String(Math.max(1, Math.min(2000, parsedAggressiveRound1MaxUrls)));
      }
      const parsedAggressiveRound1MaxCandidateUrls = Number.parseInt(String(aggressiveRound1MaxCandidateUrls ?? ''), 10);
      if (Number.isFinite(parsedAggressiveRound1MaxCandidateUrls) && parsedAggressiveRound1MaxCandidateUrls >= 1) {
        envOverrides.AGGRESSIVE_ROUND1_MAX_CANDIDATE_URLS = String(Math.max(1, Math.min(5000, parsedAggressiveRound1MaxCandidateUrls)));
      }
      const parsedAggressiveLlmMaxCallsPerRound = Number.parseInt(String(aggressiveLlmMaxCallsPerRound ?? ''), 10);
      if (Number.isFinite(parsedAggressiveLlmMaxCallsPerRound) && parsedAggressiveLlmMaxCallsPerRound >= 1) {
        envOverrides.AGGRESSIVE_LLM_MAX_CALLS_PER_ROUND = String(Math.max(1, Math.min(200, parsedAggressiveLlmMaxCallsPerRound)));
      }
      const parsedAggressiveLlmMaxCallsPerProductTotal = Number.parseInt(String(aggressiveLlmMaxCallsPerProductTotal ?? ''), 10);
      if (Number.isFinite(parsedAggressiveLlmMaxCallsPerProductTotal) && parsedAggressiveLlmMaxCallsPerProductTotal >= 1) {
        envOverrides.AGGRESSIVE_LLM_MAX_CALLS_PER_PRODUCT_TOTAL = String(Math.max(1, Math.min(500, parsedAggressiveLlmMaxCallsPerProductTotal)));
      }
      const parsedAggressiveLlmTargetMaxFields = Number.parseInt(String(aggressiveLlmTargetMaxFields ?? ''), 10);
      if (Number.isFinite(parsedAggressiveLlmTargetMaxFields) && parsedAggressiveLlmTargetMaxFields >= 1) {
        envOverrides.AGGRESSIVE_LLM_TARGET_MAX_FIELDS = String(Math.max(1, Math.min(500, parsedAggressiveLlmTargetMaxFields)));
      }
      const parsedAggressiveLlmDiscoveryPasses = Number.parseInt(String(aggressiveLlmDiscoveryPasses ?? ''), 10);
      if (Number.isFinite(parsedAggressiveLlmDiscoveryPasses) && parsedAggressiveLlmDiscoveryPasses >= 1) {
        envOverrides.AGGRESSIVE_LLM_DISCOVERY_PASSES = String(Math.max(1, Math.min(12, parsedAggressiveLlmDiscoveryPasses)));
      }
      const parsedAggressiveLlmDiscoveryQueryCap = Number.parseInt(String(aggressiveLlmDiscoveryQueryCap ?? ''), 10);
      if (Number.isFinite(parsedAggressiveLlmDiscoveryQueryCap) && parsedAggressiveLlmDiscoveryQueryCap >= 1) {
        envOverrides.AGGRESSIVE_LLM_DISCOVERY_QUERY_CAP = String(Math.max(1, Math.min(200, parsedAggressiveLlmDiscoveryQueryCap)));
      }
      if (typeof uberAggressiveEnabled === 'boolean') {
        envOverrides.UBER_AGGRESSIVE_ENABLED = uberAggressiveEnabled ? 'true' : 'false';
      }
      const parsedUberMaxRounds = Number.parseInt(String(uberMaxRounds ?? ''), 10);
      if (Number.isFinite(parsedUberMaxRounds) && parsedUberMaxRounds >= 1) {
        envOverrides.UBER_MAX_ROUNDS = String(Math.max(1, Math.min(12, parsedUberMaxRounds)));
      }
      if (typeof cortexEnabled === 'boolean') {
        envOverrides.CORTEX_ENABLED = cortexEnabled ? 'true' : 'false';
      }
      if (typeof cortexAsyncEnabled === 'boolean') {
        envOverrides.CORTEX_ASYNC_ENABLED = cortexAsyncEnabled ? 'true' : 'false';
      }
      const normalizedCortexBaseUrl = String(cortexBaseUrl || '').trim();
      if (normalizedCortexBaseUrl) {
        envOverrides.CORTEX_BASE_URL = normalizedCortexBaseUrl;
      }
      const normalizedCortexApiKey = String(cortexApiKey || '').trim();
      if (normalizedCortexApiKey) {
        envOverrides.CORTEX_API_KEY = normalizedCortexApiKey;
      }
      const normalizedCortexAsyncBaseUrl = String(cortexAsyncBaseUrl || '').trim();
      if (normalizedCortexAsyncBaseUrl) {
        envOverrides.CORTEX_ASYNC_BASE_URL = normalizedCortexAsyncBaseUrl;
      }
      const normalizedCortexAsyncSubmitPath = String(cortexAsyncSubmitPath || '').trim();
      if (normalizedCortexAsyncSubmitPath) {
        envOverrides.CORTEX_ASYNC_SUBMIT_PATH = normalizedCortexAsyncSubmitPath;
      }
      const normalizedCortexAsyncStatusPath = String(cortexAsyncStatusPath || '').trim();
      if (normalizedCortexAsyncStatusPath) {
        envOverrides.CORTEX_ASYNC_STATUS_PATH = normalizedCortexAsyncStatusPath;
      }
      const parsedCortexSyncTimeoutMs = Number.parseInt(String(cortexSyncTimeoutMs ?? ''), 10);
      if (Number.isFinite(parsedCortexSyncTimeoutMs) && parsedCortexSyncTimeoutMs >= 1000) {
        envOverrides.CORTEX_SYNC_TIMEOUT_MS = String(Math.max(1000, Math.min(600_000, parsedCortexSyncTimeoutMs)));
      }
      const parsedCortexAsyncPollIntervalMs = Number.parseInt(String(cortexAsyncPollIntervalMs ?? ''), 10);
      if (Number.isFinite(parsedCortexAsyncPollIntervalMs) && parsedCortexAsyncPollIntervalMs >= 250) {
        envOverrides.CORTEX_ASYNC_POLL_INTERVAL_MS = String(Math.max(250, Math.min(120_000, parsedCortexAsyncPollIntervalMs)));
      }
      const parsedCortexAsyncMaxWaitMs = Number.parseInt(String(cortexAsyncMaxWaitMs ?? ''), 10);
      if (Number.isFinite(parsedCortexAsyncMaxWaitMs) && parsedCortexAsyncMaxWaitMs >= 1000) {
        envOverrides.CORTEX_ASYNC_MAX_WAIT_MS = String(Math.max(1000, Math.min(3_600_000, parsedCortexAsyncMaxWaitMs)));
      }
      const parsedCortexEnsureReadyTimeoutMs = Number.parseInt(String(cortexEnsureReadyTimeoutMs ?? ''), 10);
      if (Number.isFinite(parsedCortexEnsureReadyTimeoutMs) && parsedCortexEnsureReadyTimeoutMs >= 1000) {
        envOverrides.CORTEX_ENSURE_READY_TIMEOUT_MS = String(Math.max(1000, Math.min(300_000, parsedCortexEnsureReadyTimeoutMs)));
      }
      const parsedCortexStartReadyTimeoutMs = Number.parseInt(String(cortexStartReadyTimeoutMs ?? ''), 10);
      if (Number.isFinite(parsedCortexStartReadyTimeoutMs) && parsedCortexStartReadyTimeoutMs >= 1000) {
        envOverrides.CORTEX_START_READY_TIMEOUT_MS = String(Math.max(1000, Math.min(300_000, parsedCortexStartReadyTimeoutMs)));
      }
      const parsedCortexFailureThreshold = Number.parseInt(String(cortexFailureThreshold ?? ''), 10);
      if (Number.isFinite(parsedCortexFailureThreshold) && parsedCortexFailureThreshold >= 1) {
        envOverrides.CORTEX_FAILURE_THRESHOLD = String(Math.max(1, Math.min(20, parsedCortexFailureThreshold)));
      }
      const parsedCortexCircuitOpenMs = Number.parseInt(String(cortexCircuitOpenMs ?? ''), 10);
      if (Number.isFinite(parsedCortexCircuitOpenMs) && parsedCortexCircuitOpenMs >= 1000) {
        envOverrides.CORTEX_CIRCUIT_OPEN_MS = String(Math.max(1000, Math.min(600_000, parsedCortexCircuitOpenMs)));
      }
      const normalizedCortexModelFast = String(cortexModelFast || '').trim();
      if (normalizedCortexModelFast) {
        envOverrides.CORTEX_MODEL_FAST = normalizedCortexModelFast;
      }
      const normalizedCortexModelAudit = String(cortexModelAudit || '').trim();
      if (normalizedCortexModelAudit) {
        envOverrides.CORTEX_MODEL_AUDIT = normalizedCortexModelAudit;
      }
      const normalizedCortexModelDom = String(cortexModelDom || '').trim();
      if (normalizedCortexModelDom) {
        envOverrides.CORTEX_MODEL_DOM = normalizedCortexModelDom;
      }
      const normalizedCortexModelReasoningDeep = String(cortexModelReasoningDeep || '').trim();
      if (normalizedCortexModelReasoningDeep) {
        envOverrides.CORTEX_MODEL_REASONING_DEEP = normalizedCortexModelReasoningDeep;
      }
      const normalizedCortexModelVision = String(cortexModelVision || '').trim();
      if (normalizedCortexModelVision) {
        envOverrides.CORTEX_MODEL_VISION = normalizedCortexModelVision;
      }
      const normalizedCortexModelSearchFast = String(cortexModelSearchFast || '').trim();
      if (normalizedCortexModelSearchFast) {
        envOverrides.CORTEX_MODEL_SEARCH_FAST = normalizedCortexModelSearchFast;
      }
      const normalizedCortexModelRerankFast = String(cortexModelRerankFast || '').trim();
      if (normalizedCortexModelRerankFast) {
        envOverrides.CORTEX_MODEL_RERANK_FAST = normalizedCortexModelRerankFast;
      }
      const normalizedCortexModelSearchDeep = String(cortexModelSearchDeep || '').trim();
      if (normalizedCortexModelSearchDeep) {
        envOverrides.CORTEX_MODEL_SEARCH_DEEP = normalizedCortexModelSearchDeep;
      }
      if (typeof cortexAutoStart === 'boolean') {
        envOverrides.CORTEX_AUTO_START = cortexAutoStart ? 'true' : 'false';
      }
      if (typeof cortexAutoRestartOnAuth === 'boolean') {
        envOverrides.CORTEX_AUTO_RESTART_ON_AUTH = cortexAutoRestartOnAuth ? 'true' : 'false';
      }
      const parsedCortexEscalateConfidenceLt = Number.parseFloat(String(cortexEscalateConfidenceLt ?? ''));
      if (Number.isFinite(parsedCortexEscalateConfidenceLt)) {
        envOverrides.CORTEX_ESCALATE_CONFIDENCE_LT = String(Math.max(0, Math.min(1, parsedCortexEscalateConfidenceLt)));
      }
      if (typeof cortexEscalateIfConflict === 'boolean') {
        envOverrides.CORTEX_ESCALATE_IF_CONFLICT = cortexEscalateIfConflict ? 'true' : 'false';
      }
      if (typeof cortexEscalateCriticalOnly === 'boolean') {
        envOverrides.CORTEX_ESCALATE_CRITICAL_ONLY = cortexEscalateCriticalOnly ? 'true' : 'false';
      }
      const parsedCortexMaxDeepFieldsPerProduct = Number.parseInt(String(cortexMaxDeepFieldsPerProduct ?? ''), 10);
      if (Number.isFinite(parsedCortexMaxDeepFieldsPerProduct) && parsedCortexMaxDeepFieldsPerProduct >= 1) {
        envOverrides.CORTEX_MAX_DEEP_FIELDS_PER_PRODUCT = String(Math.max(1, Math.min(200, parsedCortexMaxDeepFieldsPerProduct)));
      }
      const normalizedOutputMode = String(outputMode || '').trim().toLowerCase();
      if (normalizedOutputMode === 'local' || normalizedOutputMode === 'dual' || normalizedOutputMode === 's3') {
        envOverrides.OUTPUT_MODE = normalizedOutputMode;
      }
      if (typeof localMode === 'boolean') {
        envOverrides.LOCAL_MODE = localMode ? 'true' : 'false';
      }
      if (typeof dryRun === 'boolean') {
        envOverrides.DRY_RUN = dryRun ? 'true' : 'false';
      }
      if (typeof mirrorToS3 === 'boolean') {
        envOverrides.MIRROR_TO_S3 = mirrorToS3 ? 'true' : 'false';
      }
      if (typeof mirrorToS3Input === 'boolean') {
        envOverrides.MIRROR_TO_S3_INPUT = mirrorToS3Input ? 'true' : 'false';
      }
      const normalizedLocalInputRoot = String(localInputRoot || '').trim();
      if (normalizedLocalInputRoot) {
        envOverrides.LOCAL_INPUT_ROOT = normalizedLocalInputRoot;
      }
      const normalizedLocalOutputRoot = String(localOutputRoot || '').trim();
      if (normalizedLocalOutputRoot) {
        envOverrides.LOCAL_OUTPUT_ROOT = normalizedLocalOutputRoot;
      }
      const normalizedRuntimeEventsKey = String(runtimeEventsKey || '').trim();
      if (normalizedRuntimeEventsKey) {
        envOverrides.RUNTIME_EVENTS_KEY = normalizedRuntimeEventsKey;
      }
      if (typeof writeMarkdownSummary === 'boolean') {
        envOverrides.WRITE_MARKDOWN_SUMMARY = writeMarkdownSummary ? 'true' : 'false';
      }
      if (typeof llmEnabled === 'boolean') {
        envOverrides.LLM_ENABLED = llmEnabled ? 'true' : 'false';
      }
      if (typeof llmWriteSummary === 'boolean') {
        envOverrides.LLM_WRITE_SUMMARY = llmWriteSummary ? 'true' : 'false';
      }
      const normalizedAwsRegion = String(awsRegion || '').trim();
      if (normalizedAwsRegion) {
        envOverrides.AWS_REGION = normalizedAwsRegion;
      }
      const normalizedS3Bucket = String(s3Bucket || '').trim();
      if (normalizedS3Bucket) {
        envOverrides.S3_BUCKET = normalizedS3Bucket;
      }
      const normalizedS3InputPrefix = String(s3InputPrefix || '').trim();
      if (normalizedS3InputPrefix) {
        envOverrides.S3_INPUT_PREFIX = normalizedS3InputPrefix;
      }
      const normalizedS3OutputPrefix = String(s3OutputPrefix || '').trim();
      if (normalizedS3OutputPrefix) {
        envOverrides.S3_OUTPUT_PREFIX = normalizedS3OutputPrefix;
      }
      const normalizedEloSupabaseAnonKey = String(eloSupabaseAnonKey || '').trim();
      if (normalizedEloSupabaseAnonKey) {
        envOverrides.ELO_SUPABASE_ANON_KEY = normalizedEloSupabaseAnonKey;
      }
      const normalizedEloSupabaseEndpoint = String(eloSupabaseEndpoint || '').trim();
      if (normalizedEloSupabaseEndpoint) {
        envOverrides.ELO_SUPABASE_ENDPOINT = normalizedEloSupabaseEndpoint;
      }
      const normalizedLlmProvider = String(llmProvider || '').trim();
      if (normalizedLlmProvider) {
        envOverrides.LLM_PROVIDER = normalizedLlmProvider;
      }
      const normalizedLlmBaseUrl = String(llmBaseUrl || '').trim();
      if (normalizedLlmBaseUrl) {
        envOverrides.LLM_BASE_URL = normalizedLlmBaseUrl;
      }
      const normalizedOpenAiApiKey = String(openaiApiKey || '').trim();
      if (normalizedOpenAiApiKey) {
        envOverrides.OPENAI_API_KEY = normalizedOpenAiApiKey;
      }
      const normalizedAnthropicApiKey = String(anthropicApiKey || '').trim();
      if (normalizedAnthropicApiKey) {
        envOverrides.ANTHROPIC_API_KEY = normalizedAnthropicApiKey;
      }
      if (typeof allowBelowPassTargetFill === 'boolean') {
        envOverrides.ALLOW_BELOW_PASS_TARGET_FILL = allowBelowPassTargetFill ? 'true' : 'false';
      }
      if (typeof indexingHelperFilesEnabled === 'boolean') {
        envOverrides.INDEXING_HELPER_FILES_ENABLED = indexingHelperFilesEnabled ? 'true' : 'false';
      }
      if (typeof manufacturerDeepResearchEnabled === 'boolean') {
        envOverrides.MANUFACTURER_DEEP_RESEARCH_ENABLED = manufacturerDeepResearchEnabled ? 'true' : 'false';
      }
      const parsedMaxManufacturerUrlsPerProduct = Number.parseInt(String(maxManufacturerUrlsPerProduct ?? ''), 10);
      if (Number.isFinite(parsedMaxManufacturerUrlsPerProduct) && parsedMaxManufacturerUrlsPerProduct >= 1) {
        envOverrides.MAX_MANUFACTURER_URLS_PER_PRODUCT = String(Math.max(1, Math.min(1000, parsedMaxManufacturerUrlsPerProduct)));
      }
      const parsedMaxManufacturerPagesPerDomain = Number.parseInt(String(maxManufacturerPagesPerDomain ?? ''), 10);
      if (Number.isFinite(parsedMaxManufacturerPagesPerDomain) && parsedMaxManufacturerPagesPerDomain >= 1) {
        envOverrides.MAX_MANUFACTURER_PAGES_PER_DOMAIN = String(Math.max(1, Math.min(200, parsedMaxManufacturerPagesPerDomain)));
      }
      const parsedManufacturerReserveUrls = Number.parseInt(String(manufacturerReserveUrls ?? ''), 10);
      if (Number.isFinite(parsedManufacturerReserveUrls) && parsedManufacturerReserveUrls >= 0) {
        envOverrides.MANUFACTURER_RESERVE_URLS = String(Math.max(0, Math.min(1000, parsedManufacturerReserveUrls)));
      }
      const normalizedUserAgent = String(userAgent || '').trim();
      if (normalizedUserAgent) {
        envOverrides.USER_AGENT = normalizedUserAgent;
      }
      if (typeof selfImproveEnabled === 'boolean') {
        envOverrides.SELF_IMPROVE_ENABLED = selfImproveEnabled ? 'true' : 'false';
      }
      const parsedLearningConfidenceThreshold = Number.parseFloat(String(learningConfidenceThreshold ?? ''));
      if (Number.isFinite(parsedLearningConfidenceThreshold) && parsedLearningConfidenceThreshold >= 0) {
        envOverrides.LEARNING_CONFIDENCE_THRESHOLD = String(Math.max(0, Math.min(1, parsedLearningConfidenceThreshold)));
      }
      const parsedComponentLexiconDecayDays = Number.parseInt(String(componentLexiconDecayDays ?? ''), 10);
      if (Number.isFinite(parsedComponentLexiconDecayDays) && parsedComponentLexiconDecayDays >= 1) {
        envOverrides.COMPONENT_LEXICON_DECAY_DAYS = String(Math.max(1, Math.min(3650, parsedComponentLexiconDecayDays)));
      }
      const parsedComponentLexiconExpireDays = Number.parseInt(String(componentLexiconExpireDays ?? ''), 10);
      if (Number.isFinite(parsedComponentLexiconExpireDays) && parsedComponentLexiconExpireDays >= 1) {
        envOverrides.COMPONENT_LEXICON_EXPIRE_DAYS = String(Math.max(1, Math.min(3650, parsedComponentLexiconExpireDays)));
      }
      const parsedFieldAnchorsDecayDays = Number.parseInt(String(fieldAnchorsDecayDays ?? ''), 10);
      if (Number.isFinite(parsedFieldAnchorsDecayDays) && parsedFieldAnchorsDecayDays >= 1) {
        envOverrides.FIELD_ANCHORS_DECAY_DAYS = String(Math.max(1, Math.min(3650, parsedFieldAnchorsDecayDays)));
      }
      const parsedUrlMemoryDecayDays = Number.parseInt(String(urlMemoryDecayDays ?? ''), 10);
      if (Number.isFinite(parsedUrlMemoryDecayDays) && parsedUrlMemoryDecayDays >= 1) {
        envOverrides.URL_MEMORY_DECAY_DAYS = String(Math.max(1, Math.min(3650, parsedUrlMemoryDecayDays)));
      }
      const parsedMaxHypothesisItems = Number.parseInt(String(maxHypothesisItems ?? ''), 10);
      if (Number.isFinite(parsedMaxHypothesisItems) && parsedMaxHypothesisItems >= 1) {
        envOverrides.MAX_HYPOTHESIS_ITEMS = String(Math.max(1, Math.min(1000, parsedMaxHypothesisItems)));
      }
      const parsedHypothesisAutoFollowupRounds = Number.parseInt(String(hypothesisAutoFollowupRounds ?? ''), 10);
      if (Number.isFinite(parsedHypothesisAutoFollowupRounds) && parsedHypothesisAutoFollowupRounds >= 0) {
        envOverrides.HYPOTHESIS_AUTO_FOLLOWUP_ROUNDS = String(Math.max(0, Math.min(10, parsedHypothesisAutoFollowupRounds)));
      }
      const parsedHypothesisFollowupUrlsPerRound = Number.parseInt(String(hypothesisFollowupUrlsPerRound ?? ''), 10);
      if (Number.isFinite(parsedHypothesisFollowupUrlsPerRound) && parsedHypothesisFollowupUrlsPerRound >= 1) {
        envOverrides.HYPOTHESIS_FOLLOWUP_URLS_PER_ROUND = String(Math.max(1, Math.min(200, parsedHypothesisFollowupUrlsPerRound)));
      }
      const parsedEndpointSignalLimit = Number.parseInt(String(endpointSignalLimit ?? ''), 10);
      if (Number.isFinite(parsedEndpointSignalLimit) && parsedEndpointSignalLimit >= 1) {
        envOverrides.ENDPOINT_SIGNAL_LIMIT = String(Math.max(1, Math.min(500, parsedEndpointSignalLimit)));
      }
      const parsedEndpointSuggestionLimit = Number.parseInt(String(endpointSuggestionLimit ?? ''), 10);
      if (Number.isFinite(parsedEndpointSuggestionLimit) && parsedEndpointSuggestionLimit >= 1) {
        envOverrides.ENDPOINT_SUGGESTION_LIMIT = String(Math.max(1, Math.min(200, parsedEndpointSuggestionLimit)));
      }
      const parsedEndpointNetworkScanLimit = Number.parseInt(String(endpointNetworkScanLimit ?? ''), 10);
      if (Number.isFinite(parsedEndpointNetworkScanLimit) && parsedEndpointNetworkScanLimit >= 50) {
        envOverrides.ENDPOINT_NETWORK_SCAN_LIMIT = String(Math.max(50, Math.min(10_000, parsedEndpointNetworkScanLimit)));
      }
      const normalizedSearxngBaseUrl = String(searxngBaseUrl || '').trim();
      if (normalizedSearxngBaseUrl) {
        envOverrides.SEARXNG_BASE_URL = normalizedSearxngBaseUrl;
      }
      const normalizedBingSearchEndpoint = String(bingSearchEndpoint || '').trim();
      if (normalizedBingSearchEndpoint) {
        envOverrides.BING_SEARCH_ENDPOINT = normalizedBingSearchEndpoint;
      }
      const normalizedGoogleCseCx = String(googleCseCx || '').trim();
      if (normalizedGoogleCseCx) {
        envOverrides.GOOGLE_CSE_CX = normalizedGoogleCseCx;
      }
      const normalizedGoogleCseKey = String(googleCseKey || '').trim();
      if (normalizedGoogleCseKey) {
        envOverrides.GOOGLE_CSE_KEY = normalizedGoogleCseKey;
      }
      const normalizedBingSearchKey = String(bingSearchKey || '').trim();
      if (normalizedBingSearchKey) {
        envOverrides.BING_SEARCH_KEY = normalizedBingSearchKey;
      }
      const normalizedDuckduckgoBaseUrl = String(duckduckgoBaseUrl || '').trim();
      if (normalizedDuckduckgoBaseUrl) {
        envOverrides.DUCKDUCKGO_BASE_URL = normalizedDuckduckgoBaseUrl;
      }
      if (typeof disableGoogleCse === 'boolean') {
        envOverrides.DISABLE_GOOGLE_CSE = disableGoogleCse ? 'true' : 'false';
      }
      if (typeof cseRescueOnlyMode === 'boolean') {
        envOverrides.CSE_RESCUE_ONLY_MODE = cseRescueOnlyMode ? 'true' : 'false';
      }
      const parsedCseRescueRequiredIteration = Number.parseInt(String(cseRescueRequiredIteration ?? ''), 10);
      if (Number.isFinite(parsedCseRescueRequiredIteration) && parsedCseRescueRequiredIteration >= 1) {
        envOverrides.CSE_RESCUE_REQUIRED_ITERATION = String(Math.max(1, Math.min(12, parsedCseRescueRequiredIteration)));
      }
      if (typeof duckduckgoEnabled === 'boolean') {
        envOverrides.DUCKDUCKGO_ENABLED = duckduckgoEnabled ? 'true' : 'false';
      }
      const parsedDuckduckgoTimeoutMs = Number.parseInt(String(duckduckgoTimeoutMs ?? ''), 10);
      if (Number.isFinite(parsedDuckduckgoTimeoutMs) && parsedDuckduckgoTimeoutMs >= 250) {
        envOverrides.DUCKDUCKGO_TIMEOUT_MS = String(Math.max(250, Math.min(120_000, parsedDuckduckgoTimeoutMs)));
      }
      const normalizedLlmPlanProvider = String(llmPlanProvider || '').trim();
      if (normalizedLlmPlanProvider) {
        envOverrides.LLM_PLAN_PROVIDER = normalizedLlmPlanProvider;
      }
      const normalizedLlmPlanBaseUrl = String(llmPlanBaseUrl || '').trim();
      if (normalizedLlmPlanBaseUrl) {
        envOverrides.LLM_PLAN_BASE_URL = normalizedLlmPlanBaseUrl;
      }
      const normalizedLlmPlanApiKey = String(llmPlanApiKey || '').trim();
      if (normalizedLlmPlanApiKey) {
        envOverrides.LLM_PLAN_API_KEY = normalizedLlmPlanApiKey;
      }
      if (typeof llmExtractionCacheEnabled === 'boolean') {
        envOverrides.LLM_EXTRACTION_CACHE_ENABLED = llmExtractionCacheEnabled ? 'true' : 'false';
      }
      const normalizedLlmExtractionCacheDir = String(llmExtractionCacheDir || '').trim();
      if (normalizedLlmExtractionCacheDir) {
        envOverrides.LLM_EXTRACTION_CACHE_DIR = normalizedLlmExtractionCacheDir;
      }
      const parsedLlmExtractionCacheTtlMs = Number.parseInt(String(llmExtractionCacheTtlMs ?? ''), 10);
      if (Number.isFinite(parsedLlmExtractionCacheTtlMs) && parsedLlmExtractionCacheTtlMs >= 60_000) {
        envOverrides.LLM_EXTRACTION_CACHE_TTL_MS = String(Math.max(60_000, Math.min(31_536_000_000, parsedLlmExtractionCacheTtlMs)));
      }
      const parsedLlmMaxCallsPerProductTotal = Number.parseInt(String(llmMaxCallsPerProductTotal ?? ''), 10);
      if (Number.isFinite(parsedLlmMaxCallsPerProductTotal) && parsedLlmMaxCallsPerProductTotal >= 1) {
        envOverrides.LLM_MAX_CALLS_PER_PRODUCT_TOTAL = String(Math.max(1, Math.min(100, parsedLlmMaxCallsPerProductTotal)));
      }
      const parsedLlmMaxCallsPerProductFast = Number.parseInt(String(llmMaxCallsPerProductFast ?? ''), 10);
      if (Number.isFinite(parsedLlmMaxCallsPerProductFast) && parsedLlmMaxCallsPerProductFast >= 0) {
        envOverrides.LLM_MAX_CALLS_PER_PRODUCT_FAST = String(Math.max(0, Math.min(100, parsedLlmMaxCallsPerProductFast)));
      }
      const parsedNeedsetEvidenceDecayDays = Number.parseInt(String(needsetEvidenceDecayDays ?? ''), 10);
      if (Number.isFinite(parsedNeedsetEvidenceDecayDays) && parsedNeedsetEvidenceDecayDays >= 1) {
        envOverrides.NEEDSET_EVIDENCE_DECAY_DAYS = String(Math.max(1, Math.min(90, parsedNeedsetEvidenceDecayDays)));
      }
      const parsedNeedsetEvidenceDecayFloor = Number.parseFloat(String(needsetEvidenceDecayFloor ?? ''));
      if (Number.isFinite(parsedNeedsetEvidenceDecayFloor)) {
        envOverrides.NEEDSET_EVIDENCE_DECAY_FLOOR = String(Math.max(0, Math.min(0.9, parsedNeedsetEvidenceDecayFloor)));
      }
      const parsedNeedsetRequiredWeightIdentity = Number.parseFloat(String(needsetRequiredWeightIdentity ?? ''));
      if (Number.isFinite(parsedNeedsetRequiredWeightIdentity)) {
        envOverrides.NEEDSET_REQUIRED_WEIGHT_IDENTITY = String(Math.max(0.1, Math.min(100, parsedNeedsetRequiredWeightIdentity)));
      }
      const parsedNeedsetRequiredWeightCritical = Number.parseFloat(String(needsetRequiredWeightCritical ?? ''));
      if (Number.isFinite(parsedNeedsetRequiredWeightCritical)) {
        envOverrides.NEEDSET_REQUIRED_WEIGHT_CRITICAL = String(Math.max(0.1, Math.min(100, parsedNeedsetRequiredWeightCritical)));
      }
      const parsedNeedsetRequiredWeightRequired = Number.parseFloat(String(needsetRequiredWeightRequired ?? ''));
      if (Number.isFinite(parsedNeedsetRequiredWeightRequired)) {
        envOverrides.NEEDSET_REQUIRED_WEIGHT_REQUIRED = String(Math.max(0.1, Math.min(100, parsedNeedsetRequiredWeightRequired)));
      }
      const parsedNeedsetRequiredWeightExpected = Number.parseFloat(String(needsetRequiredWeightExpected ?? ''));
      if (Number.isFinite(parsedNeedsetRequiredWeightExpected)) {
        envOverrides.NEEDSET_REQUIRED_WEIGHT_EXPECTED = String(Math.max(0.1, Math.min(100, parsedNeedsetRequiredWeightExpected)));
      }
      const parsedNeedsetRequiredWeightOptional = Number.parseFloat(String(needsetRequiredWeightOptional ?? ''));
      if (Number.isFinite(parsedNeedsetRequiredWeightOptional)) {
        envOverrides.NEEDSET_REQUIRED_WEIGHT_OPTIONAL = String(Math.max(0.1, Math.min(100, parsedNeedsetRequiredWeightOptional)));
      }
      const parsedNeedsetMissingMultiplier = Number.parseFloat(String(needsetMissingMultiplier ?? ''));
      if (Number.isFinite(parsedNeedsetMissingMultiplier)) {
        envOverrides.NEEDSET_MISSING_MULTIPLIER = String(Math.max(0.1, Math.min(100, parsedNeedsetMissingMultiplier)));
      }
      const parsedNeedsetTierDeficitMultiplier = Number.parseFloat(String(needsetTierDeficitMultiplier ?? ''));
      if (Number.isFinite(parsedNeedsetTierDeficitMultiplier)) {
        envOverrides.NEEDSET_TIER_DEFICIT_MULTIPLIER = String(Math.max(0.1, Math.min(100, parsedNeedsetTierDeficitMultiplier)));
      }
      const parsedNeedsetMinRefsDeficitMultiplier = Number.parseFloat(String(needsetMinRefsDeficitMultiplier ?? ''));
      if (Number.isFinite(parsedNeedsetMinRefsDeficitMultiplier)) {
        envOverrides.NEEDSET_MIN_REFS_DEFICIT_MULTIPLIER = String(Math.max(0.1, Math.min(100, parsedNeedsetMinRefsDeficitMultiplier)));
      }
      const parsedNeedsetConflictMultiplier = Number.parseFloat(String(needsetConflictMultiplier ?? ''));
      if (Number.isFinite(parsedNeedsetConflictMultiplier)) {
        envOverrides.NEEDSET_CONFLICT_MULTIPLIER = String(Math.max(0.1, Math.min(100, parsedNeedsetConflictMultiplier)));
      }
      const parsedNeedsetIdentityLockThreshold = Number.parseFloat(String(needsetIdentityLockThreshold ?? ''));
      if (Number.isFinite(parsedNeedsetIdentityLockThreshold)) {
        envOverrides.NEEDSET_IDENTITY_LOCK_THRESHOLD = String(Math.max(0, Math.min(1, parsedNeedsetIdentityLockThreshold)));
      }
      const parsedNeedsetIdentityProvisionalThreshold = Number.parseFloat(String(needsetIdentityProvisionalThreshold ?? ''));
      if (Number.isFinite(parsedNeedsetIdentityProvisionalThreshold)) {
        envOverrides.NEEDSET_IDENTITY_PROVISIONAL_THRESHOLD = String(Math.max(0, Math.min(1, parsedNeedsetIdentityProvisionalThreshold)));
      }
      const parsedNeedsetDefaultIdentityAuditLimit = Number.parseInt(String(needsetDefaultIdentityAuditLimit ?? ''), 10);
      if (Number.isFinite(parsedNeedsetDefaultIdentityAuditLimit) && parsedNeedsetDefaultIdentityAuditLimit >= 1) {
        envOverrides.NEEDSET_DEFAULT_IDENTITY_AUDIT_LIMIT = String(Math.max(1, Math.min(200, parsedNeedsetDefaultIdentityAuditLimit)));
      }
      const parsedConsensusMethodWeightNetworkJson = Number.parseFloat(String(consensusMethodWeightNetworkJson ?? ''));
      if (Number.isFinite(parsedConsensusMethodWeightNetworkJson)) {
        envOverrides.CONSENSUS_METHOD_WEIGHT_NETWORK_JSON = String(Math.max(0, Math.min(2, parsedConsensusMethodWeightNetworkJson)));
      }
      const parsedConsensusMethodWeightAdapterApi = Number.parseFloat(String(consensusMethodWeightAdapterApi ?? ''));
      if (Number.isFinite(parsedConsensusMethodWeightAdapterApi)) {
        envOverrides.CONSENSUS_METHOD_WEIGHT_ADAPTER_API = String(Math.max(0, Math.min(2, parsedConsensusMethodWeightAdapterApi)));
      }
      const parsedConsensusMethodWeightStructuredMeta = Number.parseFloat(String(consensusMethodWeightStructuredMeta ?? ''));
      if (Number.isFinite(parsedConsensusMethodWeightStructuredMeta)) {
        envOverrides.CONSENSUS_METHOD_WEIGHT_STRUCTURED_META = String(Math.max(0, Math.min(2, parsedConsensusMethodWeightStructuredMeta)));
      }
      const parsedConsensusMethodWeightPdf = Number.parseFloat(String(consensusMethodWeightPdf ?? ''));
      if (Number.isFinite(parsedConsensusMethodWeightPdf)) {
        envOverrides.CONSENSUS_METHOD_WEIGHT_PDF = String(Math.max(0, Math.min(2, parsedConsensusMethodWeightPdf)));
      }
      const parsedConsensusMethodWeightTableKv = Number.parseFloat(String(consensusMethodWeightTableKv ?? ''));
      if (Number.isFinite(parsedConsensusMethodWeightTableKv)) {
        envOverrides.CONSENSUS_METHOD_WEIGHT_TABLE_KV = String(Math.max(0, Math.min(2, parsedConsensusMethodWeightTableKv)));
      }
      const parsedConsensusMethodWeightDom = Number.parseFloat(String(consensusMethodWeightDom ?? ''));
      if (Number.isFinite(parsedConsensusMethodWeightDom)) {
        envOverrides.CONSENSUS_METHOD_WEIGHT_DOM = String(Math.max(0, Math.min(2, parsedConsensusMethodWeightDom)));
      }
      const parsedConsensusMethodWeightLlmExtractBase = Number.parseFloat(String(consensusMethodWeightLlmExtractBase ?? ''));
      if (Number.isFinite(parsedConsensusMethodWeightLlmExtractBase)) {
        envOverrides.CONSENSUS_METHOD_WEIGHT_LLM_EXTRACT_BASE = String(Math.max(0, Math.min(2, parsedConsensusMethodWeightLlmExtractBase)));
      }
      const parsedConsensusPolicyBonus = Number.parseFloat(String(consensusPolicyBonus ?? ''));
      if (Number.isFinite(parsedConsensusPolicyBonus)) {
        envOverrides.CONSENSUS_POLICY_BONUS = String(Math.max(-5, Math.min(5, parsedConsensusPolicyBonus)));
      }
      const parsedConsensusWeightedMajorityThreshold = Number.parseFloat(String(consensusWeightedMajorityThreshold ?? ''));
      if (Number.isFinite(parsedConsensusWeightedMajorityThreshold)) {
        envOverrides.CONSENSUS_WEIGHTED_MAJORITY_THRESHOLD = String(Math.max(1, Math.min(10, parsedConsensusWeightedMajorityThreshold)));
      }
      const parsedConsensusStrictAcceptanceDomainCount = Number.parseInt(String(consensusStrictAcceptanceDomainCount ?? ''), 10);
      if (Number.isFinite(parsedConsensusStrictAcceptanceDomainCount) && parsedConsensusStrictAcceptanceDomainCount >= 1) {
        envOverrides.CONSENSUS_STRICT_ACCEPTANCE_DOMAIN_COUNT = String(Math.max(1, Math.min(50, parsedConsensusStrictAcceptanceDomainCount)));
      }
      const parsedConsensusRelaxedAcceptanceDomainCount = Number.parseInt(String(consensusRelaxedAcceptanceDomainCount ?? ''), 10);
      if (Number.isFinite(parsedConsensusRelaxedAcceptanceDomainCount) && parsedConsensusRelaxedAcceptanceDomainCount >= 1) {
        envOverrides.CONSENSUS_RELAXED_ACCEPTANCE_DOMAIN_COUNT = String(Math.max(1, Math.min(50, parsedConsensusRelaxedAcceptanceDomainCount)));
      }
      const parsedConsensusInstrumentedFieldThreshold = Number.parseInt(String(consensusInstrumentedFieldThreshold ?? ''), 10);
      if (Number.isFinite(parsedConsensusInstrumentedFieldThreshold) && parsedConsensusInstrumentedFieldThreshold >= 1) {
        envOverrides.CONSENSUS_INSTRUMENTED_FIELD_THRESHOLD = String(Math.max(1, Math.min(50, parsedConsensusInstrumentedFieldThreshold)));
      }
      const parsedConsensusConfidenceScoringBase = Number.parseFloat(String(consensusConfidenceScoringBase ?? ''));
      if (Number.isFinite(parsedConsensusConfidenceScoringBase)) {
        envOverrides.CONSENSUS_CONFIDENCE_SCORING_BASE = String(Math.max(0, Math.min(1, parsedConsensusConfidenceScoringBase)));
      }
      const parsedConsensusPassTargetIdentityStrong = Number.parseInt(String(consensusPassTargetIdentityStrong ?? ''), 10);
      if (Number.isFinite(parsedConsensusPassTargetIdentityStrong) && parsedConsensusPassTargetIdentityStrong >= 1) {
        envOverrides.CONSENSUS_PASS_TARGET_IDENTITY_STRONG = String(Math.max(1, Math.min(50, parsedConsensusPassTargetIdentityStrong)));
      }
      const parsedConsensusPassTargetNormal = Number.parseInt(String(consensusPassTargetNormal ?? ''), 10);
      if (Number.isFinite(parsedConsensusPassTargetNormal) && parsedConsensusPassTargetNormal >= 1) {
        envOverrides.CONSENSUS_PASS_TARGET_NORMAL = String(Math.max(1, Math.min(50, parsedConsensusPassTargetNormal)));
      }
      const parsedRetrievalTierWeightTier1 = Number.parseFloat(String(retrievalTierWeightTier1 ?? ''));
      if (Number.isFinite(parsedRetrievalTierWeightTier1)) {
        envOverrides.RETRIEVAL_TIER_WEIGHT_TIER1 = String(Math.max(0, Math.min(10, parsedRetrievalTierWeightTier1)));
      }
      const parsedRetrievalTierWeightTier2 = Number.parseFloat(String(retrievalTierWeightTier2 ?? ''));
      if (Number.isFinite(parsedRetrievalTierWeightTier2)) {
        envOverrides.RETRIEVAL_TIER_WEIGHT_TIER2 = String(Math.max(0, Math.min(10, parsedRetrievalTierWeightTier2)));
      }
      const parsedRetrievalTierWeightTier3 = Number.parseFloat(String(retrievalTierWeightTier3 ?? ''));
      if (Number.isFinite(parsedRetrievalTierWeightTier3)) {
        envOverrides.RETRIEVAL_TIER_WEIGHT_TIER3 = String(Math.max(0, Math.min(10, parsedRetrievalTierWeightTier3)));
      }
      const parsedRetrievalTierWeightTier4 = Number.parseFloat(String(retrievalTierWeightTier4 ?? ''));
      if (Number.isFinite(parsedRetrievalTierWeightTier4)) {
        envOverrides.RETRIEVAL_TIER_WEIGHT_TIER4 = String(Math.max(0, Math.min(10, parsedRetrievalTierWeightTier4)));
      }
      const parsedRetrievalTierWeightTier5 = Number.parseFloat(String(retrievalTierWeightTier5 ?? ''));
      if (Number.isFinite(parsedRetrievalTierWeightTier5)) {
        envOverrides.RETRIEVAL_TIER_WEIGHT_TIER5 = String(Math.max(0, Math.min(10, parsedRetrievalTierWeightTier5)));
      }
      const parsedRetrievalDocKindWeightManualPdf = Number.parseFloat(String(retrievalDocKindWeightManualPdf ?? ''));
      if (Number.isFinite(parsedRetrievalDocKindWeightManualPdf)) {
        envOverrides.RETRIEVAL_DOC_KIND_WEIGHT_MANUAL_PDF = String(Math.max(0, Math.min(10, parsedRetrievalDocKindWeightManualPdf)));
      }
      const parsedRetrievalDocKindWeightSpecPdf = Number.parseFloat(String(retrievalDocKindWeightSpecPdf ?? ''));
      if (Number.isFinite(parsedRetrievalDocKindWeightSpecPdf)) {
        envOverrides.RETRIEVAL_DOC_KIND_WEIGHT_SPEC_PDF = String(Math.max(0, Math.min(10, parsedRetrievalDocKindWeightSpecPdf)));
      }
      const parsedRetrievalDocKindWeightSupport = Number.parseFloat(String(retrievalDocKindWeightSupport ?? ''));
      if (Number.isFinite(parsedRetrievalDocKindWeightSupport)) {
        envOverrides.RETRIEVAL_DOC_KIND_WEIGHT_SUPPORT = String(Math.max(0, Math.min(10, parsedRetrievalDocKindWeightSupport)));
      }
      const parsedRetrievalDocKindWeightLabReview = Number.parseFloat(String(retrievalDocKindWeightLabReview ?? ''));
      if (Number.isFinite(parsedRetrievalDocKindWeightLabReview)) {
        envOverrides.RETRIEVAL_DOC_KIND_WEIGHT_LAB_REVIEW = String(Math.max(0, Math.min(10, parsedRetrievalDocKindWeightLabReview)));
      }
      const parsedRetrievalDocKindWeightProductPage = Number.parseFloat(String(retrievalDocKindWeightProductPage ?? ''));
      if (Number.isFinite(parsedRetrievalDocKindWeightProductPage)) {
        envOverrides.RETRIEVAL_DOC_KIND_WEIGHT_PRODUCT_PAGE = String(Math.max(0, Math.min(10, parsedRetrievalDocKindWeightProductPage)));
      }
      const parsedRetrievalDocKindWeightOther = Number.parseFloat(String(retrievalDocKindWeightOther ?? ''));
      if (Number.isFinite(parsedRetrievalDocKindWeightOther)) {
        envOverrides.RETRIEVAL_DOC_KIND_WEIGHT_OTHER = String(Math.max(0, Math.min(10, parsedRetrievalDocKindWeightOther)));
      }
      const parsedRetrievalMethodWeightTable = Number.parseFloat(String(retrievalMethodWeightTable ?? ''));
      if (Number.isFinite(parsedRetrievalMethodWeightTable)) {
        envOverrides.RETRIEVAL_METHOD_WEIGHT_TABLE = String(Math.max(0, Math.min(10, parsedRetrievalMethodWeightTable)));
      }
      const parsedRetrievalMethodWeightKv = Number.parseFloat(String(retrievalMethodWeightKv ?? ''));
      if (Number.isFinite(parsedRetrievalMethodWeightKv)) {
        envOverrides.RETRIEVAL_METHOD_WEIGHT_KV = String(Math.max(0, Math.min(10, parsedRetrievalMethodWeightKv)));
      }
      const parsedRetrievalMethodWeightJsonLd = Number.parseFloat(String(retrievalMethodWeightJsonLd ?? ''));
      if (Number.isFinite(parsedRetrievalMethodWeightJsonLd)) {
        envOverrides.RETRIEVAL_METHOD_WEIGHT_JSON_LD = String(Math.max(0, Math.min(10, parsedRetrievalMethodWeightJsonLd)));
      }
      const parsedRetrievalMethodWeightLlmExtract = Number.parseFloat(String(retrievalMethodWeightLlmExtract ?? ''));
      if (Number.isFinite(parsedRetrievalMethodWeightLlmExtract)) {
        envOverrides.RETRIEVAL_METHOD_WEIGHT_LLM_EXTRACT = String(Math.max(0, Math.min(10, parsedRetrievalMethodWeightLlmExtract)));
      }
      const parsedRetrievalMethodWeightHelperSupportive = Number.parseFloat(String(retrievalMethodWeightHelperSupportive ?? ''));
      if (Number.isFinite(parsedRetrievalMethodWeightHelperSupportive)) {
        envOverrides.RETRIEVAL_METHOD_WEIGHT_HELPER_SUPPORTIVE = String(Math.max(0, Math.min(10, parsedRetrievalMethodWeightHelperSupportive)));
      }
      const parsedRetrievalAnchorScorePerMatch = Number.parseFloat(String(retrievalAnchorScorePerMatch ?? ''));
      if (Number.isFinite(parsedRetrievalAnchorScorePerMatch)) {
        envOverrides.RETRIEVAL_ANCHOR_SCORE_PER_MATCH = String(Math.max(0, Math.min(2, parsedRetrievalAnchorScorePerMatch)));
      }
      const parsedRetrievalIdentityScorePerMatch = Number.parseFloat(String(retrievalIdentityScorePerMatch ?? ''));
      if (Number.isFinite(parsedRetrievalIdentityScorePerMatch)) {
        envOverrides.RETRIEVAL_IDENTITY_SCORE_PER_MATCH = String(Math.max(0, Math.min(2, parsedRetrievalIdentityScorePerMatch)));
      }
      const parsedRetrievalUnitMatchBonus = Number.parseFloat(String(retrievalUnitMatchBonus ?? ''));
      if (Number.isFinite(parsedRetrievalUnitMatchBonus)) {
        envOverrides.RETRIEVAL_UNIT_MATCH_BONUS = String(Math.max(0, Math.min(2, parsedRetrievalUnitMatchBonus)));
      }
      const parsedRetrievalDirectFieldMatchBonus = Number.parseFloat(String(retrievalDirectFieldMatchBonus ?? ''));
      if (Number.isFinite(parsedRetrievalDirectFieldMatchBonus)) {
        envOverrides.RETRIEVAL_DIRECT_FIELD_MATCH_BONUS = String(Math.max(0, Math.min(2, parsedRetrievalDirectFieldMatchBonus)));
      }
      const parsedIdentityGatePublishThreshold = Number.parseFloat(String(identityGatePublishThreshold ?? ''));
      if (Number.isFinite(parsedIdentityGatePublishThreshold)) {
        envOverrides.IDENTITY_GATE_PUBLISH_THRESHOLD = String(Math.max(0, Math.min(1, parsedIdentityGatePublishThreshold)));
      }
      const parsedIdentityGateBaseMatchThreshold = Number.parseFloat(String(identityGateBaseMatchThreshold ?? ''));
      if (Number.isFinite(parsedIdentityGateBaseMatchThreshold)) {
        envOverrides.IDENTITY_GATE_BASE_MATCH_THRESHOLD = String(Math.max(0, Math.min(1, parsedIdentityGateBaseMatchThreshold)));
      }
      const parsedIdentityGateEasyAmbiguityReduction = Number.parseFloat(String(identityGateEasyAmbiguityReduction ?? ''));
      if (Number.isFinite(parsedIdentityGateEasyAmbiguityReduction)) {
        envOverrides.IDENTITY_GATE_EASY_AMBIGUITY_REDUCTION = String(Math.max(-1, Math.min(1, parsedIdentityGateEasyAmbiguityReduction)));
      }
      const parsedIdentityGateMediumAmbiguityReduction = Number.parseFloat(String(identityGateMediumAmbiguityReduction ?? ''));
      if (Number.isFinite(parsedIdentityGateMediumAmbiguityReduction)) {
        envOverrides.IDENTITY_GATE_MEDIUM_AMBIGUITY_REDUCTION = String(Math.max(-1, Math.min(1, parsedIdentityGateMediumAmbiguityReduction)));
      }
      const parsedIdentityGateHardAmbiguityReduction = Number.parseFloat(String(identityGateHardAmbiguityReduction ?? ''));
      if (Number.isFinite(parsedIdentityGateHardAmbiguityReduction)) {
        envOverrides.IDENTITY_GATE_HARD_AMBIGUITY_REDUCTION = String(Math.max(-1, Math.min(1, parsedIdentityGateHardAmbiguityReduction)));
      }
      const parsedIdentityGateVeryHardAmbiguityIncrease = Number.parseFloat(String(identityGateVeryHardAmbiguityIncrease ?? ''));
      if (Number.isFinite(parsedIdentityGateVeryHardAmbiguityIncrease)) {
        envOverrides.IDENTITY_GATE_VERY_HARD_AMBIGUITY_INCREASE = String(Math.max(-1, Math.min(1, parsedIdentityGateVeryHardAmbiguityIncrease)));
      }
      const parsedIdentityGateExtraHardAmbiguityIncrease = Number.parseFloat(String(identityGateExtraHardAmbiguityIncrease ?? ''));
      if (Number.isFinite(parsedIdentityGateExtraHardAmbiguityIncrease)) {
        envOverrides.IDENTITY_GATE_EXTRA_HARD_AMBIGUITY_INCREASE = String(Math.max(-1, Math.min(1, parsedIdentityGateExtraHardAmbiguityIncrease)));
      }
      const parsedIdentityGateMissingStrongIdPenalty = Number.parseFloat(String(identityGateMissingStrongIdPenalty ?? ''));
      if (Number.isFinite(parsedIdentityGateMissingStrongIdPenalty)) {
        envOverrides.IDENTITY_GATE_MISSING_STRONG_ID_PENALTY = String(Math.max(-1, Math.min(1, parsedIdentityGateMissingStrongIdPenalty)));
      }
      const parsedIdentityGateHardMissingStrongIdIncrease = Number.parseFloat(String(identityGateHardMissingStrongIdIncrease ?? ''));
      if (Number.isFinite(parsedIdentityGateHardMissingStrongIdIncrease)) {
        envOverrides.IDENTITY_GATE_HARD_MISSING_STRONG_ID_INCREASE = String(Math.max(-1, Math.min(1, parsedIdentityGateHardMissingStrongIdIncrease)));
      }
      const parsedIdentityGateVeryHardMissingStrongIdIncrease = Number.parseFloat(String(identityGateVeryHardMissingStrongIdIncrease ?? ''));
      if (Number.isFinite(parsedIdentityGateVeryHardMissingStrongIdIncrease)) {
        envOverrides.IDENTITY_GATE_VERY_HARD_MISSING_STRONG_ID_INCREASE = String(Math.max(-1, Math.min(1, parsedIdentityGateVeryHardMissingStrongIdIncrease)));
      }
      const parsedIdentityGateExtraHardMissingStrongIdIncrease = Number.parseFloat(String(identityGateExtraHardMissingStrongIdIncrease ?? ''));
      if (Number.isFinite(parsedIdentityGateExtraHardMissingStrongIdIncrease)) {
        envOverrides.IDENTITY_GATE_EXTRA_HARD_MISSING_STRONG_ID_INCREASE = String(Math.max(-1, Math.min(1, parsedIdentityGateExtraHardMissingStrongIdIncrease)));
      }
      const parsedIdentityGateNumericTokenBoost = Number.parseFloat(String(identityGateNumericTokenBoost ?? ''));
      if (Number.isFinite(parsedIdentityGateNumericTokenBoost)) {
        envOverrides.IDENTITY_GATE_NUMERIC_TOKEN_BOOST = String(Math.max(-1, Math.min(1, parsedIdentityGateNumericTokenBoost)));
      }
      const parsedIdentityGateNumericRangeThreshold = Number.parseInt(String(identityGateNumericRangeThreshold ?? ''), 10);
      if (Number.isFinite(parsedIdentityGateNumericRangeThreshold) && parsedIdentityGateNumericRangeThreshold >= 0) {
        envOverrides.IDENTITY_GATE_NUMERIC_RANGE_THRESHOLD = String(Math.max(0, Math.min(500, parsedIdentityGateNumericRangeThreshold)));
      }
      const parsedQualityGateIdentityThreshold = Number.parseFloat(String(qualityGateIdentityThreshold ?? ''));
      if (Number.isFinite(parsedQualityGateIdentityThreshold)) {
        envOverrides.QUALITY_GATE_IDENTITY_THRESHOLD = String(Math.max(0, Math.min(1, parsedQualityGateIdentityThreshold)));
      }
      const parsedEvidenceTextMaxChars = Number.parseInt(String(evidenceTextMaxChars ?? ''), 10);
      if (Number.isFinite(parsedEvidenceTextMaxChars) && parsedEvidenceTextMaxChars >= 200) {
        envOverrides.EVIDENCE_TEXT_MAX_CHARS = String(Math.max(200, Math.min(200_000, parsedEvidenceTextMaxChars)));
      }
      const parsedLlmExtractMaxTokens = Number.parseInt(String(llmExtractMaxTokens ?? ''), 10);
      if (Number.isFinite(parsedLlmExtractMaxTokens) && parsedLlmExtractMaxTokens >= 128) {
        envOverrides.LLM_EXTRACT_MAX_TOKENS = String(Math.max(128, Math.min(262_144, parsedLlmExtractMaxTokens)));
      }
      const parsedLlmExtractMaxSnippetsPerBatch = Number.parseInt(String(llmExtractMaxSnippetsPerBatch ?? ''), 10);
      if (Number.isFinite(parsedLlmExtractMaxSnippetsPerBatch) && parsedLlmExtractMaxSnippetsPerBatch >= 1) {
        envOverrides.LLM_EXTRACT_MAX_SNIPPETS_PER_BATCH = String(Math.max(1, Math.min(50, parsedLlmExtractMaxSnippetsPerBatch)));
      }
      const parsedLlmExtractMaxSnippetChars = Number.parseInt(String(llmExtractMaxSnippetChars ?? ''), 10);
      if (Number.isFinite(parsedLlmExtractMaxSnippetChars) && parsedLlmExtractMaxSnippetChars >= 100) {
        envOverrides.LLM_EXTRACT_MAX_SNIPPET_CHARS = String(Math.max(100, Math.min(200_000, parsedLlmExtractMaxSnippetChars)));
      }
      if (typeof llmExtractSkipLowSignal === 'boolean') {
        envOverrides.LLM_EXTRACT_SKIP_LOW_SIGNAL = llmExtractSkipLowSignal ? 'true' : 'false';
      }
      const parsedLlmExtractReasoningBudget = Number.parseInt(String(llmExtractReasoningBudget ?? ''), 10);
      if (Number.isFinite(parsedLlmExtractReasoningBudget) && parsedLlmExtractReasoningBudget >= 128) {
        envOverrides.LLM_EXTRACT_REASONING_BUDGET = String(Math.max(128, Math.min(262_144, parsedLlmExtractReasoningBudget)));
      }
      if (typeof llmReasoningMode === 'boolean') {
        envOverrides.LLM_REASONING_MODE = llmReasoningMode ? 'true' : 'false';
      }
      const parsedLlmReasoningBudget = Number.parseInt(String(llmReasoningBudget ?? ''), 10);
      if (Number.isFinite(parsedLlmReasoningBudget) && parsedLlmReasoningBudget >= 128) {
        envOverrides.LLM_REASONING_BUDGET = String(Math.max(128, Math.min(262_144, parsedLlmReasoningBudget)));
      }
      const parsedLlmMonthlyBudgetUsd = Number.parseFloat(String(llmMonthlyBudgetUsd ?? ''));
      if (Number.isFinite(parsedLlmMonthlyBudgetUsd)) {
        envOverrides.LLM_MONTHLY_BUDGET_USD = String(Math.max(0, Math.min(100_000, parsedLlmMonthlyBudgetUsd)));
      }
      const parsedLlmPerProductBudgetUsd = Number.parseFloat(String(llmPerProductBudgetUsd ?? ''));
      if (Number.isFinite(parsedLlmPerProductBudgetUsd)) {
        envOverrides.LLM_PER_PRODUCT_BUDGET_USD = String(Math.max(0, Math.min(1000, parsedLlmPerProductBudgetUsd)));
      }
      if (typeof llmDisableBudgetGuards === 'boolean') {
        envOverrides.LLM_DISABLE_BUDGET_GUARDS = llmDisableBudgetGuards ? 'true' : 'false';
      }
      const parsedLlmMaxCallsPerRound = Number.parseInt(String(llmMaxCallsPerRound ?? ''), 10);
      if (Number.isFinite(parsedLlmMaxCallsPerRound) && parsedLlmMaxCallsPerRound >= 1) {
        envOverrides.LLM_MAX_CALLS_PER_ROUND = String(Math.max(1, Math.min(200, parsedLlmMaxCallsPerRound)));
      }
      const parsedLlmMaxOutputTokens = Number.parseInt(String(llmMaxOutputTokens ?? ''), 10);
      if (Number.isFinite(parsedLlmMaxOutputTokens) && parsedLlmMaxOutputTokens >= 128) {
        envOverrides.LLM_MAX_OUTPUT_TOKENS = String(Math.max(128, Math.min(262_144, parsedLlmMaxOutputTokens)));
      }
      const parsedLlmVerifySampleRate = Number.parseInt(String(llmVerifySampleRate ?? ''), 10);
      if (Number.isFinite(parsedLlmVerifySampleRate) && parsedLlmVerifySampleRate >= 1) {
        envOverrides.LLM_VERIFY_SAMPLE_RATE = String(Math.max(1, Math.min(1000, parsedLlmVerifySampleRate)));
      }
      const parsedLlmMaxBatchesPerProduct = Number.parseInt(String(llmMaxBatchesPerProduct ?? ''), 10);
      if (Number.isFinite(parsedLlmMaxBatchesPerProduct) && parsedLlmMaxBatchesPerProduct >= 1) {
        envOverrides.LLM_MAX_BATCHES_PER_PRODUCT = String(Math.max(1, Math.min(100, parsedLlmMaxBatchesPerProduct)));
      }
      const parsedLlmMaxEvidenceChars = Number.parseInt(String(llmMaxEvidenceChars ?? ''), 10);
      if (Number.isFinite(parsedLlmMaxEvidenceChars) && parsedLlmMaxEvidenceChars >= 1000) {
        envOverrides.LLM_MAX_EVIDENCE_CHARS = String(Math.max(1000, Math.min(500_000, parsedLlmMaxEvidenceChars)));
      }
      const parsedLlmMaxTokens = Number.parseInt(String(llmMaxTokens ?? ''), 10);
      if (Number.isFinite(parsedLlmMaxTokens) && parsedLlmMaxTokens >= 128) {
        envOverrides.LLM_MAX_TOKENS = String(Math.max(128, Math.min(262_144, parsedLlmMaxTokens)));
      }
      const parsedLlmTimeoutMs = Number.parseInt(String(llmTimeoutMs ?? ''), 10);
      if (Number.isFinite(parsedLlmTimeoutMs) && parsedLlmTimeoutMs >= 1000) {
        envOverrides.LLM_TIMEOUT_MS = String(Math.max(1000, Math.min(600_000, parsedLlmTimeoutMs)));
      }
      const parsedLlmCostInputPer1M = Number.parseFloat(String(llmCostInputPer1M ?? ''));
      if (Number.isFinite(parsedLlmCostInputPer1M)) {
        envOverrides.LLM_COST_INPUT_PER_1M = String(Math.max(0, Math.min(1000, parsedLlmCostInputPer1M)));
      }
      const parsedLlmCostOutputPer1M = Number.parseFloat(String(llmCostOutputPer1M ?? ''));
      if (Number.isFinite(parsedLlmCostOutputPer1M)) {
        envOverrides.LLM_COST_OUTPUT_PER_1M = String(Math.max(0, Math.min(1000, parsedLlmCostOutputPer1M)));
      }
      const parsedLlmCostCachedInputPer1M = Number.parseFloat(String(llmCostCachedInputPer1M ?? ''));
      if (Number.isFinite(parsedLlmCostCachedInputPer1M)) {
        envOverrides.LLM_COST_CACHED_INPUT_PER_1M = String(Math.max(0, Math.min(1000, parsedLlmCostCachedInputPer1M)));
      }
      if (typeof llmVerifyMode === 'boolean') {
        envOverrides.LLM_VERIFY_MODE = llmVerifyMode ? 'true' : 'false';
      }
      if (['auto', 'force_resume', 'start_over'].includes(String(resumeMode || '').trim())) {
        envOverrides.INDEXING_RESUME_MODE = String(resumeMode).trim();
      }
      const parsedResumeWindowHours = Number.parseInt(String(resumeWindowHours ?? ''), 10);
      if (Number.isFinite(parsedResumeWindowHours) && parsedResumeWindowHours >= 0) {
        envOverrides.INDEXING_RESUME_MAX_AGE_HOURS = String(parsedResumeWindowHours);
      }
      const parsedIndexingResumeSeedLimit = Number.parseInt(String(indexingResumeSeedLimit ?? ''), 10);
      if (Number.isFinite(parsedIndexingResumeSeedLimit) && parsedIndexingResumeSeedLimit >= 1) {
        envOverrides.INDEXING_RESUME_SEED_LIMIT = String(Math.max(1, Math.min(10_000, parsedIndexingResumeSeedLimit)));
      }
      const parsedIndexingResumePersistLimit = Number.parseInt(String(indexingResumePersistLimit ?? ''), 10);
      if (Number.isFinite(parsedIndexingResumePersistLimit) && parsedIndexingResumePersistLimit >= 1) {
        envOverrides.INDEXING_RESUME_PERSIST_LIMIT = String(Math.max(1, Math.min(100_000, parsedIndexingResumePersistLimit)));
      }
      const parsedReextractAfterHours = Number.parseInt(String(reextractAfterHours ?? ''), 10);
      if (Number.isFinite(parsedReextractAfterHours) && parsedReextractAfterHours >= 0) {
        envOverrides.INDEXING_REEXTRACT_AFTER_HOURS = String(parsedReextractAfterHours);
      }
      if (typeof reextractIndexed === 'boolean') {
        envOverrides.INDEXING_REEXTRACT_ENABLED = reextractIndexed ? 'true' : 'false';
      }
      if (typeof indexingSchemaPacketsValidationEnabled === 'boolean') {
        envOverrides.INDEXING_SCHEMA_PACKETS_VALIDATION_ENABLED = indexingSchemaPacketsValidationEnabled ? 'true' : 'false';
      }
      if (typeof indexingSchemaPacketsValidationStrict === 'boolean') {
        envOverrides.INDEXING_SCHEMA_PACKETS_VALIDATION_STRICT = indexingSchemaPacketsValidationStrict ? 'true' : 'false';
      }
      const parsedConvergenceIdentityFailFastRounds = Number.parseInt(String(convergenceIdentityFailFastRounds ?? ''), 10);
      if (Number.isFinite(parsedConvergenceIdentityFailFastRounds) && parsedConvergenceIdentityFailFastRounds >= 1) {
        envOverrides.CONVERGENCE_IDENTITY_FAIL_FAST_ROUNDS = String(Math.max(1, Math.min(12, parsedConvergenceIdentityFailFastRounds)));
      }
      const parsedFetchConcurrency = Number.parseInt(String(fetchConcurrency ?? ''), 10);
      if (Number.isFinite(parsedFetchConcurrency) && parsedFetchConcurrency > 0) {
        envOverrides.CONCURRENCY = String(Math.max(1, Math.min(64, parsedFetchConcurrency)));
      }
      const parsedPerHostDelay = Number.parseInt(String(perHostMinDelayMs ?? ''), 10);
      if (Number.isFinite(parsedPerHostDelay) && parsedPerHostDelay >= 0) {
        envOverrides.PER_HOST_MIN_DELAY_MS = String(Math.max(0, Math.min(120_000, parsedPerHostDelay)));
      }
      if (typeof dynamicCrawleeEnabled === 'boolean') {
        envOverrides.DYNAMIC_CRAWLEE_ENABLED = dynamicCrawleeEnabled ? 'true' : 'false';
      }
      if (typeof crawleeHeadless === 'boolean') {
        envOverrides.CRAWLEE_HEADLESS = crawleeHeadless ? 'true' : 'false';
      }
      const parsedCrawleeTimeoutSecs = Number.parseInt(String(crawleeRequestHandlerTimeoutSecs ?? ''), 10);
      if (Number.isFinite(parsedCrawleeTimeoutSecs) && parsedCrawleeTimeoutSecs >= 0) {
        envOverrides.CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS = String(Math.max(0, Math.min(300, parsedCrawleeTimeoutSecs)));
      }
      const parsedDynamicRetryBudget = Number.parseInt(String(dynamicFetchRetryBudget ?? ''), 10);
      if (Number.isFinite(parsedDynamicRetryBudget) && parsedDynamicRetryBudget >= 0) {
        envOverrides.DYNAMIC_FETCH_RETRY_BUDGET = String(Math.max(0, Math.min(5, parsedDynamicRetryBudget)));
      }
      const parsedDynamicRetryBackoffMs = Number.parseInt(String(dynamicFetchRetryBackoffMs ?? ''), 10);
      if (Number.isFinite(parsedDynamicRetryBackoffMs) && parsedDynamicRetryBackoffMs >= 0) {
        envOverrides.DYNAMIC_FETCH_RETRY_BACKOFF_MS = String(Math.max(0, Math.min(30_000, parsedDynamicRetryBackoffMs)));
      }
      if (typeof fetchSchedulerEnabled === 'boolean') {
        envOverrides.FETCH_SCHEDULER_ENABLED = fetchSchedulerEnabled ? 'true' : 'false';
      }
      const parsedFetchSchedulerMaxRetries = Number.parseInt(String(fetchSchedulerMaxRetries ?? ''), 10);
      if (Number.isFinite(parsedFetchSchedulerMaxRetries) && parsedFetchSchedulerMaxRetries >= 0) {
        envOverrides.FETCH_SCHEDULER_MAX_RETRIES = String(Math.max(0, Math.min(20, parsedFetchSchedulerMaxRetries)));
      }
      const parsedFetchSchedulerFallbackWaitMs = Number.parseInt(String(fetchSchedulerFallbackWaitMs ?? ''), 10);
      if (Number.isFinite(parsedFetchSchedulerFallbackWaitMs) && parsedFetchSchedulerFallbackWaitMs >= 0) {
        envOverrides.FETCH_SCHEDULER_FALLBACK_WAIT_MS = String(Math.max(0, Math.min(600_000, parsedFetchSchedulerFallbackWaitMs)));
      }
      if (typeof preferHttpFetcher === 'boolean') {
        envOverrides.PREFER_HTTP_FETCHER = preferHttpFetcher ? 'true' : 'false';
      }
      const parsedPageGotoTimeoutMs = Number.parseInt(String(pageGotoTimeoutMs ?? ''), 10);
      if (Number.isFinite(parsedPageGotoTimeoutMs) && parsedPageGotoTimeoutMs >= 0) {
        envOverrides.PAGE_GOTO_TIMEOUT_MS = String(Math.max(0, Math.min(120_000, parsedPageGotoTimeoutMs)));
      }
      const parsedPageNetworkIdleTimeoutMs = Number.parseInt(String(pageNetworkIdleTimeoutMs ?? ''), 10);
      if (Number.isFinite(parsedPageNetworkIdleTimeoutMs) && parsedPageNetworkIdleTimeoutMs >= 0) {
        envOverrides.PAGE_NETWORK_IDLE_TIMEOUT_MS = String(Math.max(0, Math.min(60_000, parsedPageNetworkIdleTimeoutMs)));
      }
      const parsedPostLoadWaitMs = Number.parseInt(String(postLoadWaitMs ?? ''), 10);
      if (Number.isFinite(parsedPostLoadWaitMs) && parsedPostLoadWaitMs >= 0) {
        envOverrides.POST_LOAD_WAIT_MS = String(Math.max(0, Math.min(60_000, parsedPostLoadWaitMs)));
      }
      const normalizedFrontierDbPath = String(frontierDbPath || '').trim();
      if (normalizedFrontierDbPath) {
        envOverrides.FRONTIER_DB_PATH = normalizedFrontierDbPath;
      }
      if (typeof frontierEnableSqlite === 'boolean') {
        envOverrides.FRONTIER_ENABLE_SQLITE = frontierEnableSqlite ? 'true' : 'false';
      }
      if (typeof frontierStripTrackingParams === 'boolean') {
        envOverrides.FRONTIER_STRIP_TRACKING_PARAMS = frontierStripTrackingParams ? 'true' : 'false';
      }
      const parsedFrontierQueryCooldownSeconds = Number.parseInt(String(frontierQueryCooldownSeconds ?? ''), 10);
      if (Number.isFinite(parsedFrontierQueryCooldownSeconds) && parsedFrontierQueryCooldownSeconds >= 0) {
        envOverrides.FRONTIER_QUERY_COOLDOWN_SECONDS = String(Math.max(0, Math.min(31_536_000, parsedFrontierQueryCooldownSeconds)));
      }
      const parsedFrontierCooldown404Seconds = Number.parseInt(String(frontierCooldown404Seconds ?? ''), 10);
      if (Number.isFinite(parsedFrontierCooldown404Seconds) && parsedFrontierCooldown404Seconds >= 0) {
        envOverrides.FRONTIER_COOLDOWN_404 = String(Math.max(0, Math.min(31_536_000, parsedFrontierCooldown404Seconds)));
      }
      const parsedFrontierCooldown404RepeatSeconds = Number.parseInt(String(frontierCooldown404RepeatSeconds ?? ''), 10);
      if (Number.isFinite(parsedFrontierCooldown404RepeatSeconds) && parsedFrontierCooldown404RepeatSeconds >= 0) {
        envOverrides.FRONTIER_COOLDOWN_404_REPEAT = String(Math.max(0, Math.min(31_536_000, parsedFrontierCooldown404RepeatSeconds)));
      }
      const parsedFrontierCooldown410Seconds = Number.parseInt(String(frontierCooldown410Seconds ?? ''), 10);
      if (Number.isFinite(parsedFrontierCooldown410Seconds) && parsedFrontierCooldown410Seconds >= 0) {
        envOverrides.FRONTIER_COOLDOWN_410 = String(Math.max(0, Math.min(31_536_000, parsedFrontierCooldown410Seconds)));
      }
      const parsedFrontierCooldownTimeoutSeconds = Number.parseInt(String(frontierCooldownTimeoutSeconds ?? ''), 10);
      if (Number.isFinite(parsedFrontierCooldownTimeoutSeconds) && parsedFrontierCooldownTimeoutSeconds >= 0) {
        envOverrides.FRONTIER_COOLDOWN_TIMEOUT = String(Math.max(0, Math.min(31_536_000, parsedFrontierCooldownTimeoutSeconds)));
      }
      const parsedFrontierCooldown403BaseSeconds = Number.parseInt(String(frontierCooldown403BaseSeconds ?? ''), 10);
      if (Number.isFinite(parsedFrontierCooldown403BaseSeconds) && parsedFrontierCooldown403BaseSeconds >= 0) {
        envOverrides.FRONTIER_COOLDOWN_403_BASE = String(Math.max(0, Math.min(86_400, parsedFrontierCooldown403BaseSeconds)));
      }
      const parsedFrontierCooldown429BaseSeconds = Number.parseInt(String(frontierCooldown429BaseSeconds ?? ''), 10);
      if (Number.isFinite(parsedFrontierCooldown429BaseSeconds) && parsedFrontierCooldown429BaseSeconds >= 0) {
        envOverrides.FRONTIER_COOLDOWN_429_BASE = String(Math.max(0, Math.min(86_400, parsedFrontierCooldown429BaseSeconds)));
      }
      const parsedFrontierBackoffMaxExponent = Number.parseInt(String(frontierBackoffMaxExponent ?? ''), 10);
      if (Number.isFinite(parsedFrontierBackoffMaxExponent) && parsedFrontierBackoffMaxExponent >= 1) {
        envOverrides.FRONTIER_BACKOFF_MAX_EXPONENT = String(Math.max(1, Math.min(12, parsedFrontierBackoffMaxExponent)));
      }
      const parsedFrontierPathPenaltyNotfoundThreshold = Number.parseInt(String(frontierPathPenaltyNotfoundThreshold ?? ''), 10);
      if (Number.isFinite(parsedFrontierPathPenaltyNotfoundThreshold) && parsedFrontierPathPenaltyNotfoundThreshold >= 1) {
        envOverrides.FRONTIER_PATH_PENALTY_NOTFOUND_THRESHOLD = String(Math.max(1, Math.min(50, parsedFrontierPathPenaltyNotfoundThreshold)));
      }
      const parsedFrontierBlockedDomainThreshold = Number.parseInt(String(frontierBlockedDomainThreshold ?? ''), 10);
      if (Number.isFinite(parsedFrontierBlockedDomainThreshold) && parsedFrontierBlockedDomainThreshold >= 1) {
        envOverrides.FRONTIER_BLOCKED_DOMAIN_THRESHOLD = String(Math.max(1, Math.min(50, parsedFrontierBlockedDomainThreshold)));
      }
      if (typeof frontierRepairSearchEnabled === 'boolean') {
        envOverrides.FRONTIER_REPAIR_SEARCH_ENABLED = frontierRepairSearchEnabled ? 'true' : 'false';
      }
      const normalizedRepairDedupeRule = String(repairDedupeRule || '').trim().toLowerCase();
      if (normalizedRepairDedupeRule) {
        const allowedRepairDedupeRules = new Set(['domain_once', 'domain_and_status', 'none']);
        if (!allowedRepairDedupeRules.has(normalizedRepairDedupeRule)) {
          return jsonRes(res, 400, {
            error: 'invalid_repair_dedupe_rule',
            message: `Unsupported repairDedupeRule '${normalizedRepairDedupeRule}'.`
          });
        }
        envOverrides.REPAIR_DEDUPE_RULE = normalizedRepairDedupeRule;
      }
      const normalizedAutomationQueueStorageEngine = String(automationQueueStorageEngine || '').trim().toLowerCase();
      if (normalizedAutomationQueueStorageEngine) {
        const allowedAutomationQueueStorageEngines = new Set(['sqlite', 'memory']);
        if (!allowedAutomationQueueStorageEngines.has(normalizedAutomationQueueStorageEngine)) {
          return jsonRes(res, 400, {
            error: 'invalid_automation_queue_storage_engine',
            message: `Unsupported automationQueueStorageEngine '${normalizedAutomationQueueStorageEngine}'.`
          });
        }
        envOverrides.AUTOMATION_QUEUE_STORAGE_ENGINE = normalizedAutomationQueueStorageEngine;
      }
      if (typeof autoScrollEnabled === 'boolean') {
        envOverrides.AUTO_SCROLL_ENABLED = autoScrollEnabled ? 'true' : 'false';
      }
      const parsedAutoScrollPasses = Number.parseInt(String(autoScrollPasses ?? ''), 10);
      if (Number.isFinite(parsedAutoScrollPasses) && parsedAutoScrollPasses >= 0) {
        envOverrides.AUTO_SCROLL_PASSES = String(Math.max(0, Math.min(20, parsedAutoScrollPasses)));
      }
      const parsedAutoScrollDelayMs = Number.parseInt(String(autoScrollDelayMs ?? ''), 10);
      if (Number.isFinite(parsedAutoScrollDelayMs) && parsedAutoScrollDelayMs >= 0) {
        envOverrides.AUTO_SCROLL_DELAY_MS = String(Math.max(0, Math.min(10_000, parsedAutoScrollDelayMs)));
      }
      if (typeof graphqlReplayEnabled === 'boolean') {
        envOverrides.GRAPHQL_REPLAY_ENABLED = graphqlReplayEnabled ? 'true' : 'false';
      }
      const parsedMaxGraphqlReplays = Number.parseInt(String(maxGraphqlReplays ?? ''), 10);
      if (Number.isFinite(parsedMaxGraphqlReplays) && parsedMaxGraphqlReplays >= 0) {
        envOverrides.MAX_GRAPHQL_REPLAYS = String(Math.max(0, Math.min(20, parsedMaxGraphqlReplays)));
      }
      const parsedMaxNetworkResponsesPerPage = Number.parseInt(String(maxNetworkResponsesPerPage ?? ''), 10);
      if (Number.isFinite(parsedMaxNetworkResponsesPerPage) && parsedMaxNetworkResponsesPerPage >= 100) {
        envOverrides.MAX_NETWORK_RESPONSES_PER_PAGE = String(Math.max(100, Math.min(10_000, parsedMaxNetworkResponsesPerPage)));
      }
      if (typeof robotsTxtCompliant === 'boolean') {
        envOverrides.ROBOTS_TXT_COMPLIANT = robotsTxtCompliant ? 'true' : 'false';
      }
      const parsedRobotsTxtTimeoutMs = Number.parseInt(String(robotsTxtTimeoutMs ?? ''), 10);
      if (Number.isFinite(parsedRobotsTxtTimeoutMs) && parsedRobotsTxtTimeoutMs >= 100) {
        envOverrides.ROBOTS_TXT_TIMEOUT_MS = String(Math.max(100, Math.min(120_000, parsedRobotsTxtTimeoutMs)));
      }
      if (typeof runtimeTraceEnabled === 'boolean') {
        envOverrides.RUNTIME_TRACE_ENABLED = runtimeTraceEnabled ? 'true' : 'false';
      }
      const parsedRuntimeTraceFetchRing = Number.parseInt(String(runtimeTraceFetchRing ?? ''), 10);
      if (Number.isFinite(parsedRuntimeTraceFetchRing) && parsedRuntimeTraceFetchRing >= 10) {
        envOverrides.RUNTIME_TRACE_FETCH_RING = String(Math.max(10, Math.min(2000, parsedRuntimeTraceFetchRing)));
      }
      const parsedRuntimeTraceLlmRing = Number.parseInt(String(runtimeTraceLlmRing ?? ''), 10);
      if (Number.isFinite(parsedRuntimeTraceLlmRing) && parsedRuntimeTraceLlmRing >= 10) {
        envOverrides.RUNTIME_TRACE_LLM_RING = String(Math.max(10, Math.min(2000, parsedRuntimeTraceLlmRing)));
      }
      if (typeof runtimeTraceLlmPayloads === 'boolean') {
        envOverrides.RUNTIME_TRACE_LLM_PAYLOADS = runtimeTraceLlmPayloads ? 'true' : 'false';
      }
      if (typeof eventsJsonWrite === 'boolean') {
        envOverrides.EVENTS_JSON_WRITE = eventsJsonWrite ? 'true' : 'false';
      }
      if (typeof queueJsonWrite === 'boolean') {
        envOverrides.QUEUE_JSON_WRITE = queueJsonWrite ? 'true' : 'false';
      }
      if (typeof billingJsonWrite === 'boolean') {
        envOverrides.BILLING_JSON_WRITE = billingJsonWrite ? 'true' : 'false';
      }
      if (typeof brainJsonWrite === 'boolean') {
        envOverrides.BRAIN_JSON_WRITE = brainJsonWrite ? 'true' : 'false';
      }
      if (typeof intelJsonWrite === 'boolean') {
        envOverrides.INTEL_JSON_WRITE = intelJsonWrite ? 'true' : 'false';
      }
      if (typeof corpusJsonWrite === 'boolean') {
        envOverrides.CORPUS_JSON_WRITE = corpusJsonWrite ? 'true' : 'false';
      }
      if (typeof learningJsonWrite === 'boolean') {
        envOverrides.LEARNING_JSON_WRITE = learningJsonWrite ? 'true' : 'false';
      }
      if (typeof cacheJsonWrite === 'boolean') {
        envOverrides.CACHE_JSON_WRITE = cacheJsonWrite ? 'true' : 'false';
      }
      const parsedDaemonConcurrency = Number.parseInt(String(daemonConcurrency ?? ''), 10);
      if (Number.isFinite(parsedDaemonConcurrency) && parsedDaemonConcurrency >= 1) {
        envOverrides.DAEMON_CONCURRENCY = String(Math.max(1, Math.min(128, parsedDaemonConcurrency)));
      }
      const parsedDaemonGracefulShutdownTimeoutMs = Number.parseInt(String(daemonGracefulShutdownTimeoutMs ?? ''), 10);
      if (Number.isFinite(parsedDaemonGracefulShutdownTimeoutMs) && parsedDaemonGracefulShutdownTimeoutMs >= 1000) {
        envOverrides.DAEMON_GRACEFUL_SHUTDOWN_TIMEOUT_MS = String(Math.max(1000, Math.min(600_000, parsedDaemonGracefulShutdownTimeoutMs)));
      }
      const normalizedImportsRoot = String(importsRoot || '').trim();
      if (normalizedImportsRoot) {
        envOverrides.IMPORTS_ROOT = normalizedImportsRoot;
      }
      const parsedImportsPollSeconds = Number.parseInt(String(importsPollSeconds ?? ''), 10);
      if (Number.isFinite(parsedImportsPollSeconds) && parsedImportsPollSeconds >= 1) {
        envOverrides.IMPORTS_POLL_SECONDS = String(Math.max(1, Math.min(3600, parsedImportsPollSeconds)));
      }
      if (typeof authoritySnapshotEnabled === 'boolean') {
        envOverrides.AUTHORITY_SNAPSHOT_ENABLED = authoritySnapshotEnabled ? 'true' : 'false';
      }
      if (typeof runtimeScreencastEnabled === 'boolean') {
        envOverrides.RUNTIME_SCREENCAST_ENABLED = runtimeScreencastEnabled ? 'true' : 'false';
      }
      const parsedRuntimeScreencastFps = Number.parseInt(String(runtimeScreencastFps ?? ''), 10);
      if (Number.isFinite(parsedRuntimeScreencastFps) && parsedRuntimeScreencastFps >= 1) {
        envOverrides.RUNTIME_SCREENCAST_FPS = String(Math.max(1, Math.min(60, parsedRuntimeScreencastFps)));
      }
      const parsedRuntimeScreencastQuality = Number.parseInt(String(runtimeScreencastQuality ?? ''), 10);
      if (Number.isFinite(parsedRuntimeScreencastQuality) && parsedRuntimeScreencastQuality >= 10) {
        envOverrides.RUNTIME_SCREENCAST_QUALITY = String(Math.max(10, Math.min(100, parsedRuntimeScreencastQuality)));
      }
      const parsedRuntimeScreencastMaxWidth = Number.parseInt(String(runtimeScreencastMaxWidth ?? ''), 10);
      if (Number.isFinite(parsedRuntimeScreencastMaxWidth) && parsedRuntimeScreencastMaxWidth >= 320) {
        envOverrides.RUNTIME_SCREENCAST_MAX_WIDTH = String(Math.max(320, Math.min(3840, parsedRuntimeScreencastMaxWidth)));
      }
      const parsedRuntimeScreencastMaxHeight = Number.parseInt(String(runtimeScreencastMaxHeight ?? ''), 10);
      if (Number.isFinite(parsedRuntimeScreencastMaxHeight) && parsedRuntimeScreencastMaxHeight >= 240) {
        envOverrides.RUNTIME_SCREENCAST_MAX_HEIGHT = String(Math.max(240, Math.min(2160, parsedRuntimeScreencastMaxHeight)));
      }
      const normalizedDynamicFetchPolicyMap = String(dynamicFetchPolicyMapJson || '').trim();
      if (normalizedDynamicFetchPolicyMap) {
        try {
          const parsedDynamicFetchPolicyMap = JSON.parse(normalizedDynamicFetchPolicyMap);
          if (!parsedDynamicFetchPolicyMap || Array.isArray(parsedDynamicFetchPolicyMap) || typeof parsedDynamicFetchPolicyMap !== 'object') {
            return jsonRes(res, 400, {
              error: 'invalid_dynamic_fetch_policy_json',
              message: 'dynamicFetchPolicyMapJson must be a JSON object.'
            });
          }
          envOverrides.DYNAMIC_FETCH_POLICY_MAP_JSON = JSON.stringify(parsedDynamicFetchPolicyMap);
        } catch {
          return jsonRes(res, 400, {
            error: 'invalid_dynamic_fetch_policy_json',
            message: 'dynamicFetchPolicyMapJson must be valid JSON.'
          });
        }
      }
      const normalizedSearchProfileCapMap = String(searchProfileCapMapJson || '').trim();
      if (normalizedSearchProfileCapMap) {
        try {
          const parsedSearchProfileCapMap = JSON.parse(normalizedSearchProfileCapMap);
          if (!parsedSearchProfileCapMap || Array.isArray(parsedSearchProfileCapMap) || typeof parsedSearchProfileCapMap !== 'object') {
            return jsonRes(res, 400, {
              error: 'invalid_search_profile_cap_map_json',
              message: 'searchProfileCapMapJson must be a JSON object.'
            });
          }
          envOverrides.SEARCH_PROFILE_CAP_MAP_JSON = JSON.stringify(parsedSearchProfileCapMap);
        } catch {
          return jsonRes(res, 400, {
            error: 'invalid_search_profile_cap_map_json',
            message: 'searchProfileCapMapJson must be valid JSON.'
          });
        }
      }
      const normalizedSerpRerankerWeightMap = String(serpRerankerWeightMapJson || '').trim();
      if (normalizedSerpRerankerWeightMap) {
        try {
          const parsedSerpRerankerWeightMap = JSON.parse(normalizedSerpRerankerWeightMap);
          if (!parsedSerpRerankerWeightMap || Array.isArray(parsedSerpRerankerWeightMap) || typeof parsedSerpRerankerWeightMap !== 'object') {
            return jsonRes(res, 400, {
              error: 'invalid_serp_reranker_weight_map_json',
              message: 'serpRerankerWeightMapJson must be a JSON object.'
            });
          }
          envOverrides.SERP_RERANKER_WEIGHT_MAP_JSON = JSON.stringify(parsedSerpRerankerWeightMap);
        } catch {
          return jsonRes(res, 400, {
            error: 'invalid_serp_reranker_weight_map_json',
            message: 'serpRerankerWeightMapJson must be valid JSON.'
          });
        }
      }
      const normalizedFetchSchedulerInternalsMap = String(fetchSchedulerInternalsMapJson || '').trim();
      if (normalizedFetchSchedulerInternalsMap) {
        try {
          const parsedFetchSchedulerInternalsMap = JSON.parse(normalizedFetchSchedulerInternalsMap);
          if (!parsedFetchSchedulerInternalsMap || Array.isArray(parsedFetchSchedulerInternalsMap) || typeof parsedFetchSchedulerInternalsMap !== 'object') {
            return jsonRes(res, 400, {
              error: 'invalid_fetch_scheduler_internals_map_json',
              message: 'fetchSchedulerInternalsMapJson must be a JSON object.'
            });
          }
          envOverrides.FETCH_SCHEDULER_INTERNALS_MAP_JSON = JSON.stringify(parsedFetchSchedulerInternalsMap);
        } catch {
          return jsonRes(res, 400, {
            error: 'invalid_fetch_scheduler_internals_map_json',
            message: 'fetchSchedulerInternalsMapJson must be valid JSON.'
          });
        }
      }
      const normalizedRetrievalInternalsMap = String(retrievalInternalsMapJson || '').trim();
      if (normalizedRetrievalInternalsMap) {
        try {
          const parsedRetrievalInternalsMap = JSON.parse(normalizedRetrievalInternalsMap);
          if (!parsedRetrievalInternalsMap || Array.isArray(parsedRetrievalInternalsMap) || typeof parsedRetrievalInternalsMap !== 'object') {
            return jsonRes(res, 400, {
              error: 'invalid_retrieval_internals_map_json',
              message: 'retrievalInternalsMapJson must be a JSON object.'
            });
          }
          envOverrides.RETRIEVAL_INTERNALS_MAP_JSON = JSON.stringify(parsedRetrievalInternalsMap);
        } catch {
          return jsonRes(res, 400, {
            error: 'invalid_retrieval_internals_map_json',
            message: 'retrievalInternalsMapJson must be valid JSON.'
          });
        }
      }
      const normalizedEvidencePackLimitsMap = String(evidencePackLimitsMapJson || '').trim();
      if (normalizedEvidencePackLimitsMap) {
        try {
          const parsedEvidencePackLimitsMap = JSON.parse(normalizedEvidencePackLimitsMap);
          if (!parsedEvidencePackLimitsMap || Array.isArray(parsedEvidencePackLimitsMap) || typeof parsedEvidencePackLimitsMap !== 'object') {
            return jsonRes(res, 400, {
              error: 'invalid_evidence_pack_limits_map_json',
              message: 'evidencePackLimitsMapJson must be a JSON object.'
            });
          }
          envOverrides.EVIDENCE_PACK_LIMITS_MAP_JSON = JSON.stringify(parsedEvidencePackLimitsMap);
        } catch {
          return jsonRes(res, 400, {
            error: 'invalid_evidence_pack_limits_map_json',
            message: 'evidencePackLimitsMapJson must be valid JSON.'
          });
        }
      }
      const normalizedIdentityGateThresholdBoundsMap = String(identityGateThresholdBoundsMapJson || '').trim();
      if (normalizedIdentityGateThresholdBoundsMap) {
        try {
          const parsedIdentityGateThresholdBoundsMap = JSON.parse(normalizedIdentityGateThresholdBoundsMap);
          if (!parsedIdentityGateThresholdBoundsMap || Array.isArray(parsedIdentityGateThresholdBoundsMap) || typeof parsedIdentityGateThresholdBoundsMap !== 'object') {
            return jsonRes(res, 400, {
              error: 'invalid_identity_gate_threshold_bounds_map_json',
              message: 'identityGateThresholdBoundsMapJson must be a JSON object.'
            });
          }
          envOverrides.IDENTITY_GATE_THRESHOLD_BOUNDS_MAP_JSON = JSON.stringify(parsedIdentityGateThresholdBoundsMap);
        } catch {
          return jsonRes(res, 400, {
            error: 'invalid_identity_gate_threshold_bounds_map_json',
            message: 'identityGateThresholdBoundsMapJson must be valid JSON.'
          });
        }
      }
      const normalizedParsingConfidenceBaseMap = String(parsingConfidenceBaseMapJson || '').trim();
      if (normalizedParsingConfidenceBaseMap) {
        try {
          const parsedParsingConfidenceBaseMap = JSON.parse(normalizedParsingConfidenceBaseMap);
          if (!parsedParsingConfidenceBaseMap || Array.isArray(parsedParsingConfidenceBaseMap) || typeof parsedParsingConfidenceBaseMap !== 'object') {
            return jsonRes(res, 400, {
              error: 'invalid_parsing_confidence_base_map_json',
              message: 'parsingConfidenceBaseMapJson must be a JSON object.'
            });
          }
          envOverrides.PARSING_CONFIDENCE_BASE_MAP_JSON = JSON.stringify(parsedParsingConfidenceBaseMap);
        } catch {
          return jsonRes(res, 400, {
            error: 'invalid_parsing_confidence_base_map_json',
            message: 'parsingConfidenceBaseMapJson must be valid JSON.'
          });
        }
      }
      if (typeof scannedPdfOcrEnabled === 'boolean') {
        envOverrides.SCANNED_PDF_OCR_ENABLED = scannedPdfOcrEnabled ? 'true' : 'false';
      }
      if (typeof scannedPdfOcrPromoteCandidates === 'boolean') {
        envOverrides.SCANNED_PDF_OCR_PROMOTE_CANDIDATES = scannedPdfOcrPromoteCandidates ? 'true' : 'false';
      }
      const normalizedScannedOcrBackend = String(scannedPdfOcrBackend || '').trim().toLowerCase();
      if (normalizedScannedOcrBackend) {
        const allowedScannedOcrBackends = new Set(['auto', 'tesseract', 'none']);
        if (!allowedScannedOcrBackends.has(normalizedScannedOcrBackend)) {
          return jsonRes(res, 400, {
            error: 'invalid_scanned_pdf_ocr_backend',
            message: `Unsupported scannedPdfOcrBackend '${normalizedScannedOcrBackend}'.`
          });
        }
        envOverrides.SCANNED_PDF_OCR_BACKEND = normalizedScannedOcrBackend;
      }
      const parsedScannedOcrMaxPages = Number.parseInt(String(scannedPdfOcrMaxPages ?? ''), 10);
      if (Number.isFinite(parsedScannedOcrMaxPages) && parsedScannedOcrMaxPages >= 1) {
        envOverrides.SCANNED_PDF_OCR_MAX_PAGES = String(Math.max(1, Math.min(100, parsedScannedOcrMaxPages)));
      }
      const parsedScannedOcrMaxPairs = Number.parseInt(String(scannedPdfOcrMaxPairs ?? ''), 10);
      if (Number.isFinite(parsedScannedOcrMaxPairs) && parsedScannedOcrMaxPairs >= 50) {
        envOverrides.SCANNED_PDF_OCR_MAX_PAIRS = String(Math.max(50, Math.min(20_000, parsedScannedOcrMaxPairs)));
      }
      const parsedScannedOcrMinChars = Number.parseInt(String(scannedPdfOcrMinCharsPerPage ?? ''), 10);
      if (Number.isFinite(parsedScannedOcrMinChars) && parsedScannedOcrMinChars >= 1) {
        envOverrides.SCANNED_PDF_OCR_MIN_CHARS_PER_PAGE = String(Math.max(1, Math.min(500, parsedScannedOcrMinChars)));
      }
      const parsedScannedOcrMinLines = Number.parseInt(String(scannedPdfOcrMinLinesPerPage ?? ''), 10);
      if (Number.isFinite(parsedScannedOcrMinLines) && parsedScannedOcrMinLines >= 1) {
        envOverrides.SCANNED_PDF_OCR_MIN_LINES_PER_PAGE = String(Math.max(1, Math.min(100, parsedScannedOcrMinLines)));
      }
      const parsedScannedOcrMinConfidence = Number.parseFloat(String(scannedPdfOcrMinConfidence ?? ''));
      if (Number.isFinite(parsedScannedOcrMinConfidence) && parsedScannedOcrMinConfidence >= 0) {
        const clampedConfidence = Math.max(0, Math.min(1, parsedScannedOcrMinConfidence));
        envOverrides.SCANNED_PDF_OCR_MIN_CONFIDENCE = String(clampedConfidence);
      }
      const hasPhase2LlmOverride = typeof phase2LlmEnabled === 'boolean';
      if (hasPhase2LlmOverride) {
        envOverrides.LLM_PLAN_DISCOVERY_QUERIES = phase2LlmEnabled ? 'true' : 'false';
      }
      const normalizedPhase2LlmModel = String(phase2LlmModel || '').trim();
      if (normalizedPhase2LlmModel) {
        envOverrides.LLM_MODEL_PLAN = normalizedPhase2LlmModel;
      }
      const hasPhase3LlmOverride = typeof phase3LlmTriageEnabled === 'boolean';
      if (hasPhase3LlmOverride) {
        envOverrides.LLM_SERP_RERANK_ENABLED = phase3LlmTriageEnabled ? 'true' : 'false';
      }
      const normalizedPhase3LlmModel = String(phase3LlmModel || '').trim();
      if (normalizedPhase3LlmModel) {
        envOverrides.LLM_MODEL_TRIAGE = normalizedPhase3LlmModel;
        if (!normalizedCortexModelRerankFast) {
          envOverrides.CORTEX_MODEL_RERANK_FAST = normalizedPhase3LlmModel;
        }
      }

      const applyModelOverride = (envKey, value, { allowEmpty = false } = {}) => {
        if (value === undefined || value === null) return false;
        const token = String(value || '').trim();
        if (!token && !allowEmpty) return false;
        envOverrides[envKey] = token;
        return Boolean(token);
      };
      const applyTokenOverride = (envKey, value) => {
        if (value === undefined || value === null || value === '') return false;
        const parsed = Number.parseInt(String(value), 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return false;
        envOverrides[envKey] = String(parsed);
        return true;
      };

      const hasRoleModelOverride = [
        applyModelOverride('LLM_MODEL_PLAN', llmModelPlan),
        applyModelOverride('LLM_MODEL_FAST', llmModelFast),
        applyModelOverride('LLM_MODEL_TRIAGE', llmModelTriage),
        applyModelOverride('LLM_MODEL_REASONING', llmModelReasoning),
        applyModelOverride('LLM_MODEL_EXTRACT', llmModelExtract),
        applyModelOverride('LLM_MODEL_VALIDATE', llmModelValidate),
        applyModelOverride('LLM_MODEL_WRITE', llmModelWrite)
      ].some(Boolean);

      const normalizedTriageForCortex = String(llmModelTriage || '').trim();
      if (normalizedTriageForCortex) {
        if (!normalizedCortexModelRerankFast) {
          envOverrides.CORTEX_MODEL_RERANK_FAST = normalizedTriageForCortex;
        }
        if (!normalizedCortexModelSearchFast) {
          envOverrides.CORTEX_MODEL_SEARCH_FAST = normalizedTriageForCortex;
        }
      }

      applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_PLAN', llmTokensPlan);
      applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_FAST', llmTokensFast);
      applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_TRIAGE', llmTokensTriage);
      applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_REASONING', llmTokensReasoning);
      applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_EXTRACT', llmTokensExtract);
      applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_VALIDATE', llmTokensValidate);
      applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_WRITE', llmTokensWrite);

      const hasFallbackToggle = typeof llmFallbackEnabled === 'boolean';
      if (hasFallbackToggle && !llmFallbackEnabled) {
        envOverrides.LLM_PLAN_FALLBACK_MODEL = '';
        envOverrides.LLM_EXTRACT_FALLBACK_MODEL = '';
        envOverrides.LLM_VALIDATE_FALLBACK_MODEL = '';
        envOverrides.LLM_WRITE_FALLBACK_MODEL = '';
        envOverrides.LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK = '';
        envOverrides.LLM_MAX_OUTPUT_TOKENS_EXTRACT_FALLBACK = '';
        envOverrides.LLM_MAX_OUTPUT_TOKENS_VALIDATE_FALLBACK = '';
        envOverrides.LLM_MAX_OUTPUT_TOKENS_WRITE_FALLBACK = '';
      } else {
        applyModelOverride('LLM_PLAN_FALLBACK_MODEL', llmPlanFallbackModel, { allowEmpty: true });
        applyModelOverride('LLM_EXTRACT_FALLBACK_MODEL', llmExtractFallbackModel, { allowEmpty: true });
        applyModelOverride('LLM_VALIDATE_FALLBACK_MODEL', llmValidateFallbackModel, { allowEmpty: true });
        applyModelOverride('LLM_WRITE_FALLBACK_MODEL', llmWriteFallbackModel, { allowEmpty: true });
        applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK', llmTokensPlanFallback);
        applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_EXTRACT_FALLBACK', llmTokensExtractFallback);
        applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_VALIDATE_FALLBACK', llmTokensValidateFallback);
        applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_WRITE_FALLBACK', llmTokensWriteFallback);
      }

      if (
        (hasPhase2LlmOverride && phase2LlmEnabled)
        || (hasPhase3LlmOverride && phase3LlmTriageEnabled)
        || hasRoleModelOverride
      ) {
        envOverrides.LLM_ENABLED = 'true';
      }

      try {
        if (replaceRunning && isProcessRunning()) {
          await stopProcess(9000);
          const exited = await waitForProcessExit(8000);
          if (!exited && isProcessRunning()) {
            return jsonRes(res, 409, { error: 'process_replace_timeout', message: 'Existing process did not stop in time' });
          }
        }
        const status = startProcess('src/cli/spec.js', cliArgs, envOverrides);
        return jsonRes(res, 200, {
          ...status,
          run_id: String(status?.run_id || status?.runId || requestedRunId || ''),
          runId: String(status?.runId || status?.run_id || requestedRunId || ''),
        });
      } catch (err) {
        return jsonRes(res, 409, { error: err.message });
      }
    }

    if (parts[0] === 'process' && parts[1] === 'stop' && method === 'POST') {
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        body = {};
      }
      const force = Boolean(body?.force);
      const status = await stopProcess(9000, { force });
      return jsonRes(res, 200, status);
    }

    if (parts[0] === 'process' && parts[1] === 'status' && method === 'GET') {
      return jsonRes(res, 200, processStatus());
    }

    // GraphQL proxy
    if (parts[0] === 'graphql' && method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const proxyRes = await fetch(`http://localhost:8787/graphql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const proxyData = await proxyRes.json();
        return jsonRes(res, proxyRes.status, proxyData);
      } catch {
        return jsonRes(res, 502, { error: 'graphql_proxy_failed' });
      }
    }

    return false;
  };
}
