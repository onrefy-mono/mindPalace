# Mind Palace Project Brief

This document is a quick project map for AI assistants after context cleanup. Read it before making changes in this repository.

## Core Rule

Never modify JSON files that store user data.

Protected data includes:

- `C:\Users\admin.MANJUU-ALGDCGSO\.mindpalace\data.json`, the runtime user-data file.
- `data/seed.json`, the seed data used when runtime data does not exist or reset is triggered.
- JSON files under `exported/` and `restored/` when they contain Mind Palace data.
- Archive payloads or generated packages that contain Mind Palace data.

Reading these files for diagnosis is allowed. Writing, reformatting, regenerating, resetting, deleting, or overwriting them is not allowed unless the user explicitly asks for that specific data file to be changed.

## Project Overview

Mind Palace is a local personal work-memory and thought-graph application.

Main capabilities:

- Focus area for active concerns and priorities.
- D3-based thought graph visualization.
- Quick capture workflow for adding thoughts.
- Local persistence through a small server API.
- Import/export workflows for moving data. The encrypted package CLI has been moved to the sibling `mind-palace-pack-tool` project.

The app is currently an MVP-style local tool, not a multi-user hosted service.

## Tech Stack

- Vite
- React
- TypeScript
- Zustand
- D3
- Tailwind CSS via `@tailwindcss/vite`
- Node server middleware through a Vite plugin

Important scripts in `package.json`:

- `npm run dev`: starts Vite on `0.0.0.0`.
- `npm run build`: runs TypeScript build and Vite build.
- `npm run lint`: runs ESLint.
- `npm run preview`: builds and runs `server/index.ts`.
- Packaging is handled by the sibling `D:\azeProjects\Projects\mind-palace-pack-tool` CLI, not by this app's npm scripts.

## Main Paths

- `src/App.tsx`: main app shell.
- `src/main.tsx`: React entry.
- `src/components/`: UI components.
- `src/components/GraphCanvas/`: graph canvas, graph panels, node and edge detail UI.
- `src/components/FocusPanel/`: focus-related UI.
- `src/components/QuickCapture/`: quick capture UI.
- `src/stores/graphStore.ts`: graph state and graph mutations.
- `src/stores/focusStore.ts`: focus state and focus mutations.
- `src/lib/storage.ts`: frontend storage client and in-memory cache.
- `src/lib/history.ts`: undo/history snapshot behavior.
- `src/lib/ai/`: AI configuration, OpenAI-compatible client, prompts, and selection-context export.
- `src/lib/d3Graph.ts`: graph rendering/layout behavior.
- `src/lib/networkBox.ts`: group/box geometry and normalization.
- `src/components/AI/`: AI modals and AI-specific UI.
- `src/components/Settings/`: global settings modal and settings sections.
- `server/apiHandler.ts`: local API routes.
- `server/dataService.ts`: reads and writes persisted Mind Palace data.
- `server/paths.ts`: defines the runtime data location.
- `server/vitePlugin.ts`: connects the API handler to Vite.
- `scripts/`: performance utilities.
- `data/seed.json`: seed data, protected as user-data-adjacent JSON.

## Data Storage Model

Runtime data is stored outside the repository:

```text
C:\Users\admin.MANJUU-ALGDCGSO\.mindpalace\data.json
```

The server path is defined in `server/paths.ts`:

```ts
export const MIND_PALACE_DIR = path.join(os.homedir(), '.mindpalace');
export const DATA_FILE = path.join(MIND_PALACE_DIR, 'data.json');
```

The data service in `server/dataService.ts` behaves like this:

- `readMindPalaceData(seedPath)` reads runtime data.
- If runtime data does not exist, it reads `data/seed.json`, writes it to the runtime data file, and returns it.
- `writeMindPalaceData(data)` writes formatted JSON to the runtime data file.
- `resetMindPalaceData(seedPath)` loads seed data and overwrites runtime data.

Because of the core rule, AI assistants must not call workflows or make edits that intentionally modify these protected JSON files without explicit user confirmation.

## API Behavior

`server/apiHandler.ts` handles:

