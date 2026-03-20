import {
  readIndexLabRunEvents,
  readIndexLabRunSearchProfile,
  readIndexLabRunMeta,
  readIndexLabRunSourceIndexingPackets,
  resolveIndexLabRunDirectory,
} from './index.js';

export function createRuntimeOpsRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, toInt, INDEXLAB_ROOT, OUTPUT_ROOT, config, storage,
    processStatus, getLastScreencastFrame, safeReadJson, safeJoin, path,
    getIndexLabRoot,
  } = options;

  return {
    jsonRes, toInt, INDEXLAB_ROOT, OUTPUT_ROOT, config, storage,
    getIndexLabRoot,
    readIndexLabRunEvents, readIndexLabRunSearchProfile, readIndexLabRunMeta,
    readIndexLabRunSourceIndexingPackets, resolveIndexLabRunDirectory,
    processStatus, getLastScreencastFrame, safeReadJson, safeJoin, path,
  };
}
