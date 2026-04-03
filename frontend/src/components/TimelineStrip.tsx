import type { Report } from '../types';

interface Props { report: Partial<Report>; }

const STEPS = [
  { key: 'initial_approach_type', label: 'Approach',     short: 'A' },
  { key: 'negotiation_present',   label: 'Negotiation',  short: 'N' },
  { key: 'movement_present',      label: 'Movement',     short: 'M' },
  { key: 'coercion_present',      label: 'Coercion',     short: 'C' },
  { key: 'physical_force',        label: 'Violence',     short: 'V' },
  { key: 'exit_type',             label: 'Exit',         short: 'E' },
] as const;

export default function TimelineStrip({ report }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      padding: '10px 16px',
      background: 'var(--surface-2)',
      borderTop: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 10.5, color: 'var(--text-3)', marginRight: 12, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Sequence
      </span>
      {STEPS.map((step, i) => {
        const val = report[step.key as keyof Report] as string;
        const active = val && val !== '' && val !== 'no';
        const isCoercion = step.key === 'coercion_present' || step.key === 'physical_force';

        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{
                width: 22, height: 22,
                borderRadius: '50%',
                border: `1.5px solid ${active ? (isCoercion ? 'var(--accent)' : 'var(--border-mid)') : 'var(--border)'}`,
                background: active ? (isCoercion ? 'var(--accent)' : 'var(--surface-3)') : 'var(--surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}>
                <span style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  color: active ? (isCoercion ? '#fff' : 'var(--text-2)') : 'var(--text-3)',
                }}>
                  {step.short}
                </span>
              </div>
              <span style={{
                fontSize: 9.5,
                color: active ? (isCoercion ? 'var(--accent)' : 'var(--text-2)') : 'var(--text-3)',
                fontWeight: active ? 500 : 400,
                whiteSpace: 'nowrap',
              }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                width: 24,
                height: 1.5,
                background: active ? 'var(--border-mid)' : 'var(--border)',
                marginBottom: 14,
                flexShrink: 0,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
