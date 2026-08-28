# Mind Palace · 思维宫殿

个人工作记忆与思维可视化系统（MVP）。

## 功能

- **关注区**：管理当前关注点（研究 / 工作 / 个人），支持优先级、固定、衰减排序
- **思维图谱**：D3 力导向布局，有机网络可视化，关注项联动高亮
- **快速捕获**：`Ctrl+K` 快速录入思维片段并关联节点
- **本地存储**：数据保存在浏览器 `localStorage`，支持 JSON 导出

## 快速开始

```bash
git clone https://github.com/onrefy-mono/mindPalace.git
cd mindPalace
npm install
npm run dev
```

浏览器打开终端显示的本地地址（通常是 http://localhost:5173）。

详细使用说明见 **[USAGE.md](./USAGE.md)**。

## 项目结构

```
mind-palace/
├── data/seed.json          # 种子数据
├── src/
│   ├── components/         # UI 组件
│   ├── stores/             # Zustand 状态
│   ├── lib/                # 衰减、布局、存储
│   └── types/              # 类型定义
```

## 数据模型

- `FocusItem` — 关注区（工作记忆）
- `MindNode` — 思维节点（语义记忆）
- `MindEdge` — 节点关系

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+K` | 快速捕获 |

## 后续计划

- [ ] Markdown 笔记挂接节点
- [ ] 向量 RAG 检索
- [ ] MCP 集成 Cursor 外脑
