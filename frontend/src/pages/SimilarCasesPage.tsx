import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, GitCompare, AlertTriangle, Car, User, MapPin, Clock } from 'lucide-react';
import { api } from '../api';
import type { SimilarCandidate, Report, DomainScore } from '../types';

const DOMAIN_ORDER_SP = ['control', 'sexual', 'style', 'escape', 'target'];
const DOMAIN_COLORS_SP: Record<string, string> = {
  control: '#9B1D1D', sexual: '#7C2D12', style: '#B45309', escape: '#166534', target: '#4338CA',
};

// Score types where the number is not a real similarity signal
const SUPPRESSED_SCORE_TYPES = new Set(['baseline', 'joint_absence']);

function DomainMiniStrip({ domainScores }: { domainScores?: Record<string, DomainScore> }) {
  if (!domainScores) return null;
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, marginBottom: 2 }}>
      {DOMAIN_ORDER_SP.map((dk) => {
        const d = domainScores[dk];
        if (!d) return null;
        const pct = Math.round(d.score * 100);
        const color = DOMAIN_COLORS_SP[dk];
        const scoreType = d.score_type ?? (d.has_real_coded_values ? 'positive_match' : 'baseline');
        const suppressed = SUPPRESSED_SCORE_TYPES.has(scoreType);

        if (suppressed) {
          // Show the domain label but replace the bar + number with a muted "no basis" indicator
          const suppressLabel = scoreType === 'joint_absence' ? 'no match basis' : 'no coded basis';
          return (
            <div key={dk} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 62 }}
              title={d.score_explanation ?? `${d.label}: score not meaningful — ${suppressLabel}`}>
              <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {d.label.split(' ')[0]}
              </span>
              {/* Flat empty bar — no fill */}
              <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ width: 0, height: '100%' }} />
              </div>
              <span style={{
                fontSize: 9, color: '#9CA3AF', fontWeight: 500, fontStyle: 'italic',
                letterSpacing: '0.01em',
              }}>
                {suppressLabel}
              </span>
            </div>
          );
        }

        return (
          <div key={dk} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 62 }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {d.label.split(' ')[0]}
            </span>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 9.5, color: pct > 0 ? color : 'var(--text-3)', fontWeight: 600 }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

const LINKAGE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  possible_link:  { label: 'Possible link',  color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' },
  unlikely_link:  { label: 'Unlikely',       color: 'var(--text-3)', bg: 'var(--surface-2)', border: 'var(--border)' },
  needs_review:   { label: 'Needs review',   color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
};

const FLAG_ICONS: Record<string, typeof Car> = {
  plate: Car, vehicle: Car, suspect: User, location: MapPin, temporal: Clock,
};

const DIM_ORDER = ['suspect','vehicle','encounter','violence','mobility','location_type','spatial','temporal'];
const DIM_COLORS: Record<string, string> = {
  suspect: '#9B1D1D', vehicle: '#3730A3', encounter: '#B45309',
  violence: '#7C2D12', mobility: '#166534', location_type: '#4338CA',
  spatial: '#0F766E', temporal: '#6B7280',
};

function ScoreRing({ score }: { score: number }) {
  const r = 22, circ = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 60 ? '#9B1D1D' : score >= 35 ? '#B45309' : '#6B7280';
  return (
    <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
      <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color, lineHeight: 1 }}>{Math.round(score)}</span>
      </div>
    </div>
  );
}

function DimBar({ dim, dimKey }: { dim: any; dimKey: string }) {
  const pct = Math.round(dim.score * 100);
  const color = DIM_COLORS[dimKey] || '#6B7280';
  if (pct === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10.5, color: 'var(--text-2)', fontWeight: 500, letterSpacing: '0.02em' }}>
          {dim.label}
        </span>
        <span style={{ fontSize: 10, color, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.3 }}>{dim.reason}</span>
    </div>
  );
}

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
  const [minScore, setMinScore] = useState(10);

  useEffect(() => {
    if (!reportId) return;
    setLoading(true);
    Promise.all([
      api.getReport(reportId),
      api.getSimilar(reportId, minScore),
    ]).then(([r, c]) => {
      setTarget(r);
      setCandidates(c);
      setLoading(false);
    });
  }, [reportId, minScore]);

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

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Min score:</label>
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            style={{
              padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)',
              background: 'var(--surface)', fontSize: 12, color: 'var(--text-1)', outline: 'none',
            }}
          >
            <option value={5}>5 — very broad</option>
            <option value={10}>10 — broad</option>
            <option value={20}>20 — moderate</option>
            <option value={35}>35 — strong</option>
            <option value={50}>50 — very strong</option>
          </select>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{
        padding: '6px 20px',
        background: '#FFFBEB',
        borderBottom: '1px solid #FDE68A',
        fontSize: 11.5, color: '#92400E',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <AlertTriangle size={13} />
        Decision support only — scores are based on coded fields and reflect completeness of coding. Always apply analyst judgement.
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-3)', fontSize: 13 }}>
            Scanning {target ? 'all cases' : '…'}
          </div>
        ) : candidates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)', fontSize: 13 }}>
            No cases meet the minimum score threshold. Try lowering it.
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
                  {/* Score ring */}
                  <ScoreRing score={c.similarity.score} />

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

                    {/* Dimension bars */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px 16px',
                      marginBottom: 6,
                    }}>
                      {DIM_ORDER.map((k) => {
                        const d = c.similarity.dimensions[k];
                        return d ? <DimBar key={k} dim={d} dimKey={k} /> : null;
                      })}
                    </div>

                    {/* Behavioral domain mini-strip */}
                    <DomainMiniStrip domainScores={c.similarity.domain_scores} />

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
