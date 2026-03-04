import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SEARCH_PROFILE_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/SearchProfilePanel.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('search profile header omits phase suffix and status/provider badges', () => {
  const panelText = readText(SEARCH_PROFILE_PANEL);

  assert.equal(
    panelText.includes('Search Profile'),
    true,
    'search profile panel should keep the search profile header title',
  );
  assert.equal(
    panelText.includes('Search Profile (Phase 02)'),
    false,
    'search profile panel should not include phase suffix labels',
  );
  assert.equal(
    panelText.includes("sp?.status && sp.status !== 'executed'"),
    false,
    'search profile header should not render status badge chip',
  );
  assert.equal(
    panelText.includes('provider && ('),
    false,
    'search profile header should not render provider badge chip',
  );
  assert.equal(
    panelText.includes('statusBadgeClass('),
    false,
    'search profile panel should not define/consume status badge helper for header badges',
  );
  assert.equal(
    panelText.includes('providerBadgeClass('),
    false,
    'search profile panel should not define/consume provider badge helper for header badges',
  );
});
