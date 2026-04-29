import { useState, useEffect, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  title: string;
  description?: string;
  fieldKeys: string[];
  fields: Record<string, any>;
  children: ReactNode;
  defaultCollapsed?: boolean;
}

function isFilled(v: any): boolean {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

export default function SectionPanel({ title, description, fieldKeys, fields, children, defaultCollapsed = false }: Props) {
  const filled = fieldKeys.filter(k => isFilled(fields[k])).length;
  const total = fieldKeys.length;
  const complete = filled === total && total > 0;

  const [open, setOpen] = useState(!defaultCollapsed && !complete);

  useEffect(() => {
    if (complete) setOpen(false);
  }, [complete]);

  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const barColor = complete ? 'var(--green)' : pct > 0 ? 'var(--gold)' : 'var(--border-mid)';

  return (
    <div style={{
      marginBottom: 12,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      background: 'var(--surface)',
      boxShadow: '0 1px 3px rgba(11,31,51,0.05)',
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px',
          background: complete ? '#F0FDF4' : '#F7F4EF',
          border: 'none',
          cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          transition: 'background 0.15s',
        }}
      >
        {open
          ? <ChevronDown size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          : <ChevronRight size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        }

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: complete ? 'var(--green)' : 'var(--accent)',
            display: 'block',
            lineHeight: 1.3,
          }}>
            {title}
          </span>
          {description && !complete && (
            <span style={{
              fontSize: 11,
              color: 'var(--text-3)',
              display: 'block',
              lineHeight: 1.3,
              marginTop: 1,
            }}>
              {description}
            </span>
          )}
        </div>

        {/* Progress pill */}
        <span style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: complete ? 'var(--green)' : pct > 0 ? 'var(--gold)' : 'var(--text-3)',
          background: complete ? 'var(--green-pale)' : pct > 0 ? 'var(--gold-pale)' : 'var(--surface-3)',
          border: `1px solid ${complete ? 'var(--green-border)' : pct > 0 ? 'var(--gold-border)' : 'var(--border)'}`,
          borderRadius: 20,
          padding: '1px 8px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {filled}/{total}{complete ? ' ✓' : ''}
        </span>
      </button>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'var(--surface-3)' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: barColor,
          transition: 'width 0.3s ease, background 0.3s ease',
        }} />
      </div>

      {/* Content */}
      {open && (
        <div style={{ padding: '10px 6px 6px' }}>
          {children}
        </div>
      )}
    </div>
  );
}
