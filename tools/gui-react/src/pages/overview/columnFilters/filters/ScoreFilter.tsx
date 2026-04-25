import {
  useColumnFilterStore,
  selectFilterState,
  type GradeBucket,
} from '../columnFilterStore.ts';
import './FilterControls.css';

const GRADES: readonly GradeBucket[] = ['A', 'B', 'C', 'D', 'F'];

export function ScoreFilter({ category }: { category: string }) {
  const filterState = useColumnFilterStore(selectFilterState(category));
  const patch = useColumnFilterStore((s) => s.patch);
  const selected = filterState.score;

  const toggle = (grade: GradeBucket) => {
    const next = selected.includes(grade)
      ? selected.filter((g) => g !== grade)
      : [...selected, grade];
    patch(category, 'score', next);
  };

  return (
    <div className="sf-fc-section">
      <div className="sf-fc-label">Letter grade</div>
      <div className="sf-fc-grade-row">
        {GRADES.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={selected.includes(g)}
            className={`sf-fc-grade-pill sf-fc-grade-pill--${g.toLowerCase()} ${selected.includes(g) ? 'sf-fc-grade-pill--active' : ''}`}
            onClick={() => toggle(g)}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}
