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

    // WHY: syncQueueFromInputs now reads products from specDb instead of fixture files.
    const queueRows = new Map();
    const mockSpecDb = {
      getAllProducts: () => [
        { product_id: 'mouse-acer-cestus-310', brand: 'Acer', model: 'Cestus 310', variant: '' },
        { product_id: 'mouse-acer-cestus-310-310', brand: 'Acer', model: 'Cestus 310', variant: '310' },
      ],
      getAllQueueProducts: () => [...queueRows.values()],
      getQueueProduct: (pid) => queueRows.get(pid) || null,
      upsertQueueProduct: (row) => { queueRows.set(row.product_id, row); },
      db: { transaction: (fn) => fn },
    };

    const sync = await syncQueueFromInputs({
      storage,
      category,
      specDb: mockSpecDb,
      config: { categoryAuthorityRoot: helperRoot }
    });

    assert.equal(sync.added, 1);
    assert.equal(sync.rejected_by_identity_gate, 1);

    const loaded = await loadQueueState({ storage, category, specDb: mockSpecDb });
    assert.equal(Boolean(loaded.state.products['mouse-acer-cestus-310']), true);
    assert.equal(Boolean(loaded.state.products['mouse-acer-cestus-310-310']), false);
  });
});
