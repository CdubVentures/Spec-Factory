import { useRef, useEffect } from 'react';

interface ProcessOutputProps {
  lines: string[];
  maxHeight?: string;
}

export function ProcessOutput({ lines, maxHeight = 'max-h-60' }: ProcessOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Process Output</h3>
      <pre className={`text-xs font-mono sf-bg-surface-soft sf-dk-surface-900 sf-dk-fg-100 p-3 rounded overflow-auto ${maxHeight}`}>
        {lines.length > 0 ? lines.map((line, i) => (
          <div key={i} className={line.includes('ERROR') || line.includes('error') ? 'sf-status-text-danger' : ''}>
            {line}
          </div>
        )) : <span className="sf-text-muted">(no output)</span>}
        <div ref={bottomRef} />
      </pre>
    </div>
  );
}
