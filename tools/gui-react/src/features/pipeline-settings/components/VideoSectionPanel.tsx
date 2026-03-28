// WHY: Custom section panel for Video Recording that shows an ffmpeg
// dependency warning when the binary is missing. Delegates actual settings
// rendering to GenericSectionPanel — no duplicated setting logic.

import { useEffect, useState } from 'react';
import { GenericSectionPanel, type GenericSectionPanelProps } from './GenericSectionPanel.tsx';
import { api } from '../../../api/client.ts';

interface HealthResponse {
  ok: boolean;
  ffmpegAvailable: boolean;
}

export function VideoSectionPanel(props: GenericSectionPanelProps) {
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<HealthResponse>('/health')
      .then((data) => { if (!cancelled) setFfmpegAvailable(data.ffmpegAvailable ?? false); })
      .catch(() => { if (!cancelled) setFfmpegAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {ffmpegAvailable === false && (
        <div className="sf-callout sf-callout-warning" role="alert" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <strong>ffmpeg not installed — video trimming disabled</strong>
            <span className="sf-text-label">
              Recorded videos will include blank navigation and extraction noise instead of
              being trimmed to just the page content window.
            </span>
            <span className="sf-text-label" style={{ marginTop: 4 }}>
              Install: <code style={{ background: 'rgba(0,0,0,0.15)', padding: '2px 6px', borderRadius: 4 }}>winget install Gyan.FFmpeg</code> then restart the server.
            </span>
          </div>
        </div>
      )}
      <GenericSectionPanel {...props} />
    </>
  );
}
