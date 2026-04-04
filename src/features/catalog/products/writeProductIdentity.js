// WHY: Creates the initial product.json at .workspace/products/{pid}/product.json
// when a product is added to the system. This is the rebuild SSOT — one file per
// product that grows over its lifetime (sources merge in after runs, fields after review).
// Does NOT overwrite an existing file — safe for re-add / idempotent calls.

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';

export function writeProductIdentity({
  productId,
  category,
  identity = {},
  seedUrls,
  identifier,
  productRoot,
}) {
  const resolvedRoot = productRoot || defaultProductRoot();
  const productDir = path.join(resolvedRoot, productId);
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
      seed_urls: Array.isArray(seedUrls) ? seedUrls : [],
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
