import { SETTING_WIDGET_NAMES, type SettingWidgetName } from './widgetRegistryNames.ts';
import { registerSettingWidget, type FinderSettingWidget } from './widgetRegistry.ts';
import { ViewConfigEditor } from './ViewConfigEditor.tsx';
import { ViewQualityGrid } from './ViewQualityGrid.tsx';
import { ViewBudgetEditor } from './ViewBudgetEditor.tsx';
import { ViewHintsList } from './ViewHintsList.tsx';
import { EvalTokenEstimate } from './EvalTokenEstimate.tsx';
import { KeyFinderBudgetPreview } from './KeyFinderBudgetPreview.tsx';
import { BundlingSortAxisOrderPicker } from './BundlingSortAxisOrderPicker.tsx';
import { CarouselScoringEditor } from './CarouselScoringEditor.tsx';

const SETTING_WIDGET_COMPONENTS: Record<SettingWidgetName, FinderSettingWidget> = {
  viewConfig: ViewConfigEditor,
  viewQualityGrid: ViewQualityGrid,
  viewBudget: ViewBudgetEditor,
  viewHintsList: ViewHintsList,
  evalThumbSize: EvalTokenEstimate,
  keyFinderBudgetPreview: KeyFinderBudgetPreview,
  bundlingSortAxisOrder: BundlingSortAxisOrderPicker,
  carouselScoring: CarouselScoringEditor,
};

for (const name of SETTING_WIDGET_NAMES) {
  registerSettingWidget(name, SETTING_WIDGET_COMPONENTS[name]);
}