- `GET /api/access`: reports whether the request can write.
- `GET /api/data`: reads Mind Palace data.
- `PUT /api/data`: writes Mind Palace data, allowed only for local requests.
- `POST /api/data/reset`: resets runtime data from seed, allowed only for local requests.
- `GET /api/storage/info`: returns the runtime storage path.

Write access is restricted by remote address. Localhost and `127.0.0.1` are writable; other access is read-only.

## Frontend Storage Flow

`src/lib/storage.ts` keeps an in-memory cache of Mind Palace data.

Important functions:

- `initStorage()`: fetches access info, loads data, clears history.
- `loadData()`: returns cached data after initialization.
- `saveData(data)`: asserts write access, updates cache, queues a `PUT /api/data`.
- `flushStorage()`: waits for queued saves and raises save errors.
- `exportData(data)`: downloads a JSON export in the browser.
- `resetData()`: calls `POST /api/data/reset`.
- `getStoragePath()`: returns server-reported data path.

AI code changes should be careful around `saveData`, `resetData`, and API write routes because they directly affect protected user data during app usage.

## AI Feature Notes

The first AI feature is selection-set operations for graph nodes.

UI:

- `src/components/GraphCanvas/SelectionToolbar.tsx` renders a floating toolbar when nodes or groups are selected.
- The toolbar currently provides `AI 操作` and `复制结构`.
- `AI 操作` opens `src/components/AI/AiSelectionAnalysisModal.tsx`.

AI configuration:

- Stored in browser `localStorage` under `mind-palace-ai-config`.
- Contains API Key, OpenAI-compatible Base URL, and model name.
- This configuration is not written to Mind Palace user-data JSON.
- The global settings entry is in the header through `HeaderBar`.
- `src/components/Settings/SettingsModal.tsx` owns the settings modal.
- `src/components/Settings/AiSettingsSection.tsx` owns AI settings.

AI client and prompts:

- `src/lib/ai/client.ts` calls an OpenAI-compatible `/chat/completions` endpoint.
- `src/lib/ai/actions.ts` defines AI Actions and their prompt builders.
- `src/lib/ai/prompts.ts` remains as a compatibility wrapper.
- `src/lib/ai/selectionContext.ts` exports selected nodes, selected groups, internal edges, external one-hop edges, nearby nodes, and graph scope.

AI Actions:

- `task_brief`: turns selected goals/tasks/projects into an AI-executable task brief.
- `writing_brief`: turns concepts and relationships into document/PPT-ready writing.
- `graph_suggestions`: produces read-only graph improvement suggestions and a JSON draft for future node/edge creation flows.

Data safety:

- AI analysis is read-only in the first implementation.
- Generated text is held in React state and can be copied by the user.
- It does not call `saveData`, does not modify graph state, and does not write protected JSON files.
- `AiSelectionAnalysisModal` reads the current AI config but does not edit it; config editing belongs to global settings.
- `graph_suggestions` only displays proposed graph changes. It does not apply them.

## State Management Notes

`src/stores/graphStore.ts` owns graph state:

- nodes
- edges
- groups
- selected node/edge/group IDs
- graph navigation context
- link mode
- edge label mode
- global text mode
- graph mutations such as add, update, remove, reverse, group movement, and group views

Graph mutations usually call `persistGraph`, which loads cached data, changes `nodes`, `edges`, or `groups`, and calls `saveData`.

`src/stores/focusStore.ts` owns focus-related state and may update linked node IDs. It also persists through `saveData`.

## Current Git Context Noted During Initial Review

At the time this brief was created, the working tree already had unrelated changes in:

- `.gitignore`
- `package.json`
- `src/App.tsx`
- `src/components/GraphCanvas/MindGraph.tsx`
- `src/lib/d3Graph.ts`
- `src/stores/graphStore.ts`
- `scripts/`

Do not revert or overwrite these changes unless the user explicitly asks.

## Suggested AI Startup Routine

When starting work after context cleanup:

1. Read `AGENTS.md`.
2. Read this file, `doc/project-brief.md`.
3. Run `git status --short`.
4. Inspect only the files needed for the task.
5. Avoid protected JSON data files unless read-only inspection is necessary.

## Useful Commands

```bash
npm run dev
npm run build
npm run lint
git status --short
rg --files
```

On Windows PowerShell, use `Get-Content -Raw <file>` for reading files and prefer `rg` for searching.
