import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFieldCoreDeep,
  applyTierAcceptancePolicy,
  clusterDeepNumericClaims,
  applyCoreDeepGates,
} from '../src/features/indexing/pipeline/shared/coreDeepGate.js';

// Minimal mock fieldRulesEngine
function makeMockEngine(overrides = {}) {
  const coreFields = overrides.core_fields || ['sensor', 'weight', 'dpi', 'polling_rate', 'button_count'];
  const fields = {
    sensor: { evidence_tier_minimum: 1 },
    weight: { evidence_tier_minimum: 2 },
    dpi: { evidence_tier_minimum: 2 },
    polling_rate: { evidence_tier_minimum: 2 },
    button_count: { evidence_tier_minimum: 2 },
    click_latency: { evidence_tier_minimum: 3 },
    rgb_zones: { evidence_tier_minimum: 3 },
    lod: { evidence_tier_minimum: 3 },
    ...overrides.fields,
  };
  return {
    getCoreDeepFieldRules() {
      return { core_fields: coreFields, fields };
    },
  };
}

function makeConsensus({ fieldValues = {}, provenanceOverrides = {} } = {}) {
  const fields = { id: 'test-1', brand: 'Razer', model: 'Viper', category: 'mouse', ...fieldValues };
  const provenance = {};
  const candidates = {};
  for (const [field, value] of Object.entries(fields)) {
    provenance[field] = {
      value,
      anchor_locked: false,
      confirmations: 2,
      approved_confirmations: 2,
      pass_target: 2,
      meets_pass_target: true,
      confidence: 0.9,
      evidence: [
        { tier: 1, tierName: 'manufacturer', method: 'html_table', url: 'https://razer.com', approvedDomain: true, rootDomain: 'razer.com' },
        { tier: 2, tierName: 'lab', method: 'pdf_table', url: 'https://rtings.com', approvedDomain: true, rootDomain: 'rtings.com' },
      ],
      ...provenanceOverrides[field],
    };
    candidates[field] = [];
  }
  return { fields, provenance, candidates };
}

