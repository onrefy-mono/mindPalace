import * as d3 from 'd3';
import type { EdgeType, NodeStatus, NodeType } from '../types';
import { EDGE_TYPE_COLORS, EDGE_TYPE_LABELS, NODE_TYPE_META, edgeTypeHasDirection } from '../types';
import { NETWORK_BOX_TITLE_HEIGHT } from './networkBox';

export interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  nodeType: NodeType;
  status?: NodeStatus;
  accentColor?: string;
  isFocus: boolean;
  isNeighbor: boolean;
  isSelected: boolean;
  isLinkSource: boolean;
  radius: number;
  viewMode?: 'graph' | 'list';
  listGroupId?: string;
  listCardWidth?: number;
  listCardHeight?: number;
  endpointKind?: 'node' | 'group';
  boxWidth?: number;
  boxHeight?: number;
}

export interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  edgeType: EdgeType;
  sourceKind?: 'node' | 'group';
  targetKind?: 'node' | 'group';
  hidden?: boolean;
  derivedFromGroupId?: string;
  derivedFromEdgeId?: string;
  label?: string;
  labelPosition?: number;
  isHighlighted: boolean;
  isSelected: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface CubicBezier {
  source: Point;
  c1: Point;
  c2: Point;
  target: Point;
}

export function nodeRadius(isFocus: boolean, isNeighbor: boolean): number {
  if (isFocus) return 18;
  if (isNeighbor) return 15;
  return 13;
}

export function nodeFill(node: SimNode): string {
  if (node.isFocus && node.accentColor) {
    return `${node.accentColor}40`;
  }
  if (node.isNeighbor) return 'rgba(30,41,59,0.96)';
  return 'rgba(15,23,42,0.94)';
}

export function nodeStroke(node: SimNode): string {
  if (node.isSelected) return '#f8fafc';
  if (node.isFocus && node.accentColor) return node.accentColor;
  if (node.isFocus) return '#f59e0b';
  if (node.isNeighbor) return 'rgba(255,255,255,0.35)';
  return 'rgba(255,255,255,0.18)';
}

export function nodeStrokeWidth(node: SimNode): number {
  if (node.isSelected) return 3;
  if (node.isFocus) return 2.5;
  if (node.isNeighbor) return 1.5;
  return 1.2;
}

export function nodeOpacity(node: SimNode): number {
  if (node.isFocus || node.isNeighbor || node.isSelected) return 1;
  return 0.72;
}

/** 文字衬底：半透明实底，用于遮挡下方连线 */
export const LABEL_BACKDROP_FILL = 'rgba(2, 6, 23, 0.94)';

export function linkStroke(link: SimLink): string {
  if (link.isSelected) return '#fbbf24';
  return EDGE_TYPE_COLORS[link.edgeType];
}

export function linkWidth(link: SimLink): number {
  if (link.isSelected) return 3;
  if (link.edgeType === 'depends_on' || link.edgeType === 'blocks') return 2.2;
  if (link.isHighlighted) return 2;
  return 1.5;
}

export function linkDasharray(link: SimLink): string | null {
  switch (link.edgeType) {
    case 'blocks':
      return '5 4';
    case 'depends_on':
      return '10 5';
    case 'inspired_by':
      return '3 5';
    default:
      return null;
  }
}

export function linkOpacity(link: SimLink): number {
  if (link.isSelected) return 1;
  if (link.isHighlighted) return 0.95;
  return 0.55;
}

export function linkHasArrow(link: SimLink): boolean {
  return edgeTypeHasDirection(link.edgeType);
}

export function linkMarkerId(link: SimLink): string | null {
  return linkHasArrow(link) ? `url(#edge-arrow-${link.edgeType})` : null;
}

