import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  loadQueueState,
  syncQueueFromInputs
} from '../queueState.js';
import { withTempQueueStorage } from './helpers/queueStateHarness.js';

test('syncQueueFromInputs applies the identity gate and rejects conflicting variant files', async () => {
  await withTempQueueStorage('spec-harvester-queue-gate-', async ({ tempRoot, storage }) => {
    const helperRoot = path.join(tempRoot, 'category_authority');
    const category = 'mouse';
    const cpDir = path.join(helperRoot, category, '_control_plane');

    await fs.mkdir(cpDir, { recursive: true });
    await fs.writeFile(path.join(cpDir, 'product_catalog.json'), JSON.stringify({
      _version: 1,
      products: {
        'mouse-acer-cestus-310': {
          brand: 'Acer',
          model: 'Cestus 310',
          variant: ''
        }
      }
    }, null, 2), 'utf8');

    await storage.writeObject(
      'specs/inputs/mouse/products/mouse-acer-cestus-310.json',
      Buffer.from(JSON.stringify({
        productId: 'mouse-acer-cestus-310',
        category: 'mouse',
        identityLock: { brand: 'Acer', model: 'Cestus 310', variant: '' },
        seedUrls: [],
        anchors: {}
      }), 'utf8')
    );
    await storage.writeObject(
      'specs/inputs/mouse/products/mouse-acer-cestus-310-310.json',
      Buffer.from(JSON.stringify({
        productId: 'mouse-acer-cestus-310-310',
        category: 'mouse',
        identityLock: { brand: 'Acer', model: 'Cestus 310', variant: '310' },
        seedUrls: [],
        anchors: {}
      }), 'utf8')
    );

    const sync = await syncQueueFromInputs({
      storage,
      category,
      config: { categoryAuthorityRoot: helperRoot }
    });

    assert.equal(sync.added, 1);
    assert.equal(sync.rejected_by_identity_gate, 1);

    const loaded = await loadQueueState({ storage, category });
    assert.equal(Boolean(loaded.state.products['mouse-acer-cestus-310']), true);
    assert.equal(Boolean(loaded.state.products['mouse-acer-cestus-310-310']), false);
  });
});
