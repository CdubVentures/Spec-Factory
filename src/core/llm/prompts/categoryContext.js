import { resolvePromptTemplate } from '../resolvePromptTemplate.js';
import { resolveGlobalPrompt } from './globalPromptRegistry.js';

export function buildCategoryContext(category) {
  const value = String(category || '').trim();
  if (!value) return '';
  return resolvePromptTemplate(resolveGlobalPrompt('categoryContext'), {
    CATEGORY: value,
  });
}
