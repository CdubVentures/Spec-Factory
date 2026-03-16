export const cachingGroup = Object.freeze({
  id: "caching",
  title: "Caching and Data Layer",
  notes: "External cache knobs; currently reserved for future non-SQLite cache integration.",
  entries: Object.freeze([
    { key: "REDIS_PASSWORD", defaultValue: "", type: "string", secret: true, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "REDIS_TTL", defaultValue: "3600", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "REDIS_URL", defaultValue: "", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." }
  ]),
});
