import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { BoxViewType, EdgeEndpointKind, EdgeType, MindEdge, MindNode, NodeGroup, NodeType } from '../types';
import { GROUP_COLORS, edgeTypeHasDirection, nodeLayerForType } from '../types';
import { canEnterSubnet, collectDescendantIds } from '../lib/graphContext';
import {
  computeNetworkBoxBounds,
  NETWORK_BOX_MIN_HEIGHT,
  NETWORK_BOX_MIN_WIDTH,
  normalizeNetworkGroup,
  pointInsideNetworkBox,
  NETWORK_BOX_DEFAULT_HEIGHT,
  NETWORK_BOX_DEFAULT_WIDTH,
  expandNetworkBoxBounds,
  NODE_INTERFACE_LIST_VIEW_ID,
  NODE_INTERFACE_LIST_VIEW_NAME,
} from '../lib/networkBox';
import { captureHistorySnapshot } from '../lib/history';
import { perfTime } from '../lib/perf';
import { loadData, saveData } from '../lib/storage';
import { resolveNewNodeConnection } from '../lib/nodeConnection';
import { generateChatText } from '../lib/ai/client';
import { readAiConfig } from '../lib/ai/config';
import {
  buildNodeGroupDraftMessages,
  parseNodeGroupDraft,
  type AiGeneratedNodeGroupDraft,
} from '../lib/ai/nodeGroupDraft';
import { useFocusStore } from './focusStore';

interface AddNodeInput {
  label: string;
  type?: NodeType;
  content?: string;
  tags?: string[];
  parent_id?: string | null;
  connectToId?: string | null;
  connectEdgeType?: EdgeType;
  skipFocusLink?: boolean;
  x?: number;
  y?: number;
}

export interface PendingEdgeConnect {
  source: string;
  target: string;
  source_kind?: EdgeEndpointKind;
  target_kind?: EdgeEndpointKind;
  x: number;
  y: number;
}

export interface AiNodeGroupPreviewNode {
  tempId: string;
  label: string;
  type: NodeType;
  content?: string;
  tags?: string[];
  x: number;
  y: number;
}

export interface AiNodeGroupPreviewEdge {
  sourceTempId: string | 'connected';
  targetTempId: string | 'connected';
  type: EdgeType;
  label?: string;
}

export interface AiNodeGroupPreview {
  id: string;
  status: 'running' | 'ready' | 'error';
  boxName: string;
  connectedNodeId: string;
  viewParentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  nodes: AiNodeGroupPreviewNode[];
  edges: AiNodeGroupPreviewEdge[];
  error?: string;
}

interface AddGroupInput {
  name: string;
  parent_id?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  node_ids?: string[];
}

interface CommitListDragInput {
  nodePositions: Array<{ id: string; x: number; y: number }>;
  removeFromGroups: Array<{ groupId: string; nodeId: string }>;
  targetGroupId?: string | null;
  targetOrder?: string[];
}

interface GraphNodeClipboard {
  nodes: MindNode[];
  edges: MindEdge[];
  groups: NodeGroup[];
  originX: number;
  originY: number;
}

export interface ShortcutReturnPrompt {
  shortcutNodeId: string;
  shortcutParentId: string | null;
  targetNodeId: string;
}

interface GraphState {
  nodes: MindNode[];
  edges: MindEdge[];
  groups: NodeGroup[];
  viewParentId: string | null;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  selectedGroupId: string | null;
  selectedGroupIds: string[];
  linkMode: boolean;
  linkSourceId: string | null;
  linkSourceKind: EdgeEndpointKind;
  pendingEdgeConnect: PendingEdgeConnect | null;
  aiNodeGroupPreview: AiNodeGroupPreview | null;
  edgeLabelMode: boolean;
  globalTextMode: boolean;
  createPointer: { x: number; y: number } | null;
  nodeClipboard: GraphNodeClipboard | null;
  shortcutNotice: string | null;
  shortcutReturnPrompt: ShortcutReturnPrompt | null;
  load: () => void;
  navigateToGraph: (parentId: string | null) => void;
  enterSubnet: (nodeId: string) => boolean;
  setSelectedNode: (id: string | null) => void;
  setSelectedNodes: (ids: string[]) => void;
  setSelectedNodesAndGroups: (nodeIds: string[], groupIds: string[]) => void;
  toggleNodeSelection: (id: string, additive: boolean) => void;
  setSelectedEdge: (id: string | null) => void;
  setSelectedGroup: (id: string | null) => void;
  setSelectedGroups: (ids: string[]) => void;
  toggleGroupSelection: (id: string, additive: boolean) => void;
  toggleLinkMode: () => void;
  cancelLinkMode: () => void;
  setLinkSource: (id: string | null, kind?: EdgeEndpointKind) => void;
  handleLinkClick: (nodeId: string) => void;
  stageEdgeConnect: (
    source: string,
    target: string,
    x: number,
    y: number,
    sourceKind?: EdgeEndpointKind,
    targetKind?: EdgeEndpointKind,
  ) => void;
  confirmPendingEdge: (type: EdgeType) => void;
  cancelPendingEdge: () => void;
  toggleEdgeLabelMode: () => void;
  toggleGlobalTextMode: () => void;
  setCreatePointer: (x: number, y: number) => void;
  startGenerateNodeGroup: (connectToId: string, x?: number, y?: number) => Promise<void>;
  approveAiNodeGroupPreview: () => void;
  rejectAiNodeGroupPreview: () => void;
  cutSelectionToClipboard: () => boolean;
  pasteNodeClipboard: (x?: number, y?: number) => boolean;
  createShortcutNode: (sourceNodeId: string, x?: number, y?: number) => MindNode | null;
  jumpToShortcutTarget: (shortcutNodeId: string) => boolean;
  returnToShortcutSource: () => boolean;
  dismissShortcutReturnPrompt: () => void;
  clearShortcutNotice: () => void;
  addNode: (input: AddNodeInput) => MindNode;
  updateNode: (id: string, patch: Partial<MindNode>) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  addEdge: (input: {
    source: string;
    target: string;
    source_kind?: EdgeEndpointKind;
    target_kind?: EdgeEndpointKind;
    type?: EdgeType;
    label?: string;
  }) => MindEdge | null;
  updateEdge: (id: string, patch: Partial<MindEdge>) => void;
  updateEdgeEndpoints: (id: string, source: string, target: string) => boolean;
  reverseEdge: (id: string) => boolean;
  removeEdge: (id: string) => void;
  addGroup: (input: AddGroupInput) => NodeGroup;
  createGroup: () => NodeGroup;
  updateGroup: (
    id: string,
    patch: Partial<Pick<NodeGroup, 'name' | 'color' | 'x' | 'y' | 'width' | 'height'>>,
  ) => void;
  removeGroup: (id: string) => void;
  addGroupView: (groupId: string, type: BoxViewType) => string | null;
  setActiveGroupView: (groupId: string, viewId: string) => void;
  updateGroupView: (groupId: string, viewId: string, patch: { name?: string; node_order?: string[] }) => void;
  removeGroupView: (groupId: string, viewId: string) => void;
  updateGroupViewNodeOrder: (groupId: string, viewId: string, nodeOrder: string[]) => void;
  addNodesToGroup: (groupId: string, nodeIds: string[]) => void;
  removeNodeFromGroup: (groupId: string, nodeId: string) => void;
  commitListDrag: (input: CommitListDragInput) => void;
  moveGroupWithNodes: (groupId: string, dx: number, dy: number) => void;
  commitGroupMove: (groupId: string, dx: number, dy: number) => void;
  commitGroupResize: (
    groupId: string,
    patch: { x?: number; y?: number; width: number; height: number },
  ) => void;
  syncNodeGroupMembership: (nodeId: string, x: number, y: number) => void;
  fitGroupToNodes: (groupId: string) => void;
}

