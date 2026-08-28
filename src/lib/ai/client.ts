import type { AiConfig } from './config';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export async function generateChatText(
  config: AiConfig,
  messages: AiMessage[],
): Promise<string> {
  if (!config.apiKey.trim()) {
    throw new Error('请先配置 AI API Key');
  }
  if (!config.model.trim()) {
    throw new Error('请先配置 AI 模型');
  }

  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model.trim(),
      messages,
      temperature: 0.4,
    }),
  });

  const body = (await response.json().catch(() => null)) as ChatCompletionResponse | null;
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `AI 请求失败 (${response.status})`);
  }

  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('AI 没有返回可用文本');
  }
  return text;
}
