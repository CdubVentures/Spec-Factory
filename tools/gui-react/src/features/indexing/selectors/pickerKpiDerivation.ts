import type { CatalogRow } from '../../../types/product.ts';

export type KpiBarTone = 'good' | 'warn' | 'weak' | 'neutral';

export interface KpiTileData {
  key: 'confidence' | 'coverage' | 'fields';
  label: string;
  value: string;
  unit?: string;
  barPct: number;
  barTone: KpiBarTone;
  sub: string;
}

const CONFIDENCE_PASS = 0.80;
const CONFIDENCE_WARN = 0.60;
const COVERAGE_PASS = 0.80;
const COVERAGE_WARN = 0.60;

function toneFromRatio(value: number, passAt: number, warnAt: number): KpiBarTone {
  if (!Number.isFinite(value)) return 'neutral';
  if (value >= passAt) return 'good';
  if (value >= warnAt) return 'warn';
  return 'weak';
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function derivePickerKpis(row: CatalogRow | null): KpiTileData[] {
  if (!row) return [];

  const confidence = Number(row.confidence) || 0;
  const coverage = Number(row.coverage) || 0;
  const fieldsFilled = Number(row.fieldsFilled) || 0;
  const fieldsTotal = Number(row.fieldsTotal) || 0;

  const tiles: KpiTileData[] = [
    {
      key: 'confidence',
      label: 'confidence',
      value: confidence.toFixed(2),
      barPct: clampPct(confidence * 100),
      barTone: toneFromRatio(confidence, CONFIDENCE_PASS, CONFIDENCE_WARN),
      sub: confidence >= CONFIDENCE_PASS
        ? `pass \u00b7 target ${CONFIDENCE_PASS.toFixed(2)}`
        : `below target ${CONFIDENCE_PASS.toFixed(2)}`,
    },
    {
      key: 'coverage',
      label: 'coverage',
      value: String(Math.round(coverage * 100)),
      unit: '%',
      barPct: clampPct(coverage * 100),
      barTone: toneFromRatio(coverage, COVERAGE_PASS, COVERAGE_WARN),
      sub: coverage >= 1
        ? 'fully covered'
        : coverage >= COVERAGE_PASS
          ? 'minor gaps'
          : 'needs fill',
    },
    {
      key: 'fields',
      label: 'fields filled',
      value: String(fieldsFilled),
      unit: fieldsTotal > 0 ? `/ ${fieldsTotal}` : undefined,
      barPct: fieldsTotal > 0 ? clampPct((fieldsFilled / fieldsTotal) * 100) : 0,
      barTone: fieldsTotal > 0
        ? toneFromRatio(fieldsFilled / fieldsTotal, 0.9, 0.6)
        : 'neutral',
      sub: fieldsTotal > fieldsFilled
        ? `${fieldsTotal - fieldsFilled} empty`
        : fieldsTotal > 0
          ? 'all filled'
          : 'no fields',
    },
  ];

  return tiles;
}
