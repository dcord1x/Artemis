import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { api } from '../api';
import type { Stats, ResearchAggregate } from '../types';
import { formatLabel } from '../utils';
import { useMaps } from '../context/MapsContext';
import {
  RefreshCw, AlertTriangle, MapPin, Shield,
  ArrowRight, Database, Activity, Target, FileText,
  Link2, Layers, GitBranch, Globe, Navigation,
  CheckCircle, Clock, Zap, ExternalLink,
  FileOutput, TrendingUp,
} from 'lucide-react';

// ── Colour palette ─────────────────────────────────────────────────────────────
const C = {
  green:  '#22C55E',
  amber:  '#F59E0B',
  red:    '#EF4444',
  coral:  '#F97316',
  blue:   '#4A90D9',
  purple: '#8B5CF6',
  slate:  '#94A3B8',
  indigo: '#6366F1',
  teal:   '#14B8A6',
};

const STAGE_LABELS: Record<string, string> = {
  initial_contact:          'Initial contact',
  screening_recognition:    'Screening / recognition',
  negotiation:              'Negotiation',
  pickup_meeting:           'Pickup / meeting',
  movement_relocation:      'Movement / relocation',
  movement_travel:          'Movement / relocation',
  arrival_setting:          'Arrival / setting',
  arrival_location:         'Arrival / setting',
  escalation:               'Escalation',
  violence_coercion:        'Violence / coercion',
  exit_escape:              'Exit / escape',
  exit_aftermath:           'Exit / aftermath',
  aftermath:                'Aftermath / warning',
  aftermath_warning:        'Aftermath / warning',
  other:                    'Other',
  unknown_unclear:          'Unknown / unclear',
};

const STAGE_COLORS: Record<string, string> = {
  initial_contact:   C.blue,
  negotiation:       '#34D399',
  pickup_meeting:    '#FBBF24',
  movement_travel:   C.amber,
  arrival_location:  '#60A5FA',
  escalation:        C.coral,
  violence_coercion: C.red,
  exit_escape:       '#10B981',
  aftermath:         C.purple,
  other:             C.slate,
  unknown_unclear:   C.slate,
};

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0d1b2a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1b2a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7fa3' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0b1f33' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#071520' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
      {icon && <span style={{ color: 'var(--text-3)', opacity: 0.7 }}>{icon}</span>}
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
        {text}
      </div>
      <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: 4 }} />
    </div>
  );
}

function Badge({ label, variant }: { label: string; variant: 'coded' | 'nlp' | 'spatial' | 'review' }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    coded:   { bg: `${C.green}14`,  color: C.green,  border: `${C.green}40` },
    nlp:     { bg: `${C.amber}14`,  color: C.amber,  border: `${C.amber}40` },
    spatial: { bg: `${C.blue}14`,   color: C.blue,   border: `${C.blue}40` },
    review:  { bg: `${C.coral}14`,  color: C.coral,  border: `${C.coral}40` },
  };
  const s = styles[variant];
  return (
    <span style={{ fontSize: 8.5, padding: '1px 5px', borderRadius: 3, background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontWeight: 700, letterSpacing: '0.04em' }}>
      {label}
    </span>
  );
}

