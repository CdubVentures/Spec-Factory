import { registerSettingWidget } from './widgetRegistry.ts';
import { ViewConfigEditor } from './ViewConfigEditor.tsx';
import { ViewQualityGrid } from './ViewQualityGrid.tsx';
import { ViewBudgetEditor } from './ViewBudgetEditor.tsx';
import { ViewHintsList } from './ViewHintsList.tsx';
import { EvalTokenEstimate } from './EvalTokenEstimate.tsx';

registerSettingWidget('viewConfig', ViewConfigEditor);
registerSettingWidget('viewQualityGrid', ViewQualityGrid);
registerSettingWidget('viewBudget', ViewBudgetEditor);
registerSettingWidget('viewHintsList', ViewHintsList);
registerSettingWidget('evalThumbSize', EvalTokenEstimate);
