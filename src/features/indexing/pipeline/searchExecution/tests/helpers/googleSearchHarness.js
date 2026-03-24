import { createPacerDouble } from '../factories/searchProviderTestDoubles.js';

export async function loadSearchGoogleModule() {
  return import('../../searchGoogle.js');
}

export function buildGoogleSearchOptions(factory, overrides = {}) {
  const { pacer } = createPacerDouble();

  return {
    _crawlerFactory: factory,
    _pacer: pacer,
    minQueryIntervalMs: 0,
    postResultsDelayMs: 0,
    screenshotsEnabled: false,
    ...overrides,
  };
}
