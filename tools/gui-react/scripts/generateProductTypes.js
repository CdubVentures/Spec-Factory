// WHY: O(1) Feature Scaling — auto-generates TypeScript interfaces for catalog/product
// DTOs from backend shape descriptors. Adding a product field = add one {key, coerce}
// entry to the shape descriptor + run codegen. Zero manual TS edits.
//
// Usage: node tools/gui-react/scripts/generateProductTypes.js
// Output: writes tools/gui-react/src/types/product.generated.ts

import {
  RENAME_HISTORY_ENTRY_SHAPE,
  BRAND_RENAME_HISTORY_ENTRY_SHAPE,
  CATALOG_PRODUCT_SHAPE,
  CATALOG_ROW_SHAPE,
  BRAND_SHAPE,
} from '../../../src/features/catalog/contracts/catalogShapes.js';

import {
  PRODUCT_SUMMARY_SHAPE,
  QUEUE_PRODUCT_SHAPE,
} from '../../../src/features/catalog/contracts/productShapes.js';

const SHAPE_REGISTRY = [
  { shape: RENAME_HISTORY_ENTRY_SHAPE, iface: 'RenameHistoryEntryGen' },
  { shape: BRAND_RENAME_HISTORY_ENTRY_SHAPE, iface: 'BrandRenameHistoryEntryGen' },
  { shape: CATALOG_PRODUCT_SHAPE, iface: 'CatalogProductGen' },
  { shape: CATALOG_ROW_SHAPE, iface: 'CatalogRowGen' },
  { shape: BRAND_SHAPE, iface: 'BrandGen' },
  { shape: PRODUCT_SUMMARY_SHAPE, iface: 'ProductSummaryGen' },
  { shape: QUEUE_PRODUCT_SHAPE, iface: 'QueueProductGen' },
];

function tsType(descriptor) {
  if (descriptor.literals) {
    const union = descriptor.literals.map(v => `'${v}'`).join(' | ');
    return descriptor.nullable ? `(${union}) | null` : union;
  }
  const base = (() => {
    switch (descriptor.coerce) {
      case 'string': return 'string';
      case 'int':
      case 'float': return 'number';
      case 'bool': return 'boolean';
      case 'array': {
        if (descriptor.itemRef) return `${descriptor.itemRef}[]`;
        if (descriptor.itemType) return `${descriptor.itemType}[]`;
        return 'unknown[]';
      }
      case 'object': return 'Record<string, unknown>';
      case 'object_or_null': return 'Record<string, unknown> | null';
      default: return 'unknown';
    }
  })();
  if (descriptor.nullable && base !== 'unknown' && !base.includes('null')) {
    return `${base} | null`;
  }
  return base;
}

export function generateProductTypes() {
  const lines = [];

  lines.push('// AUTO-GENERATED from backend shape descriptors — do not edit manually.');
  lines.push('// Run: node tools/gui-react/scripts/generateProductTypes.js');
  lines.push('//');
  lines.push('// Shape descriptors live in:');
  lines.push('//   src/features/catalog/contracts/catalogShapes.js');
  lines.push('//   src/features/catalog/contracts/productShapes.js');
  lines.push('');

  for (const entry of SHAPE_REGISTRY) {
    lines.push(`export interface ${entry.iface} {`);
    for (const d of entry.shape) {
      const opt = d.optional ? '?' : '';
      lines.push(`  ${d.key}${opt}: ${tsType(d)};`);
    }
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

// ── CLI ──
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const outPath = path.resolve(
    import.meta.dirname,
    '../src/types/product.generated.ts',
  );
  const content = generateProductTypes();
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote ${outPath} (${content.split('\n').length} lines)`);
}
