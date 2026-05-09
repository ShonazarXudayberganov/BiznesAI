import React, { useState } from 'react';
import DOMPurify from 'dompurify';

/**
 * PremiumMD — yangi markdown render premium UX bilan.
 *
 * Qo'llab-quvvatlanadi:
 *   - Headings (H1-H4) — gold/teal accent ranglar
 *   - Tables — gradient header, zebra striping, hover, raqamlar rang-kodlash
 *   - Code blocks — header bar + Copy tugmasi + til ko'rsatkichi
 *   - Inline code
 *   - Blockquotes — left gradient bar + soft background
 *   - Special callouts: > [!warning], > [!tip], > [!key], > [!metric "Sotuv"]
 *   - Bullet/numbered lists — gold dot + indent guide
 *   - Bold raqamlar — pill background
 *   - Foiz rang-kodlash (+yashil, -qizil)
 *   - Horizontal rule (---)
 */

const sanitize = (html) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'code', 'span', 'br', 'a'],
    ALLOWED_ATTR: ['class', 'href', 'target', 'title'],
  });

// Inline matn formatlash — bold, italic, code, raqamlar rang
function formatInline(text) {
  let r = String(text);
  // Bold
  r = r.replace(/\*\*(.+?)\*\*/g, '<strong class="pmd-bold">$1</strong>');
  // Italic
  r = r.replace(/\*(.+?)\*/g, '<em class="pmd-italic">$1</em>');
  // Inline code
  r = r.replace(/`([^`]+)`/g, '<code class="pmd-inline-code">$1</code>');
  // Foiz raqam +/-
  r = r.replace(/([\+\-]?\d[\d,.]*\s*%)/g, (m) => {
    const isNeg = m.trim().startsWith('-');
    return `<span class="pmd-pct ${isNeg ? 'pmd-pct-neg' : 'pmd-pct-pos'}">${m}</span>`;
  });
  // [text](url) link
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="pmd-link">$1</a>');
  return sanitize(r);
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
    }
  };
  return (
    <div className="pmd-code">
      <div className="pmd-code-head">
        <span className="pmd-code-lang">{lang || 'kod'}</span>
        <button className="pmd-code-copy" onClick={onCopy}>
          {copied ? '✓ Nusxalandi' : 'Nusxa olish'}
        </button>
      </div>
      <pre className="pmd-code-body">{code}</pre>
    </div>
  );
}

function Callout({ kind, title, children }) {
  const cfg = {
    warning: { icon: '⚠️', label: 'Diqqat' },
    tip: { icon: '💡', label: 'Maslahat' },
    key: { icon: '🎯', label: 'Asosiy' },
    metric: { icon: '📊', label: 'Ko\'rsatkich' },
    info: { icon: 'ℹ️', label: 'Ma\'lumot' },
    success: { icon: '✅', label: 'Muvaffaqiyat' },
  }[kind] || { icon: 'ℹ️', label: 'Eslatma' };

  return (
    <div className={`pmd-callout pmd-callout-${kind}`}>
      <div className="pmd-callout-head">
        <span className="pmd-callout-icon">{cfg.icon}</span>
        <span className="pmd-callout-label">{title || cfg.label}</span>
      </div>
      <div className="pmd-callout-body">{children}</div>
    </div>
  );
}

function Table({ rows }) {
  if (!rows.length) return null;
  const hdr = rows[0];
  const body = rows.slice(1);

  // Numerik ustunni aniqlash (asosan raqam bo'lgan ustunlar)
  const numericCols = new Set();
  hdr.forEach((_, ci) => {
    let nums = 0, total = 0;
    body.forEach(row => {
      const cell = (row[ci] || '').replace(/[*`]/g, '').trim();
      if (cell) {
        total++;
        if (/^[\+\-]?\d[\d,.]*\s*[%]?$/.test(cell.replace(/[*`]/g, ''))) nums++;
      }
    });
    if (total > 1 && nums / total >= 0.6) numericCols.add(ci);
  });

  return (
    <div className="pmd-table-wrap">
      <table className="pmd-table">
        <thead>
          <tr>
            {hdr.map((h, j) => (
              <th key={j} className={numericCols.has(j) ? 'is-numeric' : ''}
                dangerouslySetInnerHTML={{ __html: formatInline(h) }} />
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((c, ci) => (
                <td key={ci} className={numericCols.has(ci) ? 'is-numeric' : ''}
                  dangerouslySetInnerHTML={{ __html: formatInline(c) }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PremiumMD({ text }) {
  if (!text) return null;
  const lines = String(text).split('\n');
  const elements = [];
  let i = 0;
  let listBuffer = null; // { type: 'ul'|'ol', items: [] }

  const flushList = () => {
    if (!listBuffer || listBuffer.items.length === 0) return;
    const Tag = listBuffer.type === 'ol' ? 'ol' : 'ul';
    elements.push(
      <Tag key={`l${elements.length}`} className={`pmd-list pmd-list-${listBuffer.type}`}>
        {listBuffer.items.map((it, j) => (
          <li key={j} dangerouslySetInnerHTML={{ __html: formatInline(it) }} />
        ))}
      </Tag>
    );
    listBuffer = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ─ Code block ─
    if (trimmed.startsWith('```')) {
      flushList();
      const lang = trimmed.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      elements.push(<CodeBlock key={`c${i}`} lang={lang} code={codeLines.join('\n')} />);
      continue;
    }

    // ─ Special callout: > [!kind] body... ─
    const calloutMatch = trimmed.match(/^>\s*\[!(\w+)\](?:\s+(.+))?$/);
    if (calloutMatch) {
      flushList();
      const kind = calloutMatch[1].toLowerCase();
      const title = calloutMatch[2] || '';
      // Continuation lines starting with >
      const bodyLines = [];
      i++;
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        bodyLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const bodyHtml = bodyLines.join('\n').trim();
      elements.push(
        <Callout key={`co${i}`} kind={kind} title={title}>
          <div dangerouslySetInnerHTML={{ __html: formatInline(bodyHtml).replace(/\n/g, '<br/>') }} />
        </Callout>
      );
      continue;
    }

    // ─ Regular blockquote ─
    if (trimmed.startsWith('> ')) {
      flushList();
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote key={`q${i}`} className="pmd-quote"
          dangerouslySetInnerHTML={{ __html: formatInline(quoteLines.join(' ')) }} />
      );
      continue;
    }

    // ─ Table ─
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList();
      const tableRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const row = lines[i].trim();
        if (row.replace(/[|\-\s:]/g, '').length > 0) {
          tableRows.push(row.split('|').filter(c => c.length > 0 || c === '').map(c => c.trim()).filter((_, j, arr) => j > 0 || arr[0] !== '').filter(c => c !== ''));
        }
        i++;
      }
      // Repair if filter ate empties
      const cleaned = tableRows.map(row => row.filter(c => c !== ''));
      elements.push(<Table key={`t${i}`} rows={cleaned} />);
      continue;
    }

    // ─ Headings ─
    if (trimmed.startsWith('#### ')) {
      flushList();
      elements.push(<h4 key={`h4-${i}`} className="pmd-h4" dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(5)) }} />);
      i++; continue;
    }
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={`h3-${i}`} className="pmd-h3" dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(4)) }} />);
      i++; continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={`h2-${i}`} className="pmd-h2"><span className="pmd-h2-bar" /><span dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(3)) }} /></h2>);
      i++; continue;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(<h1 key={`h1-${i}`} className="pmd-h1" dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(2)) }} />);
      i++; continue;
    }

    // ─ Horizontal rule ─
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushList();
      elements.push(<div key={`hr${i}`} className="pmd-hr" />);
      i++; continue;
    }

    // ─ Numbered list ─
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      if (!listBuffer || listBuffer.type !== 'ol') {
        flushList();
        listBuffer = { type: 'ol', items: [] };
      }
      listBuffer.items.push(olMatch[2]);
      i++; continue;
    }

    // ─ Bullet list ─
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      if (!listBuffer || listBuffer.type !== 'ul') {
        flushList();
        listBuffer = { type: 'ul', items: [] };
      }
      listBuffer.items.push(trimmed.slice(2));
      i++; continue;
    }

    // ─ Empty line ─
    if (!trimmed) {
      flushList();
      i++; continue;
    }

    // ─ Paragraph ─
    flushList();
    elements.push(
      <p key={`p${i}`} className="pmd-p"
        dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />
    );
    i++;
  }

  flushList();

  return <div className="pmd">{elements}</div>;
}
