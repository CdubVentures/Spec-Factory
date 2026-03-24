// WHY: O(1) Feature Scaling — auto-generates TypeScript interfaces for automation
// queue DTOs from backend shape descriptors. Adding a new field to the queue response =
// add one {key, coerce} entry to the shape descriptor + run codegen. Zero manual TS edits.
//
// Usage: node tools/gui-react/scripts/generateAutomationQueueTypes.js
// Output: writes tools/gui-react/src/features/indexing/types.generated.ts

import {
  AUTOMATION_JOB_SHAPE,
  AUTOMATION_ACTION_SHAPE,
  AUTOMATION_SUMMARY_SHAPE,
} from '../../../src/features/indexing/api/contracts/automationQueueContract.js';

const SHAPE_REGISTRY = [
  { shape: AUTOMATION_JOB_SHAPE, iface: 'AutomationJobRowGen' },
  { shape: AUTOMATION_ACTION_SHAPE, iface: 'AutomationActionRowGen' },
  { shape: AUTOMATION_SUMMARY_SHAPE, iface: 'AutomationSummaryGen' },
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
      default: return 'unknown';
    }
  })();
  if (descriptor.nullable && base !== 'unknown' && !base.includes('null')) {
    return `${base} | null`;
  }
  return base;
}

export function generateAutomationQueueTypes() {
  const lines = [];

  lines.push('// AUTO-GENERATED from backend shape descriptors — do not edit manually.');
  lines.push('// Run: node tools/gui-react/scripts/generateAutomationQueueTypes.js');
  lines.push('//');
  lines.push('// Shape descriptors live in:');
  lines.push('//   src/features/indexing/api/contracts/automationQueueContract.js');
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
    '../src/features/indexing/types.generated.ts',
  );
  const content = generateAutomationQueueTypes();
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote ${outPath} (${content.split('\n').length} lines)`);
}
