import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Stats } from '../types';
import { Car, MapPin, AlertTriangle, TrendingUp, Shield, BarChart2, RefreshCw, User } from 'lucide-react';

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


export default function Analysis() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    api.getStats()
      .then((s) => { setStats(s); setLoading(false); })
      .catch(() => { setLoading(false); setLoadError('Could not load stats — is the backend running?'); });
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 14 }}>
      Loading…
    </div>
  );
  if (loadError) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 14, flexDirection: 'column', gap: 8 }}>
      <span>{loadError}</span>
      <button className="btn-ghost" onClick={load} style={{ fontSize: 12.5 }}>Retry</button>
    </div>
  );
  if (!stats) return null;

  const { total } = stats;
  const codingPct = total ? Math.round(stats.coded / total * 100) : 0;
  const totalVehApproach = (stats.approach_foot ?? 0) + (stats.approach_vehicle ?? 0);
  const footPct = totalVehApproach > 0 ? Math.round((stats.approach_foot / totalVehApproach) * 100) : 0;
  const vehPct  = totalVehApproach > 0 ? Math.round((stats.approach_vehicle / totalVehApproach) * 100) : 0;

  const maxColour = stats.vehicle_colours?.length ? Math.max(...stats.vehicle_colours.map(c => c.count)) : 1;
  const maxType   = stats.vehicle_types?.length   ? Math.max(...stats.vehicle_types.map(t => t.count))   : 1;
  const maxMake   = stats.vehicle_makes?.length   ? Math.max(...stats.vehicle_makes.map(m => m.count))   : 1;
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
          {stats.coercion.count > 0 && <StatCard label="Coercion" value={stats.coercion.count} sub={`${stats.coercion.pct}% of coded`} icon={<Shield size={16} />} color="var(--accent)" onClick={() => go({ coercion_present: 'yes' })} />}
          {stats.physical_force.count > 0 && <StatCard label="Physical force" value={stats.physical_force.count} sub={`${stats.physical_force.pct}% of coded`} icon={<AlertTriangle size={16} />} color="#C2410C" onClick={() => go({ physical_force: 'yes' })} />}
          {stats.sexual_assault.count > 0 && <StatCard label="Sexual assault" value={stats.sexual_assault.count} sub={`${stats.sexual_assault.pct}% of coded`} icon={<AlertTriangle size={16} />} color="#9F1239" onClick={() => go({ sexual_assault: 'yes' })} />}
          {stats.movement.count > 0 && <StatCard label="Movement" value={stats.movement.count} sub={`${stats.movement.pct}% of coded`} icon={<MapPin size={16} />} color="var(--amber)" onClick={() => go({ movement_present: 'yes' })} />}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

          {/* Coded violence indicators */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Shield size={15} style={{ color: 'var(--accent)' }} />
              <span style={{ fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500 }}>Coded Violence Indicators</span>
            </div>
            {(stats.coercion.count > 0 || stats.physical_force.count > 0 || stats.sexual_assault.count > 0 || stats.movement.count > 0 || stats.threats_present?.count > 0) ? (
              <>
                {stats.coercion.count > 0 && <CountBar label="Coercion" count={stats.coercion.count} max={total} color="var(--accent)" onClick={() => go({ coercion_present: 'yes' })} />}
                {stats.physical_force.count > 0 && <CountBar label="Physical force" count={stats.physical_force.count} max={total} color="#C2410C" onClick={() => go({ physical_force: 'yes' })} />}
                {stats.sexual_assault.count > 0 && <CountBar label="Sexual assault" count={stats.sexual_assault.count} max={total} color="#9F1239" onClick={() => go({ sexual_assault: 'yes' })} />}
                {stats.movement.count > 0 && <CountBar label="Movement" count={stats.movement.count} max={total} color="var(--amber)" onClick={() => go({ movement_present: 'yes' })} />}
                {stats.threats_present?.count > 0 && <CountBar label="Threats / weapon" count={stats.threats_present.count} max={total} color="#B45309" onClick={() => go({ threats_present: 'yes' })} />}
              </>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>No coded violence data yet.</p>
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
