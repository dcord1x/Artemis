import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, XCircle, HelpCircle, Info, ChevronDown, ChevronRight } from 'lucide-react';
import type { DomainScore, DomainFieldDetail } from '../types';
import { api } from '../api';
import type { CompareResult, Report, SimilarityResult } from '../types';

// ── Similarity dimension colours ──────────────────────────────────────────────

const DIM_ORDER = ['suspect','vehicle','encounter','violence','mobility','location_type','spatial','temporal'];
const DIM_LABELS: Record<string, string> = {
  suspect: 'Suspect', vehicle: 'Vehicle', encounter: 'Encounter',
  violence: 'Violence', mobility: 'Mobility', location_type: 'Locations',
  spatial: 'Geographic', temporal: 'Temporal',
};
const DIM_COLORS: Record<string, string> = {
  suspect: '#9B1D1D', vehicle: '#3730A3', encounter: '#B45309',
  violence: '#7C2D12', mobility: '#166534', location_type: '#4338CA',
  spatial: '#0F766E', temporal: '#6B7280',
};

// ── Analyst verdict config ────────────────────────────────────────────────────

const VERDICTS = [
  { key: 'possible_link',  label: 'Possible Link',  Icon: CheckCircle, color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' },
  { key: 'needs_review',   label: 'Needs Review',   Icon: HelpCircle,  color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
  { key: 'unlikely_link',  label: 'Unlikely',       Icon: XCircle,     color: 'var(--text-3)', bg: 'var(--surface-2)', border: 'var(--border)' },
];

// ── Field sections shown in side-by-side view ─────────────────────────────────

const SECTIONS = [
  {
    label: 'Encounter sequence',
    fields: [
      ['initial_approach_type', 'Approach type'],
      ['negotiation_present', 'Negotiation'],
      ['refusal_present', 'Refusal'],
      ['pressure_after_refusal', 'Pressure after refusal'],
      ['coercion_present', 'Coercion'],
      ['threats_present', 'Threats'],
      ['verbal_abuse', 'Verbal abuse'],
      ['physical_force', 'Physical force'],
      ['sexual_assault', 'Sexual assault'],
      ['robbery_theft', 'Robbery/theft'],
      ['stealthing', 'Stealthing'],
      ['escalation_point', 'Escalation point'],
      ['exit_type', 'Exit type'],
    ],
  },
  {
    label: 'Mobility',
    fields: [
      ['movement_present', 'Movement'],
      ['movement_attempted', 'Movement attempted'],
      ['entered_vehicle', 'Entered vehicle'],
      ['mode_of_movement', 'Mode'],
      ['start_location_type', 'Start type'],
      ['destination_location_type', 'Destination type'],
      ['public_to_private_shift', 'Public→private'],
      ['public_to_secluded_shift', 'Public→secluded'],
      ['cross_neighbourhood', 'Cross neighbourhood'],
      ['cross_municipality', 'Cross municipality'],
      ['offender_control_over_movement', 'Offender control'],
    ],
  },
  {
    label: 'Suspect / vehicle',
    fields: [
      ['suspect_gender', 'Gender'],
      ['suspect_race_ethnicity', 'Race/ethnicity'],
      ['suspect_age_estimate', 'Age estimate'],
      ['suspect_count', 'Suspect count'],
      ['vehicle_present', 'Vehicle present'],
      ['vehicle_make', 'Make'],
      ['vehicle_model', 'Model'],
      ['vehicle_colour', 'Colour'],
      ['plate_partial', 'Plate (partial)'],
      ['repeat_suspect_flag', 'Repeat suspect'],
      ['repeat_vehicle_flag', 'Repeat vehicle'],
    ],
  },
  {
    label: 'Location / time',
    fields: [
      ['incident_date', 'Date'],
      ['city', 'City'],
      ['neighbourhood', 'Neighbourhood'],
      ['initial_contact_location', 'Contact location'],
      ['incident_location_primary', 'Incident location'],
      ['indoor_outdoor', 'Indoor/outdoor'],
      ['public_private', 'Public/private'],
      ['deserted', 'Deserted'],
    ],
  },
];

// ── Location display guard ────────────────────────────────────────────────────
// Prevent junk NLP extractions like "the" or "near" from appearing in location
// fields in the compare view. Applied only to location-type field keys.
const _LOC_DISPLAY_KEYS = new Set(['initial_contact_location', 'incident_location_primary', 'incident_location_secondary']);
const _LOC_DISPLAY_JUNK = new Set([
  'the','a','an','this','that','he','she','they','it','him','her','them',
  'his','their','its','at','on','in','by','near','around','behind','outside',
  'inside','said','told','reported','where','there','here',
]);
const _LOC_DISPLAY_KEYWORDS = new Set([
  'street','st','avenue','ave','boulevard','blvd','road','rd','drive','dr',
  'lane','ln','way','place','court','ct','crescent','circle','parkway','highway',
  'alley','terrace','trail','intersection','corner','block','hotel','motel',
  'mall','plaza','park','lot','garage','bar','club','restaurant','cafe','store',
  'shop','station','transit','bus','hospital','school','apartment','condo',
  'house','home','basement','suite','downtown','uptown','district','square',
  'neighbourhood','neighborhood','north','south','east','west','central',
]);

function sanitizeLocDisplay(fieldKey: string, val: string): string {
  if (!_LOC_DISPLAY_KEYS.has(fieldKey) || !val) return val;
  const tokens = val.toLowerCase().match(/[a-zA-Z']+/g) ?? [];
  if (!tokens.length) return '';
  if (tokens.length === 1 && _LOC_DISPLAY_JUNK.has(tokens[0])) return '';
  if (tokens.every(t => _LOC_DISPLAY_JUNK.has(t))) return '';
  if (tokens.some(t => _LOC_DISPLAY_KEYWORDS.has(t))) return val;
  const meaningful = tokens.filter(t => !_LOC_DISPLAY_JUNK.has(t) && t.length >= 3);
  if (meaningful.length >= 2 && val.length >= 8) return val;
  if (meaningful.length === 1 && val.length >= 6) return val; // e.g. "Downtown"
  return ''; // Not convincingly a location — suppress
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 60 ? '#9B1D1D' : score >= 35 ? '#B45309' : '#6B7280';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '10px 20px',
      borderRadius: 10,
      background: 'var(--bg)',
      border: `2px solid ${color}`,
      minWidth: 80,
    }}>
      <span style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{Math.round(score)}</span>
      <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.05em', marginTop: 2 }}>SCORE / 100</span>
    </div>
  );
}

function DimStrip({ sim }: { sim: SimilarityResult }) {
  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap',
      padding: '12px 20px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      {DIM_ORDER.map((k) => {
        const d = sim.dimensions[k];
        if (!d) return null;
        const pct = Math.round(d.score * 100);
        const color = DIM_COLORS[k];
        return (
          <div
            key={k}
            title={`${d.label}: ${d.reason}`}
            style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: '6px 10px', borderRadius: 8,
              background: pct > 0 ? `${color}15` : 'var(--surface-2)',
              border: `1px solid ${pct > 0 ? color + '40' : 'var(--border)'}`,
              minWidth: 90, cursor: 'default',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: pct > 0 ? color : 'var(--text-3)', letterSpacing: '0.03em' }}>
                {DIM_LABELS[k]}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: pct > 0 ? color : 'var(--text-3)' }}>{pct}%</span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
            </div>
            {pct > 0 && d.matches.length > 0 && (
              <span style={{ fontSize: 9.5, color: 'var(--text-3)', lineHeight: 1.3 }}>
                {d.matches[0]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const DOMAIN_COLORS: Record<string, string> = {
  control: '#7C2D12',
  sexual:  '#9B1D1D',
  style:   '#B45309',
  escape:  '#166534',
  target:  '#1D4ED8',
};

const FIELD_LABELS: Record<string, string> = {
  physical_force: 'Physical force', sexual_assault: 'Sexual assault', coercion_present: 'Coercion',
  stealthing: 'Stealthing', threats_present: 'Threats', pressure_after_refusal: 'Pressure after refusal',
  offender_control_over_movement: 'Movement control', refusal_present: 'Refusal present',
  robbery_theft: 'Robbery/theft', verbal_abuse: 'Verbal abuse', negotiation_present: 'Negotiation',
  service_discussed: 'Service discussed', payment_discussed: 'Payment discussed',
  movement_present: 'Movement present', entered_vehicle: 'Entered vehicle',
  public_to_private_shift: 'Public→private', public_to_secluded_shift: 'Public→secluded',
  cross_municipality: 'Cross municipality', cross_neighbourhood: 'Cross neighbourhood',
  deserted: 'Deserted', repeat_suspect_flag: 'Repeat suspect', repeat_vehicle_flag: 'Repeat vehicle',
};

const DOMAIN_ORDER = ['control', 'sexual', 'style', 'escape', 'target'];

// Per-status row config for the field breakdown table
const STATUS_ROW: Record<DomainFieldDetail['status'], {
  label: string; color: string; bg: string; rowBg: string;
}> = {
  joint_present:  { label: 'Both yes — match',    color: '#166534', bg: '#D1FAE5', rowBg: '#F0FDF480' },
  probable_joint: { label: 'Probable match',       color: '#065F46', bg: '#ECFDF5', rowBg: '#F0FDF440' },
  discordant_a:   { label: 'A only',               color: '#92400E', bg: '#FEF3C7', rowBg: '#FFFBEB60' },
  discordant_b:   { label: 'B only',               color: '#92400E', bg: '#FEF3C7', rowBg: '#FFFBEB60' },
  both_absent:    { label: 'Both no — absent',     color: '#6B7280', bg: '#F3F4F6', rowBg: '#F9FAFB' },
  both_empty:     { label: 'Not coded',            color: '#9CA3AF', bg: 'transparent', rowBg: 'transparent' },
  one_empty:      { label: 'One case uncoded',     color: '#9CA3AF', bg: 'transparent', rowBg: 'transparent' },
};

// Infer per-value provenance from the raw field value (best-effort without
// full provenance data in the similarity context)
function inferValueSource(v: string): { label: string; color: string } {
  if (!v) return { label: 'not coded', color: '#9CA3AF' };
  if (v === 'yes' || v === 'no') return { label: 'coded', color: '#2563EB' };
  if (v === 'probable' || v === 'inferred') return { label: 'inferred/NLP', color: '#D97706' };
  if (v === 'unclear') return { label: 'unclear', color: '#6B7280' };
  return { label: 'coded', color: '#2563EB' };
}

function FieldBreakdownTable({ fields }: { fields: DomainFieldDetail[] }) {
  return (
    <div style={{ marginTop: 6, borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 72px 72px 110px',
        padding: '4px 8px', background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
      }}>
        {['Field (weight)', 'Case A', 'Case B', 'Comparison'].map((h) => (
          <span key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>
      {fields.map((fd) => {
        const cfg = STATUS_ROW[fd.status];
        const srcA = inferValueSource(fd.value_a);
        const srcB = inferValueSource(fd.value_b);
        return (
          <div key={fd.field} style={{
            display: 'grid', gridTemplateColumns: '1fr 72px 72px 110px',
            padding: '4px 8px', borderBottom: '1px solid var(--border)',
            background: cfg.rowBg, alignItems: 'center', gap: 4,
          }}>
            {/* Field name + weight */}
            <div>
              <span style={{ fontSize: 10, color: cfg.color === '#9CA3AF' ? 'var(--text-3)' : 'var(--text-1)', fontWeight: 500 }}>
                {fd.label}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 5 }}>
                ×{fd.weight}
              </span>
            </div>
            {/* Case A value + source */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{
                fontSize: 10, fontWeight: fd.value_a ? 600 : 400,
                color: fd.value_a ? 'var(--text-1)' : 'var(--text-3)',
                fontStyle: fd.value_a ? 'normal' : 'italic',
              }}>
                {fd.value_a || '—'}
              </span>
              {fd.value_a && (
                <span style={{ fontSize: 8.5, color: srcA.color, fontWeight: 600, letterSpacing: '0.02em' }}>
                  {srcA.label}
                </span>
              )}
            </div>
            {/* Case B value + source */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{
                fontSize: 10, fontWeight: fd.value_b ? 600 : 400,
                color: fd.value_b ? 'var(--text-1)' : 'var(--text-3)',
                fontStyle: fd.value_b ? 'normal' : 'italic',
              }}>
                {fd.value_b || '—'}
              </span>
              {fd.value_b && (
                <span style={{ fontSize: 8.5, color: srcB.color, fontWeight: 600, letterSpacing: '0.02em' }}>
                  {srcB.label}
                </span>
              )}
            </div>
            {/* Comparison status badge */}
            <span style={{
              fontSize: 9, fontWeight: 600, color: cfg.color,
              background: cfg.bg || 'transparent',
              padding: cfg.bg !== 'transparent' ? '1px 5px' : '0',
              borderRadius: 3, display: 'inline-block', lineHeight: 1.4,
            }}>
              {cfg.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Score-type visual config — drives colour, score display, and explanation framing
const SCORE_TYPE_STYLE: Record<string, {
  scoreColor: (domainColor: string) => string;
  barColor:   (domainColor: string) => string;
  badge: { text: string; color: string; bg: string; border: string } | null;
}> = {
  positive_match: {
    scoreColor: (c) => c,
    barColor:   (c) => c,
    badge: null,  // no badge needed — score speaks for itself
  },
  joint_absence: {
    scoreColor: () => '#6B7280',
    barColor:   () => '#D1D5DB',
    badge: { text: 'Both absent — not a match signal', color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
  },
  discordant: {
    scoreColor: () => '#B45309',
    barColor:   () => '#FCD34D',
    badge: { text: 'Discordant', color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
  },
  baseline: {
    scoreColor: () => '#9CA3AF',
    barColor:   () => '#E5E7EB',
    badge: { text: 'No coded values', color: '#9CA3AF', bg: 'transparent', border: 'var(--border)' },
  },
};

function DomainPanel({ domainScores }: { domainScores: Record<string, DomainScore> }) {
  // Auto-expand suppressed domains so analyst sees why immediately; also expand small domains
  const autoExpanded = new Set(
    DOMAIN_ORDER.filter((k) => {
      const d = domainScores[k];
      if (!d) return false;
      const st = d.score_type ?? (d.has_real_coded_values ? 'positive_match' : 'baseline');
      return st === 'baseline' || d.total_count <= 2;
    })
  );
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(autoExpanded);

  if (!domainScores || Object.keys(domainScores).length === 0) return null;

  const toggle = (key: string) =>
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
        <Info size={11} color="var(--text-3)" />
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
          Behavioral Domains
        </span>
        <span style={{ fontSize: 9.5, color: 'var(--text-3)', fontStyle: 'italic', marginLeft: 4 }}>
          Click any card to see contributing fields.
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {DOMAIN_ORDER.map((key) => {
          const d = domainScores[key];
          if (!d) return null;
          const pct = Math.round(d.score * 100);
          const domainColor = DOMAIN_COLORS[key] || '#6B7280';
          const isExpanded = expandedKeys.has(key);
          const scoreType = d.score_type ?? (d.has_real_coded_values ? 'positive_match' : 'baseline');
          const typeCfg = SCORE_TYPE_STYLE[scoreType] ?? SCORE_TYPE_STYLE.baseline;
          const scoreColor = typeCfg.scoreColor(domainColor);
          const barColor   = typeCfg.barColor(domainColor);
          // Only show a percentage for types where the number means something
          const showScore  = scoreType === 'positive_match' || scoreType === 'discordant';
          const cardBorder = scoreType === 'positive_match' ? `${domainColor}50` : 'var(--border)';

          return (
            <div key={key} style={{
              flex: '1 1 160px', minWidth: 160, maxWidth: 300,
              borderRadius: 7, overflow: 'hidden',
              border: `1px solid ${cardBorder}`,
              background: 'var(--surface)',
            }}>
              {/* ── Card header (always visible, clickable) ───────────────── */}
              <div
                style={{ padding: '8px 10px', cursor: 'pointer' }}
                onClick={() => toggle(key)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isExpanded
                      ? <ChevronDown size={10} color={showScore ? scoreColor : 'var(--text-3)'} />
                      : <ChevronRight size={10} color="var(--text-3)" />}
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: scoreType === 'positive_match' ? domainColor : 'var(--text-2)' }}>
                      {d.label}
                    </span>
                  </div>
                  {/* Score display — suppressed for baseline and joint_absence */}
                  {showScore ? (
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: scoreColor,
                      background: scoreType !== 'positive_match' ? '#F3F4F6' : 'transparent',
                      padding: scoreType !== 'positive_match' ? '1px 6px' : '0',
                      borderRadius: 4, border: scoreType !== 'positive_match' ? '1px solid #E5E7EB' : 'none',
                    }}>
                      {pct}%
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#9CA3AF',
                      background: 'var(--surface-2)', borderRadius: 3,
                      padding: '1px 5px', border: '1px solid var(--border)',
                    }}>—</span>
                  )}
                </div>

                {/* Score bar — empty for suppressed types */}
                <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ width: `${showScore ? pct : 0}%`, height: '100%', background: barColor, borderRadius: 2 }} />
                </div>

                {/* Score-type badge — shown for non-positive_match types */}
                {typeCfg.badge && (
                  <div style={{ marginBottom: 5 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                      color: typeCfg.badge.color, background: typeCfg.badge.bg,
                      border: `1px solid ${typeCfg.badge.border}`,
                      padding: '1px 5px', borderRadius: 3,
                    }}>
                      {typeCfg.badge.text}
                    </span>
                  </div>
                )}

                {/* Basis line — field count only, no formula language */}
                <div style={{
                  paddingTop: 4, borderTop: '1px solid var(--border)',
                  fontSize: 9, color: 'var(--text-3)', lineHeight: 1.3,
                }}>
                  {d.coded_count} of {d.total_count} field{d.total_count !== 1 ? 's' : ''} coded
                  {scoreType === 'baseline' && (
                    <span style={{ color: '#B45309', fontWeight: 600 }}> · score suppressed</span>
                  )}
                  {scoreType === 'joint_absence' && (
                    <span style={{ color: '#6B7280', fontWeight: 600 }}> · absence only</span>
                  )}
                </div>
              </div>

              {/* ── Field breakdown (expanded or auto-expanded) ───────────── */}
              {isExpanded && d.field_breakdown && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <FieldBreakdownTable fields={d.field_breakdown} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FieldCell({ value, matched, isMatch }: { value: string; matched: boolean; isMatch: boolean }) {
  return (
    <div style={{
      padding: '4px 10px',
      borderRadius: 4,
      background: isMatch && matched ? '#FEF9C3' : 'transparent',
      border: isMatch && matched ? '1px solid #FDE047' : '1px solid transparent',
      fontSize: 12.5, color: value ? 'var(--text-1)' : 'var(--text-3)',
      fontStyle: value ? 'normal' : 'italic',
      minHeight: 26, display: 'flex', alignItems: 'center',
    }}>
      {value || '—'}
    </div>
  );
}

function CaseColumn({ report, matchedFields, side }: { report: Report; matchedFields: Set<string>; side: 'A' | 'B' }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
      {/* Narrative */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          color: 'var(--text-3)', marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <span style={{
            padding: '1px 6px', borderRadius: 3,
            background: side === 'A' ? '#FEE2E2' : '#DBEAFE',
            color: side === 'A' ? '#9B1D1D' : '#1D4ED8',
            border: `1px solid ${side === 'A' ? '#FECACA' : '#BFDBFE'}`,
          }}>CASE {side}</span>
          SOURCE NARRATIVE
        </div>
        <div style={{
          fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-1)',
          whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif',
          maxHeight: 220, overflow: 'auto',
          padding: '8px 10px', borderRadius: 6,
          background: 'var(--bg)', border: '1px solid var(--border)',
        }}>
          {report.raw_narrative || '—'}
        </div>
      </div>

      {/* Coded fields */}
      {SECTIONS.map((sec) => (
        <div key={sec.label} style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{
            padding: '6px 14px',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            color: 'var(--text-3)', background: 'var(--surface)',
            textTransform: 'uppercase',
          }}>
            {sec.label}
          </div>
          {sec.fields.map(([key, label]) => {
            const rawVal = String((report as any)[key] || '');
            const val = sanitizeLocDisplay(key, rawVal);
            const matched = matchedFields.has(key);
            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'center',
                padding: '1px 14px',
                borderTop: '1px solid var(--border)',
                minHeight: 30,
              }}>
                <div style={{
                  width: 140, fontSize: 11.5, color: matched ? 'var(--text-1)' : 'var(--text-3)',
                  fontWeight: matched ? 500 : 400, flexShrink: 0, paddingRight: 8,
                }}>
                  {matched && <span style={{ color: '#CA8A04', marginRight: 4 }}>◆</span>}
                  {label}
                </div>
                <FieldCell value={val} matched={matched} isMatch={matched && !!val} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LinkageScreen() {
  const { reportIdA, reportIdB } = useParams<{ reportIdA: string; reportIdB: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [verdict, setVerdict] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!reportIdA || !reportIdB) return;
    api.compareReports(reportIdA, reportIdB).then((r) => {
      setResult(r);
      setVerdict(r.linkage?.analyst_status || '');
      setNotes(r.linkage?.analyst_notes || '');
      setLoading(false);
    });
  }, [reportIdA, reportIdB]);

  const handleSave = useCallback(async () => {
    if (!reportIdA || !reportIdB) return;
    setSaving(true);
    await api.saveLinkage({ report_id_a: reportIdA, report_id_b: reportIdB, analyst_status: verdict, analyst_notes: notes });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [reportIdA, reportIdB, verdict, notes]);

  if (loading || !result) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 13 }}>
        Comparing cases…
      </div>
    );
  }

  const { report_a, report_b, similarity } = result;
  const matchedFields = new Set(similarity.matched_fields);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '8px 16px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0, boxShadow: 'var(--shadow-sm)',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}
        >
          <ArrowLeft size={15} />
        </button>

        {/* Case ID badges */}
        <span style={{
          padding: '3px 10px', borderRadius: 5,
          fontSize: 12, fontFamily: 'monospace',
          background: '#FEE2E2', color: '#9B1D1D', border: '1px solid #FECACA',
        }}>
          A: {report_a.report_id}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>vs</span>
        <span style={{
          padding: '3px 10px', borderRadius: 5,
          fontSize: 12, fontFamily: 'monospace',
          background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE',
        }}>
          B: {report_b.report_id}
        </span>

        <ScoreGauge score={similarity.score} />

        {/* Verdict buttons */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {VERDICTS.map(({ key, label, Icon, color, bg, border }) => (
            <button
              key={key}
              onClick={() => { setVerdict(verdict === key ? '' : key); setSaved(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 6,
                border: `1.5px solid ${verdict === key ? border : 'var(--border)'}`,
                background: verdict === key ? bg : 'var(--surface-2)',
                color: verdict === key ? color : 'var(--text-3)',
                fontSize: 12.5, cursor: 'pointer', fontWeight: verdict === key ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Notes */}
        <input
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
          placeholder="Analyst notes…"
          style={{
            flex: 1, minWidth: 180, padding: '5px 10px', borderRadius: 5,
            border: '1px solid var(--border)', background: 'var(--bg)',
            fontSize: 12.5, color: 'var(--text-1)', outline: 'none',
            fontFamily: 'DM Sans, sans-serif',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
        />

        <button
          onClick={handleSave}
          disabled={saving || !verdict}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px', borderRadius: 6,
            border: 'none', background: saved ? '#D1FAE5' : 'var(--accent)',
            color: saved ? '#065F46' : '#fff', fontSize: 12.5,
            cursor: verdict ? 'pointer' : 'not-allowed',
            opacity: !verdict ? 0.5 : 1, transition: 'all 0.15s',
          }}
        >
          <Save size={13} />
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save verdict'}
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* ── Similarity dimension strip ── */}
        <DimStrip sim={similarity} />

        {/* ── Behavioral domain breakdown ── */}
        <DomainPanel domainScores={similarity.domain_scores} />

        {/* ── Matched fields key ── */}
        {matchedFields.size > 0 && (
          <div style={{
            padding: '5px 16px',
            background: '#FEFCE8',
            borderBottom: '1px solid #FDE047',
            fontSize: 11, color: '#713F12',
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ color: '#CA8A04' }}>◆</span>
            Highlighted fields ({matchedFields.size}) contributed to the similarity score.
            Yellow background = matched value.
          </div>
        )}

        {/* ── Side-by-side columns ── */}
        <div style={{ flex: 1, minHeight: '60vh', display: 'flex', borderTop: '2px solid var(--border)' }}>
          <div style={{ flex: 1, overflow: 'auto', borderRight: '2px solid var(--border)' }}>
            <CaseColumn report={report_a} matchedFields={matchedFields} side="A" />
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <CaseColumn report={report_b} matchedFields={matchedFields} side="B" />
          </div>
        </div>

      </div>
    </div>
  );
}
