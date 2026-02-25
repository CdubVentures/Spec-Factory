import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STUDIO_PAGE = path.resolve('tools/gui-react/src/pages/studio/StudioPage.tsx');
const WORKBENCH_DRAWER = path.resolve('tools/gui-react/src/pages/studio/workbench/WorkbenchDrawer.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('deferred contract knobs are non-editable in studio surfaces', () => {
  const studioPageText = readText(STUDIO_PAGE);
  const workbenchDrawerText = readText(WORKBENCH_DRAWER);

  assert.equal(studioPageText.includes("contract.unknown_token"), true, 'Studio page should render unknown token control');
  assert.equal(studioPageText.includes("contract.rounding.mode"), true, 'Studio page should render rounding mode control');
  assert.equal(studioPageText.includes("contract.unknown_reason_required"), true, 'Studio page should render unknown reason required control');
  assert.equal(workbenchDrawerText.includes("contract.unknown_token"), true, 'Workbench drawer should render unknown token control');
  assert.equal(workbenchDrawerText.includes("contract.rounding.mode"), true, 'Workbench drawer should render rounding mode control');

  assert.equal(studioPageText.includes('const contractDeferredLocked = true;'), true, 'Studio page should define a deferred lock');
  assert.equal(workbenchDrawerText.includes('const contractDeferredLocked = true;'), true, 'Workbench drawer should define a deferred lock');

  const studioDisabledCount = (studioPageText.match(/disabled=\{contractDeferredLocked\}/g) || []).length;
  const drawerDisabledCount = (workbenchDrawerText.match(/disabled=\{contractDeferredLocked\}/g) || []).length;

  assert.ok(studioDisabledCount >= 3, `Studio page should lock all deferred contract knobs (found ${studioDisabledCount})`);
  assert.ok(drawerDisabledCount >= 2, `Workbench drawer should lock deferred contract knobs (found ${drawerDisabledCount})`);

  assert.equal(
    studioPageText.includes('Deferred: runtime wiring in progress'),
    true,
    'Studio page should explain deferred lock state',
  );
  assert.equal(
    workbenchDrawerText.includes('Deferred: runtime wiring in progress'),
    true,
    'Workbench drawer should explain deferred lock state',
  );
});
