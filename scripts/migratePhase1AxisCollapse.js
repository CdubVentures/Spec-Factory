#!/usr/bin/env node
// WHY: One-shot migration — collapse Field Studio axis vocabulary per
// plans/phase-1-axis-simplification.md. Rewrites every required_level,
// availability, difficulty, and effort occurrence in category_authority/**
// source JSON. Idempotent: safe to run multiple times.
//
// Mapping:
//   required_level: identity|critical|required → mandatory
//                   expected|optional|editorial|commerce → non_mandatory
//   availability:   expected → always
//                   editorial_only → rare
//                   (always|sometimes|rare unchanged)
//   difficulty:     instrumented → very_hard
//                   (easy|medium|hard unchanged; very_hard passes through)
//   effort:         DELETED (from top-level and from priority.effort)
//
// Usage:
//   node scripts/migratePhase1AxisCollapse.js               # dry-run (default)
//   node scripts/migratePhase1AxisCollapse.js --commit      # write changes

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const REQUIRED_LEVEL_MAP = {
  identity: 'mandatory',
  critical: 'mandatory',
  required: 'mandatory',
  expected: 'non_mandatory',
  optional: 'non_mandatory',
  editorial: 'non_mandatory',
  commerce: 'non_mandatory',
};

const AVAILABILITY_MAP = {
  expected: 'always',
  editorial_only: 'rare',
};

const DIFFICULTY_MAP = {
  instrumented: 'very_hard',
};

const CATEGORY_ROOT = resolve(process.cwd(), 'category_authority');
const commit = process.argv.includes('--commit');

const counters = {
  files_scanned: 0,
  files_changed: 0,
  required_level_migrated: 0,
  availability_migrated: 0,
  difficulty_migrated: 0,
  effort_deleted: 0,
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function migrateValue(value, map, counterKey) {
  if (typeof value !== 'string') return value;
  const mapped = map[value];
  if (mapped && mapped !== value) {
    counters[counterKey] += 1;
    return mapped;
  }
  return value;
}

function migrateObject(node) {
  if (Array.isArray(node)) {
    return node.map(migrateObject);
  }
  if (!isPlainObject(node)) {
    return node;
  }
  const result = {};
  for (const [key, rawValue] of Object.entries(node)) {
    let value = rawValue;
    if (key === 'required_level') {
      value = migrateValue(value, REQUIRED_LEVEL_MAP, 'required_level_migrated');
    } else if (key === 'availability') {
      value = migrateValue(value, AVAILABILITY_MAP, 'availability_migrated');
    } else if (key === 'difficulty') {
      value = migrateValue(value, DIFFICULTY_MAP, 'difficulty_migrated');
    } else if (key === 'effort') {
      counters.effort_deleted += 1;
      continue;
    }
    result[key] = migrateObject(value);
  }
  return result;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (stat.isFile() && entry.endsWith('.json')) {
      files.push(full);
    }
  }
  return files;
}

function migrateFile(filePath) {
  counters.files_scanned += 1;
  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`skip ${filePath}: ${err.message}`);
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return;
  }
  const before = {
    required_level_migrated: counters.required_level_migrated,
    availability_migrated: counters.availability_migrated,
    difficulty_migrated: counters.difficulty_migrated,
    effort_deleted: counters.effort_deleted,
  };
  const migrated = migrateObject(parsed);
  const changed = (
    counters.required_level_migrated > before.required_level_migrated
    || counters.availability_migrated > before.availability_migrated
    || counters.difficulty_migrated > before.difficulty_migrated
    || counters.effort_deleted > before.effort_deleted
  );
  if (!changed) return;
  counters.files_changed += 1;
  const rel = relative(process.cwd(), filePath);
  console.log(`${commit ? 'write' : 'dry'}: ${rel}`);
  if (commit) {
    writeFileSync(filePath, `${JSON.stringify(migrated, null, 2)}\n`, 'utf8');
  }
}

function main() {
  const files = walk(CATEGORY_ROOT);
  for (const file of files) {
    migrateFile(file);
  }
  console.log('\n── migration summary ──');
  console.log(JSON.stringify(counters, null, 2));
  console.log(commit ? '\n[COMMITTED]' : '\n[DRY-RUN] — pass --commit to write changes');
}

main();
