import { useState, useEffect } from 'react';
import { api } from '../api';

interface ParseViewerProps {
  narrative: string;
  reportId?: string;
}

/**
 * Collapsible displaCy parse tree panel.
 * Shows the spaCy dependency parse (dep) or named entity recognition (ent)
 * as an interactive SVG, helping verify that SVO pattern matching and
 * negation detection in nlp_analysis.py are hitting the expected tokens.
 *
 * The SVG is injected via dangerouslySetInnerHTML because React cannot
 * natively mount raw SVG fragments. displaCy escapes all token text
 * via html.escape() internally, so XSS risk from narrative content is low.
 */
export default function ParseViewer({ narrative, reportId }: ParseViewerProps) {
  const [open, setOpen]           = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading]     = useState(false);
  const [depHtml, setDepHtml]     = useState('');
  const [entHtml, setEntHtml]     = useState('');
  const [error, setError]         = useState('');
  const [view, setView]           = useState<'dep' | 'ent'>('dep');

  // When a different report loads, reset and pre-populate with its narrative
  useEffect(() => {
    setInputText(narrative || '');
    setDepHtml('');
    setEntHtml('');
    setError('');
  }, [narrative]);

  const handleRun = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.visualizeParse(inputText.trim());
      setDepHtml(result.dep_html);
      setEntHtml(result.ent_html);
    } catch (e: any) {
      setError(e?.message ?? 'Parse request failed');
    } finally {
      setLoading(false);
    }
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 10px',
    background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border)',
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'var(--text-2)',
    cursor: 'pointer', userSelect: 'none',
  };

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 10.5, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
    border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--surface-2)',
    color: active ? '#fff' : 'var(--text-2)',
    fontWeight: active ? 700 : 400,
  });

  if (!open) {
    return (
      <div style={{ marginBottom: 6 }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            fontSize: 10.5, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text-2)', fontWeight: 600, letterSpacing: '0.04em',
          }}
        >
          ▶ Parse Tree
        </button>
      </div>
    );
  }

  const activeHtml = view === 'dep' ? depHtml : entHtml;

  return (
    <div style={{
      marginBottom: 8, border: '1px solid var(--border)',
      borderRadius: 'var(--radius, 6px)', overflow: 'hidden',
      background: 'var(--surface)',
    }}>
      {/* Header */}
      <div style={headerStyle} onClick={() => setOpen(false)}>
        <span style={{ flex: 1 }}>▼ Parse Tree{reportId ? ` — ${reportId}` : ''}</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          click to collapse
        </span>
      </div>

      {/* Controls */}
      <div style={{ padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        <textarea
          value={inputText}
          onChange={e => { setInputText(e.target.value); setDepHtml(''); setEntHtml(''); }}
          rows={3}
          placeholder="Paste or edit a sentence to parse…"
          style={{
            flex: 1, minWidth: 240, fontSize: 11.5, padding: '5px 8px',
            borderRadius: 4, border: '1px solid var(--border)',
            background: 'var(--surface-2)', color: 'var(--text-1)',
            resize: 'vertical', fontFamily: 'monospace',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={handleRun}
            disabled={loading || !inputText.trim()}
            style={{
              fontSize: 11, padding: '4px 14px', borderRadius: 4, cursor: 'pointer',
              border: '1px solid var(--accent)',
              background: 'var(--accent)', color: '#fff', fontWeight: 700,
              opacity: loading || !inputText.trim() ? 0.5 : 1,
            }}
          >
            {loading ? 'Parsing…' : 'Run'}
          </button>
          {(depHtml || entHtml) && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={toggleBtnStyle(view === 'dep')} onClick={() => setView('dep')}>Dep</button>
              <button style={toggleBtnStyle(view === 'ent')} onClick={() => setView('ent')}>Ent</button>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--red, #B91C1C)', background: 'var(--red-pale, #FEF2F2)' }}>
          {error}
        </div>
      )}

      {/* SVG output */}
      {activeHtml ? (
        <div
          style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 420, padding: '10px 12px', background: '#fff' }}
          /* displaCy SVG is machine-generated markup; token text is escaped by spaCy internally */
          dangerouslySetInnerHTML={{ __html: activeHtml }}
        />
      ) : !loading && (
        <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-3)' }}>
          Press <strong>Run</strong> to render the parse tree.
        </div>
      )}
    </div>
  );
}
