import { AggressiveOrchestrator } from '../../extraction/aggressiveOrchestrator.js';
import { selectAggressiveDomHtml } from '../shared/evidenceHelpers.js';
import { refreshFieldsBelowPassTarget } from '../shared/scoringHelpers.js';

export async function runAggressiveExtractionPhase({
  config = {},
  roundContext = null,
  storage = null,
  logger = null,
  category = '',
  productId = '',
  runId = '',
  identity = {},
  normalized = { fields: {} },
  provenance = {},
  fieldOrder = [],
  categoryConfig = { criticalFieldSet: new Set() },
  discoveryResult = {},
  sourceResults = [],
  artifactsByHost = {},
  runtimeEvidencePack = null,
  fieldsBelowPassTarget = [],
  criticalFieldsBelowPassTarget = [],
  selectAggressiveDomHtmlFn = selectAggressiveDomHtml,
  createAggressiveOrchestratorFn = (options) => new AggressiveOrchestrator(options),
  refreshFieldsBelowPassTargetFn = refreshFieldsBelowPassTarget,
} = {}) {
  let aggressiveExtraction = {
    enabled: false,
    stage: 'disabled',
  };
  let nextFieldsBelowPassTarget = fieldsBelowPassTarget;
  let nextCriticalFieldsBelowPassTarget = criticalFieldsBelowPassTarget;

  try {
    const bestEvidencePack = runtimeEvidencePack;
    const aggressiveDomHtml = selectAggressiveDomHtmlFn(artifactsByHost);
    const aggressiveEvidencePack = bestEvidencePack
      ? {
        ...bestEvidencePack,
        meta: {
          ...(bestEvidencePack.meta || {}),
          raw_html: aggressiveDomHtml || bestEvidencePack?.meta?.raw_html || '',
        },
      }
      : {
        meta: {
          raw_html: aggressiveDomHtml || '',
          host: 'dom',
        },
        references: [],
        snippets: [],
      };
    const aggressiveOrchestrator = createAggressiveOrchestratorFn({
      storage,
      config,
      logger,
    });
    aggressiveExtraction = await aggressiveOrchestrator.run({
      category,
      productId,
      identity,
      normalized,
      provenance,
      evidencePack: aggressiveEvidencePack,
      fieldOrder,
      criticalFieldSet: categoryConfig.criticalFieldSet,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
      discoveryResult,
      sourceResults,
      roundContext,
    });
    if (aggressiveExtraction?.enabled) {
      const refreshed = refreshFieldsBelowPassTargetFn({
        fieldOrder,
        provenance,
        criticalFieldSet: categoryConfig.criticalFieldSet,
      });
      nextFieldsBelowPassTarget = refreshed.fieldsBelowPassTarget;
      nextCriticalFieldsBelowPassTarget = refreshed.criticalFieldsBelowPassTarget;
    }
  } catch (error) {
    logger?.warn?.('aggressive_extraction_failed', {
      category,
      productId,
      runId,
      message: error.message,
    });
    aggressiveExtraction = {
      enabled: true,
      stage: 'failed',
      error: error.message,
    };
  }

  return {
    aggressiveExtraction,
    fieldsBelowPassTarget: nextFieldsBelowPassTarget,
    criticalFieldsBelowPassTarget: nextCriticalFieldsBelowPassTarget,
  };
}
