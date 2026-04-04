/**
 * ResearchOutputs.tsx
 *
 * Dedicated methodological analysis layer — distinct from the operational
 * Analysis dashboard. Surfaces:
 *   - Recurring encounter sequences (dataset-level)
 *   - Recurring escalation pathways
 *   - Mobility pathway aggregation
 *   - Environmental pattern aggregation
 *   - Case summaries table
 *
 * Provenance note: any field sourced only from NLP (ai_suggested) is
 * labelled [provisional] throughout. Analyst-coded values are primary.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import type {
  ResearchAggregate,
  SequenceRow,
  PatternRow,
  StageRow,
  PathwayRow,
  RouteRow,
  EnvCross,
} from '../types';

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500,
      color: 'var(--text-1)', margin: '0 0 14px', letterSpacing: '-0.01em',
    }}>
      {children}
    </h3>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
      letterSpacing: '0.05em', textTransform: 'uppercase',
      marginBottom: 8, marginTop: 16,
    }}>
      {children}
    </div>
  );
}

function ProvenanceNote() {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 7,
      fontSize: 11.5, color: 'var(--text-3)', padding: '8px 12px',
      background: 'var(--surface-2)', borderRadius: 6,
      border: '1px solid var(--border)', marginBottom: 18,
    }}>
      <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--amber)' }} />
      <span>
        Derived from analyst-coded fields.{' '}
        <strong style={{ fontWeight: 600, color: 'var(--amber)' }}>[provisional]</strong>
        {' '}markers indicate the field was NLP-suggested and not yet confirmed by an analyst —
        treat these as signals for review, not confirmed findings.
      </span>
    </div>
  );
}

/** Horizontal frequency bar */
function FreqBar({
  label, count, max, sub, color = 'var(--accent)', provisional,
}: {
  label: string; count: number; max: number;
  sub?: string; color?: string; provisional?: boolean;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-2)', maxWidth: '78%', lineHeight: 1.35 }}>
          {label}
          {provisional && (
            <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--amber)', fontWeight: 600 }}>
              [provisional]
            </span>
          )}
          {sub && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 5 }}>{sub}</span>}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500, flexShrink: 0 }}>{count}</span>
      </div>
      <div style={{ height: 5, borderRadius: 10, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 10, background: color, width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

/** Two-column cross-tab card */
function CrossTabCard({
  label, data,
}: {
  label: string; data: EnvCross; total?: number;
}) {
  const metrics: [string, number][] = [
    ['Physical force', data.physical_force],
    ['Sexual assault', data.sexual_assault],
    ['Coercion',       data.coercion],
    ['Movement',       data.movement],
  ];
  return (
    <div style={{
      padding: '12px 14px', border: '1px solid var(--border)',
      borderRadius: 8, background: 'var(--surface)',
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>
        {label}
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 6 }}>
          n={data.count}
        </span>
      </div>
      {metrics.map(([name, val]) => {
        const pct = data.count > 0 ? Math.round(val / data.count * 100) : 0;
        return (
          <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 3 }}>
            <span>{name}</span>
            <span style={{ fontWeight: 500, color: val > 0 ? 'var(--text-2)' : 'var(--text-3)' }}>
              {val} <span style={{ fontSize: 10, opacity: 0.7 }}>({pct}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Card wrapper */
function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card" style={{ padding: '20px 22px', marginBottom: 20, ...style }}>
      {children}
    </div>
  );
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type Tab = 'sequences' | 'mobility' | 'environment' | 'caselist';

const TABS: { id: Tab; label: string }[] = [
  { id: 'sequences',   label: 'Encounter Sequences' },
  { id: 'mobility',    label: 'Mobility Pathways' },
  { id: 'environment', label: 'Environmental Patterns' },
  { id: 'caselist',    label: 'Case Sequence Table' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function ResearchOutputs() {
  const navigate = useNavigate();
  const [data, setData]     = useState<ResearchAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<Tab>('sequences');

  const load = () => {
    setLoading(true);
    api.getResearchAggregate()
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── Tab bar ───────────────────────────────────────────────────────────────

  const TabBar = () => (
    <div style={{
      display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
      marginBottom: 24, overflowX: 'auto',
    }}>
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          style={{
            padding: '9px 16px', border: 'none',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'transparent',
            color: tab === t.id ? 'var(--accent)' : 'var(--text-3)',
            fontFamily: 'DM Sans, sans-serif', fontSize: 13,
            fontWeight: tab === t.id ? 600 : 400,
            cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  // ── Loading / empty ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 14 }}>
        Loading research analysis…
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 14 }}>
        No data available.
      </div>
    );
  }

  const { sequences, mobility, environment } = data;
  const total = data.total;

  // ── Sequences tab ─────────────────────────────────────────────────────────

  const SequencesTab = () => {
    const maxSeq  = sequences.most_common_sequences[0]?.count ?? 1;
    const maxBi   = sequences.most_common_bigrams[0]?.count ?? 1;
    const maxStg  = sequences.stage_frequency[0]?.count ?? 1;
    const maxEsc  = sequences.escalation_pathways[0]?.count ?? 1;

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Most common full sequences */}
        <Panel style={{ gridColumn: '1 / -1' }}>
          <SectionHeading>Most common encounter sequences</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Full stage-by-stage sequences ranked by frequency across{' '}
            <strong style={{ color: 'var(--text-2)' }}>{total}</strong> cases.
            Each sequence is derived from analyst-coded encounter fields.
          </p>
          {sequences.most_common_sequences.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
              No coded sequences yet. Code cases first to see patterns.
            </div>
          ) : (
            sequences.most_common_sequences.map((row: SequenceRow, i: number) => (
              <FreqBar
                key={i}
                label={row.sequence}
                count={row.count}
                max={maxSeq}
                color={i === 0 ? 'var(--accent)' : 'var(--accent-pale-border, #8b5cf670)'}
              />
            ))
          )}
        </Panel>

        {/* Stage-transition bigrams */}
        <Panel>
          <SectionHeading>Most common stage transitions</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Consecutive stage pairs — which stages most often follow each other.
          </p>
          {sequences.most_common_bigrams.slice(0, 12).map((row: PatternRow, i: number) => (
            <FreqBar key={i} label={row.pattern} count={row.count} max={maxBi} color='#0ea5e9' />
          ))}
        </Panel>

        {/* Stage frequency */}
        <Panel>
          <SectionHeading>Stage occurrence frequency</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            How often each stage appears across all coded cases.
          </p>
          {sequences.stage_frequency.slice(0, 15).map((row: StageRow, i: number) => (
            <FreqBar key={i} label={row.stage} count={row.count} max={maxStg}
              sub={total > 0 ? `${Math.round(row.count / total * 100)}%` : undefined}
              color='#10b981'
            />
          ))}
        </Panel>

        {/* Escalation pathways */}
        <Panel style={{ gridColumn: '1 / -1' }}>
          <SectionHeading>Recurring escalation pathways</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Sequences of harm-related stages only (coercion, threats, intimidation, physical force,
            sexual assault, robbery). Shows how harm stages chain together across cases.
          </p>
          {sequences.escalation_pathways.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No multi-stage escalation patterns yet.</div>
          ) : (
            sequences.escalation_pathways.map((row: PathwayRow, i: number) => (
              <FreqBar key={i} label={row.pathway} count={row.count} max={maxEsc} color='#ef4444' />
            ))
          )}
        </Panel>

      </div>
    );
  };

  // ── Mobility tab ──────────────────────────────────────────────────────────

  const MobilityTab = () => {
    const counts  = mobility.counts;
    const t       = mobility.total || 1;
    const maxPath = mobility.recurring_pathways[0]?.count ?? 1;
    const maxMode = mobility.mode_breakdown[0]?.count ?? 1;
    const maxRoute = mobility.route_patterns[0]?.count ?? 1;

    const indicators: [string, number, string][] = [
      ['Movement present',              counts.movement_present,           '#8b5cf6'],
      ['Movement attempted',            counts.movement_attempted,         '#a78bfa'],
      ['Movement completed',            counts.movement_completed,         '#6d28d9'],
      ['Entered vehicle',               counts.entered_vehicle,            '#0ea5e9'],
      ['Public → private shift',        counts.public_to_private,          '#f59e0b'],
      ['Public → secluded shift',       counts.public_to_secluded,         '#d97706'],
      ['Cross-neighbourhood',           counts.cross_neighbourhood,        '#10b981'],
      ['Cross-municipality',            counts.cross_municipality,         '#059669'],
      ['Cross-city movement',           counts.cross_city,                 '#047857'],
      ['Offender-controlled (high)',    counts.offender_controlled_high,   '#ef4444'],
      ['Offender-controlled (moderate)',counts.offender_controlled_moderate,'#f87171'],
    ];
    const maxInd = Math.max(...indicators.map(([, c]) => c), 1);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Indicators overview */}
        <Panel style={{ gridColumn: '1 / -1' }}>
          <SectionHeading>Mobility indicators — dataset overview</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Frequency of coded mobility fields across{' '}
            <strong style={{ color: 'var(--text-2)' }}>{mobility.total}</strong> cases.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            {indicators.map(([label, count, color], i) => (
              <FreqBar
                key={i} label={label} count={count} max={maxInd}
                sub={`${Math.round(count / t * 100)}%`}
                color={color}
              />
            ))}
          </div>
        </Panel>

        {/* Recurring pathway combinations */}
        <Panel>
          <SectionHeading>Recurring mobility pathway combinations</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Co-occurring mobility features — patterns like "vehicle pickup + offender-controlled".
          </p>
          {mobility.recurring_pathways.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No pathway combinations yet.</div>
          ) : (
            mobility.recurring_pathways.map((row: PathwayRow, i: number) => (
              <FreqBar key={i} label={row.pathway} count={row.count} max={maxPath} color='#8b5cf6' />
            ))
          )}
        </Panel>

        {/* Mode of movement */}
        <Panel>
          <SectionHeading>Mode of movement</SectionHeading>
          {mobility.mode_breakdown.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No mode data yet.</div>
          ) : (
            mobility.mode_breakdown.map((row, i) => (
              <FreqBar key={i} label={row.mode} count={row.count} max={maxMode} color='#0ea5e9' />
            ))
          )}

          {mobility.route_patterns.length > 0 && (
            <>
              <SubHeading>Start → Destination type patterns</SubHeading>
              {mobility.route_patterns.map((row: RouteRow, i: number) => (
                <FreqBar key={i} label={row.route} count={row.count} max={maxRoute} color='#f59e0b' />
              ))}
            </>
          )}
        </Panel>

        {/* Cross-city pathways */}
        {mobility.cross_city_pathways.length > 0 && (
          <Panel style={{ gridColumn: '1 / -1' }}>
            <SectionHeading>Cross-city movement pathways</SectionHeading>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
              City-to-city routes derived from stage-level city fields (initial contact city → incident city).
            </p>
            {(() => {
              const maxCity = mobility.cross_city_pathways[0]?.count ?? 1;
              return mobility.cross_city_pathways.map((row: PathwayRow, i: number) => (
                <FreqBar key={i} label={row.pathway} count={row.count} max={maxCity} color='#10b981' />
              ));
            })()}
          </Panel>
        )}

      </div>
    );
  };

  // ── Environment tab ───────────────────────────────────────────────────────

  const EnvironmentTab = () => {
    const maxLoc     = environment.location_types[0]?.count ?? 1;
    const maxCombined = environment.combined_patterns[0]?.count ?? 1;

    const distRows: [string, Record<string, number>, string][] = [
      ['Indoor / Outdoor',   environment.indoor_outdoor,  '#0ea5e9'],
      ['Public / Private',   environment.public_private,  '#8b5cf6'],
      ['Deserted context',   environment.deserted,        '#f59e0b'],
    ];

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Basic distributions */}
        {distRows.map(([label, distObj, color]) => {
          const entries = Object.entries(distObj).sort((a, b) => b[1] - a[1]);
          const maxDist = Math.max(...entries.map(([, c]) => c), 1);
          return (
            <Panel key={label}>
              <SectionHeading>{label}</SectionHeading>
              {entries.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No data yet.</div>
              ) : (
                entries.map(([val, cnt]) => (
                  <FreqBar
                    key={val}
                    label={val.replace(/_/g, ' ')}
                    count={cnt}
                    max={maxDist}
                    sub={environment.total > 0 ? `${Math.round(cnt / environment.total * 100)}%` : undefined}
                    color={color}
                  />
                ))
              )}
            </Panel>
          );
        })}

        {/* Location types */}
        <Panel>
          <SectionHeading>Location types</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Classified from initial contact, primary, and secondary location fields.
          </p>
          {environment.location_types.map((row, i) => (
            <FreqBar key={i} label={row.type} count={row.count} max={maxLoc} color='#10b981' />
          ))}
        </Panel>

        {/* Violence × environment cross-tabs */}
        <Panel style={{ gridColumn: '1 / -1' }}>
          <SectionHeading>Violence and movement by environment</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 16px' }}>
            Cross-tabulation: how harm indicators distribute across environmental conditions.
          </p>

          {Object.keys(environment.violence_by_environment).length > 0 && (
            <>
              <SubHeading>By indoor / outdoor</SubHeading>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                {Object.entries(environment.violence_by_environment).map(([val, cross]) => (
                  <CrossTabCard key={val} label={val} data={cross} total={environment.total} />
                ))}
              </div>
            </>
          )}

          {Object.keys(environment.movement_by_setting).length > 0 && (
            <>
              <SubHeading>By public / private setting</SubHeading>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                {Object.entries(environment.movement_by_setting).map(([val, cross]) => (
                  <CrossTabCard key={val} label={val} data={cross} total={environment.total} />
                ))}
              </div>
            </>
          )}

          {Object.keys(environment.deserted_analysis).length > 0 && (
            <>
              <SubHeading>By deserted context</SubHeading>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.entries(environment.deserted_analysis).map(([val, cross]) => (
                  <CrossTabCard key={val} label={val.replace(/_/g, ' ')} data={cross} total={environment.total} />
                ))}
              </div>
            </>
          )}
        </Panel>

        {/* Combined patterns */}
        {environment.combined_patterns.length > 0 && (
          <Panel style={{ gridColumn: '1 / -1' }}>
            <SectionHeading>Combined environment + movement + harm patterns</SectionHeading>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
              Co-occurring environment, movement, and harm conditions — identifies situational contexts.
            </p>
            {environment.combined_patterns.map((row: PatternRow, i: number) => (
              <FreqBar key={i} label={row.pattern} count={row.count} max={maxCombined} color='#ef4444' />
            ))}
          </Panel>
        )}

      </div>
    );
  };

  // ── Case list tab ─────────────────────────────────────────────────────────

  const CaseListTab = () => {
    const cases = sequences.per_case;
    return (
      <Panel>
        <SectionHeading>Per-case encounter sequences</SectionHeading>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
          Derived encounter sequence for each case. Click a report ID to open it in the coding workstation.
          Download the full per-case summary table (with mobility, environment, and harm summaries)
          using the export button above.
        </p>
        {cases.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            No coded cases yet. Code cases to see per-case sequences.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Report ID', 'Stage count', 'Encounter sequence'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '6px 10px',
                      fontSize: 11, color: 'var(--text-3)', fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cases.map((row, i) => (
                  <tr
                    key={row.report_id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)',
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate(`/code/${row.report_id}`)}
                    title="Open in coding workstation"
                  >
                    <td style={{ padding: '7px 10px', fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                      {row.report_id}
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-3)', textAlign: 'center' }}>
                      {row.stage_count}
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-2)', lineHeight: 1.4, fontSize: 12 }}>
                      {row.sequence || <em style={{ color: 'var(--text-3)' }}>— no sequence data</em>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ maxWidth: 1060, margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{
              fontFamily: 'Lora, serif', fontSize: 22, fontWeight: 500,
              margin: '0 0 4px', color: 'var(--text-1)',
            }}>
              Research Outputs
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
              Methodological analysis layer · sequence reconstruction · mobility pathways · environmental patterns
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={load}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-2)',
                fontSize: 12, cursor: 'pointer',
              }}
              title="Refresh analysis"
            >
              <RefreshCw size={13} /> Refresh
            </button>
            <button
              onClick={() => api.exportCaseSummaries()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-2)',
                fontSize: 12, cursor: 'pointer',
              }}
              title="Download per-case summary CSV"
            >
              <Download size={13} /> Case summaries CSV
            </button>
            <button
              onClick={() => api.exportResearchTables()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 6,
                border: '1px solid var(--accent)',
                background: 'var(--accent-pale)', color: 'var(--accent)',
                fontSize: 12, cursor: 'pointer', fontWeight: 500,
              }}
              title="Download all aggregate research tables as ZIP"
            >
              <Download size={13} /> Research tables ZIP
            </button>
          </div>
        </div>

        <ProvenanceNote />

        {/* Summary count strip */}
        <div style={{
          display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap',
        }}>
          {[
            ['Total cases', total],
            ['Unique sequences', sequences.most_common_sequences.length],
            ['Stage transitions', sequences.most_common_bigrams.length],
            ['With movement', mobility.counts.movement_present],
            ['Cross-city cases', mobility.counts.cross_city],
          ].map(([label, val]) => (
            <div key={String(label)} style={{
              padding: '10px 16px', border: '1px solid var(--border)',
              borderRadius: 8, background: 'var(--surface)', flex: '0 0 auto',
            }}>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontFamily: 'Lora, serif', fontSize: 24, fontWeight: 500, color: 'var(--text-1)', lineHeight: 1 }}>
                {val}
              </div>
            </div>
          ))}
        </div>

        <TabBar />

        {tab === 'sequences'   && <SequencesTab />}
        {tab === 'mobility'    && <MobilityTab />}
        {tab === 'environment' && <EnvironmentTab />}
        {tab === 'caselist'    && <CaseListTab />}

      </div>
    </div>
  );
}
