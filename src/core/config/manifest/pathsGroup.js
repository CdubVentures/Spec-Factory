import { defaultLocalOutputRoot } from '../runtimeArtifactRoots.js';

export const pathsGroup = Object.freeze({
  id: "paths",
  title: "Filesystem and Local Paths",
  notes: "Local directories and path roots for runtime artifacts.",
  entries: Object.freeze([
    { key: "FRONTIER_BACKOFF_MAX_EXPONENT", defaultValue: "4", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_BLOCKED_DOMAIN_THRESHOLD", defaultValue: "2", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_COOLDOWN_403_BASE", defaultValue: "1800", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_COOLDOWN_404", defaultValue: "259200", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_COOLDOWN_404_REPEAT", defaultValue: "1209600", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_COOLDOWN_410", defaultValue: "7776000", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_COOLDOWN_429_BASE", defaultValue: "600", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_COOLDOWN_TIMEOUT", defaultValue: "21600", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_DB_PATH", defaultValue: "_intel/frontier/frontier.json", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_ENABLE_SQLITE", defaultValue: "true", type: "boolean", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_PATH_PENALTY_NOTFOUND_THRESHOLD", defaultValue: "3", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_QUERY_COOLDOWN_SECONDS", defaultValue: "21600", type: "integer", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_REPAIR_SEARCH_ENABLED", defaultValue: "true", type: "boolean", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "FRONTIER_STRIP_TRACKING_PARAMS", defaultValue: "true", type: "boolean", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "CATEGORY_AUTHORITY_ROOT", defaultValue: "category_authority", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "HELPER_FILES_ROOT", defaultValue: "category_authority", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "HELPER_SUPPORTIVE_FILL_MISSING", defaultValue: "true", type: "boolean", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "LOCAL_INPUT_ROOT", defaultValue: "fixtures/s3", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "LOCAL_OUTPUT_ROOT", defaultValue: defaultLocalOutputRoot(), type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "LOCAL_S3_ROOT", defaultValue: "", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "SPEC_DB_DIR", defaultValue: ".specfactory_tmp", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." }
  ]),
});
