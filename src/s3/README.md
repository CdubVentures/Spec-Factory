## Purpose

Abstraction over local filesystem and AWS S3 for structured artifact storage. Enables single-code-path I/O for both development (local) and production (S3).

## Public API (The Contract)

- `storage.js` → `createStorage(config)` — factory returning S3Storage or LocalStorage (identical API)
- `storage.js` → `toPosixKey(...parts)` — normalizes path separators to forward slash
- S3Storage and LocalStorage are internal — consumers use the factory only

Shared API surface (both backends):
- `listKeys(category)`, `listInputKeys(category)`
- `readJsonOrNull(key)`, `readTextOrNull(key)`
- `writeObject(key, buffer, { contentType })`
- `resolveOutputKey(prefix, category, filename)`
- `objectExists(key)`, `deleteObject(key)`

## Dependencies

- Allowed: AWS SDK (`@aws-sdk/client-s3`), `node:fs/promises`, `node:path`, `src/shared/storageKeyPrefixes.js`
- Forbidden: Direct imports of S3Client outside this module

## Domain Invariants

- Both S3Storage and LocalStorage implement identical public interface.
- Key prefixes are SSOT: `INPUT_KEY_PREFIX`, `OUTPUT_KEY_PREFIX` from `src/shared/storageKeyPrefixes.js`.
- Missing-key reads (404/ENOENT) return `null`, never throw.
- Storage backend selection is config-driven via `config.outputMode` (`'s3'` or default local).
