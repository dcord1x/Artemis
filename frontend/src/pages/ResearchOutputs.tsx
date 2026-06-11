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
 * Provenance note: analyst-confirmed values are primary. Fields not yet
 * reviewed by the analyst are marked not analyst-confirmed.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Trash2, FileText } from 'lucide-react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import { api } from '../api';
import { formatLabel } from '../utils';

/** Worker response labels — overrides shared formatLabel for values that overlap with stage-type names. */
function formatWorkerResponse(v: string): string {
  if (v === 'negotiation') return 'Negotiated / attempted negotiation';
  return formatLabel(v);
}
import type {
  ResearchAggregate,
  AggregateEncounter,
  AggregateVawg,
  DataQuality,
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
import { GOOGLE_MAPS_API_KEY } from '../mapsConfig';
import { useMaps } from '../context/MapsContext';

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
        <strong style={{ fontWeight: 600, color: 'var(--amber)' }}>[unreviewed]</strong>
        {' '}markers indicate fields that have not yet been confirmed by the analyst —
        treat these as unreviewed imports, not confirmed findings.
      </span>
    </div>
  );
}

/** Horizontal frequency bar */
function FreqBar({
  label, count, max, sub, color = 'var(--accent)', provisional, sparse,
}: {
  label: string; count: number; max: number;
  sub?: string; color?: string; provisional?: boolean; sparse?: boolean;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  // Sparse signals get a visually muted, thinner bar
  const barH = sparse ? 3 : 5;
  const barColor = sparse ? color + '88' : color;
  return (
    <div style={{ marginBottom: sparse ? 6 : 8, opacity: sparse ? 0.75 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ fontSize: sparse ? 12 : 12.5, color: sparse ? 'var(--text-3)' : 'var(--text-2)', maxWidth: '78%', lineHeight: 1.35 }}>
          {label}
          {provisional && (
            <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--amber)', fontWeight: 600 }}>
              [unreviewed]
            </span>
          )}
          {sparse && <SparseBadge />}
          {sub && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 5 }}>{sub}</span>}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500, flexShrink: 0 }}>{count}</span>
      </div>
      <div style={{ height: barH, borderRadius: 10, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 10, background: barColor, width: `${pct}%`, transition: 'width 0.5s ease' }} />
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

/** Small colour chip for table cells in filtered groups */
function CellChip({ value, goodValues, warnValues, neutral }: {
  value: string; goodValues: string[]; warnValues: string[]; neutral?: boolean;
}) {
  if (!value) return <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>—</span>;
  const v = value.toLowerCase();
  let bg = 'var(--surface-3)', color = 'var(--text-3)', border = 'var(--border)';
  if (!neutral) {
    if (goodValues.some(g => v.includes(g.toLowerCase()))) { bg = '#22C55E14'; color = '#22C55E'; border = '#22C55E30'; }
    else if (warnValues.some(w => v.includes(w.toLowerCase()))) { bg = '#F59E0B14'; color = '#F59E0B'; border = '#F59E0B30'; }
  }
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
      {formatLabel(value)}
    </span>
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

/** Format percentage with 1 decimal place for small values to avoid "0%" */
function fmtPct(n: number, total: number): string {
  if (total === 0) return '—';
  const p = (n / total) * 100;
  if (p === 0) return '0%';
  if (p < 10) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

/** Format as "N cases (X%)" */
function fmtCountPct(n: number, total: number): string {
  return `${n} case${n !== 1 ? 's' : ''} (${fmtPct(n, total)})`;
}

// ── Research governance layer ─────────────────────────────────────────────────

/**
 * Minimum coded cases before a distribution/chart is shown at full weight.
 * Below this, outputs are labelled "coded signal" not "pattern."
 */
const SPARSE_MIN = 5;
/**
 * Minimum coded cases before a distribution card is shown at all.
 * Below this, show a compact placeholder instead of an empty panel.
 */
const MIN_DIST_CASES = 3;

/** True if a count is too small to represent a meaningful distribution. */
function isSparse(count: number): boolean {
  return count > 0 && count < SPARSE_MIN;
}

/** Compact placeholder shown in place of an empty or near-empty output. */
function SparsePlaceholder({ field, tab = 'Encounter' }: { field: string; tab?: string }) {
  return (
    <div style={{
      fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic',
      padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 5,
      border: '1px dashed var(--border)',
    }}>
      Not enough analyst-coded data yet to display this output.
      Code <strong style={{ fontWeight: 600, fontStyle: 'normal' }}>{field}</strong> in the {tab} tab to populate this section.
    </div>
  );
}

/**
 * Compact "sparse" badge shown next to an output with very low counts.
 * Visually signals that the result is a preliminary coded signal, not a pattern.
 */
function SparseBadge() {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
      background: 'var(--amber-pale, #fffbeb)', color: 'var(--amber, #f59e0b)',
      border: '1px solid var(--amber-border, #fcd34d)',
      marginLeft: 6, verticalAlign: 'middle',
    }}>
      sparse
    </span>
  );
}

// ── Module-level constants ────────────────────────────────────────────────────

function severityColor(sev: string): string {
  const s = sev.toLowerCase();
  if (s.includes('severe') || s.includes('high risk')) return '#A51F1F';
  if (s.includes('high concern')) return 'var(--amber)';
  return 'var(--green)';
}

const SUITABILITY_RE = /^(yes|no|partial)/i;

const INDICATOR_LABELS: [string, string, string][] = [
  ['negotiation_present',         'Negotiation present',                     '#0ea5e9'],
  ['refusal_present',             'Refusal present',                         '#0ea5e9'],
  ['pressure_after_refusal',      'Pressure after refusal',                  '#f59e0b'],
  ['boundary_issue_present',      'Boundary issue present',                  '#f59e0b'],
  ['coercion_present',            'Coercion present',                        '#ef4444'],
  ['threats_present',             'Threats present',                         '#ef4444'],
  ['verbal_abuse',                'Verbal abuse',                            '#ef4444'],
  ['physical_force',              'Physical force',                          '#ef4444'],
  ['sexual_assault',              'Sexual assault',                          '#ef4444'],
  ['stealthing',                  'Stealthing / condom refusal',             '#ef4444'],
  ['robbery_theft',               'Robbery / theft',                         '#ef4444'],
  ['non_consensual_substance',    'Non-consensual substance administration', '#8b5cf6'],
  ['loss_of_consciousness',       'Loss of consciousness / blackout',        '#8b5cf6'],
  ['forced_movement_dragging',    'Forced movement / dragging',              '#6366f1'],
  ['restraint_confinement',       'Restraint / confinement',                 '#6366f1'],
  ['weapon_present_used',         'Weapon present / used',                   '#ef4444'],
  ['choking_strangulation',       'Choking / strangulation',                 '#ef4444'],
  ['prevented_exit',              'Prevented exit / blocked escape',         '#ef4444'],
  ['movement_relocation_present', 'Movement / relocation present',           '#6366f1'],
  ['repeated_pressure',           'Repeated pressure (escalation cue)',      '#f59e0b'],
  ['intimidation_present',        'Intimidation present (escalation cue)',   '#f59e0b'],
  ['abrupt_tone_change',          'Abrupt tone change (escalation cue)',     '#f59e0b'],
  ['verbal_abuse_before_violence', 'Verbal abuse before violence',           '#f59e0b'],
];


const HEATMAP_SHORT_LABELS: Record<string, string> = {
  refusal_present:                     'Refusal',
  pressure_after_refusal:              'Pressure',
  coercion_present:                    'Coercion',
  threats_present:                     'Threats',
  physical_force:                      'Phys. force',
  sexual_assault:                      'Sexual assault',
  stealthing:                          'Stealthing',
  robbery_theft:                       'Robbery',
  non_consensual_substance:            'Substance',
  loss_of_consciousness:               'Blackout',
  forced_movement_dragging:            'Forced mvmt',
  restraint_confinement:               'Restraint',
  weapon_present_used:                 'Weapon',
  choking_strangulation:               'Choking',
  prevented_exit:                      'Exit blocked',
  movement_relocation_present:         'Movement',
  trafficking_exploitation_concern:    'Trafficking',
  third_party_control_indicated:       '3rd-party ctrl',
  public_safety_bulletin_suitability:  'Bulletin',
};

const STAGE_NODE_COLORS: Record<string, string> = {
  'initial contact':      '#64748b',
  'negotiation':          '#f59e0b',
  'refusal':              '#f59e0b',
  'pressure':             '#f59e0b',
  'movement':             '#6366f1',
  'environment shift':    '#6366f1',
  'coercion':             '#ef4444',
  'physical force':       '#ef4444',
  'sexual assault':       '#ef4444',
  'robbery':              '#ef4444',
  'weapon':               '#ef4444',
  'choking':              '#ef4444',
  'substance':            '#8b5cf6',
  'blackout':             '#8b5cf6',
  'exit':                 '#10b981',
  'escape':               '#10b981',
  'outcome':              '#10b981',
};

function stageNodeColor(label: string): string {
  const l = label.toLowerCase();
  for (const [key, color] of Object.entries(STAGE_NODE_COLORS)) {
    if (l.includes(key)) return color;
  }
  return '#64748b';
}

// ── Visual sub-components ─────────────────────────────────────────────────────

