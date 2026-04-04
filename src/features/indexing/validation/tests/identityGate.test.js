import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIdentityReport,
  evaluateIdentityGate,
  evaluateSourceIdentity
} from '../identityGate.js';

test('evaluateSourceIdentity can match brand+model when variant is not provided', () => {
  const identity = evaluateSourceIdentity(
    {
      url: 'https://www.logitechg.com/en-us/products/gaming-mice/pro-x-superlight-2.html',
      title: 'PRO X SUPERLIGHT 2 Gaming Mouse',
      identityCandidates: {
        brand: 'Logitech',
        model: 'G Pro X Superlight 2'
      }
    },
    {
      brand: 'Logitech',
      base_model: 'G Pro X Superlight 2',
      variant: '',
      sku: '',
      mpn: '',
      gtin: ''
    },
    { identityGateBaseMatchThreshold: 0.6 }
  );

  assert.equal(identity.match, true);
  assert.equal(identity.score >= 0.7, true);
  assert.equal(identity.matchThreshold, 0.6);
  assert.deepEqual(identity.criticalConflicts, []);
});

test('evaluateIdentityGate ignores weak contradictions from generic category pages', () => {
  const gate = evaluateIdentityGate([
    {
      url: 'https://www.logitechg.com/en-us/products/gaming-mice/pro-x-superlight-2.html',
      rootDomain: 'logitechg.com',
      tier: 1,
      role: 'manufacturer',
      approvedDomain: true,
      identity: {
        match: true,
        score: 0.74,
        reasons: ['brand_match', 'model_match'],
        criticalConflicts: []
      },
      anchorCheck: { majorConflicts: [] },
      fieldCandidates: []
    },
    {
      url: 'https://www.rtings.com/mouse/reviews/logitech/g-pro-x-superlight-2',
      rootDomain: 'rtings.com',
      tier: 2,
      role: 'lab',
      approvedDomain: true,
      identity: {
        match: true,
        score: 0.76,
        reasons: ['brand_match', 'model_match'],
        criticalConflicts: []
      },
      anchorCheck: { majorConflicts: [] },
      fieldCandidates: []
    },
    {
      url: 'https://www.techpowerup.com/review/logitech-g-pro-x-superlight-2/',
      rootDomain: 'techpowerup.com',
      tier: 2,
      role: 'database',
      approvedDomain: true,
      identity: {
        match: true,
        score: 0.73,
        reasons: ['brand_match', 'model_match'],
        criticalConflicts: []
      },
      anchorCheck: { majorConflicts: [] },
      fieldCandidates: []
    },
    {
      url: 'https://www.logitechg.com/en-us/shop/c/gaming-mice',
      rootDomain: 'logitechg.com',
      tier: 1,
      role: 'manufacturer',
      approvedDomain: true,
      identity: {
        match: false,
        score: 0.2,
        reasons: ['brand_match'],
        criticalConflicts: ['model_mismatch']
      },
      anchorCheck: { majorConflicts: [] },
      fieldCandidates: []
    }
  ]);

  assert.equal(gate.validated, true);
  assert.equal(gate.requirements.hasManufacturer, true);
  assert.equal(gate.requirements.additionalCredibleSources >= 2, true);
  assert.equal(gate.contradictions.length, 0);
});

test('evaluateIdentityGate allows helper-backed validation with manufacturer + one credible source', () => {
  const gate = evaluateIdentityGate([
    {
      url: 'https://www.razer.com/gaming-mice/razer-basilisk-v3-35k',
      rootDomain: 'razer.com',
      host: 'razer.com',
      tier: 1,
      role: 'manufacturer',
      approvedDomain: true,
      identity: {
        match: true,
        score: 0.78,
        reasons: ['brand_match', 'model_match'],
        criticalConflicts: []
      },
      anchorCheck: { majorConflicts: [] },
      fieldCandidates: []
    },
    {
      url: 'category_authority://mouse/activeFiltering.json#138',
      rootDomain: 'helper-files.local',
      host: 'helper-files.local',
      tier: 2,
      role: 'database',
      approvedDomain: true,
      helperSource: true,
      identity: {
        match: true,
        score: 0.99,
        reasons: ['helper_supportive_match'],
        criticalConflicts: []
      },
      anchorCheck: { majorConflicts: [] },
      fieldCandidates: []
    }
  ]);

  assert.equal(gate.validated, true);
  assert.equal(gate.requirements.hasManufacturer, true);
  assert.equal(gate.requirements.hasTrustedHelper, true);
  assert.equal(gate.requirements.additionalCredibleSources, 1);
});

test('evaluateSourceIdentity hard ID match forces CONFIRMED decision and confidence 1.0', () => {
  const identity = evaluateSourceIdentity(
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      identityCandidates: {
        brand: 'Razer',
        model: 'Viper V3 Pro',
        sku: 'RZ01-05120100-R3U1'
      }
    },
    {
      brand: 'Razer',
      base_model: 'Viper V3 Pro',
      variant: '',
      sku: 'RZ01-05120100-R3U1',
      mpn: '',
      gtin: ''
    }
  );

  assert.equal(identity.match, true);
  assert.equal(identity.decision, 'CONFIRMED');
  assert.equal(identity.confidence, 1);
  assert.equal(identity.matchedHardIds.sku, 'RZ01-05120100-R3U1');
  assert.equal(identity.reasonCodes.includes('hard_id_match'), true);
});

