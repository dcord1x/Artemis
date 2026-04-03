import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Stats } from '../types';
import { Car, MapPin, AlertTriangle, TrendingUp, Shield, BarChart2, RefreshCw, User, Zap } from 'lucide-react';

function StatCard({ label, value, sub, icon, color = 'var(--text-1)', onClick }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode;
  color?: string; onClick?: () => void;
}) {
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        padding: '20px 24px',
        cursor: onClick ? 'pointer' : 'default',
        transition: onClick ? 'box-shadow 0.15s, transform 0.1s' : undefined,
      }}
      onMouseEnter={(e) => { if (onClick) { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 2px var(--accent)'; } }}
      onMouseLeave={(e) => { if (onClick) { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; } }}
      title={onClick ? 'Click to view matching cases' : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ color: onClick ? 'var(--accent)' : 'var(--border-mid)' }}>{icon}</span>
      </div>
      <div style={{ fontFamily: 'Lora, serif', fontSize: 32, fontWeight: 500, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{sub}</div>}
      {onClick && (
        <div style={{ fontSize: 10.5, color: 'var(--accent)', marginTop: 8, opacity: 0.7 }}>View cases →</div>
      )}
    </div>
  );
}

/** Stacked NLP bar: rank1 solid, rank2 lighter, background = total */
function NlpBar({
  label, rank1, rank2, total, rank1Color = 'var(--accent)', rank2Color,
  onClickRank1, onClickRank2,
}: {
  label: string; rank1: number; rank2: number; total: number;
  rank1Color?: string; rank2Color?: string;
  onClickRank1?: () => void; onClickRank2?: () => void;
}) {
  const r2c = rank2Color ?? rank1Color + '70';
  const r1pct = total > 0 ? (rank1 / total) * 100 : 0;
  const r2pct = total > 0 ? (rank2 / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span
          style={{ fontSize: 13, color: 'var(--text-2)', cursor: onClickRank1 ? 'pointer' : 'default' }}
          onClick={onClickRank1}
          title={onClickRank1 ? 'Click to view cases with strong NLP signal' : undefined}
        >
          {label}
        </span>
        <div style={{ display: 'flex', gap: 8, fontSize: 11.5 }}>
          <span
            style={{ color: rank1Color, fontWeight: 600, cursor: onClickRank1 ? 'pointer' : 'default', textDecoration: onClickRank1 ? 'underline dotted' : 'none' }}
            onClick={onClickRank1}
            title={onClickRank1 ? 'View strong-signal cases' : undefined}
          >
            {rank1} strong
          </span>
          {rank2 > 0 && (
            <span
              style={{ color: 'var(--text-3)', cursor: onClickRank2 ? 'pointer' : 'default', textDecoration: onClickRank2 ? 'underline dotted' : 'none' }}
              onClick={onClickRank2}
              title={onClickRank2 ? 'View strong + possible cases' : undefined}
            >
              +{rank2} possible
            </span>
          )}
        </div>
      </div>
      <div
        style={{ height: 8, borderRadius: 10, background: 'var(--surface-3)', overflow: 'hidden', display: 'flex', cursor: onClickRank1 ? 'pointer' : 'default' }}
        onClick={onClickRank1}
        title={onClickRank1 ? 'Click to view cases with strong NLP signal' : undefined}
      >
        <div style={{ height: '100%', background: rank1Color, width: `${r1pct}%`, transition: 'width 0.6s ease', borderRadius: '10px 0 0 10px' }} />
        <div style={{ height: '100%', background: r2c, width: `${r2pct}%`, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

/** Simple horizontal bar for count-based lists */
function CountBar({ label, count, max, color = 'var(--accent)', sub, onClick }: {
  label: string; count: number; max: number; color?: string; sub?: string; onClick?: () => void;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div
      style={{ marginBottom: 10, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      title={onClick ? `View ${count} cases — click to filter` : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'baseline' }}>
        <span style={{ fontSize: 12.5, color: onClick ? color : 'var(--text-2)', fontWeight: onClick ? 500 : 400 }}>
          {label}{sub && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>{sub}</span>}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{count}</span>
      </div>
      <div style={{ height: 5, borderRadius: 10, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 10, background: color, width: `${pct}%`, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

/** Thin year-over-year bar chart */
function YearChart({ data }: { data: { year: number; count: number }[] }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.count));
  const BAR_MAX_H = 60;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: BAR_MAX_H + 28, paddingTop: 8 }}>
      {data.map(({ year, count }) => {
        const h = max > 0 ? Math.max(4, Math.round((count / max) * BAR_MAX_H)) : 4;
        return (
          <div key={year} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <span style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>{count}</span>
            <div
              title={`${year}: ${count} reports`}
              style={{
                width: '100%', borderRadius: '3px 3px 0 0',
                height: h, background: 'var(--accent)', opacity: 0.85,
                transition: 'height 0.5s ease',
              }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{String(year).slice(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

const PATTERN_LABELS: Record<string, string> = {
  condom_refusal:         'Condom refusal',
  payment_dispute:        'Payment / money dispute',
  bait_and_switch:        'Bait-and-switch',
  rapid_escalation:       'Rapid escalation',
  weapon_present:         'Weapon present',
  multi_suspect:          'Multiple suspects',
  online_lure:            'Online / digital lure',
  drugging_intoxication:  'Drugging / intoxication',
  confinement:            'Confinement',
};

export default function Analysis() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.getStats().then((s) => { setStats(s); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 14 }}>
      Loading…
    </div>
  );
  if (!stats) return null;

  const { total, nlp_violence: nlp } = stats;
  const codingPct = total ? Math.round(stats.coded / total * 100) : 0;
  const totalVehApproach = (stats.approach_foot ?? 0) + (stats.approach_vehicle ?? 0);
  const footPct = totalVehApproach > 0 ? Math.round((stats.approach_foot / totalVehApproach) * 100) : 0;
  const vehPct  = totalVehApproach > 0 ? Math.round((stats.approach_vehicle / totalVehApproach) * 100) : 0;

  const maxColour = stats.vehicle_colours?.length ? Math.max(...stats.vehicle_colours.map(c => c.count)) : 1;
  const maxType   = stats.vehicle_types?.length   ? Math.max(...stats.vehicle_types.map(t => t.count))   : 1;
  const maxMake   = stats.vehicle_makes?.length   ? Math.max(...stats.vehicle_makes.map(m => m.count))   : 1;
  const maxPat    = stats.nlp_escalation_patterns?.length ? Math.max(...stats.nlp_escalation_patterns.map(p => p.count)) : 1;
  const vehCount  = stats.vehicle_present_count ?? stats.approach_vehicle ?? 0;

  const go = (qs: Record<string, string>) =>
    navigate('/cases?' + new URLSearchParams(qs).toString());

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ maxWidth: 1020, margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontFamily: 'Lora, serif', fontSize: 22, fontWeight: 500, margin: '0 0 4px', color: 'var(--text-1)' }}>
              Analysis
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
              Pattern summary across all reports · Click any card or bar to view filtered cases · NLP counts are pre-coding signals
            </p>
          </div>
          <button className="btn-ghost" onClick={load} disabled={loading} style={{ fontSize: 12.5, marginTop: 4 }} title="Refresh stats">
            <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard label="Total Reports" value={total} icon={<BarChart2 size={16} />} />
          <StatCard label="Coded" value={`${stats.coded} / ${total}`} sub={`${codingPct}% complete`} icon={<TrendingUp size={16} />} color="var(--green)" onClick={() => go({ coding_status: 'coded' })} />
          <StatCard label="NLP: Coercion" value={nlp?.coercion.rank1 ?? 0} sub={`+${nlp?.coercion.rank2 ?? 0} possible`} icon={<Shield size={16} />} color="var(--accent)" onClick={() => go({ nlp_coercion: '1' })} />
          <StatCard label="NLP: Physical" value={nlp?.physical.rank1 ?? 0} sub={`+${nlp?.physical.rank2 ?? 0} possible`} icon={<AlertTriangle size={16} />} color="#C2410C" onClick={() => go({ nlp_physical: '1' })} />
          <StatCard label="NLP: Sexual" value={nlp?.sexual.rank1 ?? 0} sub="strong signal" icon={<AlertTriangle size={16} />} color="#9F1239" onClick={() => go({ nlp_sexual: '1' })} />
          <StatCard label="NLP: Movement" value={nlp?.movement.rank1 ?? 0} sub={`+${nlp?.movement.rank2 ?? 0} possible`} icon={<MapPin size={16} />} color="var(--amber)" onClick={() => go({ nlp_movement: '1' })} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

          {/* NLP Violence Indicators */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={15} style={{ color: 'var(--accent)' }} />
                <span style={{ fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500 }}>NLP Violence Indicators</span>
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontStyle: 'italic' }}>click to view cases</span>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Solid = Rank 1 (strong) · Faded = Rank 2 (possible) · Click label or bar to drill down
            </p>
            <NlpBar label="Coercion / restraint"  rank1={nlp?.coercion.rank1 ?? 0}  rank2={nlp?.coercion.rank2 ?? 0}  total={total} rank1Color="var(--accent)" onClickRank1={() => go({ nlp_coercion: '1' })}   onClickRank2={() => go({ nlp_coercion: '2' })} />
            <NlpBar label="Physical force"         rank1={nlp?.physical.rank1 ?? 0}  rank2={nlp?.physical.rank2 ?? 0}  total={total} rank1Color="#C2410C"       onClickRank1={() => go({ nlp_physical: '1' })}   onClickRank2={() => go({ nlp_physical: '2' })} />
            <NlpBar label="Sexual assault"         rank1={nlp?.sexual.rank1 ?? 0}    rank2={nlp?.sexual.rank2 ?? 0}    total={total} rank1Color="#9F1239"        onClickRank1={() => go({ nlp_sexual: '1' })}     onClickRank2={() => go({ nlp_sexual: '2' })} />
            <NlpBar label="Movement / transport"   rank1={nlp?.movement.rank1 ?? 0}  rank2={nlp?.movement.rank2 ?? 0}  total={total} rank1Color="var(--amber)"   onClickRank1={() => go({ nlp_movement: '1' })}   onClickRank2={() => go({ nlp_movement: '2' })} />
            <NlpBar label="Weapon / threats"        rank1={nlp?.weapon.rank1 ?? 0}    rank2={nlp?.weapon.rank2 ?? 0}    total={total} rank1Color="#B45309"        onClickRank1={() => go({ nlp_weapon: '1' })}     onClickRank2={() => go({ nlp_weapon: '2' })} />

            {/* Coded violence */}
            {(stats.coercion.count > 0 || stats.physical_force.count > 0 || stats.sexual_assault.count > 0) && (
              <>
                <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0 12px', paddingTop: 12 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Researcher-coded</span>
                </div>
                {stats.coercion.count > 0 && <NlpBar label="Coercion" rank1={stats.coercion.count} rank2={0} total={total} rank1Color="var(--accent)" onClickRank1={() => go({ coercion_present: 'yes' })} />}
                {stats.physical_force.count > 0 && <NlpBar label="Physical force" rank1={stats.physical_force.count} rank2={0} total={total} rank1Color="#C2410C" onClickRank1={() => go({ physical_force: 'yes' })} />}
                {stats.sexual_assault.count > 0 && <NlpBar label="Sexual assault" rank1={stats.sexual_assault.count} rank2={0} total={total} rank1Color="#9F1239" onClickRank1={() => go({ sexual_assault: 'yes' })} />}
                {stats.movement.count > 0 && <NlpBar label="Movement" rank1={stats.movement.count} rank2={0} total={total} rank1Color="var(--amber)" onClickRank1={() => go({ movement_present: 'yes' })} />}
                {stats.threats_present?.count > 0 && <NlpBar label="Threats / weapon" rank1={stats.threats_present.count} rank2={0} total={total} rank1Color="#B45309" onClickRank1={() => go({ threats_present: 'yes' })} />}
              </>
            )}
          </div>

          {/* Reports by year */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <BarChart2 size={15} style={{ color: 'var(--blue)' }} />
              <span style={{ fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500 }}>Reports by Year</span>
            </div>
            {(!stats.year_breakdown || stats.year_breakdown.length === 0) ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '12px 0 0', fontStyle: 'italic' }}>No date data yet.</p>
            ) : (
              <YearChart data={stats.year_breakdown} />
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

          {/* Escalation scores */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={15} style={{ color: '#EA580C' }} />
                <span style={{ fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500 }}>Escalation Severity (NLP)</span>
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontStyle: 'italic' }}>click box to filter</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
              {[
                { label: 'Score 5', sub: 'sexual violence / robbery', count: nlp?.escalation.score5 ?? 0, color: '#7F1D1D', min: '5' },
                { label: 'Score 4', sub: 'threats / physical force',  count: (nlp?.escalation.score4 ?? 0) - (nlp?.escalation.score5 ?? 0), color: '#B91C1C', min: '4' },
                { label: 'Score 3', sub: 'pressure / manipulation',   count: (nlp?.escalation.score3 ?? 0) - (nlp?.escalation.score4 ?? 0), color: '#EA580C', min: '3' },
              ].map(({ label, sub, count, color, min }) => (
                <div
                  key={label}
                  onClick={() => count > 0 && go({ nlp_escalation_min: min })}
                  title={count > 0 ? `Click to view ${count} cases with escalation ≥ ${min}` : undefined}
                  style={{
                    textAlign: 'center', padding: '10px 6px', borderRadius: 7,
                    background: `${color}0f`, border: `1px solid ${color}30`,
                    cursor: count > 0 ? 'pointer' : 'default',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => { if (count > 0) (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 2px ${color}`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
                >
                  <div style={{ fontFamily: 'Lora, serif', fontSize: 22, fontWeight: 500, color }}>{count}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color, marginTop: 2 }}>{label}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
                  {count > 0 && <div style={{ fontSize: 9.5, color, opacity: 0.6, marginTop: 4 }}>view →</div>}
                </div>
              ))}
            </div>

            {/* Escalation patterns */}
            {stats.nlp_escalation_patterns?.length > 0 && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>Named patterns</div>
                {stats.nlp_escalation_patterns.map(({ pattern, count }) => (
                  <CountBar
                    key={pattern}
                    label={PATTERN_LABELS[pattern] ?? pattern}
                    count={count} max={maxPat} color="#EA580C"
                    onClick={() => go({ nlp_pattern: pattern })}
                  />
                ))}
              </>
            )}
          </div>

          {/* Approach type */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <User size={15} style={{ color: 'var(--amber)' }} />
              <span style={{ fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500 }}>Approach Type</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
              <div
                onClick={() => stats.approach_vehicle > 0 && go({ vehicle_present: 'yes' })}
                title={stats.approach_vehicle > 0 ? 'Click to view vehicle cases' : undefined}
                style={{
                  flex: 1, textAlign: 'center', padding: '14px 0', borderRadius: 8,
                  background: 'var(--surface-2)', cursor: stats.approach_vehicle > 0 ? 'pointer' : 'default',
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={(e) => { if (stats.approach_vehicle > 0) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 2px var(--blue)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
              >
                <div style={{ fontFamily: 'Lora, serif', fontSize: 26, fontWeight: 500, color: 'var(--blue)' }}>{stats.approach_vehicle ?? 0}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>By Vehicle · {vehPct}%</div>
                {stats.approach_vehicle > 0 && <div style={{ fontSize: 9.5, color: 'var(--blue)', opacity: 0.6, marginTop: 4 }}>view →</div>}
              </div>
              <div
                onClick={() => stats.approach_foot > 0 && go({ vehicle_present: 'no' })}
                title={stats.approach_foot > 0 ? 'Click to view on-foot cases' : undefined}
                style={{
                  flex: 1, textAlign: 'center', padding: '14px 0', borderRadius: 8,
                  background: 'var(--surface-2)', cursor: stats.approach_foot > 0 ? 'pointer' : 'default',
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={(e) => { if (stats.approach_foot > 0) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 2px var(--amber)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
              >
                <div style={{ fontFamily: 'Lora, serif', fontSize: 26, fontWeight: 500, color: 'var(--amber)' }}>{stats.approach_foot ?? 0}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>On Foot · {footPct}%</div>
                {stats.approach_foot > 0 && <div style={{ fontSize: 9.5, color: 'var(--amber)', opacity: 0.6, marginTop: 4 }}>view →</div>}
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 10, background: 'var(--surface-3)', overflow: 'hidden', display: 'flex' }}>
              <div style={{ height: '100%', background: 'var(--blue)', width: `${vehPct}%`, transition: 'width 0.6s ease' }} />
              <div style={{ height: '100%', background: 'var(--amber)', flex: 1 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-3)' }}>
              <span>Vehicle</span><span>Foot</span>
            </div>
          </div>
        </div>

        {/* Vehicle detail + neighbourhoods + cities */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>

          {/* Vehicle colours */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Car size={14} style={{ color: 'var(--blue)' }} />
              <span style={{ fontFamily: 'Lora, serif', fontSize: 14, fontWeight: 500 }}>Vehicle Colours</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px' }}>
              {stats.vehicle_colours?.reduce((s, c) => s + c.count, 0) ?? 0} of {vehCount} cases
            </p>
            {(!stats.vehicle_colours || stats.vehicle_colours.length === 0) ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>No colour data.</p>
            ) : stats.vehicle_colours.map((c) => (
              <CountBar key={c.colour} label={c.colour} count={c.count} max={maxColour} color="var(--blue)"
                onClick={() => go({ search: c.colour })} />
            ))}
          </div>

          {/* Vehicle types */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Car size={14} style={{ color: 'var(--text-3)' }} />
              <span style={{ fontFamily: 'Lora, serif', fontSize: 14, fontWeight: 500 }}>Vehicle Types</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px' }}>
              {stats.vehicle_types?.reduce((s, t) => s + t.count, 0) ?? 0} of {vehCount} cases
            </p>
            {(!stats.vehicle_types || stats.vehicle_types.length === 0) ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>No type data.</p>
            ) : stats.vehicle_types.map((t) => (
              <CountBar key={t.type} label={t.type} count={t.count} max={maxType} color="var(--amber)"
                onClick={() => go({ search: t.type })} />
            ))}
          </div>

          {/* Vehicle makes */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Car size={14} style={{ color: 'var(--text-3)' }} />
              <span style={{ fontFamily: 'Lora, serif', fontSize: 14, fontWeight: 500 }}>Vehicle Makes</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px' }}>
              {stats.vehicle_makes?.reduce((s, m) => s + m.count, 0) ?? 0} of {vehCount} cases identified
            </p>
            {stats.vehicle_makes.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>No make data.</p>
            ) : stats.vehicle_makes.slice(0, 8).map((v) => (
              <CountBar key={v.make} label={v.make} count={v.count} max={maxMake} color="var(--blue)"
                onClick={() => go({ search: v.make })} />
            ))}
          </div>

          {/* Repeat vehicles */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Car size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontFamily: 'Lora, serif', fontSize: 14, fontWeight: 500 }}>Repeat Plates</span>
            </div>
            {stats.repeated_vehicles.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>No repeated plates.</p>
            ) : stats.repeated_vehicles.map((v) => (
              <div
                key={v.plate}
                onClick={() => go({ search: v.plate })}
                title={`View cases with plate ${v.plate}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, cursor: 'pointer' }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 500, color: 'var(--accent)', letterSpacing: '0.05em' }}>{v.plate}</span>
                <span style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 20, background: 'var(--accent-pale)', color: 'var(--accent)', border: '1px solid var(--accent-border)', fontWeight: 500 }}>{v.count}×</span>
              </div>
            ))}
          </div>
        </div>

        {/* Neighbourhoods + cities + coding progress */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>

          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <MapPin size={14} style={{ color: 'var(--amber)' }} />
              <span style={{ fontFamily: 'Lora, serif', fontSize: 14, fontWeight: 500 }}>Neighbourhoods</span>
            </div>
            {stats.neighbourhoods.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>No data yet.</p>
            ) : stats.neighbourhoods.slice(0, 10).map((n) => (
              <div
                key={n.name}
                onClick={() => go({ search: n.name })}
                title={`View ${n.count} cases in ${n.name}`}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.color = 'var(--accent)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.color = ''; }}
              >
                <span style={{ color: 'var(--text-1)' }}>{n.name}</span>
                <span style={{ color: 'var(--text-3)' }}>{n.count}</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <MapPin size={14} style={{ color: 'var(--blue)' }} />
              <span style={{ fontFamily: 'Lora, serif', fontSize: 14, fontWeight: 500 }}>By City</span>
            </div>
            {(!stats.cities || stats.cities.length === 0) ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>No city data.</p>
            ) : stats.cities.slice(0, 12).map((c) => (
              <div
                key={c.name}
                onClick={() => go({ city: c.name })}
                title={`View ${c.count} cases in ${c.name}`}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.color = 'var(--accent)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.color = ''; }}
              >
                <span style={{ color: 'var(--text-1)' }}>{c.name}</span>
                <span style={{ color: 'var(--text-3)' }}>{c.count}</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <TrendingUp size={15} style={{ color: 'var(--green)' }} />
              <span style={{ fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500 }}>Coding Progress</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="var(--surface-3)" strokeWidth="9" />
                  <circle cx="40" cy="40" r="32" fill="none" stroke="var(--green)" strokeWidth="9"
                    strokeDasharray={`${2 * Math.PI * 32}`}
                    strokeDashoffset={`${2 * Math.PI * 32 * (1 - codingPct / 100)}`}
                    strokeLinecap="round" transform="rotate(-90 40 40)"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Lora, serif', fontSize: 16, fontWeight: 500, color: 'var(--text-1)' }}>
                  {codingPct}%
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 2 }}>
                <div style={{ cursor: 'pointer' }} onClick={() => go({ coding_status: 'coded' })}><strong style={{ color: 'var(--green)' }}>{stats.coded}</strong> coded</div>
                <div style={{ cursor: 'pointer' }} onClick={() => go({ coding_status: 'uncoded' })}><strong style={{ color: 'var(--text-1)' }}>{total - stats.coded}</strong> remaining</div>
                <div><strong style={{ color: 'var(--text-1)' }}>{total}</strong> total</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--border-mid)', padding: '24px 0 0', letterSpacing: '0.05em' }}>
          Human-led · Auditable · Privacy-conscious analysis of community-generated harm reports
        </div>
      </div>
    </div>
  );
}
