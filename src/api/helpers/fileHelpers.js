// WHY: Re-export from shared/ — canonical home is src/shared/fileHelpers.js.
// This shim exists so api-internal consumers keep working without path changes.
export {
  safeReadJson,
  safeStat,
  listDirs,
  listFiles,
  readJsonlEvents,
  readGzipJsonlEvents,
  parseNdjson,
  safeJoin,
} from '../../shared/fileHelpers.js';
