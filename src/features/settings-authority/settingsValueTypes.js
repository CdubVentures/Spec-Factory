export const UI_SETTINGS_VALUE_TYPES = Object.freeze({
  studioAutoSaveAllEnabled: 'boolean',
  studioAutoSaveEnabled: 'boolean',
  studioAutoSaveMapEnabled: 'boolean',
  runtimeAutoSaveEnabled: 'boolean',
  storageAutoSaveEnabled: 'boolean',
  llmSettingsAutoSaveEnabled: 'boolean',
});

export const STORAGE_SETTINGS_VALUE_TYPES = Object.freeze({
  enabled: 'boolean',
  destinationType: 'string',
  localDirectory: 'string',
  awsRegion: 'string',
  s3Bucket: 'string',
  s3Prefix: 'string',
  s3AccessKeyId: 'string',
  s3SecretAccessKey: 'string',
  s3SessionToken: 'string',
  updatedAt: 'string_or_null',
});
