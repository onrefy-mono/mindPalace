import {
  EDGE_TYPE_LABELS,
  NODE_TYPE_META,
  type EdgeType,
  type MindEdge,
  type MindNode,
  type NodeGroup,
} from '../../types';

interface AiNodeSummary {
  id: string;
  label: string;
  type: string;
  typeLabel: string;
  layer: string;
  content?: string;
  tags: string[];
  status?: string;
}

interface AiGroupSummary {
  id: string;
  name: string;
  nodeIds: string[];
}

interface AiEdgeSummary {
  id: string;
  type: EdgeType;
  typeLabel: string;
  label?: string;
  source: AiNodeSummary;
  target: AiNodeSummary;
}

export interface AiSelectionContext {
  selection: {
    nodes: AiNodeSummary[];
    groups: AiGroupSummary[];
  };
  internalEdges: AiEdgeSummary[];
  externalEdges: {
    incoming: AiEdgeSummary[];
    outgoing: AiEdgeSummary[];
  };
  nearbyNodes: AiNodeSummary[];
  graphScope: {
    viewParentId: string | null;
    selectedNodeCount: number;
    selectedGroupCount: number;
  };
}

const MAX_EXTERNAL_EDGES = 12;
const MAX_NEARBY_NODES = 16;

function summarizeNode(node: MindNode): AiNodeSummary {
  return {
    id: node.id,
    label: node.label,
    type: node.type,
    typeLabel: NODE_TYPE_META[node.type].label,
    layer: node.layer,
    content: node.content,
    tags: node.tags,
    status: node.status,
  };
}

function summarizeGroup(group: NodeGroup): AiGroupSummary {
  return {
    id: group.id,
    name: group.name,
    nodeIds: group.node_ids,
  };
}

function summarizeEdge(edge: MindEdge, nodeById: Map<string, MindNode>): AiEdgeSummary | null {
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  if (!source || !target) return null;
  return {
    id: edge.id,
    type: edge.type,
    typeLabel: EDGE_TYPE_LABELS[edge.type],
    label: edge.label,
    source: summarizeNode(source),
    target: summarizeNode(target),
  };
}

export function buildAiSelectionContext(input: {
  nodes: MindNode[];
  edges: MindEdge[];
  groups: NodeGroup[];
  selectedNodeIds: string[];
  selectedGroupIds: string[];
  viewParentId: string | null;
}): AiSelectionContext {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  const selectedIds = new Set(input.selectedNodeIds);

  for (const groupId of input.selectedGroupIds) {
    const group = groupById.get(groupId);
    for (const nodeId of group?.node_ids ?? []) {
      selectedIds.add(nodeId);
    }
  }

  const selectedNodes = [...selectedIds]
    .map((id) => nodeById.get(id))
    .filter((node): node is MindNode => Boolean(node));

  const selectedGroups = input.selectedGroupIds
    .map((id) => groupById.get(id))
    .filter((group): group is NodeGroup => Boolean(group));

  const internalEdges: AiEdgeSummary[] = [];
  const incoming: AiEdgeSummary[] = [];
  const outgoing: AiEdgeSummary[] = [];
  const nearbyIds = new Set<string>();

  for (const edge of input.edges) {
    const sourceSelected = selectedIds.has(edge.source);
    const targetSelected = selectedIds.has(edge.target);
    if (!sourceSelected && !targetSelected) continue;

    const summary = summarizeEdge(edge, nodeById);
    if (!summary) continue;

    if (sourceSelected && targetSelected) {
      internalEdges.push(summary);
      continue;
    }

    if (targetSelected) {
      incoming.push(summary);
      nearbyIds.add(edge.source);
    }
    if (sourceSelected) {
      outgoing.push(summary);
      nearbyIds.add(edge.target);
    }
  }

  const nearbyNodes = [...nearbyIds]
    .filter((id) => !selectedIds.has(id))
    .slice(0, MAX_NEARBY_NODES)
    .map((id) => nodeById.get(id))
    .filter((node): node is MindNode => Boolean(node))
    .map(summarizeNode);

  return {
    selection: {
      nodes: selectedNodes.map(summarizeNode),
      groups: selectedGroups.map(summarizeGroup),
    },
    internalEdges,
    externalEdges: {
      incoming: incoming.slice(0, MAX_EXTERNAL_EDGES),
      outgoing: outgoing.slice(0, MAX_EXTERNAL_EDGES),
    },
    nearbyNodes,
    graphScope: {
      viewParentId: input.viewParentId,
      selectedNodeCount: selectedNodes.length,
      selectedGroupCount: selectedGroups.length,
    },
  };
}
