import { EDGE_TYPES, NODE_TYPES, type EdgeType, type MindEdge, type MindNode, type NodeType } from '../../types';
import type { AiMessage } from './client';

export interface AiGeneratedNodeDraft {
  tempId: string;
  label: string;
  type: NodeType;
  content?: string;
  tags?: string[];
}

export interface AiGeneratedEdgeDraft {
  sourceTempId: string | 'connected';
  targetTempId: string | 'connected';
  type: EdgeType;
  label?: string;
}

export interface AiGeneratedNodeGroupDraft {
  boxName: string;
  nodes: AiGeneratedNodeDraft[];
  edges: AiGeneratedEdgeDraft[];
}

export interface AiNodeGroupContext {
  connectedNode: Pick<MindNode, 'id' | 'label' | 'type' | 'content' | 'tags' | 'status'>;
  nearbyNodes: Array<Pick<MindNode, 'id' | 'label' | 'type' | 'content' | 'tags' | 'status'>>;
  edges: Array<Pick<MindEdge, 'id' | 'source' | 'target' | 'type' | 'label'>>;
  viewParentId: string | null;
}

const SYSTEM_PROMPT = [
  '你是 Mind Palace 的图谱结构助手。',
  '用户会给你一个已连接节点，以及它的一跳邻居和关系。',
  '请生成一组适合放进一个新 Network Box 的候选节点和关系。',
  '只基于输入内容推断，不要编造具体事实；不确定时用问题节点表达。',
  '必须只输出 JSON，不要输出 Markdown，不要输出解释文字。',
].join('\n');

export function buildNodeGroupDraftMessages(context: AiNodeGroupContext): AiMessage[] {
  return [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: [
        '请生成一套节点组草案。',
        'JSON 结构必须是：',
        '{',
        '  "boxName": "节点组名称",',
        '  "nodes": [',
        '    { "tempId": "n1", "label": "节点名称", "type": "concept|question|decision|goal|project|task|person|insight|event|experience", "content": "可选说明", "tags": ["可选标签"] }',
        '  ],',
        '  "edges": [',
        '    { "sourceTempId": "connected|n1", "targetTempId": "connected|n2", "type": "relates_to|part_of|blocks|depends_on|inspired_by", "label": "可选关系说明" }',
        '  ]',
        '}',
        '',
        '约束：',
        '- 生成 3-6 个节点。',
        '- tempId 必须唯一，使用 n1、n2、n3 这样的短 ID。',
        '- edges 只能引用 "connected" 或 nodes 里的 tempId。',
        '- 至少让 connected 连接到最核心的第一个生成节点。',
        '- 如果上下文不足，优先生成 question/task/insight 节点。',
        '',
        '上下文：',
        JSON.stringify(context, null, 2),
      ].join('\n'),
    },
  ];
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('AI 没有返回可解析的 JSON');
  }
}

function cleanNodeType(value: unknown): NodeType {
  return typeof value === 'string' && NODE_TYPES.includes(value as NodeType)
    ? value as NodeType
    : 'concept';
}

function cleanEdgeType(value: unknown): EdgeType {
  return typeof value === 'string' && EDGE_TYPES.includes(value as EdgeType)
    ? value as EdgeType
    : 'relates_to';
}

function cleanEndpoint(value: unknown): string | 'connected' | null {
  if (value === 'connected') return 'connected';
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

export function parseNodeGroupDraft(text: string): AiGeneratedNodeGroupDraft {
  const raw = extractJsonObject(text) as {
    boxName?: unknown;
    nodes?: unknown;
    edges?: unknown;
  };
  const usedIds = new Set<string>();
  const nodes: AiGeneratedNodeDraft[] = [];
  (Array.isArray(raw.nodes) ? raw.nodes : []).forEach((item, index) => {
    const node = item as Record<string, unknown>;
    const label = typeof node.label === 'string' ? node.label.trim() : '';
    if (!label) return;
    const proposedId = typeof node.tempId === 'string' && node.tempId.trim()
      ? node.tempId.trim()
      : `n${index + 1}`;
    const tempId = usedIds.has(proposedId) ? `n${index + 1}` : proposedId;
    usedIds.add(tempId);
    const content = typeof node.content === 'string' && node.content.trim()
      ? node.content.trim()
      : undefined;
    const tags = Array.isArray(node.tags)
      ? node.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())).map((tag) => tag.trim())
      : undefined;
    nodes.push({
      tempId,
      label,
      type: cleanNodeType(node.type),
      content,
      tags,
    });
  });

  if (nodes.length === 0) {
    throw new Error('AI 没有生成可用节点');
  }

  const validEndpointIds = new Set(nodes.map((node) => node.tempId));
  const edges: AiGeneratedEdgeDraft[] = [];
  (Array.isArray(raw.edges) ? raw.edges : []).forEach((item) => {
    const edge = item as Record<string, unknown>;
    const sourceTempId = cleanEndpoint(edge.sourceTempId);
    const targetTempId = cleanEndpoint(edge.targetTempId);
    if (!sourceTempId || !targetTempId || sourceTempId === targetTempId) return;
    if (sourceTempId !== 'connected' && !validEndpointIds.has(sourceTempId)) return;
    if (targetTempId !== 'connected' && !validEndpointIds.has(targetTempId)) return;
    const label = typeof edge.label === 'string' && edge.label.trim() ? edge.label.trim() : undefined;
    edges.push({
      sourceTempId,
      targetTempId,
      type: cleanEdgeType(edge.type),
      label,
    });
  });

  if (!edges.some((edge) => edge.sourceTempId === 'connected' || edge.targetTempId === 'connected')) {
    edges.unshift({
      sourceTempId: 'connected',
      targetTempId: nodes[0].tempId,
      type: 'relates_to',
    });
  }

  const boxName = typeof raw.boxName === 'string' && raw.boxName.trim()
    ? raw.boxName.trim()
    : 'AI 生成节点组';

  return { boxName, nodes, edges };
}
