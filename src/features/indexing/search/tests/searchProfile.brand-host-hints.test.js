import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchProfile,
  makeCategoryConfig,
  makeJob,
  makeSeedStatus,
} from './helpers/searchProfileHarness.js';

describe('Phase 02 - BRAND_HOST_HINTS Sync', () => {
  it('includes alienware and dell manufacturer domains in soft host-biased queries', () => {
    const profile = buildSearchProfile({
      job: makeJob({ identityLock: { brand: 'Alienware', model: 'AW610M', variant: '' } }),
      categoryConfig: {
        ...makeCategoryConfig(),
        sourceHosts: [
          { host: 'alienware.com', tierName: 'manufacturer', role: 'manufacturer' },
          { host: 'dell.com', tierName: 'manufacturer', role: 'manufacturer' },
          { host: 'rtings.com', tierName: 'lab', role: 'lab' }
        ]
      },
      missingFields: ['weight'],
      maxQueries: 48,
      seedStatus: makeSeedStatus({ specs_seed: { is_needed: true } }),
      brandResolution: {
        officialDomain: 'alienware.com',
        supportDomain: 'dell.com',
        aliases: [],
      },
      focusGroups: [],
    });

    const alienwareHostQueries = profile.queries.filter((query) => query.includes('alienware.com') && !query.includes('site:'));
    const dellHostQueries = profile.queries.filter((query) => query.includes('dell.com') && !query.includes('site:'));

    assert.ok(alienwareHostQueries.length > 0, 'alienware.com soft host-biased queries now generated');
    assert.ok(dellHostQueries.length > 0, 'dell.com soft host-biased queries now generated via brand resolver');
  });
});
