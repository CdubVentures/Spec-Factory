export const discoveryGroup = Object.freeze({
  id: "discovery",
  title: "Discovery and Search Providers",
  notes: "Internet search endpoints and provider selection defaults.",
  entries: Object.freeze([
    { key: "SEARCH_PROVIDER", defaultValue: "dual", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "SEARXNG_BASE_URL", defaultValue: "http://127.0.0.1:8080", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "SEARXNG_DEFAULT_BASE_URL", defaultValue: "http://127.0.0.1:8080", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "SEARXNG_URL", defaultValue: "", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." }
  ]),
});
