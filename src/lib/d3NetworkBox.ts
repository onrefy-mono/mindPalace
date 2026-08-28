import * as d3 from 'd3';
import type { NodeGroup } from '../types';
import {
  NETWORK_BOX_MIN_HEIGHT,
  NETWORK_BOX_MIN_WIDTH,
  NETWORK_BOX_TITLE_HEIGHT,
} from './networkBox';

export interface NetworkBoxDatum extends NodeGroup {
  x: number;
  y: number;
  width: number;
  height: number;
  isSelected: boolean;
}

const RESIZE_HANDLE_SIZE = 10;
const EDGE_RESIZE_HIT_SIZE = 10;
const OPEN_BUTTON_WIDTH = 44;
const OPEN_BUTTON_HEIGHT = 20;
const OPEN_BUTTON_MARGIN = 4;
const VIEW_SWITCH_WIDTH = 44;
const VIEW_SWITCH_GAP = 4;
const BOX_PORT_WIDTH = 6;
const BOX_PORT_HEIGHT = 14;

export function applyNetworkBoxVisual(
  selection: d3.Selection<SVGGElement, NetworkBoxDatum, d3.BaseType, unknown>,
  sizeOverride?: { width: number; height: number },
) {
  const widthOf = (d: NetworkBoxDatum) => sizeOverride?.width ?? d.width;
  const heightOf = (d: NetworkBoxDatum) => sizeOverride?.height ?? d.height;

  selection
    .select<SVGRectElement>('.box-body')
    .attr('width', (d) => widthOf(d))
    .attr('height', (d) => heightOf(d))
    .attr('y', 0)
    .attr('rx', 10)
    .attr('fill', (d) => `${d.color}14`)
    .attr('stroke', (d) => (d.isSelected ? d.color : `${d.color}88`))
    .attr('stroke-width', (d) => (d.isSelected ? 2.5 : 1.5))
    .attr('stroke-dasharray', (d) => (d.isSelected ? null : '8 6'));

  selection
    .select<SVGRectElement>('.box-title')
    .attr('width', (d) => widthOf(d))
    .attr('height', NETWORK_BOX_TITLE_HEIGHT)
    .attr('rx', 8)
    .attr('fill', (d) => `${d.color}28`)
    .attr('stroke', (d) => `${d.color}66`)
    .attr('stroke-width', 1);

  selection
    .select<SVGTextElement>('.box-title-text')
    .attr('x', 12)
    .attr('y', NETWORK_BOX_TITLE_HEIGHT / 2)
    .attr('dominant-baseline', 'central')
    .attr('fill', (d) => (d.isSelected ? '#f8fafc' : '#cbd5e1'))
    .attr('font-size', 12)
    .attr('font-weight', 700)
    .text((d) => d.name);

  selection
    .select<SVGTextElement>('.box-count')
    .attr(
      'x',
      (d) =>
        widthOf(d) -
        OPEN_BUTTON_WIDTH -
        VIEW_SWITCH_WIDTH -
        OPEN_BUTTON_MARGIN * 2 -
        VIEW_SWITCH_GAP -
        8,
    )
    .attr('y', NETWORK_BOX_TITLE_HEIGHT / 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'central')
    .attr('fill', '#64748b')
    .attr('font-size', 10)
    .text((d) => `${d.node_ids.length}`);

  selection
    .select<SVGGElement>('.box-view-switch')
    .attr(
      'transform',
      (d) =>
        `translate(${widthOf(d) - OPEN_BUTTON_WIDTH - VIEW_SWITCH_WIDTH - VIEW_SWITCH_GAP - OPEN_BUTTON_MARGIN},${OPEN_BUTTON_MARGIN})`,
    )
    .style('cursor', 'pointer');

  selection
    .select<SVGRectElement>('.box-view-switch-bg')
    .attr('width', VIEW_SWITCH_WIDTH)
    .attr('height', OPEN_BUTTON_HEIGHT)
    .attr('rx', 5)
    .attr('fill', (d) => {
      const activeView = d.views?.find((view) => view.id === d.active_view_id);
      return activeView?.type === 'list' ? `${d.color}36` : 'rgba(15,23,42,0.82)';
    })
    .attr('stroke', (d) => {
      const activeView = d.views?.find((view) => view.id === d.active_view_id);
      return activeView?.type === 'list' ? `${d.color}aa` : 'rgba(148,163,184,0.22)';
    })
    .attr('stroke-width', 1);

  selection
    .select<SVGTextElement>('.box-view-switch-text')
    .attr('x', VIEW_SWITCH_WIDTH / 2)
    .attr('y', OPEN_BUTTON_HEIGHT / 2)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('fill', (d) => {
      const activeView = d.views?.find((view) => view.id === d.active_view_id);
      return activeView?.type === 'list' ? '#f0fdfa' : '#cbd5e1';
    })
    .attr('font-size', 10)
    .attr('font-weight', 700)
    .text((d) => {
      const activeView = d.views?.find((view) => view.id === d.active_view_id);
      return activeView?.type === 'list' ? '图谱' : '列表';
    });

  selection
    .select<SVGGElement>('.box-open-view')
    .attr(
      'transform',
      (d) =>
        `translate(${widthOf(d) - OPEN_BUTTON_WIDTH - OPEN_BUTTON_MARGIN},${OPEN_BUTTON_MARGIN})`,
    )
    .style('cursor', 'pointer');

  selection
    .select<SVGRectElement>('.box-open-view-bg')
    .attr('width', OPEN_BUTTON_WIDTH)
    .attr('height', OPEN_BUTTON_HEIGHT)
    .attr('rx', 5)
    .attr('fill', (d) => (d.isSelected ? `${d.color}44` : 'rgba(15,23,42,0.82)'))
    .attr('stroke', (d) => (d.isSelected ? `${d.color}aa` : 'rgba(148,163,184,0.22)'))
    .attr('stroke-width', 1);

  selection
    .select<SVGTextElement>('.box-open-view-text')
    .attr('x', OPEN_BUTTON_WIDTH / 2)
    .attr('y', OPEN_BUTTON_HEIGHT / 2)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('fill', (d) => (d.isSelected ? '#f0fdfa' : '#cbd5e1'))
    .attr('font-size', 10)
    .attr('font-weight', 700)
    .text('打开');

  selection
    .select<SVGRectElement>('.box-resize-handle')
    .attr('x', (d) => widthOf(d) - RESIZE_HANDLE_SIZE)
    .attr('y', (d) => heightOf(d) - RESIZE_HANDLE_SIZE)
    .attr('width', RESIZE_HANDLE_SIZE)
    .attr('height', RESIZE_HANDLE_SIZE)
    .attr('rx', 2)
    .attr('fill', (d) => (d.isSelected ? d.color : 'transparent'))
    .attr('stroke', (d) => (d.isSelected ? '#e2e8f0' : 'none'))
    .attr('stroke-width', 1)
    .style('display', (d) => (d.isSelected ? null : 'none'))
    .style('cursor', 'nwse-resize');

  const edgeHitAttrs: Record<string, { cursor: string }> = {
    n: { cursor: 'ns-resize' },
    s: { cursor: 'ns-resize' },
    e: { cursor: 'ew-resize' },
    w: { cursor: 'ew-resize' },
    ne: { cursor: 'nesw-resize' },
    sw: { cursor: 'nesw-resize' },
    nw: { cursor: 'nwse-resize' },
    se: { cursor: 'nwse-resize' },
  };

  selection.selectAll<SVGRectElement, NetworkBoxDatum>('.box-edge-resize-hit')
    .attr('fill', 'transparent')
    .style('pointer-events', 'all')
    .style('cursor', function () {
      const edge = d3.select(this).attr('data-edge') ?? 'se';
      return edgeHitAttrs[edge]?.cursor ?? 'default';
    });

  selection.select<SVGRectElement>('.box-edge-resize-hit-n')
    .attr('x', -EDGE_RESIZE_HIT_SIZE)
    .attr('y', -EDGE_RESIZE_HIT_SIZE / 2)
    .attr('width', (d) => widthOf(d) + EDGE_RESIZE_HIT_SIZE * 2)
    .attr('height', EDGE_RESIZE_HIT_SIZE);
  selection.select<SVGRectElement>('.box-edge-resize-hit-s')
    .attr('x', -EDGE_RESIZE_HIT_SIZE)
    .attr('y', (d) => heightOf(d) - EDGE_RESIZE_HIT_SIZE / 2)
    .attr('width', (d) => widthOf(d) + EDGE_RESIZE_HIT_SIZE * 2)
    .attr('height', EDGE_RESIZE_HIT_SIZE);
  selection.select<SVGRectElement>('.box-edge-resize-hit-e')
    .attr('x', (d) => widthOf(d) - EDGE_RESIZE_HIT_SIZE / 2)
    .attr('y', -EDGE_RESIZE_HIT_SIZE)
    .attr('width', EDGE_RESIZE_HIT_SIZE)
    .attr('height', (d) => heightOf(d) + EDGE_RESIZE_HIT_SIZE * 2);
  selection.select<SVGRectElement>('.box-edge-resize-hit-w')
    .attr('x', -EDGE_RESIZE_HIT_SIZE / 2)
    .attr('y', -EDGE_RESIZE_HIT_SIZE)
    .attr('width', EDGE_RESIZE_HIT_SIZE)
    .attr('height', (d) => heightOf(d) + EDGE_RESIZE_HIT_SIZE * 2);
  selection.select<SVGRectElement>('.box-edge-resize-hit-ne')
    .attr('x', (d) => widthOf(d) - EDGE_RESIZE_HIT_SIZE)
    .attr('y', -EDGE_RESIZE_HIT_SIZE)
    .attr('width', EDGE_RESIZE_HIT_SIZE * 2)
    .attr('height', EDGE_RESIZE_HIT_SIZE * 2);
  selection.select<SVGRectElement>('.box-edge-resize-hit-nw')
    .attr('x', -EDGE_RESIZE_HIT_SIZE)
    .attr('y', -EDGE_RESIZE_HIT_SIZE)
    .attr('width', EDGE_RESIZE_HIT_SIZE * 2)
    .attr('height', EDGE_RESIZE_HIT_SIZE * 2);
  selection.select<SVGRectElement>('.box-edge-resize-hit-se')
    .attr('x', (d) => widthOf(d) - EDGE_RESIZE_HIT_SIZE)
    .attr('y', (d) => heightOf(d) - EDGE_RESIZE_HIT_SIZE)
    .attr('width', EDGE_RESIZE_HIT_SIZE * 2)
    .attr('height', EDGE_RESIZE_HIT_SIZE * 2);
  selection.select<SVGRectElement>('.box-edge-resize-hit-sw')
    .attr('x', -EDGE_RESIZE_HIT_SIZE)
    .attr('y', (d) => heightOf(d) - EDGE_RESIZE_HIT_SIZE)
    .attr('width', EDGE_RESIZE_HIT_SIZE * 2)
    .attr('height', EDGE_RESIZE_HIT_SIZE * 2);

  selection.select<SVGRectElement>('.box-port-left')
    .attr('x', -BOX_PORT_WIDTH - 5)
    .attr('y', NETWORK_BOX_TITLE_HEIGHT / 2 - BOX_PORT_HEIGHT / 2)
    .attr('width', BOX_PORT_WIDTH)
    .attr('height', BOX_PORT_HEIGHT)
    .attr('rx', 2)
    .attr('fill', '#0f172a')
    .attr('stroke', (d) => d.color)
    .attr('stroke-width', 1.2)
    .attr('opacity', 1)
    .style('cursor', 'crosshair');

  selection.select<SVGRectElement>('.box-port-right')
    .attr('x', (d) => widthOf(d) + 5)
    .attr('y', NETWORK_BOX_TITLE_HEIGHT / 2 - BOX_PORT_HEIGHT / 2)
    .attr('width', BOX_PORT_WIDTH)
    .attr('height', BOX_PORT_HEIGHT)
    .attr('rx', 2)
    .attr('fill', '#0f172a')
    .attr('stroke', (d) => d.color)
    .attr('stroke-width', 1.2)
    .attr('opacity', 1)
    .style('cursor', 'crosshair');

  selection.selectAll<SVGRectElement, NetworkBoxDatum>('.box-port')
    .style('pointer-events', 'all')
    .raise();
}

