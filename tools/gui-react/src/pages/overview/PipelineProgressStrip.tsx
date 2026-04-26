import { memo } from 'react';
import { usePipelineProductProgress } from './overviewPipelineProgressStore.ts';
import './PipelineProgressStrip.css';

interface PipelineProgressStripProps {
  readonly category: string;
  readonly productId: string;
}

export const PipelineProgressStrip = memo(function PipelineProgressStrip({
  category,
  productId,
}: PipelineProgressStripProps) {
  const progress = usePipelineProductProgress(category, productId);
  if (!progress) return null;

  return (
    <div className="sf-pipeline-strip" role="group" aria-label="Pipeline progress">
      {progress.steps.map((step) => (
        <span
          key={step.id}
          className={`sf-pipeline-strip-step sf-pipeline-strip-step-${step.status}`}
          title={`${step.label}: ${step.status} (${step.completed}/${step.total})`}
        >
          <span className="sf-pipeline-strip-fill" aria-hidden />
          <span className="sf-pipeline-strip-label">{step.label}</span>
        </span>
      ))}
    </div>
  );
});
