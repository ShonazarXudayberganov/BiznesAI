import React, { useEffect, useRef, useState } from 'react';
import { AiBrainAPI } from '../api.js';

/**
 * AiBrainStream — universal streaming UI komponent.
 *
 * Brain'ga so'rov yuboradi va real-time:
 *   - "AI fikrlayapti" indikator
 *   - Tool chaqiruvlari ro'yxati (icon + label)
 *   - Token-by-token matn streaming
 *   - Final result + cost footer
 *   - Cap-hit holatida qisqa modal
 *
 * Foydalanish:
 *   <AiBrainStream
 *     intent="analytics.module"
 *     payload={{ moduleLabel: "Moliyaviy", activeSourceIds: [...] }}
 *     onDone={(result) => setResult(result.reply)}
 *     onError={(err) => alert(err.message)}
 *     autoStart={true}
 *   />
 */

const TOOL_LABELS = {
  list_sources: { icon: '📚', label: 'Manbalarni o\'rganmoqda' },
  search_rows: { icon: '🔎', label: 'Qatorlarda qidirmoqda' },
  semantic_search: { icon: '🧠', label: 'Semantic qidiruv' },
  aggregate: { icon: '🧮', label: 'Hisoblayapti' },
  group_by: { icon: '📊', label: 'Guruhlamoqda' },
  time_series: { icon: '📈', label: 'Vaqt trendini olmoqda' },
  cross_source_search: { icon: '🔗', label: 'Manbalarni bog\'lamoqda' },
  query_data: { icon: '🗂', label: 'Ma\'lumotni filterlayapti' },
  get_distinct_values: { icon: '🏷', label: 'Noyob qiymatlar' },
  get_source_schema: { icon: '📋', label: 'Sxemani ko\'rmoqda' },
  save_memory: { icon: '💾', label: 'Faktni eslab qoladi' },
  create_alert: { icon: '⚠️', label: 'Ogohlantirish yaratmoqda' },
  save_report: { icon: '📑', label: 'Hisobotni saqlamoqda' },
  web_search: { icon: '🌐', label: 'Internetdan qidirmoqda' },
};

function getToolDisplay(name) {
  return TOOL_LABELS[name] || { icon: '🔧', label: name };
}

