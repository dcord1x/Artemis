import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api';
import type { Stats, MapPoint } from '../types';
import { useNavigate } from 'react-router-dom';

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const coords = points.flatMap((p) => {
      const pts: [number, number][] = [];
      if (p.lat_initial && p.lon_initial) pts.push([p.lat_initial, p.lon_initial]);
      if (p.lat_incident && p.lon_incident) pts.push([p.lat_incident, p.lon_incident]);
      if (p.lat_destination && p.lon_destination) pts.push([p.lat_destination, p.lon_destination]);
      return pts;
    });
    if (coords.length > 0) map.fitBounds(coords, { padding: [40, 40] });
  }, [points, map]);
  return null;
}

function SearchControl() {
  const map = useMap();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data.length === 0) {
        setError('Location not found');
      } else {
        map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 13);
      }
    } catch {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, display: 'flex', gap: 6, alignItems: 'center',
    }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setError(''); }}
        onKeyDown={(e) => e.key === 'Enter' && search()}
        placeholder="Search address or city…"
        style={{
          width: 240, padding: '7px 12px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface)',
          fontSize: 13, fontFamily: 'DM Sans, sans-serif',
          color: 'var(--text-1)', outline: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}
      />
      <button
        onClick={search}
        disabled={loading}
        style={{
          padding: '7px 14px', borderRadius: 8, border: 'none',
          background: 'var(--accent)', color: '#fff', fontSize: 13,
          fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? '…' : 'Go'}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: '#9B1D1D', background: 'var(--surface)', padding: '4px 8px', borderRadius: 6 }}>
          {error}
        </span>
      )}
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {dashed ? (
        <div style={{ width: 18, height: 0, borderTop: `2px dashed ${color}` }} />
      ) : (
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
      )}
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
    </div>
  );
}

export default function MapView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [showMovement, setShowMovement] = useState(true);
  const [filterCoercion, setFilterCoercion] = useState('');
  const navigate = useNavigate();

  useEffect(() => { api.getStats().then(setStats); }, []);

  const points = stats?.map_points ?? [];
  const filtered = filterCoercion ? points.filter((p) => p.coercion === filterCoercion) : points;
  const hasAny = points.some((p) => p.lat_initial || p.lat_incident);

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* Sidebar */}
      <div style={{
        width: 220, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        padding: '20px 16px',
        gap: 20,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div>
          <h3 style={{
            fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500,
            margin: '0 0 16px', color: 'var(--text-1)',
          }}>
            Map Controls
          </h3>

          <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
            Filter by coercion
          </label>
          <select
            value={filterCoercion}
            onChange={(e) => setFilterCoercion(e.target.value)}
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg)',
              fontSize: 13, fontFamily: 'DM Sans, sans-serif',
              color: 'var(--text-1)', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">All cases</option>
            <option value="yes">Coercion: yes</option>
            <option value="no">Coercion: no</option>
          </select>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
          <input
            type="checkbox"
            checked={showMovement}
            onChange={(e) => setShowMovement(e.target.checked)}
            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
          />
          Show movement lines
        </label>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="section-label">Legend</span>
          <LegendItem color="#9B1D1D" label="Initial contact" />
          <LegendItem color="#B45309" label="Incident location" />
          <LegendItem color="#3730A3" label="Destination" />
          <LegendItem color="#9A9188" label="Movement line" dashed />
        </div>

        <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          {filtered.length} point{filtered.length !== 1 ? 's' : ''} shown
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        {!hasAny && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10,
            pointerEvents: 'none',
          }}>
            <div style={{
              textAlign: 'center', padding: 32,
              background: 'rgba(250,249,246,0.85)',
              backdropFilter: 'blur(2px)',
              borderRadius: 12,
              pointerEvents: 'none',
            }}>
              <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 8 }}>No geocoded locations yet.</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 300 }}>
                Add lat/lon coordinates in the GIS section of each report to see them plotted here.
              </p>
            </div>
          </div>
        )}

        <MapContainer
          center={[43.65, -79.38]}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
        >
          <SearchControl />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />

          {filtered.length > 0 && <FitBounds points={filtered} />}

          {filtered.map((p) => (
            <div key={p.report_id}>
              {p.lat_initial && p.lon_initial && (
                <CircleMarker
                  center={[p.lat_initial, p.lon_initial]}
                  radius={7}
                  pathOptions={{ color: '#fff', fillColor: '#9B1D1D', fillOpacity: 0.9, weight: 1.5 }}
                  eventHandlers={{ click: () => navigate(`/code/${p.report_id}`) }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.report_id}</div>
                      <div style={{ color: '#666' }}>{p.city}</div>
                      <div style={{ color: '#999', fontSize: 11 }}>Initial contact</div>
                      {p.coercion === 'yes' && <div style={{ color: '#9B1D1D', fontWeight: 500, marginTop: 4 }}>⚠ Coercion reported</div>}
                    </div>
                  </Popup>
                </CircleMarker>
              )}

              {p.lat_incident && p.lon_incident && (
                <CircleMarker
                  center={[p.lat_incident, p.lon_incident]}
                  radius={7}
                  pathOptions={{ color: '#fff', fillColor: '#B45309', fillOpacity: 0.9, weight: 1.5 }}
                  eventHandlers={{ click: () => navigate(`/code/${p.report_id}`) }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.report_id}</div>
                      <div style={{ color: '#666' }}>{p.city}</div>
                      <div style={{ color: '#999', fontSize: 11 }}>Incident location</div>
                    </div>
                  </Popup>
                </CircleMarker>
              )}

              {p.lat_destination && p.lon_destination && (
                <CircleMarker
                  center={[p.lat_destination, p.lon_destination]}
                  radius={6}
                  pathOptions={{ color: '#fff', fillColor: '#3730A3', fillOpacity: 0.85, weight: 1.5 }}
                  eventHandlers={{ click: () => navigate(`/code/${p.report_id}`) }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.report_id}</div>
                      <div style={{ color: '#999', fontSize: 11 }}>Destination</div>
                    </div>
                  </Popup>
                </CircleMarker>
              )}

              {showMovement && p.movement === 'yes' && (
                <>
                  {p.lat_initial && p.lon_initial && p.lat_incident && p.lon_incident && (
                    <Polyline
                      positions={[[p.lat_initial, p.lon_initial], [p.lat_incident, p.lon_incident]]}
                      pathOptions={{ color: p.coercion === 'yes' ? '#9B1D1D' : '#9A9188', weight: 1.5, opacity: 0.5, dashArray: '5 5' }}
                    />
                  )}
                  {p.lat_incident && p.lon_incident && p.lat_destination && p.lon_destination && (
                    <Polyline
                      positions={[[p.lat_incident, p.lon_incident], [p.lat_destination, p.lon_destination]]}
                      pathOptions={{ color: '#3730A3', weight: 1.5, opacity: 0.4, dashArray: '5 5' }}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
