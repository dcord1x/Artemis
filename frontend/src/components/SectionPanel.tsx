import { useState, useEffect, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  title: string;
  fieldKeys: string[];
  fields: Record<string, any>;
  children: ReactNode;
  defaultCollapsed?: boolean;
}

function isFilled(v: any): boolean {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

export default function SectionPanel({ title, fieldKeys, fields, children, defaultCollapsed = false }: Props) {
  const filled = fieldKeys.filter(k => isFilled(fields[k])).length;
  const total = fieldKeys.length;
  const complete = filled === total && total > 0;

  const [open, setOpen] = useState(!defaultCollapsed && !complete);

  // Auto-collapse when section becomes fully filled
  useEffect(() => {
    if (complete) setOpen(false);
  }, [complete]);

  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const barColor = complete ? 'var(--green)' : pct > 0 ? 'var(--amber)' : 'var(--border-mid)';

  return (
    <div style={{
      marginBottom: 10,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      background: 'var(--surface)',
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px',
          background: complete ? 'var(--green-pale)' : 'var(--surface-2)',
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

        <span style={{
          fontFamily: 'Lora, Georgia, serif',
          fontSize: 12.5,
          fontWeight: 600,
          color: complete ? 'var(--green)' : 'var(--text-2)',
          flex: 1,
        }}>
          {title}
        </span>

        {/* Fields coded pill */}
        <span style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: complete ? 'var(--green)' : pct > 0 ? 'var(--amber)' : 'var(--text-3)',
          background: complete ? 'var(--green-pale)' : pct > 0 ? 'var(--amber-pale)' : 'var(--surface-3)',
          border: `1px solid ${complete ? 'var(--green-border)' : pct > 0 ? 'var(--amber-border)' : 'var(--border)'}`,
          borderRadius: 20,
          padding: '1px 8px',
          whiteSpace: 'nowrap',
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
        <div style={{ padding: '8px 4px 4px' }}>
          {children}
        </div>
      )}
    </div>
  );
}
