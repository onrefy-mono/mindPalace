import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useFocusStore } from '../../stores/focusStore';
import { useGraphStore } from '../../stores/graphStore';
import { getNodesInGraph, canEnterSubnet } from '../../lib/graphContext';
import { perfCount, perfEvent, perfMark, perfMeasure, perfTime } from '../../lib/perf';
import {
  getGroupsInGraph,
  NETWORK_BOX_TITLE_HEIGHT,
  NODE_INTERFACE_LIST_VIEW_ID,
  pointInsideNetworkBox,
} from '../../lib/networkBox';
import {
  applyNetworkBoxVisual,
  clampNetworkBoxSize,
  mountNetworkBoxStructure,
  networkBoxTransform,
  type BoxInteraction,
  type NetworkBoxDatum,
} from '../../lib/d3NetworkBox';
import {
  appendNodeCircle,
  applyLinkMidDecoration,
  applyLinkVisual,
  applyNodeVisual,
  appendLinkMidDecoration,
  linkEndpoint,
  linkPath,
  closestLinkPosition,
  linkVisibleEndpoints,
  linkMidlabel,
  nodeRadius,
  resolveSimLinks,
  findEdgeHover,
  updateLinkMidPositions,
  type SimLink,
  type SimNode,
} from '../../lib/d3Graph';
import {
  DOMAIN_COLORS,
  EDGE_TYPE_COLORS,
  EDGE_TYPE_LABELS,
  EDGE_TYPES,
  NODE_DRAG_MIME,
  edgeTypeHasDirection,
  type CreateNodeContext,
  type EdgeType,
  type EdgeEndpointKind,
} from '../../types';
import { GraphLegend } from './GraphLegend';
import { GraphContextMenu, type ContextMenuItem } from './GraphContextMenu';
import { EdgeTypePicker } from './EdgeTypePicker';
import { AiNodeGroupPreview } from './AiNodeGroupPreview';
import { usePersistentState } from '../../hooks/usePersistentState';

interface MindGraphProps {
  onOpenCreateNode: (context?: CreateNodeContext) => void;
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface LabelEditorState {
  nodeId: string;
  value: string;
  left: number;
  top: number;
  width: number;
}

interface EdgeLabelEditorState {
  edgeId: string;
  value: string;
  initialValue: string;
  left: number;
  top: number;
  width: number;
}

interface BoxTitleEditorState {
  groupId: string;
  value: string;
  left: number;
  top: number;
  width: number;
}

type EdgeEndpointRole = 'source' | 'target';

interface EdgeHandleDatum {
  id: string;
  edgeId: string;
  role: EdgeEndpointRole;
  link: SimLink;
}

interface GroupDragState {
  anchorStartX: number;
  anchorStartY: number;
  originals: Map<string, { x: number; y: number }>;
  boxOriginals: Map<string, { x: number; y: number }>;
}

interface GraphRuntime {
  simNodes: SimNode[];
  linkEndpointNodes: SimNode[];
  simNodeById: Map<string, SimNode>;
  runtimeGroupById: Map<string, NetworkBoxDatum>;
  linkEndpointNodeById: Map<string, SimNode>;
  runtimeGroupMemberIds: Map<string, Set<string>>;
  nodeSelection: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown> | null;
  linkHitSelection: d3.Selection<SVGPathElement, SimLink, SVGGElement, unknown> | null;
  linkSelection: d3.Selection<SVGPathElement, SimLink, SVGGElement, unknown> | null;
  linkSymbolSelection: d3.Selection<SVGGElement, SimLink, SVGGElement, unknown> | null;
  edgeHandleSelection: d3.Selection<SVGGElement, EdgeHandleDatum, SVGGElement, unknown> | null;
  labelSelection: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown> | null;
  networkBoxSelection: d3.Selection<SVGGElement, NetworkBoxDatum, SVGGElement, unknown> | null;
  root: d3.Selection<SVGGElement, unknown, null, undefined> | null;
  wirePreview: d3.Selection<SVGLineElement, unknown, null, undefined> | null;
  edgeReconnectPreview: d3.Selection<SVGLineElement, unknown, null, undefined> | null;
  snapGuideX: d3.Selection<SVGLineElement, unknown, null, undefined> | null;
  snapGuideY: d3.Selection<SVGLineElement, unknown, null, undefined> | null;
  simulation: d3.Simulation<SimNode, SimLink> | null;
  refreshGraphGeometry: (() => void) | null;
  refreshLinkGeometry: (() => void) | null;
  beginWireFromEndpoint: ((
    event: MouseEvent,
    id: string,
    kind: EdgeEndpointKind,
    anchor: { lx: number; ly: number },
  ) => void) | null;
}

const PORT_EDGE_INNER = 0.45;
const PORT_EDGE_OUTER = 2.45;
/** A 键整理：横向 / 纵向默认节点间距（图坐标） */
const ALIGN_DEFAULT_SPACING_X = 120;
const ALIGN_DEFAULT_SPACING_Y = 96;
const ALIGN_LABEL_GAP_X = 28;
const NODE_SNAP_THRESHOLD = 12;
const BOX_MOVE_SNAP_THRESHOLD = 12;
const BOX_RESIZE_SNAP_THRESHOLD = 6;
const BOX_LIST_ROW_HEIGHT = 42;
const BOX_LIST_TOP_PADDING = 44;
const BOX_LIST_MAX_WIDTH = 360;
const BOX_LIST_CARD_HEIGHT = 34;
const BOX_PORT_HIT_WIDTH = 18;
const BOX_PORT_HIT_HEIGHT = 28;
const GRAPH_VIEW_SAVE_DELAY_MS = 180;
const WHEEL_ZOOM_APPLY_INTERVAL_MS = 220;

interface SnapPosition {
  x: number;
  y: number;
  snapX: boolean;
  snapY: boolean;
}

interface StoredGraphView {
  x: number;
  y: number;
  k: number;
}

type BoxResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface BoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ListDragPreviewState {
  primaryNodeId: string;
  nodeIds: string[];
  targetGroupId: string | null;
  insertAt: number | null;
  order: string[];
  originals: Map<
    string,
    Pick<SimNode, 'viewMode' | 'listGroupId' | 'listCardWidth' | 'listCardHeight' | 'x' | 'y' | 'fx' | 'fy'>
  >;
}

const GRAPH_VIEW_STORAGE_PREFIX = 'mind-palace-graph-view';

function graphViewStorageKey(viewParentId: string | null) {
  return `${GRAPH_VIEW_STORAGE_PREFIX}:${viewParentId ?? 'root'}`;
}

function readStoredGraphView(viewParentId: string | null): d3.ZoomTransform | null {
  try {
    const raw = localStorage.getItem(graphViewStorageKey(viewParentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGraphView>;
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.k !== 'number' ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y) ||
      !Number.isFinite(parsed.k)
    ) {
      return null;
    }
    return d3.zoomIdentity.translate(parsed.x, parsed.y).scale(parsed.k);
  } catch {
    return null;
  }
}

function writeStoredGraphView(viewParentId: string | null, transform: d3.ZoomTransform) {
  try {
    localStorage.setItem(
      graphViewStorageKey(viewParentId),
      JSON.stringify({ x: transform.x, y: transform.y, k: transform.k }),
    );
  } catch {
    // Ignore storage failures so canvas interaction stays uninterrupted.
  }
}

function editableSimLinkId(link: Pick<SimLink, 'id' | 'derivedFromEdgeId'>) {
  return link.derivedFromEdgeId ?? link.id;
}

function nodeEdgeDisplayKey(source: string, target: string, type: EdgeType) {
  if (edgeTypeHasDirection(type)) return `${source}>${target}|${type}`;
  return source < target ? `${source}|${target}|${type}` : `${target}|${source}|${type}`;
}

function clampZoomScale(scale: number) {
  return Math.max(0.25, Math.min(2.5, scale));
}

function wheelScaleFactor(event: WheelEvent) {
  const modeFactor = event.deltaMode === 1 ? 0.05 : event.deltaMode === 2 ? 1 : 0.002;
  return Math.pow(2, -event.deltaY * modeFactor);
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function isNodeLabelDragTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('.labels'));
}

function nodeDragFilter(event: MouseEvent) {
  if (isNodeLabelDragTarget(event.target)) return false;
  return !event.altKey && !event.shiftKey;
}

function boxViewUrl(groupId: string, viewId: string) {
  return `${window.location.origin}${window.location.pathname}#/box-view/${encodeURIComponent(groupId)}/${encodeURIComponent(viewId)}`;
}

function isQuickDeleteNode(node: SimNode) {
  return node.nodeType === 'goal' || node.nodeType === 'task';
}

type BoxSelectMode = 'replace' | 'add' | 'remove';

