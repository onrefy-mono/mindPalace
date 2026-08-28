import { useState, type FormEvent } from 'react';
import {
  DEFAULT_AI_CONFIG,
  clearAiConfig,
  readAiConfig,
  saveAiConfig,
  type AiConfig,
} from '../../lib/ai/config';

export function AiSettingsSection() {
  const [draft, setDraft] = useState<AiConfig>(() => readAiConfig());
  const [notice, setNotice] = useState('');

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    const next = {
      apiKey: draft.apiKey.trim(),
      baseUrl: draft.baseUrl.trim() || DEFAULT_AI_CONFIG.baseUrl,
      model: draft.model.trim() || DEFAULT_AI_CONFIG.model,
    };
    saveAiConfig(next);
    setDraft(next);
    setNotice('已保存');
  };

  const handleClear = () => {
    clearAiConfig();
    setDraft(DEFAULT_AI_CONFIG);
    setNotice('已清除');
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white">AI</h3>
        <p className="mt-1 text-xs text-slate-500">
          用于节点分析等 AI 功能。配置保存在浏览器 localStorage，不写入 Mind Palace 数据文件。
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <label className="block text-xs text-slate-500">
          API Key
          <input
            type="password"
            value={draft.apiKey}
            onChange={(event) =>
              setDraft((current) => ({ ...current, apiKey: event.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-400/50"
            placeholder="sk-..."
          />
        </label>

        <label className="block text-xs text-slate-500">
          Base URL
          <input
            value={draft.baseUrl}
            onChange={(event) =>
              setDraft((current) => ({ ...current, baseUrl: event.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-400/50"
          />
        </label>

        <label className="block text-xs text-slate-500">
          Model
          <input
            value={draft.model}
            onChange={(event) =>
              setDraft((current) => ({ ...current, model: event.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-400/50"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            保存配置
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            清除
          </button>
          {notice && <span className="text-xs text-emerald-300">{notice}</span>}
        </div>
      </form>
    </section>
  );
}
