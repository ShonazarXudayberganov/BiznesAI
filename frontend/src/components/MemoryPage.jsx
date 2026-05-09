import React, { useEffect, useState } from 'react';
import { MemoryAPI } from '../api.js';

/**
 * MemoryPage — AI eslab qolgan faktlar va pending kandidatlar.
 *
 * Holatlar:
 *   approved — AI har chat'da bu faktlardan foydalanadi
 *   pending — AI xuddi hozir suhbatdan extract qildi, foydalanuvchi tasdiqlashi kerak
 *
 * Foydalanuvchi:
 *   - Pending'ni ko'rib chiqib approve/reject qiladi
 *   - Approved'ni edit/pin/delete qiladi
 *   - Yangi fakt qo'lda qo'shadi
 */

const KIND_LABELS = {
  fact: { label: 'Fakt', color: 'var(--blue)', icon: '📌' },
  preference: { label: 'Afzallik', color: 'var(--gold)', icon: '⭐' },
  context: { label: 'Kontekst', color: 'var(--teal)', icon: '🔗' },
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now - d) / 3600000;
  if (diffH < 1) return `${Math.floor((now - d) / 60000)} daqiqa oldin`;
  if (diffH < 24) return `${Math.floor(diffH)} soat oldin`;
  if (diffH < 24 * 7) return `${Math.floor(diffH / 24)} kun oldin`;
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MemoryPage({ push }) {
  const [tab, setTab] = useState('approved'); // approved | pending
  const [approved, setApproved] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [filter, setFilter] = useState('all'); // all | fact | preference | context
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newKind, setNewKind] = useState('fact');

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    let firstErr = null;

    // Approved
    try {
      const a = await MemoryAPI.list();
      setApproved(a?.memories || []);
    } catch (e1) {
      console.error('[MemoryPage] approved fetch xato:', e1);
      if (!firstErr) firstErr = e1;
      setApproved([]);
    }

    // Pending
    try {
      const token = localStorage.getItem('bai_token') || '';
      const res = await fetch('/api/ai/memory/pending', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const p = await res.json();
        setPending(p?.memories || []);
      } else {
        const txt = await res.text().catch(() => '');
        const err = new Error(`Pending fetch ${res.status}: ${txt.slice(0, 100)}`);
        console.error('[MemoryPage] pending fail:', err);
        if (!firstErr) firstErr = err;
        setPending([]);
      }
    } catch (e2) {
      console.error('[MemoryPage] pending fetch xato:', e2);
      if (!firstErr) firstErr = e2;
      setPending([]);
    }

    if (firstErr) setLoadError(firstErr.message || String(firstErr));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const approve = async (id) => {
    try {
      await fetch(`/api/ai/memory/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('bai_token') || ''}` },
      });
      push?.('Fakt qo\'shildi ✓', 'ok');
      await load();
    } catch (e) { push?.('Xato: ' + e.message, 'error'); }
  };

  const reject = async (id) => {
    try {
      await fetch(`/api/ai/memory/${id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('bai_token') || ''}` },
      });
      await load();
    } catch (e) { push?.('Xato: ' + e.message, 'error'); }
  };

  const removeMem = async (id) => {
    if (!confirm('Bu faktni o\'chirib tashlaymi?')) return;
    try {
      await MemoryAPI.remove(id);
      push?.('O\'chirildi', 'ok');
      await load();
    } catch (e) { push?.('Xato: ' + e.message, 'error'); }
  };

  const togglePin = async (m) => {
    try {
      await MemoryAPI.update(m.id, { pinned: !m.pinned });
      await load();
    } catch (e) { push?.('Xato: ' + e.message, 'error'); }
  };

  const addFact = async () => {
    if (!newContent.trim()) return;
    try {
      await MemoryAPI.add(newContent.trim(), newKind, false);
      setNewContent('');
      setAdding(false);
      push?.('Yangi fakt qo\'shildi ✓', 'ok');
      await load();
    } catch (e) { push?.('Xato: ' + e.message, 'error'); }
  };

  const filtered = (tab === 'approved' ? approved : pending).filter(m => filter === 'all' || m.kind === filter);

  return (
    <div className="mem-page">
      {/* Header + add button */}
      <div className="mem-header">
        <div>
          <h1 className="mem-title">AI Memory</h1>
          <p className="mem-sub">
            Sun'iy intellekt sizni eslab qolganlari. {approved.length} fakt
            {pending.length > 0 && <span className="mem-pending-badge">{pending.length} ta yangi</span>}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(v => !v)}>
          {adding ? '× Bekor qilish' : '+ Yangi fakt'}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="mem-add-form">
          <textarea
            className="field"
            placeholder="Masalan: 'Mening biznesim — texnologiya kompaniyasi, asosan B2B SaaS sotamiz'"
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            rows={3}
          />
          <div className="mem-add-row">
            <select className="field" value={newKind} onChange={e => setNewKind(e.target.value)} style={{ maxWidth: 180 }}>
              <option value="fact">📌 Fakt</option>
              <option value="preference">⭐ Afzallik</option>
              <option value="context">🔗 Kontekst</option>
            </select>
            <button className="btn btn-primary btn-sm" onClick={addFact} disabled={!newContent.trim()}>Saqlash</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mem-tabs">
        <button
          className={`mem-tab ${tab === 'approved' ? 'active' : ''}`}
          onClick={() => setTab('approved')}
        >
          ✓ Tasdiqlangan <span className="mem-tab-count">{approved.length}</span>
        </button>
        <button
          className={`mem-tab ${tab === 'pending' ? 'active' : ''} ${pending.length > 0 ? 'has-pending' : ''}`}
          onClick={() => setTab('pending')}
        >
          ⏳ Kutilmoqda <span className="mem-tab-count">{pending.length}</span>
        </button>

        <div style={{ flex: 1 }} />

        {/* Kind filter */}
        <div className="mem-kind-filter">
          {['all', 'fact', 'preference', 'context'].map(k => (
            <button
              key={k}
              className={`mem-kind-btn ${filter === k ? 'active' : ''}`}
              onClick={() => setFilter(k)}
            >
              {k === 'all' ? 'Hammasi' : KIND_LABELS[k]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner (load error bo'lsa) */}
      {loadError && !loading && (
        <div className="mem-error-banner">
          <span>⚠</span>
          <div>
            <strong>Memory yuklab bo'lmadi</strong>
            <code>{loadError}</code>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={load}>Qayta urinish</button>
        </div>
      )}

      {/* Empty / Loading */}
      {loading && <div className="mem-empty"><div className="mem-empty-spinner" />Yuklanmoqda...</div>}

      {!loading && filtered.length === 0 && (
        <div className="mem-empty">
          {tab === 'pending' ? (
            <>
              <div className="mem-empty-icon">🌱</div>
              <div className="mem-empty-title">Hozircha yangi kandidatlar yo'q</div>
              <div className="mem-empty-msg">
                Chat'da gaplashing — AI muhim faktlarni avtomatik aniqlab, shu yerga qo'shadi.
                Siz tasdiqlasangiz, AI keyingi suhbatlarda ulardan foydalanadi.
              </div>
            </>
          ) : (
            <>
              <div className="mem-empty-icon">🧠</div>
              <div className="mem-empty-title">Memory bo'sh</div>
              <div className="mem-empty-msg">
                AI siz haqingizda hech narsa eslab qolmagan.
                Chat'da ishlasangiz yoki "+ Yangi fakt" bilan qo'lda qo'shsangiz, shu yerga to'planadi.
              </div>
            </>
          )}
        </div>
      )}

      {/* Memory cards */}
      {!loading && filtered.length > 0 && (
        <div className="mem-grid">
          {filtered.map(m => {
            const kind = KIND_LABELS[m.kind] || KIND_LABELS.fact;
            const isPending = tab === 'pending';
            return (
              <div key={m.id} className={`mem-card ${m.pinned ? 'is-pinned' : ''} ${isPending ? 'is-pending' : ''}`} style={{ '--kind-color': kind.color }}>
                <div className="mem-card-head">
                  <span className="mem-card-kind">
                    <span>{kind.icon}</span>
                    <span>{kind.label}</span>
                  </span>
                  {m.source === 'auto' && <span className="mem-card-badge">AI o'rgangan</span>}
                  {m.pinned && <span className="mem-card-pin" title="Pinned">📍</span>}
                </div>

                <div className="mem-card-content">{m.content}</div>

                <div className="mem-card-foot">
                  <span className="mem-card-date">{formatDate(m.created_at)}</span>

                  <div className="mem-card-actions">
                    {isPending ? (
                      <>
                        <button className="mem-action-btn mem-approve" onClick={() => approve(m.id)} title="Tasdiqlash">
                          ✓ Tasdiqlash
                        </button>
                        <button className="mem-action-btn mem-reject" onClick={() => reject(m.id)} title="Rad etish">
                          × Rad etish
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="mem-action-btn" onClick={() => togglePin(m)} title={m.pinned ? 'Pin olib tashlash' : 'Pin qilish'}>
                          {m.pinned ? '📍' : '📌'}
                        </button>
                        <button className="mem-action-btn mem-delete" onClick={() => removeMem(m.id)} title="O'chirish">
                          🗑
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer info */}
      {!loading && approved.length > 0 && tab === 'approved' && (
        <div className="mem-info-banner">
          💡 AI har chat'da yuqoridagi {Math.min(30, approved.length)} ta faktdan foydalanib sizni "tushunadi".
          Pin qo'yilgan faktlar har doim birinchi navbatda ishlatiladi.
        </div>
      )}
    </div>
  );
}