export function mountNetworkBoxStructure(
  selection: d3.Selection<SVGGElement, NetworkBoxDatum, SVGGElement, unknown>,
) {
  selection.each(function () {
    const g = d3.select(this);
    if (!g.select('.box-body').node()) {
      g.append('rect').attr('class', 'box-body').style('pointer-events', 'all').style('cursor', 'pointer');
    }
    if (!g.select('.box-title').node()) {
      g.append('rect').attr('class', 'box-title').style('cursor', 'move');
    }
    if (!g.select('.box-title-text').node()) {
      g.append('text').attr('class', 'box-title-text').style('pointer-events', 'none');
    }
    if (!g.select('.box-count').node()) {
      g.append('text').attr('class', 'box-count').style('pointer-events', 'none');
    }
    if (!g.select('.box-open-view').node()) {
      const open = g.append('g').attr('class', 'box-open-view');
      open.append('rect').attr('class', 'box-open-view-bg');
      open.append('text').attr('class', 'box-open-view-text').style('pointer-events', 'none');
    }
    if (!g.select('.box-view-switch').node()) {
      const viewSwitch = g.append('g').attr('class', 'box-view-switch');
      viewSwitch.append('rect').attr('class', 'box-view-switch-bg');
      viewSwitch.append('text').attr('class', 'box-view-switch-text').style('pointer-events', 'none');
    }
    if (!g.select('.box-resize-handle').node()) {
      g.append('rect').attr('class', 'box-resize-handle');
    }
    if (!g.select('.box-port-left').node()) {
      g.append('rect').attr('class', 'box-port box-port-left');
    }
    if (!g.select('.box-port-right').node()) {
      g.append('rect').attr('class', 'box-port box-port-right');
    }
    for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      if (!g.select(`.box-edge-resize-hit-${edge}`).node()) {
        g.append('rect')
          .attr('class', `box-edge-resize-hit box-edge-resize-hit-${edge}`)
          .attr('data-edge', edge);
      }
    }
  });
}