/** 将连线的 source/target 从 id 解析为 SimNode（无 simulation 时必须） */
export function resolveSimLinks(links: SimLink[], nodes: SimNode[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const endpointId = (end: SimNode | string | number) =>
    typeof end === 'string' ? end : typeof end === 'number' ? String(end) : end.id;
  for (const link of links) {
    const sourceId = endpointId(link.source);
    const targetId = endpointId(link.target);
    const source = byId.get(sourceId);
    const target = byId.get(targetId);
    if (source) link.source = source;
    if (target) link.target = target;
  }
}

export function linkEndpoint(end: SimNode | string | number): { x: number; y: number } {
  if (typeof end === 'string') return { x: 0, y: 0 };
  if (typeof end === 'number') return { x: 0, y: 0 };
  return { x: end.x ?? 0, y: end.y ?? 0 };
}

export function linkVisibleEndpoints(link: SimLink) {
  const source = linkEndpoint(link.source);
  const target = linkEndpoint(link.target);
  if (typeof link.source === 'string' || typeof link.source === 'number') {
    return { source, target, midpoint: source };
  }
  if (typeof link.target === 'string' || typeof link.target === 'number') {
    return { source, target, midpoint: target };
  }

  const sourceNode = typeof link.source === 'string' || typeof link.source === 'number'
    ? null
    : link.source;
  const targetNode = typeof link.target === 'string' || typeof link.target === 'number'
    ? null
    : link.target;

  const groupPortAnchor = (node: SimNode, other: { x: number; y: number }) => {
    const cx = node.x ?? 0;
    const cy = node.y ?? 0;
    const halfWidth = (node.boxWidth ?? node.listCardWidth ?? 220) / 2;
    const halfHeight = (node.boxHeight ?? node.listCardHeight ?? 34) / 2;
    const side = other.x < cx ? -1 : 1;
    return {
      x: cx + side * (halfWidth + 8),
      y: cy - halfHeight + NETWORK_BOX_TITLE_HEIGHT / 2,
    };
  };

  const listAnchor = (node: SimNode, other: { x: number; y: number }) => {
    const side = other.x < (node.x ?? 0) ? -1 : 1;
    return {
      x: (node.x ?? 0) + side * ((node.listCardWidth ?? 220) / 2 + 8),
      y: node.y ?? 0,
    };
  };

  const sourceAnchor = sourceNode?.endpointKind === 'group'
    ? groupPortAnchor(sourceNode, target)
    : sourceNode?.viewMode === 'list'
    ? listAnchor(sourceNode, target)
    : source;
  const targetAnchor = targetNode?.endpointKind === 'group'
    ? groupPortAnchor(targetNode, source)
    : targetNode?.viewMode === 'list'
    ? listAnchor(targetNode, source)
    : target;

  const dx = targetAnchor.x - sourceAnchor.x;
  const dy = targetAnchor.y - sourceAnchor.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return { source: sourceAnchor, target: targetAnchor, midpoint: sourceAnchor };

  const ux = dx / distance;
  const uy = dy / distance;
  const sourcePad = sourceNode?.viewMode === 'list' || sourceNode?.endpointKind === 'group'
    ? 0
    : link.source.radius + 5;
  const targetPad = targetNode?.viewMode === 'list' || targetNode?.endpointKind === 'group'
    ? 0
    : link.target.radius + (linkHasArrow(link) ? 13 : 5);
  const visibleSource = {
    x: sourceAnchor.x + ux * sourcePad,
    y: sourceAnchor.y + uy * sourcePad,
  };
  const visibleTarget = {
    x: targetAnchor.x - ux * targetPad,
    y: targetAnchor.y - uy * targetPad,
  };

  return {
    source: visibleSource,
    target: visibleTarget,
    midpoint: {
      x: (visibleSource.x + visibleTarget.x) / 2,
      y: (visibleSource.y + visibleTarget.y) / 2,
    },
  };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

export function cubicBezierPoint(curve: CubicBezier, t: number): Point {
  const clamped = clamp01(t);
  const mt = 1 - clamped;
  const mt2 = mt * mt;
  const t2 = clamped * clamped;
  return {
    x:
      mt2 * mt * curve.source.x +
      3 * mt2 * clamped * curve.c1.x +
      3 * mt * t2 * curve.c2.x +
      t2 * clamped * curve.target.x,
    y:
      mt2 * mt * curve.source.y +
      3 * mt2 * clamped * curve.c1.y +
      3 * mt * t2 * curve.c2.y +
      t2 * clamped * curve.target.y,
  };
}

export function linkCurve(link: SimLink): CubicBezier {
  const { source, target } = linkVisibleEndpoints(link);
  const sourceNode = typeof link.source === 'string' || typeof link.source === 'number'
    ? null
    : link.source;
  const targetNode = typeof link.target === 'string' || typeof link.target === 'number'
    ? null
    : link.target;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const hasCurvedEndpoint =
    sourceNode?.viewMode === 'list' ||
    targetNode?.viewMode === 'list' ||
    sourceNode?.endpointKind === 'group' ||
    targetNode?.endpointKind === 'group';

  if (!hasCurvedEndpoint) {
    return {
      source,
      c1: { x: source.x + dx / 3, y: source.y + dy / 3 },
      c2: { x: source.x + (dx * 2) / 3, y: source.y + (dy * 2) / 3 },
      target,
    };
  }

  const handle = Math.max(48, Math.min(140, Math.abs(dx) * 0.5));
  const sourceDirection = dx >= 0 ? 1 : -1;
  const targetDirection = dx >= 0 ? 1 : -1;
  const nodeCenterHandle = (
    endpoint: Point,
    node: SimNode | null,
    fallback: Point,
  ) => {
    if (!node) return fallback;
    const center = { x: node.x ?? endpoint.x, y: node.y ?? endpoint.y };
    const vx = center.x - endpoint.x;
    const vy = center.y - endpoint.y;
    const distance = Math.hypot(vx, vy);
    if (!distance) return fallback;
    const length = Math.max(28, Math.min(72, handle * 0.45));
    return {
      x: endpoint.x - (vx / distance) * length,
      y: endpoint.y - (vy / distance) * length,
    };
  };
  const c1 = sourceNode?.viewMode === 'list' || sourceNode?.endpointKind === 'group'
    ? { x: source.x + sourceDirection * handle, y: source.y }
    : nodeCenterHandle(source, sourceNode, { x: source.x + dx * 0.5, y: source.y });
  const c2 = targetNode?.viewMode === 'list' || targetNode?.endpointKind === 'group'
    ? { x: target.x - targetDirection * handle, y: target.y }
    : nodeCenterHandle(target, targetNode, { x: target.x - dx * 0.5, y: target.y });

  return { source, c1, c2, target };
}

export function linkPointAt(link: SimLink, t = 0.5): Point {
  return cubicBezierPoint(linkCurve(link), t);
}

export function linkLabelPoint(link: SimLink): Point {
  return linkPointAt(link, link.labelPosition ?? 0.5);
}

export function closestLinkPosition(link: SimLink, point: Point, samples = 80): number {
  const curve = linkCurve(link);
  let bestT = 0.5;
  let bestDistance = Infinity;

  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const candidate = cubicBezierPoint(curve, t);
    const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestT = t;
    }
  }

  const step = 1 / samples;
  let left = Math.max(0, bestT - step);
  let right = Math.min(1, bestT + step);
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const t1 = left + (right - left) / 3;
    const t2 = right - (right - left) / 3;
    const p1 = cubicBezierPoint(curve, t1);
    const p2 = cubicBezierPoint(curve, t2);
    const d1 = (p1.x - point.x) ** 2 + (p1.y - point.y) ** 2;
    const d2 = (p2.x - point.x) ** 2 + (p2.y - point.y) ** 2;
    if (d1 < d2) right = t2;
    else left = t1;
  }

  return clamp01((left + right) / 2);
}

