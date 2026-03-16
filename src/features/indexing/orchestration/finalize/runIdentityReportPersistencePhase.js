export async function runIdentityReportPersistencePhase({
  storage,
  runBase = '',
  summary = {},
  identityReport = {},
} = {}) {
  const identityReportKey = `${runBase}/identity_report.json`;
  summary.identity_report = {
    ...(summary.identity_report || {}),
    key: identityReportKey,
  };
  await storage.writeObject(
    identityReportKey,
    Buffer.from(JSON.stringify(identityReport, null, 2), 'utf8'),
    { contentType: 'application/json' },
  );
  return identityReportKey;
}