function CountBar({ label, count, max, color = 'var(--accent)', sub, onClick, tag, barHeight = 4 }: {
  label: string; count: number; max: number; color?: string; sub?: string;
  onClick?: () => void; tag?: string; barHeight?: number;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 9, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11.5, color: onClick ? 'var(--text-1)' : 'var(--text-2)', fontWeight: onClick ? 500 : 400 }}>{label}</span>
          {tag && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: `${C.amber}14`, color: C.amber, border: `1px solid ${C.amber}44`, fontWeight: 700 }}>{tag}</span>}
          {sub && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{sub}</span>}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, minWidth: 20, textAlign: 'right' }}>{count}</span>
      </div>
      <div style={{ height: barHeight, borderRadius: 10, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 10, background: color, width: `${pct}%`, transition: 'width 0.7s ease' }} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color, onClick, tag, icon }: {
  label: string; value: string | number; sub?: string; color?: string;
  onClick?: () => void; tag?: string; icon?: React.ReactNode;
}) {
  const isClick = !!onClick;
  return (
    <div
      className="card"
      onClick={onClick}
      style={{ padding: '12px 13px', cursor: isClick ? 'pointer' : 'default', position: 'relative', transition: 'box-shadow 0.15s', borderLeft: `3px solid ${color || 'var(--border)'}` }}
      onMouseEnter={e => { if (isClick) (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1.5px ${color || 'var(--accent)'}55`; }}
      onMouseLeave={e => { if (isClick) (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
    >
      {tag && (
        <div style={{ position: 'absolute', top: 7, right: 7, fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'var(--surface-3)', color: 'var(--text-3)', fontWeight: 700 }}>
          {tag}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
        {icon && <span style={{ color: color || 'var(--text-3)', opacity: 0.75 }}>{icon}</span>}
        <span style={{ fontSize: 9.5, color: 'var(--text-3)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Lora, serif', fontSize: 24, fontWeight: 500, color: color || 'var(--text-1)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{sub}</div>}
      {isClick && <div style={{ fontSize: 9.5, color: color || 'var(--accent)', marginTop: 4, opacity: 0.7 }}>View →</div>}
    </div>
  );
}

function QueueRow({ label, count, desc, color, onClick }: {
  label: string; count: number; desc: string; color: string; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 5, cursor: 'pointer', borderLeft: `3px solid ${color}`, background: 'var(--surface-2)', transition: 'background 0.12s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${color}10`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'; }}
    >
      <div style={{ minWidth: 32, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 18, fontWeight: 500, color, lineHeight: 1 }}>{count}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{desc}</div>
      </div>
      <ArrowRight size={11} style={{ color, flexShrink: 0, opacity: 0.7 }} />
    </div>
  );
}

function PipelineStep({ label, count, pct, color, isLast, onClick, sub }: {
  label: string; count: number; pct?: number; color: string; isLast?: boolean;
  onClick?: () => void; sub?: string;
}) {
  const isClick = !!onClick;
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
      <div
        onClick={onClick}
        style={{ flex: 1, padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, borderTop: `3px solid ${color}`, cursor: isClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s', minWidth: 0 }}
        onMouseEnter={e => { if (isClick) (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1.5px ${color}55`; }}
        onMouseLeave={e => { if (isClick) (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
      >
        <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 20, fontWeight: 500, color, lineHeight: 1 }}>{count.toLocaleString()}</div>
        {pct !== undefined && (
          <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>
            {Math.min(pct, 100)}%
          </div>
        )}
        {sub && <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 1, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {!isLast && (
        <div style={{ color: 'var(--border-mid)', padding: '0 4px', flexShrink: 0 }}>
          <ArrowRight size={11} />
        </div>
      )}
    </div>
  );
}

function OutputTile({ label, desc, icon, onClick, color = 'var(--accent)' }: {
  label: string; desc: string; icon: React.ReactNode; onClick: () => void; color?: string;
}) {
  return (
    <div
      onClick={onClick}
      style={{ padding: '12px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', transition: 'all 0.14s' }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = color;
        el.style.background = `${color}0a`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = 'var(--border)';
        el.style.background = 'var(--surface)';
      }}
    >
      <div style={{ color, marginBottom: 6, opacity: 0.85 }}>{icon}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}

function ValDistPanel({ label, vc, color = 'var(--accent)', total }: {
  label: string;
  vc: { counts: Record<string, number>; total_coded: number } | undefined;
  color?: string;
  total: number;
}) {
  if (!vc || vc.total_coded === 0) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No analyst-coded values yet</div>
      </div>
    );
  }
  const sorted = Object.entries(vc.counts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{vc.total_coded} coded</div>
      </div>
      {sorted.map(([val, cnt]) => (
        <div key={val} style={{ marginBottom: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{formatLabel(val)}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
              {cnt} <span style={{ fontWeight: 400, fontSize: 10 }}>({total > 0 ? Math.round(cnt / total * 100) : 0}%)</span>
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 10, background: 'var(--surface-3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 10, background: color, width: `${max > 0 ? cnt / max * 100 : 0}%`, transition: 'width 0.7s ease' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 11.5, fontStyle: 'italic', background: 'var(--surface-2)', borderRadius: 5, border: '1px dashed var(--border)' }}>
      {message}
    </div>
  );
}

// Renders a full sequence string as a horizontal pill chain
function PathwayChain({ sequence, count, rank }: { sequence: string; count: number; rank: number }) {
  const stages = sequence.split(' → ');
  return (
    <div style={{ padding: '9px 12px', background: 'var(--surface-2)', borderRadius: 7, border: '1px solid var(--border)', marginBottom: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, rowGap: 4 }}>
        <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'Lora, serif', marginRight: 2, flexShrink: 0 }}>{rank}.</span>
        {stages.map((s, i) => {
          const lbl = STAGE_LABELS[s] || formatLabel(s);
          const col = STAGE_COLORS[s] || C.slate;
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: 'var(--text-3)', fontSize: 9, flexShrink: 0 }}>→</span>}
              <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: col + '18', color: col, border: `1px solid ${col}30`, whiteSpace: 'nowrap' }}>
                {lbl}
              </span>
            </span>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, flexShrink: 0, paddingLeft: 6 }}>{count}×</span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Analysis() {
  const navigate = useNavigate();
  const { isLoaded: mapsLoaded } = useMaps();

  const [stats, setStats] = useState<Stats | null>(null);
  const [agg, setAgg] = useState<ResearchAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([api.getStats(), api.getResearchAggregate()])
      .then(([s, a]) => { setStats(s); setAgg(a); setLoading(false); setLastRefresh(new Date()); })
      .catch(() => { setLoading(false); setLoadError('Could not load data — is the backend running?'); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const go = (qs: Record<string, string>) =>
    navigate('/cases?' + new URLSearchParams(qs).toString());

  const d = useMemo(() => {
    if (!stats || !agg) return null;
    const total    = stats.total;
    const coded    = stats.coded;
    const geocoded = stats.map_points.length;
    const dq       = agg.data_quality;
    const nlp      = stats.nlp_violence;

    const nlpCoercionSignals = nlp.coercion.rank1 + nlp.coercion.rank2;
    const nlpPhysSignals     = nlp.physical.rank1 + nlp.physical.rank2;
    const nlpSexSignals      = nlp.sexual.rank1   + nlp.sexual.rank2;
    const nlpMovSignals      = nlp.movement.rank1 + nlp.movement.rank2;
    const nlpTotal           = nlpCoercionSignals + nlpPhysSignals + nlpSexSignals + nlpMovSignals;

    // analystStaged = reports with analyst-created stage records in the stages table
    const analystStaged  = dq.with_stage_coding;
    // stageFramework = all reports (derived sequence framework is generated for every report)
    const stageFramework = agg.sequences.total_cases;
    const researchReady = dq.with_encounter_coded;
    const bulletinCount = agg.vawg.flag_counts.public_safety_bulletin_suitability_positive;
    const repeatFlags   = stats.repeated_vehicles.length + agg.vawg.flag_counts.repeat_targeting_concern;
    const locationNeedsGeocode = Math.max(0, total - geocoded);
    const missingStages = Math.max(0, coded - analystStaged);
    const movUncoded    = Math.max(0, stats.movement.count - dq.with_movement_coded);

    return {
      total, coded, geocoded, analystStaged, stageFramework, researchReady, bulletinCount, repeatFlags,
      locationNeedsGeocode, missingStages, movUncoded,
      nlpCoercionSignals, nlpPhysSignals, nlpSexSignals, nlpMovSignals, nlpTotal,
      codingPct:    total ? Math.round(coded          / total * 100) : 0,
      geocodedPct:  total ? Math.round(geocoded        / total * 100) : 0,
      stagedPct:    coded ? Math.min(100, Math.round(analystStaged / coded * 100)) : 0,
      researchPct:  coded ? Math.round(researchReady  / coded * 100) : 0,
    };
  }, [stats, agg]);

  const mapCenter = useMemo(() => {
    if (!stats) return null;
    const pts = stats.map_points.filter(p => p.lat_initial && p.lon_initial);
    if (!pts.length) return null;
    return {
      lat: pts.reduce((s, p) => s + p.lat_initial!, 0) / pts.length,
      lng: pts.reduce((s, p) => s + p.lon_initial!, 0) / pts.length,
    };
  }, [stats]);

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 13, gap: 8 }}>
      <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading analytic overview…
    </div>
  );
  if (loadError) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 14, gap: 8 }}>
      <span>{loadError}</span>
      <button className="btn-ghost" onClick={load} style={{ fontSize: 12 }}>Retry</button>
    </div>
  );
  if (!stats || !agg || !d) return null;

  const mob       = agg.mobility.counts;
  const mobMax    = Math.max(mob.movement_present, mob.entered_vehicle, mob.public_to_private, mob.public_to_secluded, mob.cross_neighbourhood, mob.cross_municipality, 1);
  const maxHarm   = Math.max(stats.coercion.count, stats.physical_force.count, stats.sexual_assault.count, stats.threats_present.count, agg.encounter.indicator_counts.robbery_theft, agg.encounter.indicator_counts.weapon_present_used, 1);
  const stageFreq = agg.sequences.stage_frequency.slice(0, 8);
  const maxStageFreq = stageFreq.length ? Math.max(...stageFreq.map(s => s.count), 1) : 1;
  const bigrams   = agg.sequences.most_common_bigrams.slice(0, 5);
  const topSeqs   = agg.sequences.most_common_sequences.slice(0, 4);
  const movementPathways = stats.map_points.filter(p => p.lat_initial && p.lat_incident).length;
  const topCities = stats.cities?.slice(0, 5) ?? [];

  // Dynamic insight observations
  const insights: { text: string; color: string; icon: React.ReactNode }[] = [];
  const topCity = stats.cities?.[0];
  if (topCity && d.total > 0 && topCity.count / d.total >= 0.4)
    insights.push({ text: `${topCity.count} of ${d.total} reports concentrated in ${topCity.name} (${Math.round(topCity.count / d.total * 100)}%)`, color: C.amber, icon: <Globe size={11} /> });
  if (d.total > 0 && d.codingPct < 50)
    insights.push({ text: `${d.codingPct}% of reports analyst-coded — patterns reflect a partial dataset`, color: C.coral, icon: <AlertTriangle size={11} /> });
  if (d.movUncoded > 0)
    insights.push({ text: `${d.movUncoded} report${d.movUncoded !== 1 ? 's' : ''} with movement present but Mobility tab incomplete`, color: C.purple, icon: <Navigation size={11} /> });

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 24px 52px' }}>

        {/* ═══ HEADER ═══════════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: insights.length ? 16 : 22 }}>
          <div>
            <h1 style={{ fontFamily: 'Lora, serif', fontSize: 26, fontWeight: 500, margin: '0 0 4px', color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
              Analysis Dashboard
            </h1>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 10px', maxWidth: 680, lineHeight: 1.5 }}>
              Systematic cross-case analysis of coded bad date report narratives — stage sequences (RQ1), situational conditions (RQ2), and mobility patterns (RQ3).
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, fontSize: 11.5, flexWrap: 'wrap' }}>
              {[
                { label: `${d.total.toLocaleString()} reports`, color: 'var(--text-1)' },
                { label: `${d.geocoded} geocoded reports`, color: C.blue },
                { label: `${d.coded} analyst-coded`, color: C.green },
                { label: `Updated ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, color: 'var(--text-3)' },
              ].map((item, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  {i > 0 && <span style={{ color: 'var(--border-mid)', margin: '0 10px' }}>·</span>}
                  <span style={{ color: item.color }}>{item.label}</span>
                </span>
              ))}
            </div>
          </div>
          <button className="btn-ghost" onClick={load} disabled={loading} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginTop: 4 }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {/* ═══ INSIGHT ALERTS ═══════════════════════════════════════════════════ */}
        {insights.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {insights.map((ins, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 13px', borderRadius: 6, borderLeft: `3px solid ${ins.color}`, background: 'var(--surface-2)', flex: '1 1 200px', minWidth: 0 }}>
                <span style={{ color: ins.color, flexShrink: 0, marginTop: 1 }}>{ins.icon}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.45 }}>{ins.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* ═══ CODING PROGRESS ══════════════════════════════════════════════════ */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel text="Coding Progress" icon={<Activity size={11} />} />
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, marginTop: -4 }}>
            Tracks each case from imported source report through to research-ready coded status.
          </p>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
            <PipelineStep label="Source Reports"      count={d.total}          color={C.blue}   onClick={() => go({})} />
            <PipelineStep label="Imported"             count={d.total}          pct={100}        color={C.indigo} sub="source reports" />
            <PipelineStep label="Analyst Coded"       count={d.coded}          pct={d.codingPct}  color={C.green}  onClick={() => go({ coding_status: 'coded' })} />
            <PipelineStep label="Stage Coded"         count={d.analystStaged}  pct={d.stagedPct}  color={C.purple} sub="stage records created" onClick={() => navigate('/research')} />
            <PipelineStep label="Geocoded"            count={d.geocoded}       pct={d.geocodedPct} color={C.amber} onClick={() => go({ geocode_status: 'yes' })} />
            <PipelineStep label="Research Ready"      count={d.researchReady}  pct={d.researchPct} color={C.teal} onClick={() => navigate('/research')} isLast />
          </div>
        </div>

        {/* ═══ HERO ROW: Spatial Snapshot + Attention Queue ════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* ── Spatial Overview ─────────────────────────────────────────────── */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px 10px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 style={{ fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500, margin: '0 0 2px' }}>
                  Spatial Overview
                </h3>
                <p style={{ fontSize: 10.5, color: 'var(--text-3)', margin: 0 }}>
                  Geocoded encounter locations — initial contact sites and incident sites
                </p>
              </div>
              <button className="btn-ghost" onClick={() => navigate('/map')} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <ExternalLink size={10} /> Open GIS Workspace
              </button>
            </div>

            {/* Map */}
            <div style={{ height: 280, background: '#0d1b2a', position: 'relative' }}>
              {mapsLoaded && mapCenter && d.geocoded > 0 ? (
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={mapCenter}
                  zoom={11}
                  options={{ disableDefaultUI: true, gestureHandling: 'none', clickableIcons: false, styles: DARK_MAP_STYLES }}
                >
                  {stats.map_points.slice(0, 80).map((p, i) => (
                    <span key={i}>
                      {p.lat_initial != null && p.lon_initial != null && (
                        <Marker
                          position={{ lat: p.lat_initial, lng: p.lon_initial }}
                          icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 4.5, fillColor: C.blue, fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 0.5 }}
                        />
                      )}
                      {p.lat_incident != null && p.lon_incident != null && (
                        <Marker
                          position={{ lat: p.lat_incident, lng: p.lon_incident }}
                          icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 4.5, fillColor: C.red, fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 0.5 }}
                        />
                      )}
                    </span>
                  ))}
                </GoogleMap>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7fa3', fontSize: 12, fontStyle: 'italic', flexDirection: 'column', gap: 8 }}>
                  <MapPin size={22} style={{ opacity: 0.3 }} />
                  {!mapsLoaded ? 'Map initialising…' : 'No geocoded locations yet — geocode cases to populate this map.'}
                </div>
              )}
              {/* Map legend overlay */}
              <div style={{ position: 'absolute', bottom: 8, left: 10, display: 'flex', gap: 10, pointerEvents: 'none' }}>
                {[{ color: C.blue, label: 'Initial contact' }, { color: C.red, label: 'Incident' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.55)', padding: '2px 7px', borderRadius: 10, backdropFilter: 'blur(4px)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: 'var(--surface-3)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              {[
                { label: 'Geocoded reports', value: d.geocoded, color: C.amber, click: () => go({ geocode_status: 'yes' }) },
                { label: 'Movement pathways', value: movementPathways, color: C.purple, click: () => go({ movement_present: 'yes' }) },
                { label: 'Cities / areas', value: stats.cities?.length ?? 0, color: C.blue, click: undefined },
              ].map((item, i) => (
                <div
                  key={item.label}
                  onClick={item.click}
                  style={{ padding: '10px 14px', textAlign: 'center', borderRight: i < 2 ? '1px solid var(--border)' : 'none', cursor: item.click ? 'pointer' : 'default', transition: 'background 0.12s' }}
                  onMouseEnter={e => { if (item.click) (e.currentTarget as HTMLDivElement).style.background = `${item.color}10`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: item.color, lineHeight: 1 }}>{item.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Top locations */}
            {topCities.length > 0 && (
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 8 }}>TOP LOCATIONS</div>
                {topCities.map(c => {
                  const maxC = topCities[0].count || 1;
                  const pct = Math.round(c.count / d.total * 100);
                  return (
                    <div key={c.name} onClick={() => go({ city: c.name })} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--text-1)', minWidth: 100, fontWeight: 500 }}>{c.name}</span>
                      <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: C.blue, width: `${(c.count / maxC) * 100}%`, borderRadius: 4, transition: 'width 0.6s ease' }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 40, textAlign: 'right' }}>{c.count} <span style={{ color: 'var(--border-mid)' }}>({pct}%)</span></span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Coding Attention Items ────────────────────────────────────────── */}
          <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 13 }}>
              <h3 style={{ fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500, margin: '0 0 2px' }}>
                Coding Attention Items
              </h3>
              <p style={{ fontSize: 10.5, color: 'var(--text-3)', margin: 0 }}>Items requiring analyst action — click to open filtered cases</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
              <QueueRow label="Stage coding not yet completed" count={d.missingStages} desc="Analyst-coded cases without stage records" color={C.purple} onClick={() => go({ coding_status: 'coded' })} />
              <QueueRow label="Movement present — mobility tab incomplete" count={d.movUncoded} desc="Movement flag coded but Mobility tab not filled" color={C.purple} onClick={() => go({ movement_present: 'yes' })} />
              <QueueRow label="Location phrase — no geocode" count={d.locationNeedsGeocode} desc="Has location text but coordinates missing" color={C.blue} onClick={() => go({ geocode_status: 'no' })} />
              <QueueRow label="Repeat suspect / vehicle indicator" count={d.repeatFlags} desc="Cross-case repeat flag requiring review" color={C.red} onClick={() => go({})} />
              <QueueRow label="Trafficking / exploitation concern" count={agg.vawg.flag_counts.trafficking_exploitation_concern} desc="Supplementary exploitation flag coded" color={C.coral} onClick={() => go({})} />
            </div>
          </div>
        </div>

        {/* ═══ RQ1 — STAGE VISIBILITY AND ENCOUNTER SEQUENCE ═══════════════════ */}
        <div className="card" style={{ padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontFamily: 'Lora, serif', fontSize: 16, fontWeight: 500, margin: '0 0 3px' }}>
                RQ1 — Stage Visibility and Encounter Sequence
              </h3>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0 }}>
                Behavioural stages across violent client–sex worker encounters. Analyst-confirmed stage sequences only.
              </p>
            </div>
            <button className="btn-ghost" onClick={() => navigate('/research')} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <ExternalLink size={10} /> Full Sequence Analysis
            </button>
          </div>

          {d.analystStaged === 0 ? (
            <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12, fontStyle: 'italic', background: 'var(--surface-2)', borderRadius: 7, border: '1px dashed var(--border)' }}>
              Stage sequence visualization will populate once analyst-staged coding is completed.
              <br /><span style={{ fontSize: 11, marginTop: 6, display: 'block' }}>Complete the Stages tab on coded reports to build observed encounter pathways.</span>
            </div>
          ) : (
            <>
            {d.analystStaged < 5 && (
              <div style={{ fontSize: 11, color: C.amber, padding: '6px 10px', background: `${C.amber}10`, border: `1px solid ${C.amber}30`, borderRadius: 5, marginBottom: 14 }}>
                Patterns reflect {d.analystStaged} analyst-coded case{d.analystStaged !== 1 ? 's' : ''} only — preliminary until coding coverage is sufficient.
                Not causal inference. Observed coded pathways only.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>

              {/* Left: Top pathway chains (main visual) */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 12 }}>OBSERVED STAGE SEQUENCES — ANALYST CODED CASES</div>
                {topSeqs.length === 0 ? (
                  <EmptyState message="Awaiting full sequence data." />
                ) : (
                  topSeqs.map((s, i) => <PathwayChain key={i} sequence={s.sequence} count={s.count} rank={i + 1} />)
                )}
                {bigrams.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 10 }}>COMMON STAGE TRANSITIONS</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {bigrams.map((b, i) => {
                        const parts = b.pattern.split(' → ');
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                            <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'Lora, serif', minWidth: 16 }}>{i + 1}.</span>
                            {parts.map((p, j) => (
                              <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                {j > 0 && <ArrowRight size={9} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
                                <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: (STAGE_COLORS[p] || C.slate) + '18', color: STAGE_COLORS[p] || C.slate, border: `1px solid ${(STAGE_COLORS[p] || C.slate)}30`, whiteSpace: 'nowrap' }}>
                                  {STAGE_LABELS[p] || formatLabel(p)}
                                </span>
                              </span>
                            ))}
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>{b.count}×</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Stage frequency + visibility */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 12 }}>STAGE FREQUENCY ACROSS ANALYST-STAGED REPORTS</div>
                {d.analystStaged === 0 ? (
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontStyle: 'italic' }}>No analyst-staged records yet — complete Stage Coding on coded cases.</div>
                ) : stageFreq.map(s => {
                  const lbl   = STAGE_LABELS[s.stage] || s.stage;
                  const col   = STAGE_COLORS[s.stage]  || C.slate;
                  const widPct = (s.count / maxStageFreq) * 100;
                  return (
                    <div key={s.stage} style={{ marginBottom: 9 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: col, flexShrink: 0 }} />
                          {lbl}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{s.count}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 10, background: 'var(--surface-3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 10, background: col, width: `${widPct}%`, transition: 'width 0.7s ease' }} />
                      </div>
                    </div>
                  );
                })}

                {agg.codability && (
                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 12 }}>STAGE VISIBILITY (CODABILITY)</div>
                    <ValDistPanel label="Initial contact visible"    vc={agg.codability.initial_contact_visible}    color={STAGE_COLORS.initial_contact}   total={d.coded} />
                    <ValDistPanel label="Negotiation visible"        vc={agg.codability.negotiation_visible}        color={STAGE_COLORS.negotiation}        total={d.coded} />
                    <ValDistPanel label="Movement visible"           vc={agg.codability.movement_visible}           color={STAGE_COLORS.movement_travel}    total={d.coded} />
                    <ValDistPanel label="Violence / coercion visible" vc={agg.codability.violence_coercion_visible} color={STAGE_COLORS.violence_coercion}  total={d.coded} />
                    <ValDistPanel label="Exit / aftermath visible"   vc={agg.codability.exit_aftermath_visible}     color={STAGE_COLORS.exit_escape}        total={d.coded} />
                  </div>
                )}
              </div>
            </div>

            {/* Initial Contact Stage Detail — sub-section within RQ1 */}
            {agg.codability && (
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>INITIAL CONTACT STAGE DETAIL</div>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.55 }}>
                  Breakdown of the initial contact stage where the report provides enough detail. These fields help describe how the encounter began but do not define a separate research question.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <div>
                    <ValDistPanel label="Approach method"       vc={agg.codability.approach_method as any}             color={C.blue}   total={d.coded} />
                    <ValDistPanel label="Approach setting"      vc={agg.codability.approach_setting as any}            color={C.amber}  total={d.coded} />
                    <ValDistPanel label="Mobility context"      vc={agg.codability.approach_mobility_context as any}   color={C.purple} total={d.coded} />
                  </div>
                  <div>
                    <ValDistPanel label="Visibility at contact"   vc={agg.codability.initial_contact_visibility as any}   color={C.blue}  total={d.coded} />
                    <ValDistPanel label="Guardianship at contact" vc={agg.codability.initial_contact_guardianship as any} color={C.green} total={d.coded} />
                  </div>
                  <div>
                    <ValDistPanel label="Client known at contact" vc={agg.codability.client_known_at_contact as any} color={C.slate} total={d.coded} />
                    <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 10, lineHeight: 1.6 }}>
                      Initial contact is coded as one stage in the encounter sequence. These fields support RQ1 by describing how the encounter began where the narrative makes this visible.
                    </p>
                  </div>
                </div>
              </div>
            )}
            </>
          )}
        </div>

        {/* ═══ RQ2 — BEHAVIOURAL AND SITUATIONAL CONDITIONS ════════════════════ */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel text="RQ2 — Behavioural and Situational Conditions" icon={<Shield size={11} />} />
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, marginTop: -4 }}>
            Situational and environmental conditions present across analyst-coded cases.
            Based on {d.coded} analyst-coded report{d.coded !== 1 ? 's' : ''}.{d.coded < 5 ? ' Treat as highly preliminary.' : ''}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

            {/* Harm and Behavioural Indicators */}
            <div className="card" style={{ padding: '15px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13 }}>
                <Shield size={13} style={{ color: C.coral }} />
                <span style={{ fontFamily: 'Lora, serif', fontSize: 13.5, fontWeight: 500 }}>Harm and Behavioural Indicators</span>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
                  <Badge label="CODED" variant="coded" />
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>analyst-confirmed findings</span>
                </div>
                {maxHarm <= 1 ? (
                  <EmptyState message="Awaiting analyst-coded harm data." />
                ) : (
                  <>
                    {stats.coercion.count > 0        && <CountBar label="Coercion"               count={stats.coercion.count}       max={d.coded} color={C.amber}  onClick={() => go({ coercion_present: 'yes' })} />}
                    {stats.physical_force.count > 0   && <CountBar label="Physical force"          count={stats.physical_force.count} max={d.coded} color={C.coral}  onClick={() => go({ physical_force: 'yes' })} />}
                    {stats.sexual_assault.count > 0   && <CountBar label="Sexual assault"           count={stats.sexual_assault.count} max={d.coded} color={C.red}    onClick={() => go({ sexual_assault: 'yes' })} />}
                    {stats.threats_present.count > 0  && <CountBar label="Threats / weapon"         count={stats.threats_present.count} max={d.coded} color="#B45309" onClick={() => go({ threats_present: 'yes' })} />}
                    {agg.encounter.indicator_counts.robbery_theft > 0       && <CountBar label="Robbery / theft"          count={agg.encounter.indicator_counts.robbery_theft}       max={d.coded} color={C.slate} onClick={() => go({ robbery_theft: 'yes' })} />}
                    {agg.encounter.indicator_counts.restraint_confinement > 0 && <CountBar label="Restraint / confinement"  count={agg.encounter.indicator_counts.restraint_confinement} max={d.coded} color={C.red} />}
                    {agg.encounter.indicator_counts.weapon_present_used > 0  && <CountBar label="Weapon present / used"    count={agg.encounter.indicator_counts.weapon_present_used}   max={d.coded} color={C.red} />}
                  </>
                )}
              </div>

            </div>

            {/* Location / Setting Context */}
            <div className="card" style={{ padding: '15px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <Globe size={13} style={{ color: C.amber }} />
                <span style={{ fontFamily: 'Lora, serif', fontSize: 13.5, fontWeight: 500 }}>Setting and Location Context</span>
                <Badge label="CODED" variant="coded" />
              </div>
              {stats.cities?.length ? stats.cities.slice(0, 6).map(c => (
                <div key={c.name} onClick={() => go({ city: c.name })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 6, cursor: 'pointer', padding: '2px 5px', borderRadius: 4 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <span style={{ color: 'var(--text-1)' }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 8 }}>{c.count}</span>
                </div>
              )) : <EmptyState message="No city data yet." />}
              {agg.environment.location_types.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.07em' }}>LOCATION TYPES</div>
                  {agg.environment.location_types.slice(0, 4).map(t => (
                    <CountBar key={t.type} label={t.type} count={t.count} max={Math.max(...agg.environment.location_types.map(x => x.count), 1)} color={C.amber} />
                  ))}
                </div>
              )}
              {agg.codability && (
                <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', marginBottom: 10, letterSpacing: '0.07em' }}>SITUATIONAL CONDITIONS (CODED)</div>
                  <ValDistPanel label="Primary setting type"  vc={agg.codability.primary_setting_type}   color={C.amber}  total={d.coded} />
                  <ValDistPanel label="Specific setting type" vc={agg.codability.specific_setting_type}  color={C.slate}  total={d.coded} />
                  <ValDistPanel label="Visibility"            vc={agg.codability.visibility_case}        color={C.blue}   total={d.coded} />
                  <ValDistPanel label="Isolation"             vc={agg.codability.isolation_case}         color={C.coral}  total={d.coded} />
                  <ValDistPanel label="Guardianship"          vc={agg.codability.guardianship_case}      color={C.green}  total={d.coded} />
                  <ValDistPanel label="Setting control"       vc={agg.codability.setting_control}        color={C.purple} total={d.coded} />
                  <ValDistPanel label="Access to help"        vc={agg.codability.access_to_help}         color={C.coral}  total={d.coded} />
                </div>
              )}
            </div>

            {/* Incident Type & Severity */}
            <div className="card" style={{ padding: '15px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <Target size={13} style={{ color: C.coral }} />
                <span style={{ fontFamily: 'Lora, serif', fontSize: 13.5, fontWeight: 500 }}>Incident Type and Severity</span>
              </div>
              {agg.encounter.incident_type_distribution.length === 0 ? (
                <EmptyState message="Awaiting encounter coding." />
              ) : (
                <>
                  {agg.encounter.incident_type_distribution.slice(0, 5).map(it => (
                    <CountBar key={it.value} label={it.value} count={it.count} max={Math.max(...agg.encounter.incident_type_distribution.map(x => x.count), 1)} color={C.coral} />
                  ))}
                  {agg.encounter.severity_distribution.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.07em' }}>SEVERITY</div>
                      {agg.encounter.severity_distribution.slice(0, 4).map(s => (
                        <CountBar key={s.value} label={s.value} count={s.count} max={Math.max(...agg.encounter.severity_distribution.map(x => x.count), 1)} color={s.value.toLowerCase().includes('severe') ? C.red : C.coral} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ═══ RQ3 — MOBILITY AND SPATIAL MOVEMENT ═════════════════════════════ */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel text="RQ3 — Mobility and Spatial Movement" icon={<Navigation size={11} />} />
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, marginTop: -4 }}>
            Movement patterns, mode of movement, and spatial control indicators across coded cases. Addresses how relocation alters victim vulnerability, isolation and offender control.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

            {/* Mobility Patterns */}
            <div className="card" style={{ padding: '15px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13 }}>
                <Navigation size={13} style={{ color: C.purple }} />
                <span style={{ fontFamily: 'Lora, serif', fontSize: 13.5, fontWeight: 500 }}>Movement and Relocation</span>
                <Badge label="CODED" variant="coded" />
              </div>
              {agg.data_quality.with_movement_coded === 0 ? (
                <EmptyState message="Awaiting mobility coding. Complete the Mobility tab on coded cases." />
              ) : (
                <>
                  {mob.movement_present    > 0 && <CountBar label="Movement present"         count={mob.movement_present}    max={mobMax} color={C.purple} onClick={() => go({ movement_present: 'yes' })} />}
                  {mob.entered_vehicle     > 0 && <CountBar label="Entered vehicle"           count={mob.entered_vehicle}     max={mobMax} color={C.blue}   onClick={() => go({ entered_vehicle: 'yes' })} />}
                  {mob.public_to_private   > 0 && <CountBar label="Public → private shift"   count={mob.public_to_private}   max={mobMax} color={C.coral}  onClick={() => go({ public_to_private_shift: 'yes' })} />}
                  {mob.public_to_secluded  > 0 && <CountBar label="Public → secluded"        count={mob.public_to_secluded}  max={mobMax} color={C.coral} />}
                  {mob.cross_neighbourhood > 0 && <CountBar label="Cross-neighbourhood"      count={mob.cross_neighbourhood} max={mobMax} color={C.amber} />}
                  {mob.cross_municipality  > 0 && <CountBar label="Cross-municipality"       count={mob.cross_municipality}  max={mobMax} color={C.amber} />}
                  {mob.offender_controlled_high > 0 && <CountBar label="Offender-controlled (high)" count={mob.offender_controlled_high} max={mobMax} color={C.red} />}
                </>
              )}
              {agg.mobility.mode_breakdown.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.07em' }}>MODE OF MOVEMENT</div>
                  {agg.mobility.mode_breakdown.slice(0, 4).map(m => (
                    <CountBar key={m.mode} label={m.mode} count={m.count} max={Math.max(...agg.mobility.mode_breakdown.map(x => x.count), 1)} color={C.purple} />
                  ))}
                </div>
              )}
              {agg.codability && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', marginBottom: 10, letterSpacing: '0.07em' }}>MOVEMENT PATTERNS (CODED)</div>
                  <ValDistPanel label="Movement pattern type" vc={agg.codability.movement_pattern_type} color={C.purple} total={d.coded} />
                  <ValDistPanel label="Movement timing"       vc={agg.codability.movement_timing}       color={C.amber}  total={d.coded} />
                </div>
              )}
            </div>

            {/* Suspect & Vehicle */}
            <div className="card" style={{ padding: '15px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13 }}>
                <Activity size={13} style={{ color: C.blue }} />
                <span style={{ fontFamily: 'Lora, serif', fontSize: 13.5, fontWeight: 500 }}>Suspect and Vehicle</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 13 }}>
                {[
                  { label: 'Vehicle present', value: stats.vehicle_present.count, color: C.blue, click: () => go({ vehicle_present: 'yes' }) },
                  { label: 'Repeat plates', value: stats.repeated_vehicles.length, color: C.red, click: undefined },
                ].map(item => (
                  <div key={item.label} onClick={item.click} style={{ background: 'var(--surface-2)', borderRadius: 5, padding: '9px 10px', textAlign: 'center', cursor: item.click ? 'pointer' : 'default', border: `1px solid ${item.color}22` }}>
                    <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: item.color, lineHeight: 1 }}>{item.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{item.label}</div>
                  </div>
                ))}
              </div>
              {stats.vehicle_colours && stats.vehicle_colours.length > 0 && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.07em' }}>VEHICLE COLOURS</div>
                  {stats.vehicle_colours.slice(0, 4).map(c => (
                    <CountBar key={c.colour} label={c.colour} count={c.count} max={Math.max(...stats.vehicle_colours!.map(x => x.count), 1)} color={C.blue} onClick={() => go({ search: c.colour })} />
                  ))}
                </>
              )}
              {stats.repeated_vehicles.length > 0 && (
                <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.red, marginBottom: 8, letterSpacing: '0.07em' }}>REPEAT PLATES</div>
                  {stats.repeated_vehicles.slice(0, 4).map(v => (
                    <div key={v.plate} onClick={() => go({ search: v.plate })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 5, cursor: 'pointer', padding: '3px 6px', borderRadius: 4 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                    >
                      <span style={{ fontFamily: 'monospace', color: C.red, fontWeight: 700, letterSpacing: '0.05em' }}>{v.plate}</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{v.count}×</span>
                    </div>
                  ))}
                </div>
              )}
              {stats.vehicle_colours?.length === 0 && stats.repeated_vehicles.length === 0 && stats.vehicle_present.count === 0 && (
                <EmptyState message="No vehicle data coded yet." />
              )}
            </div>

            {/* Supplementary Public Safety Flags */}
            <div className="card" style={{ padding: '15px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <AlertTriangle size={13} style={{ color: C.slate }} />
                <span style={{ fontFamily: 'Lora, serif', fontSize: 13.5, fontWeight: 500 }}>Supplementary Flags</span>
              </div>
              <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 10, lineHeight: 1.5 }}>
                These fields are supplementary to the research questions. They are not central to RQ1–RQ3 coding.
              </p>
              {agg.vawg.total === 0 ? (
                <EmptyState message="No supplementary flags coded yet." />
              ) : (
                <>
                  {agg.vawg.flag_counts.trafficking_exploitation_concern > 0  && <CountBar label="Trafficking / exploitation concern" count={agg.vawg.flag_counts.trafficking_exploitation_concern}  max={d.coded} color={C.slate} />}
                  {agg.vawg.flag_counts.repeat_targeting_concern > 0          && <CountBar label="Repeat targeting concern"           count={agg.vawg.flag_counts.repeat_targeting_concern}           max={d.coded} color={C.slate} onClick={() => go({})} />}
                  {agg.vawg.flag_counts.third_party_control_indicated > 0     && <CountBar label="Third-party control indicated"      count={agg.vawg.flag_counts.third_party_control_indicated}      max={d.coded} color={C.slate} />}
                  {agg.vawg.flag_counts.grooming_recruitment_concern > 0      && <CountBar label="Grooming / recruitment concern"     count={agg.vawg.flag_counts.grooming_recruitment_concern}       max={d.coded} color={C.slate} />}
                  {agg.vawg.flag_counts.public_safety_urgency_urgent_high > 0 && <CountBar label="Urgent / high urgency"             count={agg.vawg.flag_counts.public_safety_urgency_urgent_high}  max={d.coded} color={C.slate} onClick={() => navigate('/bulletin')} />}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ═══ CODABILITY / DATA QUALITY DISTRIBUTIONS ════════════════════════ */}
        {agg.codability && (
          <div style={{ marginBottom: 20 }}>
            <SectionLabel text="Codability and Data Quality" icon={<Database size={11} />} />
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, marginTop: -4 }}>
              Report-level assessments of how well each source narrative supports stage coding, sequence reconstruction, and spatial analysis.
              Populated from the Codability tab on coded cases. Missing info ≠ absence — use these distributions to characterise dataset limitations transparently.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

              <div className="card" style={{ padding: '15px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: C.blue, textTransform: 'uppercase', marginBottom: 12, borderBottom: `2px solid ${C.blue}22`, paddingBottom: 8 }}>
                  Narrative Quality
                </div>
                <ValDistPanel label="Narrative detail level"        vc={agg.codability.narrative_detail_level}      color={C.blue}   total={d.coded} />
                <ValDistPanel label="Sequence reconstructable"      vc={agg.codability.sequence_reconstructable}    color={C.green}  total={d.coded} />
                <ValDistPanel label="Main data limitation"          vc={agg.codability.main_data_limitation}        color={C.slate}  total={d.coded} />
              </div>

              <div className="card" style={{ padding: '15px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: C.purple, textTransform: 'uppercase', marginBottom: 12, borderBottom: `2px solid ${C.purple}22`, paddingBottom: 8 }}>
                  Coding Suitability
                </div>
                <ValDistPanel label="Stage coding suitability"      vc={agg.codability.stage_coding_suitability}    color={C.purple} total={d.coded} />
                <ValDistPanel label="Movement coding suitability"   vc={agg.codability.movement_coding_suitability} color={C.amber}  total={d.coded} />
                <ValDistPanel label="Location coding suitability"   vc={agg.codability.location_coding_suitability} color={C.teal}   total={d.coded} />
              </div>

              <div className="card" style={{ padding: '15px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: C.teal, textTransform: 'uppercase', marginBottom: 12, borderBottom: `2px solid ${C.teal}22`, paddingBottom: 8 }}>
                  Sequence Coverage
                </div>
                <ValDistPanel label="Sequence pattern"              vc={agg.codability.sequence_pattern}            color={C.indigo} total={d.coded} />
                <ValDistPanel label="Highest stage reached"         vc={agg.codability.highest_stage_reached}       color={C.coral}  total={d.coded} />
                <ValDistPanel label="Access to help"                vc={agg.codability.access_to_help}              color={C.green}  total={d.coded} />
              </div>

            </div>
          </div>
        )}

        {/* ═══ DATA QUALITY AND COVERAGE ════════════════════════════════════════ */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel text="Data Quality and Coverage" icon={<Database size={11} />} />
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, marginTop: -4 }}>
            Dataset coverage by coding stage. Identifies which cases are ready for each research question and which require further coding or geocoding.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

            <div className="card" style={{ padding: '15px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: C.blue, textTransform: 'uppercase', marginBottom: 12, borderBottom: `2px solid ${C.blue}22`, paddingBottom: 8 }}>
                Data Readiness
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <MetricCard label="Total Reports"  value={d.total}          color={C.blue}   icon={<Database size={11} />}    onClick={() => go({})} />
                <MetricCard label="Geocoded Reports" value={d.geocoded}       sub={`${d.geocodedPct}% of dataset`} color={C.amber} tag="spatial" icon={<MapPin size={11} />} onClick={() => go({ geocode_status: 'yes' })} />
                <MetricCard label="Analyst Coded"   value={d.coded}          sub={`${d.codingPct}% complete`}     color={C.green} tag="confirmed" icon={<CheckCircle size={11} />} onClick={() => go({ coding_status: 'coded' })} />
                <MetricCard label="Uncoded"         value={d.total - d.coded} sub="not yet reviewed"              color={C.slate} icon={<Clock size={11} />} onClick={() => go({ coding_status: 'uncoded' })} />
              </div>
            </div>

            <div className="card" style={{ padding: '15px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: C.purple, textTransform: 'uppercase', marginBottom: 12, borderBottom: `2px solid ${C.purple}22`, paddingBottom: 8 }}>
                Analytic Extraction
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <MetricCard label="Analyst Staged" value={d.analystStaged} sub={`of ${d.coded} analyst coded`} color={C.purple} icon={<GitBranch size={11} />}  onClick={() => navigate('/research')} />
                <MetricCard label="Movement-Coded" value={agg.data_quality.with_movement_coded} sub={`of ${d.coded} reviewed`} color={C.amber} icon={<Navigation size={11} />} onClick={() => go({ movement_present: 'yes' })} />
                <MetricCard label="Harm-Coded"     value={agg.data_quality.with_harm_coded}     sub={`of ${d.coded} reviewed`} color={C.coral} icon={<Shield size={11} />}    onClick={() => go({ coding_status: 'coded' })} />
                <MetricCard label="Vehicle Present" value={stats.vehicle_present.count} sub="cases with vehicle"       color={C.blue}  icon={<Activity size={11} />}  onClick={() => go({ vehicle_present: 'yes' })} />
              </div>
            </div>

            <div className="card" style={{ padding: '15px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: C.coral, textTransform: 'uppercase', marginBottom: 12, borderBottom: `2px solid ${C.coral}22`, paddingBottom: 8 }}>
                Coding Gaps
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <MetricCard label="Analyst Review Needed" value={d.missingStages + d.locationNeedsGeocode} sub="unreviewed fields" color={C.amber} icon={<Zap size={11} />} onClick={() => go({})} />
                <MetricCard label="Needs Geocode"        value={d.locationNeedsGeocode} sub="no coordinates"        color={C.slate} icon={<MapPin size={11} />}           onClick={() => go({ geocode_status: 'no' })} />
                <MetricCard label="Repeat Flags"         value={d.repeatFlags}          sub="suspect / vehicle"     color={C.red}   icon={<AlertTriangle size={11} />}    onClick={() => go({})} />
                <MetricCard label="Stage Coding Needed"  value={d.missingStages}        sub="coded, unstaged cases" color={C.purple} icon={<GitBranch size={11} />}       onClick={() => go({ coding_status: 'coded' })} />
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RESEARCH OUTPUTS ═════════════════════════════════════════════════ */}
        <div style={{ marginBottom: 22 }}>
          <SectionLabel text="Research Outputs" icon={<FileOutput size={11} />} />
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, marginTop: -4 }}>
            Exportable tables, cross-case analysis, and spatial outputs for dissertation analysis and methodology documentation.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            <OutputTile label="RQ1 Stage Sequences"       desc="Encounter pathways and stage transitions"    icon={<GitBranch size={14} />}   color={C.purple} onClick={() => navigate('/research')} />
            <OutputTile label="RQ3 Mobility Analysis"     desc="Movement types, control and relocation"      icon={<Navigation size={14} />}  color={C.amber}  onClick={() => navigate('/research')} />
            <OutputTile label="RQ2 Situational Context"   desc="Setting, location type and harm context"     icon={<Globe size={14} />}       color={C.blue}   onClick={() => navigate('/research')} />
            <OutputTile label="Case Comparison"           desc="Cross-case pattern and linkage review"       icon={<Link2 size={14} />}       color={C.indigo} onClick={() => navigate('/bulletin')} />
            <OutputTile label="GIS Workspace"             desc="Spatial mapping and geocoded locations"      icon={<MapPin size={14} />}      color={C.amber}  onClick={() => navigate('/map')} />
            <OutputTile label="Coded Case Overview"       desc="Cross-case harm and indicator summary"       icon={<Layers size={14} />}      color={C.coral}  onClick={() => navigate('/research')} />
            <OutputTile label="Export Coded Dataset"      desc="All coded cases as CSV"                      icon={<FileOutput size={14} />}  color={C.green}  onClick={() => api.exportCsv()} />
            <OutputTile label="Export Research Tables"    desc="Stage, mobility, environment exports"        icon={<FileOutput size={14} />}  color={C.teal}   onClick={() => api.exportResearchTables()} />
            <OutputTile label="Export Case Summaries"     desc="Per-case analytic summaries"                 icon={<TrendingUp size={14} />}  color={C.blue}   onClick={() => api.exportCaseSummaries()} />
            <OutputTile label="Codebook"                  desc="Field definitions, coding rules and examples" icon={<FileText size={14} />}   color={C.slate}  onClick={() => navigate('/codebook')} />
          </div>
        </div>

        {/* ═══ METHODOLOGICAL NOTE ══════════════════════════════════════════════ */}
        <div style={{ padding: '13px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', borderLeft: `3px solid ${C.slate}` }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 6 }}>METHODOLOGICAL NOTE</div>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.75 }}>
            All patterns and distributions shown here reflect analyst-coded and geocoded fields only. Outputs reflect analyst-coded fields only.
            Unreviewed imported or system-populated fields are not counted as coded findings until reviewed and confirmed by the analyst.
            Absence of a coded flag does not indicate absence in the original source report — it may indicate that the information was not present, not stated, or has not yet been coded.
            Sparse coding should be treated as preliminary. This tool supports human-led qualitative coding; all outputs are analytical observations, not legal, investigative or clinical findings.
          </p>
        </div>

      </div>
    </div>
  );
}
