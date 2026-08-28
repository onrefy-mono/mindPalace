import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Domain, FocusItem, FocusStatus } from '../types';
import { DOMAIN_COLORS } from '../types';
import { captureHistorySnapshot } from '../lib/history';
import { canWriteData, loadData, saveData } from '../lib/storage';

interface LegacyFocusItem extends Partial<FocusItem> {
  id: string;
  title: string;
  domain: Domain;
  status: FocusStatus;
  linked_node_ids: string[];
  created_at: string;
  priority?: 1 | 2 | 3;
  pinned?: boolean;
  last_touched_at?: string;
  touch_count?: number;
  color?: string;
  sort_order?: number;
  note?: string;
}

function normalizeFocusItem(item: LegacyFocusItem, index: number): FocusItem {
  return {
    id: item.id,
    title: item.title,
    domain: item.domain,
    status: item.status,
    color: item.color ?? DOMAIN_COLORS[item.domain],
    sort_order: item.sort_order ?? index,
    note: item.note,
    linked_node_ids: item.linked_node_ids ?? [],
    created_at: item.created_at,
  };
}

function normalizeFocusItems(items: LegacyFocusItem[]): FocusItem[] {
  return items.map(normalizeFocusItem);
}

function sortActiveItems(items: FocusItem[]): FocusItem[] {
  return [...items].sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (b.status === 'done' && a.status !== 'done') return -1;
    return a.sort_order - b.sort_order;
  });
}

function persistFocusItems(items: FocusItem[]) {
  const data = loadData();
  data.focus = items;
  saveData(data);
}

interface FocusState {
  items: FocusItem[];
  activeId: string | null;
  selectedId: string | null;
  load: () => void;
  setActive: (id: string | null) => void;
  setSelected: (id: string | null) => void;
  add: (input: {
    title: string;
    domain: Domain;
    color?: string;
    note?: string;
    linked_node_ids?: string[];
  }) => void;
  update: (id: string, patch: Partial<FocusItem>) => void;
  setStatus: (id: string, status: FocusStatus) => void;
  remove: (id: string) => void;
  reorder: (dragId: string, targetId: string) => void;
  linkNode: (focusId: string, nodeId: string) => void;
  linkNodeToActive: (nodeId: string) => void;
  getOrdered: () => FocusItem[];
}

export const useFocusStore = create<FocusState>((set, get) => ({
  items: [],
  activeId: null,
  selectedId: null,

  load: () => {
    const data = loadData();
    const items = normalizeFocusItems(data.focus as LegacyFocusItem[]);
    const needsMigration = (data.focus as LegacyFocusItem[]).some(
      (item) => item.color == null || item.sort_order == null,
    );
    if (needsMigration && canWriteData()) persistFocusItems(items);
    set({
      items,
      activeId: null,
      selectedId: null,
    });
  },

  setActive: (id) => {
    set({ activeId: id });
    if (id) set({ selectedId: id });
  },

  setSelected: (id) => set({ selectedId: id }),

  add: (input) => {
    const now = new Date().toISOString();
    const activeItems = get().items.filter((item) => item.status === 'active');
    const maxOrder = activeItems.reduce((max, item) => Math.max(max, item.sort_order), -1);
    const item: FocusItem = {
      id: uuidv4(),
      title: input.title,
      domain: input.domain,
      status: 'active',
      color: input.color ?? DOMAIN_COLORS[input.domain],
      sort_order: maxOrder + 1,
      note: input.note,
      linked_node_ids: input.linked_node_ids ?? [],
      created_at: now,
    };
    set((state) => {
      const items = [item, ...state.items];
      persistFocusItems(items);
      return { items, selectedId: item.id };
    });
  },

  update: (id, patch) => {
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      );
      persistFocusItems(items);
      return { items };
    });
  },

  setStatus: (id, status) => {
    get().update(id, { status });
    if (get().activeId === id && status !== 'active') {
      set({ activeId: null });
    }
  },

  remove: (id) => {
    captureHistorySnapshot();
    set((state) => {
      const items = state.items.filter((item) => item.id !== id);
      persistFocusItems(items);
      return {
        items,
        activeId: state.activeId === id ? null : state.activeId,
        selectedId: state.selectedId === id ? null : state.selectedId,
      };
    });
  },

  reorder: (dragId, targetId) => {
    if (dragId === targetId) return;
    set((state) => {
      const active = state.items
        .filter((item) => item.status === 'active')
        .sort((a, b) => a.sort_order - b.sort_order);
      const from = active.findIndex((item) => item.id === dragId);
      const to = active.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return state;

      const nextActive = [...active];
      const [moved] = nextActive.splice(from, 1);
      nextActive.splice(to, 0, moved);
      const orderMap = new Map(nextActive.map((item, index) => [item.id, index]));

      const items = state.items.map((item) =>
        orderMap.has(item.id) ? { ...item, sort_order: orderMap.get(item.id)! } : item,
      );
      persistFocusItems(items);
      return { items };
    });
  },

  linkNode: (focusId, nodeId) => {
    const item = get().items.find((f) => f.id === focusId);
    if (!item || item.linked_node_ids.includes(nodeId)) return;
    get().update(focusId, {
      linked_node_ids: [...item.linked_node_ids, nodeId],
    });
  },

  linkNodeToActive: (nodeId) => {
    const activeId = get().activeId;
    if (!activeId) return;
    get().linkNode(activeId, nodeId);
  },

  getOrdered: () => sortActiveItems(get().items),
}));
