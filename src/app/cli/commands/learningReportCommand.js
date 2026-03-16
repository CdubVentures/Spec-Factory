export function createLearningReportCommand({
  buildLearningReport,
}) {
  return async function commandLearningReport(_config, storage, args) {
    const category = String(args.category || 'mouse').trim();
    const report = await buildLearningReport({
      storage,
      category,
    });
    return {
      command: 'learning-report',
      ...report,
    };
  };
}