export interface EdgeHoverHit {
  nodeId: string;
  /** 相对节点中心的锚点偏移 */
  lx: number;
  ly: number;
}

/** 鼠标在节点边缘环带内时，返回最近节点及边缘锚点位置 */
export function findEdgeHover(
  mx: number,
  my: number,
  nodes: SimNode[],
  innerRatio = 0.72,
  outerRatio = 1.38,
  excludeId?: string | null,
): EdgeHoverHit | null {
  let best: EdgeHoverHit | null = null;
  let bestGap = Infinity;

  for (const n of nodes) {
    if (excludeId && n.id === excludeId) continue;
    const nx = n.x ?? 0;
    const ny = n.y ?? 0;
    if (n.viewMode === 'list') {
      const halfWidth = (n.listCardWidth ?? 220) / 2;
      const halfHeight = (n.listCardHeight ?? 34) / 2;
      const portHalfWidth = 12;
      const portHalfHeight = Math.max(12, halfHeight);
      const candidates = [
        { lx: -halfWidth - 8, ly: 0 },
        { lx: halfWidth + 8, ly: 0 },
      ];
      for (const candidate of candidates) {
        const px = nx + candidate.lx;
        const py = ny + candidate.ly;
        if (
          Math.abs(mx - px) > portHalfWidth ||
          Math.abs(my - py) > portHalfHeight
        ) {
          continue;
        }
        const gap = Math.hypot(mx - px, my - py);
        if (gap < bestGap) {
          bestGap = gap;
          best = { nodeId: n.id, lx: candidate.lx, ly: candidate.ly };
        }
      }
      continue;
    }
    const dx = mx - nx;
    const dy = my - ny;
    const dist = Math.hypot(dx, dy);
    const r = n.radius;
    const inner = r * innerRatio;
    const outer = r * outerRatio;
    if (dist < inner || dist > outer) continue;

    const gap = Math.abs(dist - r);
    if (gap < bestGap) {
      bestGap = gap;
      const angle = Math.atan2(dy, dx);
      const pad = 4;
      best = {
        nodeId: n.id,
        lx: Math.cos(angle) * (r + pad),
        ly: Math.sin(angle) * (r + pad),
      };
    }
  }
  return best;
}

