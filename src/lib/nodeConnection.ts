import type { EdgeType, MindNode } from '../types';

export interface NewNodeConnectionDraft {
  edgeType: EdgeType;
  source: 'new-node' | 'connected-node';
  target: 'new-node' | 'connected-node';
}

export function getDefaultNewNodeConnection(
  connectedNode?: Pick<MindNode, 'type'> | null,
): NewNodeConnectionDraft {
  if (connectedNode?.type === 'project') {
    return {
      edgeType: 'part_of',
      source: 'new-node',
      target: 'connected-node',
    };
  }

  return {
    edgeType: 'relates_to',
    source: 'connected-node',
    target: 'new-node',
  };
}

export function resolveNewNodeConnection(
  connectedNodeId: string,
  newNodeId: string,
  connectedNode: Pick<MindNode, 'type'> | null | undefined,
  edgeType?: EdgeType,
) {
  const draft = getDefaultNewNodeConnection(connectedNode);
  const type = edgeType ?? draft.edgeType;
  const source = type === 'part_of' ? newNodeId : connectedNodeId;
  const target = type === 'part_of' ? connectedNodeId : newNodeId;

  return { source, target, type };
}
