import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  VIEW_PROMPT_DEFAULTS,
  GENERIC_VIEW_PROMPT_DEFAULTS,
  VIEW_PROMPT_ROLES,
  viewPromptSettingKey,
  resolveViewPrompt,
} from '../viewPromptDefaults.js';
import { CATEGORY_VIEW_DEFAULTS, CANONICAL_VIEW_KEYS } from '../productImageLlmAdapter.js';

/* ── Registry invariants ────────────────────────────────────────── */

describe('VIEW_PROMPT_DEFAULTS', () => {
  it('covers mouse, monitor, keyboard', () => {
    assert.deepEqual(
      Object.keys(VIEW_PROMPT_DEFAULTS).sort(),
      ['keyboard', 'monitor', 'mouse'],
    );
  });

  it('every category × view has all three roles defined', () => {
    for (const [category, viewMap] of Object.entries(VIEW_PROMPT_DEFAULTS)) {
      for (const [view, roleMap] of Object.entries(viewMap)) {
        for (const role of VIEW_PROMPT_ROLES) {
          assert.ok(
            typeof roleMap[role] === 'string' && roleMap[role].length > 0,
            `${category}.${view}.${role} must be a non-empty string`,
          );
        }
      }
    }
  });

  it('seeds (loop, priority, additional) identically for each category × view', () => {
    for (const viewMap of Object.values(VIEW_PROMPT_DEFAULTS)) {
      for (const roleMap of Object.values(viewMap)) {
        assert.equal(roleMap.loop, roleMap.priority);
        assert.equal(roleMap.priority, roleMap.additional);
      }
    }
  });

  it('seeds match the CATEGORY_VIEW_DEFAULTS descriptions byte-for-byte', () => {
    for (const [category, entries] of Object.entries(CATEGORY_VIEW_DEFAULTS)) {
      const seedMap = VIEW_PROMPT_DEFAULTS[category];
      assert.ok(seedMap, `missing seed for ${category}`);
      for (const entry of entries) {
        const seeded = seedMap[entry.key];
        assert.ok(seeded, `missing seed for ${category}.${entry.key}`);
        assert.equal(seeded.priority, entry.description);
        assert.equal(seeded.loop, entry.description);
        assert.equal(seeded.additional, entry.description);
      }
    }
  });
});

describe('GENERIC_VIEW_PROMPT_DEFAULTS', () => {
  it('covers all 8 canonical views with all 3 roles', () => {
    for (const key of CANONICAL_VIEW_KEYS) {
      assert.ok(GENERIC_VIEW_PROMPT_DEFAULTS[key], `missing generic for ${key}`);
      for (const role of VIEW_PROMPT_ROLES) {
        assert.ok(
          typeof GENERIC_VIEW_PROMPT_DEFAULTS[key][role] === 'string',
          `${key}.${role} should be a string`,
        );
      }
    }
  });
});

/* ── viewPromptSettingKey ───────────────────────────────────────── */

describe('viewPromptSettingKey', () => {
  it('composes role + view into the storage key', () => {
    assert.equal(viewPromptSettingKey('loop', 'top'), 'loopViewPrompt_top');
    assert.equal(viewPromptSettingKey('priority', 'left'), 'priorityViewPrompt_left');
    assert.equal(viewPromptSettingKey('additional', 'angle'), 'additionalViewPrompt_angle');
  });

  it('returns empty string for bad role', () => {
    assert.equal(viewPromptSettingKey('bogus', 'top'), '');
  });

  it('returns empty string for bad view', () => {
    assert.equal(viewPromptSettingKey('loop', 'bogus'), '');
  });
});

/* ── resolveViewPrompt ──────────────────────────────────────────── */

describe('resolveViewPrompt', () => {
  it('DB override wins over category + generic', () => {
    const r = resolveViewPrompt({
      role: 'priority', category: 'mouse', view: 'top',
      dbOverride: 'CUSTOM TOP PRIORITY',
    });
    assert.equal(r, 'CUSTOM TOP PRIORITY');
  });

  it('empty DB override falls through to category default', () => {
    const r = resolveViewPrompt({
      role: 'priority', category: 'mouse', view: 'top', dbOverride: '',
    });
    assert.equal(r, VIEW_PROMPT_DEFAULTS.mouse.top.priority);
  });

  it('whitespace-only DB override falls through to category default', () => {
    const r = resolveViewPrompt({
      role: 'priority', category: 'mouse', view: 'top', dbOverride: '   \n  ',
    });
    assert.equal(r, VIEW_PROMPT_DEFAULTS.mouse.top.priority);
  });

  it('unknown category falls back to generic', () => {
    const r = resolveViewPrompt({
      role: 'priority', category: 'spaceship', view: 'top',
    });
    assert.equal(r, GENERIC_VIEW_PROMPT_DEFAULTS.top.priority);
  });

  it('unknown role returns empty string', () => {
    const r = resolveViewPrompt({ role: 'wat', category: 'mouse', view: 'top' });
    assert.equal(r, '');
  });

  it('unknown view returns empty string', () => {
    const r = resolveViewPrompt({ role: 'priority', category: 'mouse', view: 'wat' });
    assert.equal(r, '');
  });

  it('distinct roles return identical defaults (byte-identity preservation)', () => {
    const loop = resolveViewPrompt({ role: 'loop', category: 'mouse', view: 'top' });
    const prio = resolveViewPrompt({ role: 'priority', category: 'mouse', view: 'top' });
    const add  = resolveViewPrompt({ role: 'additional', category: 'mouse', view: 'top' });
    assert.equal(loop, prio);
    assert.equal(prio, add);
  });
});
