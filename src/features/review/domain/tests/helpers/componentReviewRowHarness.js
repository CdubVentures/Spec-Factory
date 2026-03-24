import {
  CATEGORY,
  buildComponentIdentifier,
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  getComponentIdentityId,
  getComponentValueId,
  makeCategoryAuthorityConfig,
  writeComponentReviewItems,
} from '../../../tests/helpers/componentReviewHarness.js';

export {
  CATEGORY,
  buildComponentIdentifier,
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  getComponentIdentityId,
  getComponentValueId,
  writeComponentReviewItems,
};

export async function createComponentRowHarness(t) {
  const { tempRoot, specDb } = await createTempSpecDb();
  const harness = {
    tempRoot,
    specDb,
    config: makeCategoryAuthorityConfig(tempRoot),
  };

  if (typeof t?.after === 'function') {
    t.after(async () => {
      await cleanupTempSpecDb(tempRoot, specDb);
    });
  }

  return harness;
}

export function upsertComponentLane(
  specDb,
  {
    componentType,
    componentName,
    componentMaker,
    propertyKey,
    value,
    confidence = 1,
    variancePolicy = null,
    source = 'pipeline',
    acceptedCandidateId = null,
    needsReview = false,
    overridden = false,
    constraints = [],
  },
) {
  specDb.upsertComponentIdentity({
    componentType,
    canonicalName: componentName,
    maker: componentMaker,
    links: [],
    source,
  });
  specDb.upsertComponentValue({
    componentType,
    componentName,
    componentMaker,
    propertyKey,
    value,
    confidence,
    variancePolicy,
    source,
    acceptedCandidateId,
    needsReview,
    overridden,
    constraints,
  });
}

export function linkProductToComponent(
  specDb,
  {
    productId,
    fieldKey,
    componentType,
    componentName,
    componentMaker,
    matchType = 'shared_accept',
    matchScore = 1,
  },
) {
  specDb.upsertItemComponentLink({
    productId,
    fieldKey,
    componentType,
    componentName,
    componentMaker,
    matchType,
    matchScore,
  });
}

export function insertCandidateRow(specDb, candidate) {
  specDb.insertCandidate({
    rank: 1,
    score: 0.9,
    source_host: 'contract.test',
    source_method: 'pipeline_extract',
    source_tier: 1,
    ...candidate,
  });
}
