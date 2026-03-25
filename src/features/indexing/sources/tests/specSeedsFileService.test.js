import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  defaultSpecSeeds,
  validateSpecSeeds,
  readSpecSeedsFile,
  writeSpecSeedsFile,
} from '../specSeedsFileService.js';

describe('specSeedsFileService', () => {
  let tmpRoot;

  before(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-seeds-test-'));
  });

  after(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('defaultSpecSeeds returns the canonical fallback', () => {
    const seeds = defaultSpecSeeds();
    assert.deepEqual(seeds, ['{product} specifications']);
  });

  it('validateSpecSeeds accepts a valid array of strings', () => {
    const result = validateSpecSeeds(['{product} specs', '{brand} {model} datasheet']);
    assert.equal(result.valid, true);
  });

  it('validateSpecSeeds rejects non-array', () => {
    assert.equal(validateSpecSeeds('not an array').valid, false);
    assert.equal(validateSpecSeeds(null).valid, false);
    assert.equal(validateSpecSeeds(42).valid, false);
  });

  it('validateSpecSeeds rejects array with non-string entries', () => {
    assert.equal(validateSpecSeeds(['{product} specs', 42]).valid, false);
    assert.equal(validateSpecSeeds(['{product} specs', '']).valid, false);
  });

  it('readSpecSeedsFile returns default when file missing', async () => {
    const result = await readSpecSeedsFile(tmpRoot, 'nonexistent');
    assert.deepEqual(result, defaultSpecSeeds());
  });

  it('writeSpecSeedsFile + readSpecSeedsFile round-trips', async () => {
    const seeds = ['{product} specifications', '{brand} {model} datasheet pdf'];
    await writeSpecSeedsFile(tmpRoot, 'roundtrip_cat', seeds);
    const result = await readSpecSeedsFile(tmpRoot, 'roundtrip_cat');
    assert.deepEqual(result, seeds);
  });

  it('writeSpecSeedsFile rejects invalid data', async () => {
    await assert.rejects(
      () => writeSpecSeedsFile(tmpRoot, 'bad_cat', 'not an array'),
      /Invalid spec seeds/,
    );
  });

  it('readSpecSeedsFile returns default for corrupted JSON', async () => {
    const dir = path.join(tmpRoot, 'corrupt_cat');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec_seeds.json'), '{"not": "an array"}', 'utf8');
    const result = await readSpecSeedsFile(tmpRoot, 'corrupt_cat');
    assert.deepEqual(result, defaultSpecSeeds());
  });
});
