import type { AiSelectionContext } from './selectionContext';
import { getAiAction } from './actions';

export function buildSelectionAnalysisMessages(context: AiSelectionContext) {
  return getAiAction('writing_brief').buildMessages(context);
}
