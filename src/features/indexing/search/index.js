// WHY: Re-export shim — canonical imports are now in pipeline phase folders.
// Search Profile -> pipeline/searchProfile/
// Search Execution -> pipeline/searchExecution/
export { searchSearxng } from '../pipeline/searchExecution/searchSearxng.js';
export {
  runSearchProviders,
  searchEngineAvailability,
  normalizeSearchEngines,
} from '../pipeline/searchExecution/searchProviders.js';
export {
  buildDeterministicAliases,
  buildSearchProfile,
  buildTargetedQueries,
} from '../pipeline/searchProfile/queryBuilder.js';
export { dedupeSerpResults } from '../pipeline/searchExecution/serpDedupe.js';
export { evaluateSearchLoopStop } from '../pipeline/searchExecution/searchLoop.js';
export { searchGoogle } from '../pipeline/searchExecution/searchGoogle.js';
export { searchSerper } from '../pipeline/searchExecution/searchSerper.js';
export { searchBrave } from '../pipeline/searchExecution/searchBrave.js';
