import type { AiMessage } from './client';
import type { AiSelectionContext } from './selectionContext';

export type AiActionId = 'task_brief' | 'writing_brief' | 'graph_suggestions';

export interface AiAction {
  id: AiActionId;
  label: string;
  description: string;
  outputLabel: string;
  loadingLabel: string;
  buildMessages: (context: AiSelectionContext) => AiMessage[];
}

const BASE_SYSTEM_PROMPT = [
  '你是 Mind Palace 的个人知识管理助手。',
  '用户会给你一组来自思维图谱的节点、分组和关系。',
  '请只基于输入内容工作，不要编造不存在的信息。',
  '如果上下文不足，请明确标注不确定性。',
  '请使用中文输出。',
].join('\n');

function selectionPayload(context: AiSelectionContext): string {
  return JSON.stringify(context, null, 2);
}

function buildMessages(context: AiSelectionContext, instruction: string): AiMessage[] {
  return [
    {
      role: 'system',
      content: BASE_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: [
        instruction,
        '',
        'Mind Palace 选择集上下文：',
        '',
        selectionPayload(context),
      ].join('\n'),
    },
  ];
}

export const AI_ACTIONS: AiAction[] = [
  {
    id: 'task_brief',
    label: '生成任务指令',
    description: '把目标、任务、项目节点整理成可交给 AI 执行的任务 brief。',
    outputLabel: '任务指令',
    loadingLabel: '正在生成任务指令…',
    buildMessages: (context) =>
      buildMessages(
        context,
        [
          '请把下面的选择集整理成一份“给 AI 执行的任务指令”。',
          '输出必须按以下编号结构组织：',
          '',
          '1. 任务目标',
          '用 1-2 句话说明最终要达成什么。',
          '',
          '2. 背景上下文',
          '解释这些节点提供了哪些背景、前置条件或项目语境。',
          '',
          '3. 已知材料',
          '列出选择集中可以直接使用的信息、概念、约束或参考。',
          '',
          '4. 执行步骤',
          '给出清晰、可执行的步骤，适合交给另一个 AI 或自动化工具执行。',
          '',
          '5. 期望输出',
          '说明最终应该产出什么格式、内容或交付物。',
          '',
          '6. 验收标准',
          '列出 3 条以内判断任务是否完成的标准。',
        ].join('\n'),
      ),
  },
  {
    id: 'writing_brief',
    label: '生成表达文稿',
    description: '把概念、洞察和关系组织成适合文档或 PPT 的表达文本。',
    outputLabel: '表达文稿',
    loadingLabel: '正在组织表达文稿…',
    buildMessages: (context) =>
      buildMessages(
        context,
        [
          '请把下面的选择集整理成适合后续写文档或制作 PPT 的表达文稿。',
          '输出必须按以下编号结构组织：',
          '',
          '1. 核心观点',
          '用 1-2 句话概括这一组节点最想表达的观点。',
          '',
          '2. 逻辑展开',
          '按合理顺序解释概念之间的关系和推导过程。',
          '',
          '3. 可直接使用的正文',
          '写成一段自然、连贯、可以直接放进文档里的文字。',
          '',
          '4. PPT 要点',
          '列出 3-6 条适合转成幻灯片 bullet 的要点。',
          '',
          '5. 需要补充的信息',
          '如果选择集缺少关键信息，请列出缺口；没有则写“暂无明显缺口”。',
        ].join('\n'),
      ),
  },
  {
    id: 'graph_suggestions',
    label: '生成图谱建议',
    description: '为后续 AI 自动添加节点/关系做准备，仅生成建议，不自动写入。',
    outputLabel: '图谱建议',
    loadingLabel: '正在生成图谱建议…',
    buildMessages: (context) =>
      buildMessages(
        context,
        [
          '请基于下面的选择集生成“图谱改进建议”。',
          '第一部分输出简短解释，第二部分输出 JSON 草案。',
          '不要声称已经修改图谱；你只是在提出建议。',
          '',
          '请按以下结构输出：',
          '',
          '1. 简要判断',
          '说明这组节点当前表达了什么，以及图谱结构是否清晰。',
          '',
          '2. 建议 JSON',
          '输出一个 JSON 代码块，结构必须是：',
          '{',
          '  "summary": "对选择集的简短总结",',
          '  "missing_nodes": [',
          '    { "label": "建议新增节点名称", "type": "concept|question|decision|goal|project|task|person|insight|event|experience", "reason": "为什么需要它" }',
          '  ],',
          '  "suggested_edges": [',
          '    { "source_label": "源节点名称", "target_label": "目标节点名称", "type": "relates_to|part_of|blocks|depends_on|inspired_by", "reason": "为什么建议连接" }',
          '  ],',
          '  "questions": ["仍需用户澄清的问题"],',
          '  "next_actions": ["可以继续执行的动作"]',
          '}',
          '',
          '如果没有某类建议，对应数组请返回空数组。',
        ].join('\n'),
      ),
  },
];

export const DEFAULT_AI_ACTION_ID: AiActionId = 'task_brief';

export function getAiAction(id: AiActionId): AiAction {
  return AI_ACTIONS.find((action) => action.id === id) ?? AI_ACTIONS[0];
}