export function truncateLabel(label: string): string {
  return label;
}

export function typeLabel(nodeType: NodeType): string {
  return NODE_TYPE_META[nodeType].label;
}

export function typeIcon(nodeType: NodeType): string {
  switch (nodeType) {
    case 'concept':
      return '🧠';
    case 'question':
      return '❓';
    case 'decision':
      return '✅';
    case 'goal':
      return '🎯';
    case 'project':
      return '🗂️';
    case 'task':
      return '☑️';
    case 'person':
      return '👤';
    case 'insight':
      return '💡';
    case 'event':
      return '📍';
    case 'experience':
      return '🕰️';
  }
}

export function nodeIcon(node: Pick<SimNode, 'nodeType' | 'status'>): string {
  if ((node.nodeType === 'goal' || node.nodeType === 'task') && node.status === 'done') {
    return '✓';
  }
  return typeIcon(node.nodeType);
}

function shouldShowLabel(node: SimNode): boolean {
  return node.isFocus || node.isNeighbor || node.isSelected || node.isLinkSource;
}

const TYPE_TAG_PAD = { x: 4, y: 2 };
const LABEL_NAME_GAP = 4;
const LABEL_BG_PAD = { x: 2, y: 2 };

function labelContent(node: SimNode) {
  return {
    type: typeLabel(node.nodeType),
    label: truncateLabel(node.label),
  };
}

export function linkPath(link: SimLink): string {
  const curve = linkCurve(link);
  const sourceNode = typeof link.source === 'string' || typeof link.source === 'number'
    ? null
    : link.source;
  const targetNode = typeof link.target === 'string' || typeof link.target === 'number'
    ? null
    : link.target;
  const hasCurvedEndpoint =
    sourceNode?.viewMode === 'list' ||
    targetNode?.viewMode === 'list' ||
    sourceNode?.endpointKind === 'group' ||
    targetNode?.endpointKind === 'group';
  if (!hasCurvedEndpoint) return `M ${curve.source.x} ${curve.source.y} L ${curve.target.x} ${curve.target.y}`;
  return `M ${curve.source.x} ${curve.source.y} C ${curve.c1.x} ${curve.c1.y}, ${curve.c2.x} ${curve.c2.y}, ${curve.target.x} ${curve.target.y}`;
}

