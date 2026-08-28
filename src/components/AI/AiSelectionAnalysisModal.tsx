import { useEffect, useMemo, useState } from 'react';
import {
  AI_ACTIONS,
  DEFAULT_AI_ACTION_ID,
  getAiAction,
  type AiActionId,
} from '../../lib/ai/actions';
import { readAiConfig } from '../../lib/ai/config';
import type { AiSelectionContext } from '../../lib/ai/selectionContext';
import { useAiJobStore } from '../../stores/aiJobStore';

interface AiSelectionAnalysisModalProps {
  context: AiSelectionContext;
  onClose: () => void;
}

export function AiSelectionAnalysisModal({
  context,
  onClose,
}: AiSelectionAnalysisModalProps) {
  const config = useMemo(() => readAiConfig(), []);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<AiActionId>(DEFAULT_AI_ACTION_ID);
  const startJob = useAiJobStore((state) => state.startJob);

  const action = getAiAction(actionId);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const configured = Boolean(config.apiKey.trim());

  const handleGenerate = () => {
    setError('');
    try {
      startJob(actionId, context);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${action.label}失败`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 pt-20 backdrop-blur-sm">
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-500">AI 操作</div>
            <h2 className="mt-1 text-lg font-semibold text-white">
              已选 {context.graphScope.selectedNodeCount} 个节点
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white"
          >
            关闭
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)] overflow-hidden">
          <div className="space-y-3 overflow-y-auto border-r border-white/10 p-4">
            <div className="text-xs font-medium text-slate-400">动作</div>
            <div className="space-y-2">
              {AI_ACTIONS.map((item) => {
                const active = item.id === actionId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActionId(item.id);
                      setError('');
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                      active
                        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                        : 'border-white/8 text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-medium">{item.label}</div>
                    <div className="mt-1 leading-4 text-slate-500">{item.description}</div>
                  </button>
                );
              })}
            </div>

            <div className="text-xs font-medium text-slate-400">选择集</div>
            <div className="rounded-lg border border-white/8 bg-white/3 p-3 text-xs text-slate-400">
              <div>节点：{context.graphScope.selectedNodeCount}</div>
              <div className="mt-1">Box：{context.graphScope.selectedGroupCount}</div>
              <div className="mt-1">内部关系：{context.internalEdges.length}</div>
              <div className="mt-1">
                外部关系：{context.externalEdges.incoming.length + context.externalEdges.outgoing.length}
              </div>
            </div>
            <div className="rounded-lg border border-white/8 bg-white/3 p-3 text-xs text-slate-500">
              当前模型：{config.model || '未配置'}
            </div>
            {!configured && (
              <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100">
                请先在顶部“设置”里配置 AI API Key。
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                内部关系 {context.internalEdges.length} 条 · 外部关系{' '}
                {context.externalEdges.incoming.length + context.externalEdges.outgoing.length} 条
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!configured}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                后台生成
              </button>
            </div>

            {!configured && (
              <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                先保存 API Key 后再生成分析。
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="space-y-4 text-sm leading-6 text-slate-300">
                <div>
                  点击“后台生成”后，请求会进入右下角的 AI 后台任务托盘，当前弹窗会关闭。
                </div>
                <div>
                  你可以继续拖动画布、编辑节点或切换选择集；生成完成后，结果会在任务托盘里显示并可复制。
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="text-xs font-medium text-slate-400">将生成</div>
                  <div className="mt-1 text-slate-100">{action.outputLabel}</div>
                  <div className="mt-2 text-xs text-slate-500">{action.description}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
