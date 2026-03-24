import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchProfile,
  makeCategoryConfig,
  makeJob,
} from './helpers/phase02SearchProfileHarness.js';

function makeArchetypeConfig() {
  return makeCategoryConfig({
    sourceRegistry: {
      rtings_com: {
        display_name: 'RTINGS',
        base_url: 'https://www.rtings.com',
        content_types: ['review', 'benchmark'],
        field_coverage: {
          high: ['click_latency', 'weight', 'sensor'],
          medium: ['polling_rate', 'dpi'],
          low: []
        },
        discovery: { source_type: 'lab_review', priority: 98, enabled: true }
      },
      techpowerup_com: {
        display_name: 'TechPowerUp',
        base_url: 'https://www.techpowerup.com',
        content_types: ['review'],
        field_coverage: {
          high: ['sensor', 'lift', 'switch'],
          medium: ['weight', 'dpi'],
          low: []
        },
        discovery: { source_type: 'lab_review', priority: 94, enabled: true }
      },
      eloshapes_com: {
        display_name: 'EloShapes',
        base_url: 'https://www.eloshapes.com',
        content_types: ['spec_database'],
        field_coverage: {
          high: ['weight', 'sensor'],
          medium: ['dpi', 'connection'],
          low: []
        },
        discovery: { source_type: 'spec_database', priority: 60, enabled: true }
      }
    },
    fieldRules: {
      fields: {
        weight: {
          required_level: 'critical',
          search_hints: { query_terms: ['weight grams'], domain_hints: ['razer.com'], preferred_content_types: ['spec'] }
        },
        sensor: {
          required_level: 'critical',
          search_hints: { query_terms: ['optical sensor model'], domain_hints: ['techpowerup.com'], preferred_content_types: ['teardown_review', 'lab_review'] }
        },
        click_latency: {
          required_level: 'required',
          search_hints: { query_terms: ['click latency ms'], domain_hints: ['rtings.com'], preferred_content_types: ['lab_review', 'benchmark'] }
        },
        dpi: {
          required_level: 'expected',
          search_hints: { query_terms: ['max dpi'], preferred_content_types: ['spec'] }
        },
        polling_rate: {
          required_level: 'critical',
          search_hints: { query_terms: ['polling rate hz'], preferred_content_types: ['spec'] }
        },
        switch: {
          required_level: 'expected',
          search_hints: { query_terms: ['mouse switch type'], domain_hints: ['techpowerup.com'], preferred_content_types: ['teardown_review'] }
        },
        connection: {
          required_level: 'expected',
          search_hints: { query_terms: ['wireless connectivity'], preferred_content_types: ['spec'] }
        }
      }
    }
  });
}

describe('Phase 02 - Archetype Integration', () => {
  it('emits four or more distinct domain hints when many fields are missing', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeArchetypeConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate', 'switch', 'connection'],
      maxQueries: 48,
      seedStatus: {
        specs_seed: { is_needed: true },
        source_seeds: {
          'rtings.com': { is_needed: true },
          'techpowerup.com': { is_needed: true },
          'eloshapes.com': { is_needed: true },
        },
      },
      brandResolution: {
        officialDomain: 'razer.com',
        aliases: [],
      },
      focusGroups: [],
    });

    const domainHints = new Set(profile.query_rows.map((row) => row.domain_hint).filter(Boolean));
    assert.ok(domainHints.size >= 4, `expected 4+ distinct domain_hints, got ${domainHints.size}: ${[...domainHints]}`);
  });

  it('seed rows have doc_hint=spec', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeArchetypeConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: 48,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: [],
    });

    const docHints = new Set(profile.query_rows.map((row) => row.doc_hint).filter(Boolean));
    assert.ok(docHints.size >= 1, `expected at least 1 doc_hint, got ${docHints.size}: ${[...docHints]}`);
    assert.ok(docHints.has('spec'), 'seed row has doc_hint=spec');
  });

  it('does not emit duplicate host-biased queries for the same host', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeArchetypeConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: 48,
      seedStatus: {
        specs_seed: { is_needed: true },
        source_seeds: {
          'razer.com': { is_needed: true },
          'rtings.com': { is_needed: true },
        },
      },
      brandResolution: {
        officialDomain: 'razer.com',
        aliases: [],
      },
      focusGroups: [],
    });

    const hostBiasedRows = profile.query_rows.filter((row) => row.domain_hint);
    const seen = new Map();
    for (const row of hostBiasedRows) {
      const host = row.domain_hint;
      if (seen.has(host)) {
        const previousQuery = seen.get(host);
        assert.notEqual(row.query, previousQuery, `exact duplicate query for host ${host}`);
      }
      seen.set(host, row.query);
    }

    assert.ok(seen.size > 0, 'at least one host-biased query exists');
  });

  it('keeps base_templates populated when brand and model are present', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeArchetypeConfig(),
      missingFields: ['weight'],
      maxQueries: 24
    });

    assert.ok(profile.base_templates.length > 0, 'base_templates is non-empty');
  });

  it('removes archetype_summary from tier-only output', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeArchetypeConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: 48,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: [],
    });

    assert.equal(profile.archetype_summary, undefined, 'archetype_summary no longer in output');
    assert.equal(profile.coverage_analysis, undefined, 'coverage_analysis no longer in output');
  });
});
