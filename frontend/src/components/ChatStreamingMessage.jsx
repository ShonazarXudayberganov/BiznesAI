import React, { useState, useEffect, useRef, useMemo } from 'react';

/**
 * ChatStreamingMessage — premium streaming message UI.
 *
 * Holatlar (states):
 *   1. thinking — AI ichki fikrlash (gradient skeleton + pulsating dot)
 *   2. tools    — tool calls jarayoni (timeline + spinner status)
 *   3. streaming — matn keladi (mig'illovchi cursor + yumshoq fade-in)
 *   4. done     — tugagan (final markdown + footer chips)
 *
 * Props:
 *   - status: 'thinking' | 'tools' | 'streaming' | 'done' | 'error'
 *   - tools: [{ name, label, input, status, ms }]
 *   - thinkingText: string (extended thinking matni)
 *   - content: string (markdown matn — done yoki streaming holatda)
 *   - confidence: 'high' | 'medium' | 'low'
 *   - sourcesUsed: string[]
 *   - durationMs: number
 *   - errorText: string
 *   - renderMarkdown: (text) => ReactNode  — passed-in PremiumMD renderer
 */

const TOOL_ICON_MAP = {
  list_sources: '📚',
  get_source_schema: '🗂',
  search_rows: '🔎',
  aggregate: '🧮',
  group_by: '📊',
  get_distinct_values: '🔣',
  cross_source_search: '🌐',
  time_series: '📈',
  query_data: '⚡',
  semantic_search: '🧠',
  find_anomaly: '⚠️',
  compare_periods: '📐',
  forecast: '🔮',
  consult_specialist: '👤',
  save_memory: '💾',
  web_search: '🌍',
  code_execution: '🐍',
};

function ToolStep({ tool, isLast, runtime }) {
  const Icon = TOOL_ICON_MAP[tool.name] || '🔧';
  const status = tool.status || 'pending';
  const cls = `chat-tool-step is-${status}${isLast ? ' is-last' : ''}`;

  return (
    <div className={cls}>
      <div className="chat-tool-rail">
        <div className="chat-tool-dot">
          {status === 'done' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {status === 'running' && <div className="chat-tool-spinner" />}
          {status === 'pending' && <div className="chat-tool-pulse" />}
          {status === 'error' && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          )}
        </div>
        {!isLast && <div className="chat-tool-line" />}
      </div>
      <div className="chat-tool-card">
        <div className="chat-tool-card-head">
          <span className="chat-tool-icon">{Icon}</span>
          <span className="chat-tool-label">{tool.label || tool.name}</span>
          {tool.ms != null && status === 'done' && (
            <span className="chat-tool-time">{tool.ms < 1000 ? `${tool.ms}ms` : `${(tool.ms / 1000).toFixed(1)}s`}</span>
          )}
          {status === 'running' && runtime > 0 && (
            <span className="chat-tool-time chat-tool-time-live">{runtime < 1000 ? `${runtime}ms` : `${(runtime / 1000).toFixed(1)}s`}</span>
          )}
        </div>
        {tool.input && Object.keys(tool.input).length > 0 && (
          <ToolInputPreview input={tool.input} />
        )}
      </div>
    </div>
  );
}

