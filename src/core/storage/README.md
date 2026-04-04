## Purpose

Local filesystem storage adapter for structured artifact I/O. Provides a key-based abstraction over the local filesystem for reading, writing, listing, and deleting pipeline artifacts.

## Public API (The Contract)

- `storage.js` → `createStorage(config)` — factory returning a LocalStorage instance
- `storage.js` → `toPosixKey(...parts)` — normalizes path parts to forward-slash keys

LocalStorage API surface:
- `listKeys(prefix)` — enumerate files under a prefix, returns sorted keys
- `readJson(key)`, `readText(key)`, `readBuffer(key)` — read operations
- `readJsonOrNull(key)`, `readTextOrNull(key)` — safe reads (ENOENT → null, corrupt JSON → null)
- `writeObject(key, body)` — write with automatic parent-directory creation
- `appendText(key, text)` — append with automatic parent-directory creation
- `objectExists(key)` — existence check
- `deleteObject(key)` — deletion (ENOENT silently ignored)
- `resolveOutputKey(...parts)` — build output key with prefix deduplication
- `resolveLocalPath(key)` — resolve key to local filesystem path

## Dependencies

- Allowed: `node:fs/promises`, `node:path`, `src/shared/settingsAccessor.js`, `src/shared/storageKeyPrefixes.js`
- Forbidden: feature internals, external packages

## Domain Invariants

- Missing-key reads (`readJsonOrNull`, `readTextOrNull`) return `null`, never throw on ENOENT.
- Corrupted JSON in `readJsonOrNull` returns `null` (SyntaxError swallowed).
- Key prefix is SSOT: `OUTPUT_KEY_PREFIX` from `src/shared/storageKeyPrefixes.js`.
- `resolveOutputKey` prevents double-prefix nesting.
- `createStorage` always returns LocalStorage.
