#!/usr/bin/env node
// scripts/audits/component-orphan-check.js
//
// Phase 4 — one-time pre-merge migration + audit.
//
// Scans every category's compiled field_rules.json + control-plane field_studio_map.json,
// reports INV-1/2/3 violations, and (with --apply) auto-clears cross-lock
// contamination from `field_overrides[<key>].enum_source` when the ref points
// at a component_db type that does not equal <key>.
//
// Modes:
//   --dry-run    Report what would be cleared. Default if neither flag passed.
//   --apply      Mutate field_studio_map.json files in place.
//
// Exit:
//   0   All clean OR all violations cleanly auto-fixable in --apply mode.
//   1   Unfixable violations remain (INV-1/INV-3 orphans need manual fix).
//
// Not added to any test suite. After running with --apply, recompile each
// category via the GUI's Run IndexLab button.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CATEGORY_AUTHORITY_ROOT = path.join(REPO_ROOT, 'category_authority');

const args = new Set(process.argv.slice(2));
const APPLY_MODE = args.has('--apply');
const DELETE_ORPHANS = args.has('--delete-orphans');
const DRY_RUN = !APPLY_MODE; // default

// Lightweight reimplementation of the invariant logic so the script does NOT
// require the compile pipeline's full dependency tree to load. Mirrors
// runComponentInvariantChecks in src/ingest/compileValidation.js.

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function toArray(v) {
  return Array.isArray(v) ? v : [];
}