function ToolInputPreview({ input }) {
  const [open, setOpen] = useState(false);
  const summary = Object.entries(input)
    .filter(([k]) => !k.startsWith('_'))
    .slice(0, 3)
    .map(([k, v]) => {
      let s = typeof v === 'string' ? v : JSON.stringify(v);
      if (s.length > 28) s = s.slice(0, 25) + '…';
      return `${k}: ${s}`;
    })
    .join(' · ');
  if (!summary) return null;
  return (
    <button className="chat-tool-summary" onClick={() => setOpen(o => !o)} title="Batafsil">
      <span className="chat-tool-summary-text">{summary}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .15s' }}>
        <polyline points="6 9 12 15 18 9" />
      </svg>
      {open && (
        <pre className="chat-tool-input-full" onClick={e => e.stopPropagation()}>
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </button>
  );
}

function ConfidenceBadge({ level }) {
  if (!level) return null;
  const cfg = {
    high: { lbl: 'Yuqori ishonch', score: 5, cls: 'high' },
    medium: { lbl: 'O\'rtacha ishonch', score: 3, cls: 'medium' },
    low: { lbl: 'Past ishonch', score: 1, cls: 'low' },
  }[level];
  if (!cfg) return null;
  return (
    <div className={`chat-confidence chat-confidence-${cfg.cls}`} title={`${cfg.score}/5`}>
      <div className="chat-confidence-bars">
        {[1, 2, 3, 4, 5].map(i => (
          <span key={i} className={`chat-confidence-bar ${i <= cfg.score ? 'is-on' : ''}`} />
        ))}
      </div>
      <span>{cfg.lbl}</span>
    </div>
  );
}

export default function ChatStreamingMessage({
  status = 'thinking',
  tools = [],
  thinkingText = '',
  content = '',
  confidence,
  sourcesUsed = [],
  durationMs,
  errorText,
  renderMarkdown,
}) {
  // Default: tool list HAR DOIM yopiq — foydalanuvchi xohlasa toggle qiladi
  const [toolsOpen, setToolsOpen] = useState(false);
  const [tickNow, setTickNow] = useState(Date.now());
  const startRef = useRef(Date.now());

  // Live timer for running tool (yangilanib turishi uchun)
  useEffect(() => {
    if (status === 'tools' || status === 'streaming') {
      const t = setInterval(() => setTickNow(Date.now()), 250);
      return () => clearInterval(t);
    }
  }, [status]);

  const lastRunningRuntime = useMemo(() => {
    const last = tools[tools.length - 1];
    if (!last || last.status !== 'running' || !last.startedAt) return 0;
    return tickNow - last.startedAt;
  }, [tools, tickNow]);

  const totalToolMs = useMemo(() => tools.reduce((a, t) => a + (t.ms || 0), 0), [tools]);
  const completedTools = tools.filter(t => t.status === 'done').length;

  // ── ERROR ──────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="chat-stream chat-stream-error">
        <div className="chat-stream-error-icon">⚠️</div>
        <div>
          <div className="chat-stream-error-title">Xato yuz berdi</div>
          <div className="chat-stream-error-body">{errorText || 'Noma\'lum xato'}</div>
        </div>
      </div>
    );
  }

  // PDF tool natijalarini topish
  const pdfArtifacts = useMemo(() => {
    return tools
      .filter(t => t.name === 'generate_pdf' && t.result?.url)
      .map(t => ({ url: t.result.url, filename: t.result.filename, sizeKb: t.result.sizeKb }));
  }, [tools]);

  // ── DONE ───────────────────────────────────────────────────
  if (status === 'done') {
    return (
      <div className="chat-stream chat-stream-done">
        {tools.length > 0 && (
          <div className="chat-stream-tools-collapsed">
            <button className="chat-stream-tools-toggle" onClick={() => setToolsOpen(o => !o)}>
              <span className="chat-stream-tools-icon">✓</span>
              <span className="chat-stream-tools-text">
                {tools.length} ta amal · {totalToolMs < 1000 ? `${totalToolMs}ms` : `${(totalToolMs / 1000).toFixed(1)}s`}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ transform: toolsOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {toolsOpen && (
              <div className="chat-stream-tools-list">
                {tools.map((t, i) => (
                  <ToolStep key={i} tool={t} isLast={i === tools.length - 1} runtime={0} />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="chat-stream-content">
          {renderMarkdown ? renderMarkdown(content) : <pre style={{ whiteSpace: 'pre-wrap' }}>{content}</pre>}
        </div>

        {pdfArtifacts.length > 0 && (
          <div className="chat-stream-pdfs">
            {pdfArtifacts.map((p, i) => (
              <a key={i} className="chat-stream-pdf-btn" href={p.url} target="_blank" rel="noopener noreferrer" download={p.filename}>
                <span className="chat-stream-pdf-icon">📄</span>
                <div className="chat-stream-pdf-meta">
                  <strong>PDF yuklab olish</strong>
                  <span>{p.filename} · {p.sizeKb}KB</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </a>
            ))}
          </div>
        )}

        {(confidence || sourcesUsed.length > 0 || durationMs != null) && (
          <div className="chat-stream-footer">
            {confidence && <ConfidenceBadge level={confidence} />}
            {sourcesUsed.length > 0 && (
              <div className="chat-stream-sources">
                {sourcesUsed.map((s, i) => (
                  <span key={i} className="chat-stream-source-chip">📎 {s}</span>
                ))}
              </div>
            )}
            {durationMs != null && (
              <span className="chat-stream-duration">
                ⏱ {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── THINKING / TOOLS / STREAMING ───────────────────────────
  const phaseClickable = tools.length > 0;
  return (
    <div className="chat-stream chat-stream-active">
      {/* Phase header — clickable agar tools bo'lsa */}
      <button
        type="button"
        className={`chat-stream-phase ${phaseClickable ? 'is-clickable' : ''}`}
        onClick={() => phaseClickable && setToolsOpen(o => !o)}
        disabled={!phaseClickable}
      >
        <div className="chat-stream-phase-icon">
          {status === 'thinking' && '💭'}
          {status === 'tools' && '🔧'}
          {status === 'streaming' && '✍️'}
        </div>
        <div className="chat-stream-phase-text">
          {status === 'thinking' && 'Mulohaza qilyapman'}
          {status === 'tools' && `Ma'lumotlarni tahlil qilyapman${tools.length > 0 ? ` · ${completedTools}/${tools.length}` : ''}`}
          {status === 'streaming' && (tools.length > 0 ? `Javob tayyorlayapman · ${tools.length} ta amal` : 'Javob tayyorlayapman')}
        </div>
        {phaseClickable && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{ transform: toolsOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s', opacity: 0.6 }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
        <div className="chat-stream-phase-pulse" />
      </button>

      {/* Thinking skeleton — faqat tool yo'q paytda */}
      {status === 'thinking' && !thinkingText && tools.length === 0 && (
        <div className="chat-stream-thinking">
          <div className="chat-stream-skeleton" style={{ width: '85%' }} />
          <div className="chat-stream-skeleton" style={{ width: '60%' }} />
          <div className="chat-stream-skeleton" style={{ width: '75%' }} />
        </div>
      )}

      {status === 'thinking' && thinkingText && (
        <div className="chat-stream-thinking-text">{thinkingText}</div>
      )}

      {/* Tools timeline — faqat foydalanuvchi ochsa */}
      {tools.length > 0 && toolsOpen && (
        <div className="chat-stream-tools-list">
          {tools.map((t, i) => (
            <ToolStep
              key={i}
              tool={t}
              isLast={i === tools.length - 1 && status !== 'streaming'}
              runtime={i === tools.length - 1 ? lastRunningRuntime : 0}
            />
          ))}
        </div>
      )}

      {/* Streaming content with cursor */}
      {status === 'streaming' && content && (
        <div className="chat-stream-content chat-stream-content-streaming">
          {renderMarkdown ? renderMarkdown(content) : <pre style={{ whiteSpace: 'pre-wrap' }}>{content}</pre>}
          <span className="chat-stream-cursor" />
        </div>
      )}
    </div>
  );
}
