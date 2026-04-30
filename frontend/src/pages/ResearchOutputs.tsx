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
import { Download, RefreshCw, AlertTriangle, FileText, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { api } from '../api';
import type {
  ResearchAggregate,
  SequenceRow,
  PatternRow,
  StageRow,
  PathwayRow,
  RouteRow,
  EnvCross,
  StagePatterns,
  ResearchNote,
  LinkagePatterns,
  MapPoint,
} from '../types';
import { GOOGLE_MAPS_API_KEY, LIBRARIES as MAP_LIBRARIES } from '../mapsConfig';

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

type Tab = 'sequences' | 'mobility' | 'environment' | 'caselist' | 'stage_patterns' | 'spatial' | 'linkage_view';

const TABS: { id: Tab; label: string }[] = [
  { id: 'stage_patterns', label: 'Stage Patterns' },
  { id: 'sequences',      label: 'Encounter Sequences' },
  { id: 'mobility',       label: 'Mobility Pathways' },
  { id: 'environment',    label: 'Environmental Patterns' },
  { id: 'spatial',        label: 'Spatial Overview' },
  { id: 'linkage_view',   label: 'Case Linkage View' },
  { id: 'caselist',       label: 'Case Sequence Table' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function ResearchOutputs() {
  const navigate = useNavigate();
  const [data, setData]             = useState<ResearchAggregate | null>(null);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<Tab>('stage_patterns');
  const [stageData, setStageData]   = useState<StagePatterns | null>(null);
  const [stageLoading, setStageLoading] = useState(true);
  const [filterStageType, setFilterStageType]       = useState('');
  const [filterVisibility, setFilterVisibility]     = useState('');
  const [filterGuardianship, setFilterGuardianship] = useState('');
  const [filterIsolation, setFilterIsolation]       = useState('');
  const [filterDateFrom, setFilterDateFrom]         = useState('');
  const [filterDateTo, setFilterDateTo]             = useState('');

  // Linkage patterns
  const [linkageData, setLinkageData]       = useState<LinkagePatterns | null>(null);
  const [linkageLoading, setLinkageLoading] = useState(false);

  // Map data for Spatial Overview
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);

  // Research notes
  const [notes, setNotes]           = useState<ResearchNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError]   = useState('');

  // Google Maps
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES,
  });

  const loadStagePatterns = (params?: { stage_type?: string; visibility?: string; guardianship?: string; isolation?: string; date_from?: string; date_to?: string }) => {
    setStageLoading(true);
    api.getStagePatterns(params)
      .then(d => { setStageData(d); setStageLoading(false); })
      .catch(() => setStageLoading(false));
  };

  const loadLinkagePatterns = () => {
    setLinkageLoading(true);
    api.getLinkagePatterns()
      .then(d => { setLinkageData(d); setLinkageLoading(false); })
      .catch(() => setLinkageLoading(false));
  };

  const loadNotes = () => {
    api.getResearchNotes().then(setNotes).catch(() => {});
  };

  const saveNote = async () => {
    if (!newNoteText.trim()) return;
    setNoteError('');
    setSavingNote(true);
    try {
      const note = await api.createResearchNote({ note_text: newNoteText.trim() });
      setNotes(prev => [note, ...prev]);
      setNewNoteText('');
    } catch (err: any) {
      setNoteError(err?.message || 'Save failed — is the server running?');
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async (id: number) => {
    try {
      await api.deleteResearchNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch { /* ignore */ }
  };

  const load = () => {
    setLoading(true);
    api.getResearchAggregate()
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    // Also load map points via stats
    api.getStats().then(s => setMapPoints(s.map_points ?? [])).catch(() => {});
  };

  useEffect(() => {
    load();
    loadStagePatterns();
    loadLinkagePatterns();
    loadNotes();
  }, []);

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

  // ── Stage Patterns tab ────────────────────────────────────────────────────

  const StagePatternsTab = () => {
    const STAGE_TYPE_OPTS = ['initial_contact','negotiation','movement','escalation','outcome'];
    const VISIBILITY_OPTS = ['public','semi_public','semi_private','private'];
    const GUARDIANSHIP_OPTS = ['present','reduced','absent','delayed'];

    const applyFilter = () => loadStagePatterns({
      stage_type:   filterStageType   || undefined,
      visibility:   filterVisibility  || undefined,
      guardianship: filterGuardianship || undefined,
      isolation:    filterIsolation   || undefined,
      date_from:    filterDateFrom    || undefined,
      date_to:      filterDateTo      || undefined,
    });

    const clearFilter = () => {
      setFilterStageType(''); setFilterVisibility(''); setFilterGuardianship('');
      setFilterIsolation(''); setFilterDateFrom(''); setFilterDateTo('');
      loadStagePatterns({});
    };

    const fmtLabel = (v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    if (stageLoading) return (
      <div style={{ color: 'var(--text-3)', fontSize: 13, fontStyle: 'italic', padding: '20px 0' }}>
        Loading stage patterns…
      </div>
    );

    if (!stageData) return (
      <div style={{ color: 'var(--text-3)', fontSize: 13, fontStyle: 'italic', padding: '20px 0' }}>
        No stage data available. Open a case, click the Stages tab, and code some stages.
      </div>
    );

    const sd = stageData;
    const maxTypeCount = Math.max(...sd.stage_type_frequency.map(r => r.count), 1);
    const maxBehCount  = Math.max(...sd.behavior_frequency.map(r => r.count), 1);
    const maxRespCount = Math.max(...sd.response_frequency.map(r => r.count), 1);
    const maxSeqCount  = Math.max(...sd.sequence_frequency.map(r => r.count), 1);

    return (
      <div>
        {/* Summary counts */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            ['Total stages coded', sd.total_stages],
            ['Cases with stages', sd.total_cases_with_stages],
            ['Matching filter', sd.matching_cases.length],
          ].map(([label, val]) => (
            <div key={String(label)} style={{
              padding: '10px 16px', border: '1px solid var(--border)',
              borderRadius: 8, background: 'var(--surface)', flex: '0 0 auto',
            }}>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontFamily: 'Lora, serif', fontSize: 22, fontWeight: 500,
                color: 'var(--text-1)', lineHeight: 1 }}>
                {val}
              </div>
            </div>
          ))}
        </div>

        {/* Filter panel */}
        <Panel>
          <SectionHeading>Filter Stages</SectionHeading>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            Narrow results to stages matching these criteria — e.g. find cases where escalation
            occurred in a private location with absent guardianship.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Stage type</div>
              <select value={filterStageType} onChange={e => setFilterStageType(e.target.value)}
                style={{ padding: '5px 8px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-1)' }}>
                <option value="">All types</option>
                {STAGE_TYPE_OPTS.map(v => <option key={v} value={v}>{fmtLabel(v)}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Visibility</div>
              <select value={filterVisibility} onChange={e => setFilterVisibility(e.target.value)}
                style={{ padding: '5px 8px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-1)' }}>
                <option value="">Any</option>
                {VISIBILITY_OPTS.map(v => <option key={v} value={v}>{fmtLabel(v)}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Guardianship</div>
              <select value={filterGuardianship} onChange={e => setFilterGuardianship(e.target.value)}
                style={{ padding: '5px 8px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-1)' }}>
                <option value="">Any</option>
                {GUARDIANSHIP_OPTS.map(v => <option key={v} value={v}>{fmtLabel(v)}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Isolation</div>
              <select value={filterIsolation} onChange={e => setFilterIsolation(e.target.value)}
                style={{ padding: '5px 8px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-1)' }}>
                <option value="">Any</option>
                {['not_isolated','partially_isolated','isolated','unknown'].map(v => <option key={v} value={v}>{fmtLabel(v)}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date from</div>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                style={{ padding: '5px 8px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-1)' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date to</div>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                style={{ padding: '5px 8px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-1)' }} />
            </div>
            <button onClick={applyFilter} style={{
              padding: '6px 14px', borderRadius: 5, border: '1px solid var(--accent)',
              background: 'var(--accent-pale)', color: 'var(--accent)',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}>
              Apply
            </button>
            <button onClick={clearFilter} style={{
              padding: '6px 14px', borderRadius: 5, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-3)',
              fontSize: 12.5, cursor: 'pointer',
            }}>
              Clear
            </button>
          </div>

          {/* Matching cases list */}
          {sd.matching_cases.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Matching case IDs ({sd.matching_cases.length}) — click to open
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {sd.matching_cases.map(id => (
                  <button
                    key={id}
                    onClick={() => navigate(`/code/${id}`)}
                    title="Open in coding workstation"
                    style={{
                      fontSize: 11.5, padding: '2px 8px', borderRadius: 4,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      color: 'var(--accent)', fontFamily: 'monospace', cursor: 'pointer',
                    }}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Stage type frequency */}
          <Panel>
            <SectionHeading>Stage Type Frequency</SectionHeading>
            {sd.stage_type_frequency.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No stages coded yet.</div>
            ) : sd.stage_type_frequency.map(r => (
              <FreqBar key={r.value} label={fmtLabel(r.value)} count={r.count} max={maxTypeCount} />
            ))}
          </Panel>

          {/* Sequence frequency */}
          <Panel>
            <SectionHeading>Stage Sequences</SectionHeading>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
              Most common analyst-coded stage orderings across cases.
            </div>
            {sd.sequence_frequency.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No multi-stage cases yet.</div>
            ) : sd.sequence_frequency.slice(0, 8).map(r => (
              <FreqBar key={r.value} label={r.value} count={r.count} max={maxSeqCount} />
            ))}
          </Panel>

          {/* Client behaviours */}
          <Panel>
            <SectionHeading>Client Behaviour Frequency</SectionHeading>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
              Across all coded stages (all cases combined).
            </div>
            {sd.behavior_frequency.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No behaviours coded yet.</div>
            ) : sd.behavior_frequency.map(r => (
              <FreqBar key={r.value} label={fmtLabel(r.value)} count={r.count} max={maxBehCount} color="var(--red, #DC2626)" />
            ))}
          </Panel>

          {/* Victim responses */}
          <Panel>
            <SectionHeading>Victim Response Frequency</SectionHeading>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
              Across all coded stages (all cases combined).
            </div>
            {sd.response_frequency.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No responses coded yet.</div>
            ) : sd.response_frequency.map(r => (
              <FreqBar key={r.value} label={fmtLabel(r.value)} count={r.count} max={maxRespCount} color="var(--green)" />
            ))}
          </Panel>

        </div>

        {/* Conditions by stage type */}
        <Panel>
          <SectionHeading>Conditions by Stage Type</SectionHeading>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 14 }}>
            Distribution of situational conditions at each stage type.
          </div>
          {Object.keys(sd.visibility_by_stage).length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No conditions coded yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Stage type
                    </th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Top visibility
                    </th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Top guardianship
                    </th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Top isolation
                    </th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Top control
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {['initial_contact','negotiation','movement','escalation','outcome'].map(stype => {
                    const vis  = sd.visibility_by_stage[stype]?.[0];
                    const grd  = sd.guardianship_by_stage[stype]?.[0];
                    const iso  = sd.isolation_by_stage[stype]?.[0];
                    const ctrl = sd.control_by_stage[stype]?.[0];
                    if (!vis && !grd && !iso && !ctrl) return null;
                    return (
                      <tr key={stype} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-1)', fontSize: 12.5 }}>
                          {fmtLabel(stype)}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-2)', fontSize: 12.5 }}>
                          {vis ? `${fmtLabel(vis.value)} (${vis.count})` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-2)', fontSize: 12.5 }}>
                          {grd ? `${fmtLabel(grd.value)} (${grd.count})` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-2)', fontSize: 12.5 }}>
                          {iso ? `${fmtLabel(iso.value)} (${iso.count})` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-2)', fontSize: 12.5 }}>
                          {ctrl ? `${fmtLabel(ctrl.value)} (${ctrl.count})` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

      </div>
    );
  };

  // ── Spatial Overview tab ─────────────────────────────────────────────────

  const SpatialOverviewTab = () => {
    const hasGeo = mapPoints.some(p => p.lat_initial || p.lat_incident);

    if (!GOOGLE_MAPS_API_KEY) {
      return (
        <Panel>
          <SectionHeading>Spatial Overview</SectionHeading>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            Google Maps API key not configured. Set VITE_GOOGLE_MAPS_API_KEY in frontend/.env to enable map features.
          </div>
        </Panel>
      );
    }

    if (!mapsLoaded) {
      return (
        <Panel>
          <div style={{ fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' }}>Loading map…</div>
        </Panel>
      );
    }

    if (!hasGeo) {
      return (
        <Panel>
          <SectionHeading>Spatial Overview</SectionHeading>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            No geocoded cases yet. Add GIS coordinates to cases to see them on the map.
          </div>
        </Panel>
      );
    }

    // Default centre: average of all geocoded points
    const geoPoints = mapPoints.filter(p => p.lat_initial || p.lat_incident);
    const avgLat = geoPoints.reduce((s, p) => s + (p.lat_initial ?? p.lat_incident ?? 0), 0) / geoPoints.length;
    const avgLon = geoPoints.reduce((s, p) => s + (p.lon_initial ?? p.lon_incident ?? 0), 0) / geoPoints.length;

    return (
      <div>
        <Panel>
          <SectionHeading>Spatial Overview</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Geocoded incident locations across{' '}
            <strong style={{ color: 'var(--text-2)' }}>{geoPoints.length}</strong> cases.
            Blue = initial contact · Red = incident · Green = destination.
            Click any marker to open that case. Full map available at{' '}
            <button onClick={() => navigate('/map')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, padding: 0, textDecoration: 'underline' }}>Map view</button>.
          </p>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: 400, borderRadius: 8 }}
            center={{ lat: avgLat, lng: avgLon }}
            zoom={11}
            options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
          >
            {mapPoints.map(p => (
              <div key={p.report_id}>
                {p.lat_initial && p.lon_initial && (
                  <Marker
                    position={{ lat: p.lat_initial, lng: p.lon_initial }}
                    title={`${p.report_id} — Initial contact`}
                    icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: '#3b82f6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5, scale: 6 }}
                    onClick={() => navigate(`/code/${p.report_id}`)}
                  />
                )}
                {p.lat_incident && p.lon_incident && (
                  <Marker
                    position={{ lat: p.lat_incident, lng: p.lon_incident }}
                    title={`${p.report_id} — Incident`}
                    icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5, scale: 6 }}
                    onClick={() => navigate(`/code/${p.report_id}`)}
                  />
                )}
                {p.lat_destination && p.lon_destination && (
                  <Marker
                    position={{ lat: p.lat_destination, lng: p.lon_destination }}
                    title={`${p.report_id} — Destination`}
                    icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: '#10b981', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5, scale: 5 }}
                    onClick={() => navigate(`/code/${p.report_id}`)}
                  />
                )}
                {p.lat_initial && p.lon_initial && p.lat_incident && p.lon_incident && (
                  <Polyline
                    path={[{ lat: p.lat_initial, lng: p.lon_initial }, { lat: p.lat_incident, lng: p.lon_incident }]}
                    options={{ strokeColor: '#6b7280', strokeOpacity: 0.4, strokeWeight: 1.5 }}
                  />
                )}
              </div>
            ))}
          </GoogleMap>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 11.5, color: 'var(--text-3)' }}>
            {[['#3b82f6','Initial contact'],['#ef4444','Incident'],['#10b981','Destination']].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, border: '1.5px solid #fff', boxShadow: '0 0 0 1px #aaa' }} />
                {label}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    );
  };

  // ── Case Linkage View tab ─────────────────────────────────────────────────

  const LinkageViewTab = () => {
    if (linkageLoading) return (
      <div style={{ color: 'var(--text-3)', fontSize: 13, fontStyle: 'italic', padding: '20px 0' }}>
        Loading linkage patterns…
      </div>
    );

    if (!linkageData) return (
      <div style={{ color: 'var(--text-3)', fontSize: 13, fontStyle: 'italic', padding: '20px 0' }}>
        No linkage data available.
      </div>
    );

    const { repeated_vehicles, repeated_locations, behavior_clusters } = linkageData;
    const hasAny = repeated_vehicles.length > 0 || repeated_locations.length > 0 || behavior_clusters.length > 0;

    const PotentialNote = () => (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 7,
        fontSize: 11.5, color: 'var(--text-3)', padding: '7px 12px',
        background: 'var(--surface-2)', borderRadius: 6,
        border: '1px solid var(--border)', marginBottom: 16,
      }}>
        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--amber)' }} />
        <span>All matches below are <strong style={{ color: 'var(--amber)', fontWeight: 600 }}>potential linkage only</strong> — not confirmed connections. Review individual cases before drawing conclusions.</span>
      </div>
    );

    const LinkageTable = ({ items, emptyMsg }: { items: { descriptor: string; count: number; report_ids: string[] }[]; emptyMsg: string }) => (
      items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>{emptyMsg}</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Descriptor','Cases','Report IDs'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                <td style={{ padding: '7px 8px', color: 'var(--text-1)', fontWeight: 500 }}>{item.descriptor}</td>
                <td style={{ padding: '7px 8px', color: 'var(--text-3)', textAlign: 'center' }}>{item.count}</td>
                <td style={{ padding: '7px 8px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {item.report_ids.map(id => (
                      <button key={id} onClick={() => navigate(`/code/${id}`)}
                        style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--accent)', fontFamily: 'monospace', cursor: 'pointer' }}>
                        {id}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    );

    return (
      <div>
        {!hasAny ? (
          <Panel>
            <SectionHeading>Case Linkage View</SectionHeading>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
              No repeated descriptors found across cases yet. As more cases are coded, shared vehicle descriptions, locations, and behavior patterns will appear here.
            </div>
          </Panel>
        ) : (
          <>
            <PotentialNote />
            <Panel>
              <SectionHeading>Repeated Vehicle Descriptors</SectionHeading>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
                Plates or make/colour combinations appearing in 2+ cases.
              </p>
              <LinkageTable items={repeated_vehicles} emptyMsg="No repeated vehicle descriptors." />
            </Panel>
            <Panel>
              <SectionHeading>Repeated Locations</SectionHeading>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
                Initial contact or incident locations shared across 2+ cases.
              </p>
              <LinkageTable items={repeated_locations} emptyMsg="No repeated locations." />
            </Panel>
            <Panel>
              <SectionHeading>Behaviour Clusters</SectionHeading>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
                Co-occurring violence indicators seen in 2+ cases.
              </p>
              <LinkageTable items={behavior_clusters} emptyMsg="No shared behavior clusters." />
            </Panel>
          </>
        )}
      </div>
    );
  };

  // ── Research Notes panel ──────────────────────────────────────────────────

  const fmtNoteDate = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  const ResearchNotesPanel = () => {
    return (
      <div style={{
        marginTop: 24, border: '1px solid var(--border)', borderRadius: 8,
        background: 'var(--surface)',
      }}>
        <button
          onClick={() => setNotesExpanded(e => !e)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '10px 16px', background: 'none', border: 'none',
            cursor: 'pointer', borderRadius: notesExpanded ? '8px 8px 0 0' : 8,
            borderBottom: notesExpanded ? '1px solid var(--border)' : 'none',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            Research Notes {notes.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>({notes.length} saved)</span>}
          </span>
          {notesExpanded ? <ChevronUp size={15} color="var(--text-3)" /> : <ChevronDown size={15} color="var(--text-3)" />}
        </button>

        {notesExpanded && (
          <div style={{ padding: '14px 16px' }}>
            {/* New note input */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <textarea
                value={newNoteText}
                onChange={e => setNewNoteText(e.target.value)}
                placeholder="Write an analytic note… (e.g. pattern observations, hypotheses, follow-up questions)"
                rows={3}
                style={{
                  flex: 1, fontSize: 12.5, padding: '8px 10px',
                  border: '1px solid var(--border)', borderRadius: 5,
                  background: 'var(--bg)', color: 'var(--text-1)',
                  resize: 'vertical', fontFamily: 'DM Sans, sans-serif',
                }}
              />
              <button
                onClick={() => saveNote()}
                disabled={savingNote || !newNoteText.trim()}
                style={{
                  padding: '8px 14px', borderRadius: 5, alignSelf: 'flex-end',
                  border: '1px solid var(--accent)', background: 'var(--accent-pale)',
                  color: 'var(--accent)', fontSize: 12.5, fontWeight: 600,
                  cursor: savingNote || !newNoteText.trim() ? 'not-allowed' : 'pointer',
                  opacity: savingNote || !newNoteText.trim() ? 0.5 : 1,
                }}
              >
                Save
              </button>
            </div>

            {/* Error message */}
            {noteError && (
              <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8, padding: '6px 10px', borderRadius: 4, background: '#fee2e2', border: '1px solid #fca5a5' }}>
                {noteError}
              </div>
            )}

            {/* Saved notes */}
            {notes.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
                No notes yet. Write and save analytic observations above.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notes.map(note => (
                  <div key={note.id} style={{
                    padding: '10px 12px', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--surface-2)',
                    position: 'relative',
                  }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.5, whiteSpace: 'pre-wrap', paddingRight: 28 }}>
                      {note.note_text}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                      {fmtNoteDate(note.created_at)}
                      {note.tagged_pattern && (
                        <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 3, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 10.5 }}>
                          {note.tagged_pattern}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteNote(note.id)}
                      style={{
                        position: 'absolute', top: 8, right: 8, background: 'none',
                        border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2,
                        borderRadius: 3, display: 'flex', alignItems: 'center',
                      }}
                      title="Delete note"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
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
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
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
                padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-2)',
                fontSize: 12, cursor: 'pointer',
              }}
              title="Download all aggregate research tables as ZIP"
            >
              <Download size={13} /> Research tables ZIP
            </button>
            <button
              onClick={() => navigate('/bulletin')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 6,
                border: '1px solid var(--accent)',
                background: 'var(--accent-pale)', color: 'var(--accent)',
                fontSize: 12, cursor: 'pointer', fontWeight: 500,
              }}
              title="Generate a structured analytic bulletin"
            >
              <FileText size={13} /> Generate Bulletin
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

        {tab === 'stage_patterns' && <StagePatternsTab />}
        {tab === 'sequences'      && <SequencesTab />}
        {tab === 'mobility'       && <MobilityTab />}
        {tab === 'environment'    && <EnvironmentTab />}
        {tab === 'spatial'        && <SpatialOverviewTab />}
        {tab === 'linkage_view'   && <LinkageViewTab />}
        {tab === 'caselist'       && <CaseListTab />}

        <ResearchNotesPanel />

      </div>
    </div>
  );
}