export function MindGraph({ onOpenCreateNode }: MindGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const graphRef = useRef<GraphRuntime>({
    simNodes: [],
    linkEndpointNodes: [],
    simNodeById: new Map(),
    runtimeGroupById: new Map(),
    linkEndpointNodeById: new Map(),
    runtimeGroupMemberIds: new Map(),
    nodeSelection: null,
    linkHitSelection: null,
    linkSelection: null,
    linkSymbolSelection: null,
    edgeHandleSelection: null,
    labelSelection: null,
    networkBoxSelection: null,
    root: null,
    wirePreview: null,
    edgeReconnectPreview: null,
    snapGuideX: null,
    snapGuideY: null,
    simulation: null,
    refreshGraphGeometry: null,
    refreshLinkGeometry: null,
    beginWireFromEndpoint: null,
  });
  const onCreateRef = useRef(onOpenCreateNode);
  onCreateRef.current = onOpenCreateNode;

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const groups = useGraphStore((s) => s.groups);
  const viewParentId = useGraphStore((s) => s.viewParentId);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const selectedGroupId = useGraphStore((s) => s.selectedGroupId);
  const selectedGroupIds = useGraphStore((s) => s.selectedGroupIds);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const setSelectedNodes = useGraphStore((s) => s.setSelectedNodes);
  const setSelectedNodesAndGroups = useGraphStore((s) => s.setSelectedNodesAndGroups);
  const toggleNodeSelection = useGraphStore((s) => s.toggleNodeSelection);
  const setSelectedEdge = useGraphStore((s) => s.setSelectedEdge);
  const setSelectedGroup = useGraphStore((s) => s.setSelectedGroup);
  const toggleGroupSelection = useGraphStore((s) => s.toggleGroupSelection);
  const updateNodePosition = useGraphStore((s) => s.updateNodePosition);
  const linkMode = useGraphStore((s) => s.linkMode);
  const linkSourceId = useGraphStore((s) => s.linkSourceId);
  const linkSourceKind = useGraphStore((s) => s.linkSourceKind);
  const toggleLinkMode = useGraphStore((s) => s.toggleLinkMode);
  const cancelLinkMode = useGraphStore((s) => s.cancelLinkMode);
  const handleLinkClick = useGraphStore((s) => s.handleLinkClick);
  const setLinkSource = useGraphStore((s) => s.setLinkSource);
  const stageEdgeConnect = useGraphStore((s) => s.stageEdgeConnect);
  const pendingEdgeConnect = useGraphStore((s) => s.pendingEdgeConnect);
  const confirmPendingEdge = useGraphStore((s) => s.confirmPendingEdge);
  const cancelPendingEdge = useGraphStore((s) => s.cancelPendingEdge);
  const edgeLabelMode = useGraphStore((s) => s.edgeLabelMode);
  const globalTextMode = useGraphStore((s) => s.globalTextMode);
  const toggleGlobalTextMode = useGraphStore((s) => s.toggleGlobalTextMode);
  const setCreatePointer = useGraphStore((s) => s.setCreatePointer);
  const createPointer = useGraphStore((s) => s.createPointer);
  const toggleEdgeLabelMode = useGraphStore((s) => s.toggleEdgeLabelMode);
  const addEdge = useGraphStore((s) => s.addEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const reverseEdge = useGraphStore((s) => s.reverseEdge);
  const updateEdge = useGraphStore((s) => s.updateEdge);
  const updateEdgeEndpoints = useGraphStore((s) => s.updateEdgeEndpoints);
  const enterSubnet = useGraphStore((s) => s.enterSubnet);
  const updateNode = useGraphStore((s) => s.updateNode);
  const removeNodes = useGraphStore((s) => s.removeNodes);
  const createShortcutNode = useGraphStore((s) => s.createShortcutNode);
  const jumpToShortcutTarget = useGraphStore((s) => s.jumpToShortcutTarget);
  const shortcutNotice = useGraphStore((s) => s.shortcutNotice);
  const shortcutReturnPrompt = useGraphStore((s) => s.shortcutReturnPrompt);
  const returnToShortcutSource = useGraphStore((s) => s.returnToShortcutSource);
  const dismissShortcutReturnPrompt = useGraphStore((s) => s.dismissShortcutReturnPrompt);
  const clearShortcutNotice = useGraphStore((s) => s.clearShortcutNotice);
  const syncNodeGroupMembership = useGraphStore((s) => s.syncNodeGroupMembership);
  const commitGroupMove = useGraphStore((s) => s.commitGroupMove);
  const commitGroupResize = useGraphStore((s) => s.commitGroupResize);
  const removeGroup = useGraphStore((s) => s.removeGroup);
  const updateGroup = useGraphStore((s) => s.updateGroup);
  const setActiveGroupView = useGraphStore((s) => s.setActiveGroupView);
  const updateGroupViewNodeOrder = useGraphStore((s) => s.updateGroupViewNodeOrder);
  const removeNodeFromGroup = useGraphStore((s) => s.removeNodeFromGroup);
  const commitListDrag = useGraphStore((s) => s.commitListDrag);
  const cutSelectionToClipboard = useGraphStore((s) => s.cutSelectionToClipboard);
  const pasteNodeClipboard = useGraphStore((s) => s.pasteNodeClipboard);

  const boxInteractionRef = useRef<BoxInteraction | null>(null);

  const linkLabelMode = edgeLabelMode;

  const storeRef = useRef({
    linkMode,
    linkSourceId,
    linkSourceKind,
    selectedNodeIds,
    selectedGroupId,
    selectedGroupIds,
    selectedEdgeId,
    handleLinkClick,
    setLinkSource,
    stageEdgeConnect,
    setSelectedNode,
    setSelectedNodes,
    setSelectedNodesAndGroups,
    toggleNodeSelection,
    setSelectedEdge,
    setSelectedGroup,
    toggleGroupSelection,
    addEdge,
    removeEdge,
    reverseEdge,
    updateEdge,
    updateEdgeEndpoints,
    enterSubnet,
    updateNodePosition,
    updateNode,
    removeNodes,
    createShortcutNode,
    jumpToShortcutTarget,
    syncNodeGroupMembership,
    commitGroupMove,
    commitGroupResize,
    removeGroup,
    updateGroup,
    setActiveGroupView,
    updateGroupViewNodeOrder,
    removeNodeFromGroup,
    commitListDrag,
    cutSelectionToClipboard,
    pasteNodeClipboard,
  });
  storeRef.current = {
    linkMode,
    linkSourceId,
    linkSourceKind,
    selectedNodeIds,
    selectedGroupId,
    selectedGroupIds,
    selectedEdgeId,
    handleLinkClick,
    setLinkSource,
    stageEdgeConnect,
    setSelectedNode,
    setSelectedNodes,
    setSelectedNodesAndGroups,
    toggleNodeSelection,
    setSelectedEdge,
    setSelectedGroup,
    toggleGroupSelection,
    addEdge,
    removeEdge,
    reverseEdge,
    updateEdge,
    updateEdgeEndpoints,
    enterSubnet,
    updateNodePosition,
    updateNode,
    removeNodes,
    createShortcutNode,
    jumpToShortcutTarget,
    syncNodeGroupMembership,
    commitGroupMove,
    commitGroupResize,
    removeGroup,
    updateGroup,
    setActiveGroupView,
    updateGroupViewNodeOrder,
    removeNodeFromGroup,
    commitListDrag,
    cutSelectionToClipboard,
    pasteNodeClipboard,
  };

  const focusItems = useFocusStore((s) => s.items);
  const activeFocusId = useFocusStore((s) => s.activeId);
  const activeFocus = focusItems.find((f) => f.id === activeFocusId);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [reactZoomTransform, setReactZoomTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);
  const [performanceMode, setPerformanceMode] = usePersistentState(
    'mind-palace-ui-graph-performance-mode',
    false,
  );
  const [contextMenu, setContextMenu] = useState<MenuState | null>(null);
  const [labelEditor, setLabelEditor] = useState<LabelEditorState | null>(null);
  const [edgeLabelEditor, setEdgeLabelEditor] = useState<EdgeLabelEditorState | null>(null);
  const [boxTitleEditor, setBoxTitleEditor] = useState<BoxTitleEditorState | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const [boxSelectUi, setBoxSelectUi] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const setBoxSelectUiRef = useRef(setBoxSelectUi);
  setBoxSelectUiRef.current = setBoxSelectUi;
  const labelInputRef = useRef<HTMLInputElement>(null);
  const edgeLabelInputRef = useRef<HTMLInputElement>(null);
  const boxTitleInputRef = useRef<HTMLInputElement>(null);

  const completeOrDeleteNode = (node: SimNode) => {
    if (!isQuickDeleteNode(node)) return false;
    if (node.status === 'done') {
      storeRef.current.removeNodes([node.id]);
    } else {
      storeRef.current.updateNode(node.id, { status: 'done' });
    }
    return true;
  };

  const activeFocusNodeIds = useMemo(() => {
    if (!activeFocus || activeFocus.status === 'done') return new Set<string>();
    return new Set(activeFocus.linked_node_ids);
  }, [activeFocus]);

  const visibleNodes = useMemo(
    () => perfTime('graph:visible-nodes', () => getNodesInGraph(nodes, viewParentId), {
      nodes: nodes.length,
      viewParentId,
    }),
    [nodes, viewParentId],
  );

  const visibleGroups = useMemo(
    () => perfTime('graph:visible-groups', () => getGroupsInGraph(groups, viewParentId), {
      groups: groups.length,
      viewParentId,
    }),
    [groups, viewParentId],
  );

  const visibleEdges = useMemo(() => {
    return perfTime('graph:visible-edges', () => {
      const nodeIds = new Set(visibleNodes.map((node) => node.id));
      const groupIds = new Set(visibleGroups.map((group) => group.id));
      const endpointVisible = (id: string, kind: 'node' | 'group' | undefined) =>
        (kind ?? 'node') === 'group' ? groupIds.has(id) : nodeIds.has(id);
      return edges.filter((edge) =>
        (!edge.hidden || Boolean(edge.derived_from_group_id)) &&
        endpointVisible(edge.source, edge.source_kind) &&
        endpointVisible(edge.target, edge.target_kind),
      );
    }, {
      edges: edges.length,
      visibleNodes: visibleNodes.length,
      visibleGroups: visibleGroups.length,
    });
  }, [visibleNodes, visibleGroups, edges]);

  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  const selectedGroupIdSet = useMemo(() => new Set(selectedGroupIds), [selectedGroupIds]);

  const selectedGroupMemberIds = useMemo(() => {
    return new Set(
      groups
        .filter((group) => selectedGroupIdSet.has(group.id))
        .flatMap((group) => group.node_ids),
    );
  }, [groups, selectedGroupIdSet]);

  const visibleNodeById = useMemo(
    () => new Map(visibleNodes.map((node) => [node.id, node])),
    [visibleNodes],
  );
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const coveredNodeEdgeKeys = useMemo(() => {
    const keys = new Set<string>();
    const visibleGroupById = new Map(visibleGroups.map((group) => [group.id, group]));
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

    for (const edge of visibleEdges) {
      if (edge.derived_from_edge_id) continue;
      const sourceKind = edge.source_kind ?? 'node';
      const targetKind = edge.target_kind ?? 'node';
      if (sourceKind === 'node' && targetKind === 'node') continue;

      const sourceIds = sourceKind === 'group'
        ? (visibleGroupById.get(edge.source)?.node_ids ?? []).filter((id) => visibleNodeIds.has(id))
        : visibleNodeIds.has(edge.source)
          ? [edge.source]
          : [];
      const targetIds = targetKind === 'group'
        ? (visibleGroupById.get(edge.target)?.node_ids ?? []).filter((id) => visibleNodeIds.has(id))
        : visibleNodeIds.has(edge.target)
          ? [edge.target]
          : [];

      for (const source of sourceIds) {
        for (const target of targetIds) {
          if (source === target) continue;
          keys.add(nodeEdgeDisplayKey(source, target, edge.type));
        }
      }
    }

    return keys;
  }, [visibleEdges, visibleGroups, visibleNodes]);

  const focusNeighborIds = useMemo(() => {
    const neighborIds = new Set<string>();
    for (const edge of visibleEdges) {
      if (activeFocusNodeIds.has(edge.source)) neighborIds.add(edge.target);
      if (activeFocusNodeIds.has(edge.target)) neighborIds.add(edge.source);
    }
    return neighborIds;
  }, [visibleEdges, activeFocusNodeIds]);

  const focusNodeColorById = useMemo(() => {
    const colors = new Map<string, string>();
    for (const item of focusItems) {
      if (item.status === 'done') continue;
      const color = item.color || DOMAIN_COLORS[item.domain];
      for (const nodeId of item.linked_node_ids) {
        if (visibleNodeById.has(nodeId)) colors.set(nodeId, color);
      }
    }
    return colors;
  }, [focusItems, visibleNodeById]);

  const layoutSignature = useMemo(
    () =>
      perfTime('graph:layout-signature', () =>
        JSON.stringify({
          viewParentId,
          nodes: visibleNodes.map((n) => `${n.id}|${n.type}`).sort(),
          edges: visibleEdges
            .map((e) =>
              `${e.id}|${e.source_kind ?? 'node'}:${e.source}|${e.target_kind ?? 'node'}:${e.target}|${e.type}|${e.label ?? ''}|${e.label_position ?? 0.5}|${e.hidden ? 'hidden' : 'visible'}|${e.derived_from_group_id ?? ''}|${e.derived_from_edge_id ?? ''}`,
            )
            .sort(),
          groupViews: visibleGroups
            .map((group) => {
              const activeView = group.views?.find((view) => view.id === group.active_view_id);
              return `${group.id}|${group.active_view_id}|${group.width}|${group.height}|${activeView?.node_order?.join(',') ?? ''}|${group.node_ids.join(',')}`;
            })
            .sort(),
        }), {
          visibleNodes: visibleNodes.length,
          visibleEdges: visibleEdges.length,
          visibleGroups: visibleGroups.length,
        }),
    [viewParentId, visibleNodes, visibleEdges, visibleGroups],
  );

  const listGroupLayout = useMemo(() => {
    const layoutByNode = new Map<
      string,
      { groupId: string; x: number; y: number; cardWidth: number; cardHeight: number }
    >();
    const activeListGroupByNode = new Map<string, string>();

    for (const group of getGroupsInGraph(groups, viewParentId)) {
      const activeView = group.views?.find((view) => view.id === group.active_view_id);
      if (activeView?.type !== 'list') continue;

      const nodeOrder = activeView.node_order ?? [];
      const orderIndex = new Map(nodeOrder.map((id, index) => [id, index]));
      const members = group.node_ids
        .map((id) => visibleNodeById.get(id))
        .filter((node): node is typeof visibleNodes[number] => Boolean(node))
        .sort((a, b) => {
          const aOrder = orderIndex.get(a.id);
          const bOrder = orderIndex.get(b.id);
          if (aOrder != null && bOrder != null) return aOrder - bOrder;
          if (aOrder != null) return -1;
          if (bOrder != null) return 1;
          return (a.y ?? 0) - (b.y ?? 0);
        });

      const cardWidth = Math.max(160, Math.min(BOX_LIST_MAX_WIDTH, (group.width ?? 320) - 48));
      const x = (group.x ?? 0) + (group.width ?? 320) / 2;
      members.forEach((node, index) => {
        activeListGroupByNode.set(node.id, group.id);
        layoutByNode.set(node.id, {
          groupId: group.id,
          x,
          y: (group.y ?? 0) + NETWORK_BOX_TITLE_HEIGHT + BOX_LIST_TOP_PADDING + index * BOX_LIST_ROW_HEIGHT,
          cardWidth,
          cardHeight: BOX_LIST_CARD_HEIGHT,
        });
      });
    }

    return { layoutByNode, activeListGroupByNode };
  }, [groups, viewParentId, visibleNodeById]);

  const buildSimNodes = useMemo((): SimNode[] => {
    return perfTime('graph:build-sim-nodes', () => {
      return visibleNodes.map((node) => {
        const shortcutTarget = node.shortcut_target_id ? nodeById.get(node.shortcut_target_id) : undefined;
        const displayNode = shortcutTarget ?? node;
        const isFocus = activeFocusNodeIds.has(node.id);
        const isNeighbor = focusNeighborIds.has(node.id) && !isFocus;
        const sim: SimNode = {
          id: node.id,
          label: displayNode.label,
          nodeType: displayNode.type,
          status: displayNode.status,
          isShortcut: Boolean(node.shortcut_target_id),
          shortcutTargetMissing: Boolean(node.shortcut_target_id && !shortcutTarget),
          accentColor: focusNodeColorById.get(node.id),
          isFocus,
          isNeighbor,
          isSelected: selectedNodeIdSet.has(node.id) || selectedGroupMemberIds.has(node.id),
          isLinkSource: linkSourceId === node.id,
          radius: nodeRadius(isFocus, isNeighbor),
        };
        const listLayout = listGroupLayout.layoutByNode.get(node.id);
        if (listLayout) {
          sim.x = listLayout.x;
          sim.y = listLayout.y;
          sim.fx = listLayout.x;
          sim.fy = listLayout.y;
          sim.viewMode = 'list';
          sim.listGroupId = listLayout.groupId;
          sim.listCardWidth = listLayout.cardWidth;
          sim.listCardHeight = listLayout.cardHeight;
        } else if (node.x != null && node.y != null) {
          sim.x = node.x;
          sim.y = node.y;
          sim.fx = node.x;
          sim.fy = node.y;
        }
        return sim;
      });
    }, {
      visibleNodes: visibleNodes.length,
      focusNeighbors: focusNeighborIds.size,
    });
  }, [
    visibleNodes,
    nodeById,
    activeFocusNodeIds,
    focusNeighborIds,
    focusNodeColorById,
    selectedNodeIdSet,
    selectedGroupMemberIds,
    linkSourceId,
    listGroupLayout,
  ]);

  const buildLinkEndpointNodes = useMemo((): SimNode[] => {
    const groupNodes: SimNode[] = visibleGroups.map((group) => ({
      id: group.id,
      label: group.name,
      nodeType: 'concept',
      isFocus: false,
      isNeighbor: false,
      isSelected: selectedGroupIdSet.has(group.id),
      isLinkSource: false,
      radius: 0,
      x: (group.x ?? 0) + (group.width ?? 320) / 2,
      y: (group.y ?? 0) + (group.height ?? 220) / 2,
      fx: (group.x ?? 0) + (group.width ?? 320) / 2,
      fy: (group.y ?? 0) + (group.height ?? 220) / 2,
      endpointKind: 'group',
      boxWidth: group.width ?? 320,
      boxHeight: group.height ?? 220,
    }));
    return [...buildSimNodes, ...groupNodes];
  }, [buildSimNodes, visibleGroups, selectedGroupIdSet]);

  const buildSimLinks = useMemo((): SimLink[] => {
    return visibleEdges
      .filter((edge) => {
        if (edge.derived_from_edge_id && edge.hidden) {
          return false;
        }
        if ((edge.source_kind ?? 'node') === 'group' || (edge.target_kind ?? 'node') === 'group') {
          return true;
        }
        if (!edge.derived_from_edge_id && coveredNodeEdgeKeys.has(nodeEdgeDisplayKey(edge.source, edge.target, edge.type))) {
          return false;
        }
        const sourceListGroup = listGroupLayout.activeListGroupByNode.get(edge.source);
        const targetListGroup = listGroupLayout.activeListGroupByNode.get(edge.target);
        return !sourceListGroup || sourceListGroup !== targetListGroup;
      })
      .map((edge) => {
      const isHighlighted =
        activeFocusNodeIds.has(edge.source) || activeFocusNodeIds.has(edge.target);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceKind: edge.source_kind ?? 'node',
        targetKind: edge.target_kind ?? 'node',
        hidden: edge.hidden,
        derivedFromGroupId: edge.derived_from_group_id,
        derivedFromEdgeId: edge.derived_from_edge_id,
        edgeType: edge.type,
        label: edge.label,
        labelPosition: edge.label_position,
        isHighlighted,
        isSelected: selectedEdgeId === edge.id,
      };
    });
  }, [visibleEdges, activeFocusNodeIds, selectedEdgeId, listGroupLayout, coveredNodeEdgeKeys]);

  useEffect(() => {
    if (labelEditor) labelInputRef.current?.focus();
  }, [labelEditor]);

  useEffect(() => {
    if (edgeLabelEditor) edgeLabelInputRef.current?.focus();
  }, [edgeLabelEditor]);

  useEffect(() => {
    if (boxTitleEditor) {
      boxTitleInputRef.current?.focus();
      boxTitleInputRef.current?.select();
    }
  }, [boxTitleEditor]);

  useEffect(() => {
    if (labelEditor && !nodes.some((node) => node.id === labelEditor.nodeId)) {
      setLabelEditor(null);
    }
  }, [labelEditor, nodes]);

  useEffect(() => {
    if (edgeLabelEditor && !edges.some((edge) => edge.id === edgeLabelEditor.edgeId)) {
      setEdgeLabelEditor(null);
    }
  }, [edgeLabelEditor, edges]);

  useEffect(() => {
    if (boxTitleEditor && !groups.some((group) => group.id === boxTitleEditor.groupId)) {
      setBoxTitleEditor(null);
    }
  }, [boxTitleEditor, groups]);

  useEffect(() => {
    if (!shortcutNotice) return;
    const timer = window.setTimeout(clearShortcutNotice, 2400);
    return () => window.clearTimeout(timer);
  }, [clearShortcutNotice, shortcutNotice]);

  useEffect(() => {
    if (shortcutReturnPrompt?.targetNodeId) {
      setPendingFocusNodeId(shortcutReturnPrompt.targetNodeId);
    }
  }, [shortcutReturnPrompt?.targetNodeId]);

  useEffect(() => {
    if (!shortcutReturnPrompt) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissShortcutReturnPrompt();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissShortcutReturnPrompt, shortcutReturnPrompt]);

  const commitLabelEdit = () => {
    if (!labelEditor) return;
    const next = labelEditor.value.trim();
    const node = nodes.find((n) => n.id === labelEditor.nodeId);
    if (node && next && next !== node.label) {
      updateNode(labelEditor.nodeId, { label: next });
    }
    setLabelEditor(null);
  };

  const commitEdgeLabelEdit = () => {
    if (!edgeLabelEditor) return;
    const next = edgeLabelEditor.value.trim();
    const edge = edges.find((e) => e.id === edgeLabelEditor.edgeId);
    if (edge && next !== edgeLabelEditor.initialValue) {
      updateEdge(edgeLabelEditor.edgeId, { label: next || undefined });
    }
    setEdgeLabelEditor(null);
  };

  const commitBoxTitleEdit = () => {
    if (!boxTitleEditor) return;
    const next = boxTitleEditor.value.trim();
    const group = groups.find((item) => item.id === boxTitleEditor.groupId);
    if (group && next && next !== group.name) {
      updateGroup(boxTitleEditor.groupId, { name: next });
    }
    setBoxTitleEditor(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingEdgeConnect) cancelPendingEdge();
        else if (linkMode) cancelLinkMode();
        setLabelEditor(null);
        setEdgeLabelEditor(null);
        setBoxTitleEditor(null);
        setContextMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linkMode, cancelLinkMode, pendingEdgeConnect, cancelPendingEdge]);

  useEffect(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const storedTransform = readStoredGraphView(viewParentId);
    const savedTransform = storedTransform ?? d3.zoomIdentity;
    const shouldAutoFit = !storedTransform;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const defs = svg.append('defs');
    const glow = defs
      .append('filter')
      .attr('id', 'focus-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur');
    const merge = glow.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    for (const type of EDGE_TYPES) {
      if (!edgeTypeHasDirection(type)) continue;
      defs
        .append('marker')
        .attr('id', `edge-arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 9)
        .attr('refY', 0)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto')
        .attr('markerUnits', 'strokeWidth')
        .append('path')
        .attr('d', 'M 0 -4 L 10 0 L 0 4 z')
        .attr('fill', EDGE_TYPE_COLORS[type]);
    }

    const root = svg.append('g').attr('class', 'graph-root');
    svg.attr('data-perf', 'mind-graph-canvas');

    root
      .append('rect')
      .attr('class', 'graph-bg')
      .attr('x', -width * 3)
      .attr('y', -height * 3)
      .attr('width', width * 6)
      .attr('height', height * 6)
      .attr('fill', 'transparent')
      .style('cursor', 'default');

    let zoomFrame: number | null = null;
    let pendingZoomTransform: d3.ZoomTransform | null = null;
    let zoomStorageTimer: number | null = null;
    let lastZoomPercent = Math.round(savedTransform.k * 100);
    let isCanvasNavigating = false;
    let canvasNavigationEndTimer: number | null = null;
    let lastZoomSourceType: string | null = null;
    let wheelZoomFrame: number | null = null;
    let pendingWheelTransform: d3.ZoomTransform | null = null;

    const applyZoomTransform = (transform: d3.ZoomTransform) => {
      perfTime('graph:zoom-apply-transform', () => {
        root.attr('transform', transform.toString());
      });
    };

    const flushStoredGraphView = () => {
      if (!pendingZoomTransform) return;
      writeStoredGraphView(viewParentId, pendingZoomTransform);
    };

    const scheduleStoredGraphView = () => {
      if (zoomStorageTimer != null) {
        window.clearTimeout(zoomStorageTimer);
      }
      zoomStorageTimer = window.setTimeout(() => {
        zoomStorageTimer = null;
        perfTime('graph:zoom-save-view', flushStoredGraphView);
      }, GRAPH_VIEW_SAVE_DELAY_MS);
    };

    const scheduleZoomRender = (transform: d3.ZoomTransform) => {
      pendingZoomTransform = transform;
      zoomTransformRef.current = transform;
      setReactZoomTransform(transform);
      scheduleStoredGraphView();
      if (zoomFrame != null) return;
      zoomFrame = window.requestAnimationFrame(() => {
        zoomFrame = null;
        if (!pendingZoomTransform) return;
        applyZoomTransform(pendingZoomTransform);
        const nextZoomPercent = Math.round(pendingZoomTransform.k * 100);
        if (!isCanvasNavigating && nextZoomPercent !== lastZoomPercent) {
          lastZoomPercent = nextZoomPercent;
          setZoomLevel(pendingZoomTransform.k);
        }
      });
    };

    const cleanupZoomWork = () => {
      if (zoomFrame != null) {
        window.cancelAnimationFrame(zoomFrame);
        zoomFrame = null;
      }
      if (zoomStorageTimer != null) {
        window.clearTimeout(zoomStorageTimer);
        zoomStorageTimer = null;
      }
      if (canvasNavigationEndTimer != null) {
        window.clearTimeout(canvasNavigationEndTimer);
        canvasNavigationEndTimer = null;
      }
      if (wheelZoomFrame != null) {
        window.clearTimeout(wheelZoomFrame);
        wheelZoomFrame = null;
      }
      pendingWheelTransform = null;
      perfTime('graph:zoom-save-view', flushStoredGraphView);
    };

    const beginCanvasNavigation = () => {
      if (canvasNavigationEndTimer != null) {
        window.clearTimeout(canvasNavigationEndTimer);
        canvasNavigationEndTimer = null;
      }
      isCanvasNavigating = true;
      graphRef.current.simulation?.stop();
      if (!root.classed('is-canvas-panning')) {
        root.classed('is-canvas-panning', true);
      }
    };

    const endCanvasNavigation = (delayMs = 0) => {
      if (canvasNavigationEndTimer != null) {
        window.clearTimeout(canvasNavigationEndTimer);
        canvasNavigationEndTimer = null;
      }
      const finish = () => {
        canvasNavigationEndTimer = null;
        isCanvasNavigating = false;
        root.classed('is-canvas-panning', false);
        if (pendingZoomTransform) {
          lastZoomPercent = Math.round(pendingZoomTransform.k * 100);
          setZoomLevel(pendingZoomTransform.k);
          setReactZoomTransform(pendingZoomTransform);
        }
      };
      if (delayMs > 0) {
        canvasNavigationEndTimer = window.setTimeout(finish, delayMs);
        return;
      }
      finish();
    };

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 2.5])
      .filter((event) => {
        if (event.type === 'dblclick') return false;
        if (event.type === 'wheel') return false;
        if (event.type === 'mousedown' && event.altKey) return false;
        if (event.type === 'mousedown' && event.shiftKey) return false;
        if (event.type === 'mousedown' && event.button === 0 && isBackgroundTarget(event.target)) return false;
        return true;
      })
      .on('start', (event) => {
        const sourceEvent = event.sourceEvent as Event | null;
        lastZoomSourceType = sourceEvent?.type ?? lastZoomSourceType;
        isCanvasNavigating =
          sourceEvent?.type === 'wheel' ||
          (sourceEvent?.type === 'mousedown' && isBackgroundTarget(sourceEvent.target));
        if (isCanvasNavigating) {
          beginCanvasNavigation();
        }
      })
      .on('zoom', (event) => {
        const sourceEvent = event.sourceEvent as Event | null;
        lastZoomSourceType = sourceEvent?.type ?? lastZoomSourceType;
        perfCount('graph:zoom:event');
        scheduleZoomRender(event.transform);
      })
      .on('end', (event) => {
        const sourceEvent = event.sourceEvent as Event | null;
        lastZoomSourceType = sourceEvent?.type ?? lastZoomSourceType;
        if (isCanvasNavigating) {
          endCanvasNavigation(lastZoomSourceType === 'wheel' ? 220 : 0);
        }
        const transform = event.transform as d3.ZoomTransform;
        pendingZoomTransform = transform;
        zoomTransformRef.current = transform;
        setReactZoomTransform(transform);
        if (zoomFrame != null) {
          window.cancelAnimationFrame(zoomFrame);
          zoomFrame = null;
        }
        applyZoomTransform(transform);
        if (zoomStorageTimer != null) {
          window.clearTimeout(zoomStorageTimer);
          zoomStorageTimer = null;
        }
        perfTime('graph:zoom-save-view', flushStoredGraphView);
      });

    svg.call(zoom);
    zoomRef.current = zoom;
    svg.call(zoom.transform, savedTransform);
    applyZoomTransform(savedTransform);
    setReactZoomTransform(savedTransform);

    svg.on('wheel.canvasZoom', (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      beginCanvasNavigation();
      lastZoomSourceType = 'wheel';
      const current = pendingWheelTransform ?? d3.zoomTransform(svgEl);
      const nextK = clampZoomScale(current.k * wheelScaleFactor(event));
      if (nextK === current.k) return;
      const [px, py] = d3.pointer(event, svgEl);
      const ratio = nextK / current.k;
      pendingWheelTransform = d3.zoomIdentity
        .translate(px - (px - current.x) * ratio, py - (py - current.y) * ratio)
        .scale(nextK);
      if (wheelZoomFrame == null) {
        wheelZoomFrame = window.setTimeout(() => {
          wheelZoomFrame = null;
          if (!pendingWheelTransform) return;
          const nextTransform = pendingWheelTransform;
          pendingWheelTransform = null;
          (svgEl as SVGSVGElement & { __zoom?: d3.ZoomTransform }).__zoom = nextTransform;
          pendingZoomTransform = nextTransform;
          zoomTransformRef.current = nextTransform;
          perfCount('graph:zoom:event');
          applyZoomTransform(nextTransform);
          const nextZoomPercent = Math.round(nextTransform.k * 100);
          if (!isCanvasNavigating && nextZoomPercent !== lastZoomPercent) {
            lastZoomPercent = nextZoomPercent;
            setZoomLevel(nextTransform.k);
          }
          scheduleStoredGraphView();
        }, WHEEL_ZOOM_APPLY_INTERVAL_MS);
      }
      endCanvasNavigation(220);
    }, { passive: false });

    let wirePreview!: d3.Selection<SVGLineElement, unknown, null, undefined>;
    let edgeReconnectPreview!: d3.Selection<SVGLineElement, unknown, null, undefined>;
    let snapGuideX!: d3.Selection<SVGLineElement, unknown, null, undefined>;
    let snapGuideY!: d3.Selection<SVGLineElement, unknown, null, undefined>;

    let wireSourceId: string | null = null;
    let wireSourceKind: EdgeEndpointKind = 'node';
    let wireSourceAnchor: { lx: number; ly: number } | null = null;
    let lastPointer = { mx: 0, my: 0 };
    let boxSelect: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      mode: BoxSelectMode;
    } | null = null;
    let altPan: { startX: number; startY: number; tx: number; ty: number } | null = null;
    let groupDrag: GroupDragState | null = null;
    let listDragPreview: ListDragPreviewState | null = null;
    let suppressBackgroundClick = false;

    const setWiringClass = (active: boolean) => {
      containerRef.current?.classList.toggle('is-wiring', active);
    };

    const isBoxSelectTarget = (target: EventTarget | null) => {
      const el = target as Element;
      return !el.closest?.('.node') && !el.closest?.('.port-anchor') && !el.closest?.('.box-port');
    };

    const isBackgroundTarget = (target: EventTarget | null) => {
      const el = target as Element;
      return (
        el === svgEl ||
        el.tagName === 'svg' ||
        el.classList?.contains('graph-root') ||
        el.classList?.contains('graph-bg')
      );
    };

    const findBoxPortHover = (
      mx: number,
      my: number,
      excludeId?: string | null,
    ): { groupId: string; lx: number; ly: number } | null => {
      for (const d of graphRef.current.networkBoxSelection?.data() ?? []) {
        if (d.id === excludeId) continue;
        const centerY = d.y + NETWORK_BOX_TITLE_HEIGHT / 2;
        const ports = [
          { lx: 0, ly: centerY - d.y, x: d.x, y: centerY },
          { lx: d.width, ly: centerY - d.y, x: d.x + d.width, y: centerY },
        ];
        for (const port of ports) {
          if (
            Math.abs(mx - port.x) <= BOX_PORT_HIT_WIDTH &&
            Math.abs(my - port.y) <= BOX_PORT_HIT_HEIGHT / 2
          ) {
            return { groupId: d.id, lx: port.lx, ly: port.ly };
          }
        }
      }
      return null;
    };

    const updatePortAnchors = (mx: number, my: number) => {
      const nodeSel = graphRef.current.nodeSelection;
      const simNodes = graphRef.current.simNodes;
      if (!nodeSel) return;

      if (wireSourceId) {
        const targetHit = findEdgeHover(
          mx,
          my,
          simNodes,
          PORT_EDGE_INNER,
          PORT_EDGE_OUTER,
          wireSourceKind === 'node' ? wireSourceId : null,
        );
        nodeSel.selectAll<SVGCircleElement, SimNode>('.port-anchor').each(function (d) {
          const port = d3.select<SVGCircleElement, SimNode>(this);
          if (d.id === wireSourceId && wireSourceAnchor) {
            port
              .attr('cx', wireSourceAnchor.lx)
              .attr('cy', wireSourceAnchor.ly)
              .attr('opacity', 1)
              .style('pointer-events', 'all');
          } else if (targetHit && d.id === targetHit.nodeId) {
            port
              .attr('cx', targetHit.lx)
              .attr('cy', targetHit.ly)
              .attr('opacity', 1)
              .style('pointer-events', 'all');
          } else {
            port.attr('opacity', 0).style('pointer-events', 'none');
          }
        });
        return;
      }

      const hover = findEdgeHover(mx, my, simNodes, PORT_EDGE_INNER, PORT_EDGE_OUTER);
      nodeSel.selectAll<SVGCircleElement, SimNode>('.port-anchor').each(function (d) {
        const port = d3.select<SVGCircleElement, SimNode>(this);
        if (hover && d.id === hover.nodeId) {
          port
            .attr('cx', hover.lx)
            .attr('cy', hover.ly)
            .attr('opacity', 1)
            .style('pointer-events', 'all');
        } else {
          port.attr('opacity', 0).style('pointer-events', 'none');
        }
      });
    };

    const openMenu = (clientX: number, clientY: number, items: ContextMenuItem[]) => {
      setContextMenu({ x: clientX, y: clientY, items });
    };

    const openLabelEditor = (event: MouseEvent, node: SimNode) => {
      if (storeRef.current.linkMode) return;
      const bounds = container.getBoundingClientRect();
      storeRef.current.setSelectedNode(node.id);
      setContextMenu(null);
      setEdgeLabelEditor(null);
      setBoxTitleEditor(null);
      setLabelEditor({
        nodeId: node.id,
        value: node.label,
        left: Math.max(12, event.clientX - bounds.left - 8),
        top: Math.max(12, event.clientY - bounds.top),
        width: Math.min(240, Math.max(150, node.label.length * 14 + 48)),
      });
    };

    const openEdgeLabelEditor = (event: MouseEvent, link: SimLink) => {
      if (storeRef.current.linkMode) return;
      const bounds = container.getBoundingClientRect();
      const edgeId = editableSimLinkId(link);
      storeRef.current.setSelectedEdge(edgeId);
      setContextMenu(null);
      setLabelEditor(null);
      setBoxTitleEditor(null);
      const value = link.label?.trim() || linkMidlabel(link);
      setEdgeLabelEditor({
        edgeId,
        value,
        initialValue: value,
        left: Math.max(12, event.clientX - bounds.left - Math.min(180, Math.max(110, value.length * 8 + 56)) / 2),
        top: Math.max(12, event.clientY - bounds.top),
        width: Math.min(280, Math.max(130, value.length * 10 + 56)),
      });
    };

    const endpointPoint = (
      id: string,
      kind: EdgeEndpointKind,
      anchor: { lx: number; ly: number } | null,
    ) => {
      if (kind === 'group') {
        let point = { x: 0, y: 0 };
        graphRef.current.networkBoxSelection?.each(function (d) {
          if (d.id === id) {
            point = {
              x: d.x + (anchor?.lx ?? d.width / 2),
              y: d.y + (anchor?.ly ?? d.height / 2),
            };
          }
        });
        return point;
      }
      const node = graphRef.current.simNodes.find((n) => n.id === id);
      return {
        x: (node?.x ?? 0) + (anchor?.lx ?? 0),
        y: (node?.y ?? 0) + (anchor?.ly ?? 0),
      };
    };

    const beginWireFromEndpoint = (
      event: MouseEvent,
      id: string,
      kind: EdgeEndpointKind,
      anchor: { lx: number; ly: number },
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setWiringClass(true);
      wireSourceId = id;
      wireSourceKind = kind;
      wireSourceAnchor = anchor;
      const { x: x1, y: y1 } = endpointPoint(id, kind, anchor);
      wirePreview
        .style('display', null)
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x1)
        .attr('y2', y1);
    };

    const beginWireFromNodePort = (
      event: MouseEvent,
      node: SimNode,
      anchor: { lx: number; ly: number },
    ) => {
      beginWireFromEndpoint(event, node.id, 'node', anchor);
    };

    const updateBoxSelectUi = () => {
      if (!boxSelect) {
        setBoxSelectUiRef.current(null);
        return;
      }
      const t = d3.zoomTransform(svgEl);
      const gxMin = Math.min(boxSelect.x0, boxSelect.x1);
      const gyMin = Math.min(boxSelect.y0, boxSelect.y1);
      const gxMax = Math.max(boxSelect.x0, boxSelect.x1);
      const gyMax = Math.max(boxSelect.y0, boxSelect.y1);
      const [x1, y1] = t.apply([gxMin, gyMin]);
      const [x2, y2] = t.apply([gxMax, gyMax]);
      setBoxSelectUiRef.current({
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      });
    };

    const pickNodesInBox = () => {
      if (!boxSelect) return [] as string[];
      const xMin = Math.min(boxSelect.x0, boxSelect.x1);
      const xMax = Math.max(boxSelect.x0, boxSelect.x1);
      const yMin = Math.min(boxSelect.y0, boxSelect.y1);
      const yMax = Math.max(boxSelect.y0, boxSelect.y1);
      return graphRef.current.simNodes
        .filter((n) => {
          const x = n.x ?? 0;
          const y = n.y ?? 0;
          return x >= xMin && x <= xMax && y >= yMin && y <= yMax;
        })
        .map((n) => n.id);
    };

    const pickGroupsInBox = () => {
      if (!boxSelect) return [] as string[];
      const xMin = Math.min(boxSelect.x0, boxSelect.x1);
      const xMax = Math.max(boxSelect.x0, boxSelect.x1);
      const yMin = Math.min(boxSelect.y0, boxSelect.y1);
      const yMax = Math.max(boxSelect.y0, boxSelect.y1);
      const ids: string[] = [];
      graphRef.current.networkBoxSelection?.each((group) => {
        const left = group.x;
        const right = group.x + group.width;
        const top = group.y;
        const bottom = group.y + group.height;
        const intersects = right >= xMin && left <= xMax && bottom >= yMin && top <= yMax;
        if (intersects) ids.push(group.id);
      });
      return ids;
    };

    const applyBoxSelectionVisual = (ids: string[]) => {
      const boxSel = graphRef.current.networkBoxSelection;
      if (!boxSel) return;
      const idSet = new Set(ids);
      boxSel.each(function (d) {
        d.isSelected = idSet.has(d.id);
        applyNetworkBoxVisual(d3.select<SVGGElement, NetworkBoxDatum>(this));
      });
    };

    const applySelectionVisual = (nodeIds: string[], groupIds = storeRef.current.selectedGroupIds) => {
      const nodeSel = graphRef.current.nodeSelection;
      if (nodeSel) {
        const idSet = new Set(nodeIds);
        for (const n of graphRef.current.simNodes) {
          n.isSelected = idSet.has(n.id);
        }
        applyNodeVisual(nodeSel);
      }
      applyBoxSelectionVisual(groupIds);
    };

    const updateBoxSelectPreview = () => {
      updateBoxSelectUi();
      const pickedNodeIds = pickNodesInBox();
      const pickedGroupIds = pickGroupsInBox();
      if (boxSelect?.mode === 'add') {
        applySelectionVisual(
          [...new Set([...storeRef.current.selectedNodeIds, ...pickedNodeIds])],
          [...new Set([...storeRef.current.selectedGroupIds, ...pickedGroupIds])],
        );
        return;
      }
      if (boxSelect?.mode === 'remove') {
        const pickedNodeSet = new Set(pickedNodeIds);
        const pickedGroupSet = new Set(pickedGroupIds);
        applySelectionVisual(
          storeRef.current.selectedNodeIds.filter((id) => !pickedNodeSet.has(id)),
          storeRef.current.selectedGroupIds.filter((id) => !pickedGroupSet.has(id)),
        );
        return;
      }
      applySelectionVisual(pickedNodeIds, pickedGroupIds);
    };

    const getSelectedSimNodes = () => {
      const selected = new Set(storeRef.current.selectedNodeIds);
      return graphRef.current.simNodes.filter((node) => selected.has(node.id));
    };

    const focusSelectedNodes = () => {
      const selected = getSelectedSimNodes();
      if (selected.length === 0) return false;

      const extents = selected.map((node) => {
        if (node.viewMode === 'list') {
          const halfWidth = (node.listCardWidth ?? 220) / 2 + 24;
          const halfHeight = (node.listCardHeight ?? 34) / 2 + 24;
          return {
            minX: (node.x ?? 0) - halfWidth,
            maxX: (node.x ?? 0) + halfWidth,
            minY: (node.y ?? 0) - halfHeight,
            maxY: (node.y ?? 0) + halfHeight,
          };
        }
        const radius = Math.max(48, node.radius + 36);
        return {
          minX: (node.x ?? 0) - radius,
          maxX: (node.x ?? 0) + radius,
          minY: (node.y ?? 0) - radius,
          maxY: (node.y ?? 0) + radius,
        };
      });

      const minX = Math.min(...extents.map((item) => item.minX));
      const maxX = Math.max(...extents.map((item) => item.maxX));
      const minY = Math.min(...extents.map((item) => item.minY));
      const maxY = Math.max(...extents.map((item) => item.maxY));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const boundsWidth = Math.max(1, maxX - minX);
      const boundsHeight = Math.max(1, maxY - minY);
      const padding = 96;
      const fitScale = Math.min(
        (width - padding) / boundsWidth,
        (height - padding) / boundsHeight,
      );
      const currentScale = d3.zoomTransform(svgEl).k;
      const scale = selected.length === 1
        ? Math.max(1.15, Math.min(1.8, currentScale))
        : Math.max(0.35, Math.min(1.8, fitScale));
      const transform = d3.zoomIdentity
        .translate(width / 2 - centerX * scale, height / 2 - centerY * scale)
        .scale(scale);

      svg.transition().duration(260).call(zoom.transform, transform);
      return true;
    };

    const beginGroupDrag = (node: SimNode) => {
      const nodeIds = storeRef.current.selectedNodeIds;
      const groupIds = storeRef.current.selectedGroupIds;
      if (
        !nodeIds.includes(node.id) ||
        nodeIds.length + groupIds.length < 2
      ) {
        groupDrag = null;
        return;
      }
      groupDrag = {
        anchorStartX: node.x ?? 0,
        anchorStartY: node.y ?? 0,
        originals: new Map(
          graphRef.current.simNodes
            .filter((n) => nodeIds.includes(n.id))
            .map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]),
        ),
        boxOriginals: new Map(
          (graphRef.current.networkBoxSelection?.data() ?? [])
            .filter((group) => groupIds.includes(group.id))
            .map((group) => [group.id, { x: group.x, y: group.y }]),
        ),
      };
    };

    const snapNodePosition = (
      x: number,
      y: number,
      excludeIds: Set<string>,
    ): SnapPosition => {
      let snappedX = x;
      let snappedY = y;
      let snapX = false;
      let snapY = false;
      let bestDx = NODE_SNAP_THRESHOLD;
      let bestDy = NODE_SNAP_THRESHOLD;

      for (const node of graphRef.current.simNodes) {
        if (excludeIds.has(node.id) || node.x == null || node.y == null) continue;
        const dx = Math.abs(node.x - x);
        const dy = Math.abs(node.y - y);
        if (dx <= bestDx) {
          bestDx = dx;
          snappedX = node.x;
          snapX = true;
        }
        if (dy <= bestDy) {
          bestDy = dy;
          snappedY = node.y;
          snapY = true;
        }
      }

      return { x: snappedX, y: snappedY, snapX, snapY };
    };

    const dragPositionWithSnap = (node: SimNode, x: number, y: number) => {
      const excludeIds = groupDrag
        ? new Set(groupDrag.originals.keys())
        : new Set([node.id]);
      return snapNodePosition(x, y, excludeIds);
    };

    const hideSnapGuides = () => {
      snapGuideX?.style('display', 'none');
      snapGuideY?.style('display', 'none');
    };

    const updateSnapGuides = (snap: SnapPosition) => {
      const transform = d3.zoomTransform(svgEl);
      const [x0, y0] = transform.invert([0, 0]);
      const [x1, y1] = transform.invert([width, height]);

      snapGuideX
        ?.style('display', snap.snapX ? '' : 'none')
        .attr('x1', snap.x)
        .attr('y1', y0)
        .attr('x2', snap.x)
        .attr('y2', y1);

      snapGuideY
        ?.style('display', snap.snapY ? '' : 'none')
        .attr('x1', x0)
        .attr('y1', snap.y)
        .attr('x2', x1)
        .attr('y2', snap.y);
    };

    const applyGroupDrag = (x: number, y: number) => {
      if (!groupDrag) return false;
      const dx = x - groupDrag.anchorStartX;
      const dy = y - groupDrag.anchorStartY;
      for (const node of graphRef.current.simNodes) {
        const orig = groupDrag.originals.get(node.id);
        if (!orig) continue;
        const nextX = orig.x + dx;
        const nextY = orig.y + dy;
        node.x = nextX;
        node.y = nextY;
        node.fx = nextX;
        node.fy = nextY;
      }
      graphRef.current.networkBoxSelection?.each(function (group) {
        const orig = groupDrag?.boxOriginals.get(group.id);
        if (!orig) return;
        group.x = orig.x + dx;
        group.y = orig.y + dy;
        d3.select(this).attr('transform', networkBoxTransform(group, null));
      });
      return true;
    };

    const commitGroupDrag = () => {
      if (!groupDrag) return false;
      for (const id of groupDrag.originals.keys()) {
        const node = graphRef.current.simNodes.find((n) => n.id === id);
        if (node?.x != null && node?.y != null) {
          storeRef.current.updateNodePosition(node.id, node.x, node.y);
          syncSimNodeMembership(node);
        }
      }
      for (const id of groupDrag.boxOriginals.keys()) {
        const group = graphRef.current.networkBoxSelection?.data().find((item) => item.id === id);
        if (group) {
          storeRef.current.updateGroup(id, { x: group.x, y: group.y });
        }
      }
      groupDrag = null;
      return true;
    };

    const refreshLinkGeometry = () => {
      const links = graphRef.current.linkSelection?.data() ?? [];
      resolveSimLinks(links, graphRef.current.linkEndpointNodes);
      graphRef.current.linkHitSelection
        ?.attr('d', (d) => linkPath(d));
      graphRef.current.linkSelection
        ?.attr('d', (d) => linkPath(d));
      applyRuntimeLinkVisibility();
      if (graphRef.current.linkSymbolSelection) {
        updateLinkMidPositions(graphRef.current.linkSymbolSelection);
      }
      if (graphRef.current.edgeHandleSelection) {
        updateEdgeHandlePositions(graphRef.current.edgeHandleSelection);
      }
    };
    graphRef.current.refreshLinkGeometry = refreshLinkGeometry;

    const syncSimNodeMembership = (node: SimNode) => {
      if (node.x == null || node.y == null) return;
      storeRef.current.syncNodeGroupMembership(node.id, node.x, node.y);
    };

    const endpointId = (end: SimNode | string | number) =>
      typeof end === 'string' ? end : typeof end === 'number' ? String(end) : end.id;

    const pointInsideRuntimeBox = (point: { x: number; y: number }, box: SimNode) => {
      const width = box.boxWidth ?? 320;
      const height = box.boxHeight ?? 200;
      const left = (box.x ?? 0) - width / 2;
      const top = (box.y ?? 0) - height / 2;
      return (
        point.x >= left &&
        point.x <= left + width &&
        point.y >= top + NETWORK_BOX_TITLE_HEIGHT &&
        point.y <= top + height
      );
    };

    const isLinkGeometryHidden = (link: SimLink) => {
      if (
        !link.derivedFromGroupId &&
        link.sourceKind !== 'group' &&
        link.targetKind !== 'group'
      ) {
        const sourceId = endpointId(link.source);
        const targetId = endpointId(link.target);
        if (coveredNodeEdgeKeys.has(nodeEdgeDisplayKey(sourceId, targetId, link.edgeType))) {
          return true;
        }
      }
      if (!link.derivedFromGroupId) return false;
      const group = graphRef.current.runtimeGroupById.get(link.derivedFromGroupId);
      const boxNode = graphRef.current.linkEndpointNodeById.get(link.derivedFromGroupId);
      if (!group || !boxNode) return Boolean(link.hidden);

      const sourceId = endpointId(link.source);
      const targetId = endpointId(link.target);
      const sourcePoint = linkEndpoint(link.source);
      const targetPoint = linkEndpoint(link.target);
      const memberIds = graphRef.current.runtimeGroupMemberIds.get(group.id);
      if (memberIds?.has(sourceId) && pointInsideRuntimeBox(sourcePoint, boxNode)) return true;
      if (memberIds?.has(targetId) && pointInsideRuntimeBox(targetPoint, boxNode)) return true;
      return false;
    };

    const applyRuntimeLinkVisibility = () => {
      graphRef.current.linkHitSelection
        ?.style('visibility', (d) => (isLinkGeometryHidden(d) ? 'hidden' : null))
        .style('pointer-events', (d) => (isLinkGeometryHidden(d) ? 'none' : 'stroke'));
      graphRef.current.linkSelection
        ?.style('visibility', (d) => (isLinkGeometryHidden(d) ? 'hidden' : null));
      graphRef.current.linkSymbolSelection
        ?.style('visibility', (d) => (isLinkGeometryHidden(d) ? 'hidden' : null));
    };

    const updateEdgeHandlePositions = (
      selection: d3.Selection<SVGGElement, EdgeHandleDatum, SVGGElement, unknown>,
    ) => {
      selection.attr('transform', (d) => {
        const endpoints = linkVisibleEndpoints(d.link);
        const point = d.role === 'source' ? endpoints.source : endpoints.target;
        return `translate(${point.x},${point.y})`;
      });
    };

    let dragPreviewFrame: number | null = null;
    let dragPreviewNeedsVisual = false;
    const scheduleDragPreviewRender = (includeVisual = false) => {
      dragPreviewNeedsVisual ||= includeVisual;
      if (dragPreviewFrame != null) return;
      dragPreviewFrame = window.requestAnimationFrame(() => {
        dragPreviewFrame = null;
        const shouldApplyVisual = dragPreviewNeedsVisual;
        dragPreviewNeedsVisual = false;
        if (shouldApplyVisual && graphRef.current.nodeSelection) {
          const visualNodeIds = new Set(listDragPreview?.nodeIds ?? []);
          const selection = visualNodeIds.size > 0
            ? graphRef.current.nodeSelection.filter((d) => visualNodeIds.has(d.id))
            : graphRef.current.nodeSelection;
          applyNodeVisual(selection);
        }
        graphRef.current.nodeSelection
          ?.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });
    };

    const cancelDragPreviewRender = () => {
      if (dragPreviewFrame == null) return;
      window.cancelAnimationFrame(dragPreviewFrame);
      dragPreviewFrame = null;
      dragPreviewNeedsVisual = false;
    };

    const findGroupAtPoint = (x: number, y: number) =>
      getGroupsInGraph(groups, viewParentId).find((group) => pointInsideNetworkBox(x, y, group));

    const getActiveListGroupAtPoint = (x: number, y: number) =>
      getGroupsInGraph(groups, viewParentId).find((group) => {
        if (!pointInsideNetworkBox(x, y, group)) return false;
        const activeView = group.views?.find((view) => view.id === group.active_view_id);
        return activeView?.type === 'list';
      });

    const orderedGroupNodeIds = (
      group: NetworkBoxDatum | typeof groups[number],
      excludeIds: Set<string> = new Set(),
    ) => {
      const activeView = group.views?.find((view) => view.id === group.active_view_id);
      const orderIndex = new Map((activeView?.node_order ?? []).map((id, index) => [id, index]));
      return group.node_ids
        .filter((id) => !excludeIds.has(id))
        .map((id) => graphRef.current.simNodeById.get(id))
        .filter((node): node is SimNode => Boolean(node))
        .sort((a, b) => {
          const aOrder = orderIndex.get(a.id);
          const bOrder = orderIndex.get(b.id);
          if (aOrder != null && bOrder != null) return aOrder - bOrder;
          if (aOrder != null) return -1;
          if (bOrder != null) return 1;
          return (a.y ?? 0) - (b.y ?? 0);
        })
        .map((node) => node.id);
    };

    const listInsertIndex = (group: NetworkBoxDatum | typeof groups[number], y: number, count: number) => {
      const top = (group.y ?? 0) + NETWORK_BOX_TITLE_HEIGHT + BOX_LIST_TOP_PADDING;
      return Math.max(0, Math.min(count, Math.floor((y - top + BOX_LIST_ROW_HEIGHT / 2) / BOX_LIST_ROW_HEIGHT)));
    };

    const positionListOrder = (
      group: NetworkBoxDatum | typeof groups[number],
      order: string[],
      draggingIds: Set<string> = new Set(),
    ) => {
      const cardWidth = Math.max(160, Math.min(BOX_LIST_MAX_WIDTH, (group.width ?? 320) - 48));
      const x = (group.x ?? 0) + (group.width ?? 320) / 2;
      order.forEach((nodeId, index) => {
        const sim = graphRef.current.simNodeById.get(nodeId);
        if (!sim) return;
        sim.viewMode = 'list';
        sim.listGroupId = group.id;
        sim.listCardWidth = cardWidth;
        sim.listCardHeight = BOX_LIST_CARD_HEIGHT;
        sim.x = x;
        sim.y = (group.y ?? 0) + NETWORK_BOX_TITLE_HEIGHT + BOX_LIST_TOP_PADDING + index * BOX_LIST_ROW_HEIGHT;
        sim.fx = sim.x;
        sim.fy = sim.y;
        if (draggingIds.has(nodeId)) sim.isSelected = true;
      });
    };

    const getListDragNodeIds = (node: SimNode) => {
      if (!storeRef.current.selectedNodeIds.includes(node.id)) return [node.id];
      const selected = new Set(storeRef.current.selectedNodeIds);
      const ids = graphRef.current.simNodes
        .filter((candidate) => selected.has(candidate.id))
        .sort((a, b) => (a.y ?? 0) - (b.y ?? 0))
        .map((candidate) => candidate.id);
      return ids.length > 0 ? ids : [node.id];
    };

    const restoreListDragPreview = () => {
      if (!listDragPreview) return;
      cancelDragPreviewRender();
      for (const [nodeId, original] of listDragPreview.originals) {
        const dragged = graphRef.current.simNodeById.get(nodeId);
        if (dragged) Object.assign(dragged, original);
      }
      for (const group of getGroupsInGraph(groups, viewParentId)) {
        const activeView = group.views?.find((view) => view.id === group.active_view_id);
        if (activeView?.type !== 'list') continue;
        positionListOrder(group, orderedGroupNodeIds(group));
      }
      listDragPreview = null;
      scheduleDragPreviewRender(true);
    };

    const applyListDragPreview = (node: SimNode, pointerX: number, pointerY: number) => {
      if (!listDragPreview) {
        const nodeIds = getListDragNodeIds(node);
        listDragPreview = {
          primaryNodeId: node.id,
          nodeIds,
          targetGroupId: null,
          insertAt: null,
          order: [],
          originals: new Map(
            nodeIds
              .map((nodeId) => graphRef.current.simNodeById.get(nodeId))
              .filter((candidate): candidate is SimNode => Boolean(candidate))
              .map((candidate) => [
                candidate.id,
                {
                  viewMode: candidate.viewMode,
                  listGroupId: candidate.listGroupId,
                  listCardWidth: candidate.listCardWidth,
                  listCardHeight: candidate.listCardHeight,
                  x: candidate.x,
                  y: candidate.y,
                  fx: candidate.fx,
                  fy: candidate.fy,
                },
              ]),
          ),
        };
      }

      const previewNodeIds = listDragPreview.nodeIds;
      const previewNodeIdSet = new Set(previewNodeIds);
      const previewNodes = previewNodeIds
        .map((nodeId) => graphRef.current.simNodeById.get(nodeId))
        .filter((candidate): candidate is SimNode => Boolean(candidate));
      const targetGroup = getActiveListGroupAtPoint(pointerX, pointerY);
      if (!targetGroup) {
        const wasAlreadyOutside =
          listDragPreview.targetGroupId === null &&
          listDragPreview.insertAt === null &&
          listDragPreview.order.length === 0;
        if (!wasAlreadyOutside) {
          for (const group of getGroupsInGraph(groups, viewParentId)) {
            const activeView = group.views?.find((view) => view.id === group.active_view_id);
            if (activeView?.type === 'list') {
              positionListOrder(group, orderedGroupNodeIds(group, previewNodeIdSet));
            }
          }
        }
        if (groupDrag && previewNodeIds.length > 1) {
          applyGroupDrag(pointerX, pointerY);
        } else {
          node.viewMode = undefined;
          node.listGroupId = undefined;
          node.listCardWidth = undefined;
          node.listCardHeight = undefined;
          node.x = pointerX;
          node.y = pointerY;
          node.fx = pointerX;
          node.fy = pointerY;
        }
        for (const previewNode of previewNodes) {
          previewNode.viewMode = undefined;
          previewNode.listGroupId = undefined;
          previewNode.listCardWidth = undefined;
          previewNode.listCardHeight = undefined;
        }
        listDragPreview.targetGroupId = null;
        listDragPreview.insertAt = null;
        listDragPreview.order = [];
        scheduleDragPreviewRender(!wasAlreadyOutside);
        return;
      }

      const baseOrder = orderedGroupNodeIds(targetGroup, previewNodeIdSet);
      const insertAt = listInsertIndex(targetGroup, pointerY, baseOrder.length);
      const samePreviewSlot =
        listDragPreview.targetGroupId === targetGroup.id &&
        listDragPreview.insertAt === insertAt &&
        listDragPreview.order.length > 0;
      if (samePreviewSlot) {
        scheduleDragPreviewRender();
        return;
      }
      const nextOrder = [...baseOrder];
      nextOrder.splice(insertAt, 0, ...previewNodeIds);
      const previousTargetGroupId = listDragPreview.targetGroupId;
      if (previousTargetGroupId && previousTargetGroupId !== targetGroup.id) {
        const previousGroup = getGroupsInGraph(groups, viewParentId)
          .find((group) => group.id === previousTargetGroupId);
        if (previousGroup) positionListOrder(previousGroup, orderedGroupNodeIds(previousGroup, previewNodeIdSet));
      }
      listDragPreview.targetGroupId = targetGroup.id;
      listDragPreview.insertAt = insertAt;
      listDragPreview.order = nextOrder;
      positionListOrder(targetGroup, nextOrder, previewNodeIdSet);

      const sourceGroupIds = new Set(
        [...listDragPreview.originals.values()]
          .map((original) => original.listGroupId)
          .filter((groupId): groupId is string => Boolean(groupId) && groupId !== targetGroup.id),
      );
      for (const sourceGroupId of sourceGroupIds) {
        const sourceGroup = getGroupsInGraph(groups, viewParentId)
          .find((group) => group.id === sourceGroupId);
        if (sourceGroup) positionListOrder(sourceGroup, orderedGroupNodeIds(sourceGroup, previewNodeIdSet));
      }

      scheduleDragPreviewRender(true);
    };

    const commitListDragPreview = (node: SimNode) => {
      if (!listDragPreview || listDragPreview.primaryNodeId !== node.id) return false;
      cancelDragPreviewRender();
      const preview = listDragPreview;
      listDragPreview = null;
      const nodePositions = preview.nodeIds
        .map((nodeId) => {
          const previewNode = graphRef.current.simNodeById.get(nodeId);
          if (previewNode?.x == null || previewNode.y == null) return null;
          return { id: nodeId, x: previewNode.x, y: previewNode.y };
        })
        .filter((position): position is { id: string; x: number; y: number } => Boolean(position));
      const commitAfterPaint = (input: Parameters<typeof storeRef.current.commitListDrag>[0]) => {
        const run = () => storeRef.current.commitListDrag(input);
        const idle = (window as Window & {
          requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
        }).requestIdleCallback;
        if (idle) {
          idle(run, { timeout: 800 });
          return;
        }
        globalThis.setTimeout(run, 80);
      };
      if (preview.targetGroupId) {
        commitAfterPaint({
          nodePositions,
          removeFromGroups: preview.nodeIds
            .map((nodeId) => {
              const original = preview.originals.get(nodeId);
              return original?.listGroupId && original.listGroupId !== preview.targetGroupId
                ? { groupId: original.listGroupId, nodeId }
                : null;
            })
            .filter((item): item is { groupId: string; nodeId: string } => Boolean(item)),
          targetGroupId: preview.targetGroupId,
          targetOrder: preview.order,
        });
        groupDrag = null;
        return true;
      }
      const movedOutNodeIds = preview.nodeIds.filter((nodeId) => preview.originals.get(nodeId)?.listGroupId);
      if (movedOutNodeIds.length > 0) {
        commitAfterPaint({
          nodePositions,
          removeFromGroups: movedOutNodeIds
            .map((nodeId) => {
              const original = preview.originals.get(nodeId);
              return original?.listGroupId ? { groupId: original.listGroupId, nodeId } : null;
            })
            .filter((item): item is { groupId: string; nodeId: string } => Boolean(item)),
        });
        groupDrag = null;
        return true;
      }
      groupDrag = null;
      return false;
    };

    const dragPointerPosition = (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>) => {
      const rootNode = graphRef.current.root?.node();
      const sourceEvent = event.sourceEvent as MouseEvent | TouchEvent | null;
      if (!rootNode || !sourceEvent) return { x: event.x, y: event.y };
      const [x, y] = d3.pointer(sourceEvent, rootNode);
      return { x, y };
    };

    const shouldUseListDragPreview = (node: SimNode, x: number, y: number) =>
      node.viewMode === 'list' ||
      listDragPreview?.primaryNodeId === node.id ||
      Boolean(getActiveListGroupAtPoint(x, y));

    const commitListNodeDrag = (node: SimNode) => {
      if (node.viewMode !== 'list' || !node.listGroupId || node.x == null || node.y == null) {
        return false;
      }
      const sourceGroup = getGroupsInGraph(groups, viewParentId).find((group) => group.id === node.listGroupId);
      if (!sourceGroup) return false;
      const targetGroup = findGroupAtPoint(node.x, node.y);
      if (targetGroup?.id === sourceGroup.id) {
        const nextOrder = sourceGroup.node_ids
          .map((id) => graphRef.current.simNodeById.get(id))
          .filter((candidate): candidate is SimNode => Boolean(candidate))
          .sort((a, b) => (a.y ?? 0) - (b.y ?? 0))
          .map((candidate) => candidate.id);
        storeRef.current.updateGroupViewNodeOrder(sourceGroup.id, NODE_INTERFACE_LIST_VIEW_ID, nextOrder);
        return true;
      }
      storeRef.current.updateNodePosition(node.id, node.x, node.y);
      storeRef.current.removeNodeFromGroup(sourceGroup.id, node.id);
      storeRef.current.syncNodeGroupMembership(node.id, node.x, node.y);
      return true;
    };

    const alignSelectedAtDefaultSpacing = () => {
      const selected = getSelectedSimNodes();
      if (selected.length < 2) return false;

      graphRef.current.simulation?.stop();

      const points = selected.map((node) => ({
        node,
        x: node.x ?? 0,
        y: node.y ?? 0,
      }));
      const xValues = points.map((item) => item.x);
      const yValues = points.map((item) => item.y);
      const xSpan = Math.max(...xValues) - Math.min(...xValues);
      const ySpan = Math.max(...yValues) - Math.min(...yValues);
      const horizontal = xSpan >= ySpan;

      const getHorizontalExtents = (node: SimNode) => {
        const circleExtent = node.radius + 14;
        const nodeEl = graphRef.current.nodeSelection
          ?.filter((candidate) => candidate.id === node.id)
          .node();
        const labelBg = nodeEl
          ? d3.select(nodeEl).select<SVGRectElement>('.label-bg').node()
          : null;
        const labelBox = labelBg?.getBBox();

        if (labelBox && Number.isFinite(labelBox.width) && labelBox.width > 0) {
          return {
            left: Math.max(circleExtent, -labelBox.x),
            right: Math.max(circleExtent, labelBox.x + labelBox.width),
          };
        }

        return {
          left: circleExtent,
          right: Math.max(circleExtent, node.radius + 42 + node.label.length * 12),
        };
      };

      const axis = horizontal ? 'x' : 'y';
      const cross = horizontal ? 'y' : 'x';
      const spacing = horizontal ? ALIGN_DEFAULT_SPACING_X : ALIGN_DEFAULT_SPACING_Y;
      const sorted = [...points].sort((a, b) => a[axis] - b[axis]);
      const axisValues = sorted.map((item) => item[axis]);
      const crossValues = sorted.map((item) => item[cross]);
      const centerCross = crossValues.reduce((sum, value) => sum + value, 0) / crossValues.length;
      let axisPositions: number[];

      if (horizontal) {
        const extents = sorted.map((item) => getHorizontalExtents(item.node));
        const relativePositions = extents.reduce<number[]>((positions, extent, index) => {
          if (index === 0) return [0];
          const previous = extents[index - 1];
          const previousPosition = positions[index - 1];
          const centerGap = Math.max(
            spacing,
            previous.right + extent.left + ALIGN_LABEL_GAP_X,
          );
          return [...positions, previousPosition + centerGap];
        }, []);
        const originalLeft = Math.min(...sorted.map((item, index) => item.x - extents[index].left));
        const originalRight = Math.max(...sorted.map((item, index) => item.x + extents[index].right));
        const targetLeft = relativePositions[0] - extents[0].left;
        const targetRight =
          relativePositions[relativePositions.length - 1] + extents[extents.length - 1].right;
        const offset = (originalLeft + originalRight - targetLeft - targetRight) / 2;
        axisPositions = relativePositions.map((position) => position + offset);
      } else {
        const centerAxis = (Math.min(...axisValues) + Math.max(...axisValues)) / 2;
        const start = centerAxis - (spacing * (sorted.length - 1)) / 2;
        axisPositions = sorted.map((_, index) => start + spacing * index);
      }

      sorted.forEach((item, index) => {
        const axisPosition = axisPositions[index];
        if (horizontal) {
          item.node.x = axisPosition;
          item.node.y = centerCross;
        } else {
          item.node.x = centerCross;
          item.node.y = axisPosition;
        }
        item.node.fx = item.node.x;
        item.node.fy = item.node.y;
        storeRef.current.updateNodePosition(item.node.id, item.node.x, item.node.y);
      });

      graphRef.current.nodeSelection?.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      refreshLinkGeometry();
      return true;
    };

    svg.on('click', (event) => {
      if (suppressBackgroundClick) {
        suppressBackgroundClick = false;
        return;
      }
      if (isBackgroundTarget(event.target) || isBoxSelectTarget(event.target)) {
        storeRef.current.setSelectedNode(null);
        storeRef.current.setSelectedEdge(null);
        storeRef.current.setSelectedGroup(null);
      }
    });

    svg.on('dblclick', (event) => {
      if (isBackgroundTarget(event.target)) {
        event.preventDefault();
        const [x, y] = d3.pointer(event, root.node());
        onCreateRef.current({ x, y });
      }
    });

    svg.on('contextmenu', (event) => {
      const el = event.target as Element;
      if (el.closest('.node') || el.closest('.link-hit')) return;
      event.preventDefault();
      const [gx, gy] = d3.pointer(event, root.node());
      openMenu(event.clientX, event.clientY, [
        { id: 'create', label: '创建节点', onClick: () => onCreateRef.current({ x: gx, y: gy }) },
        {
          id: 'reset',
          label: '重置视图',
          onClick: () => {
            const t = d3.zoomIdentity.translate(width / 2, height / 2).scale(0.95);
            svg.transition().duration(400).call(zoom.transform, t);
          },
        },
      ]);
    });

    svg.on('mousedown', (event) => {
      const el = event.target as Element;
      if (event.altKey && !el.closest('.node') && !el.closest('.port-anchor')) {
        event.preventDefault();
        const t = d3.zoomTransform(svgEl);
        altPan = { startX: event.clientX, startY: event.clientY, tx: t.x, ty: t.y };
        return;
      }
      if (event.button !== 0 || !isBoxSelectTarget(event.target)) return;
      const mode: BoxSelectMode = event.shiftKey
        ? 'add'
        : event.ctrlKey || event.metaKey
          ? 'remove'
          : 'replace';
      if (mode) {
        event.preventDefault();
        event.stopPropagation();
        const [x, y] = d3.pointer(event, root.node());
        boxSelect = { x0: x, y0: y, x1: x, y1: y, mode };
        updateBoxSelectPreview();
      }
    });

    const onWindowMove = (event: MouseEvent) => {
      const [mx, my] = d3.pointer(event, root.node());
      lastPointer = { mx, my };

      if (altPan) {
        const dx = event.clientX - altPan.startX;
        const dy = event.clientY - altPan.startY;
        const t = d3.zoomTransform(svgEl);
        svg.call(
          zoom.transform,
          d3.zoomIdentity.translate(altPan.tx + dx, altPan.ty + dy).scale(t.k),
        );
        return;
      }

      if (isCanvasNavigating && !wireSourceId && !boxSelect) {
        return;
      }

      setCreatePointer(mx, my);

      if (wireSourceId) {
        const { x: x1, y: y1 } = endpointPoint(wireSourceId, wireSourceKind, wireSourceAnchor);
        wirePreview.style('display', null).attr('x1', x1).attr('y1', y1).attr('x2', mx).attr('y2', my);
        updatePortAnchors(mx, my);
      } else {
        updatePortAnchors(mx, my);
      }

      if (boxSelect) {
        boxSelect.x1 = mx;
        boxSelect.y1 = my;
        updateBoxSelectPreview();
      }
    };

    const onWindowUp = (event: MouseEvent) => {
      if (boxSelect) {
        const xMin = Math.min(boxSelect.x0, boxSelect.x1);
        const xMax = Math.max(boxSelect.x0, boxSelect.x1);
        const yMin = Math.min(boxSelect.y0, boxSelect.y1);
        const yMax = Math.max(boxSelect.y0, boxSelect.y1);
        const moved = Math.abs(xMax - xMin) > 4 || Math.abs(yMax - yMin) > 4;
        if (moved) {
          suppressBackgroundClick = true;
          const pickedNodeIds = pickNodesInBox();
          const pickedGroupIds = pickGroupsInBox();
          if (boxSelect.mode === 'add') {
            storeRef.current.setSelectedNodesAndGroups(
              [...new Set([...storeRef.current.selectedNodeIds, ...pickedNodeIds])],
              [...new Set([...storeRef.current.selectedGroupIds, ...pickedGroupIds])],
            );
          } else if (boxSelect.mode === 'remove') {
            const pickedNodeSet = new Set(pickedNodeIds);
            const pickedGroupSet = new Set(pickedGroupIds);
            storeRef.current.setSelectedNodesAndGroups(
              storeRef.current.selectedNodeIds.filter((id) => !pickedNodeSet.has(id)),
              storeRef.current.selectedGroupIds.filter((id) => !pickedGroupSet.has(id)),
            );
          } else {
            storeRef.current.setSelectedNodesAndGroups(pickedNodeIds, pickedGroupIds);
          }
        } else {
          applySelectionVisual(storeRef.current.selectedNodeIds, storeRef.current.selectedGroupIds);
        }
        boxSelect = null;
        setBoxSelectUiRef.current(null);
      }
      if (wireSourceId) {
        const { mx, my } = lastPointer;
        const sourceId = wireSourceId;
        const targetHit = findEdgeHover(
          mx,
          my,
          graphRef.current.simNodes,
          PORT_EDGE_INNER,
          PORT_EDGE_OUTER,
          wireSourceKind === 'node' ? sourceId : null,
        );
        const targetBoxHit = findBoxPortHover(
          mx,
          my,
          wireSourceKind === 'group' ? sourceId : null,
        );
        if (targetHit) {
          storeRef.current.stageEdgeConnect(
            sourceId,
            targetHit.nodeId,
            event.clientX,
            event.clientY,
            wireSourceKind,
            'node',
          );
        } else if (targetBoxHit) {
          storeRef.current.stageEdgeConnect(
            sourceId,
            targetBoxHit.groupId,
            event.clientX,
            event.clientY,
            wireSourceKind,
            'group',
          );
        } else if (wireSourceKind === 'node' && wireSourceAnchor) {
          const { x: x1, y: y1 } = endpointPoint(sourceId, wireSourceKind, wireSourceAnchor);
          if (Math.hypot(mx - x1, my - y1) > 20) {
            onCreateRef.current({
              connectToId: sourceId,
              x: mx,
              y: my,
            });
          }
        }
        wireSourceId = null;
        wireSourceKind = 'node';
        wireSourceAnchor = null;
        wirePreview.style('display', 'none');
        setWiringClass(false);
        const [px, py] = d3.pointer(event, root.node());
        updatePortAnchors(px, py);
      }
      altPan = null;
      endCanvasNavigation();
    };

  const onWindowKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
        if (storeRef.current.cutSelectionToClipboard()) event.preventDefault();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        if (storeRef.current.pasteNodeClipboard()) event.preventDefault();
        return;
      }
      if (
        (event.key === 'Delete' ||
          event.key === 'Del' ||
          event.key === 'Backspace' ||
          event.code === 'Delete' ||
          event.key.toLowerCase() === 'x') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const { selectedGroupIds, selectedNodeIds, selectedEdgeId } = storeRef.current;
        if (selectedGroupIds.length > 0) {
          event.preventDefault();
          selectedGroupIds.forEach((groupId) => storeRef.current.removeGroup(groupId));
          return;
        }
        if (selectedNodeIds.length > 0) {
          event.preventDefault();
          storeRef.current.removeNodes(selectedNodeIds);
          return;
        }
        if (selectedEdgeId) {
          event.preventDefault();
          storeRef.current.removeEdge(selectedEdgeId);
          return;
        }
      }
      if (
        event.key.toLowerCase() === 'a' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        alignSelectedAtDefaultSpacing();
      }
      if (
        event.key.toLowerCase() === 'f' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        if (focusSelectedNodes()) event.preventDefault();
      }
    };

    window.addEventListener('mousemove', onWindowMove);
    window.addEventListener('mouseup', onWindowUp);
    window.addEventListener('keydown', onWindowKeyDown);

    graphRef.current = {
      simNodes: buildSimNodes,
      linkEndpointNodes: buildLinkEndpointNodes,
      simNodeById: new Map(buildSimNodes.map((node) => [node.id, node])),
      runtimeGroupById: new Map(),
      linkEndpointNodeById: new Map(buildLinkEndpointNodes.map((node) => [node.id, node])),
      runtimeGroupMemberIds: new Map(),
      nodeSelection: null,
      linkHitSelection: null,
      linkSelection: null,
      linkSymbolSelection: null,
      edgeHandleSelection: null,
      labelSelection: null,
      networkBoxSelection: null,
      root,
      wirePreview: null,
      edgeReconnectPreview: null,
      snapGuideX: null,
      snapGuideY: null,
      simulation: null,
      refreshGraphGeometry: null,
      refreshLinkGeometry: null,
      beginWireFromEndpoint,
    };

    if (buildSimNodes.length === 0) {
      const emptyBoxGroup = root.append('g').attr('class', 'network-boxes');
      graphRef.current.networkBoxSelection = emptyBoxGroup
        .selectAll<SVGGElement, NetworkBoxDatum>('g.network-box')
        .data([] as NetworkBoxDatum[], (d) => d.id)
        .join('g')
        .attr('class', 'network-box');
      graphRef.current.runtimeGroupById = new Map();
      graphRef.current.runtimeGroupMemberIds = new Map();

      const overlay = root.append('g').attr('class', 'overlay').style('pointer-events', 'none');
      wirePreview = overlay
        .append('line')
        .attr('class', 'wire-preview')
        .attr('stroke', '#60a5fa')
        .attr('stroke-width', 2)
        .style('display', 'none');
      graphRef.current.wirePreview = wirePreview;

      if (shouldAutoFit) {
        svg.call(
          zoom.transform,
          d3.zoomIdentity.translate(width / 2, height / 2).scale(0.95),
        );
      }
      return () => {
        setWiringClass(false);
        cleanupZoomWork();
        svg.on('wheel.canvasZoom', null);
        setBoxSelectUiRef.current(null);
        window.removeEventListener('mousemove', onWindowMove);
        window.removeEventListener('mouseup', onWindowUp);
        window.removeEventListener('keydown', onWindowKeyDown);
      };
    }

    const boxGroup = root.append('g').attr('class', 'network-boxes');
    const networkBoxSelection = boxGroup
      .selectAll<SVGGElement, NetworkBoxDatum>('g.network-box')
      .data([] as NetworkBoxDatum[], (d) => d.id)
      .join('g')
      .attr('class', 'network-box');

    const linkGroup = root.append('g').attr('class', 'links');
    const linkLabelGroup = root.append('g').attr('class', 'link-labels');
    const nodeGroup = root.append('g').attr('class', 'nodes');
    const edgeHandleGroup = root.append('g').attr('class', 'edge-handles');

    resolveSimLinks(buildSimLinks, buildLinkEndpointNodes);

    const linkHitSelection = linkGroup
      .selectAll<SVGPathElement, SimLink>('path.link-hit')
      .data(buildSimLinks, (d) => d.id)
      .join('path')
      .attr('class', 'link-hit')
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 14)
      .style('cursor', 'pointer');

    const linkSelection = linkGroup
      .selectAll<SVGPathElement, SimLink>('path.link-visible')
      .data(buildSimLinks, (d) => d.id)
      .join('path')
      .attr('class', 'link-visible')
      .style('pointer-events', 'none');
    applyLinkVisual(linkSelection);

    linkHitSelection
      .on('click', (event, d) => {
        event.stopPropagation();
        storeRef.current.setSelectedEdge(editableSimLinkId(d));
      })
      .on('contextmenu', (event, d) => {
        event.preventDefault();
        event.stopPropagation();
        const edgeId = editableSimLinkId(d);
        storeRef.current.setSelectedEdge(edgeId);
        openMenu(event.clientX, event.clientY, [
          ...(edgeTypeHasDirection(d.edgeType)
            ? [{
                id: 'reverse',
                label: '反转方向',
                onClick: () => storeRef.current.reverseEdge(edgeId),
              }]
            : []),
          {
            id: 'disconnect',
            label: '断开连接',
            danger: true,
            onClick: () => storeRef.current.removeEdge(edgeId),
          },
          ...EDGE_TYPES.map((t) => ({
            id: `type-${t}`,
            label: `类型：${EDGE_TYPE_LABELS[t]}`,
            onClick: () => storeRef.current.updateEdge(edgeId, { type: t }),
          })),
        ]);
      });

    const linkSymbolSelection = linkLabelGroup
      .selectAll<SVGGElement, SimLink>('g.link-symbol')
      .data(buildSimLinks, (d) => d.id)
      .join('g')
      .attr('class', 'link-symbol')
      .style('pointer-events', 'all')
      .style('cursor', 'grab')
      .on('click', (event, d) => {
        event.stopPropagation();
        storeRef.current.setSelectedEdge(editableSimLinkId(d));
      })
      .on('dblclick', (event, d) => {
        event.preventDefault();
        event.stopPropagation();
        openEdgeLabelEditor(event as MouseEvent, d);
      });

    let edgeLabelDragState: { id: string; t: number } | null = null;
    const edgeLabelDrag = d3
      .drag<SVGGElement, SimLink>()
      .on('start', function (event, d) {
        event.sourceEvent?.preventDefault?.();
        event.sourceEvent?.stopPropagation?.();
        suppressBackgroundClick = true;
        const edgeId = editableSimLinkId(d);
        storeRef.current.setSelectedEdge(edgeId);
        edgeLabelDragState = { id: edgeId, t: d.labelPosition ?? 0.5 };
        d3.select<SVGGElement, SimLink>(this).style('cursor', 'grabbing');
      })
      .on('drag', function (event, d) {
        event.sourceEvent?.stopPropagation?.();
        d.labelPosition = closestLinkPosition(d, { x: event.x, y: event.y });
        updateLinkMidPositions(
          d3.select<SVGGElement, SimLink>(this) as unknown as d3.Selection<
            SVGGElement,
            SimLink,
            SVGGElement,
            unknown
          >,
        );
      })
      .on('end', function (event, d) {
        event.sourceEvent?.stopPropagation?.();
        d3.select<SVGGElement, SimLink>(this).style('cursor', 'grab');
        const state = edgeLabelDragState;
        edgeLabelDragState = null;
        if (!state) return;
        const next = Number((d.labelPosition ?? 0.5).toFixed(4));
        if (Math.abs(next - state.t) < 0.0001) return;
        storeRef.current.updateEdge(d.derivedFromEdgeId ?? d.id, { label_position: next });
      });

    linkSymbolSelection.call(edgeLabelDrag);

    linkSymbolSelection.each(function (d) {
      appendLinkMidDecoration(d3.select(this), d, linkLabelMode);
    });
    applyLinkMidDecoration(linkSymbolSelection, linkLabelMode);

    const nodeSelection = nodeGroup
      .selectAll<SVGGElement, SimNode>('g.node')
      .data(buildSimNodes, (d) => d.id)
      .join('g')
      .attr('class', 'node')
      .style('cursor', () => (storeRef.current.linkMode ? 'crosshair' : 'pointer'))
      .on('click', (event, d) => {
        event.stopPropagation();
        if (storeRef.current.linkMode) {
          const { linkSourceId } = storeRef.current;
          if (!linkSourceId || linkSourceId === d.id) {
            storeRef.current.handleLinkClick(d.id);
            return;
          }
          storeRef.current.stageEdgeConnect(
            linkSourceId,
            d.id,
            event.clientX,
            event.clientY,
            storeRef.current.linkSourceKind,
            'node',
          );
          return;
        }
        if (event.shiftKey) {
          storeRef.current.toggleNodeSelection(d.id, true);
          return;
        }
        storeRef.current.setSelectedNode(d.id);
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        const raw = nodes.find((n) => n.id === d.id);
        if (raw?.shortcut_target_id) {
          event.preventDefault();
          storeRef.current.jumpToShortcutTarget(d.id);
          return;
        }
        const [lx, ly] = d3.pointer(event, event.currentTarget as SVGGElement);
        const labelStartX = d.radius + 8;
        if (lx >= labelStartX && lx <= labelStartX + 220 && ly >= -20 && ly <= 20) {
          event.preventDefault();
          openLabelEditor(event as MouseEvent, d);
          return;
        }
        if (!storeRef.current.linkMode && isQuickDeleteNode(d)) {
          event.preventDefault();
          completeOrDeleteNode(d);
          return;
        }
        if (raw && canEnterSubnet(raw)) {
          storeRef.current.enterSubnet(d.id);
        }
      })
      .on('contextmenu', (event, d) => {
        event.preventDefault();
        event.stopPropagation();
        storeRef.current.setSelectedNode(d.id);
        const [gx, gy] = d3.pointer(event, root.node());
        const raw = nodes.find((node) => node.id === d.id);
        openMenu(event.clientX, event.clientY, [
          ...(raw?.shortcut_target_id
            ? [{
                id: 'jump-shortcut',
                label: '跳转到原节点',
                onClick: () => storeRef.current.jumpToShortcutTarget(d.id),
              }]
            : [{
                id: 'shortcut',
                label: '创建快捷方式',
                onClick: () => storeRef.current.createShortcutNode(d.id, gx + 90, gy + 40),
              }]),
          {
            id: 'delete',
            label: '删除节点',
            danger: true,
            onClick: () => storeRef.current.removeNodes([d.id]),
          },
        ]);
      });

    nodeSelection.each(function (d) {
      const g = d3.select<SVGGElement, SimNode>(this);
      appendNodeCircle(d3.select<d3.BaseType, SimNode>(this));

      g.append('circle')
        .attr('class', 'link-source-ring')
        .attr('r', d.radius + 7)
        .attr('fill', 'none')
        .attr('stroke', '#60a5fa')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 4')
        .style('pointer-events', 'none')
        .style('display', 'none');

      g.append('circle')
        .attr('class', 'port-anchor')
        .attr('r', 4)
        .attr('fill', '#60a5fa')
        .attr('stroke', '#e2e8f0')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0)
        .style('pointer-events', 'none')
        .style('cursor', 'crosshair')
        .on('mousedown', (event, d) => {
          const port = d3.select(event.currentTarget as SVGCircleElement);
          const lx = Number(port.attr('cx'));
          const ly = Number(port.attr('cy'));
          beginWireFromNodePort(event as MouseEvent, d, { lx, ly });
        });

      g.selectAll<SVGRectElement, SimNode>('.list-card-port')
        .style('pointer-events', 'all')
        .style('cursor', 'crosshair')
        .on('mousedown', function (event, d) {
          const port = d3.select<SVGRectElement, SimNode>(this);
          const x = Number(port.attr('x'));
          const width = Number(port.attr('width'));
          const y = Number(port.attr('y'));
          const height = Number(port.attr('height'));
          beginWireFromNodePort(event as MouseEvent, d, {
            lx: x + width / 2,
            ly: y + height / 2,
          });
        });
    });

    const selectedLink = buildSimLinks.find((link) => link.id === selectedEdgeId);
    const canEditSelectedLinkEndpoints =
      !selectedLink?.derivedFromEdgeId &&
      selectedLink?.sourceKind !== 'group' &&
      selectedLink?.targetKind !== 'group';
    const edgeHandleData: EdgeHandleDatum[] = selectedLink && canEditSelectedLinkEndpoints
      ? [
          { id: `${selectedLink.id}:source`, edgeId: selectedLink.id, role: 'source', link: selectedLink },
          { id: `${selectedLink.id}:target`, edgeId: selectedLink.id, role: 'target', link: selectedLink },
        ]
      : [];

    const edgeHandleSelection = edgeHandleGroup
      .selectAll<SVGGElement, EdgeHandleDatum>('g.edge-endpoint-handle')
      .data(edgeHandleData, (d) => d.id)
      .join((enter) => {
        const g = enter
          .append('g')
          .attr('class', (d) => `edge-endpoint-handle is-${d.role}`)
          .style('cursor', 'grab')
          .style('pointer-events', 'all');
        g.append('circle')
          .attr('r', 10)
          .attr('fill', 'transparent')
          .attr('stroke', 'transparent')
          .attr('stroke-width', 10);
        g.append('circle')
          .attr('r', 5)
          .attr('fill', '#0f172a')
          .attr('stroke', (d) => (d.role === 'source' ? '#38bdf8' : '#fbbf24'))
          .attr('stroke-width', 2.2);
        g.append('circle')
          .attr('r', 8)
          .attr('fill', 'none')
          .attr('stroke', (d) => (d.role === 'source' ? 'rgba(56,189,248,0.35)' : 'rgba(251,191,36,0.35)'))
          .attr('stroke-width', 1);
        return g;
      });
    updateEdgeHandlePositions(edgeHandleSelection);

    const labelSelection = nodeSelection
      .append('g')
      .attr('class', 'labels')
      .attr('draggable', true)
      .style('pointer-events', 'all')
      .style('cursor', 'grab')
      .on('dragstart', (event, d) => {
        event.stopPropagation();
        const ids = storeRef.current.selectedNodeIds.includes(d.id)
          ? [...storeRef.current.selectedNodeIds]
          : [d.id];
        event.dataTransfer?.setData(NODE_DRAG_MIME, JSON.stringify(ids));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      })
      .each(function () {
        const lg = d3.select<SVGGElement, SimNode>(this);
        lg.append('rect').attr('class', 'label-bg');
        lg.append('rect')
          .attr('class', 'label-edit-hit')
          .on('click', (event, d) => {
            event.stopPropagation();
            storeRef.current.setSelectedNode(d.id);
          })
          .on('dblclick', (event, d) => {
            event.preventDefault();
            event.stopPropagation();
            const raw = nodes.find((node) => node.id === d.id);
            if (raw?.shortcut_target_id) {
              storeRef.current.jumpToShortcutTarget(d.id);
              return;
            }
            openLabelEditor(event as MouseEvent, d);
          });
        lg.append('rect').attr('class', 'type-tag-bg');
        lg.append('text')
          .attr('class', 'type-chip')
          .attr('dominant-baseline', 'central')
          .attr('text-anchor', 'start');
        lg.append('text')
          .attr('class', 'name-label')
          .attr('dominant-baseline', 'central')
          .attr('text-anchor', 'start');
      });

    applyNodeVisual(nodeSelection);

    const renderFrame = () => {
      perfCount('graph:render-frame:count');
      perfTime('graph:render-frame', () => {
        resolveSimLinks(buildSimLinks, buildLinkEndpointNodes);
        linkHitSelection
          .attr('d', (d) => linkPath(d));
        linkSelection
          .attr('d', (d) => linkPath(d));
        applyRuntimeLinkVisibility();
        updateLinkMidPositions(linkSymbolSelection);
        nodeSelection.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
        updateEdgeHandlePositions(edgeHandleSelection);
      }, {
        nodes: buildSimNodes.length,
        links: buildSimLinks.length,
      });
    };
    let renderFrameId: number | null = null;
    const scheduleRenderFrame = () => {
      if (renderFrameId != null) return;
      renderFrameId = window.requestAnimationFrame(() => {
        renderFrameId = null;
        renderFrame();
      });
    };
    const cancelScheduledRenderFrame = () => {
      if (renderFrameId == null) return;
      window.cancelAnimationFrame(renderFrameId);
      renderFrameId = null;
    };
    graphRef.current.refreshGraphGeometry = renderFrame;

    const hideEdgeReconnectPreview = () => {
      edgeReconnectPreview?.style('display', 'none').attr('marker-end', null);
    };

    const previewEndpointForHit = (
      hit: ReturnType<typeof findEdgeHover>,
      fallbackX: number,
      fallbackY: number,
    ) => {
      if (!hit) return { x: fallbackX, y: fallbackY };
      const node = graphRef.current.simNodes.find((item) => item.id === hit.nodeId);
      if (!node) return { x: fallbackX, y: fallbackY };
      return {
        x: (node.x ?? fallbackX) + hit.lx,
        y: (node.y ?? fallbackY) + hit.ly,
      };
    };

    const updateEdgeReconnectPreview = (
      datum: EdgeHandleDatum,
      pointerX: number,
      pointerY: number,
      hit: ReturnType<typeof findEdgeHover>,
    ) => {
      const endpoints = linkVisibleEndpoints(datum.link);
      const floating = previewEndpointForHit(hit, pointerX, pointerY);
      const x1 = datum.role === 'source' ? floating.x : endpoints.source.x;
      const y1 = datum.role === 'source' ? floating.y : endpoints.source.y;
      const x2 = datum.role === 'source' ? endpoints.target.x : floating.x;
      const y2 = datum.role === 'source' ? endpoints.target.y : floating.y;
      edgeReconnectPreview
        .style('display', null)
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', EDGE_TYPE_COLORS[datum.link.edgeType])
        .attr('stroke-dasharray', hit ? null : '5 4')
        .attr('marker-end', edgeTypeHasDirection(datum.link.edgeType)
          ? `url(#edge-arrow-${datum.link.edgeType})`
          : null);
    };

    let edgeHandleDragState: {
      mode: 'move-node' | 'reconnect';
      node: SimNode | null;
      startX: number;
      startY: number;
      originalX: number;
      originalY: number;
    } | null = null;

    const edgeHandleDrag = d3
      .drag<SVGGElement, EdgeHandleDatum>()
      .on('start', (event, d) => {
        event.sourceEvent?.preventDefault?.();
        event.sourceEvent?.stopPropagation?.();
        suppressBackgroundClick = true;
        storeRef.current.setSelectedEdge(d.edgeId);
        const sourceId = endpointId(d.link.source);
        const targetId = endpointId(d.link.target);
        const nodeId = d.role === 'source' ? sourceId : targetId;
        const node = graphRef.current.simNodes.find((item) => item.id === nodeId) ?? null;
        edgeHandleDragState = event.sourceEvent?.shiftKey && node
          ? {
              mode: 'move-node',
              node,
              startX: event.x,
              startY: event.y,
              originalX: node.x ?? 0,
              originalY: node.y ?? 0,
            }
          : {
              mode: 'reconnect',
              node: null,
              startX: event.x,
              startY: event.y,
              originalX: 0,
              originalY: 0,
            };
        if (edgeHandleDragState.mode === 'reconnect') {
          updateEdgeReconnectPreview(d, event.x, event.y, null);
        } else {
          hideEdgeReconnectPreview();
        }
        edgeHandleSelection
          .filter((item) => item.id === d.id)
          .style('cursor', 'grabbing');
      })
      .on('drag', (event, d) => {
        event.sourceEvent?.stopPropagation?.();
        if (!edgeHandleDragState) return;
        if (edgeHandleDragState.mode === 'move-node' && edgeHandleDragState.node) {
          const nextX = edgeHandleDragState.originalX + event.x - edgeHandleDragState.startX;
          const nextY = edgeHandleDragState.originalY + event.y - edgeHandleDragState.startY;
          edgeHandleDragState.node.x = nextX;
          edgeHandleDragState.node.y = nextY;
          edgeHandleDragState.node.fx = nextX;
          edgeHandleDragState.node.fy = nextY;
          renderFrame();
          return;
        }
        edgeHandleSelection
          .filter((item) => item.id === d.id)
          .attr('transform', `translate(${event.x},${event.y})`);
        const sourceId = endpointId(d.link.source);
        const targetId = endpointId(d.link.target);
        const excludeId = d.role === 'source' ? targetId : sourceId;
        const hit = findEdgeHover(event.x, event.y, graphRef.current.simNodes, 0, 1.85, excludeId);
        updateEdgeReconnectPreview(d, event.x, event.y, hit);
        nodeSelection.classed('is-link-target-preview', (node) => node.id === hit?.nodeId);
      })
      .on('end', (event, d) => {
        event.sourceEvent?.stopPropagation?.();
        hideEdgeReconnectPreview();
        nodeSelection.classed('is-link-target-preview', false);
        edgeHandleSelection
          .filter((item) => item.id === d.id)
          .style('cursor', 'grab');
        const state = edgeHandleDragState;
        edgeHandleDragState = null;
        if (!state) return;
        if (state.mode === 'move-node' && state.node) {
          if (state.node.x != null && state.node.y != null) {
            state.node.fx = state.node.x;
            state.node.fy = state.node.y;
            storeRef.current.updateNodePosition(state.node.id, state.node.x, state.node.y);
            syncSimNodeMembership(state.node);
          }
          renderFrame();
          return;
        }

        const sourceId = endpointId(d.link.source);
        const targetId = endpointId(d.link.target);
        const excludeId = d.role === 'source' ? targetId : sourceId;
        const hit = findEdgeHover(event.x, event.y, graphRef.current.simNodes, 0, 1.85, excludeId);
        if (hit) {
          const nextSource = d.role === 'source' ? hit.nodeId : sourceId;
          const nextTarget = d.role === 'target' ? hit.nodeId : targetId;
          storeRef.current.updateEdgeEndpoints(d.edgeId, nextSource, nextTarget);
        }
        renderFrame();
      });

    edgeHandleSelection.call(edgeHandleDrag);

    const needsLayout = buildSimNodes.some((n) => n.x == null || n.y == null);

    if (!needsLayout) {
      perfEvent('graph:layout-skipped', {
        nodes: buildSimNodes.length,
        links: buildSimLinks.length,
      });
      renderFrame();
    } else {
      perfMark('graph:simulation:start', {
        nodes: buildSimNodes.length,
        links: buildSimLinks.length,
      });
      const simulation = d3
        .forceSimulation(buildSimNodes)
        .velocityDecay(0.75)
        .alphaDecay(0.08)
        .force(
          'link',
          d3
            .forceLink<SimNode, SimLink>(buildSimLinks)
            .id((d) => d.id)
            .distance(105)
            .strength(0.24),
        )
        .force('charge', d3.forceManyBody().strength(-125))
        .force('center', d3.forceCenter(0, 0).strength(0.04))
        .force('collision', d3.forceCollide<SimNode>().radius((d) => d.radius + 34));

      const drag = d3
        .drag<SVGGElement, SimNode>()
        .filter((event) => nodeDragFilter(event))
        .on('start', (event, d) => {
          hideSnapGuides();
          listDragPreview = null;
          if (d.viewMode === 'list') {
            graphRef.current.simulation?.stop();
          } else {
            beginGroupDrag(d);
          }
          if (groupDrag || d.viewMode === 'list') {
            simulation.stop();
          } else if (!event.active) {
            simulation.alphaTarget(0.15).restart();
          }
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          const pointer = dragPointerPosition(event);
          if (shouldUseListDragPreview(d, pointer.x, pointer.y)) {
            applyListDragPreview(d, pointer.x, pointer.y);
            return;
          }
          const next = dragPositionWithSnap(d, event.x, event.y);
          updateSnapGuides(next);
          if (applyGroupDrag(next.x, next.y)) {
            scheduleRenderFrame();
            return;
          }
          d.fx = next.x;
          d.fy = next.y;
          d.x = next.x;
          d.y = next.y;
          scheduleRenderFrame();
        })
        .on('end', (event, d) => {
          hideSnapGuides();
          if (commitListDragPreview(d)) return;
          restoreListDragPreview();
          if (commitListNodeDrag(d)) return;
          if (!groupDrag && !event.active) simulation.alphaTarget(0);
          if (commitGroupDrag()) return;
          if (d.x != null && d.y != null) {
            d.fx = d.x;
            d.fy = d.y;
            if (d.viewMode !== 'list') {
              storeRef.current.updateNodePosition(d.id, d.x, d.y);
              syncSimNodeMembership(d);
            }
          }
        });

      nodeSelection.call(drag);

      simulation.on('tick', () => {
        perfCount('graph:simulation:tick');
        renderFrame();
      });

      simulation.on('end', () => {
        perfMark('graph:simulation:end');
        perfMeasure('graph:simulation', 'graph:simulation:start', 'graph:simulation:end', {
          nodes: buildSimNodes.length,
          links: buildSimLinks.length,
        });
        for (const n of buildSimNodes) {
          if (n.viewMode === 'list') continue;
          if (n.x != null && n.y != null) {
            n.fx = n.x;
            n.fy = n.y;
            const stored = visibleNodeById.get(n.id);
            if (stored?.x == null || stored?.y == null) {
              storeRef.current.updateNodePosition(n.id, n.x, n.y);
            }
            syncSimNodeMembership(n);
          }
        }
        simulation.stop();
      });

      graphRef.current.simulation = simulation;
    }

    const dragFixed = d3
      .drag<SVGGElement, SimNode>()
      .filter((event) => nodeDragFilter(event))
      .on('start', (_event, d) => {
        hideSnapGuides();
        listDragPreview = null;
        if (d.viewMode !== 'list') beginGroupDrag(d);
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        const pointer = dragPointerPosition(event);
        if (shouldUseListDragPreview(d, pointer.x, pointer.y)) {
          applyListDragPreview(d, pointer.x, pointer.y);
          return;
        }
        const next = dragPositionWithSnap(d, event.x, event.y);
        updateSnapGuides(next);
        if (applyGroupDrag(next.x, next.y)) {
          scheduleRenderFrame();
          return;
        }
        d.fx = next.x;
        d.fy = next.y;
        d.x = next.x;
        d.y = next.y;
        scheduleRenderFrame();
      })
      .on('end', (_event, d) => {
        hideSnapGuides();
        if (commitListDragPreview(d)) return;
        restoreListDragPreview();
        if (commitListNodeDrag(d)) return;
        if (commitGroupDrag()) return;
        if (d.x != null && d.y != null) {
          d.fx = d.x;
          d.fy = d.y;
          if (d.viewMode !== 'list') {
            storeRef.current.updateNodePosition(d.id, d.x, d.y);
            syncSimNodeMembership(d);
          }
        }
      });

    if (!needsLayout) {
      nodeSelection.call(dragFixed);
    }

    graphRef.current.nodeSelection = nodeSelection;
    graphRef.current.linkHitSelection = linkHitSelection;
    graphRef.current.linkSelection = linkSelection;
    graphRef.current.linkSymbolSelection = linkSymbolSelection;
    graphRef.current.edgeHandleSelection = edgeHandleSelection;
    graphRef.current.labelSelection = labelSelection;
    graphRef.current.networkBoxSelection = networkBoxSelection;
    graphRef.current.simNodes = buildSimNodes;
    graphRef.current.linkEndpointNodes = buildLinkEndpointNodes;
    graphRef.current.simNodeById = new Map(buildSimNodes.map((node) => [node.id, node]));
    graphRef.current.linkEndpointNodeById = new Map(buildLinkEndpointNodes.map((node) => [node.id, node]));
    graphRef.current.runtimeGroupById = new Map(networkBoxSelection.data().map((group) => [group.id, group]));
    graphRef.current.runtimeGroupMemberIds = new Map(
      networkBoxSelection.data().map((group) => [group.id, new Set(group.node_ids)]),
    );

    const overlay = root.append('g').attr('class', 'overlay').style('pointer-events', 'none');
    const appendSnapGuide = () =>
      overlay
        .append('line')
        .attr('class', 'snap-guide')
        .attr('stroke', '#38bdf8')
        .attr('stroke-width', 0.6)
        .attr('stroke-dasharray', '5 7')
        .attr('opacity', 0.55)
        .style('display', 'none');

    snapGuideX = appendSnapGuide();
    snapGuideY = appendSnapGuide();
    graphRef.current.snapGuideX = snapGuideX;
    graphRef.current.snapGuideY = snapGuideY;

    wirePreview = overlay
      .append('line')
      .attr('class', 'wire-preview')
      .attr('stroke', '#60a5fa')
      .attr('stroke-width', 2)
      .style('display', 'none');
    graphRef.current.wirePreview = wirePreview;
    edgeReconnectPreview = overlay
      .append('line')
      .attr('class', 'edge-reconnect-preview')
      .attr('fill', 'none')
      .attr('stroke-width', 2.4)
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.9)
      .style('display', 'none');
    graphRef.current.edgeReconnectPreview = edgeReconnectPreview;

    if (shouldAutoFit && buildSimNodes.length > 0) {
      svg.call(
        zoom.transform,
        d3.zoomIdentity.translate(width / 2, height / 2).scale(0.95),
      );
    }

    return () => {
      graphRef.current.simulation?.stop();
      graphRef.current.snapGuideX = null;
      graphRef.current.snapGuideY = null;
      graphRef.current.edgeReconnectPreview = null;
      setWiringClass(false);
      cleanupZoomWork();
      svg.on('wheel.canvasZoom', null);
      cancelScheduledRenderFrame();
      cancelDragPreviewRender();
      setBoxSelectUiRef.current(null);
      window.removeEventListener('mousemove', onWindowMove);
      window.removeEventListener('mouseup', onWindowUp);
      window.removeEventListener('keydown', onWindowKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layout only when structure or selected edge handles change
  }, [layoutSignature, selectedEdgeId]);

  useEffect(() => {
    const { networkBoxSelection } = graphRef.current;
    if (!networkBoxSelection) return;

    const activeInteraction = boxInteractionRef.current;
    let multiBoxDrag: {
      startX: number;
      startY: number;
      groupOriginals: Map<string, { x: number; y: number }>;
      nodeOriginals: Map<string, { x: number; y: number }>;
    } | null = null;

    const moveMemberNodes = (nodeIds: string[], dx: number, dy: number) => {
      if (dx === 0 && dy === 0) return;
      const members = new Set(nodeIds);
      for (const node of graphRef.current.simNodes) {
        if (!members.has(node.id)) continue;
        node.x = (node.x ?? 0) + dx;
        node.y = (node.y ?? 0) + dy;
        node.fx = node.x;
        node.fy = node.y;
      }
      graphRef.current.refreshGraphGeometry?.();
    };

    const applyBoxVisual = (groupEl: SVGGElement, d: NetworkBoxDatum) => {
      const interaction = boxInteractionRef.current;
      let sizeOverride: { width: number; height: number } | undefined;
      if (interaction?.id === d.id && interaction.type === 'resize') {
        sizeOverride = {
          width: interaction.visualWidth,
          height: interaction.visualHeight,
        };
      }
      applyNetworkBoxVisual(d3.select<SVGGElement, NetworkBoxDatum>(groupEl), sizeOverride);
    };

    const syncBoxEndpoint = (
      d: NetworkBoxDatum,
      interaction: BoxInteraction | null,
    ) => {
      const endpoint = graphRef.current.linkEndpointNodeById.get(d.id);
      if (endpoint) {
        const x = interaction ? interaction.visualX : d.x;
        const y = interaction ? interaction.visualY : d.y;
        const width = interaction?.type === 'resize' ? interaction.visualWidth : d.width;
        const height = interaction?.type === 'resize' ? interaction.visualHeight : d.height;
        endpoint.x = x + width / 2;
        endpoint.y = y + height / 2;
        endpoint.fx = endpoint.x;
        endpoint.fy = endpoint.y;
        endpoint.boxWidth = width;
        endpoint.boxHeight = height;
      }
    };

    const syncBoxTransform = (
      groupEl: SVGGElement,
      d: NetworkBoxDatum,
      interaction: BoxInteraction | null,
    ) => {
      d3.select(groupEl).attr('transform', networkBoxTransform(d, interaction));
      syncBoxEndpoint(d, interaction);
      graphRef.current.refreshLinkGeometry?.();
    };

    const showBoxSnapGuides = (x?: number | null, y?: number | null) => {
      const transform = d3.zoomTransform(svgRef.current ?? document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      const [x0, y0] = transform.invert([0, 0]);
      const [x1, y1] = transform.invert([
        containerRef.current?.clientWidth ?? 0,
        containerRef.current?.clientHeight ?? 0,
      ]);
      graphRef.current.snapGuideX
        ?.style('display', x == null ? 'none' : '')
        .attr('x1', x ?? 0)
        .attr('y1', y0)
        .attr('x2', x ?? 0)
        .attr('y2', y1);
      graphRef.current.snapGuideY
        ?.style('display', y == null ? 'none' : '')
        .attr('x1', x0)
        .attr('y1', y ?? 0)
        .attr('x2', x1)
        .attr('y2', y ?? 0);
    };

    const hideBoxSnapGuides = () => showBoxSnapGuides(null, null);

    const otherBoxRects = (excludeIds: Set<string>) =>
      (graphRef.current.networkBoxSelection?.data() ?? [])
        .filter((group) => !excludeIds.has(group.id))
        .map((group) => ({
          id: group.id,
          x: group.x,
          y: group.y,
          width: group.width,
          height: group.height,
        }));

    const snapBoxMove = (rect: BoxRect, excludeIds: Set<string>): BoxRect => {
      let dx = 0;
      let dy = 0;
      let bestX = BOX_MOVE_SNAP_THRESHOLD;
      let bestY = BOX_MOVE_SNAP_THRESHOLD;
      let guideX: number | null = null;
      let guideY: number | null = null;
      const xAnchors = [
        { value: rect.x, offset: 0 },
        { value: rect.x + rect.width / 2, offset: rect.width / 2 },
        { value: rect.x + rect.width, offset: rect.width },
      ];
      const yAnchors = [
        { value: rect.y, offset: 0 },
        { value: rect.y + rect.height / 2, offset: rect.height / 2 },
        { value: rect.y + rect.height, offset: rect.height },
      ];
      for (const other of otherBoxRects(excludeIds)) {
        const targetsX = [other.x, other.x + other.width / 2, other.x + other.width];
        const targetsY = [other.y, other.y + other.height / 2, other.y + other.height];
        for (const anchor of xAnchors) {
          for (const target of targetsX) {
            const gap = Math.abs(anchor.value - target);
            if (gap <= bestX) {
              bestX = gap;
              dx = target - anchor.value;
              guideX = target;
            }
          }
        }
        for (const anchor of yAnchors) {
          for (const target of targetsY) {
            const gap = Math.abs(anchor.value - target);
            if (gap <= bestY) {
              bestY = gap;
              dy = target - anchor.value;
              guideY = target;
            }
          }
        }
      }
      showBoxSnapGuides(guideX, guideY);
      return { ...rect, x: rect.x + dx, y: rect.y + dy };
    };

    const snapBoxResize = (rect: BoxRect, edge: BoxResizeEdge, excludeIds: Set<string>): BoxRect => {
      let next = { ...rect };
      let bestX = BOX_RESIZE_SNAP_THRESHOLD;
      let bestY = BOX_RESIZE_SNAP_THRESHOLD;
      let guideX: number | null = null;
      let guideY: number | null = null;
      for (const other of otherBoxRects(excludeIds)) {
        const targetsX = [other.x, other.x + other.width / 2, other.x + other.width];
        const targetsY = [other.y, other.y + other.height / 2, other.y + other.height];
        if (edge.includes('e')) {
          const right = next.x + next.width;
          for (const target of targetsX) {
            const gap = Math.abs(right - target);
            if (gap <= bestX) {
              bestX = gap;
              next.width = Math.max(0, target - next.x);
              guideX = target;
            }
          }
        }
        if (edge.includes('w')) {
          const right = next.x + next.width;
          for (const target of targetsX) {
            const gap = Math.abs(next.x - target);
            if (gap <= bestX) {
              bestX = gap;
              next.x = target;
              next.width = Math.max(0, right - target);
              guideX = target;
            }
          }
        }
        if (edge.includes('s')) {
          const bottom = next.y + next.height;
          for (const target of targetsY) {
            const gap = Math.abs(bottom - target);
            if (gap <= bestY) {
              bestY = gap;
              next.height = Math.max(0, target - next.y);
              guideY = target;
            }
          }
        }
        if (edge.includes('n')) {
          const bottom = next.y + next.height;
          for (const target of targetsY) {
            const gap = Math.abs(next.y - target);
            if (gap <= bestY) {
              bestY = gap;
              next.y = target;
              next.height = Math.max(0, bottom - target);
              guideY = target;
            }
          }
        }
      }
      const clamped = clampNetworkBoxSize(next.width, next.height);
      if (edge.includes('w')) next.x = next.x + next.width - clamped.width;
      if (edge.includes('n')) next.y = next.y + next.height - clamped.height;
      next.width = clamped.width;
      next.height = clamped.height;
      showBoxSnapGuides(guideX, guideY);
      return next;
    };

    const visibleGroups = getGroupsInGraph(groups, viewParentId);
    const data: NetworkBoxDatum[] = visibleGroups.map((group) => ({
      ...group,
      x: group.x ?? 0,
      y: group.y ?? 0,
      width: group.width ?? 320,
      height: group.height ?? 200,
      isSelected: selectedGroupIds.includes(group.id),
    }));

    const selection = networkBoxSelection
      .data(data, (d) => d.id)
      .join(
        (enter) => {
          const g = enter.append('g').attr('class', 'network-box');
          mountNetworkBoxStructure(g);

          g.on('click', (event, d) => {
            event.stopPropagation();
            if (storeRef.current.linkMode) {
              const { linkSourceId, linkSourceKind } = storeRef.current;
              if (!linkSourceId) {
                storeRef.current.setLinkSource(d.id, 'group');
                storeRef.current.setSelectedGroup(d.id);
                return;
              }
              if (linkSourceId === d.id && linkSourceKind === 'group') {
                storeRef.current.setLinkSource(null);
                return;
              }
              storeRef.current.stageEdgeConnect(
                linkSourceId,
                d.id,
                event.clientX,
                event.clientY,
                linkSourceKind,
                'group',
              );
              return;
            }
            if (event.shiftKey) {
              storeRef.current.toggleGroupSelection(d.id, true);
              return;
            }
            storeRef.current.setSelectedGroup(d.id);
          });

          const titleDrag = d3
            .drag<SVGRectElement, NetworkBoxDatum>()
            .filter((event) => {
              if (event.button !== 0) return false;
              return (event.detail ?? 1) < 2;
            })
            .container(function () {
              return graphRef.current.root?.node() ?? (this.parentNode as SVGGElement);
            })
            .on('start', (event, d) => {
              event.sourceEvent.stopPropagation();
              graphRef.current.simulation?.stop();
              const selectedGroupIds = storeRef.current.selectedGroupIds.includes(d.id)
                ? storeRef.current.selectedGroupIds
                : [d.id];
              if (selectedGroupIds.length + storeRef.current.selectedNodeIds.length > 1) {
                const selectedGroupSet = new Set(selectedGroupIds);
                const selectedNodeSet = new Set(storeRef.current.selectedNodeIds);
                const selectedGroupMemberIds = new Set<string>();
                for (const group of graphRef.current.networkBoxSelection?.data() ?? []) {
                  if (!selectedGroupSet.has(group.id)) continue;
                  group.node_ids.forEach((nodeId) => selectedGroupMemberIds.add(nodeId));
                }
                multiBoxDrag = {
                  startX: event.x,
                  startY: event.y,
                  groupOriginals: new Map(
                    (graphRef.current.networkBoxSelection?.data() ?? [])
                      .filter((group) => selectedGroupSet.has(group.id))
                      .map((group) => [group.id, { x: group.x, y: group.y }]),
                  ),
                  nodeOriginals: new Map(
                    graphRef.current.simNodes
                      .filter((node) => selectedNodeSet.has(node.id) || selectedGroupMemberIds.has(node.id))
                      .map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]),
                  ),
                };
                return;
              }
              boxInteractionRef.current = {
                id: d.id,
                type: 'move',
                startX: d.x,
                startY: d.y,
                visualX: d.x,
                visualY: d.y,
              };
            })
            .on('drag', function (event, d) {
              if (multiBoxDrag) {
                const dx = event.x - multiBoxDrag.startX;
                const dy = event.y - multiBoxDrag.startY;
                graphRef.current.networkBoxSelection?.each(function (group) {
                  const orig = multiBoxDrag?.groupOriginals.get(group.id);
                  if (!orig) return;
                  group.x = orig.x + dx;
                  group.y = orig.y + dy;
                  d3.select(this).attr('transform', networkBoxTransform(group, null));
                  syncBoxEndpoint(group, null);
                });
                for (const node of graphRef.current.simNodes) {
                  const orig = multiBoxDrag.nodeOriginals.get(node.id);
                  if (!orig) continue;
                  node.x = orig.x + dx;
                  node.y = orig.y + dy;
                  node.fx = node.x;
                  node.fy = node.y;
                }
                graphRef.current.refreshGraphGeometry?.();
                return;
              }
              const active = boxInteractionRef.current;
              if (!active || active.id !== d.id || active.type !== 'move') return;
              const snapped = snapBoxMove(
                {
                  x: active.visualX + event.dx,
                  y: active.visualY + event.dy,
                  width: d.width,
                  height: d.height,
                },
                new Set([d.id]),
              );
              const dx = snapped.x - active.visualX;
              const dy = snapped.y - active.visualY;
              active.visualX = snapped.x;
              active.visualY = snapped.y;
              syncBoxTransform(this.parentNode as SVGGElement, d, active);
              moveMemberNodes(d.node_ids, dx, dy);
            })
            .on('end', function (_event, d) {
              hideBoxSnapGuides();
              if (multiBoxDrag) {
                for (const groupId of multiBoxDrag.groupOriginals.keys()) {
                  const group = graphRef.current.networkBoxSelection?.data().find((item) => item.id === groupId);
                  if (group) {
                    storeRef.current.updateGroup(groupId, { x: group.x, y: group.y });
                  }
                }
                for (const nodeId of multiBoxDrag.nodeOriginals.keys()) {
                  const node = graphRef.current.simNodes.find((item) => item.id === nodeId);
                  if (node?.x != null && node.y != null) {
                    storeRef.current.updateNodePosition(node.id, node.x, node.y);
                    syncNodeGroupMembership(node.id, node.x, node.y);
                  }
                }
                multiBoxDrag = null;
                return;
              }
              const active = boxInteractionRef.current;
              if (!active || active.id !== d.id || active.type !== 'move') return;
              const dx = active.visualX - active.startX;
              const dy = active.visualY - active.startY;
              const groupEl = this.parentNode as SVGGElement;
              storeRef.current.commitGroupMove(d.id, dx, dy);
              boxInteractionRef.current = null;
              syncBoxTransform(groupEl, { ...d, x: active.visualX, y: active.visualY }, null);
            });

          const openBoxTitleEditor = (event: MouseEvent, d: NetworkBoxDatum) => {
            event.preventDefault();
            event.stopPropagation();
            const currentSvg = svgRef.current;
            const transform = currentSvg ? d3.zoomTransform(currentSvg) : d3.zoomIdentity;
            const left = transform.x + (d.x + 10) * transform.k;
            const top = transform.y + (d.y + NETWORK_BOX_TITLE_HEIGHT / 2) * transform.k;
            storeRef.current.setSelectedGroup(d.id);
            setContextMenu(null);
            setLabelEditor(null);
            setEdgeLabelEditor(null);
            setBoxTitleEditor({
              groupId: d.id,
              value: d.name,
              left: Math.max(12, left),
              top: Math.max(12, top),
              width: Math.min(340, Math.max(160, (d.width - 76) * transform.k)),
            });
          };

          g.select<SVGRectElement>('.box-title').call(titleDrag);
          g.select<SVGRectElement>('.box-body').on('dblclick', (event, d) => {
            if ((event.target as Element).closest('.box-edge-resize-hit')) return;
            event.preventDefault();
            event.stopPropagation();
            const rootNode = graphRef.current.root?.node();
            const [x, y] = rootNode
              ? d3.pointer(event, rootNode)
              : [d.x + d.width / 2, d.y + d.height / 2];
            onCreateRef.current({ x, y });
          });
          g.select<SVGRectElement>('.box-title').on('dblclick', openBoxTitleEditor);
          g.select<SVGTextElement>('.box-title-text')
            .on('pointerdown', (event) => event.stopPropagation())
            .on('mousedown', (event) => event.stopPropagation())
            .on('dblclick', openBoxTitleEditor);

          const resizeDrag = (edge: BoxResizeEdge) => d3
            .drag<SVGRectElement, NetworkBoxDatum>()
            .container(function () {
              return graphRef.current.root?.node() ?? (this.parentNode as SVGGElement);
            })
            .on('start', (event, d) => {
              event.sourceEvent.stopPropagation();
              graphRef.current.simulation?.stop();
              boxInteractionRef.current = {
                id: d.id,
                type: 'resize',
                edge,
                startX: d.x,
                startY: d.y,
                startWidth: d.width,
                startHeight: d.height,
                visualX: d.x,
                visualY: d.y,
                visualWidth: d.width,
                visualHeight: d.height,
                dw: 0,
                dh: 0,
              };
            })
            .on('drag', function (event, d) {
              const active = boxInteractionRef.current;
              if (!active || active.id !== d.id || active.type !== 'resize') return;
              active.dw += event.dx;
              active.dh += event.dy;
              const right = active.startX + active.startWidth;
              const bottom = active.startY + active.startHeight;
              let rect: BoxRect = {
                x: active.startX,
                y: active.startY,
                width: active.startWidth,
                height: active.startHeight,
              };
              if (edge.includes('e')) rect.width = active.startWidth + active.dw;
              if (edge.includes('s')) rect.height = active.startHeight + active.dh;
              if (edge.includes('w')) {
                rect.x = active.startX + active.dw;
                rect.width = right - rect.x;
              }
              if (edge.includes('n')) {
                rect.y = active.startY + active.dh;
                rect.height = bottom - rect.y;
              }
              rect = snapBoxResize(rect, edge, new Set([d.id]));
              active.visualX = rect.x;
              active.visualY = rect.y;
              active.visualWidth = rect.width;
              active.visualHeight = rect.height;
              syncBoxTransform(this.parentNode as SVGGElement, d, active);
              applyBoxVisual(this.parentNode as SVGGElement, d);
            })
            .on('end', (_event, d) => {
              hideBoxSnapGuides();
              const active = boxInteractionRef.current;
              if (!active || active.id !== d.id || active.type !== 'resize') return;
              storeRef.current.commitGroupResize(d.id, {
                x: active.visualX,
                y: active.visualY,
                width: active.visualWidth,
                height: active.visualHeight,
              });
              boxInteractionRef.current = null;
            });

          g.select<SVGRectElement>('.box-resize-handle').call(resizeDrag('se'));
          g.selectAll<SVGRectElement, NetworkBoxDatum>('.box-edge-resize-hit')
            .each(function () {
              const edge = d3.select(this).attr('data-edge') as BoxResizeEdge;
              d3.select<SVGRectElement, NetworkBoxDatum>(this).call(resizeDrag(edge));
            });
          g.select<SVGGElement>('.box-open-view')
            .on('pointerdown', (event) => {
              event.stopPropagation();
            })
            .on('mousedown', (event) => {
              event.stopPropagation();
            })
            .on('click', (event, d) => {
              event.preventDefault();
              event.stopPropagation();
              const viewId = d.active_view_id ?? d.views?.[0]?.id;
              if (!viewId) return;
              const url = boxViewUrl(d.id, viewId);
              if (event.ctrlKey || event.metaKey) {
                window.open(url, '_blank', 'noopener,noreferrer');
                return;
              }
              window.location.href = url;
            });
          g.select<SVGGElement>('.box-view-switch')
            .on('pointerdown', (event) => {
              event.stopPropagation();
            })
            .on('mousedown', (event) => {
              event.stopPropagation();
            })
            .on('click', (event, d) => {
              event.preventDefault();
              event.stopPropagation();
              const activeView = d.views?.find((view) => view.id === d.active_view_id);
              const nextType = activeView?.type === 'list' ? 'graph' : 'list';
              const nextView = nextType === 'list'
                ? d.views?.find((view) => view.id === NODE_INTERFACE_LIST_VIEW_ID)
                : d.views?.find((view) => view.type === nextType);
              if (!nextView) return;
              storeRef.current.setActiveGroupView(d.id, nextView.id);
            });
          return g;
        },
        (update) => update,
        (exit) => exit.remove(),
      );

    graphRef.current.networkBoxSelection = selection;
    graphRef.current.runtimeGroupById = new Map(selection.data().map((group) => [group.id, group]));
    graphRef.current.runtimeGroupMemberIds = new Map(
      selection.data().map((group) => [group.id, new Set(group.node_ids)]),
    );

    selection.selectAll<SVGRectElement, NetworkBoxDatum>('.box-port')
      .datum(function () {
        return d3.select((this as SVGRectElement).parentNode as SVGGElement).datum() as NetworkBoxDatum;
      })
      .style('pointer-events', 'all')
      .style('cursor', 'crosshair')
      .on('pointerdown', (event) => {
        event.stopPropagation();
      })
      .on('mousedown', function (event, d) {
        const port = d3.select<SVGRectElement, NetworkBoxDatum>(this);
        const x = Number(port.attr('x'));
        const width = Number(port.attr('width'));
        const y = Number(port.attr('y'));
        const height = Number(port.attr('height'));
        graphRef.current.beginWireFromEndpoint?.(event as MouseEvent, d.id, 'group', {
          lx: x + width / 2,
          ly: y + height / 2,
        });
      });

    selection.select<SVGGElement>('.box-open-view')
      .datum(function () {
        return d3.select((this as SVGGElement).parentNode as SVGGElement).datum() as NetworkBoxDatum;
      })
      .on('pointerdown', (event) => {
        event.stopPropagation();
      })
      .on('mousedown', (event) => {
        event.stopPropagation();
      })
      .on('click', (event, d) => {
        event.preventDefault();
        event.stopPropagation();
        const viewId = d.active_view_id ?? d.views?.[0]?.id;
        if (!viewId) return;
        const url = boxViewUrl(d.id, viewId);
        if (event.ctrlKey || event.metaKey) {
          window.open(url, '_blank', 'noopener,noreferrer');
          return;
        }
        window.location.href = url;
      });

    selection.select<SVGGElement>('.box-view-switch')
      .datum(function () {
        return d3.select((this as SVGGElement).parentNode as SVGGElement).datum() as NetworkBoxDatum;
      })
      .on('pointerdown', (event) => {
        event.stopPropagation();
      })
      .on('mousedown', (event) => {
        event.stopPropagation();
      })
      .on('click', (event, d) => {
        event.preventDefault();
        event.stopPropagation();
        const activeView = d.views?.find((view) => view.id === d.active_view_id);
        const nextType = activeView?.type === 'list' ? 'graph' : 'list';
        const nextView = nextType === 'list'
          ? d.views?.find((view) => view.id === NODE_INTERFACE_LIST_VIEW_ID)
          : d.views?.find((view) => view.type === nextType);
        if (!nextView) return;
        storeRef.current.setActiveGroupView(d.id, nextView.id);
      });

    selection.each(function (d) {
      const el = this as SVGGElement;
      applyBoxVisual(el, d);
      if (activeInteraction?.id === d.id) {
        syncBoxTransform(el, d, activeInteraction);
        return;
      }
      syncBoxTransform(el, d, null);
    });
  }, [groups, viewParentId, selectedGroupId, selectedGroupIds, layoutSignature, selectedEdgeId]);

  useEffect(() => {
    const { nodeSelection, linkSelection, linkSymbolSelection, simNodes } = graphRef.current;
    if (!nodeSelection || !linkSelection) return;

    for (const n of simNodes) {
      const source = visibleNodeById.get(n.id);
      if (source) {
        n.label = source.label;
        n.status = source.status;
      }
      n.isSelected = selectedNodeIdSet.has(n.id) || selectedGroupMemberIds.has(n.id);
      n.isLinkSource = linkSourceId === n.id;
      const isFocus = activeFocusNodeIds.has(n.id);
      n.isFocus = isFocus;
      n.isNeighbor = focusNeighborIds.has(n.id) && !isFocus;
      n.radius = nodeRadius(n.isFocus, n.isNeighbor);
    }

    const linkId = (end: SimNode | string | number | undefined) => {
      if (typeof end === 'string') return end;
      if (typeof end === 'number') return String(end);
      return end?.id ?? '';
    };

    const linkData = linkSelection.data();
    linkData.forEach((l) => {
      l.isSelected = selectedEdgeId === l.id;
      l.isHighlighted =
        activeFocusNodeIds.has(linkId(l.source)) ||
        activeFocusNodeIds.has(linkId(l.target));
    });

    applyNodeVisual(nodeSelection);
    applyLinkVisual(linkSelection);
    if (linkSymbolSelection) {
      applyLinkMidDecoration(linkSymbolSelection, linkLabelMode);
    }
    graphRef.current.refreshLinkGeometry?.();
  }, [
    selectedNodeIdSet,
    selectedGroupMemberIds,
    selectedEdgeId,
    linkSourceId,
    activeFocusNodeIds,
    focusNeighborIds,
    buildSimLinks,
    visibleNodeById,
    edgeLabelMode,
    linkLabelMode,
  ]);

  useEffect(() => {
    const { linkSymbolSelection } = graphRef.current;
    if (!linkSymbolSelection) return;

    linkSymbolSelection.each(function (d) {
      appendLinkMidDecoration(d3.select(this), d, linkLabelMode);
    });
    applyLinkMidDecoration(linkSymbolSelection, linkLabelMode);
    updateLinkMidPositions(linkSymbolSelection);
  }, [linkLabelMode, buildSimLinks]);

  useEffect(() => {
    const { nodeSelection, simNodes } = graphRef.current;
    if (!nodeSelection || simNodes.length === 0) return;

    for (const sim of simNodes) {
      const source = visibleNodeById.get(sim.id);
      if (source) {
        sim.label = source.label;
        sim.status = source.status;
        if (sim.viewMode !== 'list' && source.x != null && source.y != null) {
          sim.x = source.x;
          sim.y = source.y;
          sim.fx = source.x;
          sim.fy = source.y;
        }
      }
      sim.accentColor = focusNodeColorById.get(sim.id);
    }
    applyNodeVisual(nodeSelection);
    graphRef.current.refreshGraphGeometry?.();
  }, [visibleNodeById, focusNodeColorById]);

  const linkHint = pendingEdgeConnect
    ? '选择关系类型以完成连接'
    : linkMode
      ? linkSourceId
        ? '连线中：点击目标节点'
        : '连线模式：点击起始节点或 Box'
      : null;

  const pendingSource = pendingEdgeConnect
    ? (pendingEdgeConnect.source_kind ?? 'node') === 'group'
      ? visibleGroups.find((group) => group.id === pendingEdgeConnect.source)
      : nodes.find((n) => n.id === pendingEdgeConnect.source)
    : undefined;
  const pendingTarget = pendingEdgeConnect
    ? (pendingEdgeConnect.target_kind ?? 'node') === 'group'
      ? visibleGroups.find((group) => group.id === pendingEdgeConnect.target)
      : nodes.find((n) => n.id === pendingEdgeConnect.target)
    : undefined;
  const pendingSourceLabel = pendingSource && 'name' in pendingSource
    ? pendingSource.name
    : pendingSource?.label;
  const pendingTargetLabel = pendingTarget && 'name' in pendingTarget
    ? pendingTarget.name
    : pendingTarget?.label;

  const focusGraphNodes = useCallback((nodeIds: string[]) => {
    const svg = svgRef.current;
    const zoom = zoomRef.current;
    const container = containerRef.current;
    if (!svg || !zoom || !container) return false;
    const selected = graphRef.current.simNodes.filter((node) => nodeIds.includes(node.id));
    if (selected.length === 0) return false;

    const extents = selected.map((node) => {
      if (node.viewMode === 'list') {
        const halfWidth = (node.listCardWidth ?? 220) / 2 + 24;
        const halfHeight = (node.listCardHeight ?? 34) / 2 + 24;
        return {
          minX: (node.x ?? 0) - halfWidth,
          maxX: (node.x ?? 0) + halfWidth,
          minY: (node.y ?? 0) - halfHeight,
          maxY: (node.y ?? 0) + halfHeight,
        };
      }
      const radius = Math.max(48, node.radius + 36);
      return {
        minX: (node.x ?? 0) - radius,
        maxX: (node.x ?? 0) + radius,
        minY: (node.y ?? 0) - radius,
        maxY: (node.y ?? 0) + radius,
      };
    });

    const minX = Math.min(...extents.map((item) => item.minX));
    const maxX = Math.max(...extents.map((item) => item.maxX));
    const minY = Math.min(...extents.map((item) => item.minY));
    const maxY = Math.max(...extents.map((item) => item.maxY));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const boundsWidth = Math.max(1, maxX - minX);
    const boundsHeight = Math.max(1, maxY - minY);
    const padding = 96;
    const fitScale = Math.min(
      (container.clientWidth - padding) / boundsWidth,
      (container.clientHeight - padding) / boundsHeight,
    );
    const currentScale = d3.zoomTransform(svg).k;
    const scale = selected.length === 1
      ? Math.max(1.15, Math.min(1.8, currentScale))
      : Math.max(0.35, Math.min(1.8, fitScale));
    const transform = d3.zoomIdentity
      .translate(container.clientWidth / 2 - centerX * scale, container.clientHeight / 2 - centerY * scale)
      .scale(scale);

    d3.select(svg).transition().duration(260).call(zoom.transform, transform);
    return true;
  }, []);

  useEffect(() => {
    if (!pendingFocusNodeId) return;
    const frame = window.requestAnimationFrame(() => {
      if (focusGraphNodes([pendingFocusNodeId])) {
        setPendingFocusNodeId(null);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [buildSimNodes, focusGraphNodes, pendingFocusNodeId, viewParentId]);

  const shortcutPromptTarget = shortcutReturnPrompt
    ? nodes.find((node) => node.id === shortcutReturnPrompt.targetNodeId)
    : undefined;
  const shortcutPromptSource = shortcutReturnPrompt
    ? nodes.find((node) => node.id === shortcutReturnPrompt.shortcutNodeId)
    : undefined;

  const handleReturnToShortcut = () => {
    const sourceId = shortcutReturnPrompt?.shortcutNodeId ?? null;
    if (returnToShortcutSource() && sourceId) {
      setPendingFocusNodeId(sourceId);
    }
  };

  const handleZoom = (factor: number) => {
    const svg = svgRef.current;
    const zoom = zoomRef.current;
    if (!svg || !zoom) return;
    d3.select(svg).transition().duration(250).call(zoom.scaleBy, factor);
  };

  const handleResetView = () => {
    const svg = svgRef.current;
    const zoom = zoomRef.current;
    const container = containerRef.current;
    if (!svg || !zoom || !container) return;
    const transform = d3.zoomIdentity
      .translate(container.clientWidth / 2, container.clientHeight / 2)
      .scale(0.95);
    d3.select(svg).transition().duration(400).call(zoom.transform, transform);
  };

  const togglePerformanceMode = () => setPerformanceMode((enabled) => !enabled);

  return (
    <div
      ref={containerRef}
      className={`mind-graph relative h-full w-full overflow-hidden${globalTextMode ? ' global-text-mode' : ''}${performanceMode ? ' performance-mode' : ''}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(30,41,59,0.35),transparent_65%)]" />

      <GraphLegend />

      <svg ref={svgRef} className="h-full w-full" />

      <AiNodeGroupPreview transform={reactZoomTransform} />

      {boxSelectUi && (
        <div
          className="pointer-events-none absolute z-20 border-2 border-dashed border-blue-400 bg-blue-400/20"
          style={{
            left: boxSelectUi.x,
            top: boxSelectUi.y,
            width: boxSelectUi.width,
            height: boxSelectUi.height,
          }}
        />
      )}

      {contextMenu && (
        <GraphContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {pendingEdgeConnect && pendingSourceLabel && pendingTargetLabel && (
        <EdgeTypePicker
          x={pendingEdgeConnect.x}
          y={pendingEdgeConnect.y}
          sourceLabel={pendingSourceLabel}
          targetLabel={pendingTargetLabel}
          onSelect={confirmPendingEdge}
          onCancel={cancelPendingEdge}
        />
      )}

      {labelEditor && (
        <input
          ref={labelInputRef}
          value={labelEditor.value}
          onChange={(event) =>
            setLabelEditor((current) =>
              current ? { ...current, value: event.target.value } : current,
            )
          }
          onBlur={commitLabelEdit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitLabelEdit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setLabelEditor(null);
            }
          }}
          className="absolute z-30 rounded-lg border border-blue-400/60 bg-slate-950/95 px-2.5 py-1.5 text-sm font-medium text-white shadow-xl shadow-black/30 outline-none ring-2 ring-blue-500/20"
          style={{
            left: labelEditor.left,
            top: labelEditor.top,
            width: labelEditor.width,
            transform: 'translateY(-50%)',
          }}
          aria-label="编辑节点名称"
        />
      )}

      {edgeLabelEditor && (
        <input
          ref={edgeLabelInputRef}
          value={edgeLabelEditor.value}
          onChange={(event) =>
            setEdgeLabelEditor((current) =>
              current ? { ...current, value: event.target.value } : current,
            )
          }
          onBlur={commitEdgeLabelEdit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitEdgeLabelEdit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setEdgeLabelEditor(null);
            }
          }}
          className="absolute z-30 rounded-md border border-amber-400/60 bg-slate-950/95 px-2 py-1 text-xs font-semibold text-white shadow-xl shadow-black/30 outline-none ring-2 ring-amber-500/20"
          style={{
            left: edgeLabelEditor.left,
            top: edgeLabelEditor.top,
            width: edgeLabelEditor.width,
            transform: 'translateY(-50%)',
          }}
          aria-label="编辑连线文字"
        />
      )}

      {boxTitleEditor && (
        <input
          ref={boxTitleInputRef}
          value={boxTitleEditor.value}
          onChange={(event) =>
            setBoxTitleEditor((current) =>
              current ? { ...current, value: event.target.value } : current,
            )
          }
          onBlur={commitBoxTitleEdit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitBoxTitleEdit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setBoxTitleEditor(null);
            }
          }}
          className="absolute z-30 rounded-md border border-blue-400/60 bg-slate-950/95 px-2 py-1 text-xs font-semibold text-white shadow-xl shadow-black/30 outline-none ring-2 ring-blue-500/20"
          style={{
            left: boxTitleEditor.left,
            top: boxTitleEditor.top,
            width: boxTitleEditor.width,
            transform: 'translateY(-50%)',
          }}
          aria-label="编辑 Box 名称"
        />
      )}

      {shortcutNotice && (
        <div className="pointer-events-none absolute left-1/2 top-5 z-30 -translate-x-1/2 rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-100 shadow-xl shadow-black/30">
          {shortcutNotice}
        </div>
      )}

      {shortcutReturnPrompt && (
        <div className="absolute left-1/2 top-4 z-50 w-[min(92vw,520px)] -translate-x-1/2">
          <div className="rounded-xl border border-white/10 bg-slate-900/95 p-4 shadow-2xl shadow-black/35">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">快捷方式跳转</div>
                <h3 className="mt-1 text-base font-semibold text-white">已跳转到原节点</h3>
              </div>
              <button
                type="button"
                onClick={dismissShortcutReturnPrompt}
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white"
                aria-label="关闭返回提示"
              >
                ×
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              当前已定位到
              <span className="mx-1 font-medium text-sky-200">
                {shortcutPromptTarget?.label ?? '原节点'}
              </span>
              ，是否返回刚才的快捷方式
              <span className="mx-1 font-medium text-slate-100">
                {shortcutPromptSource?.label ?? '节点'}
              </span>
              ？
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleReturnToShortcut}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                返回快捷方式
              </button>
              <button
                type="button"
                onClick={dismissShortcutReturnPrompt}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
              >
                留在原节点
              </button>
            </div>
          </div>
        </div>
      )}

      {visibleNodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-white/10 bg-slate-900/80 px-6 py-4 text-center text-sm text-slate-400 backdrop-blur">
            <p>{viewParentId ? '此子图暂无节点' : '暂无思维节点'}</p>
            <p className="mt-1 text-xs text-slate-500">双击空白创建节点</p>
          </div>
        </div>
      )}

      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={toggleGlobalTextMode}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            globalTextMode
              ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
              : 'border-white/10 bg-slate-900/90 text-slate-300 hover:bg-slate-800'
          }`}
          title={globalTextMode ? '节点文字常驻显示' : '开启后常驻显示节点名称与类型'}
        >
          {globalTextMode ? '文字常驻' : '节点文字'}
        </button>
        <button
          type="button"
          onClick={toggleEdgeLabelMode}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            edgeLabelMode
              ? 'border-violet-400/40 bg-violet-500/20 text-violet-200'
              : 'border-white/10 bg-slate-900/90 text-slate-300 hover:bg-slate-800'
          }`}
          title={
            edgeLabelMode
              ? '连线中点显示关系文字'
              : '连线中点显示关系图标'
          }
        >
          {edgeLabelMode ? '文字模式' : '图标模式'}
        </button>
        <button
          type="button"
          onClick={togglePerformanceMode}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            performanceMode
              ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-100'
              : 'border-white/10 bg-slate-900/90 text-slate-300 hover:bg-slate-800'
          }`}
          title={
            performanceMode
              ? '性能模式：导航时会淡出连线与文字'
              : '开启后 pan/scroll 时临时弱化重图层'
          }
        >
          {performanceMode ? '性能开' : '性能关'}
        </button>
        <button
          type="button"
          onClick={toggleLinkMode}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            linkMode
              ? 'border-amber-400/40 bg-amber-500/20 text-amber-200'
              : 'border-white/10 bg-slate-900/90 text-slate-300 hover:bg-slate-800'
          }`}
        >
          {linkMode ? '取消连线' : '连线'}
        </button>
        <button
          type="button"
          onClick={() =>
            onOpenCreateNode(createPointer ? { x: createPointer.x, y: createPointer.y } : undefined)
          }
          className="rounded-lg border border-blue-500/30 bg-blue-600/90 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          + 节点
        </button>
        <button
          type="button"
          onClick={() => handleZoom(1.2)}
          className="rounded-lg border border-white/10 bg-slate-900/90 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => handleZoom(1 / 1.2)}
          className="rounded-lg border border-white/10 bg-slate-900/90 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
        >
          −
        </button>
        <button
          type="button"
          onClick={handleResetView}
          className="rounded-lg border border-white/10 bg-slate-900/90 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          重置
        </button>
      </div>

      <div className="absolute bottom-4 left-4 z-10 max-w-md rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-xs text-slate-400 backdrop-blur">
        {linkHint ? (
          <span className="text-amber-300">{linkHint}</span>
        ) : (
          <>
            空白拖拽框选 · Shift 追加 · Ctrl 移除 · Alt 平移 · {Math.round(zoomLevel * 100)}%
          </>
        )}
      </div>
    </div>
  );
}
