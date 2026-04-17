// WHY: Creates the initial product.json at {productRoot}/{pid}/product.json
// when a product is added to the system. This is the rebuild SSOT — one file per
// product that grows over its lifetime (sources merge in after runs, fields after review).
// Does NOT overwrite an existing file — safe for re-add / idempotent calls.
//
// productRoot is REQUIRED. Callers must resolve the path explicitly. There is no
// silent default — a previous default caused tests to write into the real
// .workspace/products/ and polluted production data.

import fs from 'node:fs';
import path from 'node:path';

export function writeProductIdentity({
  productId,
  category,
  identity = {},
  identifier,
  productRoot,
}) {
  if (!productRoot) {
    throw new Error('writeProductIdentity requires productRoot');
  }
  const productDir = path.join(productRoot, productId);
  const productPath = path.join(productDir, 'product.json');

  if (fs.existsSync(productPath)) {
    return { productPath, created: false };
  }

  const now = new Date().toISOString();
  const output = {
    schema_version: 1,
    checkpoint_type: 'product',
    product_id: String(productId || ''),
    category: String(category || ''),
    identity: {
      brand: String(identity.brand || ''),
      base_model: String(identity.base_model || ''),
      model: String(identity.model || ''),
      variant: String(identity.variant || ''),
      brand_identifier: String(identity.brand_identifier || ''),
      identifier: String(identifier || identity.identifier || ''),
      status: String(identity.status || 'active'),
    },
    latest_run_id: '',
    runs_completed: 0,
    sources: [],
    fields: {},
    provenance: {},
    created_at: now,
    updated_at: now,
  };

  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(productPath, JSON.stringify(output, null, 2), 'utf8');

  return { productPath, created: true };
}
