export function schemaForSettingType(typeToken) {
  if (typeToken === 'integer') return { type: 'integer' };
  if (typeToken === 'number') return { type: 'number' };
  if (typeToken === 'boolean') return { type: 'boolean' };
  if (typeToken === 'string') return { type: 'string' };
  if (typeToken === 'string_or_null') return { anyOf: [{ type: 'string' }, { type: 'null' }] };
  if (typeToken === 'object') return { type: 'object', additionalProperties: true };
  return {};
}

export function sectionSchemaFromTypeMap(typeMap) {
  const properties = {};
  for (const [key, typeToken] of Object.entries(typeMap || {})) {
    properties[key] = schemaForSettingType(typeToken);
  }
  return {
    type: 'object',
    properties,
    additionalProperties: false,
  };
}

export function buildUserSettingsSnapshotSchema({
  settingsDocumentSchemaVersion,
  runtimeSettingsValueTypes,
  storageSettingsValueTypes,
  uiSettingsValueTypes,
}) {
  return {
    type: 'object',
    properties: {
      schemaVersion: { type: 'integer', const: settingsDocumentSchemaVersion },
      runtime: sectionSchemaFromTypeMap(runtimeSettingsValueTypes),
      convergence: { type: 'object', properties: {}, additionalProperties: false },
      storage: sectionSchemaFromTypeMap(storageSettingsValueTypes),
      studio: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            map: {
              type: 'object',
              additionalProperties: true,
            },
            file_path: { type: 'string' },
            version_snapshot: {},
            map_hash: {},
            map_path: {},
            updated_at: {},
          },
          required: ['map'],
          additionalProperties: false,
        },
      },
      ui: sectionSchemaFromTypeMap(uiSettingsValueTypes),
    },
    required: ['schemaVersion', 'runtime', 'convergence', 'storage', 'studio', 'ui'],
    additionalProperties: false,
  };
}
