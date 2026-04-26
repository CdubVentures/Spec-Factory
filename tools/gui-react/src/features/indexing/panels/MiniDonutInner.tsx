import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const C_TT_BG = 'var(--sf-token-overlay-strong)';

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-';
}

interface MiniDonutInnerProps {
  title: string;
  data: Array<{ name: string; value: number; color: string }>;
}

export default function MiniDonutInner({ title, data }: MiniDonutInnerProps) {
  if (data.length === 0) return (
    <div className="sf-surface-card rounded-lg p-4 text-center sf-text-muted sf-text-caption">
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-2">{title}</div>
      <span>No data</span>
    </div>
  );
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="sf-surface-card rounded-lg p-4">
      <div className="text-[11px] font-semibold sf-text-muted uppercase tracking-wide mb-2">{title}</div>
      <div className="flex items-center gap-3">
        <ResponsiveContainer width={100} height={100}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={46} paddingAngle={2} dataKey="value">
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={{ background: C_TT_BG, border: 'none', fontSize: 11, borderRadius: 6 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-1.5 min-w-0">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
              <span className="font-semibold tabular-nums">{d.value}</span>
              <span className="sf-text-muted truncate">{d.name}</span>
              <span className="sf-text-subtle text-[9px]">({pct(d.value, total)})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
