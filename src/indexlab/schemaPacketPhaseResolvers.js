/**
 * Phase resolution helpers for indexing schema packets.
 * Maps extraction methods to phase IDs and surfaces.
 * Extracted from indexingSchemaPackets.js (P4 decomposition).
 */
import { toInt } from '../shared/valueNormalizers.js';

export const PHASE_IDS = [
  'phase_01_static_html',
  'phase_02_dynamic_js',
  'phase_03_main_article',
  'phase_04_html_spec_table',
  'phase_05_embedded_json',
  'phase_06_text_pdf',
  'phase_07_scanned_pdf_ocr',
  'phase_08_image_ocr',
  'phase_09_chart_graph',
  'phase_10_office_mixed_doc'
];

export function phaseFromMethod(method = '') {
  const token = String(method || '').trim().toLowerCase();
  if (!token) return 'phase_01_static_html';
  if (
    token.includes('network')
    || token.includes('json')
    || token.includes('embedded_state')
    || token.includes('ldjson')
    || token.includes('microdata')
    || token.includes('opengraph')
    || token.includes('microformat')
    || token.includes('rdfa')
    || token.includes('twitter_card')
  ) {
    return 'phase_05_embedded_json';
  }
  if (token.includes('article')) return 'phase_03_main_article';
  if (token.includes('scanned_pdf_ocr')) return 'phase_07_scanned_pdf_ocr';
  if (token.includes('pdf')) return 'phase_06_text_pdf';
  if (token.includes('table') || token.includes('spec')) return 'phase_04_html_spec_table';
  if (token.includes('ocr') || token.includes('image') || token.includes('screenshot')) return 'phase_08_image_ocr';
  if (token.includes('chart')) return 'phase_09_chart_graph';
  if (token.includes('office') || token.includes('xlsx') || token.includes('docx') || token.includes('pptx')) {
    return 'phase_10_office_mixed_doc';
  }
  if (token.includes('graphql') || token.includes('dynamic') || token.includes('playwright') || token.includes('js')) {
    return 'phase_02_dynamic_js';
  }
  return 'phase_01_static_html';
}

export function sourceSurfaceFromMethod(method = '') {
  const token = String(method || '').trim().toLowerCase();
  if (!token) return 'static_dom';
  if (token.includes('network_json') || token === 'adapter_api') return 'network_json';
  if (token.includes('graphql')) return 'graphql_replay';
  if (token.includes('ldjson') || token.includes('json_ld')) return 'json_ld';
  if (token.includes('embedded_state')) return 'embedded_state';
  if (token.includes('microdata')) return 'microdata';
  if (token.includes('opengraph')) return 'opengraph';
  if (token.includes('microformat')) return 'microformat';
  if (token.includes('rdfa')) return 'rdfa';
  if (token.includes('twitter_card')) return 'twitter_card';
  if (token.includes('article')) return 'main_article';
  if (token.includes('scanned_pdf_ocr_table')) return 'scanned_pdf_ocr_table';
  if (token.includes('scanned_pdf_ocr_kv')) return 'scanned_pdf_ocr_kv';
  if (token.includes('scanned_pdf_ocr_text')) return 'scanned_pdf_ocr_text';
  if (token.includes('pdf_table')) return 'pdf_table';
  if (token.includes('pdf_kv')) return 'pdf_kv';
  if (token === 'pdf') return 'pdf_text';
  if (token.includes('html_table') || token.includes('spec_table') || token.includes('table')) return 'html_spec_table';
  if (token.includes('screenshot')) return 'screenshot_capture';
  if (token.includes('image_ocr')) return 'image_ocr_text';
  if (token.includes('chart')) return 'chart_script_config';
  if (token.includes('office_docx')) return 'office_docx';
  if (token.includes('office_xlsx')) return 'office_xlsx';
  if (token.includes('office_pptx')) return 'office_pptx';
  if (token.includes('office')) return 'office_mixed';
  if (token.includes('dynamic') || token.includes('llm')) return 'dynamic_dom';
  return 'static_dom';
}

export function normalizeFetchStatus(status = 0) {
  const code = toInt(status, 0);
  if (code >= 200 && code < 300) return 'fetched';
  if (code === 403 || code === 429) return 'blocked';
  if (code > 0) return 'failed';
  return 'partial';
}

export function blockedReasonForStatus(status = 0) {
  const code = toInt(status, 0);
  if (code === 403) return 'forbidden';
  if (code === 404 || code === 410) return 'not_found';
  if (code === 429) return 'rate_limited';
  if (code >= 500) return 'server_error';
  if (code > 0 && (code < 200 || code >= 300)) return `http_${code}`;
  return '';
}

export function defaultPhaseLineage(phaseIds = []) {
  const out = {};
  for (const phaseId of PHASE_IDS) {
    out[phaseId] = phaseIds.includes(phaseId);
  }
  return out;
}

export function emptyRunPhaseSummary() {
  return PHASE_IDS.reduce((acc, phaseId) => {
    acc[phaseId] = {
      enabled: true,
      executed_sources: 0,
      assertion_count: 0,
      evidence_count: 0,
      error_count: 0,
      duration_ms: 0
    };
    return acc;
  }, {});
}
