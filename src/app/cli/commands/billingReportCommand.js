export function createBillingReportCommand({
  buildBillingReport,
}) {
  return async function commandBillingReport(config, storage, args) {
    const month = args.month || new Date().toISOString().slice(0, 7);
    const report = await buildBillingReport({
      storage,
      month,
      config,
    });
    return {
      command: 'billing-report',
      ...report,
    };
  };
}
