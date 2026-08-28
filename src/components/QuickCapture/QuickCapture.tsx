import { useEffect, useState } from 'react';
import { useFocusStore } from '../../stores/focusStore';
import { useGraphStore } from '../../stores/graphStore';
import { useAiJobStore } from '../../stores/aiJobStore';
import { exportData, loadData, resetData } from '../../lib/storage';
import type { Domain, NodeType } from '../../types';
import { NODE_TYPE_META, NODE_TYPES } from '../../types';

export function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addFocus = useFocusStore((s) => s.add);
  const addNode = useGraphStore((s) => s.addNode);
  const addEdge = useGraphStore((s) => s.addEdge);
  const updateFocus = useFocusStore((s) => s.update);
  const nodes = useGraphStore((s) => s.nodes);

  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState<Domain>('work');
  const [nodeLabel, setNodeLabel] = useState('');
  const [linkExisting, setLinkExisting] = useState('');
  const [nodeType, setNodeType] = useState<NodeType>('concept');
  const [asFocus, setAsFocus] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const label = (nodeLabel || title).trim();
    if (!label) return;

    const node = addNode({ label, type: nodeType, skipFocusLink: asFocus && !!title.trim() });
    if (linkExisting) {
      addEdge({ source: node.id, target: linkExisting, type: 'relates_to' });
    }

    if (asFocus && title.trim()) {
      addFocus({
        title: title.trim(),
        domain,
        linked_node_ids: [node.id],
      });
      const newFocusId = useFocusStore.getState().selectedId;
      if (newFocusId) useFocusStore.getState().setActive(newFocusId);
    } else if (linkExisting) {
      const focus = useFocusStore.getState().items.find((f) =>
        f.linked_node_ids.includes(linkExisting),
      );
      if (focus) {
        updateFocus(focus.id, {
          linked_node_ids: [...new Set([...focus.linked_node_ids, node.id])],
        });
      }
    }

    setTitle('');
    setNodeLabel('');
    setLinkExisting('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8 pt-24 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="mb-4">
          <div className="text-xs uppercase tracking-widest text-slate-500">快速捕获</div>
          <h3 className="text-xl font-semibold text-white">记录思维片段</h3>
        </div>

        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="关注点标题（可选）"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-blue-400/50"
            autoFocus
          />
          <input
            value={nodeLabel}
            onChange={(e) => setNodeLabel(e.target.value)}
            placeholder="图谱节点名称（默认同标题）"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
          />
          <select
            value={nodeType}
            onChange={(e) => setNodeType(e.target.value as NodeType)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
          >
            {NODE_TYPES.map((t) => (
              <option key={t} value={t}>
                {NODE_TYPE_META[t].label} · {NODE_TYPE_META[t].psychology}
              </option>
            ))}
          </select>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as Domain)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
          >
            <option value="research">研究</option>
            <option value="work">工作</option>
            <option value="personal">个人</option>
          </select>
          <select
            value={linkExisting}
            onChange={(e) => setLinkExisting(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
          >
            <option value="">关联到已有节点（可选）</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={asFocus}
              onChange={(e) => setAsFocus(e.target.checked)}
              className="rounded"
            />
            同时加入关注区
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            捕获
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
}

export function HeaderBar({
  onCapture,
  onOpenDocs,
  onOpenSettings,
  storagePath,
  readOnly = false,
}: {
  onCapture: () => void;
  onOpenDocs: () => void;
  onOpenSettings: () => void;
  storagePath?: string;
  readOnly?: boolean;
}) {
  const jobs = useAiJobStore((s) => s.jobs);
  const openAiJobs = useAiJobStore((s) => s.openPanel);
  const handleExport = () => exportData(loadData());
  const runningAiJobs = jobs.filter((job) => job.status === 'running').length;
  const finishedAiJobs = jobs.filter((job) => job.status !== 'running').length;
  const handleReset = async () => {
    if (readOnly) return;
    if (!confirm('重置为种子数据？当前修改将丢失。')) return;
    try {
      await resetData();
      useFocusStore.getState().load();
      useGraphStore.getState().load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '重置失败');
    }
  };

  return (
    <header className="flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-6 py-3 backdrop-blur">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Mind Palace</div>
        <h1 className="text-xl font-semibold text-white">思维宫殿</h1>
        {storagePath ? (
          <p className="mt-1 max-w-xl truncate text-[11px] text-slate-500" title={storagePath}>
            数据文件：{storagePath}
          </p>
        ) : null}
        {readOnly ? (
          <p className="mt-1 text-[11px] font-medium text-amber-300">
            只读模式：内网访问只能浏览，请在本机 127.0.0.1 打开后编辑
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCapture}
          disabled={readOnly}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            readOnly
              ? 'cursor-not-allowed bg-slate-700 text-slate-400'
              : 'bg-blue-600 text-white hover:bg-blue-500'
          }`}
          title={readOnly ? '只读模式下不可编辑' : undefined}
        >
          快速捕获
          <span className="ml-2 rounded bg-blue-500/50 px-1.5 py-0.5 text-[10px]">Ctrl+K</span>
        </button>
        <button
          type="button"
          onClick={openAiJobs}
          className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/15"
          title="打开 AI 后台任务"
        >
          AI
          {runningAiJobs > 0 ? (
            <span className="ml-2 rounded bg-cyan-500/25 px-1.5 py-0.5 text-[10px] text-cyan-100">
              {runningAiJobs}
            </span>
          ) : finishedAiJobs > 0 ? (
            <span className="ml-2 rounded bg-emerald-500/25 px-1.5 py-0.5 text-[10px] text-emerald-100">
              {finishedAiJobs}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onOpenDocs}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
          title="打开文档中心"
        >
          文档
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
          title="打开设置"
        >
          设置
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
        >
          导出
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={readOnly}
          className={`rounded-lg border border-white/10 px-3 py-2 text-sm ${
            readOnly
              ? 'cursor-not-allowed text-slate-600'
              : 'text-slate-300 hover:bg-white/5'
          }`}
          title={readOnly ? '只读模式下不可重置' : undefined}
        >
          重置
        </button>
      </div>
    </header>
  );
}
