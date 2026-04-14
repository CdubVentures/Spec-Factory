export function createBillingReportCommand({
  buildBillingReport,
}) {
  return function commandBillingReport(config, storage, args) {
    const month = args.month || new Date().toISOString().slice(0, 7);
    const report = buildBillingReport({
      month,
      config,
      appDb: config.appDb || null,
    });
    return {
      command: 'billing-report',
      ...report,
    };
  };
}