function normKey(s) {
  if (typeof s !== 'string') return '';
  return s.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

function readSourceRows(map) {
  if (!isObject(map)) return [];
  if (Array.isArray(map.component_sources) && map.component_sources.length > 0) {
    return map.component_sources;
  }
  return toArray(map.component_sheets);
}

function buildSourcesByType(map) {
  const out = new Map();
  for (const row of readSourceRows(map)) {
    if (!isObject(row)) continue;
    const type = normKey(row.component_type || row.type || '');
    if (type && !out.has(type)) out.set(type, row);
  }
  return out;
}

function declaredPropertyKeys(map) {
  const out = new Set();
  for (const row of readSourceRows(map)) {
    if (!isObject(row)) continue;
    const roles = isObject(row.roles) ? row.roles : {};
    for (const prop of toArray(roles.properties)) {
      if (!isObject(prop)) continue;
      // WHY: component_only properties stay scoped to the component DB; they
      // do NOT promote to product fields, so don't require a field rule.
      if (prop.component_only === true) continue;
      const k = normKey(prop.field_key || prop.key || prop.property_key || '');
      if (k) out.add(k);
    }
  }
  return out;
}

function ruleEnumDbRefs(rule) {
  // Returns array of normalized refs from any component_db source on the rule.
  // Looks at enum.source, enum_source (string), and enum_source object form.
  const refs = [];
  if (!isObject(rule)) return refs;
  const enumBlock = isObject(rule.enum) ? rule.enum : null;
  if (enumBlock && typeof enumBlock.source === 'string' && enumBlock.source.startsWith('component_db.')) {
    refs.push(normKey(enumBlock.source.slice('component_db.'.length)));
  }
  if (typeof rule.enum_source === 'string' && rule.enum_source.startsWith('component_db.')) {
    refs.push(normKey(rule.enum_source.slice('component_db.'.length)));
  } else if (isObject(rule.enum_source) && rule.enum_source.type === 'component_db') {
    refs.push(normKey(rule.enum_source.ref || ''));
  }
  return refs.filter(Boolean);
}

function runInvariants({ fields, map }) {
  const errors = [];
  const fieldsObj = isObject(fields) ? fields : {};
  const sourcesByType = buildSourcesByType(map);

  // INV-1
  for (const [type] of sourcesByType) {
    const rule = fieldsObj[type];
    if (!isObject(rule)) {
      errors.push(`INV-1: component_sources[${type}] has no matching field rule "${type}"`);
      continue;
    }
    const refs = ruleEnumDbRefs(rule);
    if (!refs.includes(type)) {
      errors.push(`INV-1: field rule "${type}" missing enum.source = component_db.${type}`);
    }
  }

  // INV-2
  for (const [fieldKey, rule] of Object.entries(fieldsObj)) {
    if (!isObject(rule)) continue;
    for (const ref of ruleEnumDbRefs(rule)) {
      if (ref !== fieldKey) {
        errors.push(`INV-2: field "${fieldKey}" cross-locks to component_db.${ref} (must self-lock)`);
        continue;
      }
      if (!sourcesByType.has(ref)) {
        errors.push(`INV-2: field "${fieldKey}" enum.source = component_db.${ref} but no component_sources entry`);
      }
    }
  }

  // INV-3
  for (const propKey of declaredPropertyKeys(map)) {
    if (!fieldsObj[propKey]) {
      errors.push(`INV-3: property field_key "${propKey}" has no matching field rule`);
    }
  }

  return errors;
}

// ── Orphan component_sources row removal ─────────────────────────────────────
// Removes component_sources rows whose component_type has no matching field rule.
// Use with care — this is destructive (loses the component definition).

function removeOrphanSources(map, fields) {
  const removed = [];
  if (!isObject(map) || !Array.isArray(map.component_sources)) return { removed, changed: false };
  const fieldsObj = isObject(fields) ? fields : {};
  const before = map.component_sources;
  const kept = [];
  for (const row of before) {
    if (!isObject(row)) { kept.push(row); continue; }
    const type = normKey(row.component_type || row.type || '');
    if (type && !fieldsObj[type]) {
      removed.push({ component_type: type, sheet: row.sheet || '', property_count: (isObject(row.roles) ? toArray(row.roles.properties) : []).length });
      continue;
    }
    kept.push(row);
  }
  if (removed.length === 0) return { removed, changed: false };
  map.component_sources = kept;
  return { removed, changed: true };
}

// ── Cross-lock auto-fix on field_overrides ───────────────────────────────────

function clearCrossLocksInOverrides(map) {
  // Returns { cleared: [{key, path, before}], changed }
  const cleared = [];
  if (!isObject(map) || !isObject(map.field_overrides)) return { cleared, changed: false };
  for (const [key, override] of Object.entries(map.field_overrides)) {
    if (!isObject(override)) continue;
    // Nested enum.source
    if (isObject(override.enum) && typeof override.enum.source === 'string' && override.enum.source.startsWith('component_db.')) {
      const ref = normKey(override.enum.source.slice('component_db.'.length));
      if (ref && ref !== key) {
        cleared.push({ key, path: 'enum.source', before: override.enum.source });
        delete override.enum.source;
        if (Object.keys(override.enum).length === 0) delete override.enum;
      }
    }
    // Flat string enum_source
    if (typeof override.enum_source === 'string' && override.enum_source.startsWith('component_db.')) {
      const ref = normKey(override.enum_source.slice('component_db.'.length));
      if (ref && ref !== key) {
        cleared.push({ key, path: 'enum_source', before: override.enum_source });
        delete override.enum_source;
      }
    }
    // Object enum_source
    if (isObject(override.enum_source) && override.enum_source.type === 'component_db') {
      const ref = normKey(override.enum_source.ref || '');
      if (ref && ref !== key) {
        cleared.push({ key, path: 'enum_source', before: JSON.stringify(override.enum_source) });
        delete override.enum_source;
      }
    }
  }
  return { cleared, changed: cleared.length > 0 };
}

async function readJson(p) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeJson(p, obj) {
  // Stable indent matching existing artifacts.
  const text = JSON.stringify(obj, null, 2) + '\n';
  await fs.writeFile(p, text, 'utf8');
}

async function listCategories() {
  const entries = await fs.readdir(CATEGORY_AUTHORITY_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort();
}

function fmtViolations(errors) {
  if (errors.length === 0) return '  ✓ clean';
  return errors.map((e) => `  • ${e}`).join('\n');
}

async function main() {
  const categories = await listCategories();
  console.log(`Phase 4 component-orphan-check (${APPLY_MODE ? 'APPLY' : 'DRY-RUN'})\n`);
  console.log(`Scanning ${categories.length} categories under ${CATEGORY_AUTHORITY_ROOT}\n`);

  let totalClearedCount = 0;
  let totalUnfixableCount = 0;
  const reports = [];

  for (const category of categories) {
    const rulesPath = path.join(CATEGORY_AUTHORITY_ROOT, category, '_generated', 'field_rules.json');
    const mapPath = path.join(CATEGORY_AUTHORITY_ROOT, category, '_control_plane', 'field_studio_map.json');

    const rulesDoc = await readJson(rulesPath);
    const map = await readJson(mapPath);

    if (!rulesDoc || !map) {
      reports.push({ category, status: 'skipped', reason: !rulesDoc ? 'no field_rules.json' : 'no field_studio_map.json' });
      continue;
    }

    // WHY: field_rules.json wraps the per-field map under `.fields`. The
    // compile pipeline passes the flat map directly, but the on-disk artifact
    // is wrapped — handle both.
    const rules = isObject(rulesDoc.fields) ? rulesDoc.fields : rulesDoc;

    // Pre-fix audit
    const preErrors = runInvariants({ fields: rules, map });

    // Cross-lock detection on field_overrides
    const { cleared, changed: changedCrossLocks } = clearCrossLocksInOverrides(map);
    totalClearedCount += cleared.length;

    // Orphan component_sources removal (only when --delete-orphans is set)
    let removedOrphans = [];
    let changedOrphans = false;
    if (DELETE_ORPHANS) {
      const orphanResult = removeOrphanSources(map, rules);
      removedOrphans = orphanResult.removed;
      changedOrphans = orphanResult.changed;
    }

    const changed = changedCrossLocks || changedOrphans;
    if (APPLY_MODE && changed) {
      await writeJson(mapPath, map);
    }

    // Post-fix audit. NOTE: post audit runs against the same compiled rules
    // (the rules need a recompile to re-derive from the cleaned map). The
    // pre-fix violations that disappear here are the ones the override-clear
    // alone resolves; remaining violations require either manual fix or a
    // recompile to clear.
    const postErrors = runInvariants({ fields: rules, map });

    const fixable = preErrors.length - postErrors.length;
    const unfixable = postErrors.filter((e) => !e.startsWith('INV-2:'));
    totalUnfixableCount += unfixable.length;

    reports.push({
      category,
      status: cleared.length > 0 || removedOrphans.length > 0 || preErrors.length > 0 ? 'attention' : 'clean',
      cleared,
      removedOrphans,
      preErrors,
      postErrors,
      fixable,
      unfixable,
    });
  }

  for (const r of reports) {
    console.log(`── ${r.category} ──`);
    if (r.status === 'skipped') {
      console.log(`  (skipped: ${r.reason})\n`);
      continue;
    }
    if (r.cleared && r.cleared.length > 0) {
      console.log(`  ${APPLY_MODE ? 'CLEARED' : 'WOULD CLEAR'} ${r.cleared.length} cross-lock(s) in field_overrides:`);
      for (const c of r.cleared) {
        console.log(`    ${c.key}.${c.path} = ${c.before}`);
      }
    }
    if (r.removedOrphans && r.removedOrphans.length > 0) {
      console.log(`  ${APPLY_MODE ? 'REMOVED' : 'WOULD REMOVE'} ${r.removedOrphans.length} orphan component_sources row(s):`);
      for (const o of r.removedOrphans) {
        console.log(`    component_type="${o.component_type}" sheet="${o.sheet}" properties=${o.property_count}`);
      }
    }
    if (r.preErrors.length === 0 && (!r.cleared || r.cleared.length === 0) && (!r.removedOrphans || r.removedOrphans.length === 0)) {
      console.log('  ✓ clean');
    } else {
      console.log(`  Pre-fix violations: ${r.preErrors.length}`);
      console.log(fmtViolations(r.preErrors));
      if (r.unfixable && r.unfixable.length > 0) {
        console.log(`  Still unfixable after auto-clear (manual action needed):`);
        console.log(fmtViolations(r.unfixable));
      }
    }
    console.log('');
  }

  const totalRemovedOrphans = reports.reduce((acc, r) => acc + (r.removedOrphans?.length || 0), 0);

  console.log('─'.repeat(60));
  console.log(`Total cross-locks ${APPLY_MODE ? 'cleared' : 'detected'}: ${totalClearedCount}`);
  if (DELETE_ORPHANS) {
    console.log(`Total orphan component_sources rows ${APPLY_MODE ? 'removed' : 'detected'}: ${totalRemovedOrphans}`);
  }
  console.log(`Total unfixable violations: ${totalUnfixableCount}`);
  if (APPLY_MODE && totalClearedCount > 0) {
    console.log('\nNext step: recompile each affected category via the GUI Run IndexLab button.');
  } else if (DRY_RUN && totalClearedCount > 0) {
    console.log('\nRun with --apply to clear cross-locks. Then recompile via the GUI.');
  }

  process.exit(totalUnfixableCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
