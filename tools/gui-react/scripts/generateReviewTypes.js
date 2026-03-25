// WHY: O(1) Feature Scaling — auto-generates TypeScript interfaces for review
// DTOs from backend shape descriptors. Adding a review field = add one {key, coerce}
// entry to the shape descriptor + run codegen. Zero manual TS edits.
//
// Usage: node tools/gui-react/scripts/generateReviewTypes.js
// Output: writes tools/gui-react/src/types/review.generated.ts
//         writes tools/gui-react/src/types/componentReview.generated.ts

import {
  FIELD_STATE_SELECTED_SHAPE,
  CANDIDATE_EVIDENCE_SHAPE,
  REVIEW_CANDIDATE_SHAPE,
  KEY_REVIEW_LANE_SHAPE,
  FIELD_STATE_SHAPE,
  REVIEW_LAYOUT_ROW_SHAPE,
  REVIEW_LAYOUT_SHAPE,
  RUN_METRICS_SHAPE,
  PRODUCTS_INDEX_RESPONSE_SHAPE,
  CANDIDATE_RESPONSE_SHAPE,
  PRODUCT_REVIEW_PAYLOAD_SHAPE,
  PRODUCT_IDENTITY_SHAPE,
  PRODUCT_METRICS_SHAPE,
} from '../../../src/features/review/contracts/reviewFieldContract.js';

import {
  COMPONENT_REVIEW_ITEM_SHAPE,
  COMPONENT_REVIEW_PAYLOAD_SHAPE,
  COMPONENT_REVIEW_LAYOUT_SHAPE,
  ENUM_VALUE_REVIEW_ITEM_SHAPE,
  ENUM_FIELD_REVIEW_SHAPE,
  ENUM_REVIEW_PAYLOAD_SHAPE,
  COMPONENT_REVIEW_FLAGGED_ITEM_SHAPE,
  COMPONENT_REVIEW_DOCUMENT_SHAPE,
  COMPONENT_REVIEW_BATCH_RESULT_SHAPE,
} from '../../../src/features/review/contracts/componentReviewShapes.js';

// ── Shared type coercion (same pattern as generateProductTypes.js) ──

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
      case 'unknown': return 'unknown';
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

function generateInterfaces(registry, header, imports = []) {
  const lines = [];
  lines.push('// AUTO-GENERATED from backend shape descriptors — do not edit manually.');
  lines.push('// Run: node tools/gui-react/scripts/generateReviewTypes.js');
  lines.push('//');
  for (const h of header) lines.push(`// ${h}`);
  lines.push('');
  for (const imp of imports) lines.push(imp);
  if (imports.length) lines.push('');

  for (const entry of registry) {
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

// ── Registry: review field types ────────────────────────────────────

const REVIEW_FIELD_REGISTRY = [
  { shape: FIELD_STATE_SELECTED_SHAPE, iface: 'FieldStateSelectedGen' },
  { shape: CANDIDATE_EVIDENCE_SHAPE, iface: 'CandidateEvidenceGen' },
  { shape: REVIEW_CANDIDATE_SHAPE, iface: 'ReviewCandidateGen' },
  { shape: KEY_REVIEW_LANE_SHAPE, iface: 'KeyReviewLaneStateGen' },
  { shape: FIELD_STATE_SHAPE, iface: 'FieldStateGen' },
  { shape: PRODUCT_IDENTITY_SHAPE, iface: 'ProductIdentityGen' },
  { shape: PRODUCT_METRICS_SHAPE, iface: 'ProductMetricsGen' },
  { shape: PRODUCT_REVIEW_PAYLOAD_SHAPE, iface: 'ProductReviewPayloadGen' },
  { shape: REVIEW_LAYOUT_ROW_SHAPE, iface: 'ReviewLayoutRowGen' },
  { shape: REVIEW_LAYOUT_SHAPE, iface: 'ReviewLayoutGen' },
  { shape: RUN_METRICS_SHAPE, iface: 'RunMetricsGen' },
  { shape: PRODUCTS_INDEX_RESPONSE_SHAPE, iface: 'ProductsIndexResponseGen' },
  { shape: CANDIDATE_RESPONSE_SHAPE, iface: 'CandidateResponseGen' },
];

// ── Registry: component review types ────────────────────────────────

const COMPONENT_REVIEW_REGISTRY = [
  { shape: COMPONENT_REVIEW_ITEM_SHAPE, iface: 'ComponentReviewItemGen' },
  { shape: COMPONENT_REVIEW_PAYLOAD_SHAPE, iface: 'ComponentReviewPayloadGen' },
  { shape: COMPONENT_REVIEW_LAYOUT_SHAPE, iface: 'ComponentReviewLayoutGen' },
  { shape: ENUM_VALUE_REVIEW_ITEM_SHAPE, iface: 'EnumValueReviewItemGen' },
  { shape: ENUM_FIELD_REVIEW_SHAPE, iface: 'EnumFieldReviewGen' },
  { shape: ENUM_REVIEW_PAYLOAD_SHAPE, iface: 'EnumReviewPayloadGen' },
  { shape: COMPONENT_REVIEW_FLAGGED_ITEM_SHAPE, iface: 'ComponentReviewFlaggedItemGen' },
  { shape: COMPONENT_REVIEW_DOCUMENT_SHAPE, iface: 'ComponentReviewDocumentGen' },
  { shape: COMPONENT_REVIEW_BATCH_RESULT_SHAPE, iface: 'ComponentReviewBatchResultGen' },
];

// ── Generate ────────────────────────────────────────────────────────

export function generateReviewFieldTypes() {
  return generateInterfaces(REVIEW_FIELD_REGISTRY, [
    'Shape descriptors live in:',
    '  src/features/review/contracts/reviewFieldContract.js',
  ]);
}

export function generateComponentReviewTypes() {
  // WHY: Component review shapes reference ReviewCandidateGen from review.generated.ts.
  const crossImports = [
    "import type { ReviewCandidateGen } from './review.generated.ts';",
  ];
  return generateInterfaces(COMPONENT_REVIEW_REGISTRY, [
    'Shape descriptors live in:',
    '  src/features/review/contracts/componentReviewShapes.js',
  ], crossImports);
}

// ── CLI ─────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const reviewOut = path.resolve(import.meta.dirname, '../src/types/review.generated.ts');
  const reviewContent = generateReviewFieldTypes();
  fs.writeFileSync(reviewOut, reviewContent, 'utf8');
  console.log(`Wrote ${reviewOut} (${reviewContent.split('\n').length} lines)`);

  const componentOut = path.resolve(import.meta.dirname, '../src/types/componentReview.generated.ts');
  const componentContent = generateComponentReviewTypes();
  fs.writeFileSync(componentOut, componentContent, 'utf8');
  console.log(`Wrote ${componentOut} (${componentContent.split('\n').length} lines)`);
}
