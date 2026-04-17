/**
 * releaseDateLlmAdapter — prompt builder + discovery log accumulation tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReleaseDateFinderPrompt,
  accumulateVariantDiscoveryLog,
  RDF_DEFAULT_TEMPLATE,
} from '../releaseDateLlmAdapter.js';

describe('buildReleaseDateFinderPrompt', () => {
  const product = { brand: 'Logitech', model: 'G Pro X', base_model: 'G Pro X', variant: 'wireless' };

  it('includes brand, model, and variant label in the prompt', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black', variantType: 'color',
    });
    assert.ok(prompt.includes('Logitech'), 'brand present');
    assert.ok(prompt.includes('G Pro X'), 'model present');
    assert.ok(prompt.includes('Black'), 'variant label present');
    assert.ok(prompt.includes('color variant'), 'variant type inline');
  });

  it('distinguishes edition variants from colors', () => {
    const colorPrompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Midnight Black', variantType: 'color',
    });
    const editionPrompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'CoD: BO6 Edition', variantType: 'edition',
    });
    assert.ok(colorPrompt.includes('color variant'));
    assert.ok(editionPrompt.includes('edition'));
  });

  it('injects sibling exclusion list', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black', variantType: 'color',
      siblingsExcluded: ['G Pro', 'G Pro X Superlight'],
    });
    assert.ok(prompt.includes('G Pro'));
    assert.ok(prompt.includes('G Pro X Superlight'));
    assert.ok(prompt.includes('sibling') || prompt.includes('EXCLUDE'), 'sibling intent called out');
  });

  it('omits sibling block when no siblings provided', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black', variantType: 'color',
      siblingsExcluded: [],
    });
    assert.ok(!prompt.includes('to EXCLUDE'), 'no exclude banner when list is empty');
  });

  it('scales identity warning with ambiguity level', () => {
    const easy = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black', ambiguityLevel: 'easy' });
    const medium = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black', ambiguityLevel: 'medium', familyModelCount: 4 });
    const hard = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black', ambiguityLevel: 'hard', familyModelCount: 8 });
    assert.ok(easy.includes('no known siblings'));
    assert.ok(medium.includes('CAUTION'));
    assert.ok(hard.includes('HIGH AMBIGUITY'));
  });

  it('includes previous discovery block when urls_checked present', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black',
      previousDiscovery: { urlsChecked: ['https://example.com/a'], queriesRun: ['logitech g pro x release'] },
    });
    assert.ok(prompt.includes('Previous searches'));
    assert.ok(prompt.includes('https://example.com/a'));
    assert.ok(prompt.includes('logitech g pro x release'));
  });

  it('omits previous discovery when empty', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black',
      previousDiscovery: { urlsChecked: [], queriesRun: [] },
    });
    assert.ok(!prompt.includes('Previous searches'));
  });

  it('uses templateOverride when supplied', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black',
      templateOverride: 'CUSTOM PROMPT FOR {{BRAND}} {{MODEL}}',
    });
    assert.equal(prompt, 'CUSTOM PROMPT FOR Logitech G Pro X');
  });

  it('default template contains the JSON output specification', () => {
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black' });
    assert.ok(prompt.includes('"release_date"'));
    assert.ok(prompt.includes('"confidence"'));
    assert.ok(prompt.includes('"evidence"'));
    assert.ok(prompt.includes('"discovery_log"'));
  });

  it('default template names accepted date formats', () => {
    assert.ok(RDF_DEFAULT_TEMPLATE.includes('YYYY-MM-DD'));
    assert.ok(RDF_DEFAULT_TEMPLATE.includes('YYYY-MM'));
    assert.ok(RDF_DEFAULT_TEMPLATE.includes('YYYY'));
    assert.ok(RDF_DEFAULT_TEMPLATE.includes('unk'));
  });
});

describe('accumulateVariantDiscoveryLog', () => {
  const runs = [
    {
      ran_at: '2026-01-01T00:00:00Z',
      response: {
        variant_id: 'v_black', variant_key: 'color:black',
        discovery_log: { urls_checked: ['u1'], queries_run: ['q1'] },
      },
    },
    {
      ran_at: '2026-02-01T00:00:00Z',
      response: {
        variant_id: 'v_black', variant_key: 'color:black',
        discovery_log: { urls_checked: ['u2'], queries_run: ['q2'] },
      },
    },
    {
      ran_at: '2026-02-01T00:00:00Z',
      response: {
        variant_id: 'v_white', variant_key: 'color:white',
        discovery_log: { urls_checked: ['u3'], queries_run: ['q3'] },
      },
    },
  ];

  it('unions urls and queries for matching variant', () => {
    const acc = accumulateVariantDiscoveryLog(runs, 'color:black', 'v_black');
    assert.deepEqual(acc.urlsChecked.sort(), ['u1', 'u2']);
    assert.deepEqual(acc.queriesRun.sort(), ['q1', 'q2']);
  });

  it('matches by variant_id first, falls back to variant_key', () => {
    const acc = accumulateVariantDiscoveryLog(runs, 'color:black', null);
    assert.ok(acc.urlsChecked.includes('u1'));
    assert.ok(acc.urlsChecked.includes('u2'));
    assert.ok(!acc.urlsChecked.includes('u3'));
  });

  it('excludes other variants', () => {
    const acc = accumulateVariantDiscoveryLog(runs, 'color:white', 'v_white');
    assert.deepEqual(acc.urlsChecked, ['u3']);
  });

  it('respects urlCutoffIso for urls only', () => {
    const acc = accumulateVariantDiscoveryLog(runs, 'color:black', 'v_black', {
      urlCutoffIso: '2026-01-15T00:00:00Z',
    });
    assert.deepEqual(acc.urlsChecked, ['u2'], 'old urls filtered by cutoff');
    assert.deepEqual(acc.queriesRun.sort(), ['q1', 'q2'], 'queries unaffected by url cutoff');
  });

  it('respects queryCutoffIso for queries only', () => {
    const acc = accumulateVariantDiscoveryLog(runs, 'color:black', 'v_black', {
      queryCutoffIso: '2026-01-15T00:00:00Z',
    });
    assert.deepEqual(acc.queriesRun, ['q2'], 'old queries filtered by cutoff');
    assert.deepEqual(acc.urlsChecked.sort(), ['u1', 'u2'], 'urls unaffected by query cutoff');
  });

  it('returns empty when no runs match', () => {
    const acc = accumulateVariantDiscoveryLog([], 'color:black', 'v_black');
    assert.deepEqual(acc.urlsChecked, []);
    assert.deepEqual(acc.queriesRun, []);
  });
});
