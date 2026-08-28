import type { MindEdge, MindNode } from '../types';

export function getNodesInGraph(nodes: MindNode[], viewParentId: string | null): MindNode[] {
  return nodes.filter((n) => (n.parent_id ?? null) === viewParentId);
}

export function getEdgesInGraph(nodes: MindNode[], edges: MindEdge[]): MindEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => ids.has(e.source) && ids.has(e.target));
}

export interface BreadcrumbItem {
  id: string | null;
  label: string;
}

export function getBreadcrumbPath(nodes: MindNode[], viewParentId: string | null): BreadcrumbItem[] {
  const path: BreadcrumbItem[] = [{ id: null, label: '思维宫殿' }];
  if (!viewParentId) return path;

  const chain: BreadcrumbItem[] = [];
  let current: string | null = viewParentId;
  while (current) {
    const node = nodes.find((n) => n.id === current);
    if (!node) break;
    chain.unshift({ id: node.id, label: node.label });
    current = node.parent_id ?? null;
  }
  return [...path, ...chain];
}

export function canEnterSubnet(node: MindNode): boolean {
  return node.type === 'project';
}

export function collectDescendantIds(nodes: MindNode[], rootId: string): Set<string> {
  const result = new Set<string>();
  const walk = (id: string) => {
    result.add(id);
    nodes.filter((n) => n.parent_id === id).forEach((n) => walk(n.id));
  };
  walk(rootId);
  return result;
}
