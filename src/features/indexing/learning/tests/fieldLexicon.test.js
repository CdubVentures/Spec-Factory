import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultFieldLexicon, updateFieldLexicon } from '../fieldLexicon.js';

// ── method token exclusion ──

describe('method token exclusion', () => {
  it('dom_xpath method is NOT added as synonym', () => {
    const artifact = defaultFieldLexicon();
    const next = updateFieldLexicon({
      artifact,
      provenance: {
        weight: {
          value: '63g',
          evidence: [{
            host: 'rtings.com',
            keyPath: 'specifications.weight',
            method: 'dom_xpath'
          }]
        }
      }
    });

    const synonyms = next.fields.weight?.synonyms || {};
    // 'dom xpath' is normalizeToken('dom_xpath') — should NOT be present
    assert.ok(!synonyms['dom xpath'], 'dom_xpath method not in synonyms');
    assert.ok(!synonyms['dom'], 'dom token not leaked from method');
  });

  it('ldjson method is NOT added as synonym', () => {
    const artifact = defaultFieldLexicon();
    const next = updateFieldLexicon({
      artifact,
      provenance: {
        sensor: {
          value: 'PAW3950',
          evidence: [{
            host: 'techpowerup.com',
            keyPath: 'specs.sensor_model',
            method: 'ldjson'
          }]
        }
      }
    });

    const synonyms = next.fields.sensor?.synonyms || {};
    assert.ok(!synonyms['ldjson'], 'ldjson method not in synonyms');
  });

  it('embedded_state method is NOT added as synonym', () => {
    const artifact = defaultFieldLexicon();
    const next = updateFieldLexicon({
      artifact,
      provenance: {
        dpi: {
          value: '30000',
          evidence: [{
            host: 'razer.com',
            keyPath: 'product.dpi_max',
            method: 'embedded_state'
          }]
        }
      }
    });

    const synonyms = next.fields.dpi?.synonyms || {};
    assert.ok(!synonyms['embedded state'], 'embedded_state method not in synonyms');
  });

  it('json_table method is NOT added as synonym', () => {
    const artifact = defaultFieldLexicon();
    const next = updateFieldLexicon({
      artifact,
      provenance: {
        weight: {
          value: '58g',
          evidence: [{
            host: 'eloshapes.com',
            keyPath: 'data.weight_grams',
            method: 'json_table'
          }]
        }
      }
    });

    const synonyms = next.fields.weight?.synonyms || {};
    assert.ok(!synonyms['json table'], 'json_table method not in synonyms');
  });

  it('metatag method is NOT added as synonym', () => {
    const artifact = defaultFieldLexicon();
    const next = updateFieldLexicon({
      artifact,
      provenance: {
        sensor: {
          value: 'Focus Pro 30K',
          evidence: [{
            host: 'razer.com',
            keyPath: 'meta.sensor',
            method: 'metatag'
          }]
        }
      }
    });

    const synonyms = next.fields.sensor?.synonyms || {};
    assert.ok(!synonyms['metatag'], 'metatag method not in synonyms');
  });

  it('css_selector method is NOT added as synonym', () => {
    const artifact = defaultFieldLexicon();
    const next = updateFieldLexicon({
      artifact,
      provenance: {
        polling_rate: {
          value: '8000 Hz',
          evidence: [{
            host: 'rtings.com',
            keyPath: 'review.polling_rate',
            method: 'css_selector'
          }]
        }
      }
    });

    const synonyms = next.fields.polling_rate?.synonyms || {};
    assert.ok(!synonyms['css selector'], 'css_selector method not in synonyms');
  });

  it('keyPath tokens ARE still added as synonyms', () => {
    const artifact = defaultFieldLexicon();
    const next = updateFieldLexicon({
      artifact,
      provenance: {
        weight: {
          value: '63g',
          evidence: [{
            host: 'rtings.com',
            keyPath: 'specifications.weight',
            method: 'dom_xpath'
          }]
        }
      }
    });

    const synonyms = next.fields.weight?.synonyms || {};
    assert.ok(synonyms['specifications'], 'keyPath token "specifications" is present');
    assert.ok(synonyms['weight'], 'keyPath token "weight" is present');
  });
});

// ── host tracking with registrable domains ──