test('evaluateSourceIdentity rejects unexpected variant suffix when no variant is requested', () => {
  const identity = evaluateSourceIdentity(
    {
      url: 'https://www.manuals.ca/logitech/g-pro-x-superlight-2-dex/manual',
      title: 'Logitech G Pro X Superlight 2 DEX manual',
      identityCandidates: {
        brand: 'Logitech',
        model: 'G Pro X Superlight 2 DEX'
      }
    },
    {
      brand: 'Logitech',
      base_model: 'G Pro X Superlight 2',
      variant: '',
      sku: '',
      mpn: '',
      gtin: ''
    }
  );

  assert.equal(identity.match, false);
  assert.equal(identity.decision, 'REJECTED');
  assert.equal(identity.matchedNegativeTokens.includes('dex'), true);
  assert.equal(identity.reasonCodes.includes('negative_token_present'), true);
});

test('evaluateSourceIdentity does not treat localized manufacturer title adjectives as variant conflicts', () => {
  const identity = evaluateSourceIdentity(
    {
      url: 'https://www.razer.com/de-de/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro – Ultra leichte kabellose E-Sport-Maus | Razer Deutschland',
      identityCandidates: {
        brand: 'Razer',
        model: 'Razer Viper V3 Pro'
      }
    },
    {
      brand: 'Razer',
      base_model: 'Viper V3 Pro',
      variant: '',
      sku: '',
      mpn: '',
      gtin: ''
    },
    { identityGateBaseMatchThreshold: 0.7 }
  );

  assert.equal(identity.match, true);
  assert.equal(identity.decision, 'CONFIRMED');
  assert.equal(identity.reasonCodes.includes('negative_token_present'), false);
  assert.equal(identity.reasonCodes.includes('unexpected_variant_token'), false);
});

test('evaluateSourceIdentity can confirm review pages from title and url when structured brand fields are sparse', () => {
  const identity = evaluateSourceIdentity(
    {
      url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
      title: 'Razer Viper V3 Pro Review - RTINGS.com',
      identityCandidates: {}
    },
    {
      brand: 'Razer',
      base_model: 'Viper V3 Pro',
      variant: '',
      sku: '',
      mpn: '',
      gtin: ''
    },
    { identityGateBaseMatchThreshold: 0.7 }
  );

  assert.equal(identity.match, true);
  assert.equal(identity.decision, 'CONFIRMED');
  assert.equal(identity.reasonCodes.includes('brand_match'), true);
  assert.equal(identity.reasonCodes.includes('model_match'), true);
});

test('evaluateSourceIdentity rejects product-specific sources that miss required model digits', () => {
  const identity = evaluateSourceIdentity(
    {
      url: 'https://www.manua.ls/logitech/g-pro-x-superlight/manual',
      title: 'Logitech G Pro X Superlight manual',
      identityCandidates: {
        brand: 'Logitech',
        model: 'G Pro X Superlight'
      }
    },
    {
      brand: 'Logitech',
      base_model: 'G Pro X Superlight 2',
      variant: '',
      sku: '',
      mpn: '',
      gtin: ''
    }
  );

  assert.equal(identity.match, false);
  assert.equal(identity.decision, 'REJECTED');
  assert.equal(identity.reasonCodes.includes('model_numeric_range_out_of_range'), true);
  assert.equal(identity.criticalConflicts.includes('model_numeric_range_out_of_range'), true);
});

test('evaluateSourceIdentity rejects mismatched hard IDs with reason codes', () => {
  const identity = evaluateSourceIdentity(
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      identityCandidates: {
        brand: 'Razer',
        model: 'Viper V3 Pro',
        sku: 'RZ01-99999999-R3U1'
      }
    },
    {
      brand: 'Razer',
      base_model: 'Viper V3 Pro',
      variant: '',
      sku: 'RZ01-05120100-R3U1',
      mpn: '',
      gtin: ''
    }
  );

  assert.equal(identity.match, false);
  assert.equal(identity.decision, 'REJECTED');
  assert.equal(identity.reasonCodes.includes('hard_id_mismatch'), true);
  assert.equal(identity.criticalConflicts.includes('sku_mismatch'), true);
});

test('buildIdentityReport emits per-page snapshots and reconciliation status', () => {
  const sourceResults = [
    {
      host: 'razer.com',
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      finalUrl: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      approvedDomain: true,
      discoveryOnly: false,
      identity: {
        match: true,
        score: 1,
        confidence: 1,
        decision: 'CONFIRMED',
        reasonCodes: ['hard_id_match'],
        matchedHardIds: { sku: 'RZ01-05120100-R3U1' },
        matchedRequiredTokens: ['razer', 'viper', 'v3', 'pro'],
        matchedNegativeTokens: []
      },
      anchorCheck: { majorConflicts: [] }
    },
    {
      host: 'example.com',
      url: 'https://example.com/razer-viper-v2-pro-review',
      finalUrl: 'https://example.com/razer-viper-v2-pro-review',
      approvedDomain: true,
      discoveryOnly: false,
      identity: {
        match: false,
        score: 0.2,
        confidence: 0.2,
        decision: 'REJECTED',
        reasonCodes: ['negative_token_present', 'model_mismatch'],
        matchedHardIds: {},
        matchedRequiredTokens: ['razer', 'viper'],
        matchedNegativeTokens: ['v2']
      },
      anchorCheck: { majorConflicts: [] }
    }
  ];

  const gate = evaluateIdentityGate(sourceResults);
  const report = buildIdentityReport({
    productId: 'mouse-razer-viper-v3-pro',
    runId: 'run_20260213_001',
    sourceResults,
    identityGate: gate
  });

  assert.equal(report.product_id, 'mouse-razer-viper-v3-pro');
  assert.equal(report.run_id, 'run_20260213_001');
  assert.equal(Array.isArray(report.pages), true);
  assert.equal(report.pages.length, 2);
  assert.equal(report.pages[0].decision, 'CONFIRMED');
  assert.equal(report.pages[1].decision, 'REJECTED');
  assert.equal(typeof report.status, 'string');
  assert.equal(typeof report.needs_review, 'boolean');
});