export default function AiBrainStream({
  intent,
  payload = {},
  message,
  history,
  language = 'uz',
  thinkingBudget,
  autoStart = true,
  showCost = true,
  showThinking = false,
  showTools = true,
  className = '',
  onDone,
  onError,
  onProgress, // (text) => void — tashqaridan token streaming kuzatish uchun
  renderResult, // (final) => JSX — natijani custom render qilish (default: markdown)
}) {
  const [phase, setPhase] = useState('idle'); // idle | starting | streaming | done | error | capHit
  const [tools, setTools] = useState([]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState('');
  const [final, setFinal] = useState(null);
  const [error, setError] = useState(null);
  const [capInfo, setCapInfo] = useState(null);
  const abortRef = useRef(null);

  const start = () => {
    if (phase === 'streaming' || phase === 'starting') return;
    setPhase('starting');
    setTools([]);
    setText('');
    setThinking('');
    setFinal(null);
    setError(null);
    setCapInfo(null);

    const controller = new AbortController();
    abortRef.current = controller;

    AiBrainAPI.stream(intent, payload, (evt) => {
      if (evt.type === 'start') {
        setPhase('streaming');
      } else if (evt.type === 'tool') {
        const td = getToolDisplay(evt.data?.name || '');
        setTools(prev => [...prev, { ...td, name: evt.data?.name, input: evt.data?.input, t: Date.now() }]);
      } else if (evt.type === 'thinking' && evt.data?.text) {
        setThinking(prev => prev + evt.data.text);
      } else if (evt.type === 'delta' && typeof evt.data?.text === 'string') {
        setText(prev => {
          const next = prev + evt.data.text;
          if (onProgress) try { onProgress(next); } catch {}
          return next;
        });
      }
    }, { signal: controller.signal, message, history, language, thinkingBudget })
      .then(result => {
        setFinal(result);
        setPhase('done');
        if (onDone) try { onDone(result); } catch {}
      })
      .catch(err => {
        if (err.code === 'COST_CAP_HIT') {
          setCapInfo({ cap: err.cap, spent: err.spent });
          setPhase('capHit');
        } else if (err.name === 'AbortError') {
          setPhase('idle');
        } else {
          setError(err.message || String(err));
          setPhase('error');
          if (onError) try { onError(err); } catch {}
        }
      });
  };

  const cancel = () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
  };

  useEffect(() => {
    if (autoStart) start();
    return () => { try { abortRef.current?.abort(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ──
  if (phase === 'capHit') {
    return (
      <div className={`brain-stream brain-cap-hit ${className}`}>
        <div className="brain-icon">⛔</div>
        <div className="brain-cap-title">Kunlik AI limit tugadi</div>
        <div className="brain-cap-msg">
          Bugun {capInfo?.spent ? `$${Number(capInfo.spent).toFixed(3)}` : ''} sarfladingiz
          (kunlik limit: ${capInfo?.cap ? Number(capInfo.cap).toFixed(2) : '?'}).
        </div>
        <div className="brain-cap-hint">Ertaga avtomatik tiklanadi yoki adminga murojaat qiling.</div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className={`brain-stream brain-error ${className}`}>
        <div className="brain-icon">❌</div>
        <div className="brain-error-msg">{error}</div>
        <button className="brain-retry-btn" onClick={start}>Qayta urinish</button>
      </div>
    );
  }

  if (phase === 'idle' || phase === 'starting') {
    return (
      <div className={`brain-stream brain-idle ${className}`}>
        <button className="brain-start-btn" onClick={start}>Tahlilni boshlash</button>
      </div>
    );
  }

  // streaming yoki done
  const isDone = phase === 'done';
  const usage = final?.usage;
  const costInfo = (() => {
    if (!showCost || !usage) return null;
    // Frontend cost calc (Sonnet narxi taxminiy):
    const i = usage.input_tokens || 0;
    const o = (usage.output_tokens || 0) + (usage.thinking_tokens || 0);
    const cr = usage.cache_read_input_tokens || 0;
    const cw = usage.cache_creation_input_tokens || 0;
    const ws = usage.web_search_count || 0;
    // Default Sonnet — backend ham bir xil hisoblaydi, biz faqat preview ko'rsatamiz
    const cost = (i / 1e6) * 3 + (o / 1e6) * 15 + (cr / 1e6) * 0.3 + (cw / 1e6) * 3.75 + ws * 0.01;
    return { tokens: i + o + cr + cw, cost: cost < 0.01 ? `${(cost * 1000).toFixed(2)}m$` : `$${cost.toFixed(4)}`, ws };
  })();

  return (
    <div className={`brain-stream ${isDone ? 'brain-done' : 'brain-active'} ${className}`}>
      {/* Tools breadcrumbs */}
      {showTools && tools.length > 0 && (
        <div className="brain-tools">
          <div className="brain-tools-title">{isDone ? 'Bajarilgan amallar' : 'AI ishlamoqda'}</div>
          <div className="brain-tools-list">
            {tools.map((t, i) => (
              <span key={`${t.name}-${i}`} className="brain-tool-pill" title={t.input ? JSON.stringify(t.input) : ''}>
                <span className="brain-tool-icon">{t.icon}</span>
                <span>{t.label}</span>
              </span>
            ))}
            {!isDone && <span className="brain-tool-pill brain-tool-active"><span className="brain-tool-spinner" /> davom etmoqda</span>}
          </div>
        </div>
      )}

      {/* Thinking (foydalanuvchi yoqilgan bo'lsa) */}
      {showThinking && thinking && (
        <div className="brain-thinking">
          <details>
            <summary>AI fikrlash jarayoni</summary>
            <pre>{thinking}</pre>
          </details>
        </div>
      )}

      {/* Streaming text yoki final result */}
      <div className="brain-result">
        {renderResult ? renderResult(final || { reply: text }) : (
          <div className="brain-result-text">{isDone ? (final?.reply || text) : text}{!isDone && <span className="brain-cursor">▍</span>}</div>
        )}
      </div>

      {/* Cost footer */}
      {isDone && showCost && costInfo && (
        <div className="brain-footer">
          <span className="brain-footer-meta">
            {final?.iterations ? `${final.iterations} iter` : ''}{final?.toolCallsCount ? ` · ${final.toolCallsCount} tool` : ''}
            {costInfo.ws ? ` · ${costInfo.ws} 🌐` : ''}
            {costInfo.tokens ? ` · ${costInfo.tokens.toLocaleString()} tok` : ''}
          </span>
          <span className="brain-footer-cost" title="Bu chaqiruv narxi">{costInfo.cost}</span>
        </div>
      )}
    </div>
  );
}
