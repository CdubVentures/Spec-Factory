#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CATEGORY_AUTHORITY_ROOT = path.join(REPO_ROOT, 'category_authority');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const DRY_RUN = args.has('--dry-run') || !APPLY;

const TOP_LEVEL_RETIRED_KEYS = [
  'type',
  'mode',
  'sheet',
  'header_row',
  'first_data_row',
  'start_row',
  'row_end',
  'stop_after_blank_primary',
  'stop_after_blank_names',
  'auto_derive_aliases',
  'primary_identifier_column',
  'maker_column',
  'canonical_name_column',
  'name_column',
  'brand_column',
  'alias_columns',
  'link_columns',
  'property_columns',
];

const ROLE_RETIRED_KEYS = ['primary_identifier', 'maker', 'aliases', 'links'];
const PROPERTY_RETIRED_KEYS = ['key', 'property_key', 'column', 'col'];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProperty(property) {
  if (!isObject(property)) return null;
  const next = { ...property };
  for (const key of PROPERTY_RETIRED_KEYS) delete next[key];
  if (!next.field_key && property.key) next.field_key = property.key;
  if (Array.isArray(next.constraints) && next.constraints.length === 0) delete next.constraints;
  if (next.tolerance === null || next.tolerance === undefined) delete next.tolerance;
  if (next.component_only !== true) delete next.component_only;
  return next.field_key ? next : null;
}

function normalizeComponentSource(row) {
  if (!isObject(row)) return null;
  const componentType = String(row.component_type || row.type || '').trim();
  if (!componentType) return null;
  const roles = isObject(row.roles) ? row.roles : {};
  const properties = Array.isArray(roles.properties)
    ? roles.properties.map(normalizeProperty).filter(Boolean)
    : [];
  const next = {
    component_type: componentType,
    roles: { properties },
  };
  if (isObject(row.priority)) next.priority = row.priority;
  if (isObject(row.ai_assist)) next.ai_assist = row.ai_assist;
  return next;
}

function countRetiredFields(map) {
  let count = Array.isArray(map.component_sheets) ? 1 : 0;
  for (const rule of Object.values(isObject(map.field_overrides) ? map.field_overrides : {})) {
    if (isObject(rule?.field_studio_hints) && 'component_sheet' in rule.field_studio_hints) count += 1;
  }
  for (const row of Array.isArray(map.component_sources) ? map.component_sources : []) {
    if (!isObject(row)) continue;
    count += TOP_LEVEL_RETIRED_KEYS.filter((key) => key in row).length;
    const roles = isObject(row.roles) ? row.roles : {};
    count += ROLE_RETIRED_KEYS.filter((key) => key in roles).length;
    for (const property of Array.isArray(roles.properties) ? roles.properties : []) {
      if (!isObject(property)) continue;
      count += PROPERTY_RETIRED_KEYS.filter((key) => key in property).length;
      if (Array.isArray(property.constraints) && property.constraints.length === 0) count += 1;
      if (property.tolerance === null) count += 1;
      if (property.component_only === false) count += 1;
    }
  }
  return count;
}

function stripRetiredComponentHints(map) {
  if (!isObject(map.field_overrides)) return;
  for (const rule of Object.values(map.field_overrides)) {
    if (!isObject(rule?.field_studio_hints)) continue;
    delete rule.field_studio_hints.component_sheet;
    if (Object.keys(rule.field_studio_hints).length === 0) {
      delete rule.field_studio_hints;
    }
  }
}

async function main() {
  const categories = await fs.readdir(CATEGORY_AUTHORITY_ROOT, { withFileTypes: true });
  let changed = 0;
  for (const entry of categories.filter((item) => item.isDirectory())) {
    const mapPath = path.join(CATEGORY_AUTHORITY_ROOT, entry.name, '_control_plane', 'field_studio_map.json');
    let raw = '';
    try {
      raw = await fs.readFile(mapPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    const beforeBytes = Buffer.byteLength(raw);
    const map = JSON.parse(raw);
    const retiredCount = countRetiredFields(map);
    delete map.component_sheets;
    stripRetiredComponentHints(map);
    map.component_sources = Array.isArray(map.component_sources)
      ? map.component_sources.map(normalizeComponentSource).filter(Boolean)
      : [];
    const nextRaw = `${JSON.stringify(map, null, 2)}\n`;
    const afterBytes = Buffer.byteLength(nextRaw);
    const didChange = nextRaw !== raw;
    if (didChange) changed += 1;
    console.log(`${entry.name}: retired_fields=${retiredCount} bytes=${beforeBytes}->${afterBytes}${didChange ? '' : ' unchanged'}`);
    if (APPLY && didChange) {
      const tempPath = `${mapPath}.tmp`;
      await fs.writeFile(tempPath, nextRaw, 'utf8');
      await fs.rename(tempPath, mapPath);
    }
  }
  console.log(`${DRY_RUN ? 'dry-run' : 'apply'} complete; files_changed=${changed}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
