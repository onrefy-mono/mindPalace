import type { BoxView, MindNode, NodeGroup } from '../types';

export const NETWORK_BOX_TITLE_HEIGHT = 28;
export const NETWORK_BOX_DEFAULT_WIDTH = 320;
export const NETWORK_BOX_DEFAULT_HEIGHT = 200;
export const NETWORK_BOX_PADDING = 32;
export const NETWORK_BOX_MIN_WIDTH = 180;
export const NETWORK_BOX_MIN_HEIGHT = 120;
export const NODE_INTERFACE_LIST_VIEW_ID = 'default-list';
export const NODE_INTERFACE_LIST_VIEW_NAME = '节点界面列表';

export function createDefaultBoxView(createdAt: string): BoxView {
  return {
    id: 'default-graph',
    name: '图谱',
    type: 'graph',
    created_at: createdAt,
  };
}

export function createDefaultListBoxView(createdAt: string): BoxView {
  return {
    id: NODE_INTERFACE_LIST_VIEW_ID,
    name: NODE_INTERFACE_LIST_VIEW_NAME,
    type: 'list',
    created_at: createdAt,
  };
}

export function normalizeNetworkGroup(group: NodeGroup, index = 0): Required<Pick<NodeGroup, 'x' | 'y' | 'width' | 'height'>> & NodeGroup {
  const sourceViews = group.views && group.views.length > 0
    ? group.views
    : [createDefaultBoxView(group.created_at)];
  const hasGraphView = sourceViews.some((view) => view.type === 'graph');
  const hasNodeInterfaceListView = sourceViews.some((view) => view.id === NODE_INTERFACE_LIST_VIEW_ID);
  const views = [
    ...(hasGraphView ? sourceViews : [createDefaultBoxView(group.created_at), ...sourceViews]),
    ...(hasNodeInterfaceListView ? [] : [createDefaultListBoxView(group.created_at)]),
  ].map((view) =>
    view.id === NODE_INTERFACE_LIST_VIEW_ID
      ? { ...view, name: NODE_INTERFACE_LIST_VIEW_NAME, type: 'list' as const }
      : view,
  );
  const activeViewId = views.some((view) => view.id === group.active_view_id)
    ? group.active_view_id
    : views[0]?.id;

  return {
    ...group,
    node_ids: [...group.node_ids],
    views,
    active_view_id: activeViewId,
    parent_id: group.parent_id ?? null,
    x: group.x ?? -160 + index * 48,
    y: group.y ?? -120 + index * 48,
    width: group.width ?? NETWORK_BOX_DEFAULT_WIDTH,
    height: group.height ?? NETWORK_BOX_DEFAULT_HEIGHT,
  };
}

export function getGroupsInGraph(groups: NodeGroup[], viewParentId: string | null): NodeGroup[] {
  return groups.filter((group) => (group.parent_id ?? null) === viewParentId);
}

export function pointInsideNetworkBox(x: number, y: number, group: NodeGroup): boolean {
  const box = normalizeNetworkGroup(group);
  return (
    x >= box.x &&
    x <= box.x + box.width &&
    y >= box.y + NETWORK_BOX_TITLE_HEIGHT &&
    y <= box.y + box.height
  );
}

export function computeNetworkBoxBounds(
  nodes: Pick<MindNode, 'x' | 'y'>[],
  radii: number[] = [],
): { x: number; y: number; width: number; height: number } | null {
  const positioned = nodes.filter((node) => node.x != null && node.y != null);
  if (positioned.length === 0) return null;

  const xs = positioned.map((node, index) => (node.x ?? 0) - (radii[index] ?? 24));
  const ys = positioned.map((node, index) => (node.y ?? 0) - (radii[index] ?? 24));
  const xe = positioned.map((node, index) => (node.x ?? 0) + (radii[index] ?? 24));
  const ye = positioned.map((node, index) => (node.y ?? 0) + (radii[index] ?? 24));

  const minX = Math.min(...xs) - NETWORK_BOX_PADDING;
  const minY = Math.min(...ys) - NETWORK_BOX_PADDING - NETWORK_BOX_TITLE_HEIGHT;
  const maxX = Math.max(...xe) + NETWORK_BOX_PADDING;
  const maxY = Math.max(...ye) + NETWORK_BOX_PADDING;

  return {
    x: minX,
    y: minY,
    width: Math.max(NETWORK_BOX_MIN_WIDTH, maxX - minX),
    height: Math.max(NETWORK_BOX_MIN_HEIGHT, maxY - minY),
  };
}

export function expandNetworkBoxBounds(
  group: NodeGroup,
  nodes: Pick<MindNode, 'x' | 'y'>[],
  radii: number[] = [],
): { x: number; y: number; width: number; height: number } | null {
  const box = normalizeNetworkGroup(group);
  const positioned = nodes.filter((node) => node.x != null && node.y != null);
  if (positioned.length === 0) return null;

  const xs = positioned.map((node, index) => (node.x ?? 0) - (radii[index] ?? 24));
  const ys = positioned.map((node, index) => (node.y ?? 0) - (radii[index] ?? 24));
  const xe = positioned.map((node, index) => (node.x ?? 0) + (radii[index] ?? 24));
  const ye = positioned.map((node, index) => (node.y ?? 0) + (radii[index] ?? 24));

  const requiredLeft = Math.min(...xs) - NETWORK_BOX_PADDING;
  const requiredTop = Math.min(...ys) - NETWORK_BOX_PADDING - NETWORK_BOX_TITLE_HEIGHT;
  const requiredRight = Math.max(...xe) + NETWORK_BOX_PADDING;
  const requiredBottom = Math.max(...ye) + NETWORK_BOX_PADDING;

  const left = Math.min(box.x, requiredLeft);
  const top = Math.min(box.y, requiredTop);
  const right = Math.max(box.x + box.width, requiredRight);
  const bottom = Math.max(box.y + box.height, requiredBottom);

  return {
    x: left,
    y: top,
    width: Math.max(NETWORK_BOX_MIN_WIDTH, right - left),
    height: Math.max(NETWORK_BOX_MIN_HEIGHT, bottom - top),
  };
}
