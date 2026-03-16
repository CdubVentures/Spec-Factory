interface KpiStripCard {
  label: string;
  value: string;
  chipClass?: string;
  tip?: string;
}

interface KpiStripProps {
  cards: KpiStripCard[];
}

export function KpiStrip({ cards }: KpiStripProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {cards.map((card) => (
        <div
          key={card.label}
          className="sf-surface-elevated p-3 rounded"
          title={card.tip}
        >
          <div className="sf-text-caption sf-text-muted uppercase tracking-wider">
            {card.label}
          </div>
          <div className="text-lg font-bold font-mono sf-text-primary">
            {card.chipClass ? (
              <span className={card.chipClass}>{card.value}</span>
            ) : (
              card.value
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
