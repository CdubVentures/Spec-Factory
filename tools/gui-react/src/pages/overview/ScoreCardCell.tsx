import type { CatalogRow } from '../../types/product.ts';
import { computeScoreCard, type LetterGrade, type ScoreCardResult } from './scoreCard.ts';
import './ScoreCardCell.css';

const GRADE_TONE: Readonly<Record<LetterGrade, 'a' | 'b' | 'c' | 'd' | 'f'>> = {
  'A+': 'a', A: 'a', 'A-': 'a',
  'B+': 'b', B: 'b', 'B-': 'b',
  'C+': 'c', C: 'c', 'C-': 'c',
  'D+': 'd', D: 'd', 'D-': 'd',
  F: 'f',
};

function buildTooltip(r: ScoreCardResult): string {
  const { coverage, confidence, fields, cef, pif, sku, rdf } = r.breakdown;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return [
    `Score ${r.score.toFixed(1)}/100 (${r.letter})`,
    `Coverage ${pct(coverage)}  (weight 25)`,
    `Confidence ${pct(confidence)}  (weight 20)`,
    `Fields ${pct(fields)}  (weight 15)`,
    `PIF ${pct(pif)}  (weight 15)`,
    `CEF ${pct(cef)}  (weight 10)`,
    `SKU ${pct(sku)}  (weight 7.5)`,
    `RDF ${pct(rdf)}  (weight 7.5)`,
  ].join('\n');
}

export function ScoreCardCell({ row }: { row: CatalogRow }) {
  const result = computeScoreCard(row);
  const tone = GRADE_TONE[result.letter];
  return (
    <span className={`sf-scc-pill sf-scc-pill-${tone}`} title={buildTooltip(result)}>
      <span className="sf-scc-disc">
        <span className="sf-scc-disc-letter">{result.letter}</span>
      </span>
      <span className="sf-scc-meta">
        <span className="sf-scc-num">{result.score.toFixed(1)}</span>
        <span className="sf-scc-cap">GRADE</span>
      </span>
    </span>
  );
}
