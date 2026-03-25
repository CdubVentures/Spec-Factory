import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateIdentityGate,
  buildIdentityCriticalContradictions
} from '../identityGate.js';
import { loadConfig } from '../../../../config.js';

function makeAcceptedSource(overrides = {}) {
  return {
    url: overrides.url || 'https://example.com/product',
    rootDomain: overrides.rootDomain || 'example.com',
    host: overrides.host || 'example.com',
    tier: overrides.tier || 2,
    role: overrides.role || 'lab',
    approvedDomain: true,
    discoveryOnly: false,
    helperSource: overrides.helperSource || false,
    identity: {
      match: true,
      score: 0.76,
      reasons: ['brand_match', 'model_match'],
      criticalConflicts: [],
      ...(overrides.identity || {})
    },
    anchorCheck: { majorConflicts: [] },
    fieldCandidates: overrides.fieldCandidates || [],
    identityCandidates: overrides.identityCandidates || {},
    ...(overrides.extra || {})
  };
}

describe('Step 1: Tiered identity gate threshold', () => {
  it('manufacturer + additional sources without contradictions yields certainty >= 0.95 (capped at 0.95 not 0.99)', () => {
    const gate = evaluateIdentityGate([
      makeAcceptedSource({
        url: 'https://razer.com/mice/viper',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer'
      }),
      makeAcceptedSource({
        url: 'https://rtings.com/review',
        rootDomain: 'rtings.com',
        tier: 2
      }),
      makeAcceptedSource({
        url: 'https://techpowerup.com/review',
        rootDomain: 'techpowerup.com',
        tier: 2
      })
    ]);

    assert.ok(gate.certainty >= 0.95, `certainty ${gate.certainty} should be >= 0.95`);
    assert.ok(gate.certainty <= 1.0, `certainty ${gate.certainty} should be <= 1.0`);
    assert.equal(gate.validated, true);
  });

  it('manufacturer + additional + contradictions yields certainty 0.75 (keeps extraction provisional but publish-safe)', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://razer.com/mice/viper',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [{ field: 'connection', value: 'wireless' }]
      }),
      makeAcceptedSource({
        url: 'https://rtings.com/review',
        rootDomain: 'rtings.com',
        tier: 2,
        fieldCandidates: [{ field: 'connection', value: 'wireless / wired' }]
      }),
      makeAcceptedSource({
        url: 'https://techpowerup.com/review',
        rootDomain: 'techpowerup.com',
        tier: 2,
        fieldCandidates: []
      })
    ];

    const gate = evaluateIdentityGate(sources);
    assert.ok(gate.certainty >= 0.70, `certainty ${gate.certainty} should be >= 0.70 even with contradictions`);
  });

  it('no accepted sources yields low certainty below threshold', () => {
    const gate = evaluateIdentityGate([
      makeAcceptedSource({
        url: 'https://unknown.com/page',
        rootDomain: 'unknown.com',
        tier: 3,
        role: 'retail',
        identity: { match: false, score: 0.3, reasons: [], criticalConflicts: [] },
        extra: { approvedDomain: false }
      })
    ]);

    assert.ok(gate.certainty < 0.70, `certainty ${gate.certainty} should be < 0.70 with no accepted sources`);
    assert.equal(gate.validated, false);
  });

  it('manufacturer only (no additional sources) yields certainty below 0.95', () => {
    const gate = evaluateIdentityGate([
      makeAcceptedSource({
        url: 'https://razer.com/mice/viper',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer'
      })
    ]);

    assert.ok(gate.certainty >= 0.70, `certainty ${gate.certainty} should be >= 0.70`);
    assert.ok(gate.certainty < 0.95, `certainty ${gate.certainty} should be < 0.95 without additional sources`);
    assert.equal(gate.validated, false);
  });

  it('identityGatePublishThreshold is retired from config (hardcoded to 0.75 in orchestration)', () => {
    const config = loadConfig();
    assert.equal(Object.hasOwn(config, 'identityGatePublishThreshold'), false);
  });
});

