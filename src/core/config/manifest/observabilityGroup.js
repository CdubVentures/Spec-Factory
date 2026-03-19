export const observabilityGroup = Object.freeze({
  id: "observability",
  title: "Observability and Operations",
  notes: "Telemetry persistence, daemon behavior, and operational traces.",
  entries: Object.freeze([
    { key: "DAEMON_CONCURRENCY", defaultValue: "3", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "DRIFT_AUTO_REPUBLISH", defaultValue: "true", type: "boolean", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "DRIFT_DETECTION_ENABLED", defaultValue: "true", type: "boolean", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "DRIFT_POLL_SECONDS", defaultValue: "86400", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "DRIFT_SCAN_MAX_PRODUCTS", defaultValue: "250", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "EVENTS_JSON_WRITE", defaultValue: "true", type: "boolean", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "IMPORTS_POLL_SECONDS", defaultValue: "10", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "IMPORTS_ROOT", defaultValue: "imports", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
  ]),
});
