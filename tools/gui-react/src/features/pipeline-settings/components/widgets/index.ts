import { registerSettingWidget } from './widgetRegistry.ts';
import { ViewConfigEditor } from './ViewConfigEditor.tsx';
import { ViewQualityGrid } from './ViewQualityGrid.tsx';
import { ViewBudgetEditor } from './ViewBudgetEditor.tsx';
import { ViewHintsList } from './ViewHintsList.tsx';
import { EvalTokenEstimate } from './EvalTokenEstimate.tsx';
import { KeyFinderBudgetPreview } from './KeyFinderBudgetPreview.tsx';
import { BundlingSortAxisOrderPicker } from './BundlingSortAxisOrderPicker.tsx';
import { CarouselScoringEditor } from './CarouselScoringEditor.tsx';

registerSettingWidget('viewConfig', ViewConfigEditor);
registerSettingWidget('viewQualityGrid', ViewQualityGrid);
registerSettingWidget('viewBudget', ViewBudgetEditor);
registerSettingWidget('viewHintsList', ViewHintsList);
registerSettingWidget('evalThumbSize', EvalTokenEstimate);
registerSettingWidget('keyFinderBudgetPreview', KeyFinderBudgetPreview);
registerSettingWidget('bundlingSortAxisOrder', BundlingSortAxisOrderPicker);
registerSettingWidget('carouselScoring', CarouselScoringEditor);