describe('Step 2: Relaxed contradiction detection', () => {
  it('wireless vs wireless / wired is NOT a connection conflict', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://razer.com/mice',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [{ field: 'connection', value: 'wireless' }]
      }),
      makeAcceptedSource({
        url: 'https://rtings.com/review',
        rootDomain: 'rtings.com',
        tier: 2,
        fieldCandidates: [{ field: 'connection', value: 'wireless / wired' }]
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const connectionConflicts = contradictions.filter(c => c.conflict === 'connection_class_conflict');
    assert.equal(connectionConflicts.length, 0, 'wireless vs wireless/wired should not be a conflict');
  });

  it('Focus Pro 30K vs FOCUS PRO 30K Optical is NOT a sensor conflict', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://razer.com/mice',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 30K' }]
      }),
      makeAcceptedSource({
        url: 'https://rtings.com/review',
        rootDomain: 'rtings.com',
        tier: 2,
        fieldCandidates: [{ field: 'sensor', value: 'FOCUS PRO 30K Optical' }]
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const sensorConflicts = contradictions.filter(c => c.conflict === 'sensor_family_conflict');
    assert.equal(sensorConflicts.length, 0, 'Focus Pro 30K vs FOCUS PRO 30K Optical should not be a conflict');
  });

  it('generic or noisy sensor labels do not create a sensor conflict when only one concrete sensor signature exists', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [{ field: 'sensor', value: 'ProSettings' }]
      }),
      makeAcceptedSource({
        url: 'https://mousespecs.org/razer-viper-v3-pro',
        rootDomain: 'mousespecs.org',
        tier: 2,
        role: 'database',
        fieldCandidates: [{ field: 'sensor', value: 'Optical' }]
      }),
      makeAcceptedSource({
        url: 'https://psamethodcalculator.com/mouse/razer-viper-v3-pro',
        rootDomain: 'psamethodcalculator.com',
        tier: 2,
        role: 'database',
        fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 35K Optical Gen-2' }]
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const sensorConflicts = contradictions.filter(c => c.conflict === 'sensor_family_conflict');
    assert.equal(sensorConflicts.length, 0, 'noisy sensor labels should not create a product-family conflict');
  });

  it('Focus Pro 35K Perfect Sensor vs Focus Pro 35K Optical Sensor Gen-2 is not a sensor conflict', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://mousespecs.org/razer-viper-v3-pro',
        rootDomain: 'mousespecs.org',
        tier: 2,
        role: 'database',
        fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 35K Perfect Sensor' }]
      }),
      makeAcceptedSource({
        url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 35K Optical Sensor Gen-2' }]
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const sensorConflicts = contradictions.filter(c => c.conflict === 'sensor_family_conflict');
    assert.equal(sensorConflicts.length, 0, 'sensor-family wording differences should not create a conflict');
  });

  it('localized manufacturer Focus Pro 35K strings do not create a sensor conflict', () => {
    const localizedSensor = '\u7b2c 2 \u4e16\u4ee3 Focus Pro 35K \u30aa\u30d7\u30c6\u30a3\u30ab\u30eb\u30bb\u30f3\u30b5\u30fc';
    const sources = [
      makeAcceptedSource({
        url: 'https://www.razer.com/jp-jp/gaming-mice/razer-viper-v3-pro',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [{ field: 'sensor', value: localizedSensor }]
      }),
      makeAcceptedSource({
        url: 'https://psamethodcalculator.com/mouse/razer-viper-v3-pro',
        rootDomain: 'psamethodcalculator.com',
        tier: 2,
        role: 'database',
        fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 35K Optical Sensor Gen-2' }]
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const sensorConflicts = contradictions.filter(c => c.conflict === 'sensor_family_conflict');
    assert.equal(sensorConflicts.length, 0, 'localized manufacturer sensor labels should not create a conflict');
  });

  it('truncated numeric blurbs do not count as a concrete conflicting sensor family', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://psamethodcalculator.com/mouse/razer-viper-v3-pro',
        rootDomain: 'psamethodcalculator.com',
        tier: 2,
        role: 'database',
        fieldCandidates: [{ field: 'sensor', value: 'supporting up to 35' }]
      }),
      makeAcceptedSource({
        url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 35K Optical Sensor Gen-2' }]
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const sensorConflicts = contradictions.filter(c => c.conflict === 'sensor_family_conflict');
    assert.equal(sensorConflicts.length, 0, 'truncated blurbs should be ignored, not treated as conflicting sensor families');
  });

  it('125.6mm vs 126.1mm is NOT a dimension conflict (within 3mm)', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://razer.com/mice',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [{ field: 'lngth', value: '125.6' }]
      }),
      makeAcceptedSource({
        url: 'https://rtings.com/review',
        rootDomain: 'rtings.com',
        tier: 2,
        fieldCandidates: [{ field: 'lngth', value: '126.1' }]
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const sizeConflicts = contradictions.filter(c => c.conflict === 'size_class_conflict');
    assert.equal(sizeConflicts.length, 0, '0.5mm difference should not be a conflict');
  });

  it('125mm vs 132mm is NOT a dimension conflict (7mm within 15mm measurement tolerance)', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://razer.com/mice',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [{ field: 'lngth', value: '125' }]
      }),
      makeAcceptedSource({
        url: 'https://rtings.com/review',
        rootDomain: 'rtings.com',
        tier: 2,
        fieldCandidates: [{ field: 'lngth', value: '132' }]
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const sizeConflicts = contradictions.filter(c => c.conflict === 'size_class_conflict');
    assert.equal(sizeConflicts.length, 0, '7mm difference is within measurement tolerance — not a product identity conflict');
  });

  it('90mm vs 130mm IS a dimension conflict (40mm = genuinely different product class)', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://razer.com/mice',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [{ field: 'lngth', value: '90' }]
      }),
      makeAcceptedSource({
        url: 'https://rtings.com/review',
        rootDomain: 'rtings.com',
        tier: 2,
        fieldCandidates: [{ field: 'lngth', value: '130' }]
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const sizeConflicts = contradictions.filter(c => c.conflict === 'size_class_conflict');
    assert.equal(sizeConflicts.length, 1, '40mm difference indicates genuinely different products');
  });

  it('implausible page-layout dimensions do not create a size conflict when one plausible mouse cluster exists', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [
          { field: 'width', value: '375' },
          { field: 'height', value: '620' }
        ]
      }),
      makeAcceptedSource({
        url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
        rootDomain: 'rtings.com',
        tier: 2,
        role: 'lab',
        fieldCandidates: [
          { field: 'width', value: '300' },
          { field: 'height', value: '150' }
        ]
      }),
      makeAcceptedSource({
        url: 'https://prosettings.net/blog/the-rise-of-the-razer-viper-v3-pro',
        rootDomain: 'prosettings.net',
        tier: 2,
        role: 'review',
        fieldCandidates: [
          { field: 'width', value: '1600' },
          { field: 'height', value: '900' }
        ]
      }),
      makeAcceptedSource({
        url: 'https://psamethodcalculator.com/mouse/razer-viper-v3-pro',
        rootDomain: 'psamethodcalculator.com',
        tier: 2,
        role: 'database',
        fieldCandidates: [
          { field: 'lngth', value: '127.1' },
          { field: 'width', value: '63.9' },
          { field: 'height', value: '39.9' }
        ]
      }),
      makeAcceptedSource({
        url: 'https://mousespecs.org/razer-viper-v3-pro',
        rootDomain: 'mousespecs.org',
        tier: 2,
        role: 'database',
        fieldCandidates: [
          { field: 'lngth', value: '1271' },
          { field: 'width', value: '640' },
          { field: 'height', value: '360' }
        ]
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const sizeConflicts = contradictions.filter(c => c.conflict === 'size_class_conflict');
    assert.equal(sizeConflicts.length, 0, 'layout-sized pixel values should not create a product-size conflict');
  });

  it('regional SKU variants share base SKU — NOT a conflict', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://razer.com/mice',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        identityCandidates: { sku: 'RZ01-04630100-R3U1' }
      }),
      makeAcceptedSource({
        url: 'https://rtings.com/review',
        rootDomain: 'rtings.com',
        tier: 2,
        identityCandidates: { sku: 'RZ01-04630100-R3M1' }
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const skuConflicts = contradictions.filter(c => c.conflict === 'sku_conflict');
    assert.equal(skuConflicts.length, 0, 'regional SKU variants should not be a conflict');
  });

  it('completely different SKUs IS a conflict', () => {
    const sources = [
      makeAcceptedSource({
        url: 'https://razer.com/mice',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        identityCandidates: { sku: 'RZ01-04630100-R3U1' }
      }),
      makeAcceptedSource({
        url: 'https://rtings.com/review',
        rootDomain: 'rtings.com',
        tier: 2,
        identityCandidates: { sku: 'LOG-910-006787' }
      })
    ];

    const contradictions = buildIdentityCriticalContradictions(sources);
    const skuConflicts = contradictions.filter(c => c.conflict === 'sku_conflict');
    assert.equal(skuConflicts.length, 1, 'completely different SKUs should be a conflict');
  });
});

