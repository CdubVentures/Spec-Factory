import { useState } from 'react';
import type { PrefetchLlmCall, BrandResolutionData, BrandCandidate } from '../types';
import { llmCallStatusBadgeClass, formatMs, confidenceBarWidth } from '../helpers';
import { ScoreBar } from '../components/ScoreBar';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';

interface PrefetchBrandResolverPanelProps {
  calls: PrefetchLlmCall[];
  brandResolution?: BrandResolutionData | null;
}

function CandidateDrawer({ candidate, onClose }: { candidate: BrandCandidate; onClose: () => void }) {
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
    </DrawerShell>
  );
}

export function PrefetchBrandResolverPanel({ calls, brandResolution }: PrefetchBrandResolverPanelProps) {
  const [selectedCandidate, setSelectedCandidate] = useState<BrandCandidate | null>(null);
  const br = brandResolution;
  const hasStructured = br !== null && br !== undefined;
  const isLowConfidence = hasStructured && br.confidence < 0.7;

  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);

  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Brand Resolver</h3>
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No brand resolution data yet. This LLM step resolves the official brand name and domain.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Brand Resolver</h3>
        {calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${llmCallStatusBadgeClass(calls[0].status)}`}>
            {calls[0].status}
          </span>
        )}
      </div>

      {/* Hero Canonical Brand Card */}
      {hasStructured && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{br.brand}</div>
              {br.official_domain && (
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{br.official_domain}</div>
              )}
              {br.support_domain && (
                <div className="text-[10px] text-gray-400 dark:text-gray-500">Support: {br.support_domain}</div>
              )}
              {br.aliases.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {br.aliases.map((a) => (
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
                    className={br.confidence >= 0.8 ? 'text-emerald-500' : br.confidence >= 0.5 ? 'text-yellow-500' : 'text-red-400'}
                    strokeWidth="3"
                    strokeDasharray={`${br.confidence * 97.4} 97.4`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-900 dark:text-gray-100">
                  {Math.round(br.confidence * 100)}%
                </div>
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Confidence</div>
            </div>
          </div>
        </div>
      )}

      {/* Disambiguation Banner */}
      {isLowConfidence && (
        <div className="px-3 py-2 rounded bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 text-xs text-orange-700 dark:text-orange-300">
          Low confidence ({Math.round(br!.confidence * 100)}%) - brand identity may be ambiguous. Review candidates below.
        </div>
      )}

      {/* Candidates Table */}
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
                    onClick={() => setSelectedCandidate(c)}
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
        <CandidateDrawer candidate={selectedCandidate} onClose={() => setSelectedCandidate(null)} />
      )}

      {/* LLM Call Stats */}
      {calls.length > 0 && (
        <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
          <span>{calls.length} LLM call{calls.length > 1 ? 's' : ''}</span>
          {totalTokens > 0 && <span>{totalTokens.toLocaleString()} tokens</span>}
          {totalDuration > 0 && <span>{formatMs(totalDuration)}</span>}
        </div>
      )}

      {/* Debug Section */}
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          Debug: LLM Prompt/Response
        </summary>
        <div className="mt-2 space-y-2">
          {calls.map((call, i) => (
            <div key={i} className="space-y-1">
              {call.prompt_preview && (
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase">Prompt</div>
                  <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.prompt_preview}</pre>
                </div>
              )}
              {call.response_preview && (
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase">Response</div>
                  <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.response_preview}</pre>
                </div>
              )}
            </div>
          ))}
          {hasStructured && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 uppercase">Structured Data</div>
              <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{JSON.stringify(br, null, 2)}</pre>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
