import { useEffect, useMemo, useState } from 'react';
import { DOC_ARTICLES, DEFAULT_DOC_ID } from '../../docs/content';
import type { DocArticle, DocSection } from '../../docs/types';

interface DocsPanelProps {
  open: boolean;
  onClose: () => void;
}

function DocSectionView({ section }: { section: DocSection }) {
  return (
    <section className="mb-8 last:mb-0">
      {section.title && (
        <h3 className="mb-3 text-base font-semibold text-white">{section.title}</h3>
      )}
      {section.paragraphs?.map((p) => (
        <p key={p} className="mb-3 text-sm leading-relaxed text-slate-300">
          {p}
        </p>
      ))}
      {section.list && (
        <ul className="mb-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          {section.list.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {section.table && (
        <div className="mb-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {section.table.headers.map((h) => (
                  <th key={h} className="px-3 py-2 font-medium text-slate-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 text-slate-400">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {section.faq && (
        <dl className="space-y-4">
          {section.faq.map((item) => (
            <div key={item.q}>
              <dt className="text-sm font-medium text-slate-200">{item.q}</dt>
              <dd className="mt-1 text-sm text-slate-400">{item.a}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function DocArticleView({ article }: { article: DocArticle }) {
  return (
    <article>
      <header className="mb-6 border-b border-white/10 pb-4">
        <h2 className="text-2xl font-semibold text-white">{article.title}</h2>
        <p className="mt-1 text-sm text-slate-400">{article.description}</p>
      </header>
      {article.sections.map((section, i) => (
        <DocSectionView key={`${article.id}-${i}`} section={section} />
      ))}
    </article>
  );
}

export function DocsPanel({ open, onClose }: DocsPanelProps) {
  const [activeId, setActiveId] = useState(DEFAULT_DOC_ID);
  const [navCollapsed, setNavCollapsed] = useState(false);

  const activeArticle = useMemo(
    () => DOC_ARTICLES.find((a) => a.id === activeId) ?? DOC_ARTICLES[0],
    [activeId],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/70 backdrop-blur-sm">
      <div className="flex h-full w-full overflow-hidden border border-white/10 bg-slate-950 shadow-2xl md:m-4 md:rounded-2xl">
        <aside
          className={`flex shrink-0 flex-col border-r border-white/10 bg-slate-950/90 ${
            navCollapsed ? 'w-9 items-center' : 'w-56'
          }`}
        >
          {navCollapsed ? (
            <>
              <button
                type="button"
                onClick={() => setNavCollapsed(false)}
                className="flex h-9 w-full items-center justify-center border-b border-white/10 text-sm text-slate-300 hover:bg-white/5"
                title="展开文档目录"
                aria-label="展开文档目录"
              >
                &gt;
              </button>
              <div className="mt-3 text-[11px] font-medium tracking-widest text-slate-500 [writing-mode:vertical-rl]">
                文档
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-white/10 px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">文档中心</div>
                  <button
                    type="button"
                    onClick={() => setNavCollapsed(true)}
                    className="rounded border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    title="折叠文档目录"
                    aria-label="折叠文档目录"
                  >
                    &lt;
                  </button>
                </div>
                <h2 className="mt-1 text-lg font-semibold text-white">思维宫殿</h2>
              </div>
              <nav className="flex-1 overflow-y-auto p-2">
                {DOC_ARTICLES.map((article) => {
                  const active = article.id === activeId;
                  return (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => setActiveId(article.id)}
                      className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'bg-blue-500/15 text-blue-100'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }`}
                    >
                      <div className="text-sm font-medium">{article.title}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{article.description}</div>
                    </button>
                  );
                })}
              </nav>
            </>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
            <span className="text-xs text-slate-500">按 Esc 关闭</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
            >
              关闭
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6 md:px-10">
            <DocArticleView article={activeArticle} />
          </div>
        </div>
      </div>
    </div>
  );
}
