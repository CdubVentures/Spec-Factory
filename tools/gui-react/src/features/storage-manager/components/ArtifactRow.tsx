import type { RunSourceEntry } from '../types.ts';
import { formatBytes } from '../helpers.ts';

interface ArtifactRowProps {
  source: RunSourceEntry;
}

export function ArtifactRow({ source }: ArtifactRowProps) {
  const artifacts: Array<{ label: string; file: string; size?: number }> = [];
  if (source.html_file) {
    artifacts.push({ label: 'HTML', file: source.html_file, size: source.html_size });
  }
  if (source.video_file) {
    artifacts.push({ label: 'Video', file: source.video_file, size: source.video_size });
  }
  if (source.screenshot_count > 0) {
    artifacts.push({ label: 'Screenshots', file: `${source.screenshot_count} capture(s)` });
  }

  if (artifacts.length === 0) return null;

  return (
    <div className="pl-16 py-1.5 space-y-1">
      {artifacts.map((a) => (
        <div key={a.label} className="flex items-center gap-3 text-[10px]">
          <span className="sf-text-muted w-[72px] shrink-0">{a.label}</span>
          <span className="font-mono sf-text-subtle truncate flex-1">{a.file}</span>
          {a.size != null && a.size > 0 && (
            <span className="font-mono sf-text-muted w-[56px] text-right shrink-0">
              {formatBytes(a.size)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