export function clampNetworkBoxSize(width: number, height: number) {
  return {
    width: Math.max(NETWORK_BOX_MIN_WIDTH, width),
    height: Math.max(NETWORK_BOX_MIN_HEIGHT, height),
  };
}

export interface BoxMoveInteraction {
  id: string;
  type: 'move';
  startX: number;
  startY: number;
  visualX: number;
  visualY: number;
}

export interface BoxResizeInteraction {
  id: string;
  type: 'resize';
  edge: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  visualX: number;
  visualY: number;
  visualWidth: number;
  visualHeight: number;
  dw: number;
  dh: number;
}

export type BoxInteraction = BoxMoveInteraction | BoxResizeInteraction;

export function networkBoxTransform(
  d: NetworkBoxDatum,
  interaction: BoxInteraction | null,
): string {
  if (interaction?.id === d.id && interaction.type === 'move') {
    return `translate(${interaction.visualX},${interaction.visualY})`;
  }
  if (interaction?.id === d.id && interaction.type === 'resize') {
    return `translate(${interaction.visualX},${interaction.visualY})`;
  }
  return `translate(${d.x},${d.y})`;
}

export function networkBoxSize(
  d: NetworkBoxDatum,
  interaction: BoxInteraction | null,
): { width: number; height: number } {
  if (interaction?.id === d.id && interaction.type === 'resize') {
    return { width: interaction.visualWidth, height: interaction.visualHeight };
  }
  return { width: d.width, height: d.height };
}