describe('host tracking with registrable domains', () => {
  it('rtings.com and www.rtings.com count as 1 distinct domain', () => {
    const artifact = defaultFieldLexicon();
    const next = updateFieldLexicon({
      artifact,
      provenance: {
        weight: {
          value: '63g',
          evidence: [
            { host: 'rtings.com', keyPath: 'measurements.weight', method: 'dom_xpath' },
            { host: 'www.rtings.com', keyPath: 'measurements.weight', method: 'dom_xpath' }
          ]
        }
      }
    });

    const synonyms = next.fields.weight?.synonyms || {};
    const measurementsSynonym = synonyms['measurements'];
    assert.ok(measurementsSynonym, 'measurements synonym exists');
    const hostKeys = Object.keys(measurementsSynonym.hosts || {});
    assert.equal(hostKeys.length, 1, 'single registrable domain');
    assert.ok(hostKeys.includes('rtings.com'), 'registrable domain is rtings.com');
  });

  it('rtings.com and techpowerup.com count as 2 distinct domains', () => {
    const artifact = defaultFieldLexicon();
    const next = updateFieldLexicon({
      artifact,
      provenance: {
        weight: {
          value: '63g',
          evidence: [
            { host: 'rtings.com', keyPath: 'measurements.weight', method: 'dom_xpath' },
            { host: 'techpowerup.com', keyPath: 'review.weight', method: 'dom_xpath' }
          ]
        }
      }
    });

    const synonyms = next.fields.weight?.synonyms || {};
    const weightSynonym = synonyms['weight'];
    assert.ok(weightSynonym, 'weight synonym exists');
    const hostKeys = Object.keys(weightSynonym.hosts || {});
    assert.equal(hostKeys.length, 2, 'two distinct registrable domains');
  });
});

// ── count accumulation ──

describe('count accumulation', () => {
  it('same host twice increments count to 2', () => {
    const artifact = defaultFieldLexicon();
    const next = updateFieldLexicon({
      artifact,
      provenance: {
        weight: {
          value: '63g',
          evidence: [
            { host: 'rtings.com', keyPath: 'specs.weight', method: 'dom_xpath' },
            { host: 'rtings.com', keyPath: 'review.weight', method: 'dom_xpath' }
          ]
        }
      }
    });

    const synonyms = next.fields.weight?.synonyms || {};
    const weightSynonym = synonyms['weight'];
    assert.ok(weightSynonym, 'weight synonym exists');
    assert.equal(weightSynonym.count, 3, 'count is 3 (1 from field name + 2 from keyPath)');
    assert.equal(weightSynonym.hosts['rtings.com'], 2, 'host entry incremented to 2');
  });
});

// ── cross-host ranking ──

describe('cross-host synonym ranking', () => {
  it('multi-domain synonym outranks single-domain synonym with higher raw count', () => {
    const artifact = defaultFieldLexicon();

    // Build a lexicon where 'single_source_term' has count=10 from 1 host
    // and 'multi_source_term' has count=4 from 3 hosts
    // After host-diversity weighting, multi should rank higher
    const provenance = {
      weight: {
        value: '63g',
        evidence: []
      }
    };

    // 10 observations from single host
    for (let i = 0; i < 10; i++) {
      provenance.weight.evidence.push({
        host: 'singlehost.com',
        keyPath: 'narrowterm.weight',
        method: 'dom_xpath'
      });
    }

    const step1 = updateFieldLexicon({ artifact, provenance });

    // Now add 4 observations from 3 different hosts for a different keyPath
    const provenance2 = {
      weight: {
        value: '63g',
        evidence: [
          { host: 'alpha.com', keyPath: 'broadterm.weight', method: 'dom_xpath' },
          { host: 'beta.com', keyPath: 'broadterm.weight', method: 'dom_xpath' },
          { host: 'gamma.com', keyPath: 'broadterm.weight', method: 'dom_xpath' },
          { host: 'alpha.com', keyPath: 'broadterm.weight', method: 'dom_xpath' }
        ]
      }
    };

    const step2 = updateFieldLexicon({ artifact: step1, provenance: provenance2 });

    const synonyms = step2.fields.weight?.synonyms || {};
    const singleEntry = synonyms['narrowterm'];
    const multiEntry = synonyms['broadterm'];

    assert.ok(singleEntry, 'narrowterm exists');
    assert.ok(multiEntry, 'broadterm exists');

    // Verify raw counts: single has higher count
    assert.ok(singleEntry.count > multiEntry.count,
      `single count ${singleEntry.count} > multi count ${multiEntry.count}`);

    // Verify host diversity: multi has more distinct hosts
    const singleHosts = Object.keys(singleEntry.hosts || {}).length;
    const multiHosts = Object.keys(multiEntry.hosts || {}).length;
    assert.ok(multiHosts > singleHosts,
      `multi hosts ${multiHosts} > single hosts ${singleHosts}`);
  });
});
