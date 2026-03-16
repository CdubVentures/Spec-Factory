export const coreGroup = Object.freeze({
  id: "core",
  title: "Core Application Settings",
  notes: "Boot/runtime environment and top-level API binding.",
  entries: Object.freeze([
    { key: "API_BASE_URL", defaultValue: "http://localhost:8788", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "CORS_ORIGIN", defaultValue: "http://localhost:8788", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "NODE_ENV", defaultValue: "development", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "PORT", defaultValue: "8788", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "SETTINGS_CANONICAL_ONLY_WRITES", defaultValue: "true", type: "boolean", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." }
  ]),
});
