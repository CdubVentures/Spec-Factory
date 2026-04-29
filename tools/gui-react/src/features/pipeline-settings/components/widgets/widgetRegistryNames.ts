export const SETTING_WIDGET_NAMES = [
  'viewConfig',
  'viewQualityGrid',
  'viewBudget',
  'viewHintsList',
  'evalThumbSize',
  'keyFinderBudgetPreview',
  'bundlingSortAxisOrder',
  'carouselScoring',
] as const;

export type SettingWidgetName = typeof SETTING_WIDGET_NAMES[number];