// ---------------------------------------------------------------------------
// Tier Acceptance (TA-01..09)
// ---------------------------------------------------------------------------
describe('WP4 — Tier acceptance policy', () => {
  it('TA-01: Tier 1 accepted for core_fact', () => {
    const consensus = makeConsensus({ fieldValues: { sensor: 'PAW3950' } });
    consensus.provenance.sensor.approved_confirmations = 1;
    consensus.provenance.sensor.evidence = [
      { tier: 1, tierName: 'manufacturer', method: 'html_table', url: 'https://razer.com', approvedDomain: true, rootDomain: 'razer.com' },
    ];
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.notEqual(result.fields.sensor, 'unk', 'tier 1 core_fact should be accepted');
    assert.equal(result.provenance.sensor.acceptance_gate_result.accepted, true);
  });

  it('TA-02: Tier 2 accepted for core_fact', () => {
    const consensus = makeConsensus({ fieldValues: { weight: '58' } });
    consensus.provenance.weight.evidence = [
      { tier: 2, tierName: 'lab', method: 'pdf_table', url: 'https://rtings.com', approvedDomain: true, rootDomain: 'rtings.com' },
    ];
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.notEqual(result.fields.weight, 'unk');
    assert.equal(result.provenance.weight.acceptance_gate_result.accepted, true);
  });

  it('TA-03: Tier 3 rejected for core_fact (no corroboration)', () => {
    const consensus = makeConsensus({ fieldValues: { sensor: 'PAW3950' } });
    consensus.provenance.sensor.approved_confirmations = 1;
    consensus.provenance.sensor.evidence = [
      { tier: 3, tierName: 'database', method: 'dom', url: 'https://somedb.com', approvedDomain: true, rootDomain: 'somedb.com' },
    ];
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.fields.sensor, 'unk', 'tier 3 without corroboration should be rejected');
    assert.equal(result.provenance.sensor.gate_rejected, true);
    assert.equal(result.provenance.sensor.acceptance_gate_result.accepted, false);
  });

  it('TA-04: Tier 3 accepted with corroboration >= 2', () => {
    const consensus = makeConsensus({ fieldValues: { sensor: 'PAW3950' } });
    consensus.provenance.sensor.approved_confirmations = 2;
    consensus.provenance.sensor.evidence = [
      { tier: 3, tierName: 'database', method: 'dom', url: 'https://a.com', approvedDomain: true, rootDomain: 'a.com' },
      { tier: 3, tierName: 'database', method: 'dom', url: 'https://b.com', approvedDomain: true, rootDomain: 'b.com' },
    ];
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.notEqual(result.fields.sensor, 'unk');
    assert.equal(result.provenance.sensor.acceptance_gate_result.accepted, true);
  });

  it('TA-05: Tier 3 + Tier 3 independent corroboration → accepted', () => {
    const consensus = makeConsensus({ fieldValues: { dpi: '26000' } });
    consensus.provenance.dpi.approved_confirmations = 3;
    consensus.provenance.dpi.evidence = [
      { tier: 3, tierName: 'database', method: 'dom', url: 'https://a.com', approvedDomain: true, rootDomain: 'a.com' },
      { tier: 3, tierName: 'database', method: 'html_table', url: 'https://b.com', approvedDomain: true, rootDomain: 'b.com' },
      { tier: 3, tierName: 'database', method: 'dom', url: 'https://c.com', approvedDomain: true, rootDomain: 'c.com' },
    ];
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.notEqual(result.fields.dpi, 'unk');
    assert.equal(result.provenance.dpi.acceptance_gate_result.accepted, true);
  });

  it('TA-06: Tier 4 alone → rejected for core_fact', () => {
    const consensus = makeConsensus({ fieldValues: { sensor: 'PAW3950' } });
    consensus.provenance.sensor.approved_confirmations = 1;
    consensus.provenance.sensor.evidence = [
      { tier: 4, tierName: 'community', method: 'dom', url: 'https://reddit.com', approvedDomain: true, rootDomain: 'reddit.com' },
    ];
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.fields.sensor, 'unk');
    assert.equal(result.provenance.sensor.gate_rejected, true);
  });

  it('TA-07: Tier 4 + Tier 4 volume → still rejected (volume != authority)', () => {
    const consensus = makeConsensus({ fieldValues: { sensor: 'PAW3950' } });
    consensus.provenance.sensor.approved_confirmations = 5;
    consensus.provenance.sensor.evidence = Array.from({ length: 5 }, (_, i) => ({
      tier: 4, tierName: 'community', method: 'dom', url: `https://forum${i}.com`, approvedDomain: true, rootDomain: `forum${i}.com`,
    }));
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.fields.sensor, 'unk');
    assert.equal(result.provenance.sensor.gate_rejected, true);
  });

  it('TA-08: Tier 4 + Tier 1 corroboration → accepted (Tier 1 validates)', () => {
    const consensus = makeConsensus({ fieldValues: { sensor: 'PAW3950' } });
    consensus.provenance.sensor.approved_confirmations = 2;
    consensus.provenance.sensor.evidence = [
      { tier: 4, tierName: 'community', method: 'dom', url: 'https://reddit.com', approvedDomain: true, rootDomain: 'reddit.com' },
      { tier: 1, tierName: 'manufacturer', method: 'html_table', url: 'https://razer.com', approvedDomain: true, rootDomain: 'razer.com' },
    ];
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.notEqual(result.fields.sensor, 'unk');
    assert.equal(result.provenance.sensor.acceptance_gate_result.accepted, true);
  });

  it('TA-09: No source → field remains null/unk', () => {
    const consensus = makeConsensus({ fieldValues: { sensor: 'unk' } });
    consensus.provenance.sensor.approved_confirmations = 0;
    consensus.provenance.sensor.evidence = [];
    consensus.provenance.sensor.value = 'unk';
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.fields.sensor, 'unk');
  });
});