function layoutNodeLabels(
  nodeSelection: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>,
) {
  nodeSelection.each(function (node) {
    const group = d3.select(this).select<SVGGElement>('.labels');
    const { type, label } = labelContent(node);
    const typeFill =
      node.isFocus && node.accentColor ? node.accentColor : 'rgba(203,213,225,0.9)';
    const nameFill =
      node.isFocus && node.accentColor ? node.accentColor : 'rgba(226,232,240,0.9)';
    const tagFill =
      node.isFocus && node.accentColor ? `${node.accentColor}2e` : 'rgba(148,163,184,0.16)';
    const tagStroke =
      node.isFocus && node.accentColor ? `${node.accentColor}88` : 'rgba(148,163,184,0.24)';

    const typeChip = group
      .select<SVGTextElement>('.type-chip')
      .text(type)
      .attr('x', node.radius + 17)
      .attr('y', 0)
      .attr('fill', typeFill)
      .attr('font-size', 9)
      .attr('font-weight', 700);

    const typeBox = typeChip.node()?.getBBox();
    if (!typeBox) return;

    const tagX = typeBox.x - TYPE_TAG_PAD.x;
    const tagY = typeBox.y - TYPE_TAG_PAD.y;
    const tagW = typeBox.width + TYPE_TAG_PAD.x * 2;
    const tagH = typeBox.height + TYPE_TAG_PAD.y * 2;

    group
      .select<SVGRectElement>('.type-tag-bg')
      .attr('x', tagX)
      .attr('y', tagY)
      .attr('width', tagW)
      .attr('height', tagH)
      .attr('rx', 5)
      .attr('fill', tagFill)
      .attr('stroke', tagStroke)
      .attr('stroke-width', 1);

    const nameLabel = group
      .select<SVGTextElement>('.name-label')
      .text(label)
      .attr('x', tagX + tagW + LABEL_NAME_GAP)
      .attr('y', 0)
      .attr('fill', nameFill)
      .attr('font-size', 12)
      .attr('font-weight', node.isFocus ? 600 : 400)
      .attr('opacity', 1);

    const nameBox = nameLabel.node()?.getBBox();
    if (!nameBox) return;

    let left = Math.min(tagX, nameBox.x) - LABEL_BG_PAD.x;
    let right = Math.max(tagX + tagW, nameBox.x + nameBox.width) + LABEL_BG_PAD.x;
    const top = Math.min(tagY, nameBox.y) - LABEL_BG_PAD.y;
    const bottom = Math.max(tagY + tagH, nameBox.y + nameBox.height) + LABEL_BG_PAD.y;

    const bgWidth = right - left;
    const bgHeight = bottom - top;

    group
      .select<SVGRectElement>('.label-bg')
      .attr('x', left)
      .attr('y', top)
      .attr('width', bgWidth)
      .attr('height', bgHeight)
      .attr('rx', 4)
      .attr('fill', LABEL_BACKDROP_FILL)
      .attr('stroke', 'none')
      .style('pointer-events', 'none');

    group
      .select<SVGRectElement>('.label-edit-hit')
      .attr('x', left)
      .attr('y', top - 1)
      .attr('width', bgWidth)
      .attr('height', bgHeight + 2)
      .attr('rx', 8)
      .attr('fill', 'transparent')
      .attr('stroke', 'transparent')
      .style('cursor', 'text')
      .style('pointer-events', 'all');
  });
}

export function appendNodeCircle(
  selection: d3.Selection<d3.BaseType, SimNode, d3.BaseType, unknown>,
) {
  selection.each(function (d) {
    const g = d3.select(this);
    g.selectAll('.node-shape').remove();
    const shapeG = g
      .append('g')
      .attr('class', 'node-shape')
      .attr('filter', d.isFocus ? 'url(#focus-glow)' : null);

    const r = d.radius;
    shapeG
      .append('circle')
      .attr('r', Math.max(30, r + 14))
      .attr('class', 'node-hover-target')
      .attr('fill', 'transparent')
      .attr('stroke', 'transparent')
      .style('pointer-events', 'none');

    shapeG
      .append('circle')
      .attr('r', r)
      .attr('class', 'shape-body')
      .attr('fill', nodeFill(d))
      .attr('stroke', nodeStroke(d))
      .attr('stroke-width', nodeStrokeWidth(d))
      .attr('opacity', 0);

    shapeG
      .append('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'rgba(248,250,252,0.92)')
      .attr('font-size', Math.max(14, r + 1))
      .attr('font-weight', 500)
      .attr('opacity', nodeOpacity(d))
      .text(nodeIcon(d));

    const card = shapeG.append('g').attr('class', 'list-card');
    card.append('rect').attr('class', 'list-card-bg');
    card.append('rect').attr('class', 'list-card-port list-card-port-left');
    card.append('rect').attr('class', 'list-card-port list-card-port-right');
    card
      .append('text')
      .attr('class', 'list-card-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central');
    card
      .append('text')
      .attr('class', 'list-card-title')
      .attr('dominant-baseline', 'central');
    card
      .append('text')
      .attr('class', 'list-card-meta')
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'central');
  });
}