function normalizeNodes(nodes: MindNode[]): MindNode[] {
  return nodes.map((n) => {
    const supportsStatus = n.type === 'goal' || n.type === 'task';
    return {
      ...n,
      parent_id: n.parent_id ?? null,
      status: supportsStatus ? n.status ?? 'active' : undefined,
      x: n.x,
      y: n.y,
    };
  });
}

function persistGraph(nodes: MindNode[], edges: MindEdge[], groups: NodeGroup[]) {
  const data = loadData();
  data.nodes = nodes;
  data.edges = edges;
  data.groups = groups;
  saveData(data);
}

function normalizeGroups(groups: NodeGroup[] | undefined): NodeGroup[] {
  return (groups ?? []).map((group, index) => normalizeNetworkGroup(group, index));
}

function createNodeGroupContext(
  nodes: MindNode[],
  edges: MindEdge[],
  connectedNodeId: string,
  viewParentId: string | null,
) {
  const connectedNode = nodes.find((node) => node.id === connectedNodeId);
  if (!connectedNode) throw new Error('找不到连接节点');
  const nearbyIds = new Set<string>();
  const nearbyEdges: MindEdge[] = [];
  for (const edge of edges) {
    if (edge.derived_from_edge_id) continue;
    if (edge.source === connectedNodeId) {
      nearbyIds.add(edge.target);
      nearbyEdges.push(edge);
    } else if (edge.target === connectedNodeId) {
      nearbyIds.add(edge.source);
      nearbyEdges.push(edge);
    }
  }
  return {
    connectedNode,
    nearbyNodes: [...nearbyIds]
      .map((id) => nodes.find((node) => node.id === id))
      .filter((node): node is MindNode => Boolean(node))
      .slice(0, 12),
    edges: nearbyEdges.slice(0, 16),
    viewParentId,
  };
}

function layoutNodeGroupDraft(
  draft: AiGeneratedNodeGroupDraft,
  connectedNodeId: string,
  viewParentId: string | null,
  x: number,
  y: number,
): AiNodeGroupPreview {
  const count = draft.nodes.length;
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(count))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellWidth = 150;
  const cellHeight = 90;
  const width = Math.max(360, columns * cellWidth + 80);
  const height = Math.max(220, rows * cellHeight + 110);
  const originX = x - width / 2;
  const originY = y - height / 2;
  return {
    id: `ai-preview-${Date.now()}`,
    status: 'ready',
    boxName: draft.boxName,
    connectedNodeId,
    viewParentId,
    x: originX,
    y: originY,
    width,
    height,
    nodes: draft.nodes.map((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        ...node,
        x: originX + 55 + column * cellWidth,
        y: originY + 78 + row * cellHeight,
      };
    }),
    edges: draft.edges,
  };
}

function expandGroupsToIncludeNodes(
  groups: NodeGroup[],
  nodes: MindNode[],
  requests: Array<{ groupId: string; nodeIds: string[] }>,
): NodeGroup[] {
  if (requests.length === 0) return groups;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const requestsByGroup = new Map<string, Set<string>>();

  for (const request of requests) {
    if (request.nodeIds.length === 0) continue;
    const ids = requestsByGroup.get(request.groupId) ?? new Set<string>();
    request.nodeIds.forEach((id) => ids.add(id));
    requestsByGroup.set(request.groupId, ids);
  }

  if (requestsByGroup.size === 0) return groups;

  return groups.map((group) => {
    const nodeIds = requestsByGroup.get(group.id);
    if (!nodeIds) return group;
    const members = [...nodeIds]
      .map((id) => nodeById.get(id))
      .filter((node): node is MindNode => Boolean(node && node.x != null && node.y != null));
    if (members.length === 0) return group;
    const expanded = expandNetworkBoxBounds(group, members);
    if (!expanded) return group;
    return { ...group, ...expanded };
  });
}

function edgeKind(kind: EdgeEndpointKind | undefined): EdgeEndpointKind {
  return kind ?? 'node';
}

function edgeEndpointKey(id: string, kind: EdgeEndpointKind | undefined): string {
  return `${edgeKind(kind)}:${id}`;
}

function edgeConnects(
  edge: MindEdge,
  source: string,
  target: string,
  sourceKind: EdgeEndpointKind | undefined,
  targetKind: EdgeEndpointKind | undefined,
  type: EdgeType,
): boolean {
  if (edge.type !== type) return false;
  const edgeSource = edgeEndpointKey(edge.source, edge.source_kind);
  const edgeTarget = edgeEndpointKey(edge.target, edge.target_kind);
  const nextSource = edgeEndpointKey(source, sourceKind);
  const nextTarget = edgeEndpointKey(target, targetKind);
  if (edgeTypeHasDirection(type)) {
    return edgeSource === nextSource && edgeTarget === nextTarget;
  }
  return (
    (edgeSource === nextSource && edgeTarget === nextTarget) ||
    (edgeSource === nextTarget && edgeTarget === nextSource)
  );
}

function groupEdgeEndpoint(edge: MindEdge) {
  const sourceKind = edgeKind(edge.source_kind);
  const targetKind = edgeKind(edge.target_kind);
  if (sourceKind === targetKind) return null;
  return sourceKind === 'group'
    ? { id: edge.source, side: 'source' as const }
    : targetKind === 'group'
      ? { id: edge.target, side: 'target' as const }
      : null;
}

function nodeEdgeKey(source: string, target: string, type: EdgeType): string {
  if (edgeTypeHasDirection(type)) return `${source}>${target}|${type}`;
  return source < target ? `${source}|${target}|${type}` : `${target}|${source}|${type}`;
}

function editableEdgeId(edge: MindEdge | undefined): string | null {
  if (!edge) return null;
  return edge.derived_from_edge_id ?? edge.id;
}

function deriveGroupEdges(
  edge: MindEdge,
  groups: NodeGroup[],
  existingEdgeKeys: Set<string>,
): MindEdge[] {
  const groupEndpoint = groupEdgeEndpoint(edge);
  if (!groupEndpoint) return [];

  const group = groups.find((item) => item.id === groupEndpoint.id);
  if (!group) return [];
  const externalNodeId = groupEndpoint.side === 'source' ? edge.target : edge.source;
  const derived: MindEdge[] = [];

  for (const nodeId of group.node_ids) {
    if (nodeId === externalNodeId) continue;
    const source = groupEndpoint.side === 'source' ? nodeId : externalNodeId;
    const target = groupEndpoint.side === 'source' ? externalNodeId : nodeId;
    const key = nodeEdgeKey(source, target, edge.type);
    if (existingEdgeKeys.has(key)) continue;
    existingEdgeKeys.add(key);
    derived.push({
      id: uuidv4(),
      source,
      target,
      source_kind: 'node',
      target_kind: 'node',
      type: edge.type,
      label: edge.label,
      label_position: edge.label_position,
      weight: edge.weight,
      hidden: true,
      derived_from_group_id: group.id,
      derived_from_edge_id: edge.id,
    });
  }

  return derived;
}

