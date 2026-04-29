import {
  readConsolidatedOverrides,
  writeConsolidatedOverrides,
} from '../../../shared/consolidatedOverrides.js';
import { normalizeKnownValueMatchKey, nowIso } from '../../../shared/primitives.js';

function componentOverrideKey(name, maker) {
  return `${normalizeKnownValueMatchKey(name)}::${normalizeKnownValueMatchKey(maker)}`;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function identityMatches(identity, name, maker) {
  return componentOverrideKey(identity?.canonical_name, identity?.maker) === componentOverrideKey(name, maker);
}

function findExistingKey(entries, oldName, oldMaker) {
  for (const [key, entry] of Object.entries(entries || {})) {
    if (identityMatches(entry?.current, oldName, oldMaker)) return key;
    if (identityMatches(entry?.previous, oldName, oldMaker)) return key;
  }
  return componentOverrideKey(oldName, oldMaker);
}

export async function mirrorComponentIdentityOverride({
  config = {},
  category,
  componentType,
  oldName,
  oldMaker,
  nextName,
  nextMaker,
  source = 'user',
}) {
  const typeKey = String(componentType || '').trim();
  const priorName = String(oldName || '').trim();
  const priorMaker = String(oldMaker || '').trim();
  const currentName = String(nextName || '').trim();
  const currentMaker = String(nextMaker || '').trim();
  if (!category || !typeKey || !priorName || !currentName) {
    return { changed: false, path: null };
  }

  const envelope = await readConsolidatedOverrides({ config, category });
  const components = isObject(envelope.components) ? envelope.components : {};
  const typeEntries = isObject(components[typeKey]) ? components[typeKey] : {};
  const key = findExistingKey(typeEntries, priorName, priorMaker);
  const existing = isObject(typeEntries[key]) ? typeEntries[key] : null;
  const setAt = nowIso();

  components[typeKey] = {
    ...typeEntries,
    [key]: {
      component_type: typeKey,
      previous: existing?.previous || {
        canonical_name: priorName,
        maker: priorMaker,
      },
      current: {
        canonical_name: currentName,
        maker: currentMaker,
      },
      source,
      updated_at: setAt,
    },
  };

  await writeConsolidatedOverrides({
    config,
    category,
    envelope: {
      ...envelope,
      components,
    },
  });
  return { changed: true, key };
}