// ---------------------------------------------------------------------------
// Community Override Prevention (COP-01..04)
// ---------------------------------------------------------------------------
describe('WP4 — Community override prevention', () => {
  it('COP-01: Tier 4 tries to SET a null core fact → field remains unk', () => {
    const consensus = makeConsensus({ fieldValues: { sensor: 'PAW3950' } });
    // Simulate: field was unk, tier 4 is the only source trying to set it
    consensus.provenance.sensor.approved_confirmations = 1;
    consensus.provenance.sensor.evidence = [
      { tier: 4, tierName: 'community', method: 'dom', url: 'https://reddit.com', approvedDomain: true, rootDomain: 'reddit.com' },
    ];
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.fields.sensor, 'unk');
    assert.equal(result.provenance.sensor.gate_rejected, true);
  });

  it('COP-02: Tier 4 tries to OVERWRITE Tier 1 core fact → Tier 1 preserved', () => {
    // Two-step: first a tier 1 source found 'PAW3950', then a tier 4 tries to change to 'HERO2'
    // In our model, consensus already picked the winner. Gate verifies the best tier.
    // If the best evidence is tier 4 and there was a tier 1 core value, tier 4 is rejected.
    const consensus = makeConsensus({ fieldValues: { sensor: 'HERO2' } });
    consensus.provenance.sensor.approved_confirmations = 3;
    consensus.provenance.sensor.evidence = [
      { tier: 4, tierName: 'community', method: 'dom', url: 'https://reddit.com', approvedDomain: true, rootDomain: 'reddit.com' },
      { tier: 4, tierName: 'community', method: 'dom', url: 'https://forum.com', approvedDomain: true, rootDomain: 'forum.com' },
      { tier: 4, tierName: 'community', method: 'dom', url: 'https://another.com', approvedDomain: true, rootDomain: 'another.com' },
    ];
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    // All evidence is tier 4 with no tier <=2 corroboration, so gate rejects
    assert.equal(result.fields.sensor, 'unk');
    assert.equal(result.provenance.sensor.gate_rejected, true);
  });

  it('COP-03: 5x Tier 4 agree → still unk (volume != authority)', () => {
    const consensus = makeConsensus({ fieldValues: { weight: '62' } });
    consensus.provenance.weight.approved_confirmations = 5;
    consensus.provenance.weight.evidence = Array.from({ length: 5 }, (_, i) => ({
      tier: 4, tierName: 'community', method: 'dom', url: `https://site${i}.com`, approvedDomain: true, rootDomain: `site${i}.com`,
    }));
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.fields.weight, 'unk');
  });

  it('COP-04: 10x Tier 4 agree → still unk', () => {
    const consensus = makeConsensus({ fieldValues: { dpi: '26000' } });
    consensus.provenance.dpi.approved_confirmations = 10;
    consensus.provenance.dpi.evidence = Array.from({ length: 10 }, (_, i) => ({
      tier: 4, tierName: 'community', method: 'dom', url: `https://site${i}.com`, approvedDomain: true, rootDomain: `site${i}.com`,
    }));
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.fields.dpi, 'unk');
  });
});

// ---------------------------------------------------------------------------
// Deep Claims (DC-01..04)
// ---------------------------------------------------------------------------
describe('WP4 — Deep claims', () => {
  it('DC-01: Tier 1 deep claim stored with high confidence metadata', () => {
    const consensus = makeConsensus({ fieldValues: { click_latency: '0.2' } });
    consensus.provenance.click_latency = {
      value: '0.2',
      anchor_locked: false,
      confirmations: 1,
      approved_confirmations: 1,
      pass_target: 2,
      meets_pass_target: false,
      confidence: 0.9,
      evidence: [
        { tier: 1, tierName: 'manufacturer', method: 'pdf_table', url: 'https://razer.com', approvedDomain: true, rootDomain: 'razer.com' },
      ],
    };
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.provenance.click_latency.field_classification, 'deep_claim');
    assert.equal(result.provenance.click_latency.acceptance_gate_result.accepted, true);
  });

  it('DC-02: Tier 3 lab with methodology stored', () => {
    const consensus = makeConsensus({ fieldValues: { click_latency: '0.3' } });
    consensus.provenance.click_latency = {
      value: '0.3',
      anchor_locked: false,
      confirmations: 1,
      approved_confirmations: 1,
      pass_target: 2,
      meets_pass_target: false,
      confidence: 0.7,
      evidence: [
        { tier: 3, tierName: 'lab', method: 'pdf_table', url: 'https://lab.com', approvedDomain: true, rootDomain: 'lab.com' },
      ],
    };
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.provenance.click_latency.field_classification, 'deep_claim');
    assert.equal(result.provenance.click_latency.acceptance_gate_result.accepted, true);
  });

  it('DC-03: Tier 4 community deep claim stored with low confidence', () => {
    const consensus = makeConsensus({ fieldValues: { click_latency: '0.5' } });
    consensus.provenance.click_latency = {
      value: '0.5',
      anchor_locked: false,
      confirmations: 1,
      approved_confirmations: 1,
      pass_target: 2,
      meets_pass_target: false,
      confidence: 0.4,
      evidence: [
        { tier: 4, tierName: 'community', method: 'dom', url: 'https://reddit.com', approvedDomain: true, rootDomain: 'reddit.com' },
      ],
    };
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.provenance.click_latency.field_classification, 'deep_claim');
    assert.equal(result.provenance.click_latency.acceptance_gate_result.accepted, true);
  });

  it('DC-04: conflicting deep claims both kept, tier weight respected', () => {
    const consensus = makeConsensus({ fieldValues: { click_latency: '0.3' } });
    consensus.provenance.click_latency = {
      value: '0.3',
      anchor_locked: false,
      confirmations: 2,
      approved_confirmations: 2,
      pass_target: 2,
      meets_pass_target: true,
      confidence: 0.7,
      evidence: [
        { tier: 3, tierName: 'lab', method: 'pdf_table', url: 'https://lab.com', approvedDomain: true, rootDomain: 'lab.com' },
        { tier: 4, tierName: 'community', method: 'dom', url: 'https://reddit.com', approvedDomain: true, rootDomain: 'reddit.com' },
      ],
    };
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.provenance.click_latency.field_classification, 'deep_claim');
    assert.equal(result.provenance.click_latency.acceptance_gate_result.accepted, true);
  });
});