function syncDerivedGroupEdges(groups: NodeGroup[], edges: MindEdge[]): MindEdge[] {
  const baseEdges = edges.filter((edge) => !edge.derived_from_edge_id);
  const existingDerived = edges.filter((edge) => edge.derived_from_edge_id);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const derivedBySourceEdge = new Map<string, MindEdge[]>();
  for (const edge of existingDerived) {
    if (!edge.derived_from_edge_id) continue;
    const list = derivedBySourceEdge.get(edge.derived_from_edge_id) ?? [];
    list.push(edge);
    derivedBySourceEdge.set(edge.derived_from_edge_id, list);
  }
  const existingEdgeKeys = new Set(
    existingDerived.map((edge) => nodeEdgeKey(edge.source, edge.target, edge.type)),
  );
  const derivedEdges: MindEdge[] = [];
  for (const edge of baseEdges) {
    const groupEndpoint = groupEdgeEndpoint(edge);
    if (!groupEndpoint) continue;
    const group = groupById.get(groupEndpoint.id);
    if (!group) continue;
    const externalNodeId = groupEndpoint.side === 'source' ? edge.target : edge.source;
    const groupNodeIds = new Set(group.node_ids);
    const derivedForEdge = derivedBySourceEdge.get(edge.id) ?? [];
    const coveredNodeIds = new Set<string>();

    for (const derived of derivedForEdge) {
      const childNodeId = groupEndpoint.side === 'source' ? derived.source : derived.target;
      if (!childNodeId || childNodeId === externalNodeId) continue;
      const source = groupEndpoint.side === 'source' ? childNodeId : externalNodeId;
      const target = groupEndpoint.side === 'source' ? externalNodeId : childNodeId;
      const key = nodeEdgeKey(source, target, edge.type);
      if (existingEdgeKeys.has(key)) continue;
      coveredNodeIds.add(childNodeId);
      existingEdgeKeys.add(key);
      derivedEdges.push({
        ...derived,
        source,
        target,
        source_kind: 'node',
        target_kind: 'node',
        type: edge.type,
        label: edge.label,
        label_position: edge.label_position,
        weight: edge.weight,
        hidden: groupNodeIds.has(childNodeId),
        derived_from_group_id: group.id,
        derived_from_edge_id: edge.id,
      });
    }

    const missingMemberIds = group.node_ids.filter((nodeId) => !coveredNodeIds.has(nodeId));
    derivedEdges.push(
      ...deriveGroupEdges(
        edge,
        [{ ...group, node_ids: missingMemberIds }],
        existingEdgeKeys,
      ),
    );
  }
  return [...baseEdges, ...derivedEdges];
}

const EDGE_LABEL_MODE_KEY = 'mind-palace-edge-label-mode';

function readEdgeLabelMode(): boolean {
  return true;
}

