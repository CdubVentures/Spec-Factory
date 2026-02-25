import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import type { PrefetchLlmCall, BrandResolutionData, BrandCandidate, PrefetchLiveSettings } from '../types';
import { llmCallStatusBadgeClass, formatMs, pctString } from '../helpers';
import { ScoreBar } from '../components/ScoreBar';
import { StatCard } from '../components/StatCard';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';
import { Tip } from '../../../components/common/Tip';

interface PrefetchBrandResolverPanelProps {
  calls: PrefetchLlmCall[];
  brandResolution?: BrandResolutionData | null;
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
}

const SKIP_REASON_LABELS: Record<string, string> = {
  no_brand_in_identity_lock: 'No brand name was found in the product identity lock.',
  llm_disabled: 'LLM processing is turned off in the current configuration.',
  no_api_key_for_triage_role: 'No API key is configured for the triage LLM role.',
};

function statusBadgeClass(status: string) {
  switch (status) {
    case 'resolved':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
    case 'resolved_empty':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'skipped':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

function confidenceColorClass(confidence: number): string {
  if (confidence >= 0.8) return 'text-emerald-500';
  if (confidence >= 0.5) return 'text-yellow-500';
  return 'text-red-400';
}


function buildReasoningBullets(br: BrandResolutionData): string[] {
  const reasoning = br.reasoning ?? [];
  if (reasoning.length > 0) return reasoning;

  const bullets: string[] = [];
  if (br.official_domain) {
    bullets.push(`Resolved official domain: ${br.official_domain}`);
  }
  if (br.confidence > 0) {
    bullets.push(`Confidence: ${Math.round(br.confidence * 100)}%`);
  }
  if (br.aliases.length > 0) {
    bullets.push(`${br.aliases.length} alias${br.aliases.length > 1 ? 'es' : ''} identified: ${br.aliases.join(', ')}`);
  }
  if (br.support_domain) {
    bullets.push(`Support domain: ${br.support_domain}`);
  }
  return bullets;
}

function sourceLabel(calls: PrefetchLlmCall[], hasResolution: boolean): { text: string; badgeClass: string } {
  if (!hasResolution) return { text: '', badgeClass: '' };
  if (calls.length === 0) return { text: 'Cache', badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' };
  return { text: 'LLM', badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' };
}

function CandidateDrawer({ candidate, call, onClose }: { candidate: BrandCandidate; call?: PrefetchLlmCall; onClose: () => void }) {
  return (
    <DrawerShell title={candidate.name} subtitle="Brand Candidate" onClose={onClose}>
      <DrawerSection title="Confidence">
        <ScoreBar value={candidate.confidence} max={1} label={candidate.confidence.toFixed(2)} />
      </DrawerSection>
      {candidate.evidence_snippets.length > 0 && (
        <DrawerSection title="Evidence Snippets">
          <div className="space-y-1">
            {candidate.evidence_snippets.map((s, i) => (
              <div key={i} className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded p-2 italic">
                "{s}"
              </div>
            ))}
          </div>
        </DrawerSection>
      )}
      {candidate.disambiguation_note && (
        <DrawerSection title="Disambiguation">
          <div className="text-xs text-gray-600 dark:text-gray-400">{candidate.disambiguation_note}</div>
        </DrawerSection>
      )}
      {call && (
        <DrawerSection title="LLM Context">
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span className="text-gray-500">Model</span>
            <span className="font-mono">{call.model || '-'}</span>
            <span className="text-gray-500">Provider</span>
            <span className="font-mono">{call.provider || '-'}</span>
          </div>
        </DrawerSection>
      )}
    </DrawerShell>
  );
}

export function PrefetchBrandResolverPanel({ calls, brandResolution, persistScope, liveSettings }: PrefetchBrandResolverPanelProps) {
  const br = brandResolution;
  const candidateValues = useMemo(
    () => (br?.candidates ?? []).map((candidate) => candidate.name),
    [br?.candidates],
  );
  const [selectedCandidateName, setSelectedCandidateName] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:brandResolver:selectedCandidate:${persistScope}`,
    null,
    { validValues: candidateValues },
  );
  const selectedCandidate = useMemo(
    () => (selectedCandidateName ? (br?.candidates ?? []).find((candidate) => candidate.name === selectedCandidateName) ?? null : null),
    [br?.candidates, selectedCandidateName],
  );
  const hasStructured = br !== null && br !== undefined;
  const status = br?.status || '';
  const isResolved = status === 'resolved';
  const isSkipped = status === 'skipped';
  const isFailed = status === 'failed';
  const isResolvedEmpty = status === 'resolved_empty';
  const isLowConfidence = isResolved && br!.confidence < 0.7;
  const hasOfficialDomain = hasStructured && Boolean(br.official_domain);

  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);
  const source = sourceLabel(calls, hasStructured && (isResolved || isResolvedEmpty));

  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Brand Resolver</h3>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#128270;</div>
          <div className="text-sm font-medium text-gray-600 dark:text-gray-300">Waiting for brand resolution</div>
          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-md leading-relaxed">
            Brand resolution will appear after the LLM identifies the official manufacturer domain and aliases.
            This allows search queries to use targeted site: filters for higher-quality Tier 1 sources.
          </p>
          {liveSettings?.phase2LlmEnabled !== undefined && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${liveSettings.phase2LlmEnabled ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
              LLM: {liveSettings.phase2LlmEnabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      {/* A) Header */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Brand Resolver
          <Tip text="The Brand Resolver identifies the official manufacturer domain and aliases so search queries can use targeted site: filters for higher-quality sources." />
        </h3>
        {status && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadgeClass(status)}`}>
            {status === 'resolved_empty' ? 'no domain found' : status}
          </span>
        )}
        {!status && calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${llmCallStatusBadgeClass(calls[0].status)}`}>
            {calls[0].status}
          </span>
        )}
        {liveSettings?.phase2LlmEnabled !== undefined && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            liveSettings.phase2LlmEnabled
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
              : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            LLM: {liveSettings.phase2LlmEnabled ? 'ON' : 'OFF'}
          </span>
        )}
        {source.text && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${source.badgeClass} ml-auto`}>
            Source: {source.text}
          </span>
        )}
      </div>

      {/* Skipped Banner */}
      {isSkipped && (
        <div className="px-4 py-3 rounded bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-center">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Brand resolution was skipped</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {SKIP_REASON_LABELS[br?.skip_reason || ''] || br?.skip_reason || 'Unknown reason'}
          </div>
        </div>
      )}

      {/* Failed Banner */}
      {isFailed && (
        <div className="px-4 py-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="text-sm font-medium text-red-700 dark:text-red-300">Brand resolution failed</div>
          <div className="text-xs text-red-500 dark:text-red-400 mt-1">
            {br?.skip_reason || 'The LLM call did not return a usable result.'}
          </div>
          {br?.brand && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Brand attempted: {br.brand}</div>
          )}
        </div>
      )}

      {/* Resolved Empty Banner */}
      {isResolvedEmpty && (
        <div className="px-4 py-3 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <div className="text-sm font-medium text-yellow-700 dark:text-yellow-300">No official domain found</div>
          <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
            The LLM was unable to identify an official website for "{br?.brand}".
            Search queries will use generic patterns instead of targeted site: filters.
          </div>
        </div>
      )}

      {/* B) Hero Canonical Brand Card */}
      {hasOfficialDomain && (() => {
        const bullets = buildReasoningBullets(br!);
        return (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{br!.brand}</div>
                <a href={`https://${br!.official_domain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 hover:underline">{br!.official_domain}</a>
                {br!.support_domain && (
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">Support: {br!.support_domain}</div>
                )}
                {br!.aliases.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {br!.aliases.map((a) => (
                      <span key={a} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-center shrink-0">
                <div className="relative w-16 h-16">
                  <svg viewBox="0 0 36 36" className="w-16 h-16 transform -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.5" fill="none"
                      stroke="currentColor"
                      className={confidenceColorClass(br!.confidence)}
                      strokeWidth="3"
                      strokeDasharray={`${br!.confidence * 97.4} 97.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-900 dark:text-gray-100">
                    {Math.round(br!.confidence * 100)}%
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Confidence</div>
              </div>
            </div>
            {bullets.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Why we believe this</div>
                <ul className="space-y-1">
                  {bullets.map((b, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                      <span className="text-emerald-500 mt-0.5 shrink-0">&#8226;</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      {/* C) StatCards Row */}
      {hasStructured && (isResolved || isResolvedEmpty) && (
        <div className="flex items-center gap-3 flex-wrap">
          <StatCard label="Confidence" value={pctString(br!.confidence)} tip="LLM confidence that the resolved brand and domain are correct. Below 70% triggers a low-confidence warning." />
          <StatCard label="Aliases" value={br!.aliases.length} tip="Known alternate names for this brand (e.g. 'Razer Inc', 'razer.com'). Used to match search results to the manufacturer." />
          <StatCard label="Candidates" value={br!.candidates.length} tip="Candidate manufacturer domains considered by the LLM before selecting the best match." />
          <StatCard label="LLM Calls" value={calls.length} tip="Number of LLM calls made during brand resolution. Usually one call unless retries were needed." />
          {totalTokens > 0 && <StatCard label="Tokens" value={totalTokens.toLocaleString()} tip="LLM tokens consumed (input + output) across all brand resolution calls." />}
          {totalDuration > 0 && <StatCard label="Duration" value={formatMs(totalDuration)} tip="Wall-clock time for the brand resolution step." />}
        </div>
      )}

      {/* D) Disambiguation Banner */}
      {isLowConfidence && (
        <div className="px-3 py-2 rounded bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800">
          <div className="text-xs font-medium text-orange-700 dark:text-orange-300">
            Low confidence ({Math.round(br!.confidence * 100)}%) — brand identity may be ambiguous
          </div>
          <div className="text-[10px] text-orange-600 dark:text-orange-400 mt-1">
            Impact: Search queries will use generic patterns instead of targeted site: filters,
            reducing the chance of finding official manufacturer specification pages.
          </div>
          {br!.candidates.length > 0 && (
            <div className="text-[10px] text-orange-600 dark:text-orange-400 mt-0.5">
              Review the {br!.candidates.length} candidate{br!.candidates.length > 1 ? 's' : ''} below for alternative brand identities.
            </div>
          )}
        </div>
      )}

      {/* E) Candidates Table */}
      {hasStructured && br.candidates.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Brand Candidates</div>
          <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium w-32">Confidence</th>
                  <th className="text-left px-3 py-2 font-medium">Evidence</th>
                  <th className="text-left px-3 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {br.candidates.map((c, i) => (
                  <tr
                    key={i}
                    className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
                    onClick={() => setSelectedCandidateName(selectedCandidateName === c.name ? null : c.name)}
                  >
                    <td className="px-3 py-1.5 font-medium text-gray-900 dark:text-gray-100">{c.name}</td>
                    <td className="px-3 py-1.5">
                      <ScoreBar value={c.confidence} max={1} label={c.confidence.toFixed(2)} />
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{c.evidence_snippets.length} snippets</td>
                    <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 truncate max-w-[12rem]">{c.disambiguation_note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedCandidate && (
        <CandidateDrawer
          candidate={selectedCandidate}
          call={calls[0]}
          onClose={() => setSelectedCandidateName(null)}
        />
      )}

      {/* F) LLM Call Details (collapsible) */}
      {calls.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium">
            LLM Call Details ({calls.length} call{calls.length > 1 ? 's' : ''})
          </summary>
          <div className="mt-2 space-y-2">
            {calls.map((call, i) => (
              <div key={i} className="border border-gray-200 dark:border-gray-700 rounded p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${llmCallStatusBadgeClass(call.status)}`}>
                    {call.status}
                  </span>
                  {call.model && (
                    <span className="text-[10px] font-mono text-gray-600 dark:text-gray-400">{call.model}</span>
                  )}
                  {call.provider && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{call.provider}</span>
                  )}
                  <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
                    {call.tokens ? `${call.tokens.input}+${call.tokens.output} tok` : ''}
                    {call.duration_ms ? ` | ${formatMs(call.duration_ms)}` : ''}
                  </span>
                </div>
                {call.error && (
                  <div className="text-[10px] text-red-500 dark:text-red-400 mt-1">{call.error}</div>
                )}
                {call.prompt_preview && (
                  <div className="mt-2">
                    <div className="text-[10px] font-medium text-gray-400 uppercase">Prompt</div>
                    <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.prompt_preview}</pre>
                  </div>
                )}
                {call.response_preview && (
                  <div className="mt-1">
                    <div className="text-[10px] font-medium text-gray-400 uppercase">Response</div>
                    <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.response_preview}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* G) Debug: Raw JSON (collapsible) */}
      {hasStructured && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            Debug: Raw JSON
          </summary>
          <div className="mt-2">
            <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-40 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{JSON.stringify(br, null, 2)}</pre>
          </div>
        </details>
      )}
    </div>
  );
}
