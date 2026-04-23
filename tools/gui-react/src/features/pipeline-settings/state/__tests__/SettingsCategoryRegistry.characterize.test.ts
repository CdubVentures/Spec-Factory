// Characterization tests — lock current behavior of the extraction category
// in SETTINGS_CATEGORY_REGISTRY before the Phase 1a refactor. Post-refactor
// the extraction sections become derived (from the backend settings registry
// grouped by uiSection, enriched with stage-def metadata), but the observable
// shape for existing screenshot + video sections must not change.
//
// Required per CLAUDE.md Decomposition Safety Rule.

import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import { SETTINGS_CATEGORY_REGISTRY, findCategory, findSection } from '../SettingsCategoryRegistry.ts';

describe('SETTINGS_CATEGORY_REGISTRY extraction category (characterization)', () => {
  const extraction = SETTINGS_CATEGORY_REGISTRY.find((c) => c.id === 'extraction');

  it('exists with id="extraction"', () => {
    ok(extraction, 'extraction category must be present');
  });

  it('has label "Runtime Extraction"', () => {
    strictEqual(extraction!.label, 'Runtime Extraction');
  });

  it('has a non-empty subtitle', () => {
    ok(extraction!.subtitle.length > 0);
  });

  it('leads with the Phase 1a baseline sections [screenshots, video] in order', () => {
    // Post-Phase-1b plugins (crawl4ai, etc.) append after this prefix.
    const ids = extraction!.sections.map((s) => s.id);
    strictEqual(ids[0], 'screenshots');
    strictEqual(ids[1], 'video');
  });

  it('screenshots section: label "Screenshots", no customComponent', () => {
    const s = findSection('extraction', 'screenshots')!;
    strictEqual(s.label, 'Screenshots');
    strictEqual(s.customComponent, undefined);
    ok(s.tip.length > 0, 'screenshots section tip is non-empty');
  });

  it('video section: label "Video Recording", customComponent "VideoRecording"', () => {
    const s = findSection('extraction', 'video')!;
    strictEqual(s.label, 'Video Recording');
    strictEqual(s.customComponent, 'VideoRecording');
    ok(s.tip.length > 0, 'video section tip is non-empty');
  });
});

describe('findCategory / findSection (characterization)', () => {
  it('findCategory("extraction") returns the extraction entry', () => {
    const c = findCategory('extraction');
    ok(c, 'extraction category resolvable');
    strictEqual(c!.id, 'extraction');
  });

  it('findSection returns undefined for unknown section id', () => {
    strictEqual(findSection('extraction', 'does-not-exist'), undefined);
  });
});