function persistEdgeLabelMode(enabled: boolean) {
  try {
    localStorage.setItem(EDGE_LABEL_MODE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

const GLOBAL_TEXT_MODE_KEY = 'mind-palace-global-text-mode';

function readGlobalTextMode(): boolean {
  return true;
}

function persistGlobalTextMode(enabled: boolean) {
  try {
    localStorage.setItem(GLOBAL_TEXT_MODE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  groups: [],
  viewParentId: null,
  selectedNodeId: null,
  selectedNodeIds: [],
  selectedEdgeId: null,
  selectedGroupId: null,
  selectedGroupIds: [],
  linkMode: false,
  linkSourceId: null,
  linkSourceKind: 'node',
  pendingEdgeConnect: null,
  aiNodeGroupPreview: null,
  edgeLabelMode: readEdgeLabelMode(),
  globalTextMode: readGlobalTextMode(),
  createPointer: null,
  nodeClipboard: null,
  shortcutNotice: null,
  shortcutReturnPrompt: null,

  load: () => {
    const data = loadData();
    const groups = normalizeGroups(data.groups);
    set({
      nodes: normalizeNodes(data.nodes),
      edges: syncDerivedGroupEdges(groups, data.edges),
      groups,
      viewParentId: null,
      aiNodeGroupPreview: null,
      shortcutNotice: null,
      shortcutReturnPrompt: null,
    });
  },

  navigateToGraph: (parentId) => {
    if (parentId !== null) {
      const node = get().nodes.find((n) => n.id === parentId);
      if (!node || !canEnterSubnet(node)) return;
    }
    set({
      viewParentId: parentId,
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
      selectedGroupId: null,
      selectedGroupIds: [],
      linkSourceId: null,
      linkSourceKind: 'node',
      aiNodeGroupPreview: null,
      shortcutReturnPrompt: null,
    });
  },

  enterSubnet: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || !canEnterSubnet(node)) return false;
    get().navigateToGraph(nodeId);
    return true;
  },

  createShortcutNode: (sourceNodeId, x, y) => {
    const state = get();
    const selectedSource = state.nodes.find((node) => node.id === sourceNodeId);
    const source = selectedSource?.shortcut_target_id
      ? state.nodes.find((node) => node.id === selectedSource.shortcut_target_id)
      : selectedSource;
    if (!selectedSource || !source) {
      set({ shortcutNotice: '原节点不存在，无法创建快捷方式' });
      return null;
    }
    const now = new Date().toISOString();
    const node: MindNode = {
      id: uuidv4(),
      label: source.label,
      type: source.type,
      layer: source.layer,
      parent_id: state.viewParentId,
      shortcut_target_id: source.id,
      content: undefined,
      tags: [...source.tags],
      status: source.status,
      x: x ?? (source.x ?? 0) + 90,
      y: y ?? (source.y ?? 0) + 60,
      created_at: now,
      updated_at: now,
    };
    captureHistorySnapshot();
    set((current) => {
      const nodes = [...current.nodes, node];
      let edges = current.edges;
      let groups = current.groups;
      if (node.x != null && node.y != null) {
        const expandRequests: Array<{ groupId: string; nodeIds: string[] }> = [];
        groups = current.groups.map((group) => {
          if ((group.parent_id ?? null) !== current.viewParentId) return group;
          if (!pointInsideNetworkBox(node.x ?? 0, node.y ?? 0, group)) return group;
          if (group.node_ids.includes(node.id)) return group;
          expandRequests.push({ groupId: group.id, nodeIds: [node.id] });
          return { ...group, node_ids: [...group.node_ids, node.id] };
        });
        groups = expandGroupsToIncludeNodes(groups, nodes, expandRequests);
        edges = syncDerivedGroupEdges(groups, edges);
      }
      persistGraph(nodes, edges, groups);
      return {
        nodes,
        edges,
        groups,
        selectedNodeId: node.id,
        selectedNodeIds: [node.id],
        selectedEdgeId: null,
        selectedGroupId: null,
        selectedGroupIds: [],
        shortcutNotice: null,
      };
    });
    return node;
  },

  jumpToShortcutTarget: (shortcutNodeId) => {
    const state = get();
    const shortcut = state.nodes.find((node) => node.id === shortcutNodeId);
    const targetId = shortcut?.shortcut_target_id;
    const target = targetId ? state.nodes.find((node) => node.id === targetId) : null;
    if (!shortcut || !target) {
      set({ shortcutNotice: '原节点不存在，快捷方式已失效', shortcutReturnPrompt: null });
      return false;
    }
    set({
      viewParentId: target.parent_id ?? null,
      selectedNodeId: target.id,
      selectedNodeIds: [target.id],
      selectedEdgeId: null,
      selectedGroupId: null,
      selectedGroupIds: [],
      linkSourceId: null,
      linkSourceKind: 'node',
      aiNodeGroupPreview: null,
      shortcutNotice: null,
      shortcutReturnPrompt: {
        shortcutNodeId: shortcut.id,
        shortcutParentId: shortcut.parent_id ?? null,
        targetNodeId: target.id,
      },
    });
    return true;
  },

  returnToShortcutSource: () => {
    const prompt = get().shortcutReturnPrompt;
    if (!prompt) return false;
    const shortcut = get().nodes.find((node) => node.id === prompt.shortcutNodeId);
    if (!shortcut) {
      set({ shortcutNotice: '快捷方式节点不存在', shortcutReturnPrompt: null });
      return false;
    }
    set({
      viewParentId: prompt.shortcutParentId,
      selectedNodeId: shortcut.id,
      selectedNodeIds: [shortcut.id],
      selectedEdgeId: null,
      selectedGroupId: null,
      selectedGroupIds: [],
      linkSourceId: null,
      linkSourceKind: 'node',
      aiNodeGroupPreview: null,
      shortcutReturnPrompt: null,
      shortcutNotice: null,
    });
    return true;
  },

  dismissShortcutReturnPrompt: () => set({ shortcutReturnPrompt: null }),

  clearShortcutNotice: () => set({ shortcutNotice: null }),

  setSelectedNode: (id) =>
    set({
      selectedNodeId: id,
      selectedNodeIds: id ? [id] : [],
      selectedEdgeId: null,
      selectedGroupId: null,
      selectedGroupIds: [],
    }),

  setSelectedNodes: (ids) =>
    set({
      selectedNodeIds: ids,
      selectedNodeId: ids[0] ?? null,
      selectedEdgeId: null,
      selectedGroupId: null,
      selectedGroupIds: [],
    }),

  setSelectedNodesAndGroups: (nodeIds, groupIds) =>
    set({
      selectedNodeIds: nodeIds,
      selectedNodeId: nodeIds[0] ?? null,
      selectedGroupIds: groupIds,
      selectedGroupId: groupIds[0] ?? null,
      selectedEdgeId: null,
    }),

  toggleNodeSelection: (id, additive) => {
    const { selectedNodeIds } = get();
    if (!additive) {
      set({
        selectedNodeIds: [id],
        selectedNodeId: id,
        selectedEdgeId: null,
        selectedGroupId: null,
        selectedGroupIds: [],
      });
      return;
    }
    const exists = selectedNodeIds.includes(id);
    const next = exists ? selectedNodeIds.filter((x) => x !== id) : [...selectedNodeIds, id];
    set({
      selectedNodeIds: next,
      selectedNodeId: next[0] ?? null,
      selectedEdgeId: null,
    });
  },

  setSelectedEdge: (id) =>
    set({
      selectedEdgeId: id,
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedGroupId: null,
      selectedGroupIds: [],
    }),

  setSelectedGroup: (id) =>
    set({
      selectedGroupId: id,
      selectedGroupIds: id ? [id] : [],
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
    }),

  setSelectedGroups: (ids) =>
    set({
      selectedGroupIds: ids,
      selectedGroupId: ids[0] ?? null,
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedEdgeId: null,
    }),

  toggleGroupSelection: (id, additive) => {
    const { selectedGroupIds } = get();
    if (!additive) {
      set({
        selectedGroupIds: [id],
        selectedGroupId: id,
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null,
      });
      return;
    }
    const exists = selectedGroupIds.includes(id);
    const next = exists ? selectedGroupIds.filter((x) => x !== id) : [...selectedGroupIds, id];
    set({
      selectedGroupIds: next,
      selectedGroupId: next[0] ?? null,
      selectedEdgeId: null,
    });
  },

  toggleLinkMode: () => {
    set((s) => ({
      linkMode: !s.linkMode,
      linkSourceId: null,
      linkSourceKind: 'node',
    }));
  },

  cancelLinkMode: () =>
    set({ linkMode: false, linkSourceId: null, linkSourceKind: 'node', pendingEdgeConnect: null }),

  setLinkSource: (id, kind = 'node') =>
    set({ linkSourceId: id, linkSourceKind: id ? kind : 'node' }),

  handleLinkClick: (nodeId) => {
    const { linkMode, linkSourceId } = get();
    if (!linkMode) return;

    if (!linkSourceId) {
      set({ linkSourceId: nodeId, linkSourceKind: 'node', selectedNodeId: nodeId, selectedNodeIds: [nodeId] });
      return;
    }

    if (linkSourceId === nodeId) {
      set({ linkSourceId: null });
      return;
    }

    // 第二节点由 MindGraph 调用 stageEdgeConnect 并弹出类型选择
  },

  stageEdgeConnect: (source, target, x, y, sourceKind = 'node', targetKind = 'node') => {
    if (source === target) return;
    set({
      pendingEdgeConnect: {
        source,
        target,
        source_kind: sourceKind,
        target_kind: targetKind,
        x,
        y,
      },
      linkSourceId: null,
      linkSourceKind: 'node',
      linkMode: false,
      selectedNodeId: targetKind === 'node' ? target : null,
      selectedNodeIds: targetKind === 'node' ? [target] : [],
      selectedGroupId: targetKind === 'group' ? target : null,
      selectedGroupIds: targetKind === 'group' ? [target] : [],
      selectedEdgeId: null,
    });
  },

  confirmPendingEdge: (type) => {
    const pending = get().pendingEdgeConnect;
    if (!pending) return;
    const created = get().addEdge({
      source: pending.source,
      target: pending.target,
      source_kind: pending.source_kind,
      target_kind: pending.target_kind,
      type,
    });
    set({
      pendingEdgeConnect: null,
      selectedEdgeId: created?.id ?? null,
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedGroupId: null,
      selectedGroupIds: [],
    });
  },

  cancelPendingEdge: () => set({ pendingEdgeConnect: null }),

  toggleEdgeLabelMode: () => {
    set((state) => {
      const next = !state.edgeLabelMode;
      persistEdgeLabelMode(next);
      return { edgeLabelMode: next };
    });
  },

  toggleGlobalTextMode: () => {
    set((state) => {
      const next = !state.globalTextMode;
      persistGlobalTextMode(next);
      return { globalTextMode: next };
    });
  },

  setCreatePointer: (x, y) => set({ createPointer: { x, y } }),

  startGenerateNodeGroup: async (connectToId, x, y) => {
    const state = get();
    const centerX = x ?? state.createPointer?.x ?? 0;
    const centerY = y ?? state.createPointer?.y ?? 0;
    const previewId = `ai-preview-${Date.now()}`;
    const connectedNode = state.nodes.find((node) => node.id === connectToId);
    if (!connectedNode) {
      set({
        aiNodeGroupPreview: {
          id: previewId,
          status: 'error',
          boxName: 'AI 预览',
          connectedNodeId: connectToId,
          viewParentId: state.viewParentId,
          x: centerX - 180,
          y: centerY - 110,
          width: 360,
          height: 220,
          nodes: [],
          edges: [],
          error: '找不到连接节点',
        },
      });
      return;
    }

    set({
      aiNodeGroupPreview: {
        id: previewId,
        status: 'running',
        boxName: `围绕「${connectedNode.label}」生成中`,
        connectedNodeId: connectToId,
        viewParentId: state.viewParentId,
        x: centerX - 180,
        y: centerY - 110,
        width: 360,
        height: 220,
        nodes: [],
        edges: [],
      },
    });

    try {
      const context = createNodeGroupContext(state.nodes, state.edges, connectToId, state.viewParentId);
      const text = await generateChatText(readAiConfig(), buildNodeGroupDraftMessages(context));
      const draft = parseNodeGroupDraft(text);
      set((current) => {
        if (current.aiNodeGroupPreview?.id !== previewId) return current;
        return {
          aiNodeGroupPreview: layoutNodeGroupDraft(
            draft,
            connectToId,
            state.viewParentId,
            centerX,
            centerY,
          ),
        };
      });
    } catch (caught) {
      set((current) => {
        if (current.aiNodeGroupPreview?.id !== previewId) return current;
        return {
          aiNodeGroupPreview: {
            ...current.aiNodeGroupPreview,
            status: 'error',
            error: caught instanceof Error ? caught.message : 'AI 生成节点组失败',
          },
        };
      });
    }
  },

  approveAiNodeGroupPreview: () => {
    const preview = get().aiNodeGroupPreview;
    if (!preview || preview.status !== 'ready' || preview.nodes.length === 0) return;
    captureHistorySnapshot();
    const now = new Date().toISOString();
    set((state) => {
      const tempToRealId = new Map<string, string>();
      const nextNodes: MindNode[] = preview.nodes.map((node) => {
        const id = uuidv4();
        tempToRealId.set(node.tempId, id);
        return {
          id,
          label: node.label,
          type: node.type,
          layer: nodeLayerForType(node.type),
          parent_id: preview.viewParentId,
          content: node.content,
          tags: node.tags ?? [],
          status: node.type === 'goal' || node.type === 'task' ? 'active' : undefined,
          x: node.x,
          y: node.y,
          created_at: now,
          updated_at: now,
        };
      });
      const group = normalizeNetworkGroup(
        {
          id: uuidv4(),
          name: preview.boxName,
          color: GROUP_COLORS[state.groups.length % GROUP_COLORS.length],
          node_ids: nextNodes.map((node) => node.id),
          parent_id: preview.viewParentId,
          x: preview.x,
          y: preview.y,
          width: preview.width,
          height: preview.height,
          created_at: now,
        },
        state.groups.length,
      );
      let nextEdges = state.edges;
      for (const draftEdge of preview.edges) {
        const source = draftEdge.sourceTempId === 'connected'
          ? preview.connectedNodeId
          : tempToRealId.get(draftEdge.sourceTempId);
        const target = draftEdge.targetTempId === 'connected'
          ? preview.connectedNodeId
          : tempToRealId.get(draftEdge.targetTempId);
        if (!source || !target || source === target) continue;
        const edge: MindEdge = {
          id: uuidv4(),
          source,
          target,
          source_kind: 'node',
          target_kind: 'node',
          type: draftEdge.type,
          label: draftEdge.label,
          weight: 0.7,
        };
        const exists = nextEdges.some(
          (item) =>
            !item.derived_from_edge_id &&
            edgeConnects(item, edge.source, edge.target, edge.source_kind, edge.target_kind, edge.type),
        );
        if (!exists) nextEdges = [...nextEdges, edge];
      }
      const allNodes = [...state.nodes, ...nextNodes];
      const groups = [...state.groups, group];
      const edges = syncDerivedGroupEdges(groups, nextEdges);
      persistGraph(allNodes, edges, groups);
      return {
        nodes: allNodes,
        edges,
        groups,
        aiNodeGroupPreview: null,
        selectedNodeId: nextNodes[0]?.id ?? null,
        selectedNodeIds: nextNodes[0] ? [nextNodes[0].id] : [],
        selectedGroupId: group.id,
        selectedGroupIds: [group.id],
        selectedEdgeId: null,
      };
    });
  },

  rejectAiNodeGroupPreview: () => set({ aiNodeGroupPreview: null }),

  cutSelectionToClipboard: () => {
    const state = get();
    const selectedIds = new Set(state.selectedNodeIds);
    for (const group of state.groups) {
      if (state.selectedGroupIds.includes(group.id)) {
        group.node_ids.forEach((id) => selectedIds.add(id));
      }
    }
    const nodes = state.nodes.filter((node) => selectedIds.has(node.id));
    if (nodes.length === 0) return false;
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = state.edges.filter(
      (edge) =>
        !edge.derived_from_edge_id &&
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target) &&
        (edge.source_kind ?? 'node') === 'node' &&
        (edge.target_kind ?? 'node') === 'node',
    );
    const groups = state.groups
      .filter((group) => state.selectedGroupIds.includes(group.id))
      .map((group) => ({
        ...group,
        node_ids: group.node_ids.filter((id) => nodeIds.has(id)),
      }))
      .filter((group) => group.node_ids.length > 0);
    const xs = nodes.map((node) => node.x ?? 0);
    const ys = nodes.map((node) => node.y ?? 0);
    const originX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const originY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    const clipboard = {
      nodes: nodes.map((node) => ({ ...node })),
      edges: edges.map((edge) => ({ ...edge })),
      groups: groups.map((group) => ({ ...group, node_ids: [...group.node_ids] })),
      originX,
      originY,
    };
    captureHistorySnapshot();
    set({ nodeClipboard: clipboard });
    get().removeNodes(nodes.map((node) => node.id));
    return true;
  },

  pasteNodeClipboard: (x, y) => {
    const state = get();
    const clipboard = state.nodeClipboard;
    if (!clipboard || clipboard.nodes.length === 0) return false;
    captureHistorySnapshot();
    const now = new Date().toISOString();
    const pasteX = x ?? state.createPointer?.x ?? clipboard.originX + 36;
    const pasteY = y ?? state.createPointer?.y ?? clipboard.originY + 36;
    const dx = pasteX - clipboard.originX;
    const dy = pasteY - clipboard.originY;
    set((current) => {
      const idMap = new Map<string, string>();
      const nodes = clipboard.nodes.map((node) => {
        const id = uuidv4();
        idMap.set(node.id, id);
        return {
          ...node,
          id,
          parent_id: current.viewParentId,
          x: (node.x ?? clipboard.originX) + dx,
          y: (node.y ?? clipboard.originY) + dy,
          created_at: now,
          updated_at: now,
        };
      });
      const edges: MindEdge[] = [];
      for (const edge of clipboard.edges) {
        const source = idMap.get(edge.source);
        const target = idMap.get(edge.target);
        if (!source || !target) continue;
        edges.push({
          ...edge,
          id: uuidv4(),
          source,
          target,
          source_kind: 'node',
          target_kind: 'node',
          derived_from_group_id: undefined,
          derived_from_edge_id: undefined,
        });
      }
      const groups = clipboard.groups.map((group, index) =>
        normalizeNetworkGroup(
          {
            ...group,
            id: uuidv4(),
            node_ids: group.node_ids.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)),
            parent_id: current.viewParentId,
            x: group.x == null ? group.x : group.x + dx,
            y: group.y == null ? group.y : group.y + dy,
            created_at: now,
          },
          current.groups.length + index,
        ),
      ).filter((group) => group.node_ids.length > 0);
      const allNodes = [...current.nodes, ...nodes];
      let allEdges = current.edges;
      for (const edge of edges) {
        const exists = allEdges.some(
          (item) =>
            !item.derived_from_edge_id &&
            edgeConnects(item, edge.source, edge.target, edge.source_kind, edge.target_kind, edge.type),
        );
        if (!exists) allEdges = [...allEdges, edge];
      }
      const allGroups = [...current.groups, ...groups];
      allEdges = syncDerivedGroupEdges(allGroups, allEdges);
      persistGraph(allNodes, allEdges, allGroups);
      return {
        nodes: allNodes,
        edges: allEdges,
        groups: allGroups,
        selectedNodeId: nodes[0]?.id ?? null,
        selectedNodeIds: nodes.map((node) => node.id),
        selectedGroupId: groups[0]?.id ?? null,
        selectedGroupIds: groups.map((group) => group.id),
        selectedEdgeId: null,
      };
    });
    return true;
  },

  addNode: (input) => {
    const now = new Date().toISOString();
    const parentId = input.parent_id !== undefined ? input.parent_id : get().viewParentId;
    const node: MindNode = {
      id: uuidv4(),
      label: input.label,
      type: input.type ?? 'concept',
      layer: nodeLayerForType(input.type ?? 'concept'),
      parent_id: parentId,
      content: input.content,
      tags: input.tags ?? [],
      status: input.type === 'goal' || input.type === 'task' ? 'active' : undefined,
      x: input.x,
      y: input.y,
      created_at: now,
      updated_at: now,
    };
    set((state) => {
      const nodes = [...state.nodes, node];
      let edges = state.edges;
      let groups = state.groups;
      const connectTo =
        input.connectToId !== undefined ? input.connectToId : state.selectedNodeId;
      if (connectTo && connectTo !== node.id) {
        const connectedNode = state.nodes.find((item) => item.id === connectTo);
        const connection = resolveNewNodeConnection(
          connectTo,
          node.id,
          connectedNode,
          input.connectEdgeType,
        );
        const edge: MindEdge = {
          id: uuidv4(),
          source: connection.source,
          target: connection.target,
          source_kind: 'node',
          target_kind: 'node',
          type: connection.type,
          weight: 0.7,
        };
        const exists = edges.some(
          (e) =>
            !e.derived_from_edge_id &&
            edgeConnects(e, edge.source, edge.target, edge.source_kind, edge.target_kind, edge.type),
        );
        if (!exists) edges = [...edges, edge];
      }
      if (node.x != null && node.y != null) {
        const expandRequests: Array<{ groupId: string; nodeIds: string[] }> = [];
        groups = state.groups.map((group) => {
          if ((group.parent_id ?? null) !== parentId) return group;
          if (!pointInsideNetworkBox(node.x ?? 0, node.y ?? 0, group)) return group;
          const nextNodeIds = group.node_ids.includes(node.id)
            ? group.node_ids
            : [...group.node_ids, node.id];
          if (!group.node_ids.includes(node.id)) {
            expandRequests.push({ groupId: group.id, nodeIds: [node.id] });
          }
          const activeView = group.views?.find((view) => view.id === group.active_view_id);
          return {
            ...group,
            node_ids: nextNodeIds,
            views: group.views?.map((view) =>
              view.id === NODE_INTERFACE_LIST_VIEW_ID && activeView?.type === 'list'
                ? {
                    ...view,
                    name: NODE_INTERFACE_LIST_VIEW_NAME,
                    node_order: [
                      ...(view.node_order ?? []).filter((id) => nextNodeIds.includes(id) && id !== node.id),
                      node.id,
                    ],
                  }
                : view,
            ),
          };
        });
        groups = expandGroupsToIncludeNodes(groups, nodes, expandRequests);
        edges = syncDerivedGroupEdges(groups, edges);
      }
      persistGraph(nodes, edges, groups);
      if (!input.skipFocusLink) {
        useFocusStore.getState().linkNodeToActive(node.id);
      }
      return {
        nodes,
        edges,
        groups,
        selectedNodeId: node.id,
        selectedNodeIds: [node.id],
      };
    });
    return node;
  },

  updateNode: (id, patch) => {
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === id
          ? { ...node, ...patch, updated_at: new Date().toISOString() }
          : node,
      );
      persistGraph(nodes, state.edges, state.groups);
      return { nodes };
    });
  },

  updateNodePosition: (id, x, y) => {
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === id ? { ...node, x, y } : node,
      );
      persistGraph(nodes, state.edges, state.groups);
      return { nodes };
    });
  },

  removeNode: (id) => {
    captureHistorySnapshot();
    set((state) => {
      const removeIds = collectDescendantIds(state.nodes, id);
      const nodes = state.nodes.filter((n) => !removeIds.has(n.id));
      const edges = state.edges.filter(
        (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
      );
      const data = loadData();
      data.nodes = nodes;
      data.edges = edges;
      data.groups = state.groups.map((g) => ({
        ...g,
        node_ids: g.node_ids.filter((nid) => !removeIds.has(nid)),
      }));
      data.focus = data.focus.map((f) => ({
        ...f,
        linked_node_ids: f.linked_node_ids.filter((nid) => !removeIds.has(nid)),
      }));
      saveData(data);
      useFocusStore.setState({ items: data.focus });
      const viewParentId = removeIds.has(state.viewParentId ?? '')
        ? null
        : state.viewParentId;
      return {
        nodes,
        edges,
        groups: data.groups ?? [],
        viewParentId,
        selectedNodeId: removeIds.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId,
        selectedNodeIds: state.selectedNodeIds.filter((nid) => !removeIds.has(nid)),
      };
    });
  },

  removeNodes: (ids) => {
    const seedIds = [...new Set(ids)];
    if (seedIds.length === 0) return;
    captureHistorySnapshot();
    set((state) => {
      const removeIds = new Set<string>();
      for (const id of seedIds) {
        for (const removeId of collectDescendantIds(state.nodes, id)) {
          removeIds.add(removeId);
        }
      }
      if (removeIds.size === 0) return state;
      const nodes = state.nodes.filter((n) => !removeIds.has(n.id));
      const edges = state.edges.filter(
        (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
      );
      const data = loadData();
      data.nodes = nodes;
      data.edges = edges;
      data.groups = state.groups.map((g) => ({
        ...g,
        node_ids: g.node_ids.filter((nid) => !removeIds.has(nid)),
      }));
      data.focus = data.focus.map((f) => ({
        ...f,
        linked_node_ids: f.linked_node_ids.filter((nid) => !removeIds.has(nid)),
      }));
      saveData(data);
      useFocusStore.setState({ items: data.focus });
      const viewParentId = removeIds.has(state.viewParentId ?? '')
        ? null
        : state.viewParentId;
      return {
        nodes,
        edges,
        groups: data.groups ?? [],
        viewParentId,
        selectedNodeId: removeIds.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId,
        selectedNodeIds: state.selectedNodeIds.filter((nid) => !removeIds.has(nid)),
        selectedEdgeId: state.selectedEdgeId && edges.some((e) => e.id === state.selectedEdgeId)
          ? state.selectedEdgeId
          : null,
      };
    });
  },

  addEdge: (input) => {
    const edge: MindEdge = {
      id: uuidv4(),
      source: input.source,
      target: input.target,
      source_kind: input.source_kind ?? 'node',
      target_kind: input.target_kind ?? 'node',
      type: input.type ?? 'relates_to',
      label: input.label,
      weight: 0.7,
    };
    let created: MindEdge | null = null;
    set((state) => {
      const exists = state.edges.some(
        (e) =>
          !e.derived_from_edge_id &&
          edgeConnects(e, edge.source, edge.target, edge.source_kind, edge.target_kind, edge.type),
      );
      if (exists) return state;
      created = edge;
      const edges = syncDerivedGroupEdges(state.groups, [...state.edges, edge]);
      persistGraph(state.nodes, edges, state.groups);
      return { edges };
    });
    return created;
  },

  updateEdge: (id, patch) => {
    set((state) => {
      const targetId = editableEdgeId(state.edges.find((e) => e.id === id));
      if (!targetId) return state;
      const edges = syncDerivedGroupEdges(
        state.groups,
        state.edges.map((e) => (e.id === targetId ? { ...e, ...patch } : e)),
      );
      persistGraph(state.nodes, edges, state.groups);
      return { edges };
    });
  },

  updateEdgeEndpoints: (id, source, target) => {
    if (source === target) return false;
    const edge = get().edges.find((e) => e.id === id);
    if (!edge) return false;
    if (edge.derived_from_edge_id) return false;
    if (edge.source === source && edge.target === target) return true;

    const hasConflict = get().edges.some(
      (e) =>
        !e.derived_from_edge_id &&
        e.id !== id &&
        edgeConnects(e, source, target, 'node', 'node', edge.type),
    );
    if (hasConflict) return false;

    captureHistorySnapshot();
    set((state) => {
      const edges = state.edges.map((e) =>
        e.id === id ? { ...e, source, target } : e,
      );
      persistGraph(state.nodes, edges, state.groups);
      return { edges, selectedEdgeId: id };
    });
    return true;
  },

  reverseEdge: (id) => {
    const rawEdge = get().edges.find((e) => e.id === id);
    const targetId = editableEdgeId(rawEdge);
    const edge = get().edges.find((e) => e.id === targetId);
    if (!edge) return false;
    if (!edgeTypeHasDirection(edge.type)) return false;

    const nextSource = edge.target;
    const nextTarget = edge.source;
    const hasConflict = get().edges.some(
      (e) =>
        !e.derived_from_edge_id &&
        e.id !== edge.id &&
        edgeConnects(e, nextSource, nextTarget, edge.target_kind, edge.source_kind, edge.type),
    );
    if (hasConflict) return false;

    captureHistorySnapshot();
    set((state) => {
      const edges = syncDerivedGroupEdges(
        state.groups,
        state.edges.map((e) =>
          e.id === edge.id
            ? {
                ...e,
                source: nextSource,
                target: nextTarget,
                source_kind: edge.target_kind,
                target_kind: edge.source_kind,
                label_position: edge.label_position == null ? undefined : 1 - edge.label_position,
              }
            : e,
        ),
      );
      persistGraph(state.nodes, edges, state.groups);
      return { edges };
    });
    return true;
  },

  removeEdge: (id) => {
    captureHistorySnapshot();
    set((state) => {
      const targetId = editableEdgeId(state.edges.find((e) => e.id === id)) ?? id;
      const edges = syncDerivedGroupEdges(
        state.groups,
        state.edges.filter((e) => e.id !== targetId && e.derived_from_edge_id !== targetId),
      );
      persistGraph(state.nodes, edges, state.groups);
      return {
        edges,
        selectedEdgeId:
          state.selectedEdgeId === id || state.selectedEdgeId === targetId
            ? null
            : state.selectedEdgeId,
      };
    });
  },

  addGroup: (input) => {
    captureHistorySnapshot();
    const now = new Date().toISOString();
    const state = get();
    const group = normalizeNetworkGroup(
      {
        id: uuidv4(),
        name: input.name.trim() || '未命名 Box',
        color: GROUP_COLORS[state.groups.length % GROUP_COLORS.length],
        node_ids: input.node_ids ? [...new Set(input.node_ids)] : [],
        parent_id: input.parent_id !== undefined ? input.parent_id : state.viewParentId,
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
        created_at: now,
      },
      state.groups.length,
    );
    set((current) => {
      const groups = [...current.groups, group];
      persistGraph(current.nodes, current.edges, groups);
      return { groups, selectedGroupId: group.id, selectedGroupIds: [group.id] };
    });
    if (group.node_ids.length > 0) {
      get().fitGroupToNodes(group.id);
    }
    return get().groups.find((g) => g.id === group.id) ?? group;
  },

  createGroup: () => {
    const state = get();
    const existing = new Set(state.groups.map((g) => g.name));
    let index = state.groups.length + 1;
    let name = `Box ${index}`;
    while (existing.has(name)) {
      index += 1;
      name = `Box ${index}`;
    }

    const width = NETWORK_BOX_DEFAULT_WIDTH;
    const height = NETWORK_BOX_DEFAULT_HEIGHT;
    const centerX = state.createPointer?.x ?? 0;
    const centerY = state.createPointer?.y ?? 0;
    const selectedInView = state.selectedNodeIds.filter((id) => {
      const node = state.nodes.find((n) => n.id === id);
      return node && (node.parent_id ?? null) === state.viewParentId;
    });

    return get().addGroup({
      name,
      parent_id: state.viewParentId,
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
      node_ids: selectedInView,
    });
  },

  updateGroup: (id, patch) => {
    set((state) => {
      const groups = state.groups.map((g) => {
        if (g.id !== id) return g;
        const definedPatch = Object.fromEntries(
          Object.entries(patch).filter(([, value]) => value !== undefined),
        ) as typeof patch;
        const next = normalizeNetworkGroup(
          {
            ...g,
            ...definedPatch,
            name: patch.name !== undefined ? patch.name.trim() || g.name : g.name,
          },
          0,
        );
        return {
          ...next,
          width: Math.max(NETWORK_BOX_MIN_WIDTH, next.width),
          height: Math.max(NETWORK_BOX_MIN_HEIGHT, next.height),
        };
      });
      const edges = syncDerivedGroupEdges(groups, state.edges);
      persistGraph(state.nodes, edges, groups);
      return { groups, edges };
    });
  },

  removeGroup: (id) => {
    captureHistorySnapshot();
    set((state) => {
      const groups = state.groups.filter((g) => g.id !== id);
      const edges = state.edges.filter((edge) => {
        if (edge.derived_from_group_id === id) return false;
        if ((edge.source_kind ?? 'node') === 'group' && edge.source === id) return false;
        if ((edge.target_kind ?? 'node') === 'group' && edge.target === id) return false;
        return true;
      });
      persistGraph(state.nodes, edges, groups);
      return {
        groups,
        edges,
        selectedGroupId: state.selectedGroupId === id ? null : state.selectedGroupId,
        selectedGroupIds: state.selectedGroupIds.filter((gid) => gid !== id),
        selectedEdgeId: state.selectedEdgeId && edges.some((edge) => edge.id === state.selectedEdgeId)
          ? state.selectedEdgeId
          : null,
      };
    });
  },

  addGroupView: (groupId, type) => {
    captureHistorySnapshot();
    const now = new Date().toISOString();
    const viewId = uuidv4();
    let created = false;
    const labelByType: Record<BoxViewType, string> = {
      graph: '图谱',
      list: '列表',
      table: '表格',
      board: '看板',
    };
    set((state) => {
      const groups = state.groups.map((group) => {
        if (group.id !== groupId) return group;
        const views = group.views && group.views.length > 0
          ? group.views
          : [{ id: 'default-graph', name: '图谱', type: 'graph' as const, created_at: group.created_at }];
        const existingNames = new Set(views.map((view) => view.name));
        let index = views.filter((view) => view.type === type).length + 1;
        let name = labelByType[type];
        while (existingNames.has(name)) {
          index += 1;
          name = `${labelByType[type]} ${index}`;
        }
        const view = {
          id: viewId,
          name,
          type,
          created_at: now,
        };
        created = true;
        return {
          ...group,
          views: [...views, view],
          active_view_id: view.id,
        };
      });
      const edges = syncDerivedGroupEdges(groups, state.edges);
      persistGraph(state.nodes, edges, groups);
      return { groups, edges };
    });
    return created ? viewId : null;
  },

  setActiveGroupView: (groupId, viewId) => {
    set((state) => {
      const groups = state.groups.map((group) => {
        if (group.id !== groupId) return group;
        if (!group.views?.some((view) => view.id === viewId)) return group;
        return { ...group, active_view_id: viewId };
      });
      const edges = syncDerivedGroupEdges(groups, state.edges);
      persistGraph(state.nodes, edges, groups);
      return { groups, edges };
    });
  },

  updateGroupView: (groupId, viewId, patch) => {
    set((state) => {
      const groups = state.groups.map((group) => {
        if (group.id !== groupId || !group.views) return group;
        const nodeIds = new Set(group.node_ids);
        return {
          ...group,
          views: group.views.map((view) =>
            view.id === viewId
              ? {
                  ...view,
                  name: view.id === NODE_INTERFACE_LIST_VIEW_ID
                    ? NODE_INTERFACE_LIST_VIEW_NAME
                    : patch.name?.trim() || view.name,
                  node_order: patch.node_order
                    ? patch.node_order.filter((id) => nodeIds.has(id))
                    : view.node_order,
                }
              : view,
          ),
        };
      });
      persistGraph(state.nodes, state.edges, groups);
      return { groups };
    });
  },

  removeGroupView: (groupId, viewId) => {
    captureHistorySnapshot();
    set((state) => {
      const groups = state.groups.map((group) => {
        if (group.id !== groupId || !group.views) return group;
        const view = group.views.find((item) => item.id === viewId);
        if (!view || view.type === 'graph' || view.id === NODE_INTERFACE_LIST_VIEW_ID) return group;
        const views = group.views.filter((item) => item.id !== viewId);
        return {
          ...group,
          views,
          active_view_id: group.active_view_id === viewId ? views[0]?.id : group.active_view_id,
        };
      });
      persistGraph(state.nodes, state.edges, groups);
      return { groups };
    });
  },

  updateGroupViewNodeOrder: (groupId, viewId, nodeOrder) => {
    perfTime('graph:update-group-view-node-order', () => {
      set((state) => {
        const groups = state.groups.map((group) => {
          if (group.id !== groupId || !group.views) return group;
          const nodeIds = new Set(group.node_ids);
          const cleanedOrder = nodeOrder.filter((id) => nodeIds.has(id));
          const currentOrder = group.views.find((view) => view.id === viewId)?.node_order ?? [];
          if (cleanedOrder.length === currentOrder.length && cleanedOrder.every((id, index) => id === currentOrder[index])) {
            return group;
          }
          return {
            ...group,
            views: group.views.map((view) =>
              view.id === viewId ? { ...view, node_order: cleanedOrder } : view,
            ),
          };
        });
        if (groups.every((group, index) => group === state.groups[index])) return state;
        persistGraph(state.nodes, state.edges, groups);
        return { groups };
      });
    });
  },

  addNodesToGroup: (groupId, nodeIds) => {
    if (nodeIds.length === 0) return;
    captureHistorySnapshot();
    set((state) => {
      const validIds = new Set(state.nodes.map((n) => n.id));
      const toAdd = nodeIds.filter((id) => validIds.has(id));
      if (toAdd.length === 0) return state;
      let groups = state.groups.map((g) => {
        if (g.id !== groupId) return g;
        const uniqueToAdd = [...new Set(toAdd)];
        const nextNodeIds = [...new Set([...g.node_ids, ...uniqueToAdd])];
        return {
          ...g,
          node_ids: nextNodeIds,
          views: g.views?.map((view) =>
            view.id === NODE_INTERFACE_LIST_VIEW_ID
              ? {
                  ...view,
                  name: NODE_INTERFACE_LIST_VIEW_NAME,
                  node_order: [
                    ...(view.node_order ?? []).filter((id) => nextNodeIds.includes(id) && !uniqueToAdd.includes(id)),
                    ...uniqueToAdd,
                  ],
                }
              : view,
          ),
        };
      });
      groups = expandGroupsToIncludeNodes(groups, state.nodes, [
        { groupId, nodeIds: toAdd },
      ]);
      const edges = syncDerivedGroupEdges(groups, state.edges);
      persistGraph(state.nodes, edges, groups);
      return { groups, edges };
    });
  },

  removeNodeFromGroup: (groupId, nodeId) => {
    captureHistorySnapshot();
    set((state) => {
      const groups = state.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              node_ids: g.node_ids.filter((id) => id !== nodeId),
              views: g.views?.map((view) =>
                view.id === NODE_INTERFACE_LIST_VIEW_ID
                  ? {
                      ...view,
                      name: NODE_INTERFACE_LIST_VIEW_NAME,
                      node_order: view.node_order?.filter((id) => id !== nodeId),
                    }
                  : view,
              ),
            }
          : g,
      );
      const edges = syncDerivedGroupEdges(groups, state.edges);
      persistGraph(state.nodes, edges, groups);
      return { groups, edges };
    });
  },

  commitListDrag: ({ nodePositions, removeFromGroups, targetGroupId, targetOrder }) => {
    if (nodePositions.length === 0 && removeFromGroups.length === 0 && !targetGroupId) return;
    captureHistorySnapshot();
    set((state) => {
      return perfTime('graph:commit-list-drag', () => {
      const positionById = new Map(nodePositions.map((item) => [item.id, item]));
      const movedNodeIds = new Set(nodePositions.map((item) => item.id));
      const removalsByGroup = new Map<string, Set<string>>();
      for (const item of removeFromGroups) {
        const ids = removalsByGroup.get(item.groupId) ?? new Set<string>();
        ids.add(item.nodeId);
        removalsByGroup.set(item.groupId, ids);
      }

      const nodes = state.nodes.map((node) => {
        const position = positionById.get(node.id);
        return position ? { ...node, x: position.x, y: position.y } : node;
      });

      const groups = state.groups.map((group) => {
        const removeIds = removalsByGroup.get(group.id);
        const isTarget = targetGroupId === group.id;
        if (!removeIds && !isTarget) return group;

        const nextNodeIds = isTarget
          ? [...new Set([...group.node_ids.filter((id) => !removeIds?.has(id)), ...movedNodeIds])]
          : group.node_ids.filter((id) => !removeIds?.has(id));
        const targetOrderSet = new Set(targetOrder ?? []);
        const nextViews = group.views?.map((view) => {
          if (view.id !== NODE_INTERFACE_LIST_VIEW_ID) return view;
          if (isTarget && targetOrder) {
            return {
              ...view,
              name: NODE_INTERFACE_LIST_VIEW_NAME,
              node_order: [
                ...targetOrder.filter((id) => nextNodeIds.includes(id)),
                ...(view.node_order ?? []).filter((id) => nextNodeIds.includes(id) && !targetOrderSet.has(id)),
              ],
            };
          }
          return {
            ...view,
            name: NODE_INTERFACE_LIST_VIEW_NAME,
            node_order: view.node_order?.filter((id) => nextNodeIds.includes(id)),
          };
        });

        return {
          ...group,
          node_ids: nextNodeIds,
          views: nextViews,
        };
      });

      const edges = perfTime('graph:commit-list-drag:sync-derived-edges', () =>
        syncDerivedGroupEdges(groups, state.edges), {
          groups: groups.length,
          edges: state.edges.length,
        });
      persistGraph(nodes, edges, groups);
      return { nodes, groups, edges };
      }, {
        nodes: nodePositions.length,
        removals: removeFromGroups.length,
        targetGroupId,
      });
    });
  },

  moveGroupWithNodes: (groupId, dx, dy) => {
    if (dx === 0 && dy === 0) return;
    set((state) => {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group) return state;
      const memberSet = new Set(group.node_ids);
      const nodes = state.nodes.map((node) => {
        if (!memberSet.has(node.id) || node.x == null || node.y == null) return node;
        return { ...node, x: node.x + dx, y: node.y + dy };
      });
      const groups = state.groups.map((g) =>
        g.id === groupId
          ? { ...g, x: (g.x ?? 0) + dx, y: (g.y ?? 0) + dy }
          : g,
      );
      persistGraph(nodes, state.edges, groups);
      return { nodes, groups };
    });
  },

  commitGroupMove: (groupId, dx, dy) => {
    if (dx === 0 && dy === 0) return;
    captureHistorySnapshot();
    get().moveGroupWithNodes(groupId, dx, dy);
  },

  commitGroupResize: (groupId, patch) => {
    captureHistorySnapshot();
    const clamped = {
      width: Math.max(NETWORK_BOX_MIN_WIDTH, patch.width),
      height: Math.max(NETWORK_BOX_MIN_HEIGHT, patch.height),
    };
    get().updateGroup(groupId, {
      x: patch.x,
      y: patch.y,
      width: clamped.width,
      height: clamped.height,
    });
  },

  syncNodeGroupMembership: (nodeId, x, y) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const parentId = node.parent_id ?? null;
    set((state) => {
      let changed = false;
      const expandRequests: Array<{ groupId: string; nodeIds: string[] }> = [];
      let groups = state.groups.map((group) => {
        if ((group.parent_id ?? null) !== parentId) return group;
        const inside = pointInsideNetworkBox(x, y, group);
        const hasNode = group.node_ids.includes(nodeId);
        if (inside && !hasNode) {
          changed = true;
          expandRequests.push({ groupId: group.id, nodeIds: [nodeId] });
          const nextNodeIds = [...group.node_ids, nodeId];
          return {
            ...group,
            node_ids: nextNodeIds,
            views: group.views?.map((view) =>
              view.id === NODE_INTERFACE_LIST_VIEW_ID
                ? {
                    ...view,
                    name: NODE_INTERFACE_LIST_VIEW_NAME,
                    node_order: [
                      ...(view.node_order ?? []).filter((id) => nextNodeIds.includes(id) && id !== nodeId),
                      nodeId,
                    ],
                  }
                : view,
            ),
          };
        }
        if (!inside && hasNode) {
          changed = true;
          return {
            ...group,
            node_ids: group.node_ids.filter((id) => id !== nodeId),
            views: group.views?.map((view) =>
              view.id === NODE_INTERFACE_LIST_VIEW_ID
                ? {
                    ...view,
                    name: NODE_INTERFACE_LIST_VIEW_NAME,
                    node_order: view.node_order?.filter((id) => id !== nodeId),
                  }
                : view,
            ),
          };
        }
        return group;
      });
      if (!changed) return state;
      groups = expandGroupsToIncludeNodes(groups, state.nodes, expandRequests);
      const edges = syncDerivedGroupEdges(groups, state.edges);
      persistGraph(state.nodes, edges, groups);
      return { groups, edges };
    });
  },

  fitGroupToNodes: (groupId) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    if (!group || group.node_ids.length === 0) return;
    const members = group.node_ids
      .map((id) => state.nodes.find((n) => n.id === id))
      .filter((node): node is MindNode => Boolean(node && node.x != null && node.y != null));
    if (members.length === 0) return;
    const bounds = computeNetworkBoxBounds(members);
    if (!bounds) return;
    get().updateGroup(groupId, bounds);
  },

}));
