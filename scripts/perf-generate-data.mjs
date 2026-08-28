import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const perfDir = path.join(root, '.perf');
const datasetsDir = path.join(perfDir, 'datasets');

const DATASETS = [
  { name: 'small', nodes: 100, edges: 150 },
  { name: 'medium', nodes: 500, edges: 800 },
  { name: 'large', nodes: 2000, edges: 4000 },
];

const nodeTypes = ['concept', 'question', 'decision', 'goal', 'project', 'task', 'person', 'insight', 'event', 'experience'];
const edgeTypes = ['relates_to', 'part_of', 'blocks', 'depends_on', 'inspired_by'];
const domains = ['research', 'work', 'personal'];
const domainColors = {
  research: '#3b82f6',
  work: '#22c55e',
  personal: '#a855f7',
};

function mulberry32(seed) {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(list, index) {
  return list[index % list.length];
}

function createDataset({ name, nodes: nodeCount, edges: edgeCount }) {
  const random = mulberry32(nodeCount * 1009 + edgeCount * 9176);
  const createdAt = '2026-01-01T00:00:00.000Z';
  const nodes = [];
  const edges = [];
  const groups = [];

  const columns = Math.ceil(Math.sqrt(nodeCount));
  const spacing = nodeCount > 1000 ? 90 : 110;
  for (let i = 0; i < nodeCount; i += 1) {
    const type = pick(nodeTypes, i);
    const row = Math.floor(i / columns);
    const col = i % columns;
    nodes.push({
      id: `perf-node-${i}`,
      label: `${name} node ${i}`,
      type,
      layer: type === 'event' || type === 'experience' ? 'episodic' : 'semantic',
      parent_id: null,
      content: `Generated performance node ${i}`,
      tags: [`perf-${name}`, `bucket-${i % 10}`],
      status: type === 'goal' || type === 'task' ? 'active' : undefined,
      x: (col - columns / 2) * spacing + (random() - 0.5) * 30,
      y: (row - columns / 2) * spacing + (random() - 0.5) * 30,
      created_at: createdAt,
      updated_at: createdAt,
    });
  }

  const edgeKeys = new Set();
  for (let i = 0; edges.length < edgeCount; i += 1) {
    const sourceIndex = i % nodeCount;
    const jump = 1 + Math.floor(random() * Math.min(37, Math.max(2, nodeCount - 1)));
    const targetIndex = (sourceIndex + jump) % nodeCount;
    if (sourceIndex === targetIndex) continue;
    const key = `${sourceIndex}:${targetIndex}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({
      id: `perf-edge-${edges.length}`,
      source: `perf-node-${sourceIndex}`,
      target: `perf-node-${targetIndex}`,
      source_kind: 'node',
      target_kind: 'node',
      type: pick(edgeTypes, edges.length),
      weight: 1,
    });
  }

  const groupSize = Math.max(10, Math.floor(nodeCount / 20));
  const groupCount = Math.max(1, Math.min(12, Math.floor(nodeCount / groupSize / 2)));
  for (let i = 0; i < groupCount; i += 1) {
    const start = i * groupSize;
    const node_ids = nodes.slice(start, start + groupSize).map((node) => node.id);
    groups.push({
      id: `perf-group-${i}`,
      name: `${name} group ${i}`,
      color: pick(['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4'], i),
      node_ids,
      views: [
        {
          id: `perf-group-${i}-graph`,
          name: '图谱',
          type: 'graph',
          created_at: createdAt,
        },
      ],
      active_view_id: `perf-group-${i}-graph`,
      parent_id: null,
      x: (i % 4) * 420 - 840,
      y: Math.floor(i / 4) * 300 - 420,
      width: 360,
      height: 240,
      created_at: createdAt,
    });
  }

  const focus = domains.map((domain, index) => ({
    id: `perf-focus-${domain}`,
    title: `${name} ${domain} focus`,
    domain,
    status: 'active',
    color: domainColors[domain],
    sort_order: index,
    note: `Generated ${domain} focus for ${name} performance dataset`,
    linked_node_ids: nodes
      .filter((_, nodeIndex) => nodeIndex % domains.length === index)
      .slice(0, Math.max(4, Math.floor(nodeCount / 50)))
      .map((node) => node.id),
    created_at: createdAt,
  }));

  return { focus, nodes, edges, groups };
}

await fs.mkdir(datasetsDir, { recursive: true });

const manifest = [];
for (const dataset of DATASETS) {
  const data = createDataset(dataset);
  const file = path.join(datasetsDir, `${dataset.name}.json`);
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  manifest.push({
    name: dataset.name,
    file,
    focus: data.focus.length,
    nodes: data.nodes.length,
    edges: data.edges.length,
    groups: data.groups.length,
  });
}

await fs.writeFile(path.join(perfDir, 'datasets.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log('Generated performance datasets:');
for (const item of manifest) {
  console.log(`- ${item.name}: ${item.nodes} nodes, ${item.edges} edges, ${item.groups} groups`);
}
