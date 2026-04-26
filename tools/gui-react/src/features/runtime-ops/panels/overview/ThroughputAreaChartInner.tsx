import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis,
  Tooltip as RechartsTooltip, CartesianGrid,
} from 'recharts';

interface ThroughputPoint {
  ts: string;
  docs: number;
  fields: number;
}

interface ThroughputAreaChartInnerProps {
  throughputHistory: ThroughputPoint[];
}

export default function ThroughputAreaChartInner({ throughputHistory }: ThroughputAreaChartInnerProps) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={throughputHistory}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
        <XAxis dataKey="ts" tick={false} />
        <YAxis tick={{ fontSize: 10 }} width={32} />
        <RechartsTooltip labelFormatter={() => ''} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
        <Area type="monotone" dataKey="fields" stroke="var(--sf-token-accent)" fill="var(--sf-token-accent-bg)" strokeWidth={2} name="Fields / min" />
        <Area type="monotone" dataKey="docs" stroke="var(--sf-token-state-success-fg)" fill="var(--sf-token-state-success-bg)" strokeWidth={2} name="Docs / min" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
