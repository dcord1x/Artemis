import { useEffect, useState, useRef, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Polyline, StandaloneSearchBox } from '@react-google-maps/api';
import { api } from '../api';
import type { Stats, MapPoint } from '../types';
import { useNavigate } from 'react-router-dom';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
const LIBRARIES: ['places'] = ['places'];

type InfoWindowKey = { reportId: string; type: 'initial' | 'incident' | 'destination' };

function makeCircleIcon(color: string, scale: number): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 1.5,
    scale,
  };
}

function dashedLine(color: string, opacity: number): google.maps.PolylineOptions {
  return {
    strokeColor: color,
    strokeOpacity: 0,
    strokeWeight: 2,
    icons: [
      {
        icon: { path: 'M 0,-1 0,1', strokeOpacity: opacity, strokeWeight: 2, strokeColor: color, scale: 3 },
        offset: '0',
        repeat: '8px',
      },
    ],
  };
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
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const [stats, setStats] = useState<Stats | null>(null);
  const [showMovement, setShowMovement] = useState(true);
  const [filterCoercion, setFilterCoercion] = useState('');
  const [openWindow, setOpenWindow] = useState<InfoWindowKey | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const searchBoxRef = useRef<google.maps.places.SearchBox | null>(null);
  const navigate = useNavigate();

  useEffect(() => { api.getStats().then(setStats); }, []);

  const points = stats?.map_points ?? [];
  const filtered = filterCoercion ? points.filter((p) => p.coercion === filterCoercion) : points;
  const hasAny = points.some((p) => p.lat_initial || p.lat_incident);

  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  // Fit bounds whenever filtered points change
  useEffect(() => {
    if (!map || !isLoaded || filtered.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;
    filtered.forEach((p) => {
      if (p.lat_initial && p.lon_initial) { bounds.extend({ lat: p.lat_initial, lng: p.lon_initial }); hasCoords = true; }
      if (p.lat_incident && p.lon_incident) { bounds.extend({ lat: p.lat_incident, lng: p.lon_incident }); hasCoords = true; }
      if (p.lat_destination && p.lon_destination) { bounds.extend({ lat: p.lat_destination, lng: p.lon_destination }); hasCoords = true; }
    });
    if (hasCoords) map.fitBounds(bounds, 40);
  }, [map, filtered, isLoaded]);

  const openStreetView = (lat: number, lng: number) => {
    if (!map) return;
    const sv = map.getStreetView();
    sv.setPosition({ lat, lng });
    sv.setVisible(true);
  };

  const onPlacesChanged = () => {
    if (!searchBoxRef.current || !map) return;
    const places = searchBoxRef.current.getPlaces();
    if (!places || places.length === 0) return;
    const place = places[0];
    if (place.geometry?.viewport) {
      map.fitBounds(place.geometry.viewport);
    } else if (place.geometry?.location) {
      map.setCenter(place.geometry.location);
      map.setZoom(13);
    }
  };

  const renderInfoWindow = (p: MapPoint, lat: number, lon: number, label: string, showCoercion: boolean) => (
    <InfoWindow
      position={{ lat, lng: lon }}
      onCloseClick={() => setOpenWindow(null)}
    >
      <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, minWidth: 160 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.report_id}</div>
        {p.city && <div style={{ color: '#666', marginBottom: 2 }}>{p.city}</div>}
        <div style={{ color: '#999', fontSize: 11 }}>{label}</div>
        {showCoercion && p.coercion === 'yes' && (
          <div style={{ color: '#9B1D1D', fontWeight: 500, marginTop: 4 }}>⚠ Coercion reported</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 6, borderTop: '1px solid #e5e5e5', alignItems: 'center' }}>
          <button
            onClick={() => navigate(`/code/${p.report_id}`)}
            style={{ fontSize: 11, color: '#9B1D1D', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'DM Sans, sans-serif' }}
          >
            Open report
          </button>
          <span style={{ color: '#ddd' }}>|</span>
          <button
            onClick={() => { setOpenWindow(null); openStreetView(lat, lon); }}
            style={{ fontSize: 11, color: '#1a73e8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'DM Sans, sans-serif' }}
          >
            Street View
          </button>
        </div>
      </div>
    </InfoWindow>
  );

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading map…</span>
      </div>
    );
  }

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

        {/* Search box */}
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 5, display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <StandaloneSearchBox
            onLoad={(ref) => { searchBoxRef.current = ref; }}
            onPlacesChanged={onPlacesChanged}
          >
            <input
              placeholder="Search address or city…"
              style={{
                width: 280, padding: '7px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface)',
                fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                color: 'var(--text-1)', outline: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              }}
            />
          </StandaloneSearchBox>
        </div>

        <GoogleMap
          mapContainerStyle={{ height: '100%', width: '100%' }}
          center={{ lat: 43.65, lng: -79.38 }}
          zoom={12}
          onLoad={onMapLoad}
          onClick={() => setOpenWindow(null)}
          options={{
            streetViewControl: true,
            mapTypeControl: false,
            fullscreenControl: true,
            zoomControl: true,
          }}
        >
          {filtered.map((p) => (
            <div key={p.report_id}>
              {p.lat_initial && p.lon_initial && (
                <>
                  <Marker
                    position={{ lat: p.lat_initial, lng: p.lon_initial }}
                    icon={makeCircleIcon('#9B1D1D', 7)}
                    onClick={() => setOpenWindow({ reportId: p.report_id, type: 'initial' })}
                  />
                  {openWindow?.reportId === p.report_id && openWindow.type === 'initial' &&
                    renderInfoWindow(p, p.lat_initial, p.lon_initial, 'Initial contact', true)}
                </>
              )}

              {p.lat_incident && p.lon_incident && (
                <>
                  <Marker
                    position={{ lat: p.lat_incident, lng: p.lon_incident }}
                    icon={makeCircleIcon('#B45309', 7)}
                    onClick={() => setOpenWindow({ reportId: p.report_id, type: 'incident' })}
                  />
                  {openWindow?.reportId === p.report_id && openWindow.type === 'incident' &&
                    renderInfoWindow(p, p.lat_incident, p.lon_incident, 'Incident location', false)}
                </>
              )}

              {p.lat_destination && p.lon_destination && (
                <>
                  <Marker
                    position={{ lat: p.lat_destination, lng: p.lon_destination }}
                    icon={makeCircleIcon('#3730A3', 6)}
                    onClick={() => setOpenWindow({ reportId: p.report_id, type: 'destination' })}
                  />
                  {openWindow?.reportId === p.report_id && openWindow.type === 'destination' &&
                    renderInfoWindow(p, p.lat_destination, p.lon_destination, 'Destination', false)}
                </>
              )}

              {showMovement && p.movement === 'yes' && (
                <>
                  {p.lat_initial && p.lon_initial && p.lat_incident && p.lon_incident && (
                    <Polyline
                      path={[{ lat: p.lat_initial, lng: p.lon_initial }, { lat: p.lat_incident, lng: p.lon_incident }]}
                      options={dashedLine(p.coercion === 'yes' ? '#9B1D1D' : '#9A9188', 0.5)}
                    />
                  )}
                  {p.lat_incident && p.lon_incident && p.lat_destination && p.lon_destination && (
                    <Polyline
                      path={[{ lat: p.lat_incident, lng: p.lon_incident }, { lat: p.lat_destination, lng: p.lon_destination }]}
                      options={dashedLine('#3730A3', 0.4)}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </GoogleMap>
      </div>
    </div>
  );
}
