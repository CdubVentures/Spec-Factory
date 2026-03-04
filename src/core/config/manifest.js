// AUTO-GENERATED CONFIG MANIFEST
// Source of truth for system-level settings metadata.
// User/domain-generated settings belong in user-settings/DB, not in this manifest.

export const CONFIG_MANIFEST_VERSION = 1;

export const CONFIG_MANIFEST = Object.freeze([
  {
    "id": "core",
    "title": "Core Application Settings",
    "notes": "Boot/runtime environment and top-level API binding.",
    "entries": [
      {
        "key": "API_BASE_URL",
        "defaultValue": "http://localhost:8788",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORS_ORIGIN",
        "defaultValue": "http://localhost:8788",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NODE_ENV",
        "defaultValue": "development",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PORT",
        "defaultValue": "8788",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SETTINGS_CANONICAL_ONLY_WRITES",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      }
    ]
  },
  {
    "id": "caching",
    "title": "Caching and Data Layer",
    "notes": "External cache knobs; currently reserved for future non-SQLite cache integration.",
    "entries": [
      {
        "key": "REDIS_PASSWORD",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "REDIS_TTL",
        "defaultValue": "3600",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "REDIS_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      }
    ]
  },
  {
    "id": "storage",
    "title": "Storage and Cloud Infrastructure",
    "notes": "S3/AWS and run-data relocation settings.",
    "entries": [
      {
        "key": "AWS_ACCESS_KEY_ID",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AWS_REGION",
        "defaultValue": "us-east-2",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AWS_SECRET_ACCESS_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AWS_SESSION_TOKEN",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUN_DATA_STORAGE_DESTINATION_TYPE",
        "defaultValue": "local",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUN_DATA_STORAGE_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUN_DATA_STORAGE_LOCAL_DIRECTORY",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUN_DATA_STORAGE_S3_ACCESS_KEY_ID",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUN_DATA_STORAGE_S3_BUCKET",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUN_DATA_STORAGE_S3_PREFIX",
        "defaultValue": "spec-factory-runs",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUN_DATA_STORAGE_S3_REGION",
        "defaultValue": "us-east-2",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUN_DATA_STORAGE_S3_SECRET_ACCESS_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUN_DATA_STORAGE_S3_SESSION_TOKEN",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "S3_BUCKET",
        "defaultValue": "my-spec-harvester-data",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "S3_DATA_BUCKET",
        "defaultValue": "eggamer-data",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "S3_INPUT_PREFIX",
        "defaultValue": "specs/inputs",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "S3_OUTPUT_PREFIX",
        "defaultValue": "specs/outputs",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      }
    ]
  },
  {
    "id": "security",
    "title": "Security and Auth",
    "notes": "Authentication and trust-boundary controls.",
    "entries": [
      {
        "key": "JWT_EXPIRES_IN",
        "defaultValue": "7d",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "JWT_SECRET",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      }
    ]
  },
  {
    "id": "llm",
    "title": "LLM and Model Routing",
    "notes": "Provider endpoints, keys, model ladders, pricing, and fallback policies.",
    "entries": [
      {
        "key": "ANTHROPIC_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CHATMOCK_COMPOSE_FILE",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CHATMOCK_DIR",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_ASYNC_BASE_URL",
        "defaultValue": "http://localhost:5000/api",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_ASYNC_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_ASYNC_MAX_WAIT_MS",
        "defaultValue": "900000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_ASYNC_POLL_INTERVAL_MS",
        "defaultValue": "5000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_ASYNC_STATUS_PATH",
        "defaultValue": "/async/status/{id}",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_ASYNC_SUBMIT_PATH",
        "defaultValue": "/async/submit",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_AUTO_RESTART_ON_AUTH",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_AUTO_START",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_BASE_URL",
        "defaultValue": "http://localhost:5001/v1",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_CIRCUIT_OPEN_MS",
        "defaultValue": "30000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_ENSURE_READY_TIMEOUT_MS",
        "defaultValue": "15000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_ESCALATE_CONFIDENCE_LT",
        "defaultValue": "0.85",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_ESCALATE_CRITICAL_ONLY",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_ESCALATE_IF_CONFLICT",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_FAILURE_THRESHOLD",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_MAX_DEEP_FIELDS_PER_PRODUCT",
        "defaultValue": "12",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_MODEL_AUDIT",
        "defaultValue": "gpt-5.1-low",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_MODEL_DOM",
        "defaultValue": "gpt-5.1-low",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_MODEL_FAST",
        "defaultValue": "gpt-5-low",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_MODEL_REASONING_DEEP",
        "defaultValue": "gpt-5.2-high",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_MODEL_RERANK_FAST",
        "defaultValue": "gpt-5.1-low",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_MODEL_SEARCH_DEEP",
        "defaultValue": "gpt-5.2-xhigh",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_MODEL_SEARCH_FAST",
        "defaultValue": "gpt-5.1-low",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_MODEL_VISION",
        "defaultValue": "gpt-5.2-xhigh",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_START_READY_TIMEOUT_MS",
        "defaultValue": "60000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORTEX_SYNC_TIMEOUT_MS",
        "defaultValue": "60000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DEEPSEEK_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DEEPSEEK_CHAT_MAX_OUTPUT_DEFAULT",
        "defaultValue": "2048",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DEEPSEEK_CHAT_MAX_OUTPUT_MAXIMUM",
        "defaultValue": "4096",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DEEPSEEK_CONTEXT_LENGTH",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DEEPSEEK_FEATURES",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DEEPSEEK_MODEL_VERSION",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DEEPSEEK_REASONER_MAX_OUTPUT_DEFAULT",
        "defaultValue": "4096",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DEEPSEEK_REASONER_MAX_OUTPUT_MAXIMUM",
        "defaultValue": "8192",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_BASE_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_COST_CACHED_INPUT_PER_1M",
        "defaultValue": "0.125",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_COST_CACHED_INPUT_PER_1M_DEEPSEEK_CHAT",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_COST_CACHED_INPUT_PER_1M_DEEPSEEK_REASONER",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_COST_INPUT_PER_1M",
        "defaultValue": "1.25",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_COST_INPUT_PER_1M_DEEPSEEK_CHAT",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_COST_INPUT_PER_1M_DEEPSEEK_REASONER",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_COST_OUTPUT_PER_1M",
        "defaultValue": "10",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_COST_OUTPUT_PER_1M_DEEPSEEK_CHAT",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_COST_OUTPUT_PER_1M_DEEPSEEK_REASONER",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_DISABLE_BUDGET_GUARDS",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_BASE_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_FALLBACK_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_FALLBACK_BASE_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_FALLBACK_MODEL",
        "defaultValue": "deepseek-reasoner",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_FALLBACK_PROVIDER",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_MAX_SNIPPET_CHARS",
        "defaultValue": "900",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_MAX_SNIPPETS_PER_BATCH",
        "defaultValue": "6",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_MAX_TOKENS",
        "defaultValue": "1200",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_PROVIDER",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_REASONING_BUDGET",
        "defaultValue": "4096",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACT_SKIP_LOW_SIGNAL",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACTION_CACHE_DIR",
        "defaultValue": ".specfactory_tmp/llm_cache",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACTION_CACHE_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_EXTRACTION_CACHE_TTL_MS",
        "defaultValue": "604800000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_FALLBACK_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_BATCHES_PER_PRODUCT",
        "defaultValue": "7",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_CALLS_PER_PRODUCT_FAST",
        "defaultValue": "6",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_CALLS_PER_PRODUCT_TOTAL",
        "defaultValue": "32",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_CALLS_PER_ROUND",
        "defaultValue": "5",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_EVIDENCE_CHARS",
        "defaultValue": "52000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS",
        "defaultValue": "1400",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS_EXTRACT",
        "defaultValue": "2048",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS_EXTRACT_FALLBACK",
        "defaultValue": "4096",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS_FAST",
        "defaultValue": "1536",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS_PLAN",
        "defaultValue": "2048",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK",
        "defaultValue": "2048",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS_REASONING",
        "defaultValue": "4096",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS_TRIAGE",
        "defaultValue": "2048",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS_VALIDATE",
        "defaultValue": "2048",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS_VALIDATE_FALLBACK",
        "defaultValue": "4096",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS_WRITE",
        "defaultValue": "2048",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_OUTPUT_TOKENS_WRITE_FALLBACK",
        "defaultValue": "2048",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MAX_TOKENS",
        "defaultValue": "16384",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MODEL_CATALOG",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MODEL_EXTRACT",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MODEL_FAST",
        "defaultValue": "gpt-5-low",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MODEL_OUTPUT_TOKEN_MAP_JSON",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MODEL_PLAN",
        "defaultValue": "gpt-5.1-low",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MODEL_PRICING_JSON",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MODEL_REASONING",
        "defaultValue": "gpt-5.2-high",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MODEL_TRIAGE",
        "defaultValue": "gemini-2.5-flash",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MODEL_VALIDATE",
        "defaultValue": "gpt-5.1-high",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MODEL_WRITE",
        "defaultValue": "gemini-2.5-flash-lite",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_MONTHLY_BUDGET_USD",
        "defaultValue": "300",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_OUTPUT_TOKEN_PRESETS",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PER_PRODUCT_BUDGET_USD",
        "defaultValue": "0.35",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PLAN_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PLAN_BASE_URL",
        "defaultValue": "http://localhost:5001",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PLAN_DISCOVERY_QUERIES",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PLAN_FALLBACK_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PLAN_FALLBACK_BASE_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PLAN_FALLBACK_MODEL",
        "defaultValue": "deepseek-chat",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PLAN_FALLBACK_PROVIDER",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PLAN_PROVIDER",
        "defaultValue": "openai",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PRICING_AS_OF",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PRICING_SOURCES_JSON",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_PROVIDER",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_REASONING_BUDGET",
        "defaultValue": "32768",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_REASONING_MODE",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_SERP_RERANK_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_TIMEOUT_MS",
        "defaultValue": "120000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_VALIDATE_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_VALIDATE_BASE_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_VALIDATE_FALLBACK_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_VALIDATE_FALLBACK_BASE_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_VALIDATE_FALLBACK_MODEL",
        "defaultValue": "deepseek-reasoner",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_VALIDATE_FALLBACK_PROVIDER",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_VALIDATE_PROVIDER",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_VERIFY_AGGRESSIVE_ALWAYS",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_VERIFY_AGGRESSIVE_BATCH_COUNT",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_VERIFY_MODE",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_VERIFY_SAMPLE_RATE",
        "defaultValue": "5",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_WRITE_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_WRITE_BASE_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_WRITE_FALLBACK_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_WRITE_FALLBACK_BASE_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_WRITE_FALLBACK_MODEL",
        "defaultValue": "deepseek-chat",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_WRITE_FALLBACK_PROVIDER",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_WRITE_PROVIDER",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LLM_WRITE_SUMMARY",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "OPENAI_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "OPENAI_BASE_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "OPENAI_MODEL_EXTRACT",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "OPENAI_MODEL_PLAN",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "OPENAI_MODEL_WRITE",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "OPENAI_TIMEOUT_MS",
        "defaultValue": "40000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      }
    ]
  },
  {
    "id": "discovery",
    "title": "Discovery and Search Providers",
    "notes": "Internet search endpoints and provider selection defaults.",
    "entries": [
      {
        "key": "BING_SEARCH_ENDPOINT",
        "defaultValue": "https://api.bing.microsoft.com/v7.0/search",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "BING_SEARCH_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DISABLE_GOOGLE_CSE",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DUCKDUCKGO_BASE_URL",
        "defaultValue": "https://html.duckduckgo.com/html/",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DUCKDUCKGO_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DUCKDUCKGO_TIMEOUT_MS",
        "defaultValue": "12000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DUCKDUCKGO_USER_AGENT",
        "defaultValue": "Mozilla/5.0 (compatible; SpecFactory/1.0)",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "GOOGLE_CSE_CX",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "GOOGLE_CSE_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SEARCH_PROVIDER",
        "defaultValue": "dual",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SEARXNG_BASE_URL",
        "defaultValue": "http://127.0.0.1:8080",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SEARXNG_DEFAULT_BASE_URL",
        "defaultValue": "http://127.0.0.1:8080",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SEARXNG_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      }
    ]
  },
  {
    "id": "retrieval",
    "title": "Retrieval, Evidence, and Convergence",
    "notes": "Scoring, weighting, and quality-gate thresholds.",
    "entries": [
      {
        "key": "CONSENSUS_CONFIDENCE_SCORING_BASE",
        "defaultValue": "0.7",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_INSTRUMENTED_FIELD_THRESHOLD",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_LLM_WEIGHT_TIER1",
        "defaultValue": "0.6",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_LLM_WEIGHT_TIER2",
        "defaultValue": "0.4",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_LLM_WEIGHT_TIER3",
        "defaultValue": "0.2",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_LLM_WEIGHT_TIER4",
        "defaultValue": "0.15",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_METHOD_WEIGHT_ADAPTER_API",
        "defaultValue": "0.95",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_METHOD_WEIGHT_DOM",
        "defaultValue": "0.4",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_METHOD_WEIGHT_LLM_EXTRACT_BASE",
        "defaultValue": "0.2",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_METHOD_WEIGHT_NETWORK_JSON",
        "defaultValue": "1",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_METHOD_WEIGHT_PDF",
        "defaultValue": "0.82",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_METHOD_WEIGHT_STRUCTURED_META",
        "defaultValue": "0.9",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_METHOD_WEIGHT_TABLE_KV",
        "defaultValue": "0.78",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_PASS_TARGET_IDENTITY_STRONG",
        "defaultValue": "5",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_PASS_TARGET_NORMAL",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_POLICY_BONUS",
        "defaultValue": "0.3",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_RELAXED_ACCEPTANCE_DOMAIN_COUNT",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_STRICT_ACCEPTANCE_DOMAIN_COUNT",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_TIER1_WEIGHT",
        "defaultValue": "1",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_TIER2_WEIGHT",
        "defaultValue": "0.8",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_TIER3_WEIGHT",
        "defaultValue": "0.45",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_TIER4_WEIGHT",
        "defaultValue": "0.25",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONSENSUS_WEIGHTED_MAJORITY_THRESHOLD",
        "defaultValue": "1.1",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONVERGENCE_IDENTITY_FAIL_FAST_ROUNDS",
        "defaultValue": "1",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONVERGENCE_LOW_QUALITY_CONFIDENCE",
        "defaultValue": "0.2",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONVERGENCE_MAX_DISPATCH_QUERIES",
        "defaultValue": "20",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONVERGENCE_MAX_LOW_QUALITY_ROUNDS",
        "defaultValue": "1",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONVERGENCE_MAX_ROUNDS",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONVERGENCE_MAX_TARGET_FIELDS",
        "defaultValue": "30",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONVERGENCE_NO_PROGRESS_LIMIT",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "EVIDENCE_CHUNK_MAX_LENGTH",
        "defaultValue": "3000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "EVIDENCE_HEADINGS_LIMIT",
        "defaultValue": "120",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "EVIDENCE_PACK_LIMITS_MAP_JSON",
        "defaultValue": "{\"headingsLimit\":120,\"chunkMaxLength\":3000,\"specSectionsLimit\":8}",
        "type": "json",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "EVIDENCE_SPEC_SECTIONS_LIMIT",
        "defaultValue": "8",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "EVIDENCE_TEXT_MAX_CHARS",
        "defaultValue": "5000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_BASE_MATCH_THRESHOLD",
        "defaultValue": "0.8",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_EASY_AMBIGUITY_REDUCTION",
        "defaultValue": "-0.15",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_EXTRA_HARD_AMBIGUITY_INCREASE",
        "defaultValue": "0.03",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_EXTRA_HARD_MISSING_STRONG_ID_INCREASE",
        "defaultValue": "0.08",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_HARD_AMBIGUITY_REDUCTION",
        "defaultValue": "-0.02",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_HARD_MISSING_STRONG_ID_INCREASE",
        "defaultValue": "0.03",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_MEDIUM_AMBIGUITY_REDUCTION",
        "defaultValue": "-0.1",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_MISSING_STRONG_ID_PENALTY",
        "defaultValue": "-0.05",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_NUMERIC_RANGE_THRESHOLD",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_NUMERIC_TOKEN_BOOST",
        "defaultValue": "0.1",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_PUBLISH_THRESHOLD",
        "defaultValue": "0.7",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_THRESHOLD_BOUNDS_MAP_JSON",
        "defaultValue": "{\"thresholdFloor\":0.62,\"thresholdCeiling\":0.92}",
        "type": "json",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_THRESHOLD_CEILING",
        "defaultValue": "0.92",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_THRESHOLD_FLOOR",
        "defaultValue": "0.62",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_VERY_HARD_AMBIGUITY_INCREASE",
        "defaultValue": "0.01",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IDENTITY_GATE_VERY_HARD_MISSING_STRONG_ID_INCREASE",
        "defaultValue": "0.05",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_CAP_IDENTITY_CONFLICT",
        "defaultValue": "0.39",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_CAP_IDENTITY_LOCKED",
        "defaultValue": "1",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_CAP_IDENTITY_PROVISIONAL",
        "defaultValue": "0.74",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_CAP_IDENTITY_UNLOCKED",
        "defaultValue": "0.59",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_CONFLICT_MULTIPLIER",
        "defaultValue": "1.5",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_DEFAULT_IDENTITY_AUDIT_LIMIT",
        "defaultValue": "24",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_EVIDENCE_DECAY_DAYS",
        "defaultValue": "14",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_EVIDENCE_DECAY_FLOOR",
        "defaultValue": "0.3",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_IDENTITY_LOCK_THRESHOLD",
        "defaultValue": "0.95",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_IDENTITY_PROVISIONAL_THRESHOLD",
        "defaultValue": "0.7",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_MIN_REFS_DEFICIT_MULTIPLIER",
        "defaultValue": "1.5",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_MISSING_MULTIPLIER",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_REQUIRED_WEIGHT_CRITICAL",
        "defaultValue": "4",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_REQUIRED_WEIGHT_EXPECTED",
        "defaultValue": "1",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_REQUIRED_WEIGHT_IDENTITY",
        "defaultValue": "5",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_REQUIRED_WEIGHT_OPTIONAL",
        "defaultValue": "1",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_REQUIRED_WEIGHT_REQUIRED",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "NEEDSET_TIER_DEFICIT_MULTIPLIER",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_ANCHOR_SCORE_PER_MATCH",
        "defaultValue": "0.42",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_ANCHORS_LIMIT",
        "defaultValue": "6",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_DIRECT_FIELD_MATCH_BONUS",
        "defaultValue": "0.65",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_DOC_KIND_WEIGHT_LAB_REVIEW",
        "defaultValue": "0.95",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_DOC_KIND_WEIGHT_MANUAL_PDF",
        "defaultValue": "1.5",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_DOC_KIND_WEIGHT_OTHER",
        "defaultValue": "0.55",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_DOC_KIND_WEIGHT_PRODUCT_PAGE",
        "defaultValue": "0.75",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_DOC_KIND_WEIGHT_SPEC_PDF",
        "defaultValue": "1.4",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_DOC_KIND_WEIGHT_SUPPORT",
        "defaultValue": "1.1",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_EVIDENCE_DOC_WEIGHT_MULTIPLIER",
        "defaultValue": "1.5",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_EVIDENCE_METHOD_WEIGHT_MULTIPLIER",
        "defaultValue": "0.85",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_EVIDENCE_POOL_MAX_ROWS",
        "defaultValue": "4000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_EVIDENCE_REFS_LIMIT",
        "defaultValue": "12",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_EVIDENCE_TIER_WEIGHT_MULTIPLIER",
        "defaultValue": "2.6",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_FALLBACK_EVIDENCE_MAX_ROWS",
        "defaultValue": "6000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_IDENTITY_FILTER_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_IDENTITY_SCORE_PER_MATCH",
        "defaultValue": "0.28",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_INTERNALS_MAP_JSON",
        "defaultValue": "{\"evidenceTierWeightMultiplier\":2.6,\"evidenceDocWeightMultiplier\":1.5,\"evidenceMethodWeightMultiplier\":0.85,\"evidencePoolMaxRows\":4000,\"snippetsPerSourceCap\":120,\"maxHitsCap\":80,\"evidenceRefsLimit\":12,\"reasonBadgesLimit\":8,\"retrievalAnchorsLimit\":6,\"primeSourcesMaxCap\":20,\"fallbackEvidenceMaxRows\":6000,\"provenanceOnlyMinRows\":24}",
        "type": "json",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_MAX_HITS_CAP",
        "defaultValue": "80",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_MAX_HITS_PER_FIELD",
        "defaultValue": "24",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_MAX_PRIME_SOURCES",
        "defaultValue": "8",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_METHOD_WEIGHT_HELPER_SUPPORTIVE",
        "defaultValue": "0.65",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_METHOD_WEIGHT_JSON_LD",
        "defaultValue": "1.1",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_METHOD_WEIGHT_KV",
        "defaultValue": "1.15",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_METHOD_WEIGHT_LLM_EXTRACT",
        "defaultValue": "0.85",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_METHOD_WEIGHT_TABLE",
        "defaultValue": "1.25",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_PRIME_SOURCES_MAX_CAP",
        "defaultValue": "20",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_PROVENANCE_ONLY_MIN_ROWS",
        "defaultValue": "24",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_REASON_BADGES_LIMIT",
        "defaultValue": "8",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_SNIPPETS_PER_SOURCE_CAP",
        "defaultValue": "120",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_TIER_WEIGHT_TIER1",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_TIER_WEIGHT_TIER2",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_TIER_WEIGHT_TIER3",
        "defaultValue": "1",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_TIER_WEIGHT_TIER4",
        "defaultValue": "0.65",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_TIER_WEIGHT_TIER5",
        "defaultValue": "0.4",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RETRIEVAL_UNIT_MATCH_BONUS",
        "defaultValue": "0.35",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      }
    ]
  },
  {
    "id": "runtime",
    "title": "Runtime Pipeline and Fetching",
    "notes": "Execution behavior, parsing, OCR, browser automation, and screenshot controls.",
    "entries": [
      {
        "key": "CAPTURE_PAGE_SCREENSHOT_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CAPTURE_PAGE_SCREENSHOT_FORMAT",
        "defaultValue": "jpeg",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CAPTURE_PAGE_SCREENSHOT_MAX_BYTES",
        "defaultValue": "2200000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CAPTURE_PAGE_SCREENSHOT_QUALITY",
        "defaultValue": "62",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CAPTURE_PAGE_SCREENSHOT_SELECTORS",
        "defaultValue": "table,[data-spec-table],.specs-table,.spec-table,.specifications",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CRAWLEE_HEADLESS",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS",
        "defaultValue": "75",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FETCH_SCHEDULER_DEFAULT_CONCURRENCY",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FETCH_SCHEDULER_DEFAULT_DELAY_MS",
        "defaultValue": "300",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FETCH_SCHEDULER_DEFAULT_MAX_RETRIES",
        "defaultValue": "1",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FETCH_SCHEDULER_RETRY_WAIT_MS",
        "defaultValue": "60000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_HELPER_FILES_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_REEXTRACT_AFTER_HOURS",
        "defaultValue": "24",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_REEXTRACT_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_REEXTRACT_SEED_LIMIT",
        "defaultValue": "8",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_RESUME_MAX_AGE_HOURS",
        "defaultValue": "48",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_RESUME_MODE",
        "defaultValue": "auto",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_RESUME_PERSIST_LIMIT",
        "defaultValue": "160",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_RESUME_RETRY_PERSIST_LIMIT",
        "defaultValue": "80",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_RESUME_SEED_LIMIT",
        "defaultValue": "24",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_RESUME_SUCCESS_PERSIST_LIMIT",
        "defaultValue": "240",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_SCHEMA_PACKETS_SCHEMA_ROOT",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_SCHEMA_PACKETS_VALIDATION_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INDEXING_SCHEMA_PACKETS_VALIDATION_STRICT",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PDF_BACKEND_ROUTER_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PDF_BACKEND_ROUTER_MAX_PAGES",
        "defaultValue": "60",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PDF_BACKEND_ROUTER_MAX_PAIRS",
        "defaultValue": "5000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PDF_BACKEND_ROUTER_MAX_TEXT_PREVIEW_CHARS",
        "defaultValue": "20000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PDF_BACKEND_ROUTER_TIMEOUT_MS",
        "defaultValue": "120000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PDF_PREFERRED_BACKEND",
        "defaultValue": "auto",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_AUTOSAVE_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_CAPTURE_SCREENSHOTS",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_CONTROL_FILE",
        "defaultValue": "_runtime/control/runtime_overrides.json",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_EVENTS_KEY",
        "defaultValue": "_runtime/events.jsonl",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_OPS_WORKBENCH_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_SCREENCAST_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_SCREENCAST_FPS",
        "defaultValue": "10",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_SCREENCAST_MAX_HEIGHT",
        "defaultValue": "720",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_SCREENCAST_MAX_WIDTH",
        "defaultValue": "1280",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_SCREENCAST_QUALITY",
        "defaultValue": "50",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_SCREENSHOT_MODE",
        "defaultValue": "last_only",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_TRACE_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_TRACE_FETCH_RING",
        "defaultValue": "30",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_TRACE_LLM_PAYLOADS",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUNTIME_TRACE_LLM_RING",
        "defaultValue": "50",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SCANNED_PDF_OCR_BACKEND",
        "defaultValue": "auto",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SCANNED_PDF_OCR_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SCANNED_PDF_OCR_MAX_PAGES",
        "defaultValue": "4",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SCANNED_PDF_OCR_MAX_PAIRS",
        "defaultValue": "800",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SCANNED_PDF_OCR_MIN_CHARS_PER_PAGE",
        "defaultValue": "30",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SCANNED_PDF_OCR_MIN_CONFIDENCE",
        "defaultValue": "0.5",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SCANNED_PDF_OCR_MIN_LINES_PER_PAGE",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SCANNED_PDF_OCR_PROMOTE_CANDIDATES",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "STATIC_DOM_EXTRACTOR_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "STATIC_DOM_MAX_EVIDENCE_SNIPPETS",
        "defaultValue": "120",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "STATIC_DOM_MODE",
        "defaultValue": "cheerio",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "STATIC_DOM_TARGET_MATCH_THRESHOLD",
        "defaultValue": "0.55",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "STRUCTURED_METADATA_EXTRUCT_CACHE_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "STRUCTURED_METADATA_EXTRUCT_CACHE_LIMIT",
        "defaultValue": "400",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "STRUCTURED_METADATA_EXTRUCT_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "STRUCTURED_METADATA_EXTRUCT_MAX_ITEMS_PER_SURFACE",
        "defaultValue": "200",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "STRUCTURED_METADATA_EXTRUCT_TIMEOUT_MS",
        "defaultValue": "2000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "STRUCTURED_METADATA_EXTRUCT_URL",
        "defaultValue": "http://127.0.0.1:8011/extract/structured",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_CAPTURE_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_CAPTURE_MAX_PER_SOURCE",
        "defaultValue": "5",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_HERO_SELECTOR_MAP_JSON",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_LLM_MAX_BYTES",
        "defaultValue": "512000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_MAX_PHASH_DISTANCE",
        "defaultValue": "10",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_MIN_ENTROPY",
        "defaultValue": "2.5",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_MIN_HEIGHT",
        "defaultValue": "320",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_MIN_SHARPNESS",
        "defaultValue": "80",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_MIN_WIDTH",
        "defaultValue": "320",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_PHASH_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_REGION_CROP_MAX_SIDE",
        "defaultValue": "1024",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_REGION_CROP_QUALITY",
        "defaultValue": "70",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_RETENTION_DAYS",
        "defaultValue": "30",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_REVIEW_FORMAT",
        "defaultValue": "webp",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_REVIEW_LG_MAX_SIDE",
        "defaultValue": "1600",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_REVIEW_LG_QUALITY",
        "defaultValue": "75",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_REVIEW_SM_MAX_SIDE",
        "defaultValue": "768",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_REVIEW_SM_QUALITY",
        "defaultValue": "65",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "VISUAL_ASSET_STORE_ORIGINAL",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      }
    ]
  },
  {
    "id": "observability",
    "title": "Observability and Operations",
    "notes": "Telemetry persistence, daemon behavior, and operational traces.",
    "entries": [
      {
        "key": "BILLING_JSON_WRITE",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "BRAIN_JSON_WRITE",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CACHE_JSON_WRITE",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CORPUS_JSON_WRITE",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DAEMON_CONCURRENCY",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DAEMON_GRACEFUL_SHUTDOWN_TIMEOUT_MS",
        "defaultValue": "60000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DRIFT_AUTO_REPUBLISH",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DRIFT_DETECTION_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DRIFT_POLL_SECONDS",
        "defaultValue": "86400",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DRIFT_SCAN_MAX_PRODUCTS",
        "defaultValue": "250",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "EVENTS_JSON_WRITE",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IMPORTS_POLL_SECONDS",
        "defaultValue": "10",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IMPORTS_ROOT",
        "defaultValue": "imports",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "INTEL_JSON_WRITE",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LEARNING_JSON_WRITE",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "QUEUE_JSON_WRITE",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      }
    ]
  },
  {
    "id": "paths",
    "title": "Filesystem and Local Paths",
    "notes": "Local directories and path roots for runtime artifacts.",
    "entries": [
      {
        "key": "FRONTIER_BACKOFF_MAX_EXPONENT",
        "defaultValue": "4",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_BLOCKED_DOMAIN_THRESHOLD",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_COOLDOWN_403_BASE",
        "defaultValue": "1800",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_COOLDOWN_404",
        "defaultValue": "259200",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_COOLDOWN_404_REPEAT",
        "defaultValue": "1209600",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_COOLDOWN_410",
        "defaultValue": "7776000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_COOLDOWN_429_BASE",
        "defaultValue": "900",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_COOLDOWN_TIMEOUT",
        "defaultValue": "21600",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_DB_PATH",
        "defaultValue": "_intel/frontier/frontier.json",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_ENABLE_SQLITE",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_PATH_PENALTY_NOTFOUND_THRESHOLD",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_QUERY_COOLDOWN_SECONDS",
        "defaultValue": "21600",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_REPAIR_SEARCH_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FRONTIER_STRIP_TRACKING_PARAMS",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "HELPER_ACTIVE_SYNC_LIMIT",
        "defaultValue": "0",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "HELPER_AUTO_SEED_TARGETS",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "HELPER_FILES_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "HELPER_FILES_ROOT",
        "defaultValue": "helper_files",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "HELPER_SUPPORTIVE_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "HELPER_SUPPORTIVE_FILL_MISSING",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "HELPER_SUPPORTIVE_MAX_SOURCES",
        "defaultValue": "12",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LOCAL_INPUT_ROOT",
        "defaultValue": "fixtures/s3",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LOCAL_OUTPUT_ROOT",
        "defaultValue": "out",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LOCAL_S3_ROOT",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SPEC_DB_DIR",
        "defaultValue": ".specfactory_tmp",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      }
    ]
  },
  {
    "id": "misc",
    "title": "Miscellaneous",
    "notes": "Legacy/compatibility settings not yet mapped to a dedicated domain.",
    "entries": [
      {
        "key": "ACCURACY_MODE",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AFFILIATE_NETWORK_API_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AFFILIATE_TRACKING_ID",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_CONFIDENCE_THRESHOLD",
        "defaultValue": "0.85",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_EVIDENCE_AUDIT_BATCH_SIZE",
        "defaultValue": "60",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_EVIDENCE_AUDIT_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_LLM_DISCOVERY_PASSES",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_LLM_DISCOVERY_QUERY_CAP",
        "defaultValue": "30",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_LLM_MAX_CALLS_PER_PRODUCT_TOTAL",
        "defaultValue": "64",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_LLM_MAX_CALLS_PER_ROUND",
        "defaultValue": "18",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_LLM_TARGET_MAX_FIELDS",
        "defaultValue": "75",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_MAX_SEARCH_QUERIES",
        "defaultValue": "5",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_MAX_TIME_PER_PRODUCT_MS",
        "defaultValue": "600000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_MODE_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_ROUND1_MAX_CANDIDATE_URLS",
        "defaultValue": "120",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_ROUND1_MAX_URLS",
        "defaultValue": "90",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AGGRESSIVE_THOROUGH_FROM_ROUND",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ALLOW_BELOW_PASS_TARGET_FILL",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ARTICLE_EXTRACTOR_DOMAIN_POLICY_MAP_JSON",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ARTICLE_EXTRACTOR_MAX_CHARS",
        "defaultValue": "24000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ARTICLE_EXTRACTOR_MIN_CHARS",
        "defaultValue": "700",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ARTICLE_EXTRACTOR_MIN_SCORE",
        "defaultValue": "45",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ARTICLE_EXTRACTOR_V2",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AUTHORITY_SNAPSHOT_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AUTO_SCROLL_DELAY_MS",
        "defaultValue": "1200",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AUTO_SCROLL_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AUTO_SCROLL_PASSES",
        "defaultValue": "3",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "AUTOMATION_QUEUE_STORAGE_ENGINE",
        "defaultValue": "sqlite",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "BATCH_STRATEGY",
        "defaultValue": "bandit",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CHART_EXTRACTION_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "COMPONENT_LEXICON_DECAY_DAYS",
        "defaultValue": "90",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "COMPONENT_LEXICON_EXPIRE_DAYS",
        "defaultValue": "180",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CONCURRENCY",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CSE_RESCUE_ONLY_MODE",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "CSE_RESCUE_REQUIRED_ITERATION",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DISCOVERY_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DISCOVERY_MAX_DISCOVERED",
        "defaultValue": "80",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DISCOVERY_MAX_QUERIES",
        "defaultValue": "6",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DISCOVERY_QUERY_CONCURRENCY",
        "defaultValue": "4",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DISCOVERY_RESULTS_PER_QUERY",
        "defaultValue": "12",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DOM_SNIPPET_MAX_CHARS",
        "defaultValue": "3600",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DRY_RUN",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DYNAMIC_CRAWLEE_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DYNAMIC_FETCH_POLICY_MAP_JSON",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DYNAMIC_FETCH_RETRY_BACKOFF_MS",
        "defaultValue": "1200",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "DYNAMIC_FETCH_RETRY_BUDGET",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ELO_SUPABASE_ANON_KEY",
        "defaultValue": "",
        "type": "string",
        "secret": true,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ELO_SUPABASE_ENDPOINT",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ENDPOINT_NETWORK_SCAN_LIMIT",
        "defaultValue": "1800",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ENDPOINT_SIGNAL_LIMIT",
        "defaultValue": "120",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ENDPOINT_SUGGESTION_LIMIT",
        "defaultValue": "36",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FETCH_CANDIDATE_SOURCES",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FETCH_SCHEDULER_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FETCH_SCHEDULER_FALLBACK_WAIT_MS",
        "defaultValue": "60000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FETCH_SCHEDULER_INTERNALS_MAP_JSON",
        "defaultValue": "{\"defaultDelayMs\":300,\"defaultConcurrency\":2,\"defaultMaxRetries\":1,\"retryWaitMs\":60000}",
        "type": "json",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FETCH_SCHEDULER_MAX_RETRIES",
        "defaultValue": "1",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FIELD_ANCHORS_DECAY_DAYS",
        "defaultValue": "60",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "FIELD_REWARD_HALF_LIFE_DAYS",
        "defaultValue": "45",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "GRAPHQL_REPLAY_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "HTML_TABLE_EXTRACTOR_V2",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "HYPOTHESIS_AUTO_FOLLOWUP_ROUNDS",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "HYPOTHESIS_FOLLOWUP_URLS_PER_ROUND",
        "defaultValue": "24",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "IMAGE_PROCESSOR_URL",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LANE_CONCURRENCY_FETCH",
        "defaultValue": "4",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LANE_CONCURRENCY_LLM",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LANE_CONCURRENCY_PARSE",
        "defaultValue": "4",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LANE_CONCURRENCY_SEARCH",
        "defaultValue": "2",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LEARNING_CONFIDENCE_THRESHOLD",
        "defaultValue": "0.85",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "LOCAL_MODE",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MANUFACTURER_BROAD_DISCOVERY",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MANUFACTURER_DEEP_RESEARCH_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MANUFACTURER_RESERVE_URLS",
        "defaultValue": "60",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MANUFACTURER_SEED_SEARCH_URLS",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_CANDIDATE_URLS",
        "defaultValue": "",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_CANDIDATE_URLS_PER_PRODUCT",
        "defaultValue": "180",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_GRAPHQL_REPLAYS",
        "defaultValue": "20",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_HYPOTHESIS_ITEMS",
        "defaultValue": "120",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_JSON_BYTES",
        "defaultValue": "6000000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_MANUFACTURER_PAGES_PER_DOMAIN",
        "defaultValue": "28",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_MANUFACTURER_URLS_PER_PRODUCT",
        "defaultValue": "90",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_NETWORK_RESPONSES_PER_PAGE",
        "defaultValue": "2500",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_PAGES_PER_DOMAIN",
        "defaultValue": "6",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_PDF_BYTES",
        "defaultValue": "30000000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_RUN_SECONDS",
        "defaultValue": "2700",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MAX_URLS_PER_PRODUCT",
        "defaultValue": "140",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MIRROR_TO_S3",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "MIRROR_TO_S3_INPUT",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "OUTPUT_MODE",
        "defaultValue": "local",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PAGE_GOTO_TIMEOUT_MS",
        "defaultValue": "15000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PAGE_NETWORK_IDLE_TIMEOUT_MS",
        "defaultValue": "2000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PARSING_CONFIDENCE_BASE_MAP_JSON",
        "defaultValue": "{\"network_json\":1,\"embedded_state\":0.85,\"json_ld\":0.9,\"microdata\":0.88,\"opengraph\":0.8,\"microformat_rdfa\":0.78}",
        "type": "json",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PER_HOST_MIN_DELAY_MS",
        "defaultValue": "300",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "POST_LOAD_WAIT_MS",
        "defaultValue": "10000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "PREFER_HTTP_FETCHER",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "QUALITY_GATE_IDENTITY_THRESHOLD",
        "defaultValue": "0.7",
        "type": "number",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RECRAWL_STALE_AFTER_DAYS",
        "defaultValue": "30",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "REPAIR_DEDUPE_RULE",
        "defaultValue": "domain_once",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ROBOTS_TXT_COMPLIANT",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "ROBOTS_TXT_TIMEOUT_MS",
        "defaultValue": "6000",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "RUN_PROFILE",
        "defaultValue": "standard",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SEARCH_PROFILE_CAP_MAP_JSON",
        "defaultValue": "{\"deterministicAliasCap\":6,\"llmAliasValidationCap\":12,\"llmDocHintQueriesCap\":3,\"llmFieldTargetQueriesCap\":3,\"dedupeQueriesCap\":24}",
        "type": "json",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SELF_IMPROVE_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SERP_RERANKER_WEIGHT_MAP_JSON",
        "defaultValue": "{\"identityStrongBonus\":2,\"identityPartialBonus\":0.8,\"identityWeakBonus\":0,\"identityNoneBonus\":-1.5,\"brandPresenceBonus\":2.5,\"modelPresenceBonus\":2.5,\"specManualKeywordBonus\":1.3,\"reviewBenchmarkBonus\":0.9,\"forumRedditPenalty\":-0.9,\"brandInHostnameBonus\":1.2,\"wikipediaPenalty\":-1,\"variantGuardPenalty\":-3,\"multiModelHintPenalty\":-1.5,\"tier1Bonus\":1.5,\"tier2Bonus\":0.5}",
        "type": "json",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SERP_TRIAGE_ENABLED",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SERP_TRIAGE_MAX_URLS",
        "defaultValue": "12",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "SERP_TRIAGE_MIN_SCORE",
        "defaultValue": "5",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "UBER_AGGRESSIVE_ENABLED",
        "defaultValue": "false",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "UBER_MAX_ROUNDS",
        "defaultValue": "6",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "UBER_MAX_URLS_PER_DOMAIN",
        "defaultValue": "6",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "UBER_MAX_URLS_PER_PRODUCT",
        "defaultValue": "25",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "URL_MEMORY_DECAY_DAYS",
        "defaultValue": "120",
        "type": "integer",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "USER_AGENT",
        "defaultValue": "\"Mozilla/5.0 (compatible; EGSpecHarvester/1.0; +https://eggear.com)\"",
        "type": "string",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      },
      {
        "key": "WRITE_MARKDOWN_SUMMARY",
        "defaultValue": "true",
        "type": "boolean",
        "secret": false,
        "userMutable": false,
        "description": "System-level setting. User/domain-generated values must not be stored here."
      }
    ]
  }
]);

export const CONFIG_MANIFEST_KEYS = Object.freeze(
  CONFIG_MANIFEST.flatMap((section) => section.entries.map((entry) => entry.key))
);

export const CONFIG_MANIFEST_DEFAULTS = Object.freeze(
  Object.fromEntries(
    CONFIG_MANIFEST.flatMap((section) => section.entries.map((entry) => [entry.key, entry.defaultValue]))
  )
);
