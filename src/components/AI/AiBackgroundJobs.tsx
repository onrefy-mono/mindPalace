import { useMemo, useState } from 'react';
import { useAiJobStore, type AiJob } from '../../stores/aiJobStore';

function statusLabel(job: AiJob) {
  if (job.status === 'running') return '生成中';
  if (job.status === 'done') return '已完成';
  return '失败';
}

function statusClass(job: AiJob) {
  if (job.status === 'running') return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
  if (job.status === 'done') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
  return 'border-red-400/30 bg-red-500/10 text-red-100';
}

export function AiBackgroundJobs() {
  const jobs = useAiJobStore((state) => state.jobs);
  const activeJobId = useAiJobStore((state) => state.activeJobId);
  const panelOpen = useAiJobStore((state) => state.panelOpen);
  const panelMinimized = useAiJobStore((state) => state.panelMinimized);
  const setActiveJob = useAiJobStore((state) => state.setActiveJob);
  const openPanel = useAiJobStore((state) => state.openPanel);
  const minimizePanel = useAiJobStore((state) => state.minimizePanel);
  const closePanel = useAiJobStore((state) => state.closePanel);
  const removeJob = useAiJobStore((state) => state.removeJob);
  const [copyNotice, setCopyNotice] = useState('');

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeJobId) ?? jobs[0],
    [activeJobId, jobs],
  );
  const runningCount = jobs.filter((job) => job.status === 'running').length;

  if (!panelOpen) return null;

  const copyResult = async () => {
    if (!activeJob?.result) return;
    await navigator.clipboard.writeText(activeJob.result);
    setCopyNotice('已复制');
    window.setTimeout(() => setCopyNotice(''), 1200);
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {panelMinimized ? (
        <button
          type="button"
          onClick={openPanel}
          className="pointer-events-auto rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-left text-xs text-slate-300 shadow-2xl shadow-black/40 backdrop-blur hover:bg-slate-900"
          title="展开 AI 后台任务"
        >
          <span className="font-medium text-slate-100">AI 后台任务</span>
          <span className="ml-2 text-slate-500">
            {runningCount > 0 ? `${runningCount} 运行中` : jobs.length > 0 ? `${jobs.length} 条` : '空'}
          </span>
        </button>
      ) : null}
      {!panelMinimized && (
      <div className="pointer-events-auto w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">AI 后台任务</div>
            <div className="text-xs text-slate-300">
              {runningCount > 0
                ? `${runningCount} 个任务运行中`
                : jobs.length > 0
                  ? `${jobs.length} 个历史任务`
                  : '暂无任务'}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={minimizePanel}
              className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5 hover:text-slate-200"
              title="最小化"
              aria-label="最小化 AI 后台任务"
            >
              _
            </button>
            <button
              type="button"
              onClick={closePanel}
              className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5 hover:text-slate-200"
              title="关闭"
              aria-label="关闭 AI 后台任务"
            >
              ×
            </button>
          </div>
        </div>

        <div className="max-h-[42vh] overflow-y-auto p-2">
          {jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-slate-600">
              还没有 AI 后台任务
            </div>
          ) : (
            <div className="space-y-1.5">
              {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => setActiveJob(job.id)}
                className={`block w-full rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                  activeJob?.id === job.id
                    ? statusClass(job)
                    : 'border-white/8 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{job.actionLabel}</span>
                  <span>{statusLabel(job)}</span>
                </div>
                <div className="mt-1 truncate text-[11px] opacity-75">{job.selectionLabel}</div>
              </button>
              ))}
            </div>
          )}

          {activeJob && (
            <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-slate-200">{activeJob.outputLabel}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{activeJob.selectionLabel}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeJob(activeJob.id)}
                  className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-white/5 hover:text-slate-200"
                  aria-label="移除 AI 后台任务"
                >
                  ×
                </button>
              </div>

              {activeJob.status === 'running' && (
                <div className="mt-3 text-sm text-cyan-100">正在后台生成，可以继续操作画布。</div>
              )}
              {activeJob.status === 'error' && (
                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-red-200">
                  {activeJob.error}
                </div>
              )}
              {activeJob.result && (
                <div className="mt-3 space-y-2">
                  <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-100">
                    {activeJob.result}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={copyResult}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
                    >
                      复制结果
                    </button>
                    {copyNotice && <span className="text-xs text-emerald-300">{copyNotice}</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
