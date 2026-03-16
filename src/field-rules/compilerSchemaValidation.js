/**
 * Schema validation, artifact comparison, and migration metadata validation.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import semver from 'semver';
import { isObject, toArray, normalizeFieldKey, nonEmptyString } from './compilerPrimitives.js';
import {
  SHARED_SCHEMA_FILES, stableStringify, stripVolatileKeys, hashFileWithMeta,
  readJsonIfExists, fileExists, ensureSharedSchemaPack, listJsonFilesRecursive
} from './compilerFileOps.js';

export function schemaErrorToText(row = {}) {
  const pathToken = String(row.instancePath || row.schemaPath || '/').trim() || '/';
  const message = String(row.message || 'validation error').trim();
  return `${pathToken}: ${message}`;
}

export async function jsonEqualsIgnoringVolatile(leftPath, rightPath) {
  const [leftRaw, rightRaw] = await Promise.all([
    fs.readFile(leftPath, 'utf8'),
    fs.readFile(rightPath, 'utf8')
  ]);
  let leftParsed = null;
  let rightParsed = null;
  try {
    leftParsed = JSON.parse(leftRaw);
    rightParsed = JSON.parse(rightRaw);
  } catch {
    return leftRaw === rightRaw;
  }
  return stableStringify(stripVolatileKeys(leftParsed)) === stableStringify(stripVolatileKeys(rightParsed));
}

export async function compareGeneratedArtifacts({ existingRoot, candidateRoot }) {
  const existingFiles = await listJsonFilesRecursive(existingRoot);
  const candidateFiles = await listJsonFilesRecursive(candidateRoot);
  const existingRelative = new Set(existingFiles.map((file) => path.relative(existingRoot, file).replace(/\\/g, '/')));
  const candidateRelative = new Set(candidateFiles.map((file) => path.relative(candidateRoot, file).replace(/\\/g, '/')));
  const all = [...new Set([...existingRelative, ...candidateRelative])]
    .filter((rel) => !rel.endsWith('_compile_report.json'))
    .sort((a, b) => a.localeCompare(b));

  const changes = [];
  for (const rel of all) {
    const leftPath = path.join(existingRoot, rel);
    const rightPath = path.join(candidateRoot, rel);
    const [leftExists, rightExists] = await Promise.all([
      fileExists(leftPath),
      fileExists(rightPath)
    ]);
    if (!leftExists && rightExists) {
      changes.push({ path: rel, type: 'added' });
      continue;
    }
    if (leftExists && !rightExists) {
      changes.push({ path: rel, type: 'removed' });
      continue;
    }
    const same = await jsonEqualsIgnoringVolatile(leftPath, rightPath);
    if (!same) {
      changes.push({ path: rel, type: 'modified' });
    }
  }
  return {
    would_change: changes.length > 0,
    changes
  };
}

export async function verifyGeneratedManifest({
  generatedRoot,
  manifest = {}
}) {
  if (!isObject(manifest) || !Array.isArray(manifest.artifacts)) {
    return {
      valid: false,
      errors: ['manifest.json missing artifacts array']
    };
  }
  const errors = [];
  for (const row of manifest.artifacts) {
    const relativePath = String(row?.path || '').trim();
    const expectedHash = String(row?.sha256 || '').trim().toLowerCase();
    if (!relativePath || !expectedHash) {
      errors.push(`manifest row missing path/hash: ${stableStringify(row)}`);
      continue;
    }
    const filePath = path.join(generatedRoot, relativePath);
    if (!(await fileExists(filePath))) {
      errors.push(`manifest references missing file: ${relativePath}`);
      continue;
    }
    const actual = await hashFileWithMeta(filePath);
    if (actual.sha256 !== expectedHash) {
      errors.push(`manifest hash mismatch: ${relativePath}`);
    }
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateKeyMigrationsMetadata(keyMigrations = {}) {
  const errors = [];
  const warnings = [];
  if (!isObject(keyMigrations)) {
    errors.push('key_migrations.json is not a JSON object');
    return { valid: false, errors, warnings };
  }

  const hasDocShape = Array.isArray(keyMigrations.migrations);
  if (!hasDocShape) {
    warnings.push('key_migrations.json is in legacy key-map shape (migrations array missing)');
    return { valid: true, errors, warnings };
  }

  const version = String(keyMigrations.version || '').trim();
  const previousVersion = String(keyMigrations.previous_version || '').trim();
  if (!semver.valid(semver.coerce(version))) {
    errors.push(`invalid key_migrations version: '${version || '(empty)'}'`);
  }
  if (!semver.valid(semver.coerce(previousVersion))) {
    errors.push(`invalid key_migrations previous_version: '${previousVersion || '(empty)'}'`);
  }
  if (!isObject(keyMigrations.key_map)) {
    warnings.push('key_migrations key_map missing or invalid');
  }

  for (const row of keyMigrations.migrations) {
    const type = String(row?.type || '').trim().toLowerCase();
    if (!type) {
      errors.push('key_migrations migration row missing type');
      continue;
    }
    if (type === 'rename') {
      const from = normalizeFieldKey(row?.from);
      const to = normalizeFieldKey(row?.to);
      if (!from || !to || from === to) {
        errors.push(`key_migrations rename invalid: from='${row?.from || ''}' to='${row?.to || ''}'`);
      }
    }
    if (type === 'merge') {
      const to = normalizeFieldKey(row?.to);
      const fromList = toArray(row?.from).map((value) => normalizeFieldKey(value)).filter(Boolean);
      if (!to || fromList.length < 2) {
        warnings.push(`key_migrations merge should include >=2 sources: to='${row?.to || ''}'`);
      }
    }
    if (type === 'split') {
      const from = normalizeFieldKey(row?.from);
      const toList = toArray(row?.to).map((value) => normalizeFieldKey(value)).filter(Boolean);
      if (!from || toList.length < 2) {
        warnings.push(`key_migrations split should include >=2 targets: from='${row?.from || ''}'`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export async function validateArtifactsWithSchemas({
  generatedRoot,
  helperRoot,
  artifacts = {},
  componentFiles = []
}) {
  const schemaProvision = await ensureSharedSchemaPack(helperRoot);
  const sharedRoot = schemaProvision.shared_root;
  const fileEntries = [
    ['field_rules.json', artifacts.fieldRules],
    ['ui_field_catalog.json', artifacts.uiFieldCatalog],
    ['known_values.json', artifacts.knownValues],
    ['parse_templates.json', artifacts.parseTemplates],
    ['cross_validation_rules.json', artifacts.crossValidation],
    ['field_groups.json', artifacts.fieldGroups],
    ['key_migrations.json', artifacts.keyMigrations]
  ];

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false
  });
  addFormats(ajv);

  const results = [];
  const schemaLoadWarnings = [];
  for (const [artifactName, payload] of fileEntries) {
    if (!payload) {
      continue;
    }
    const schemaFile = SHARED_SCHEMA_FILES[artifactName];
    if (!schemaFile) {
      continue;
    }
    const schemaPath = path.join(sharedRoot, schemaFile);
    const schema = await readJsonIfExists(schemaPath);
    if (!schema) {
      schemaLoadWarnings.push(`missing schema file: ${schemaPath}`);
      continue;
    }
    const validate = ajv.compile(schema);
    const valid = Boolean(validate(payload));
    results.push({
      artifact: artifactName,
      schema: schemaFile,
      valid,
      errors: valid ? [] : toArray(validate.errors).map((row) => schemaErrorToText(row))
    });
  }

  const componentSchemaFile = SHARED_SCHEMA_FILES.component_db;
  const componentSchemaPath = path.join(sharedRoot, componentSchemaFile);
  const componentSchema = await readJsonIfExists(componentSchemaPath);
  if (!componentSchema) {
    schemaLoadWarnings.push(`missing schema file: ${componentSchemaPath}`);
  } else {
    const validate = ajv.compile(componentSchema);
    for (const filePath of componentFiles) {
      const payload = await readJsonIfExists(filePath);
      if (!payload) {
        continue;
      }
      const relativePath = path.relative(generatedRoot, filePath).replace(/\\/g, '/');
      const valid = Boolean(validate(payload));
      results.push({
        artifact: relativePath,
        schema: componentSchemaFile,
        valid,
        errors: valid ? [] : toArray(validate.errors).map((row) => schemaErrorToText(row))
      });
    }
  }

  const invalid = results.filter((row) => row.valid === false);
  return {
    valid: invalid.length === 0 && schemaLoadWarnings.length === 0,
    shared_root: sharedRoot,
    copied_schema_files: schemaProvision.copied,
    missing_schema_files: schemaProvision.missing,
    warnings: schemaLoadWarnings,
    artifacts: results
  };
}

export function mapArtifactsToList(generatedRoot) {
  return [
    path.join(generatedRoot, 'field_rules.json'),
    path.join(generatedRoot, 'ui_field_catalog.json'),
    path.join(generatedRoot, 'known_values.json'),
    path.join(generatedRoot, 'parse_templates.json'),
    path.join(generatedRoot, 'cross_validation_rules.json'),
    path.join(generatedRoot, 'field_groups.json'),
    path.join(generatedRoot, 'key_migrations.json'),
    path.join(generatedRoot, 'manifest.json'),
    path.join(generatedRoot, 'component_db')
  ];
}