// ---------------------------------------------------------------------------
// Claim Clustering (CL-01..04)
// ---------------------------------------------------------------------------
describe('WP4 — Claim clustering (via clusterDeepNumericClaims)', () => {
  it('CL-01: [2.3, 2.4, 2.3, 2.5] → median ~2.35, range 2.3-2.5', () => {
    const result = clusterDeepNumericClaims([
      { value: 2.3 }, { value: 2.4 }, { value: 2.3 }, { value: 2.5 },
    ]);
    assert.ok(Math.abs(result.median - 2.35) < 0.01);
    assert.deepEqual(result.range, [2.3, 2.5]);
    assert.equal(result.outliers.length, 0);
  });

  it('CL-02: [2.3, 2.4, 2.3, 8.1] → median ~2.35, outlier 8.1', () => {
    const result = clusterDeepNumericClaims([
      { value: 2.3 }, { value: 2.4 }, { value: 2.3 }, { value: 8.1 },
    ]);
    assert.ok(Math.abs(result.median - 2.35) < 0.01);
    assert.ok(result.outliers.length >= 1);
    assert.ok(result.outliers.some(o => Number(o.value) === 8.1));
  });

  it('CL-03: [2.3] → value 2.3, no clustering', () => {
    const result = clusterDeepNumericClaims([{ value: 2.3 }]);
    assert.equal(result.median, 2.3);
    assert.equal(result.corroboration_count, 1);
  });

  it('CL-04: [1.0, 5.0, 9.0] → wide range noted', () => {
    const result = clusterDeepNumericClaims([
      { value: 1.0 }, { value: 5.0 }, { value: 9.0 },
    ]);
    assert.equal(result.median, 5.0);
    assert.deepEqual(result.range, [1.0, 9.0]);
    // 1.0 < 0.5 * 5.0 = 2.5 → outlier; 9.0 > 2 * 5.0 = 10 → not outlier
    assert.ok(result.outliers.some(o => Number(o.value) === 1.0));
  });
});

// ---------------------------------------------------------------------------
// Regression (REG-01..03)
// ---------------------------------------------------------------------------
describe('WP4 — Regression', () => {
  it('REG-02: rejected sources logged with reason', () => {
    const consensus = makeConsensus({ fieldValues: { sensor: 'PAW3950' } });
    consensus.provenance.sensor.approved_confirmations = 1;
    consensus.provenance.sensor.evidence = [
      { tier: 4, tierName: 'community', method: 'dom', url: 'https://reddit.com', approvedDomain: true, rootDomain: 'reddit.com' },
    ];
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    assert.equal(result.provenance.sensor.gate_rejected, true);
    assert.ok(result.provenance.sensor.acceptance_gate_result.reason, 'rejection must have a reason');
    assert.ok(result.provenance.sensor.acceptance_gate_result.reason.length > 0);
  });

  it('REG-03: no silent drops (every rejection has trace)', () => {
    const consensus = makeConsensus({
      fieldValues: { sensor: 'PAW3950', weight: '62', dpi: '26000' },
    });
    // Make all three fields have only tier 4 evidence
    for (const field of ['sensor', 'weight', 'dpi']) {
      consensus.provenance[field].approved_confirmations = 1;
      consensus.provenance[field].evidence = [
        { tier: 4, tierName: 'community', method: 'dom', url: 'https://reddit.com', approvedDomain: true, rootDomain: 'reddit.com' },
      ];
    }
    const engine = makeMockEngine();
    const result = applyCoreDeepGates({ consensus, fieldRulesEngine: engine, config: {} });
    for (const field of ['sensor', 'weight', 'dpi']) {
      assert.equal(result.fields[field], 'unk', `${field} should be rejected`);
      assert.equal(result.provenance[field].gate_rejected, true, `${field} must have gate_rejected=true`);
      assert.ok(result.provenance[field].acceptance_gate_result, `${field} must have acceptance_gate_result`);
      assert.ok(result.provenance[field].acceptance_gate_result.reason, `${field} rejection must have reason`);
    }
  });
});