export function applyNodeVisual(
  selection: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>,
) {
  selection
    .classed('is-focus', (d) => d.isFocus)
    .classed('is-neighbor', (d) => d.isNeighbor)
    .classed('is-selected', (d) => d.isSelected && d.viewMode !== 'list')
    .classed('is-link-source', (d) => d.isLinkSource && d.viewMode !== 'list')
    .classed('show-label', (d) => d.viewMode !== 'list' && shouldShowLabel(d));

  selection.select('.node-hover-target').attr('r', (d) =>
    d.viewMode === 'list'
      ? Math.max(30, (d.listCardWidth ?? 220) / 2, (d.listCardHeight ?? 34) / 2)
      : Math.max(30, d.radius + 14),
  );

  selection.select('.shape-body')
    .style('display', (d) => (d.viewMode === 'list' ? 'none' : null))
    .attr('r', (d) => d.radius)
    .attr('fill', (d) => nodeFill(d))
    .attr('stroke', (d) => nodeStroke(d))
    .attr('stroke-width', (d) => nodeStrokeWidth(d))
    .attr('opacity', (d) => (d.viewMode === 'list' ? 0 : 0));

  selection.select('.node-icon')
    .style('display', (d) => (d.viewMode === 'list' ? 'none' : null))
    .text((d) => nodeIcon(d))
    .attr('fill', (d) =>
      (d.nodeType === 'goal' || d.nodeType === 'task') && d.status === 'done'
        ? '#34d399'
        : 'rgba(248,250,252,0.92)',
    )
    .attr('font-weight', (d) =>
      (d.nodeType === 'goal' || d.nodeType === 'task') && d.status === 'done' ? 800 : 500,
    )
    .attr('font-size', (d) => Math.max(14, d.radius + 1))
    .attr('opacity', (d) => (d.viewMode === 'list' ? 0 : nodeOpacity(d)));

  selection.select<SVGGElement>('.list-card')
    .style('display', (d) => (d.viewMode === 'list' ? null : 'none'))
    .attr('opacity', (d) => nodeOpacity(d));

  selection.select<SVGRectElement>('.list-card-bg')
    .attr('x', (d) => -(d.listCardWidth ?? 220) / 2)
    .attr('y', (d) => -(d.listCardHeight ?? 34) / 2)
    .attr('width', (d) => d.listCardWidth ?? 220)
    .attr('height', (d) => d.listCardHeight ?? 34)
    .attr('rx', 7)
    .attr('fill', (d) => (d.isSelected ? 'rgba(20,184,166,0.18)' : 'rgba(15,23,42,0.92)'))
    .attr('stroke', (d) => (d.isSelected ? '#5eead4' : 'rgba(148,163,184,0.24)'))
    .attr('stroke-width', (d) => (d.isSelected ? 1.5 : 1));

  selection.select<SVGTextElement>('.list-card-icon')
    .attr('x', (d) => -(d.listCardWidth ?? 220) / 2 + 18)
    .attr('y', 0)
    .attr('fill', '#f8fafc')
    .attr('font-size', 14)
    .text((d) => nodeIcon(d));

  selection.select<SVGTextElement>('.list-card-title')
    .attr('x', (d) => -(d.listCardWidth ?? 220) / 2 + 36)
    .attr('y', 0)
    .attr('fill', '#e2e8f0')
    .attr('font-size', 12)
    .attr('font-weight', 600)
    .text((d) => d.label);

  selection.select<SVGTextElement>('.list-card-meta')
    .attr('x', (d) => (d.listCardWidth ?? 220) / 2 - 12)
    .attr('y', 0)
    .attr('fill', '#64748b')
    .attr('font-size', 10)
    .text((d) => typeLabel(d.nodeType));

  selection.select<SVGRectElement>('.list-card-port-left')
    .attr('x', (d) => -(d.listCardWidth ?? 220) / 2 - 11)
    .attr('y', -7)
    .attr('width', 6)
    .attr('height', 14)
    .attr('rx', 2)
    .attr('fill', '#0f172a')
    .attr('stroke', '#5eead4')
    .attr('stroke-width', 1.2);

  selection.select<SVGRectElement>('.list-card-port-right')
    .attr('x', (d) => (d.listCardWidth ?? 220) / 2 + 5)
    .attr('y', -7)
    .attr('width', 6)
    .attr('height', 14)
    .attr('rx', 2)
    .attr('fill', '#0f172a')
    .attr('stroke', '#5eead4')
    .attr('stroke-width', 1.2);

  selection.select('.node-shape').attr('filter', (d) =>
    d.isFocus && d.viewMode !== 'list' ? 'url(#focus-glow)' : null,
  );

  layoutNodeLabels(selection.filter((d) => d.viewMode !== 'list'));
  selection.filter((d) => d.viewMode === 'list').select<SVGGElement>('.labels').style('display', 'none');
  selection.filter((d) => d.viewMode !== 'list').select<SVGGElement>('.labels').style('display', null);

  selection.select('.link-source-ring').style('display', (d) =>
    d.isLinkSource && d.viewMode !== 'list' ? null : 'none',
  ).attr('r', (d) => d.radius + 7);
}

