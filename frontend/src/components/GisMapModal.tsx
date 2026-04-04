import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Report } from '../types';

interface GisMapModalProps {
  fields: Partial<Report>;
  onClose: () => void;
}

const POINT_CONFIG = [
  {
    heading: 'INITIAL CONTACT POINT',
    latKey: 'lat_initial' as keyof Report,
    lonKey: 'lon_initial' as keyof Report,
    rawKey: 'initial_contact_address_raw' as keyof Report,
    normKey: 'initial_contact_address_normalized' as keyof Report,
    precKey: 'initial_contact_precision' as keyof Report,
    srcKey: 'initial_contact_source' as keyof Report,
    confKey: 'initial_contact_confidence' as keyof Report,
    notesKey: 'initial_contact_analyst_notes' as keyof Report,
    color: '#9B1D1D',
  },
  {
    heading: 'INCIDENT POINT',
    latKey: 'lat_incident' as keyof Report,
    lonKey: 'lon_incident' as keyof Report,
    rawKey: 'incident_address_raw' as keyof Report,
    normKey: 'incident_address_normalized' as keyof Report,
    precKey: 'incident_precision' as keyof Report,
    srcKey: 'incident_source' as keyof Report,
    confKey: 'incident_confidence' as keyof Report,
    notesKey: 'incident_analyst_notes' as keyof Report,
    color: '#B45309',
  },
  {
    heading: 'DESTINATION POINT',
    latKey: 'lat_destination' as keyof Report,
    lonKey: 'lon_destination' as keyof Report,
    rawKey: 'destination_address_raw' as keyof Report,
    normKey: 'destination_address_normalized' as keyof Report,
    precKey: 'destination_precision' as keyof Report,
    srcKey: 'destination_source' as keyof Report,
    confKey: 'destination_confidence' as keyof Report,
    notesKey: 'destination_analyst_notes' as keyof Report,
    color: '#3730A3',
  },
];

function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length === 1) {
      map.setView(coords[0], 13);
    } else if (coords.length > 1) {
      map.fitBounds(coords, { padding: [50, 50] });
    }
  }, [coords, map]);
  return null;
}

function HoverMarker({
  lat,
  lon,
  color,
  heading,
  fields,
  pointConfig,
}: {
  lat: number;
  lon: number;
  color: string;
  heading: string;
  fields: Partial<Report>;
  pointConfig: (typeof POINT_CONFIG)[number];
}) {
  const markerRef = useRef<L.CircleMarker | null>(null);

  const raw = fields[pointConfig.rawKey] as string | undefined;
  const norm = fields[pointConfig.normKey] as string | undefined;
  const prec = fields[pointConfig.precKey] as string | undefined;
  const src = fields[pointConfig.srcKey] as string | undefined;
  const conf = fields[pointConfig.confKey] as string | undefined;
  const notes = fields[pointConfig.notesKey] as string | undefined;

  const popupContent = `
    <div style="font-family: DM Sans, sans-serif; min-width: 220px; max-width: 280px;">
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: ${color}; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e5e5e5;">
        ${heading}
      </div>
      ${raw ? `<div style="margin-bottom: 5px;"><span style="font-size: 10px; color: #888; display: block;">Raw address</span><span style="font-size: 12px; color: #222;">${raw}</span></div>` : ''}
      ${norm ? `<div style="margin-bottom: 5px;"><span style="font-size: 10px; color: #888; display: block;">Normalized address</span><span style="font-size: 12px; color: #222;">${norm}</span></div>` : ''}
      ${prec || src || conf ? `
        <div style="display: flex; gap: 12px; margin-bottom: 5px; flex-wrap: wrap;">
          ${prec ? `<div><span style="font-size: 10px; color: #888; display: block;">Precision</span><span style="font-size: 12px; color: #222;">${prec}</span></div>` : ''}
          ${src ? `<div><span style="font-size: 10px; color: #888; display: block;">Source</span><span style="font-size: 12px; color: #222;">${src}</span></div>` : ''}
          ${conf ? `<div><span style="font-size: 10px; color: #888; display: block;">Confidence</span><span style="font-size: 12px; color: #222;">${conf}</span></div>` : ''}
        </div>` : ''}
      ${notes ? `<div style="margin-bottom: 5px;"><span style="font-size: 10px; color: #888; display: block;">Analyst notes</span><span style="font-size: 12px; color: #222; font-style: italic;">${notes}</span></div>` : ''}
      <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e5e5; display: flex; gap: 16px;">
        <div><span style="font-size: 10px; color: #888; display: block;">Lat</span><span style="font-size: 11px; color: #444; font-family: monospace;">${lat.toFixed(6)}</span></div>
        <div><span style="font-size: 10px; color: #888; display: block;">Lon</span><span style="font-size: 11px; color: #444; font-family: monospace;">${lon.toFixed(6)}</span></div>
      </div>
    </div>
  `;

  return (
    <CircleMarker
      ref={markerRef}
      center={[lat, lon]}
      radius={9}
      pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 2 }}
      eventHandlers={{
        mouseover: (e) => {
          e.target.openPopup();
        },
        mouseout: (e) => {
          e.target.closePopup();
        },
      }}
    >
      {/* Leaflet popup via bindPopup after mount */}
      <_BindPopup content={popupContent} markerRef={markerRef} />
    </CircleMarker>
  );
}

function _BindPopup({
  content,
  markerRef,
}: {
  content: string;
  markerRef: React.RefObject<L.CircleMarker | null>;
}) {
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.bindPopup(content, { closeButton: false, autoPan: false });
    }
  }, [content, markerRef]);
  return null;
}

export default function GisMapModal({ fields, onClose }: GisMapModalProps) {
  const validPoints = POINT_CONFIG.filter((p) => {
    const lat = fields[p.latKey] as number | null | undefined;
    const lon = fields[p.lonKey] as number | null | undefined;
    return lat != null && lon != null && lat !== 0 && lon !== 0;
  });

  const coords: [number, number][] = validPoints.map((p) => [
    fields[p.latKey] as number,
    fields[p.lonKey] as number,
  ]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '82vw', height: '76vh',
          background: 'var(--surface)',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            GIS — Location Map
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {POINT_CONFIG.map((p) => (
                <div key={p.heading} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: p.color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    {p.heading.split(' ').slice(0, 2).join(' ')}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 18, color: 'var(--text-3)', lineHeight: 1,
                padding: '2px 6px', borderRadius: 4,
              }}
              aria-label="Close map"
            >
              ×
            </button>
          </div>
        </div>

        {/* Map body */}
        <div style={{ flex: 1, position: 'relative' }}>
          {validPoints.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--text-3)', fontSize: 13,
            }}>
              No coordinates entered yet — fill in lat/lon fields to see points on the map.
            </div>
          ) : (
            <MapContainer
              center={coords[0] ?? [20, 0]}
              zoom={5}
              style={{ width: '100%', height: '100%' }}
              zoomControl={true}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
              />
              <FitBounds coords={coords} />
              {validPoints.map((p) => (
                <HoverMarker
                  key={p.heading}
                  lat={fields[p.latKey] as number}
                  lon={fields[p.lonKey] as number}
                  color={p.color}
                  heading={p.heading}
                  fields={fields}
                  pointConfig={p}
                />
              ))}
            </MapContainer>
          )}
        </div>
      </div>
    </div>
  );
}
