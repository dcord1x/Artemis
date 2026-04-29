/**
 * BulletinOutput.tsx
 *
 * Analytic bulletin / report output module.
 * Generates a structured, printable analytic brief from coded case data.
 *
 * Sections:
 *   A. Overview Summary
 *   B. Geospatial Output
 *   C. Behavioural Patterns
 *   D. Situational Conditions
 *   E. Movement / Spatial Dynamics
 *   F. Case Linkage Indicators
 *   G. Analyst Notes
 *
 * Print: window.print() — CSS @media print hides the filter bar.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, RefreshCw, ArrowLeft } from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { api } from '../api';
import type { BulletinData, MapPoint } from '../types';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
const MAP_LIBRARIES: ['places'] = ['places'];

// ── Small shared helpers ──────────────────────────────────────────────────────

function BulletinSection({
  letter,
  title,
  children,
}: {
  letter: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bulletin-section" style={{
      marginBottom: 28, padding: '18px 22px',
      border: '1px solid var(--border)', borderRadius: 8,
      background: 'var(--surface)', pageBreakInside: 'avoid' as const,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <span style={{
          fontFamily: 'Lora, serif', fontSize: 11, fontWeight: 600,
          color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em',
          padding: '2px 7px', borderRadius: 4,
          border: '1px solid var(--accent)',
          background: 'var(--accent-pale)', flexShrink: 0,
        }}>
          {letter}
        </span>
        <h3 style={{ fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500, margin: 0, color: 'var(--text-1)' }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: 'var(--text-3)', minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-1)' }}>{value}</span>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>Not available</div>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 13, lineHeight: 1.7 }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

function NotAvailable() {
  return <span style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 12.5 }}>Not available</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BulletinOutput() {
  const navigate = useNavigate();

  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [status, setStatus]       = useState('');
  const [city, setCity]           = useState('');
  const [bulletinData, setBulletinData] = useState<BulletinData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [analystNotes, setAnalystNotes] = useState('');
  const [generated, setGenerated] = useState(false);

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES,
  });

  const generate = async () => {
    setLoading(true);
    setGenerated(false);
    try {
      const data = await api.getBulletinData({
        date_from: dateFrom || undefined,
        date_to:   dateTo   || undefined,
        status:    status   || undefined,
        city:      city     || undefined,
      });
      setBulletinData(data);
      setGenerated(true);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const printBulletin = () => {
    // CSS @media print cannot override inline style="" attributes.
    // Walk up the DOM from the scroll root and temporarily remove all
    // overflow/height inline constraints, then restore after printing.
    const saved: { el: HTMLElement; overflow: string; height: string }[] = [];

    const before = () => {
      let cur: HTMLElement | null = document.getElementById('bulletin-scroll-root');
      while (cur && cur.tagName !== 'HTML') {
        saved.push({ el: cur, overflow: cur.style.overflow, height: cur.style.height });
        cur.style.overflow = 'visible';
        cur.style.height = 'auto';
        cur = cur.parentElement as HTMLElement | null;
      }
    };

    const after = () => {
      saved.forEach(({ el, overflow, height }) => {
        el.style.overflow = overflow;
        el.style.height = height;
      });
      saved.length = 0;
      window.removeEventListener('afterprint', after);
    };

    window.addEventListener('afterprint', after);
    before();
    window.print();
    // afterprint fires when dialog closes; also restore inline in case afterprint
    // doesn't fire (Safari) by calling after() on a short delay as fallback
    setTimeout(after, 1000);
  };

  const fmt = (s: string | null | undefined) => s || '—';
  const pct = (n: number) => `${n}%`;

  // Compute map centre from points
  const mapPoints: MapPoint[] = bulletinData?.map_points ?? [];
  const geoPoints = mapPoints.filter(p => p.lat_incident || p.lat_initial);
  const avgLat = geoPoints.length > 0
    ? geoPoints.reduce((s, p) => s + (p.lat_incident ?? p.lat_initial ?? 0), 0) / geoPoints.length
    : 51.5;
  const avgLon = geoPoints.length > 0
    ? geoPoints.reduce((s, p) => s + (p.lon_incident ?? p.lon_initial ?? 0), 0) / geoPoints.length
    : -0.1;

  return (
    <div id="bulletin-scroll-root" style={{ height: '100%', overflow: 'auto', background: 'var(--bg)', padding: '24px' }}>
      {/* Print styles — must unset all overflow/height constraints so the full document prints */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          html, body { height: auto !important; overflow: visible !important; background: white !important; }
          main { height: auto !important; overflow: visible !important; }
          #bulletin-scroll-root { height: auto !important; overflow: visible !important; padding: 12px !important; }
          .bulletin-section { break-inside: avoid; page-break-inside: avoid; }
        }
        .print-only { display: none; }
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ── Page header (no-print) ── */}
        <div className="no-print" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button
              onClick={() => navigate('/research')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}
            >
              <ArrowLeft size={13} /> Research
            </button>
          </div>
          <h2 style={{ fontFamily: 'Lora, serif', fontSize: 22, fontWeight: 500, margin: '0 0 4px', color: 'var(--text-1)' }}>
            Analytic Summary Report
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
            Generate a structured analytic bulletin from coded case data. Filter by date, status, or city. Print or save as PDF.
          </p>
        </div>

        {/* ── Filter bar (no-print) ── */}
        <div className="no-print" style={{
          padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 8,
          background: 'var(--surface)', marginBottom: 20,
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date from</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '5px 8px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-1)' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date to</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '5px 8px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-1)' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</div>
            <select value={status} onChange={e => setStatus(e.target.value)}
              style={{ padding: '5px 8px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-1)' }}>
              <option value="">All</option>
              <option value="coded">Coded</option>
              <option value="reviewed">Reviewed</option>
              <option value="in_progress">In progress</option>
              <option value="uncoded">Uncoded</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>City</div>
            <input type="text" value={city} onChange={e => setCity(e.target.value)}
              placeholder="Filter by city…"
              style={{ padding: '5px 8px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-1)', width: 140 }} />
          </div>
          <button
            onClick={generate}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 5,
              border: '1px solid var(--accent)', background: 'var(--accent-pale)',
              color: 'var(--accent)', fontSize: 12.5, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Generating…' : 'Generate Report'}
          </button>
          {generated && bulletinData && (
            <button
              onClick={printBulletin}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 5,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer',
              }}
            >
              <Printer size={13} /> Print / Export PDF
            </button>
          )}
        </div>

        {/* ── Empty / loading states ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>
            Building report…
          </div>
        )}

        {!loading && !generated && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>
            Set filters above and click <strong>Generate Report</strong> to build the bulletin.
          </div>
        )}

        {!loading && generated && bulletinData && bulletinData.meta.case_count === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>
            No cases match the selected filters. Try adjusting the date range, status, or city.
          </div>
        )}

        {/* ── Bulletin content ── */}
        {!loading && generated && bulletinData && bulletinData.meta.case_count > 0 && (() => {
          const { overview, behavioral, conditions, movement, linkage } = bulletinData;

          return (
            <div>
              {/* Print header */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid var(--text-1)', paddingBottom: 8, marginBottom: 4 }}>
                  <h1 style={{ fontFamily: 'Lora, serif', fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--text-1)' }}>
                    Analytic Case Pattern Report
                  </h1>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    Generated {new Date().toLocaleDateString()}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  VIRGO Harm Report Coding System · Confidential · Research Use Only
                </div>
              </div>

              {/* A. Overview Summary */}
              <BulletinSection letter="A" title="Overview Summary">
                <Row label="Cases included" value={<strong>{overview.case_count}</strong>} />
                <Row label="Coded / reviewed" value={overview.coded_count ?? 'Not available'} />
                <Row label="Date range"
                  value={overview.date_earliest || overview.date_latest
                    ? `${fmt(overview.date_earliest)} — ${fmt(overview.date_latest)}`
                    : <NotAvailable />}
                />
                <Row label="Filter applied"
                  value={[
                    bulletinData.meta.date_from && `From: ${bulletinData.meta.date_from}`,
                    bulletinData.meta.date_to   && `To: ${bulletinData.meta.date_to}`,
                    bulletinData.meta.status    && `Status: ${bulletinData.meta.status}`,
                    bulletinData.meta.city      && `City: ${bulletinData.meta.city}`,
                  ].filter(Boolean).join(' · ') || 'None (all cases)'}
                />
                {overview.top_cities.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                      Top cities
                    </div>
                    <BulletList items={overview.top_cities.map(c => `${c.city} (${c.count} cases)`)} />
                  </div>
                )}
              </BulletinSection>

              {/* B. Geospatial Output */}
              <BulletinSection letter="B" title="Geospatial Output">
                {geoPoints.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
                    No geocoded cases in this selection. Add GIS coordinates to cases to include a map.
                  </div>
                ) : !GOOGLE_MAPS_API_KEY ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                    Map not available — Google Maps API key not configured.
                    <br />
                    {geoPoints.length} cases have geocoordinates.
                  </div>
                ) : !mapsLoaded ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>Loading map…</div>
                ) : (
                  <>
                    <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 10px' }}>
                      {geoPoints.length} geocoded location{geoPoints.length !== 1 ? 's' : ''}.
                      Blue = initial contact · Red = incident · Green = destination.
                    </p>
                    <GoogleMap
                      mapContainerStyle={{ width: '100%', height: 320, borderRadius: 6, border: '1px solid var(--border)' }}
                      center={{ lat: avgLat, lng: avgLon }}
                      zoom={11}
                      options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, zoomControl: false }}
                    >
                      {mapPoints.map(p => (
                        <div key={p.report_id}>
                          {p.lat_initial && p.lon_initial && (
                            <Marker
                              position={{ lat: p.lat_initial, lng: p.lon_initial }}
                              title={`${p.report_id} — Initial contact`}
                              icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: '#3b82f6', fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 1.5, scale: 5 }}
                            />
                          )}
                          {p.lat_incident && p.lon_incident && (
                            <Marker
                              position={{ lat: p.lat_incident, lng: p.lon_incident }}
                              title={`${p.report_id} — Incident`}
                              icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: '#ef4444', fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 1.5, scale: 5 }}
                            />
                          )}
                          {p.lat_destination && p.lon_destination && (
                            <Marker
                              position={{ lat: p.lat_destination, lng: p.lon_destination }}
                              title={`${p.report_id} — Destination`}
                              icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: '#10b981', fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 1.5, scale: 4 }}
                            />
                          )}
                        </div>
                      ))}
                    </GoogleMap>
                  </>
                )}
              </BulletinSection>

              {/* C. Behavioural Patterns */}
              <BulletinSection letter="C" title="Behavioural Patterns">
                {behavioral.top_sequences?.length > 0 ? (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                      Most common stage sequences
                    </div>
                    <BulletList items={behavioral.top_sequences.map(s => `${s.sequence} (${s.count} cases)`)} />
                  </>
                ) : <NotAvailable />}

                {behavioral.escalation_points?.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                      Escalation points
                    </div>
                    <BulletList items={behavioral.escalation_points.map(([ep, count]) => `${ep}: ${count} cases`)} />
                  </div>
                )}

                {behavioral.top_transitions?.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                      Most common stage transitions
                    </div>
                    <BulletList items={behavioral.top_transitions.map(t => `${t.pattern} (${t.count})`)} />
                  </div>
                )}
              </BulletinSection>

              {/* D. Situational Conditions */}
              <BulletinSection letter="D" title="Situational Conditions">
                {/* Legacy report-level environment fields */}
                {Object.keys(conditions.indoor_outdoor || {}).length > 0 && (
                  <>
                    <ConditionTable label="Indoor / Outdoor" data={conditions.indoor_outdoor} total={overview.case_count} />
                    <ConditionTable label="Public / Private" data={conditions.public_private} total={overview.case_count} style={{ marginTop: 12 }} />
                    <ConditionTable label="Deserted context" data={conditions.deserted} total={overview.case_count} style={{ marginTop: 12 }} />
                  </>
                )}

                {/* Stage-level situational conditions */}
                {conditions.total_stages_coded > 0 ? (
                  <div style={{ marginTop: Object.keys(conditions.indoor_outdoor || {}).length > 0 ? 18 : 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                      Stage-Level Situational Conditions ({conditions.total_stages_coded} stages coded)
                    </div>
                    <ConditionTable label="Visibility" data={conditions.visibility} total={conditions.total_stages_coded} />
                    <ConditionTable label="Guardianship" data={conditions.guardianship} total={conditions.total_stages_coded} style={{ marginTop: 10 }} />
                    <ConditionTable label="Isolation level" data={conditions.isolation_level} total={conditions.total_stages_coded} style={{ marginTop: 10 }} />
                    <ConditionTable label="Space / movement control" data={conditions.control_type} total={conditions.total_stages_coded} style={{ marginTop: 10 }} />

                    {/* By-stage breakdown table */}
                    {Object.keys(conditions.situational_by_stage || {}).length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                          Dominant conditions by stage type
                        </div>
                        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11.5 }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                              {['Stage', 'Visibility', 'Guardianship', 'Isolation', 'Control'].map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(conditions.situational_by_stage).map(([stype, row]: [string, any]) => (
                              <tr key={stype} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '5px 8px', fontWeight: 600, color: 'var(--text-1)', fontSize: 11.5 }}>
                                  {stype.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                </td>
                                {(['visibility','guardianship','isolation_level','control_type'] as const).map(f => (
                                  <td key={f} style={{ padding: '5px 8px', color: 'var(--text-2)', fontSize: 11.5 }}>
                                    {row[f] ? `${(row[f] as string).replace(/_/g, ' ')} (${row[f + '_count']})` : '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  Object.keys(conditions.indoor_outdoor || {}).length === 0 && <NotAvailable />
                )}
              </BulletinSection>

              {/* E. Movement / Spatial Dynamics */}
              <BulletinSection letter="E" title="Movement / Spatial Dynamics">
                <Row label="Cases with movement" value={`${pct(movement.pct_movement)} of cases`} />
                <Row label="Entered vehicle" value={`${pct(movement.pct_entered_vehicle)} of cases`} />
                <Row label="Public → private shift" value={`${pct(movement.pct_public_to_private)} of cases`} />

                {movement.top_transitions?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                      Common location transitions
                    </div>
                    <BulletList items={movement.top_transitions.map(t => `${t.route} (${t.count})`)} />
                  </div>
                )}

                {movement.common_pathways?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                      Recurring mobility pathways
                    </div>
                    <BulletList items={movement.common_pathways.map(p => `${p.pathway} (${p.count})`)} />
                  </div>
                )}
              </BulletinSection>

              {/* F. Case Linkage Indicators */}
              <BulletinSection letter="F" title="Case Linkage Indicators">
                <div style={{
                  fontSize: 11.5, color: 'var(--amber)', padding: '6px 10px',
                  background: 'var(--surface-2)', borderRadius: 5, border: '1px solid var(--border)',
                  marginBottom: 14,
                }}>
                  {linkage.note}
                </div>

                {linkage.repeated_plates?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                      Repeated plate descriptors
                    </div>
                    <BulletList items={linkage.repeated_plates.map(v => `${v.descriptor} — ${v.count} cases`)} />
                  </div>
                )}

                {linkage.repeated_vehicles?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                      Repeated vehicle descriptions (make/colour)
                    </div>
                    <BulletList items={linkage.repeated_vehicles.map(v => `${v.descriptor} — ${v.count} cases`)} />
                  </div>
                )}

                {linkage.repeated_locations?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                      Repeated locations
                    </div>
                    <BulletList items={linkage.repeated_locations.map(l => `${l.descriptor} — ${l.count} cases`)} />
                  </div>
                )}

                {!linkage.repeated_plates?.length && !linkage.repeated_vehicles?.length && !linkage.repeated_locations?.length && (
                  <NotAvailable />
                )}
              </BulletinSection>

              {/* G. Analyst Notes */}
              <BulletinSection letter="G" title="Analyst Notes">
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px', fontStyle: 'italic' }} className="no-print">
                  Add interpretation, caveats, or context before printing.
                </p>
                <textarea
                  className="no-print"
                  value={analystNotes}
                  onChange={e => setAnalystNotes(e.target.value)}
                  placeholder="Enter analyst interpretation here…"
                  rows={5}
                  style={{
                    width: '100%', fontSize: 13, padding: '10px 12px',
                    border: '1px solid var(--border)', borderRadius: 5,
                    background: 'var(--bg)', color: 'var(--text-1)',
                    resize: 'vertical', fontFamily: 'DM Sans, sans-serif',
                    boxSizing: 'border-box',
                  }}
                />
                {analystNotes ? (
                  <div className="print-only" style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {analystNotes}
                  </div>
                ) : (
                  <div className="print-only" style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
                    No analyst notes provided.
                  </div>
                )}
              </BulletinSection>

              <div style={{ paddingBottom: 32 }} />
            </div>
          );
        })()}

      </div>
    </div>
  );
}

// ── ConditionTable helper ─────────────────────────────────────────────────────

function ConditionTable({ label, data, total, style }: {
  label: string;
  data: Record<string, number>;
  total: number;
  style?: React.CSSProperties;
}) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div style={style}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {entries.map(([val, count]) => (
          <span key={val} style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {val.replace(/_/g, ' ')}: <strong style={{ color: 'var(--text-1)' }}>{count}</strong>
            {total > 0 && <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}> ({Math.round(count / total * 100)}%)</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
