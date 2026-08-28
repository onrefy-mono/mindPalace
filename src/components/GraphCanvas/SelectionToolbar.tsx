import { useMemo, useState } from 'react';
import { buildAiSelectionContext } from '../../lib/ai/selectionContext';
import { useGraphStore } from '../../stores/graphStore';
import { AiSelectionAnalysisModal } from '../AI/AiSelectionAnalysisModal';

export function SelectionToolbar() {
  const nodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);
  const groups = useGraphStore((state) => state.groups);
  const selectedNodeIds = useGraphStore((state) => state.selectedNodeIds);
  const selectedGroupIds = useGraphStore((state) => state.selectedGroupIds);
  const viewParentId = useGraphStore((state) => state.viewParentId);

  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [copyNotice, setCopyNotice] = useState('');

  const context = useMemo(
    () =>
      buildAiSelectionContext({
        nodes,
        edges,
        groups,
        selectedNodeIds,
        selectedGroupIds,
        viewParentId,
      }),
    [nodes, edges, groups, selectedNodeIds, selectedGroupIds, viewParentId],
  );

  const selectedCount = context.graphScope.selectedNodeCount;
  const selectedGroupCount = context.graphScope.selectedGroupCount;
  if (selectedCount === 0 && selectedGroupCount === 0) return null;

  const handleCopyContext = async () => {
    await navigator.clipboard.writeText(JSON.stringify(context, null, 2));
    setCopyNotice('已复制');
    window.setTimeout(() => setCopyNotice(''), 1200);
  };

  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 justify-center">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/90 px-3 py-2 text-xs text-slate-300 shadow-xl shadow-black/30 backdrop-blur">
          <span className="whitespace-nowrap text-slate-400">
            已选 {selectedCount} 个节点
            {selectedGroupCount > 0 ? ` · ${selectedGroupCount} 个 Box` : ''}
          </span>
          <span className="h-4 w-px bg-white/10" />
          <button
            type="button"
            onClick={() => setAnalysisOpen(true)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500"
          >
            AI 操作
          </button>
          <button
            type="button"
            onClick={handleCopyContext}
            className="rounded-md border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5 hover:text-white"
          >
            复制结构
          </button>
          {copyNotice && <span className="text-emerald-300">{copyNotice}</span>}
        </div>
      </div>

      {analysisOpen && (
        <AiSelectionAnalysisModal
          context={context}
          onClose={() => setAnalysisOpen(false)}
        />
      )}
    </>
  );
}