describe('Step 4: Performance tuning defaults', () => {
  it('standard profile has tuned defaults', () => {
    const config = loadConfig();
    // WHY: perHostMinDelayMs, pageGotoTimeoutMs, pageNetworkIdleTimeoutMs retired from registry —
    // now hardcoded in crawl/frontier modules.
    assert.equal(config.searchProfileQueryCap, 10);
  });
});

describe('Step 5: Soft identity gate on extraction', () => {
  it('certainty 0.85 with validated=true results in full extraction (identityFull=true)', () => {
    const gate = evaluateIdentityGate([
      makeAcceptedSource({
        url: 'https://razer.com/mice/viper',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer'
      }),
      makeAcceptedSource({
        url: 'https://rtings.com/review',
        rootDomain: 'rtings.com',
        tier: 2
      }),
      makeAcceptedSource({
        url: 'https://techpowerup.com/review',
        rootDomain: 'techpowerup.com',
        tier: 2
      })
    ]);

    assert.equal(gate.validated, true);
    assert.ok(gate.certainty >= 0.70);
  });

  it('manufacturer only without additional sources is in provisional band (>= 0.50 but validated=false)', () => {
    const gate = evaluateIdentityGate([
      makeAcceptedSource({
        url: 'https://razer.com/mice/viper',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer'
      })
    ]);

    assert.ok(gate.certainty >= 0.50, `certainty ${gate.certainty} should be >= 0.50`);
    assert.equal(gate.validated, false, 'should not be validated without additional sources');
  });

  it('zero accepted sources (all identity.match=false, unapproved) yields certainty below publishThreshold', () => {
    const gate = evaluateIdentityGate([
      {
        url: 'https://unknown.com/page',
        rootDomain: 'unknown.com',
        tier: 4,
        role: 'retail',
        approvedDomain: false,
        discoveryOnly: false,
        identity: { match: false, score: 0.2, reasons: [], criticalConflicts: [] },
        anchorCheck: { majorConflicts: [] },
        fieldCandidates: []
      }
    ]);

    assert.equal(gate.validated, false);
    assert.equal(gate.acceptedSourceCount, 0);
    assert.ok(gate.certainty < 0.70, `certainty ${gate.certainty} should be < 0.70`);
  });

  it('noisy accepted-source fields do not block validation when identity evidence is otherwise sufficient', () => {
    const gate = evaluateIdentityGate([
      makeAcceptedSource({
        url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
        rootDomain: 'razer.com',
        tier: 1,
        role: 'manufacturer',
        fieldCandidates: [
          { field: 'sensor', value: 'ProSettings' },
          { field: 'width', value: '375' },
          { field: 'height', value: '620' }
        ]
      }),
      makeAcceptedSource({
        url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
        rootDomain: 'rtings.com',
        tier: 2,
        role: 'lab',
        fieldCandidates: [
          { field: 'width', value: '300' },
          { field: 'height', value: '150' }
        ]
      }),
      makeAcceptedSource({
        url: 'https://psamethodcalculator.com/mouse/razer-viper-v3-pro',
        rootDomain: 'psamethodcalculator.com',
        tier: 2,
        role: 'database',
        fieldCandidates: [
          { field: 'sensor', value: 'Focus Pro 35K Optical Gen-2' },
          { field: 'lngth', value: '127.1' },
          { field: 'width', value: '63.9' },
          { field: 'height', value: '39.9' }
        ]
      }),
      makeAcceptedSource({
        url: 'https://mousespecs.org/razer-viper-v3-pro',
        rootDomain: 'mousespecs.org',
        tier: 2,
        role: 'database',
        fieldCandidates: [
          { field: 'sensor', value: 'Optical' },
          { field: 'lngth', value: '1271' },
          { field: 'width', value: '640' },
          { field: 'height', value: '360' }
        ]
      })
    ]);

    assert.equal(gate.validated, true);
    assert.equal(gate.status, 'CONFIRMED');
    assert.equal(gate.reasonCodes.includes('identity_conflict'), false);
  });
});
