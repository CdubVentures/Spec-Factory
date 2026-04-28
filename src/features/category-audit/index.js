/**
 * category-audit public API.
 *
 * Category-level audit report generator. Produces paired HTML + Markdown
 * artifacts describing every input a prompt consumer (keyFinder today,
 * indexing pipeline tomorrow) sees for every field in a category — so an
 * auditor can improve contract shapes and extraction guidance iteratively.
 */

export { generateCategoryAuditReport } from './reportBuilder.js';
export { generatePerKeyDocs } from './perKeyDocBuilder.js';
export { generatePromptAuditReports } from './promptAuditReportBuilder.js';
export { generateKeysOrderAuditReport } from './keysOrderReportBuilder.js';
export { extractReportData } from './reportData.js';
export { extractPromptAuditData } from './promptAuditData.js';
export {
  FIELD_STUDIO_PATCH_SCHEMA_VERSION,
  applyFieldStudioPatchDocument,
  applyFieldStudioPatchDocuments,
  expectedFieldStudioPatchFileName,
  importFieldStudioPatchDirectory,
  loadFieldStudioPatchDocuments,
  parseFieldStudioPatchFileName,
  validateFieldStudioPatchDocument,
} from './fieldStudioPatch.js';
export {
  KEY_ORDER_PATCH_SCHEMA_VERSION,
  applyKeyOrderPatchDocument,
  buildKeyOrderPatchChangeLog,
  expectedKeyOrderPatchFileName,
  parseKeyOrderPatchPayloadFiles,
  previewKeyOrderPatchDocument,
  validateKeyOrderPatchDocument,
} from './keyOrderPatch.js';
export { registerCategoryAuditRoutes } from './api/categoryAuditRoutes.js';
