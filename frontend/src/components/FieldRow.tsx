type ProvenanceState = 'unset' | 'ai_suggested' | 'analyst_filled' | 'reviewed';

const PROVENANCE_BORDER: Record<ProvenanceState, string> = {
  unset:          'transparent',
  ai_suggested:   '#D97706',
  analyst_filled: '#2563EB',
  reviewed:       '#16A34A',
};

const PROVENANCE_LABEL: Record<ProvenanceState, { text: string; color: string; bg: string; border: string } | null> = {
  unset:          null,
  ai_suggested:   { text: 'AI suggest', color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
  analyst_filled: { text: 'Analyst',    color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  reviewed:       { text: 'Reviewed',   color: '#166534', bg: '#F0FDF4', border: '#86EFAC' },
};

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onMarkReviewed?: () => void;
  type?: 'text' | 'yesno' | 'yesno-extended' | 'select' | 'textarea';
  options?: string[];
  suggested?: string;
  onAcceptSuggestion?: () => void;
  placeholder?: string;
  span?: boolean;
  badge?: React.ReactNode;
  provenance?: ProvenanceState;
}

const YES_NO_OPTIONS = ['yes', 'no', 'unclear'];
const EXTENDED_YES_NO_OPTIONS = ['yes', 'no', 'unclear', 'probable', 'inferred', 'unknown'];

function yesnoButtonStyle(opt: string, value: string): React.CSSProperties {
  const active = value === opt;
  let bg = 'transparent', color = 'var(--text-3)', borderColor = 'var(--border)';
  if (active) {
    if (opt === 'yes')      { bg = 'var(--accent-pale)';  color = 'var(--accent)';  borderColor = 'var(--accent-border)'; }
    else if (opt === 'no')  { bg = 'var(--green-pale)';   color = 'var(--green)';   borderColor = 'var(--green-border)'; }
    else if (opt === 'probable' || opt === 'inferred') {
                              bg = 'var(--amber-pale)';   color = 'var(--amber)';   borderColor = 'var(--amber-border)'; }
    else                    { bg = 'var(--surface-3)';    color = 'var(--text-2)';  borderColor = 'var(--border-mid)'; }
  }
  return {
    padding: '2px 8px', borderRadius: 4, fontSize: 11.5,
    fontWeight: active ? 500 : 400, cursor: 'pointer',
    transition: 'all 0.12s', border: '1px solid', background: bg, color, borderColor,
  };
}

export default function FieldRow({
  label, value, onChange, onMarkReviewed, type = 'text',
  options, suggested, onAcceptSuggestion, placeholder, span, badge,
  provenance,
}: Props) {
  const hasSuggestion = suggested && suggested !== value && suggested !== '';
  const borderColor = provenance ? PROVENANCE_BORDER[provenance] : 'transparent';
  const showReviewBtn = provenance === 'analyst_filled' && !!onMarkReviewed;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: span ? '1fr' : '140px 1fr',
      gap: span ? 4 : 8,
      alignItems: type === 'textarea' ? 'flex-start' : 'center',
      padding: '5px 0',
      borderBottom: '1px solid var(--border)',
      borderLeft: `3px solid ${borderColor}`,
      paddingLeft: provenance ? 6 : 0,
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        paddingTop: type === 'textarea' ? 2 : 0,
      }}>
        <label style={{
          fontSize: 12,
          color: 'var(--text-3)',
          fontWeight: 400,
          lineHeight: 1.3,
        }}>
          {label}
        </label>
        {provenance && value && PROVENANCE_LABEL[provenance] && (() => {
          const lbl = PROVENANCE_LABEL[provenance]!;
          return (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
              color: lbl.color, background: lbl.bg, border: `1px solid ${lbl.border}`,
              padding: '0px 4px', borderRadius: 3, alignSelf: 'flex-start',
              lineHeight: 1.5,
            }}>
              {lbl.text}
            </span>
          );
        })()}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {(type === 'yesno' || type === 'yesno-extended') ? (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <button
              onClick={() => onChange('')}
              style={{
                padding: '2px 7px', borderRadius: 4, fontSize: 11.5, fontWeight: 400,
                cursor: 'pointer', transition: 'all 0.12s', border: '1px solid',
                background: value === '' ? 'var(--surface-3)' : 'transparent',
                color: value === '' ? 'var(--text-2)' : 'var(--text-3)',
                borderColor: value === '' ? 'var(--border-mid)' : 'var(--border)',
              }}
            >–</button>
            {(type === 'yesno' ? YES_NO_OPTIONS : EXTENDED_YES_NO_OPTIONS).map((opt) => (
              <button key={opt} onClick={() => onChange(opt)} style={yesnoButtonStyle(opt, value)}>
                {opt}
              </button>
            ))}
          </div>
        ) : type === 'select' ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              flex: 1, minWidth: 0, padding: '3px 8px', borderRadius: 5,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: value ? 'var(--text-1)' : 'var(--text-3)', fontSize: 12.5,
              fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer', appearance: 'auto',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          >
            <option value="">—</option>
            {options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={2}
            style={{
              flex: 1, padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-1)', fontSize: 12.5,
              fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5, resize: 'vertical', outline: 'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || '—'}
            style={{
              flex: 1, minWidth: 0, padding: '3px 8px', borderRadius: 5,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-1)', fontSize: 12.5, fontFamily: 'DM Sans, sans-serif', outline: 'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        )}

        {hasSuggestion && (
          <button
            onClick={onAcceptSuggestion}
            title={`AI suggests: "${suggested}"`}
            style={{
              flexShrink: 0, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500,
              cursor: 'pointer', border: '1px solid var(--amber-border)',
              background: 'var(--amber-pale)', color: 'var(--amber)',
              whiteSpace: 'nowrap', transition: 'all 0.12s', maxWidth: 140,
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            ✦ {String(suggested).slice(0, 20)}
          </button>
        )}

        {showReviewBtn && (
          <button
            onClick={onMarkReviewed}
            title="Mark as reviewed"
            style={{
              flexShrink: 0, padding: '2px 6px', borderRadius: 4, fontSize: 11,
              cursor: 'pointer', border: '1px solid #86EFAC',
              background: '#F0FDF4', color: '#16A34A', transition: 'all 0.12s',
            }}
          >✓</button>
        )}

        {badge}
      </div>
    </div>
  );
}
