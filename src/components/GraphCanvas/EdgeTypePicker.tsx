import { useEffect } from 'react';
import { EDGE_TYPE_COLORS, EDGE_TYPE_LABELS, EDGE_TYPES, type EdgeType } from '../../types';

interface EdgeTypePickerProps {
  x: number;
  y: number;
  sourceLabel: string;
  targetLabel: string;
  onSelect: (type: EdgeType) => void;
  onCancel: () => void;
}

export function EdgeTypePicker({
  x,
  y,
  sourceLabel,
  targetLabel,
  onSelect,
  onCancel,
}: EdgeTypePickerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const left = Math.min(Math.max(12, x), window.innerWidth - 240);
  const top = Math.min(Math.max(12, y), window.innerHeight - 320);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default bg-black/20"
        aria-label="取消选择关系类型"
        onClick={onCancel}
      />
      <div
        className="fixed z-50 w-56 rounded-xl border border-white/10 bg-slate-900 p-3 shadow-2xl shadow-black/40"
        style={{ left, top }}
        role="dialog"
        aria-label="选择关系类型"
      >
        <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">选择关系类型</div>
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          <span className="font-medium text-slate-200">{sourceLabel}</span>
          <span className="mx-1 text-slate-600">→</span>
          <span className="font-medium text-slate-200">{targetLabel}</span>
        </p>
        <div className="space-y-1">
          {EDGE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-white/8 px-2.5 py-2 text-left text-sm text-slate-200 hover:border-white/15 hover:bg-white/5"
            >
              <span
                className="h-0.5 w-6 shrink-0 rounded-full"
                style={{ backgroundColor: EDGE_TYPE_COLORS[type] }}
              />
              <span>{EDGE_TYPE_LABELS[type]}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-600">Esc 取消</p>
      </div>
    </>
  );
}
