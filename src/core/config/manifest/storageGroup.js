export const storageGroup = Object.freeze({
  id: "storage",
  title: "Storage and Cloud Infrastructure",
  notes: "S3/AWS and run-data relocation settings.",
  entries: Object.freeze([
    { key: "AWS_ACCESS_KEY_ID", defaultValue: "", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "AWS_REGION", defaultValue: "us-east-2", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "AWS_SECRET_ACCESS_KEY", defaultValue: "", type: "string", secret: true, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "AWS_SESSION_TOKEN", defaultValue: "", type: "string", secret: true, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "RUN_DATA_STORAGE_DESTINATION_TYPE", defaultValue: "local", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "RUN_DATA_STORAGE_ENABLED", defaultValue: "false", type: "boolean", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "RUN_DATA_STORAGE_LOCAL_DIRECTORY", defaultValue: "", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "RUN_DATA_STORAGE_S3_ACCESS_KEY_ID", defaultValue: "", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "RUN_DATA_STORAGE_S3_BUCKET", defaultValue: "", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "RUN_DATA_STORAGE_S3_PREFIX", defaultValue: "spec-factory-runs", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "RUN_DATA_STORAGE_S3_REGION", defaultValue: "us-east-2", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "RUN_DATA_STORAGE_S3_SECRET_ACCESS_KEY", defaultValue: "", type: "string", secret: true, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "RUN_DATA_STORAGE_S3_SESSION_TOKEN", defaultValue: "", type: "string", secret: true, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "S3_BUCKET", defaultValue: "my-spec-harvester-data", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "S3_DATA_BUCKET", defaultValue: "eggamer-data", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "S3_INPUT_PREFIX", defaultValue: "specs/inputs", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." },
    { key: "S3_OUTPUT_PREFIX", defaultValue: "specs/outputs", type: "string", secret: false, userMutable: false, description: "System-level setting. User/domain-generated values must not be stored here." }
  ]),
});
