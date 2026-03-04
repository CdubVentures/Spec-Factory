import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REVIEW_CURATION_ENTRY = path.resolve('src/features/review-curation/index.js');
const GUI_SERVER = path.resolve('src/api/guiServer.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('review-curation feature contract exports review runtime capabilities', async () => {
  assert.equal(fs.existsSync(REVIEW_CURATION_ENTRY), true, 'feature entrypoint should exist');
  const reviewCuration = await import(pathToFileURL(REVIEW_CURATION_ENTRY).href);

  assert.equal(typeof reviewCuration.buildReviewLayout, 'function');
  assert.equal(typeof reviewCuration.buildReviewQueue, 'function');
  assert.equal(typeof reviewCuration.buildComponentReviewLayout, 'function');
  assert.equal(typeof reviewCuration.setOverrideFromCandidate, 'function');
  assert.equal(typeof reviewCuration.applySharedLaneState, 'function');
  assert.equal(typeof reviewCuration.cascadeComponentChange, 'function');
});

test('gui server review capabilities consume review-curation feature contract', () => {
  const guiServerText = readText(GUI_SERVER);

  assert.equal(
    guiServerText.includes("from '../features/review-curation/index.js'"),
    true,
    'gui server should import review capabilities from feature contract',
  );
  assert.equal(
    guiServerText.includes("from '../review/reviewGridData.js'"),
    false,
    'gui server should not import review grid internals directly after contract wiring',
  );
  assert.equal(
    guiServerText.includes("from '../review/componentReviewData.js'"),
    false,
    'gui server should not import component review internals directly after contract wiring',
  );
  assert.equal(
    guiServerText.includes("from '../review/overrideWorkflow.js'"),
    false,
    'gui server should not import override workflow internals directly after contract wiring',
  );
});