function SequenceFlowDiagram({ sequences, total }: { sequences: { sequence: string; count: number }[]; total: number }) {
  const top = sequences.slice(0, 5);
  if (top.length === 0) return <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No sequences coded yet.</div>;

  const NODE_W = 132;
  const GAP = 18;
  const PAD = 10;

  function wrapLabel(s: string): string[] {
    if (s.length <= 15) return [s];
    const mid = Math.ceil(s.length / 2);
    let idx = s.lastIndexOf(' ', mid);
    if (idx < 5) idx = s.indexOf(' ', mid);
    if (idx < 0) return [s];
    return [s.slice(0, idx), s.slice(idx + 1)];
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {top.map((row, ri) => {
        const nodes = row.sequence.split(' → ');
        const wrapped = nodes.map(n => wrapLabel(n));
        const hasWrapped = wrapped.some(w => w.length > 1);
        const NODE_H = hasWrapped ? 44 : 32;
        const ROW_H = NODE_H + 20;
        const ARROW_Y = ROW_H / 2;
        const svgW = nodes.length * (NODE_W + GAP) - GAP + PAD * 2;
        return (
          <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ overflowX: 'auto' }}>
              <svg width={svgW} height={ROW_H} viewBox={`0 0 ${svgW} ${ROW_H}`} style={{ display: 'block' }}>
                <defs>
                  <marker id={`arr-${ri}`} markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
                    <path d="M0,0 L0,7 L8,3.5 z" fill="#94a3b8" />
                  </marker>
                </defs>
                {nodes.map((node, ni) => {
                  const x = PAD + ni * (NODE_W + GAP);
                  const color = stageNodeColor(node);
                  const lines = wrapped[ni];
                  return (
                    <g key={ni}>
                      {ni < nodes.length - 1 && (
                        <line x1={x + NODE_W} y1={ARROW_Y} x2={x + NODE_W + GAP - 3} y2={ARROW_Y}
                          stroke="#94a3b8" strokeWidth="1.5" markerEnd={`url(#arr-${ri})`} />
                      )}
                      <rect x={x} y={(ROW_H - NODE_H) / 2} width={NODE_W} height={NODE_H} rx={5}
                        fill={color + '22'} stroke={color} strokeWidth="1.5" />
                      {lines.length === 1 ? (
                        <text x={x + NODE_W / 2} y={ARROW_Y + 4} textAnchor="middle"
                          fontSize="10.5" fill={color} fontWeight="600"
                          style={{ fontFamily: 'system-ui, sans-serif' }}>{lines[0]}</text>
                      ) : (
                        <>
                          <text x={x + NODE_W / 2} y={ARROW_Y - 4} textAnchor="middle"
                            fontSize="10.5" fill={color} fontWeight="600"
                            style={{ fontFamily: 'system-ui, sans-serif' }}>{lines[0]}</text>
                          <text x={x + NODE_W / 2} y={ARROW_Y + 10} textAnchor="middle"
                            fontSize="10.5" fill={color} fontWeight="600"
                            style={{ fontFamily: 'system-ui, sans-serif' }}>{lines[1]}</text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              ×{row.count} ({total > 0 ? fmtPct(row.count, total) : '—'})
            </span>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-3)', padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 5, marginTop: 4 }}>
        {([
          ['#64748b', 'Contact / neutral'],
          ['#f59e0b', 'Negotiation / pressure'],
          ['#6366f1', 'Movement / shift'],
          ['#ef4444', 'Harm / violence'],
          ['#10b981', 'Exit / outcome'],
        ] as [string, string][]).map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: color + '44', border: `1.5px solid ${color}`, flexShrink: 0 }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
        Observed coded sequences — not causal inference.
      </div>
    </div>
  );
}

function EscalationPathwayDiagram({ bigrams }: { bigrams: { pattern: string; count: number }[]; stageFreq?: { stage: string; count: number }[] }) {
  if (bigrams.length === 0) return <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No transition data coded yet.</div>;

  type Group = { label: string; color: string; items: typeof bigrams };
  const groups: Group[] = [
    { label: 'Contact / setup', color: '#64748b', items: [] },
    { label: 'Negotiation / pressure', color: '#f59e0b', items: [] },
    { label: 'Movement / environmental', color: '#6366f1', items: [] },
    { label: 'Escalation / harm', color: '#ef4444', items: [] },
    { label: 'Exit / outcome', color: '#10b981', items: [] },
  ];

  const colorToGroup: Record<string, number> = {
    '#64748b': 0, '#f59e0b': 1, '#6366f1': 2, '#8b5cf6': 2,
    '#ef4444': 3, '#10b981': 4,
  };

  for (const b of bigrams.slice(0, 20)) {
    const [, to] = b.pattern.split(' → ');
    const toColor = stageNodeColor(to || '');
    const gi = colorToGroup[toColor] ?? 0;
    groups[gi].items.push(b);
  }

  const maxCount = bigrams[0]?.count ?? 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
        Bar width = frequency of this transition. Grouped by destination stage type.
        Observed coded pathways — not confirmed causal sequences.
      </div>
      {groups.filter(g => g.items.length > 0).map(g => (
        <div key={g.label}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: g.color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: g.color + '44', border: `1.5px solid ${g.color}` }} />
            {g.label}
          </div>
          {g.items.map((b, i) => {
            const [from, to] = b.pattern.split(' → ');
            const pct = maxCount > 0 ? b.count / maxCount * 100 : 0;
            const fromColor = stageNodeColor(from || '');
            const toColor = stageNodeColor(to || '');
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 5 }}>
                <div style={{ width: 220, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: fromColor, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={from}>{from}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 12, flexShrink: 0 }}>→</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: toColor, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={to}>{to}</span>
                </div>
                <div style={{ flex: 1, height: 12, background: 'var(--surface-3)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 6, background: toColor, width: `${pct}%`, transition: 'width 0.5s ease' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-3)', width: 28, textAlign: 'right', flexShrink: 0 }}>×{b.count}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CooccurrenceHeatmap({ fields, matrix, total }: { fields: string[]; matrix: number[][]; total: number }) {
  if (fields.length === 0 || matrix.length === 0) return <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No data yet.</div>;

  const CELL = 30;
  const LABEL_W = 140;
  const LABEL_H = 100;

  function renderGrid(indices: number[], title: string, color: string) {
    const n = indices.length;
    const subFields = indices.map(i => fields[i]);
    const maxVal = Math.max(1, ...indices.flatMap(ri =>
      indices.filter(ci => ri !== ci).map(ci => matrix[ri]?.[ci] ?? 0)
    ));
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color, marginBottom: 8 }}>{title}</div>
        <div style={{ overflowX: 'auto' }}>
          <svg
            width={LABEL_W + n * CELL + 4}
            height={LABEL_H + n * CELL + 4}
            viewBox={`0 0 ${LABEL_W + n * CELL + 4} ${LABEL_H + n * CELL + 4}`}
            style={{ display: 'block' }}
          >
            {subFields.map((f, ci) => (
              <text key={`col-${ci}`}
                x={LABEL_W + ci * CELL + CELL / 2} y={LABEL_H - 4}
                fontSize="9.5" fill="var(--text-3)" textAnchor="end"
                transform={`rotate(-45, ${LABEL_W + ci * CELL + CELL / 2}, ${LABEL_H - 4})`}
                style={{ fontFamily: 'system-ui, sans-serif' }}>
                <title>{f.replace(/_/g, ' ')}</title>
                {HEATMAP_SHORT_LABELS[f] ?? f.replace(/_/g, ' ')}
              </text>
            ))}
            {subFields.map((rf, ri) => (
              <g key={`row-${ri}`}>
                <text x={LABEL_W - 4} y={LABEL_H + ri * CELL + CELL / 2 + 3.5}
                  fontSize="9.5" fill="var(--text-3)" textAnchor="end"
                  style={{ fontFamily: 'system-ui, sans-serif' }}>
                  <title>{rf.replace(/_/g, ' ')}</title>
                  {HEATMAP_SHORT_LABELS[rf] ?? rf.replace(/_/g, ' ')}
                </text>
                {subFields.map((cf, ci) => {
                  const actualRi = indices[ri];
                  const actualCi = indices[ci];
                  const val = matrix[actualRi]?.[actualCi] ?? 0;
                  const isDiag = actualRi === actualCi;
                  const pctTip = total > 0 ? (val / total * 100) < 10 ? (val / total * 100).toFixed(1) : Math.round(val / total * 100).toString() : '0';
                  const opacity = isDiag ? 0.12 : (maxVal > 0 ? Math.min(0.88, val / maxVal * 0.88 + 0.08) : 0);
                  const fill = isDiag ? '#94a3b8' : val === 0 ? 'transparent' : `rgba(239,68,68,${opacity})`;
                  const fullA = rf.replace(/_/g, ' ');
                  const fullB = cf.replace(/_/g, ' ');
                  return (
                    <g key={`cell-${ri}-${ci}`}>
                      <rect x={LABEL_W + ci * CELL} y={LABEL_H + ri * CELL}
                        width={CELL - 1} height={CELL - 1}
                        fill={fill}
                        stroke={val > 0 ? 'rgba(239,68,68,0.2)' : 'var(--border)'}
                        strokeWidth="0.5">
                        <title>{isDiag ? `${fullA}: ${val} case${val !== 1 ? 's' : ''} (individual count)` : `${fullA} × ${fullB}: ${val} case${val !== 1 ? 's' : ''} (${pctTip}% of coded cases)`}</title>
                      </rect>
                      {val > 0 && !isDiag && val >= (maxVal * 0.4) && (
                        <text x={LABEL_W + ci * CELL + CELL / 2} y={LABEL_H + ri * CELL + CELL / 2 + 3.5}
                          textAnchor="middle" fontSize="8" fill="var(--text-1)"
                          style={{ fontFamily: 'system-ui, sans-serif', pointerEvents: 'none' }}>{val}</text>
                      )}
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>
      </div>
    );
  }

  const harmIndices  = fields.map((_, i) => i).slice(0, 16);
  const vawgIndices  = fields.map((_, i) => i).slice(12);

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 5, lineHeight: 1.5 }}>
        Cells show observed co-occurrence within the same case — how often both indicators are present together.
        This does not establish causation or linkage. Diagonal = individual indicator count.
        Hover over a cell to see the indicator pair, count, and percentage of coded cases.
      </div>
      {renderGrid(harmIndices, 'Harm and control indicators', '#ef4444')}
      {renderGrid(vawgIndices, 'VAWG / exploitation and public safety indicators', '#f59e0b')}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 11, color: 'var(--text-3)' }}>
        <span>Low co-occurrence</span>
        <div style={{ display: 'flex', gap: 1 }}>
          {[0.08,0.25,0.45,0.65,0.88].map(o => (
            <div key={o} style={{ width: 16, height: 12, background: `rgba(239,68,68,${o})`, borderRadius: 2 }} />
          ))}
        </div>
        <span>High co-occurrence</span>
      </div>
    </div>
  );
}

function MovementRiskCard({ counts, total }: { counts: { movement_present: number; public_to_private: number; public_to_secluded: number; entered_vehicle: number; offender_controlled_high: number; cross_municipality: number } | null; total: number }) {
  if (!counts) return null;
  const pct = (n: number) => fmtPct(n, total);

  const rows: [string, number, string][] = [
    ['Movement present',              counts.movement_present,          '#6366f1'],
    ['Public → private shift',        counts.public_to_private,         '#f59e0b'],
    ['Public → secluded shift',       counts.public_to_secluded,        '#f59e0b'],
    ['Entered vehicle',               counts.entered_vehicle,           '#6366f1'],
    ['Offender-controlled (high)',    counts.offender_controlled_high,  '#ef4444'],
    ['Cross-municipality',            counts.cross_municipality,        '#8b5cf6'],
  ];
  const maxVal = Math.max(1, ...rows.map(r => r[1]));

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>
        Cases where movement coincides with changed risk conditions.
        Analyst-coded values only. Movement ≠ causation.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map(([label, count, color]) => (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{count} ({pct(count)})</span>
            </div>
            <div style={{ height: 6, borderRadius: 10, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 10, background: color, width: `${maxVal > 0 ? count / maxVal * 100 : 0}%`, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type Tab = 'encounter_overview' | 'vawg' | 'sequences' | 'mobility' | 'environment' | 'caselist' | 'stage_patterns' | 'spatial' | 'linkage_view' | 'filtered_groups';

const TABS: { id: Tab; label: string }[] = [
  { id: 'encounter_overview', label: 'Coded Case Overview' },
  { id: 'stage_patterns',     label: 'RQ1 — Stage Patterns' },
  { id: 'sequences',          label: 'RQ1 — Encounter Sequences' },
  { id: 'environment',        label: 'RQ2 — Environmental Patterns' },
  { id: 'mobility',           label: 'RQ3 — Mobility Pathways' },
  { id: 'spatial',            label: 'RQ3 — Spatial Movement' },
  { id: 'filtered_groups',    label: 'Filtered Case Groups' },
  { id: 'linkage_view',       label: 'Case Comparison' },
  { id: 'caselist',           label: 'Case Sequence Table' },
  { id: 'vawg',               label: 'Supplementary Flags' },
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

  // Case list sorting / filtering
  const [caseSort, setCaseSort]                     = useState<string>('severity');
  const [caseSortAsc, setCaseSortAsc]               = useState(false);
  const [caseFilterSeverity, setCaseFilterSeverity] = useState('');
  const [caseFilterMovement, setCaseFilterMovement] = useState('');
  const [caseFilterHarm, setCaseFilterHarm]         = useState('');
  const [caseFilterEsc, setCaseFilterEsc]           = useState('');
  const [caseFilterStages, setCaseFilterStages]     = useState('');

  // Filtered case groups
  const [fgReports, setFgReports]           = useState<import('../types').Report[]>([]);
  const [fgAllReports, setFgAllReports]     = useState<import('../types').Report[]>([]);
  const [fgLoading, setFgLoading]           = useState(false);
  const [fgPreset, setFgPreset]             = useState('');

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
  const { isLoaded: mapsLoaded } = useMaps();

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

  // ── Encounter Overview tab ────────────────────────────────────────────────

  const EncounterOverviewTab = () => {
    const enc: AggregateEncounter | undefined = data.encounter;
    if (!enc) {
      return (
        <Panel>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            Encounter overview data not yet available. Restart the backend to load.
          </div>
        </Panel>
      );
    }

    const indCounts = enc.indicator_counts;
    const maxInd = Math.max(1, ...Object.values(indCounts));
    const maxDist = (arr: { value: string; count: number }[]) => arr[0]?.count ?? 1;

    // Grouped indicator sections
    type IndicatorGroup = { label: string; color: string; fields: [string, string, string][] };
    const INDICATOR_GROUPS: IndicatorGroup[] = [
      {
        label: 'Negotiation / refusal',
        color: '#0ea5e9',
        fields: [
          ['negotiation_present',    'Negotiation present',          '#0ea5e9'],
          ['refusal_present',        'Refusal present',              '#0ea5e9'],
          ['pressure_after_refusal', 'Pressure after refusal',       '#f59e0b'],
          ['boundary_issue_present', 'Boundary issue present',       '#f59e0b'],
        ],
      },
      {
        label: 'Coercion / control',
        color: '#ef4444',
        fields: [
          ['coercion_present',  'Coercion present',  '#ef4444'],
          ['threats_present',   'Threats present',   '#ef4444'],
          ['verbal_abuse',      'Verbal abuse',      '#ef4444'],
        ],
      },
      {
        label: 'Physical and sexual violence',
        color: '#ef4444',
        fields: [
          ['physical_force',   'Physical force',               '#ef4444'],
          ['sexual_assault',   'Sexual assault',               '#ef4444'],
          ['stealthing',       'Stealthing / condom refusal',  '#ef4444'],
          ['robbery_theft',    'Robbery / theft',              '#ef4444'],
          ['weapon_present_used',     'Weapon present / used',         '#ef4444'],
          ['choking_strangulation',   'Choking / strangulation',       '#ef4444'],
          ['prevented_exit',          'Prevented exit / blocked escape','#ef4444'],
          ['forced_movement_dragging','Forced movement / dragging',     '#6366f1'],
          ['restraint_confinement',   'Restraint / confinement',        '#6366f1'],
        ],
      },
      {
        label: 'Movement / location',
        color: '#6366f1',
        fields: [
          ['movement_relocation_present','Movement / relocation present','#6366f1'],
        ],
      },
      {
        label: 'Substance / blackout',
        color: '#8b5cf6',
        fields: [
          ['non_consensual_substance','Non-consensual substance administration','#8b5cf6'],
          ['loss_of_consciousness',   'Loss of consciousness / blackout',       '#8b5cf6'],
        ],
      },
      {
        label: 'Early escalation cues',
        color: '#f59e0b',
        fields: [
          ['repeated_pressure',         'Repeated pressure',          '#f59e0b'],
          ['intimidation_present',      'Intimidation present',       '#f59e0b'],
          ['abrupt_tone_change',        'Abrupt tone change',         '#f59e0b'],
          ['verbal_abuse_before_violence','Verbal abuse before violence','f59e0b'],
        ],
      },
    ];

    // Derive top indicators for summary card
    const sortedInd = INDICATOR_LABELS
      .map(([field, label]) => ({ field, label, count: indCounts[field as keyof typeof indCounts] ?? 0 }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Currently coded incident-level signals summary */}
        {sortedInd.length > 0 && (
          <Panel>
            <SectionHeading>Currently coded incident-level signals</SectionHeading>
            <div style={{
              fontSize: 11.5, color: 'var(--text-3)', padding: '8px 12px',
              background: 'var(--surface-2)', borderRadius: 5, marginBottom: 14,
              lineHeight: 1.6, borderLeft: '3px solid var(--accent)',
            }}>
              These indicators appear in analyst-coded fields. They are preliminary coded signals only and do not
              establish prevalence, causation, linkage, or general patterns across the dataset.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sortedInd.map(x => (
                <div key={x.field} style={{
                  padding: '5px 10px', borderRadius: 5,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  fontSize: 12,
                }}>
                  <span style={{ color: 'var(--text-2)' }}>{x.label}</span>
                  <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>{fmtCountPct(x.count, total)}</span>
                  {isSparse(x.count) && <SparseBadge />}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Distributions row */}
        {(() => {
          // Show a distribution card only if at least min(10, 10% of dataset) cases have the field coded
          const distThreshold = Math.max(MIN_DIST_CASES, Math.min(10, Math.floor(total * 0.1)));
          const codedIncType  = enc.incident_type_distribution.reduce((s, r) => s + r.count, 0);
          const codedSeverity = enc.severity_distribution.reduce((s, r) => s + r.count, 0);
          const codedSuit     = enc.suitability_distribution.reduce((s, r) => s + r.count, 0);
          const codedClarity  = enc.clarity_distribution.reduce((s, r) => s + r.count, 0);
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <Panel>
                <SectionHeading>Primary incident type</SectionHeading>
                {codedIncType < distThreshold ? (
                  <SparsePlaceholder field="Primary incident type" />
                ) : (
                  <>
                    <ProvenanceNote />
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px' }}>
                      {codedIncType} of {total} cases coded — % of all cases shown.
                    </p>
                    {enc.incident_type_distribution.map((row, i) => (
                      <FreqBar key={i} label={row.value} count={row.count}
                        max={maxDist(enc.incident_type_distribution)} color='var(--accent)'
                        sub={`${fmtPct(row.count, total)} of all cases`}
                        sparse={isSparse(row.count)} />
                    ))}
                  </>
                )}
              </Panel>
              <Panel>
                <SectionHeading>Overall severity</SectionHeading>
                {codedSeverity < distThreshold ? (
                  <SparsePlaceholder field="Overall severity" />
                ) : (
                  <>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px' }}>
                      {codedSeverity} of {total} cases coded — % of all cases shown.
                    </p>
                    {enc.severity_distribution.map((row, i) => (
                      <FreqBar key={i} label={row.value} count={row.count}
                        max={maxDist(enc.severity_distribution)} color={severityColor(row.value)}
                        sub={`${fmtPct(row.count, total)} of all cases`}
                        sparse={isSparse(row.count)} />
                    ))}
                  </>
                )}
              </Panel>
              <Panel>
                <SectionHeading>Stage coding suitability</SectionHeading>
                {codedSuit < distThreshold ? (
                  <SparsePlaceholder field="Stage coding suitability" />
                ) : (
                  <>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px' }}>
                      {codedSuit} of {total} cases coded — % of all cases shown.
                    </p>
                    {enc.suitability_distribution.map((row, i) => (
                      <FreqBar key={i} label={row.value} count={row.count}
                        max={maxDist(enc.suitability_distribution)} color='#10b981'
                        sub={`${fmtPct(row.count, total)} of all cases`}
                        sparse={isSparse(row.count)} />
                    ))}
                  </>
                )}
              </Panel>
              <Panel>
                <SectionHeading>Sequence clarity</SectionHeading>
                {codedClarity < distThreshold ? (
                  <SparsePlaceholder field="Sequence clarity" />
                ) : (
                  <>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px' }}>
                      {codedClarity} of {total} cases coded — % of all cases shown.
                    </p>
                    {enc.clarity_distribution.map((row, i) => (
                      <FreqBar key={i} label={row.value} count={row.count}
                        max={maxDist(enc.clarity_distribution)} color='#0ea5e9'
                        sub={`${fmtPct(row.count, total)} of all cases`}
                        sparse={isSparse(row.count)} />
                    ))}
                  </>
                )}
              </Panel>
            </div>
          );
        })()}

        {/* Grouped harm indicators */}
        <Panel>
          <SectionHeading>Incident-level harm and control indicators</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 8px' }}>
            Count of cases where each indicator is coded yes, probable, or inferred.
            Denominator: all {total} cases. Analyst-coded values only. Unreviewed imported or system-populated fields are not counted as findings.
          </p>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 5, border: '1px solid var(--border)', marginBottom: 12, lineHeight: 1.5 }}>
            <strong style={{ fontWeight: 600, color: 'var(--text-2)' }}>Note:</strong>{' '}
            "Movement / relocation present" refers to relocation or spatial transition pathway fields coded in the Encounter tab.
            "Forced movement / dragging" is coded separately as a physical harm/control indicator. These are not the same field.
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px' }}>
            Indicators with fewer than {SPARSE_MIN} cases are marked{' '}
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'var(--amber-pale, #fffbeb)', color: 'var(--amber, #f59e0b)', border: '1px solid var(--amber-border, #fcd34d)' }}>sparse</span>
            {' '}and shown with reduced visual weight.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
            {INDICATOR_GROUPS.map(group => (
              <div key={group.label} style={{ marginBottom: 18 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: group.color,
                  marginBottom: 7, display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: group.color + '44', border: `1.5px solid ${group.color}`, flexShrink: 0 }} />
                  {group.label}
                </div>
                {group.fields.map(([field, label, color]) => {
                  const count = indCounts[field as keyof typeof indCounts] ?? 0;
                  return (
                    <FreqBar
                      key={field} label={label} count={count}
                      max={maxInd} color={color}
                      sub={`${count} / ${total} cases`}
                      sparse={isSparse(count)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </Panel>

        {/* Cross-tabulations — only show when dataset is large enough */}
        {total >= MIN_DIST_CASES ? (
          <Panel>
            <SectionHeading>Key cross-tabulations</SectionHeading>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 8px' }}>
              Cases where both coded indicators co-occur. Denominator: all {total} imported cases.
              Analyst-coded values only. These are observed co-occurrences, not confirmed causal links.
            </p>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', padding: '5px 10px', background: 'var(--surface-2)', borderRadius: 5, border: '1px solid var(--border)', marginBottom: 12, lineHeight: 1.5 }}>
              "Not coded" means one or both fields do not yet have enough analyst-coded coverage for this comparison.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { label: 'Refusal present + coercion present', value: enc.cross_tabs.refusal_then_coercion, color: '#ef4444' },
                { label: 'Pressure after refusal + physical force', value: enc.cross_tabs.pressure_then_force, color: '#ef4444' },
                { label: 'Movement / relocation + harm indicator co-present', value: enc.cross_tabs.movement_with_harm, color: '#6366f1' },
                { label: 'Substance administration + blackout / memory gap', value: enc.cross_tabs.substance_with_blackout, color: '#8b5cf6' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 0', borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.35 }}>
                    {label}
                    {isSparse(value) && <SparseBadge />}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: value > 0 ? color : 'var(--text-3)', marginLeft: 16, flexShrink: 0 }}>
                    {value > 0 ? fmtCountPct(value, total) : '— not coded'}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <Panel>
            <SectionHeading>Key cross-tabulations</SectionHeading>
            <SparsePlaceholder field="harm indicators (coercion, movement, substance)" />
          </Panel>
        )}

      </div>
    );
  };

  // ── Sequences tab ─────────────────────────────────────────────────────────

  const SequencesTab = () => {
    const maxSeq  = sequences.most_common_sequences[0]?.count ?? 1;
    const maxStg  = sequences.stage_frequency[0]?.count ?? 1;

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Preliminary / field-derived notice */}
        <div style={{ gridColumn: '1 / -1', padding: '10px 14px', borderRadius: 6,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          fontSize: 12, lineHeight: 1.55, color: 'var(--text-2)' }}>
          <strong>Preliminary sequence patterns.</strong> These patterns are generated from imported incident-level indicator
          fields and are provided as descriptive summaries only. They are separate from analyst-coded VIRGO stage sequences.
          For staged sequence analysis, see <strong>Stage Patterns</strong>.
        </div>

        {/* Visual sequence flow diagram */}
        <Panel style={{ gridColumn: '1 / -1' }}>
          <SectionHeading>Field-derived encounter sequence flow — top 5</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Connected sequence patterns generated from imported incident-level indicator fields across{' '}
            <strong style={{ color: 'var(--text-2)' }}>{total}</strong> cases.
            These are descriptive pattern summaries, not analyst-coded stage reconstructions.
          </p>
          <SequenceFlowDiagram sequences={sequences.most_common_sequences} total={total} />
        </Panel>

        {/* Escalation pathway visual */}
        <Panel style={{ gridColumn: '1 / -1' }}>
          <SectionHeading>Field-derived indicator transitions</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Consecutive indicator pairs — which field-derived indicators are observed to co-occur in sequence.
            Generated from imported incident-level indicator fields, not from analyst-coded stage records.
          </p>
          <EscalationPathwayDiagram bigrams={sequences.most_common_bigrams} stageFreq={sequences.stage_frequency} />
        </Panel>

        {/* Most common full sequences — text list */}
        <Panel>
          <SectionHeading>Imported indicator sequences (text)</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Field-derived indicator sequences ranked by frequency. These are generated from imported
            incident-level fields, not analyst-coded stage records. Sequences appearing in only one case
            are not recurring patterns.
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
                sub={row.count === 1 ? 'single coded sequence' : `${row.count} cases`}
                sparse={row.count === 1}
              />
            ))
          )}
        </Panel>

        {/* Indicator frequency */}
        <Panel>
          <SectionHeading>Indicator occurrence frequency</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            How often each field-derived indicator appears across all cases. These are imported indicator labels, not current VIRGO stage types.
          </p>
          {sequences.stage_frequency.slice(0, 15).map((row: StageRow, i: number) => (
            <FreqBar key={i} label={row.stage} count={row.count} max={maxStg}
              sub={total > 0 ? fmtPct(row.count, total) : undefined}
              color='#10b981'
            />
          ))}
        </Panel>

        {/* Escalation pathways — require count ≥ 2 to be shown as recurring */}
        <Panel style={{ gridColumn: '1 / -1' }}>
          <SectionHeading>Observed escalation pathways</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Sequences of harm-related stages only (coercion, threats, intimidation, physical force,
            sexual assault, robbery). Shown only when a pathway appears in 2 or more cases.
            Single-case observations are excluded — they are not repeating coded pathways.
          </p>
          {(() => {
            const recurringPathways = sequences.escalation_pathways.filter(r => r.count >= 2);
            if (recurringPathways.length === 0) return (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                No recurring escalation pathways yet (minimum 2 cases required). Code additional
                stage sequences to identify recurring harm-escalation chains.
              </div>
            );
            return recurringPathways.map((row: PathwayRow, i: number) => (
              <FreqBar key={i} label={row.pathway} count={row.count}
                max={recurringPathways[0].count} color='#ef4444'
                sub={`${row.count} cases — ${fmtPct(row.count, total)} of all cases`}
                sparse={isSparse(row.count)} />
            ));
          })()}
        </Panel>

        {/* Initial Contact Stage Detail — sub-section within RQ1 */}
        <Panel>
          <SectionHeading>Initial Contact Stage Detail</SectionHeading>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.65 }}>
            Breakdown of the initial contact stage where the report provides enough detail. These fields help describe how the encounter began but do not define a separate research question.
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.65, borderLeft: '3px solid var(--border)', paddingLeft: 10 }}>
            Initial contact is coded as one possible stage in the encounter sequence. These fields support RQ1 by describing the initial contact stage where it is visible, but they are not treated as a separate research question.
          </p>
          {data?.codability ? (() => {
            const cod = data.codability as any;
            const renderDist = (label: string, field: string, color: string) => {
              const vc = cod[field];
              if (!vc || !vc.total_coded) return null;
              const entries = Object.entries(vc.counts as Record<string, number>).sort((a, b) => b[1] - a[1]);
              const tot = vc.total_coded as number;
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                  {entries.map(([val, count]) => {
                    const pct = tot ? Math.round((count as number) / tot * 100) : 0;
                    return (
                      <div key={val} style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
                          <span style={{ color: 'var(--text-2)' }}>{formatLabel(val)}</span>
                          <span style={{ color: 'var(--text-3)' }}>{count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 10, background: 'var(--surface-3)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 10, background: color, width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>n = {tot} coded</div>
                </div>
              );
            };
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
                <div>
                  {renderDist('Approach method', 'approach_method', '#4A90D9')}
                  {renderDist('Approach setting', 'approach_setting', '#F59E0B')}
                  {renderDist('Mobility context at contact', 'approach_mobility_context', '#8B5CF6')}
                </div>
                <div>
                  {renderDist('Visibility at contact', 'initial_contact_visibility', '#4A90D9')}
                  {renderDist('Guardianship at contact', 'initial_contact_guardianship', '#22C55E')}
                  {renderDist('Client known at contact', 'client_known_at_contact', '#94A3B8')}
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coding Guidance</div>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.65, marginBottom: 10 }}>
                    Approach fields provide additional detail for the Initial Contact stage. They support stage reconstruction by recording how contact began when the narrative provides this information. They should not be interpreted as evidence of offender motive.
                  </p>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.65 }}>
                    Code what the narrative describes. Do not infer approach method if the report does not describe how first contact was made. Use <em>unknown_unclear</em> where the narrative is ambiguous.
                  </p>
                </div>
              </div>
            );
          })() : (
            <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
              Initial Contact stage detail will appear once approach fields are coded on individual cases.
            </p>
          )}
        </Panel>

      </div>
    );
  };

  // ── Mobility tab ──────────────────────────────────────────────────────────

  const MobilityTab = () => {
    const counts  = mobility.counts;
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

        {/* Movement risk card */}
        <Panel style={{ gridColumn: '1 / -1' }}>
          <SectionHeading>Movement and risk condition changes</SectionHeading>
          <MovementRiskCard counts={mobility.counts} total={total} />
        </Panel>

        {/* Indicators overview */}
        <Panel style={{ gridColumn: '1 / -1' }}>
          <SectionHeading>
            Mobility indicators —{' '}
            {mobility.counts.movement_present < SPARSE_MIN
              ? 'coded signals (preliminary)'
              : 'dataset overview'}
          </SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            {mobility.counts.movement_present < SPARSE_MIN ? (
              <>
                Fewer than {SPARSE_MIN} cases have movement coded.
                These are <strong style={{ color: 'var(--text-2)' }}>preliminary coded signals</strong>,
                not mobility patterns. Code additional cases to identify recurring patterns.
              </>
            ) : (
              <>
                Frequency of coded mobility fields across{' '}
                <strong style={{ color: 'var(--text-2)' }}>{mobility.total}</strong> cases.
              </>
            )}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            {indicators.map(([label, count, color], i) => (
              <FreqBar
                key={i} label={label} count={count} max={maxInd}
                sub={`${count} / ${total} cases`}
                color={color}
                sparse={isSparse(count)}
              />
            ))}
          </div>
        </Panel>

        {/* Recurring pathway combinations */}
        <Panel>
          <SectionHeading>Co-occurring mobility pathway features</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            Observed co-occurrence of mobility features — e.g. "vehicle pickup + offender-controlled". Appearing in 2+ cases only.
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
    const maxLoc      = environment.location_types[0]?.count ?? 1;
    const maxSpec     = (environment.specific_locations ?? [])[0]?.count ?? 1;
    const maxCombined = environment.combined_patterns[0]?.count ?? 1;
    const envTotal    = environment.total;
    const locMentions = environment.location_mentions_total ?? 0;

    const distRows: [string, Record<string, number>, string, string][] = [
      ['Indoor / Outdoor', environment.indoor_outdoor, '#0ea5e9',
        'Not enough analyst-coded data yet to display this output. Code the Indoor / Outdoor field in the Encounter tab to populate this section.'],
      ['Public / Private', environment.public_private, '#8b5cf6',
        'Not enough analyst-coded data yet to display this output. Code the Public / Private field in the Encounter tab to populate this section.'],
      ['Deserted context', environment.deserted, '#f59e0b',
        'Not enough analyst-coded data yet to display this output. Code the Deserted Context field in the Encounter tab to populate this section.'],
    ];

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Basic distributions */}
        {distRows.map(([label, distObj, color, emptyMsg]) => {
          const entries = Object.entries(distObj).sort((a, b) => b[1] - a[1]);
          const maxDist = Math.max(...entries.map(([, c]) => c), 1);
          return (
            <Panel key={label}>
              <SectionHeading>{label}</SectionHeading>
              {envTotal > 0 && (
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 10px' }}>
                  Across <strong style={{ color: 'var(--text-2)' }}>{envTotal}</strong> cases.
                </p>
              )}
              {entries.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', padding: '7px 10px', background: 'var(--surface-2)', borderRadius: 5, border: '1px dashed var(--border)' }}>
                  {emptyMsg}
                </div>
              ) : (
                entries.map(([val, cnt]) => (
                  <FreqBar
                    key={val}
                    label={val.replace(/_/g, ' ')}
                    count={cnt}
                    max={maxDist}
                    sub={envTotal > 0 ? `${cnt} / ${envTotal} cases` : undefined}
                    color={color}
                    sparse={isSparse(cnt)}
                  />
                ))
              )}
            </Panel>
          );
        })}

        {/* Classified location types */}
        <Panel>
          <SectionHeading>Location types — classified</SectionHeading>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 5, border: '1px solid var(--border)', marginBottom: 10, lineHeight: 1.5 }}>
            Location types are derived from coded/extracted location fields. Environmental condition outputs (indoor/outdoor, public/private, deserted context) require separate analyst coding in the Encounter tab.
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.5 }}>
            {locMentions > 0 ? (
              <>
                Counts are <strong>location field mentions</strong>, not cases —
                a single case can contribute up to 3 mentions (initial contact, primary,
                and secondary location). Total mentions:{' '}
                <strong style={{ color: 'var(--text-2)' }}>{locMentions}</strong>{' '}
                across <strong style={{ color: 'var(--text-2)' }}>{envTotal}</strong> cases.
              </>
            ) : (
              <>Derived from initial contact, primary, and secondary location fields.</>
            )}{' '}
            Narrative fragments excluded.
          </p>
          {environment.location_types.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
              No location data yet. Complete the initial contact location or incident location
              fields in the Encounter tab to populate this section.
            </div>
          ) : (
            environment.location_types.map((row, i) => (
              <FreqBar key={i} label={row.type} count={row.count} max={maxLoc}
                sub={locMentions > 0 ? `${fmtPct(row.count, locMentions)} of mentions` : undefined}
                color='#10b981' />
            ))
          )}
        </Panel>

        {/* Specific named locations */}
        {(environment.specific_locations ?? []).length > 0 && (
          <Panel>
            <SectionHeading>Repeated specific locations</SectionHeading>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.5 }}>
              Named intersections, neighbourhoods, or municipalities appearing in 2+ cases.
              Potential linkage only — not confirmed connections between cases.
            </p>
            {(environment.specific_locations ?? []).map((row, i) => (
              <FreqBar key={i} label={row.location} count={row.count} max={maxSpec}
                sub={fmtCountPct(row.count, envTotal)} color='#f59e0b' />
            ))}
          </Panel>
        )}

        {/* Violence × environment cross-tabs */}
        <Panel style={{ gridColumn: '1 / -1' }}>
          <SectionHeading>Observed harm and movement by environment</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Observed co-occurrence of harm indicators across environmental conditions.
            Analyst-coded values only. Does not establish causation or environmental linkage.
          </p>

          {Object.keys(environment.violence_by_environment).length > 0 && (
            <>
              <SubHeading>By indoor / outdoor</SubHeading>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                {Object.entries(environment.violence_by_environment).map(([val, cross]) => (
                  <CrossTabCard key={val} label={val} data={cross} total={envTotal} />
                ))}
              </div>
            </>
          )}

          {Object.keys(environment.movement_by_setting).length > 0 && (
            <>
              <SubHeading>By public / private setting</SubHeading>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                {Object.entries(environment.movement_by_setting).map(([val, cross]) => (
                  <CrossTabCard key={val} label={val} data={cross} total={envTotal} />
                ))}
              </div>
            </>
          )}

          {Object.keys(environment.deserted_analysis).length > 0 && (
            <>
              <SubHeading>By deserted context</SubHeading>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.entries(environment.deserted_analysis).map(([val, cross]) => (
                  <CrossTabCard key={val} label={val.replace(/_/g, ' ')} data={cross} total={envTotal} />
                ))}
              </div>
            </>
          )}

          {Object.keys(environment.violence_by_environment).length === 0
            && Object.keys(environment.movement_by_setting).length === 0
            && Object.keys(environment.deserted_analysis).length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
              No cross-tabulation data yet. Code indoor / outdoor, public / private, and harm fields
              in the Encounter tab to populate these comparisons.
            </div>
          )}
        </Panel>

        {/* Combined patterns */}
        {environment.combined_patterns.length > 0 && (
          <Panel style={{ gridColumn: '1 / -1' }}>
            <SectionHeading>Combined environment + movement + harm patterns</SectionHeading>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Observed co-occurrence of environmental setting, movement, and harm indicators.
              Across <strong style={{ color: 'var(--text-2)' }}>{envTotal}</strong> cases with coded environmental fields.
              Analyst-coded values only.
            </p>
            {environment.combined_patterns.map((row: PatternRow, i: number) => (
              <FreqBar key={i} label={row.pattern} count={row.count} max={maxCombined}
                sub={fmtPct(row.count, envTotal)} color='#ef4444' />
            ))}
          </Panel>
        )}

      </div>
    );
  };

  // ── VAWG / Exploitation tab ───────────────────────────────────────────────

  const VawgTab = () => {
    const vawg: AggregateVawg | undefined = data.vawg;
    if (!vawg) {
      return (
        <Panel>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            VAWG / Exploitation data not yet available. Restart the backend to load.
          </div>
        </Panel>
      );
    }

    const fc = vawg.flag_counts;

    const FLAG_LABELS: [keyof typeof fc, string, string][] = [
      ['trafficking_exploitation_concern',    'Trafficking / exploitation concern',       '#ef4444'],
      ['third_party_control_indicated',       'Third-party control indicated',            '#ef4444'],
      ['worker_appears_controlled',           'Worker appears controlled',                '#f59e0b'],
      ['client_connected_to_controller',      'Client connected to controller',           '#f59e0b'],
      ['movement_to_unknown_unsafe_location', 'Movement to unknown / unsafe location',    '#6366f1'],
      ['worker_unaware_how_arrived',          'Worker unaware how they arrived',          '#8b5cf6'],
      ['grooming_recruitment_concern',        'Grooming / recruitment concern',           '#f59e0b'],
      ['repeat_targeting_concern',            'Repeat targeting concern',                 '#f59e0b'],
      ['multiple_women_referenced',           'Multiple women / victims referenced',      '#ef4444'],
      ['organized_group_offending_concern',   'Organized / group offending concern',      '#ef4444'],
      ['public_safety_bulletin_suitability_positive', 'Bulletin suitability — positive', '#dc2626'],
      ['public_safety_urgency_urgent_high',           'Urgency: urgent or high',          '#dc2626'],
    ];

    const maxFlag = Math.max(1, ...FLAG_LABELS.map(([k]) => fc[k] ?? 0));

    const CROSS_LABELS: [keyof typeof vawg.cross_tabs, string][] = [
      ['trafficking_with_movement',            'Trafficking / exploitation concern + movement / relocation'],
      ['trafficking_with_substance',           'Trafficking / exploitation concern + substance administration'],
      ['trafficking_with_blackout',            'Trafficking / exploitation concern + blackout / memory gap'],
      ['third_party_with_unknown_location',    'Third-party control indicated + unknown / unsafe location'],
      ['group_offending_with_sexual_violence', 'Organized / group offending concern + sexual violence'],
      ['bulletin_suitable_with_repeat_target', 'Bulletin suitable + repeat targeting concern'],
    ];

    // Cases requiring review — highlight key counts
    const reviewItems: [string, number, string][] = [
      ['Trafficking / exploitation concern', fc.trafficking_exploitation_concern ?? 0, '#ef4444'],
      ['Third-party control indicated',      fc.third_party_control_indicated ?? 0,    '#ef4444'],
      ['Grooming / recruitment concern',     fc.grooming_recruitment_concern ?? 0,     '#f59e0b'],
      ['Organized / group offending concern',fc.organized_group_offending_concern ?? 0,'#ef4444'],
      ['Urgent or high public safety urgency',fc.public_safety_urgency_urgent_high ?? 0,'#dc2626'],
      ['Bulletin suitable',                  fc.public_safety_bulletin_suitability_positive ?? 0,'#dc2626'],
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Cases requiring review — top summary */}
        <Panel>
          <SectionHeading>Cases requiring review</SectionHeading>
          <ProvenanceNote />
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.5 }}>
            Cases coded with concern flags, possible indicators, or public safety considerations.
            These are analyst-coded observations — not confirmed findings. Across{' '}
            <strong style={{ color: 'var(--text-2)' }}>{vawg.total}</strong> cases.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {reviewItems.map(([label, count, color]) => (
              <div key={label} style={{
                padding: '10px 14px', border: `1px solid ${count > 0 ? color + '44' : 'var(--border)'}`,
                borderRadius: 8, background: count > 0 ? color + '08' : 'var(--surface)',
              }}>
                {count === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', marginBottom: 3 }}>not coded</div>
                ) : (
                  <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 3, fontFamily: 'Lora, serif' }}>
                    {count}
                    {isSparse(count) && <SparseBadge />}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: count > 0 ? 'var(--text-2)' : 'var(--text-3)', lineHeight: 1.35 }}>{label}</div>
                {count > 0 && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{fmtPct(count, vawg.total)} of cases</div>}
              </div>
            ))}
          </div>
        </Panel>

        {/* Flagged for review — moved up */}
        <Panel>
          <SectionHeading>Flagged cases — requires review</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.5 }}>
            Cases flagged for trafficking / exploitation concern, third-party control, bulletin suitability, or urgent / high urgency.
            Sorted by urgency level. Click a report ID to open it in the coding workstation.
            These are analyst-coded concern indicators only — not confirmed findings.
          </p>
          {vawg.flagged_for_review.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
              No cases flagged yet. Code VAWG / Exploitation fields in the Encounter tab to populate this list.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Report ID', 'Date', 'City', 'Incident type', 'Severity', 'Urgency', 'Bulletin', 'Concern flags'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...vawg.flagged_for_review]
                    .sort((a, b) => {
                      const urgScore = (s: string) => s.includes('urgent') ? 3 : s.includes('high') ? 2 : s.includes('moderate') ? 1 : 0;
                      return urgScore(b.public_safety_urgency_level || '') - urgScore(a.public_safety_urgency_level || '');
                    })
                    .map((row, i) => {
                      const urgColor = (row.public_safety_urgency_level || '').includes('urgent') ? '#dc2626'
                        : (row.public_safety_urgency_level || '').includes('high') ? '#f59e0b' : 'var(--text-2)';
                      const bulletinOk = SUITABILITY_RE.test(row.public_safety_bulletin_suitability || '');
                      return (
                        <tr
                          key={row.report_id}
                          style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)', cursor: 'pointer' }}
                          onClick={() => navigate(`/code/${row.report_id}`)}
                          title="Open in coding workstation"
                        >
                          <td style={{ padding: '7px 10px', fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{row.report_id}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{row.incident_date || '—'}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{row.city || '—'}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text-2)', maxWidth: 130, lineHeight: 1.3 }}>{row.primary_incident_type || <em style={{ color: 'var(--text-3)' }}>—</em>}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: severityColor(row.overall_severity || ''), whiteSpace: 'nowrap' }}>{row.overall_severity || '—'}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11, fontWeight: 600, color: urgColor, whiteSpace: 'nowrap' }}>{row.public_safety_urgency_level || '—'}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: bulletinOk ? '#10b981' : 'var(--text-3)', whiteSpace: 'nowrap' }}>{row.public_safety_bulletin_suitability || '—'}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4, maxWidth: 200 }}>{(row.reasons || []).join(', ')}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Distributions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <Panel>
            <SectionHeading>VAWG / Exploitation flag counts</SectionHeading>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
              Cases coded yes, probable, or inferred for each indicator.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <div>
                {FLAG_LABELS.slice(0, 6).map(([key, label, color]) => {
                  const count = fc[key] ?? 0;
                  return (
                    <FreqBar key={key} label={label} count={count} max={maxFlag} color={color}
                      sub={count === 0 ? 'not coded' : `${count} / ${vawg.total} cases`}
                      sparse={isSparse(count)} />
                  );
                })}
              </div>
              <div>
                {FLAG_LABELS.slice(6).map(([key, label, color]) => {
                  const count = fc[key] ?? 0;
                  return (
                    <FreqBar key={key} label={label} count={count} max={maxFlag} color={color}
                      sub={count === 0 ? 'not coded' : `${count} / ${vawg.total} cases`}
                      sparse={isSparse(count)} />
                  );
                })}
              </div>
            </div>
          </Panel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Panel>
              <SectionHeading>Public safety urgency distribution</SectionHeading>
              {vawg.urgency_distribution.length === 0
                ? <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No urgency levels coded yet.</div>
                : vawg.urgency_distribution.map((row, i) => {
                  const color = row.value.includes('urgent') ? '#dc2626' : row.value.includes('high') ? '#f59e0b' : 'var(--text-3)';
                  return <FreqBar key={i} label={row.value} count={row.count}
                    max={vawg.urgency_distribution[0]?.count ?? 1} color={color}
                    sub={fmtPct(row.count, vawg.total)} />;
                })}
            </Panel>
            <Panel>
              <SectionHeading>Bulletin suitability distribution</SectionHeading>
              {vawg.bulletin_suitability_distribution.length === 0
                ? <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No bulletin suitability coded yet.</div>
                : vawg.bulletin_suitability_distribution.map((row, i) => (
                  <FreqBar key={i} label={row.value} count={row.count}
                    max={vawg.bulletin_suitability_distribution[0]?.count ?? 1} color='#6366f1'
                    sub={fmtPct(row.count, vawg.total)} />
                ))}
            </Panel>
          </div>
        </div>

        {/* Cross-tabulations */}
        <Panel>
          <SectionHeading>VAWG / Exploitation cross-tabulations</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.5 }}>
            Cases where both coded indicators are observed in the same case. Analyst-coded values only.
            These are observed co-occurrences — not confirmed causal links or established patterns.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {CROSS_LABELS.map(([key, label]) => {
              const count = vawg.cross_tabs[key] ?? 0;
              return (
                <div key={key} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 0', borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1, lineHeight: 1.35 }}>
                    {label}
                    {isSparse(count) && <SparseBadge />}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: count > 0 ? '#ef4444' : 'var(--text-3)', marginLeft: 16, flexShrink: 0 }}>
                    {count === 0 ? '— not coded' : fmtCountPct(count, vawg.total)}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Co-occurrence heatmap */}
        <Panel>
          <SectionHeading>Co-occurrence heatmap</SectionHeading>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            How often harm, control, movement, and VAWG / Exploitation indicators appear together in the same case.
            Analyst-coded values only. Hover over a cell to see the indicator pair, count, and percentage of coded cases.
          </p>
          <CooccurrenceHeatmap fields={vawg.cooccurrence.fields} matrix={vawg.cooccurrence.matrix} total={vawg.total} />
        </Panel>

      </div>
    );
  };

  // ── Case list tab ─────────────────────────────────────────────────────────

  // ── Filtered Case Groups tab ─────────────────────────────────────────────

  type FgPreset = { id: string; label: string; desc: string; filter: (r: import('../types').Report) => boolean };

  const notBlank = (v: unknown) => typeof v === 'string' && v.trim() !== '' && v.trim() !== 'not_reviewed' && v.trim() !== 'uncoded';

  const FG_PRESETS: FgPreset[] = [
    { id: 'coded',            label: 'All analyst-coded',          desc: 'Reports that have been analyst-reviewed and coded.',
      filter: r => ['coded','reviewed'].includes((r.coding_status || '').trim()) },
    { id: 'high_detail',      label: 'High narrative detail',      desc: 'Reports coded as high narrative detail — best candidates for deep sequence analysis.',
      filter: r => (r.narrative_detail_level || '').trim() === 'high' },
    { id: 'seq_recon',        label: 'Sequence reconstructable',   desc: 'Reports where the encounter sequence is marked reconstructable.',
      filter: r => ['yes','partial'].includes((r.sequence_reconstructable || '').trim()) },
    { id: 'stage_suitable',   label: 'Stage-coding suitable',      desc: 'Reports suitable for stage-level coding.',
      filter: r => (r.stage_coding_suitability || '').toLowerCase().startsWith('yes') || (r.stage_coding_suitability || '').toLowerCase().startsWith('partial') },
    { id: 'with_movement',    label: 'Movement present',           desc: 'Reports where movement / relocation is coded.',
      filter: r => ['yes','probable','inferred'].includes((r.movement_present || '').trim()) || (r.movement_visible || '').trim() === 'yes' },
    { id: 'mappable',         label: 'Mappable',                   desc: 'Reports coded as spatially mappable.',
      filter: r => (r.mappable_status || '').trim() === 'mappable' || (r.location_coding_suitability || '').trim() === 'mappable' },
    { id: 'has_sequence_pattern', label: 'Has sequence pattern',   desc: 'Reports where the analyst has written a coded sequence pattern.',
      filter: r => notBlank(r.sequence_pattern) },
    { id: 'street_approach',  label: 'Street approach',            desc: 'Reports where initial contact was a street-based approach.',
      filter: r => { const v = (r.approach_method || '').toLowerCase(); return v.includes('street') || v.includes('walk') || v.includes('in person') || v === 'street_approach'; } },
    { id: 'online_approach',  label: 'Online / digital approach',  desc: 'Reports where initial contact was online or digital.',
      filter: r => { const v = (r.approach_method || '').toLowerCase(); return v.includes('online') || v.includes('digital') || v.includes('app') || v.includes('website') || v === 'online_digital'; } },
    { id: 'vehicle_approach', label: 'Vehicle-based approach',     desc: 'Reports where initial contact was vehicle-based.',
      filter: r => { const v = (r.approach_method || '').toLowerCase(); return v.includes('vehicle') || v === 'vehicle_based'; } },
    { id: 'known_client',     label: 'Known / repeat client',      desc: 'Reports where the client was known or identified as a repeat client at contact.',
      filter: r => { const v = (r.client_known_at_contact || '').toLowerCase(); return v.includes('known') || v.includes('repeat') || v === 'yes_known'; } },
    { id: 'third_party',      label: 'Third-party arranged',       desc: 'Reports where contact was arranged through a third party.',
      filter: r => { const v = (r.approach_method || '').toLowerCase(); return v.includes('third') || v === 'third_party_arranged'; } },
    { id: 'ic_low_visibility', label: 'Low visibility at contact', desc: 'Reports where initial contact occurred in low-visibility conditions.',
      filter: r => { const v = (r.initial_contact_visibility || '').toLowerCase(); return v.includes('limited') || v.includes('not_visible') || v.includes('private') || v === 'not_visible'; } },
    { id: 'ic_no_guardianship', label: 'No guardianship at contact', desc: 'Reports where no capable guardianship was present at initial contact.',
      filter: r => (r.initial_contact_guardianship || '').trim() === 'absent' },
  ];

  const loadFgReports = (preset: FgPreset) => {
    setFgLoading(true);
    const source = fgAllReports.length > 0
      ? Promise.resolve(fgAllReports)
      : api.listReports({}).then(rs => { setFgAllReports(rs); return rs; });
    source
      .then(all => { setFgReports(all.filter(preset.filter)); setFgLoading(false); })
      .catch(() => setFgLoading(false));
  };


  const FilteredGroupsTab = () => {
    const preset = FG_PRESETS.find(p => p.id === fgPreset);
    return (
      <Panel>
        <SectionHeading>Filtered Case Groups</SectionHeading>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.55 }}>
          Select a preset group to load matching cases. Each row shows codability-relevant fields for fast cross-case review.
          Click a case ID to open the coding workspace for that case.
        </p>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', padding: '7px 11px', background: 'var(--surface-2)', borderRadius: 5, border: '1px solid var(--border)', marginBottom: 14, lineHeight: 1.5 }}>
          Filtered groups include analyst-coded matches only. Blank or unreviewed fields are excluded from preset results.
          Outputs reflect analyst-coded fields only.
        </div>

        {/* Preset buttons */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
          {FG_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => { setFgPreset(p.id); loadFgReports(p); }}
              style={{
                padding: '6px 13px', fontSize: 12, border: `1px solid ${fgPreset === p.id ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 5, background: fgPreset === p.id ? 'var(--accent)' : 'var(--surface)',
                color: fgPreset === p.id ? '#fff' : 'var(--text-2)', cursor: 'pointer', fontWeight: fgPreset === p.id ? 600 : 400,
                transition: 'all 0.12s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset && (
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', padding: '7px 11px', background: 'var(--surface-2)', borderRadius: 5, border: '1px solid var(--border)', marginBottom: 14, lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-2)', fontWeight: 600 }}>{preset.label}:</strong> {preset.desc}
          </div>
        )}

        {!fgPreset && (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic', padding: '28px 0', textAlign: 'center' }}>
            Select a case group above to load reports.
          </div>
        )}

        {fgLoading && (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '20px 0', textAlign: 'center' }}>
            Loading…
          </div>
        )}

        {!fgLoading && fgPreset && fgReports.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
            No analyst-coded cases match this filter yet.
          </div>
        )}

        {!fgLoading && fgReports.length > 0 && (
          <>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
              {fgReports.length} analyst-coded case{fgReports.length !== 1 ? 's' : ''} match this filter
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {[
                      'Case ID', 'Approach method', 'Contact setting',
                      'Sequence pattern', 'Movement pattern', 'Primary harm',
                      'Stage suitability', 'Mappable', 'Key excerpt',
                    ].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fgReports.map(r => {
                    const hasExcerpt = !!(r.stage_excerpt || r.behaviour_excerpt || r.environment_excerpt || r.movement_excerpt || r.key_supporting_excerpts || r.initial_contact_excerpt);
                    return (
                      <tr
                        key={r.id}
                        style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s', cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                        onClick={() => window.location.href = `/case/${r.report_id}`}
                      >
                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{r.report_id}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <CellChip value={r.approach_method} goodValues={[]} warnValues={[]} neutral />
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <CellChip value={r.approach_setting} goodValues={[]} warnValues={[]} neutral />
                        </td>
                        <td style={{ padding: '7px 10px', maxWidth: 200 }}>
                          {r.sequence_pattern ? (
                            <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {r.sequence_pattern}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <CellChip value={r.movement_pattern_type} goodValues={[]} warnValues={[]} neutral />
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: 11.5, color: 'var(--text-2)' }}>
                          {r.primary_harm || r.primary_incident_type || '—'}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <CellChip value={r.stage_coding_suitability} goodValues={['yes']} warnValues={['partial']} />
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <CellChip value={r.mappable_status} goodValues={['mappable']} warnValues={['partial']} />
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          {hasExcerpt
                            ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#22C55E', background: '#22C55E14', padding: '2px 6px', borderRadius: 3, border: '1px solid #22C55E30' }}>Yes</span>
                            : <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontStyle: 'italic' }}>—</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    );
  };

  const CaseListTab = () => {
    const sortField = caseSort;
    const setSortField = setCaseSort;
    const sortAsc = caseSortAsc;
    const setSortAsc = setCaseSortAsc;
    const filterSeverity   = caseFilterSeverity;
    const setFilterSeverity = setCaseFilterSeverity;
    const filterMovement   = caseFilterMovement;
    const setFilterMovement = setCaseFilterMovement;
    const filterHarm       = caseFilterHarm;
    const setFilterHarm    = setCaseFilterHarm;
    const filterEsc        = caseFilterEsc;
    const setFilterEsc     = setCaseFilterEsc;
    const filterStages     = caseFilterStages;
    const setFilterStages  = setCaseFilterStages;

    const cases = sequences.per_case;

    const sevOrder = (s: string) => {
      const l = s.toLowerCase();
      if (l.includes('severe') || l.includes('high risk')) return 4;
      if (l.includes('high concern')) return 3;
      if (l.includes('moderate')) return 2;
      if (l.includes('low')) return 1;
      return 0;
    };

    const filtered = cases.filter(row => {
      if (filterSeverity && !(row.overall_severity || '').toLowerCase().includes(filterSeverity.toLowerCase())) return false;
      if (filterMovement === 'yes' && !(row.movement_relocation_present || '').toLowerCase().startsWith('y')) return false;
      if (filterHarm === 'yes' && !row.main_harms) return false;
      if (filterEsc === 'yes' && row.escalation_cue !== 'yes') return false;
      if (filterStages === '1+' && (row.stage_count || 0) < 1) return false;
      if (filterStages === '2+' && (row.stage_count || 0) < 2) return false;
      if (filterStages === '1' && (row.stage_count || 0) !== 1) return false;
      if (filterStages === '0' && (row.stage_count || 0) !== 0) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'severity') cmp = sevOrder(a.overall_severity || '') - sevOrder(b.overall_severity || '');
      else if (sortField === 'report_id') cmp = a.report_id.localeCompare(b.report_id);
      else if (sortField === 'stages') cmp = (a.stage_count || 0) - (b.stage_count || 0);
      return sortAsc ? cmp : -cmp;
    });

    const toggleSort = (f: string) => {
      if (sortField === f) setSortAsc((a: boolean) => !a);
      else { setSortField(f); setSortAsc(false); }
    };
    const SortTh = ({ field, label }: { field: string; label: string }) => (
      <th
        onClick={() => toggleSort(field)}
        style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: sortField === field ? 'var(--accent)' : 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
      >
        {label}{sortField === field ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </th>
    );

    return (
      <Panel>
        <SectionHeading>Case Sequence Table</SectionHeading>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
          Encounter-level overview for all imported cases. Click a report ID to open it.
          The Stages column shows field-derived indicator counts. Default sort: severity (high → low). Click column headers to re-sort.
        </p>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
          {([
            ['Severity', filterSeverity, setFilterSeverity, [
              ['', 'All'],
              ['severe', 'Severe / high risk'],
              ['high concern', 'High concern'],
              ['moderate', 'Moderate'],
              ['low', 'Low concern'],
            ]],
            ['Stages', filterStages, setFilterStages, [
              ['', 'All cases'],
              ['1+', '1+ field indicators'],
              ['2+', '2+ field indicators'],
              ['1', '1 indicator only'],
              ['0', 'No indicators'],
            ]],
            ['Movement', filterMovement, setFilterMovement, [
              ['', 'All'],
              ['yes', 'Movement present'],
            ]],
            ['Harm coded', filterHarm, setFilterHarm, [
              ['', 'All'],
              ['yes', 'Harm indicators present'],
            ]],
            ['Escalation cue', filterEsc, setFilterEsc, [
              ['', 'All'],
              ['yes', 'Escalation cue coded'],
            ]],
          ] as [string, string, (v: string) => void, [string, string][]][]).map(([label, val, setter, opts]) => (
            <div key={label}>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
              <select value={val} onChange={e => setter(e.target.value)}
                style={{ padding: '5px 8px', fontSize: 12, border: `1px solid ${val ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 4, background: 'var(--bg)', color: val ? 'var(--accent)' : 'var(--text-1)', fontWeight: val ? 600 : 400 }}>
                {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
          {(filterSeverity || filterMovement || filterHarm || filterEsc || filterStages !== '1+') && (
            <button
              onClick={() => { setFilterSeverity(''); setFilterMovement(''); setFilterHarm(''); setFilterEsc(''); setFilterStages('1+'); }}
              style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text-3)', cursor: 'pointer', alignSelf: 'flex-end' }}>
              Reset filters
            </button>
          )}
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', alignSelf: 'flex-end', paddingBottom: 6 }}>
            {filtered.length} of {cases.length} cases
          </span>
        </div>

        {cases.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
            No coded cases yet. Code cases to see per-case sequences.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <SortTh field="report_id" label="Report ID" />
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Incident type</th>
                  <SortTh field="severity" label="Severity" />
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Suitability</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Harms</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Esc. cue</th>
                  <SortTh field="stages" label="Stages" />
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Movement</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Encounter sequence</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const sevColor = severityColor(row.overall_severity || '').replace('var(--green)', 'var(--text-2)');
                  const isHigh = (row.overall_severity || '').toLowerCase().includes('severe')
                    || (row.overall_severity || '').toLowerCase().includes('high');
                  const movPresent = (row.movement_relocation_present || '').toLowerCase().startsWith('y');
                  return (
                    <tr
                      key={row.report_id}
                      style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)', cursor: 'pointer' }}
                      onClick={() => navigate(`/code/${row.report_id}`)}
                      title="Open in coding workstation"
                    >
                      <td style={{ padding: '7px 10px', fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{row.report_id}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-2)', fontSize: 11.5, maxWidth: 150, lineHeight: 1.3 }}>{row.primary_incident_type || <em style={{ color: 'var(--text-3)' }}>—</em>}</td>
                      <td style={{ padding: '7px 10px', fontSize: 11.5, color: sevColor, fontWeight: isHigh ? 600 : 400, whiteSpace: 'nowrap' }}>{row.overall_severity || <em style={{ color: 'var(--text-3)' }}>—</em>}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontSize: 11, maxWidth: 120, lineHeight: 1.3 }}>
                        {row.stage_coding_suitability ? row.stage_coding_suitability.replace(SUITABILITY_RE, (m: string) => m.charAt(0).toUpperCase() + m.slice(1) + ':') : <em>—</em>}
                      </td>
                      <td style={{ padding: '7px 10px', color: row.main_harms ? 'var(--text-2)' : 'var(--text-3)', fontSize: 11, maxWidth: 150, lineHeight: 1.3 }}>{row.main_harms || <em>—</em>}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        {row.escalation_cue === 'yes'
                          ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--amber-pale)', color: 'var(--amber)', border: '1px solid var(--amber-border)' }}>yes</span>
                          : <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-3)', textAlign: 'center' }}>{row.stage_count}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        {movPresent
                          ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#6366f122', color: '#6366f1', border: '1px solid #6366f144' }}>yes</span>
                          : <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-2)', lineHeight: 1.4, fontSize: 11.5 }}>{row.sequence || <em style={{ color: 'var(--text-3)' }}>— no sequence data</em>}</td>
                    </tr>
                  );
                })}
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

    const conditionStageKeys = Array.from(new Set([
      ...Object.keys(sd.visibility_by_stage),
      ...Object.keys(sd.guardianship_by_stage),
      ...Object.keys(sd.isolation_by_stage),
      ...Object.keys(sd.control_by_stage),
    ]));

    const RqChip = ({ label, color }: { label: string; color: string }) => (
      <span style={{
        display: 'inline-block', padding: '1px 7px', borderRadius: 3,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
        background: color + '22', color, border: `1px solid ${color}55`,
        marginLeft: 8, verticalAlign: 'middle',
      }}>{label}</span>
    );

    const BlockHeading = ({ children }: { children: React.ReactNode }) => (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
        color: 'var(--text-3)', marginBottom: 14, marginTop: 4,
      }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span>{children}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
    );

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

        {/* ── DESCRIPTIVE SUMMARIES ─────────────────────────────────────────── */}
        <BlockHeading>Descriptive summaries</BlockHeading>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Stage type frequency */}
          <Panel>
            <SectionHeading>Stage Type Frequency</SectionHeading>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
              Counts from Stage Coding records across all cases.
            </div>
            {sd.stage_type_frequency.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No stages coded yet.</div>
            ) : sd.stage_type_frequency.map(r => (
              <FreqBar key={r.value} label={formatLabel(r.value)} count={r.count} max={maxTypeCount} />
            ))}
          </Panel>

          {/* Client behaviours */}
          <Panel>
            <SectionHeading>Client Behaviour by Coded Stage</SectionHeading>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
              Counts from Stage Coding records across all cases.
            </div>
            {sd.behavior_frequency.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No behaviours coded yet.</div>
            ) : sd.behavior_frequency.map(r => (
              <FreqBar key={r.value} label={formatLabel(r.value)} count={r.count} max={maxBehCount} color="var(--red, #DC2626)" />
            ))}
          </Panel>

          {/* Worker responses */}
          <Panel>
            <SectionHeading>Worker Response Frequency</SectionHeading>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
              Counts from Stage Coding records across all cases.
            </div>
            {sd.response_frequency.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No responses coded yet.</div>
            ) : sd.response_frequency.map(r => (
              <FreqBar key={r.value} label={formatWorkerResponse(r.value)} count={r.count} max={maxRespCount} color="var(--green)" />
            ))}
          </Panel>

        </div>

        {/* ── ANALYTIC PATTERNS ────────────────────────────────────────────── */}
        <BlockHeading>Analytic patterns</BlockHeading>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Common encounter sequences */}
          <Panel>
            <SectionHeading>
              Common Encounter Sequences
              <RqChip label="RQ1" color="var(--accent, #4F8EF7)" />
            </SectionHeading>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
              Observed analyst-coded stage orderings across cases.
            </div>
            {sd.sequence_frequency.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No multi-stage cases yet.</div>
            ) : sd.sequence_frequency.slice(0, 8).map(r => (
              <FreqBar
                key={r.value}
                label={r.value.split(' → ').map(t => formatLabel(t.trim())).join(' → ')}
                count={r.count}
                max={maxSeqCount}
              />
            ))}
          </Panel>

          {/* Client behaviour by stage type */}
          <Panel>
            <SectionHeading>
              Client Behaviour by Stage Type
              <RqChip label="RQ1" color="var(--accent, #4F8EF7)" />
            </SectionHeading>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
              Top coded behaviours grouped by encounter stage.
            </div>
            {Object.keys(sd.behavior_by_stage).length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No stage behaviour data yet.</div>
            ) : Object.entries(sd.behavior_by_stage).map(([stageKey, rows]) => {
              const stageMax = Math.max(...rows.map(r => r.count), 1);
              return (
                <div key={stageKey} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                    {formatLabel(stageKey)}
                  </div>
                  {rows.slice(0, 5).map(r => (
                    <FreqBar key={r.value} label={formatLabel(r.value)} count={r.count} max={stageMax} color="var(--red, #DC2626)" />
                  ))}
                </div>
              );
            })}
          </Panel>

          {/* Worker response by stage type */}
          <Panel>
            <SectionHeading>
              Worker Response by Stage Type
              <RqChip label="RQ1" color="var(--accent, #4F8EF7)" />
            </SectionHeading>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
              Top coded worker responses grouped by encounter stage.
            </div>
            {Object.keys(sd.response_by_stage).length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No stage response data yet.</div>
            ) : Object.entries(sd.response_by_stage).map(([stageKey, rows]) => {
              const stageMax = Math.max(...rows.map(r => r.count), 1);
              return (
                <div key={stageKey} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                    {formatLabel(stageKey)}
                  </div>
                  {rows.slice(0, 5).map(r => (
                    <FreqBar key={r.value} label={formatWorkerResponse(r.value)} count={r.count} max={stageMax} color="var(--green)" />
                  ))}
                </div>
              );
            })}
          </Panel>

        </div>

        {/* Conditions by stage type */}
        <Panel>
          <SectionHeading>
            Situational Conditions by Stage Type
            <RqChip label="RQ2" color="var(--amber, #D97706)" />
          </SectionHeading>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 14 }}>
            Distribution of situational conditions at each coded stage type.
          </div>
          {conditionStageKeys.length === 0 ? (
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
                  {conditionStageKeys.map(stype => {
                    const vis  = sd.visibility_by_stage[stype]?.[0];
                    const grd  = sd.guardianship_by_stage[stype]?.[0];
                    const iso  = sd.isolation_by_stage[stype]?.[0];
                    const ctrl = sd.control_by_stage[stype]?.[0];
                    if (!vis && !grd && !iso && !ctrl) return null;
                    return (
                      <tr key={stype} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-1)', fontSize: 12.5 }}>
                          {formatLabel(stype)}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-2)', fontSize: 12.5 }}>
                          {vis ? `${formatLabel(vis.value)} (${vis.count})` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-2)', fontSize: 12.5 }}>
                          {grd ? `${formatLabel(grd.value)} (${grd.count})` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-2)', fontSize: 12.5 }}>
                          {iso ? `${formatLabel(iso.value)} (${iso.count})` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-2)', fontSize: 12.5 }}>
                          {ctrl ? `${formatLabel(ctrl.value)} (${ctrl.count})` : '—'}
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
        <span>
          All matches below are <strong style={{ color: 'var(--amber)', fontWeight: 600 }}>potential linkage prompts</strong> — not confirmed connections.
          Repeated descriptors are prompts for analyst review only. They do not establish that cases are connected.
          Review individual cases before drawing any conclusions.
        </span>
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
              No repeated descriptors found across cases yet. As more cases are coded, shared vehicle descriptions, locations, and behaviour indicators will appear here as potential linkage prompts for analyst review.
            </div>
          </Panel>
        ) : (
          <>
            <PotentialNote />
            <Panel>
              <SectionHeading>Repeated Vehicle Descriptors</SectionHeading>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
                Plates or make/colour combinations appearing in 2+ cases. These are potential linkage prompts only — not confirmed vehicle matches.
              </p>
              <LinkageTable items={repeated_vehicles} emptyMsg="No repeated vehicle descriptors found." />
            </Panel>
            <Panel>
              <SectionHeading>Repeated Locations</SectionHeading>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
                Initial contact or incident locations shared across 2+ cases. These are potential linkage prompts only — not confirmed connected incidents.
              </p>
              <LinkageTable items={repeated_locations} emptyMsg="No repeated locations found." />
            </Panel>
            <Panel>
              <SectionHeading>Behaviour Indicators — Shared Across Cases</SectionHeading>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
                Observed co-occurring harm/control indicators seen in 2+ cases. Potential linkage prompts only — requires analyst review.
              </p>
              <LinkageTable items={behavior_clusters} emptyMsg="No shared behaviour indicators found." />
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
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <h2 style={{ fontFamily: 'Lora, serif', fontSize: 22, fontWeight: 500, margin: '0 0 6px', color: 'var(--text-1)' }}>
              Research Outputs
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, maxWidth: 600, lineHeight: 1.55 }}>
              These outputs are derived from analyst-coded fields. Descriptive summaries show what has been coded.
              Analytic patterns show relationships between stages, behaviours, movement, and situational conditions.
              Counts are preliminary and will change as coding progresses.
              Stage sequences (RQ1) · Situational conditions (RQ2) · Mobility patterns (RQ3).
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={load} title="Refresh analysis"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <RefreshCw size={11} style={{ flexShrink: 0 }} /> Refresh
            </button>
            {([
              { label: 'Export coded cases (CSV)',    title: 'All coded cases as CSV — for quantitative analysis',             action: () => api.exportCsv()                   },
              { label: 'Export case summaries',       title: 'Per-case summary CSV — narrative, harm, mobility, GIS',          action: () => api.exportCaseSummaries()         },
              { label: 'Export stage sequences',      title: 'Stage sequences + transitions ZIP — for sequence analysis',      action: () => api.exportResearchTables()        },
              { label: 'Export GeoJSON',              title: 'Geocoded points as GeoJSON — for QGIS / ArcGIS',                action: () => api.exportGeoJson()               },
              { label: 'Export codebook',             title: 'Field definitions and allowed values — for methodology appendix',action: () => api.exportCodebook()              },
              { label: 'Coding coverage report',      title: 'Coding coverage summary — for dissertation methods chapter',    action: () => api.exportMethodologySummary()    },
            ] as { label: string; title: string; action: () => void }[]).map(({ label, title, action }) => (
              <button key={label} onClick={action} title={title}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Download size={11} style={{ flexShrink: 0 }} /> {label}
              </button>
            ))}
            <button onClick={() => navigate('/bulletin')} title="Case comparison and cross-case review"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent-pale)', color: 'var(--accent)', fontSize: 11.5, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
              <FileText size={11} style={{ flexShrink: 0 }} /> Case comparison
            </button>
          </div>
        </div>

        <ProvenanceNote />

        {/* Data quality banner */}
        {data.data_quality && (() => {
          const dq: DataQuality = data.data_quality;
          const pct = (n: number) => dq.total_imported > 0 ? fmtPct(n, dq.total_imported) : '—';
          type CoverageItem = [string, number, string];
          const groups: { label: string; items: CoverageItem[] }[] = [
            {
              label: 'Core dataset',
              items: [
                ['Imported cases',       dq.total_imported,       '#64748b'],
                ['Location field coded', dq.with_location_coded,  '#f59e0b'],
              ],
            },
            {
              label: 'Encounter coding',
              items: [
                ['Encounter coded',      dq.with_encounter_coded,   '#0ea5e9'],
                ['Stage coding done',    dq.with_stage_coding,      '#10b981'],
                ['Severity coded',       dq.with_severity_coded,    '#10b981'],
                ['Suitability coded',    dq.with_suitability_coded, '#10b981'],
                ['Clarity coded',        dq.with_clarity_coded,     '#0ea5e9'],
                ['Harm fields coded',    dq.with_harm_coded,        '#ef4444'],
                ['Movement coded',       dq.with_movement_coded,    '#6366f1'],
              ],
            },
            {
              label: 'Supplementary flags',
              items: [
                ['Supplementary flags coded', dq.with_vawg_coded, '#ef4444'],
              ],
            },
          ];
          const allItems = groups.flatMap(g => g.items);
          const anyLow = allItems.slice(1).some(([, n]) => n / Math.max(dq.total_imported, 1) < 0.1);
          return (
            <div style={{
              marginBottom: 20, padding: '12px 16px',
              border: `1px solid ${anyLow ? 'var(--amber-border, #fcd34d)' : 'var(--border)'}`,
              borderRadius: 8, background: anyLow ? 'var(--amber-pale, #fffbeb)' : 'var(--surface)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                {anyLow && <AlertTriangle size={13} style={{ color: 'var(--amber)', flexShrink: 0 }} />}
                <span style={{ fontSize: 11.5, fontWeight: 600, color: anyLow ? 'var(--amber)' : 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Dataset coding coverage
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>
                  — outputs based on currently coded fields only; sparse coding should be treated as preliminary
                </span>
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {groups.map(group => (
                  <div key={group.label}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
                      {group.label}
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {group.items.map(([label, count, color]) => (
                        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                          <span style={{ fontSize: 14, fontWeight: 600, color }}>
                            {count}
                            {label !== 'Imported cases' && (
                              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 4 }}>({pct(count)})</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

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

        {tab === 'encounter_overview' && <EncounterOverviewTab />}
        {tab === 'vawg'            && <VawgTab />}
        {tab === 'stage_patterns'  && <StagePatternsTab />}
        {tab === 'sequences'       && <SequencesTab />}
        {tab === 'environment'     && <EnvironmentTab />}
        {tab === 'mobility'        && <MobilityTab />}
        {tab === 'spatial'         && <SpatialOverviewTab />}
        {tab === 'linkage_view'    && <LinkageViewTab />}
        {tab === 'filtered_groups' && <FilteredGroupsTab />}
        {tab === 'caselist'        && <CaseListTab />}

        <ResearchNotesPanel />

      </div>
    </div>
  );
}