export function linkMidlabel(link: SimLink): string {
  return link.label?.trim() || EDGE_TYPE_LABELS[link.edgeType];
}

export function shouldShowLinkMidDecoration(link: SimLink, labelMode: boolean): boolean {
  if (labelMode) return true;
  return edgeTypeHasDirection(link.edgeType);
}

export function appendLinkMidDecoration(
  g: d3.Selection<SVGGElement, SimLink, d3.BaseType, unknown>,
  link: SimLink,
  labelMode: boolean,
) {
  g.selectAll('*').remove();
  if (!shouldShowLinkMidDecoration(link, labelMode)) return;

  if (labelMode) {
    const text = linkMidlabel(link);
    const textWidth = Math.max(20, text.length * 8 + 5);
    const textHeight = 12;
    g.append('rect')
      .attr('class', 'edge-label-bg')
      .attr('x', -textWidth / 2)
      .attr('y', -textHeight / 2)
      .attr('width', textWidth)
      .attr('height', textHeight)
      .attr('rx', 3)
      .attr('fill', LABEL_BACKDROP_FILL)
      .attr('stroke', 'none');
    g.append('text')
      .attr('class', 'edge-label-text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 8)
      .attr('font-weight', 600)
      .text(text);
    return;
  }

  if (link.edgeType === 'blocks') {
    g.append('line')
      .attr('class', 'edge-symbol-mark')
      .attr('x1', -4)
      .attr('y1', -4)
      .attr('x2', 4)
      .attr('y2', 4)
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round');
    g.append('line')
      .attr('class', 'edge-symbol-mark')
      .attr('x1', -4)
      .attr('y1', 4)
      .attr('x2', 4)
      .attr('y2', -4)
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round');
    return;
  }

  if (link.edgeType === 'part_of') {
    g.append('rect')
      .attr('class', 'edge-symbol-mark')
      .attr('x', -4)
      .attr('y', -4)
      .attr('width', 8)
      .attr('height', 8)
      .attr('rx', 1.5)
      .attr('fill', 'none')
      .attr('stroke-width', 2);
    return;
  }

  if (link.edgeType === 'depends_on') {
    g.append('path')
      .attr('class', 'edge-symbol-mark')
      .attr('d', 'M 0 -5 L 5 0 L 0 5 L -5 0 Z')
      .attr('fill', 'rgba(15,23,42,0.92)')
      .attr('stroke-width', 2);
    return;
  }

  if (link.edgeType === 'inspired_by') {
    g.append('text')
      .attr('class', 'edge-symbol-star')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 16)
      .attr('font-weight', 800)
      .text('✦');
  }
}

export function applyLinkMidDecoration(
  selection: d3.Selection<SVGGElement, SimLink, SVGGElement, unknown>,
  labelMode: boolean,
) {
  selection.style('display', (d) => (shouldShowLinkMidDecoration(d, labelMode) ? null : 'none'));

  selection.select<SVGRectElement>('.edge-label-bg')
    .attr('fill', LABEL_BACKDROP_FILL)
    .attr('stroke', 'none');
  selection.select<SVGTextElement>('.edge-label-text')
    .attr('fill', (d) => (d.isSelected ? '#fbbf24' : linkStroke(d)));

  selection.selectAll<SVGElement, SimLink>('.edge-symbol-mark')
    .attr('stroke', (d) => linkStroke(d));
  selection.select<SVGTextElement>('.edge-symbol-star')
    .attr('fill', (d) => linkStroke(d));
}

export function updateLinkMidPositions(
  selection: d3.Selection<SVGGElement, SimLink, SVGGElement, unknown>,
) {
  selection.attr('transform', (d) => {
    const midpoint = linkLabelPoint(d);
    return `translate(${midpoint.x},${midpoint.y})`;
  });
}

export function applyLinkVisual(
  selection: d3.Selection<SVGPathElement, SimLink, SVGGElement, unknown>,
) {
  selection
    .attr('fill', 'none')
    .attr('stroke', (d) => linkStroke(d))
    .attr('stroke-width', (d) => linkWidth(d))
    .attr('stroke-dasharray', (d) => linkDasharray(d))
    .attr('opacity', (d) => linkOpacity(d))
    .attr('marker-end', (d) => linkMarkerId(d));
}
