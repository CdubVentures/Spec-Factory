import type { RunSourceEntry } from '../../types.ts';

interface ArtifactListProps {
  source: RunSourceEntry;
}

export function ArtifactList({ source }: ArtifactListProps) {
  const artifacts: Array<{ label: string; file: string }> = [];
  if (source.html_file) artifacts.push({ label: 'HTML', file: source.html_file });
  if (source.video_file) artifacts.push({ label: 'Video', file: source.video_file });
  if (source.screenshot_count > 0) {
    artifacts.push({ label: 'Screenshots', file: `${source.screenshot_count} capture(s)` });
  }

  return (
    <div className="pl-4 py-1.5 space-y-1">
      {artifacts.map((a) => (
        <div key={a.label} className="flex items-center gap-3 text-[10px]">
          <span className="sf-text-muted w-[72px] shrink-0">{a.label}</span>
          <span className="font-mono sf-text-subtle truncate">{a.file}</span>
        </div>
      ))}
      {artifacts.length === 0 && (
        <div className="text-[10px] sf-text-subtle">No artifacts</div>
      )}
    </div>
  );
}
