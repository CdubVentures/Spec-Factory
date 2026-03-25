interface DebugJsonDetailsProps {
  label: string;
  data: unknown;
}

export function DebugJsonDetails({ label, data }: DebugJsonDetailsProps) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer sf-summary-toggle flex items-baseline gap-2 pb-1.5 border-b border-dashed sf-border-soft select-none">
        <span className="text-[10px] font-semibold font-mono sf-text-subtle tracking-[0.04em] uppercase">debug &middot; {label}</span>
      </summary>
      <pre className="mt-3 sf-pre-block text-xs font-mono rounded-sm p-4 overflow-x-auto overflow-y-auto max-h-[25rem] whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
