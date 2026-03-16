// WHY: Compute the 5 mandatory verdicts from section check results.
// Per doc: GREEN / PARTIAL / RED. Blocker RED cascades to all verdicts.

import { SECTION_IDS, VERDICT_IDS, sectionToVerdict } from './checkCatalog.js';

export const VERDICT_STATUS = Object.freeze(['GREEN', 'PARTIAL', 'RED']);

const BLOCKER_SECTIONS = Object.freeze(['RB-0', 'RB-1']);

const VERDICT_SECTIONS = Object.freeze({
  defaults_aligned: ['RB-0', 'RB-1', 'S1'],
  crawl_alive:      ['S2', 'S3', 'S4', 'S8', 'S9', 'S10'],
  parser_alive:     ['S5'],
  extraction_alive: ['S6', 'S11'],
  publishable_alive: ['S7', 'S12'],
});

export function aggregateSectionResult(checkResults) {
  let pass = 0;
  let fail = 0;
  let skip = 0;
  for (const r of checkResults) {
    if (r.status === 'pass') pass++;
    else if (r.status === 'fail') fail++;
    else skip++;
  }
  let status = 'GREEN';
  if (fail > 0) status = 'RED';
  else if (skip > 0) status = 'PARTIAL';
  return { status, pass_count: pass, fail_count: fail, skip_count: skip };
}

export function computeSingleVerdict(verdictId, sectionResults) {
  const sections = VERDICT_SECTIONS[verdictId] || [];
  let worst = 'GREEN';
  for (const sId of sections) {
    const sr = sectionResults[sId];
    if (!sr) { worst = 'PARTIAL'; continue; }
    if (sr.status === 'RED') return 'RED';
    if (sr.status === 'PARTIAL' && worst !== 'RED') worst = 'PARTIAL';
  }
  return worst;
}

export function computeVerdicts(sectionResults) {
  // Blocker rule: if any blocker section RED, all verdicts RED
  const blockerRed = BLOCKER_SECTIONS.some((s) => sectionResults[s]?.status === 'RED');
  if (blockerRed) {
    return Object.fromEntries(VERDICT_IDS.map((v) => [v, 'RED']));
  }

  const result = {};
  for (const vId of VERDICT_IDS) {
    result[vId] = computeSingleVerdict(vId, sectionResults);
  }
  return result;
}
