import type { WorkerExtractionField, RuntimeOpsDocumentRow, PhaseStats } from '../types';

export interface PhaseDefinition {
  id: string;
  label: string;
  methods: string[];
}

export const PHASE_REGISTRY: PhaseDefinition[] = [
  { id: 'phase_01_static_html', label: 'Static HTML', methods: ['static_dom', 'dom'] },
  { id: 'phase_02_dynamic_js', label: 'Dynamic JS', methods: ['dynamic_dom', 'graphql_replay'] },
  { id: 'phase_03_main_article', label: 'Article Text', methods: ['main_article'] },
  { id: 'phase_04_html_spec_table', label: 'HTML Tables', methods: ['html_spec_table', 'html_table'] },
  { id: 'phase_05_embedded_json', label: 'Structured Meta', methods: ['json_ld', 'ldjson', 'embedded_state', 'microdata', 'opengraph', 'microformat', 'rdfa', 'twitter_card', 'network_json', 'adapter_api'] },
  { id: 'phase_06_text_pdf', label: 'Text PDF', methods: ['pdf_text', 'pdf_kv', 'pdf_table'] },
  { id: 'phase_07_scanned_pdf_ocr', label: 'Scanned PDF OCR', methods: ['scanned_pdf_ocr', 'scanned_pdf_ocr_text', 'scanned_pdf_ocr_kv', 'scanned_pdf_ocr_table'] },
  { id: 'phase_08_image_ocr', label: 'Image OCR', methods: ['image_ocr', 'screenshot_capture'] },
  { id: 'phase_09_chart_graph', label: 'Chart/Graph', methods: ['chart_payload'] },
  { id: 'phase_10_office_mixed_doc', label: 'Office Docs', methods: ['office_docx', 'office_xlsx', 'office_pptx', 'office_mixed'] },
];

export const CROSS_CUTTING_METHODS = [
  'llm_extract', 'llm_validate', 'deterministic_normalizer', 'consensus_policy_reducer',
];

const methodToPhaseId: Map<string, string> = new Map();
for (const phase of PHASE_REGISTRY) {
  for (const m of phase.methods) {
    methodToPhaseId.set(m, phase.id);
  }
}
const crossCuttingSet = new Set(CROSS_CUTTING_METHODS);

export function normalizePhaseMethod(method: string): string {
  const token = String(method || '').trim().toLowerCase();
  if (!token) return '';
  if (token === 'spec_table_match') return 'html_spec_table';
  if (token === 'component_db_inference') return 'static_dom';
  if (token === 'image_ocr_text') return 'image_ocr';
  if (token === 'chart_script_config') return 'chart_payload';
  if (token === 'readability' || token === 'heuristic_fallback' || token === 'article_text') {
    return 'main_article';
  }
  return token;
}

export function normalizePhaseLineagePhases(phases: PhaseStats[]): PhaseStats[] {
  return phases.map((phase) => ({
    ...phase,
    methods_used: Array.from(
      new Set((phase.methods_used ?? []).map((method) => normalizePhaseMethod(method)).filter(Boolean)),
    ).sort(),
  }));
}

export function computePhaseLineage(
  fields: WorkerExtractionField[],
  _documents: RuntimeOpsDocumentRow[],
): PhaseStats[] {
  const buckets: Record<string, {
    field_count: number;
    methods: Set<string>;
    confidences: number[];
    urls: Set<string>;
  }> = {};

  for (const phase of PHASE_REGISTRY) {
    buckets[phase.id] = { field_count: 0, methods: new Set(), confidences: [], urls: new Set() };
  }
  buckets['cross_cutting'] = { field_count: 0, methods: new Set(), confidences: [], urls: new Set() };

  for (const f of fields) {
    const normalizedMethod = normalizePhaseMethod(f.method || '');
    if (!normalizedMethod) continue;

    let bucketId: string;
    if (crossCuttingSet.has(normalizedMethod)) {
      bucketId = 'cross_cutting';
    } else {
      bucketId = methodToPhaseId.get(normalizedMethod) ?? 'phase_01_static_html';
    }

    const bucket = buckets[bucketId];
    if (!bucket) continue;
    bucket.field_count += 1;
    bucket.methods.add(normalizedMethod);
    bucket.confidences.push(f.confidence ?? 0);
    if (f.source_url) bucket.urls.add(f.source_url);
  }

  const allPhaseIds = [...PHASE_REGISTRY.map((p) => p.id), 'cross_cutting'];
  const labelMap: Record<string, string> = { cross_cutting: 'Post-Processing' };
  for (const p of PHASE_REGISTRY) labelMap[p.id] = p.label;

  return allPhaseIds.map((id) => {
    const b = buckets[id];
    const avgConf = b.confidences.length > 0
      ? Math.round((b.confidences.reduce((s, v) => s + v, 0) / b.confidences.length) * 100) / 100
      : 0;
    return {
      phase_id: id,
      phase_label: labelMap[id] ?? id,
      doc_count: b.urls.size,
      field_count: b.field_count,
      methods_used: Array.from(b.methods).sort(),
      confidence_avg: avgConf,
    };
  });
}

export function allPhaseMethods(): string[] {
  const methods: string[] = [];
  for (const phase of PHASE_REGISTRY) {
    methods.push(...phase.methods);
  }
  methods.push(...CROSS_CUTTING_METHODS);
  return methods;
}
