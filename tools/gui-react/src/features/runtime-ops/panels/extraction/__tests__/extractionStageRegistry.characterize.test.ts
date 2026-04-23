// Characterization tests — lock current behavior of the extraction stage
// data (keys, meta, selectProps) before the Phase 1a refactor. Post-refactor
// EXTRACTION_SELECT_PROPS + EXTRACTION_SECTION_META become auto-generated
// from EXTRACTION_STAGE_DEFS, but the observable shape for screenshot + video
// must not change.
//
// Required per CLAUDE.md Decomposition Safety Rule: "Write characterization
// tests first when coverage is missing — these capture current behavior and
// are the safety net for extraction."
//
// Does NOT import extractionStageRegistry.ts — that file pulls in React
// panel components (.tsx) which Node's native TS runner cannot load. The
// registry's assembly logic (buildStageEntry composition) is structural glue
// tested transitively via runtime; the data layer is what the refactor moves.

import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import {
  EXTRACTION_STAGE_KEYS,
  EXTRACTION_STAGE_META,
  EXTRACTION_SELECT_PROPS,
} from '../extractionStageKeys.generated.ts';

describe('EXTRACTION_STAGE_KEYS (characterization)', () => {
  it('begins with the Phase 1a baseline [screenshot, video] in order', () => {
    // Post-Phase-1b additions (crawl4ai, etc.) append after this prefix.
    strictEqual(EXTRACTION_STAGE_KEYS[0], 'screenshot');
    strictEqual(EXTRACTION_STAGE_KEYS[1], 'video');
  });

  it('has no duplicate keys', () => {
    const set = new Set<string>(EXTRACTION_STAGE_KEYS);
    strictEqual(set.size, EXTRACTION_STAGE_KEYS.length);
  });
});

describe('EXTRACTION_STAGE_META (characterization)', () => {
  it('screenshot meta is labelled Screenshots with info tone', () => {
    const meta = EXTRACTION_STAGE_META.screenshot;
    strictEqual(meta.label, 'Screenshots');
    strictEqual(meta.tone, 'info');
    ok(meta.tip.length > 0, 'screenshot tip is non-empty');
  });

  it('video meta is labelled Videos with info tone', () => {
    const meta = EXTRACTION_STAGE_META.video;
    strictEqual(meta.label, 'Videos');
    strictEqual(meta.tone, 'info');
    ok(meta.tip.length > 0, 'video tip is non-empty');
  });
});

describe('EXTRACTION_SELECT_PROPS (characterization)', () => {
  it('returns the expected shape for screenshot when data is populated', () => {
    const props = EXTRACTION_SELECT_PROPS.screenshot({
      data: {
        plugins: {
          screenshot: { entries: [{ url: 'https://x' } as unknown as never], total: 1 },
          video: { entries: [], total: 0 },
        },
      } as never,
      persistScope: 'scope-a',
      runId: 'run-1',
    });
    deepStrictEqual(props, {
      data: { entries: [{ url: 'https://x' }], total: 1 },
      persistScope: 'scope-a',
      runId: 'run-1',
    });
  });

  it('returns empty-plugin fallback for video when ctx.data is undefined', () => {
    const props = EXTRACTION_SELECT_PROPS.video({
      data: undefined,
      persistScope: 'scope-b',
      runId: undefined,
    });
    deepStrictEqual(props, {
      data: { entries: [], total: 0 },
      persistScope: 'scope-b',
      runId: '',
    });
  });
});

describe('Extraction data layer integrity (characterization)', () => {
  it('every stage key has a corresponding META entry', () => {
    for (const key of EXTRACTION_STAGE_KEYS) {
      ok(EXTRACTION_STAGE_META[key], `META missing for ${key}`);
    }
  });

  it('every stage key has a corresponding SELECT_PROPS entry', () => {
    for (const key of EXTRACTION_STAGE_KEYS) {
      ok(EXTRACTION_SELECT_PROPS[key], `SELECT_PROPS missing for ${key}`);
      strictEqual(typeof EXTRACTION_SELECT_PROPS[key], 'function');
    }
  });

  it('SELECT_PROPS record has no keys outside EXTRACTION_STAGE_KEYS', () => {
    const keySet = new Set<string>(EXTRACTION_STAGE_KEYS);
    for (const k of Object.keys(EXTRACTION_SELECT_PROPS)) {
      ok(keySet.has(k), `unexpected SELECT_PROPS key: ${k}`);
    }
  });
});
