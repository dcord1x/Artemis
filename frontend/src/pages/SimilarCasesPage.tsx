import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, GitCompare, AlertTriangle, Car, User, MapPin, Clock } from 'lucide-react';
import { api } from '../api';
import type { SimilarCandidate, Report } from '../types';


const LINKAGE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  possible_link:  { label: 'Possible link',  color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' },
  unlikely_link:  { label: 'Unlikely',       color: 'var(--text-3)', bg: 'var(--surface-2)', border: 'var(--border)' },
  needs_review:   { label: 'Needs review',   color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
};

const FLAG_ICONS: Record<string, typeof Car> = {
  plate: Car, vehicle: Car, suspect: User, location: MapPin, temporal: Clock,
};


function Dot({ val, color = 'var(--accent)' }: { val: string; color?: string }) {
  if (val === 'yes') return (
    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color }} />
  );
  if (val === 'no') return (
    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: '1.5px solid var(--border-mid)' }} />
  );
  return <span style={{ color: 'var(--border-mid)', fontSize: 11 }}>–</span>;
}

export default function SimilarCasesPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<SimilarCandidate[]>([]);
  const [target, setTarget] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reportId) return;
    setLoading(true);
    Promise.all([
      api.getReport(reportId),
      api.getSimilar(reportId, 0),
    ]).then(([r, c]) => {
      setTarget(r);
      setCandidates(c);
      setLoading(false);
    });
  }, [reportId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <button
          onClick={() => navigate(`/code/${reportId}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}
        >
          <ArrowLeft size={16} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
            Similar Cases
          </span>
          {target && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>
              {target.report_id} · {target.city || 'unknown city'} · {target.incident_date || '—'}
            </span>
          )}
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-3)', fontSize: 13 }}>
            Scanning {target ? 'all cases' : '…'}
          </div>
        ) : candidates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)', fontSize: 13 }}>
            No similar cases found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {candidates.map((c) => {
              const lk = LINKAGE_CONFIG[c.linkage_status];
              const topFlags = c.similarity.repeat_flags.slice(0, 4);
              return (
                <div
                  key={c.report_id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '14px 16px',
                    display: 'flex', gap: 16, alignItems: 'flex-start',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s, border-color 0.15s',
                  }}
                  onClick={() => navigate(`/linkage/${reportId}/${c.report_id}`)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                >
                  {/* Main content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-2)' }}>{c.report_id}</span>
                      {c.incident_date && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{c.incident_date}</span>}
                      {c.city && <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{c.city}{c.neighbourhood ? ` · ${c.neighbourhood}` : ''}</span>}

                      {/* Coded field dots */}
                      <span title="Coercion"><Dot val={c.coercion_present} /></span>
                      <span title="Movement"><Dot val={c.movement_present} color="var(--amber)" /></span>
                      <span title="Physical force"><Dot val={c.physical_force} /></span>
                      <span title="Sexual assault"><Dot val={c.sexual_assault} /></span>
                      <span title="Vehicle"><Dot val={c.vehicle_present} color="var(--blue)" /></span>

                      {lk && (
                        <span style={{
                          fontSize: 10.5, padding: '2px 8px', borderRadius: 20,
                          color: lk.color, background: lk.bg, border: `1px solid ${lk.border}`,
                          marginLeft: 'auto',
                        }}>{lk.label}</span>
                      )}
                    </div>

                    {/* Repeat flags */}
                    {topFlags.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {topFlags.map((f, i) => {
                          const Icon = FLAG_ICONS[f.type] || AlertTriangle;
                          return (
                            <span key={i} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 11, padding: '2px 8px', borderRadius: 4,
                              background: 'var(--amber-pale)', color: 'var(--amber)',
                              border: '1px solid var(--amber-border)',
                            }}>
                              <Icon size={10} />
                              {f.detail}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Compare button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/linkage/${reportId}/${c.report_id}`); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--surface-2)',
                      fontSize: 12, color: 'var(--text-2)', cursor: 'pointer',
                      whiteSpace: 'nowrap', flexShrink: 0,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--accent)';
                      e.currentTarget.style.color = '#fff';
                      e.currentTarget.style.borderColor = 'var(--accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--surface-2)';
                      e.currentTarget.style.color = 'var(--text-2)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }}
                  >
                    <GitCompare size={12} />
                    Compare
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
