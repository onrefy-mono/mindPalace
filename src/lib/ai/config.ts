export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const AI_CONFIG_KEY = 'mind-palace-ai-config';

export const DEFAULT_AI_CONFIG: AiConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
};

export function readAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (!raw) return DEFAULT_AI_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AiConfig>;
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
        ? parsed.baseUrl.trim()
        : DEFAULT_AI_CONFIG.baseUrl,
      model: typeof parsed.model === 'string' && parsed.model.trim()
        ? parsed.model.trim()
        : DEFAULT_AI_CONFIG.model,
    };
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

export function saveAiConfig(config: AiConfig): void {
  localStorage.setItem(
    AI_CONFIG_KEY,
    JSON.stringify({
      apiKey: config.apiKey.trim(),
      baseUrl: config.baseUrl.trim() || DEFAULT_AI_CONFIG.baseUrl,
      model: config.model.trim() || DEFAULT_AI_CONFIG.model,
    }),
  );
}

export function clearAiConfig(): void {
  localStorage.removeItem(AI_CONFIG_KEY);
}
