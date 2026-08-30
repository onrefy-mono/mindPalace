export type Domain = 'research' | 'work' | 'personal';
export type FocusStatus = 'active' | 'paused' | 'done';
export type NodeStatus = 'active' | 'done';
export type NodeType =
  | 'concept'
  | 'question'
  | 'decision'
  | 'goal'
  | 'project'
  | 'task'
  | 'person'
  | 'insight'
  | 'event'
  | 'experience';
export type NodeShape =
  | 'circle'
  | 'triangle'
  | 'diamond'
  | 'rounded-rect'
  | 'hexagon'
  | 'star'
  | 'ellipse';
export type MemoryLayer = 'semantic' | 'episodic';
export type EdgeType =
  | 'relates_to'
  | 'part_of'
  | 'blocks'
  | 'depends_on'
  | 'inspired_by';
export type EdgeEndpointKind = 'node' | 'group';

export interface FocusItem {
  id: string;
  title: string;
  domain: Domain;
  status: FocusStatus;
  color: string;
  sort_order: number;
  note?: string;
  linked_node_ids: string[];
  created_at: string;
}

export interface MindNode {
  id: string;
  label: string;
  type: NodeType;
  layer: MemoryLayer;
  parent_id: string | null;
  shortcut_target_id?: string;
  content?: string;
  tags: string[];
  status?: NodeStatus;
  x?: number;
  y?: number;
  created_at: string;
  updated_at: string;
}

export interface MindEdge {
  id: string;
  source: string;
  target: string;
  source_kind?: EdgeEndpointKind;
  target_kind?: EdgeEndpointKind;
  type: EdgeType;
  label?: string;
  /** 连线文字沿可见连线路径的位置，范围 0..1，默认 0.5 */
  label_position?: number;
  weight: number;
  hidden?: boolean;
  derived_from_group_id?: string;
  derived_from_edge_id?: string;
}

export type BoxViewType = 'graph' | 'list' | 'table' | 'board';

export interface BoxView {
  id: string;
  name: string;
  type: BoxViewType;
  node_order?: string[];
  created_at: string;
}

export interface NodeGroup {
  id: string;
  name: string;
  color: string;
  node_ids: string[];
  views?: BoxView[];
  active_view_id?: string;
  /** 与节点 parent_id 对齐，表示 Box 所在子图层级 */
  parent_id?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  created_at: string;
}

export interface MindPalaceData {
  focus: FocusItem[];
  nodes: MindNode[];
  edges: MindEdge[];
  groups?: NodeGroup[];
}

export interface CreateNodeContext {
  connectToId?: string | null;
  connectEdgeType?: EdgeType;
  x?: number;
  y?: number;
}

/** 从图谱拖入节点组时的 DataTransfer MIME */
export const NODE_DRAG_MIME = 'application/x-mindpalace-nodes';

export const DOMAIN_LABELS: Record<Domain, string> = {
  research: '研究',
  work: '工作',
  personal: '个人',
};

export const DOMAIN_COLORS: Record<Domain, string> = {
  research: '#3b82f6',
  work: '#22c55e',
  personal: '#a855f7',
};

export function focusColor(item: Pick<FocusItem, 'color' | 'domain'>): string {
  return item.color || DOMAIN_COLORS[item.domain];
}

export interface NodeTypeMeta {
  label: string;
  psychology: string;
  memory: string;
  shape: NodeShape;
}

export const NODE_TYPE_META: Record<NodeType, NodeTypeMeta> = {
  concept: {
    label: '概念',
    psychology: '语义记忆',
    memory: '稳定知识与定义',
    shape: 'circle',
  },
  question: {
    label: '问题',
    psychology: '认知缺口',
    memory: '待探索的未知',
    shape: 'triangle',
  },
  decision: {
    label: '决策',
    psychology: '执行功能',
    memory: '判断与选择',
    shape: 'diamond',
  },
  goal: {
    label: '目标',
    psychology: '目标导向',
    memory: '想达成的结果与方向',
    shape: 'ellipse',
  },
  project: {
    label: '项目',
    psychology: '执行组织',
    memory: '里程碑与拆解，可进入子图',
    shape: 'rounded-rect',
  },
  task: {
    label: '任务',
    psychology: '执行意图',
    memory: '一项具体可执行的工作',
    shape: 'triangle',
  },
  person: {
    label: '人物',
    psychology: '社会认知',
    memory: '协作与关系',
    shape: 'hexagon',
  },
  insight: {
    label: '洞察',
    psychology: '整合顿悟',
    memory: '跨域联结的发现',
    shape: 'star',
  },
  event: {
    label: '事件',
    psychology: '情节节点',
    memory: '发生过或即将发生的时间点',
    shape: 'diamond',
  },
  experience: {
    label: '经验',
    psychology: '情节记忆',
    memory: '亲身经历与事件',
    shape: 'ellipse',
  },
};

export const NODE_TYPES = Object.keys(NODE_TYPE_META) as NodeType[];

export const NODE_TYPE_LABELS: Record<NodeType, string> = Object.fromEntries(
  NODE_TYPES.map((t) => [t, NODE_TYPE_META[t].label]),
) as Record<NodeType, string>;

export const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  relates_to: '相关',
  part_of: '属于',
  blocks: '阻塞',
  depends_on: '依赖',
  inspired_by: '启发',
};

/** 连线颜色（按关系类型） */
export const EDGE_TYPE_COLORS: Record<EdgeType, string> = {
  relates_to: '#94a3b8',
  part_of: '#22c55e',
  blocks: '#ef4444',
  depends_on: '#f59e0b',
  inspired_by: '#a855f7',
};

export const EDGE_TYPES = Object.keys(EDGE_TYPE_LABELS) as EdgeType[];

export function edgeTypeHasDirection(type: EdgeType): boolean {
  return type !== 'relates_to';
}

export const GROUP_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
] as const;

export function nodeLayerForType(type: NodeType): MemoryLayer {
  return type === 'experience' || type === 'event' ? 'episodic' : 'semantic';
}
