export function buildIdentityReportPersistenceContext({
  storage,
  runBase,
  summary,
  identityReport,
} = {}) {
  return {
    storage,
    runBase,
    summary,
    identityReport,
  };
}
