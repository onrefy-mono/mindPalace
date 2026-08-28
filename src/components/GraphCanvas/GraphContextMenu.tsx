export interface ContextMenuItem {
  id: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface GraphContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function GraphContextMenu({ x, y, items, onClose }: GraphContextMenuProps) {
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default"
        aria-label="关闭菜单"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 min-w-[160px] rounded-lg border border-white/10 bg-slate-900 py-1 shadow-2xl"
        style={{ left: x, top: y }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`block w-full px-3 py-2 text-left text-sm hover:bg-white/5 ${
              item.danger ? 'text-red-300' : 'text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
