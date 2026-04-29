import React, { useEffect, useState, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete } from '@react-google-maps/api';
import type { Report } from '../types';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
const LIBRARIES: ['places', 'visualization', 'drawing', 'geometry'] =
  ['places', 'visualization', 'drawing', 'geometry'];

type PlaceMode = 'initial' | 'incident' | 'destination' | null;

interface GisMapModalProps {
  fields: Partial<Report>;
  onClose: () => void;
  onGeocode?: (updates: Partial<Report>) => void;
}

const POINT_CONFIG = [
  {
    heading: 'INITIAL CONTACT POINT',
    mode: 'initial' as const,
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
    mode: 'incident' as const,
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
    mode: 'destination' as const,
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

const PLACE_LABEL: Record<NonNullable<PlaceMode>, string> = {
  initial: 'Initial Contact',
  incident: 'Incident',
  destination: 'Destination',
};

function makeCircleIcon(color: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 0.85,
    strokeColor: color,
    strokeWeight: 2,
    scale: 9,
  };
}

export default function GisMapModal({ fields, onClose, onGeocode }: GisMapModalProps) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [openHeading, setOpenHeading] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState<PlaceMode>(null);
  const [geocoding, setGeocoding] = useState(false);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const hasFitRef = useRef(false);

  const validPoints = POINT_CONFIG.filter((p) => {
    const lat = fields[p.latKey] as number | null | undefined;
    const lon = fields[p.lonKey] as number | null | undefined;
    return lat != null && lon != null && lat !== 0 && lon !== 0;
  });

  const coords = validPoints.map((p) => ({
    lat: fields[p.latKey] as number,
    lng: fields[p.lonKey] as number,
  }));

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (placeMode) { setPlaceMode(null); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, placeMode]);

  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    geocoderRef.current = new google.maps.Geocoder();
  }, []);

  // Fit bounds exactly once on initial load — never re-snap after that
  useEffect(() => {
    if (!map || !isLoaded || coords.length === 0 || hasFitRef.current) return;
    if (coords.length === 1) {
      map.setCenter(coords[0]);
      map.setZoom(14);
    } else {
      const bounds = new google.maps.LatLngBounds();
      coords.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, 50);
    }
    hasFitRef.current = true;
  }, [map, isLoaded, coords.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPlaceChanged = () => {
    if (!autocompleteRef.current || !map) return;
    const place = autocompleteRef.current.getPlace();
    if (place.geometry?.viewport) {
      map.fitBounds(place.geometry.viewport);
    } else if (place.geometry?.location) {
      map.setCenter(place.geometry.location);
      map.setZoom(15);
    }
  };

  const openStreetView = (lat: number, lng: number) => {
    if (!map) return;
    const sv = map.getStreetView();
    sv.setPosition({ lat, lng });
    sv.setVisible(true);
  };

  // Click-to-place handler
  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!placeMode || !e.latLng || !onGeocode || !geocoderRef.current) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    const cfg = POINT_CONFIG.find((p) => p.mode === placeMode)!;

    setGeocoding(true);
    geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
      setGeocoding(false);
      const address = status === google.maps.GeocoderStatus.OK && results?.[0]
        ? results[0].formatted_address
        : '';
      onGeocode({
        [cfg.latKey]: lat,
        [cfg.lonKey]: lng,
        ...(address ? { [cfg.normKey]: address } : {}),
      } as Partial<Report>);
      setPlaceMode(null);
    });
  }, [placeMode, onGeocode]);

  // Geocode an existing address string → lat/lon
  const geocodeAddress = (cfg: typeof POINT_CONFIG[0]) => {
    const address = fields[cfg.normKey] as string | undefined;
    if (!address || !onGeocode || !geocoderRef.current) return;
    setGeocoding(true);
    geocoderRef.current.geocode({ address }, (results, status) => {
      setGeocoding(false);
      if (status === google.maps.GeocoderStatus.OK && results?.[0]?.geometry?.location) {
        const loc = results[0].geometry.location;
        onGeocode({
          [cfg.latKey]: loc.lat(),
          [cfg.lonKey]: loc.lng(),
        } as Partial<Report>);
      } else {
        alert('Could not geocode that address.');
      }
    });
  };

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
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
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

        {/* Geocoding toolbar — only shown when onGeocode is provided */}
        {onGeocode && isLoaded && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginRight: 4 }}>
              Click map to set:
            </span>
            {POINT_CONFIG.map((cfg) => (
              <button
                key={cfg.mode}
                onClick={() => setPlaceMode(placeMode === cfg.mode ? null : cfg.mode)}
                style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  border: `1.5px solid ${placeMode === cfg.mode ? cfg.color : 'var(--border)'}`,
                  background: placeMode === cfg.mode ? cfg.color : 'var(--surface-2)',
                  color: placeMode === cfg.mode ? '#fff' : 'var(--text-2)',
                  fontWeight: placeMode === cfg.mode ? 600 : 400,
                }}
              >
                {PLACE_LABEL[cfg.mode]}
              </button>
            ))}
            {geocoding && (
              <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>Geocoding…</span>
            )}
            {placeMode && (
              <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>
                Click anywhere on the map to place the <b>{PLACE_LABEL[placeMode]}</b> point
              </span>
            )}
          </div>
        )}

        {/* Map body */}
        <div style={{ flex: 1, position: 'relative' }}>
          {/* Street search — always visible once map is loaded */}
          {isLoaded && (
            <div style={{
              position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              zIndex: 5,
            }}>
              <Autocomplete
                onLoad={(ref) => { autocompleteRef.current = ref; }}
                onPlaceChanged={onPlaceChanged}
              >
                <input
                  placeholder="Search address or street…"
                  style={{
                    width: 260, padding: '6px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                    color: 'var(--text-1)', outline: 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
                  }}
                />
              </Autocomplete>
            </div>
          )}
          {!isLoaded || validPoints.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--text-3)', fontSize: 13,
            }}>
              {!isLoaded ? 'Loading map…' : 'No coordinates entered yet — fill in lat/lon fields or use the toolbar above to place points on the map.'}
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={coords[0] ?? { lat: 20, lng: 0 }}
              zoom={5}
              onLoad={onMapLoad}
              onClick={(e) => {
                if (placeMode) { handleMapClick(e); return; }
                setOpenHeading(null);
              }}
              options={{
                streetViewControl: true,
                mapTypeControl: false,
                fullscreenControl: false,
                zoomControl: true,
                draggableCursor: placeMode ? 'crosshair' : undefined,
              }}
            >
              {validPoints.map((p) => {
                const lat = fields[p.latKey] as number;
                const lon = fields[p.lonKey] as number;
                const raw = fields[p.rawKey] as string | undefined;
                const norm = fields[p.normKey] as string | undefined;
                const prec = fields[p.precKey] as string | undefined;
                const src = fields[p.srcKey] as string | undefined;
                const conf = fields[p.confKey] as string | undefined;
                const notes = fields[p.notesKey] as string | undefined;

                return (
                  <React.Fragment key={p.heading}>
                    <Marker
                      position={{ lat, lng: lon }}
                      icon={makeCircleIcon(p.color)}
                      onClick={() => setOpenHeading(openHeading === p.heading ? null : p.heading)}
                    />
                    {openHeading === p.heading && (
                      <InfoWindow
                        position={{ lat, lng: lon }}
                        onCloseClick={() => setOpenHeading(null)}
                      >
                        <div style={{ fontFamily: 'DM Sans, sans-serif', minWidth: 220, maxWidth: 280 }}>
                          <div style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                            textTransform: 'uppercase', color: p.color,
                            marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #e5e5e5',
                          }}>
                            {p.heading}
                          </div>
                          {raw && (
                            <div style={{ marginBottom: 5 }}>
                              <span style={{ fontSize: 10, color: '#888', display: 'block' }}>Raw address</span>
                              <span style={{ fontSize: 12, color: '#222' }}>{raw}</span>
                            </div>
                          )}
                          {norm && (
                            <div style={{ marginBottom: 5 }}>
                              <span style={{ fontSize: 10, color: '#888', display: 'block' }}>Normalized address</span>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                <span style={{ fontSize: 12, color: '#222', flex: 1 }}>{norm}</span>
                                {onGeocode && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); geocodeAddress(p); }}
                                    title="Geocode this address → update lat/lon"
                                    style={{
                                      flexShrink: 0, fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                      border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer',
                                      color: '#555', fontFamily: 'DM Sans, sans-serif',
                                    }}
                                  >
                                    Geocode
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          {(prec || src || conf) && (
                            <div style={{ display: 'flex', gap: 12, marginBottom: 5, flexWrap: 'wrap' }}>
                              {prec && <div><span style={{ fontSize: 10, color: '#888', display: 'block' }}>Precision</span><span style={{ fontSize: 12, color: '#222' }}>{prec}</span></div>}
                              {src && <div><span style={{ fontSize: 10, color: '#888', display: 'block' }}>Source</span><span style={{ fontSize: 12, color: '#222' }}>{src}</span></div>}
                              {conf && <div><span style={{ fontSize: 10, color: '#888', display: 'block' }}>Confidence</span><span style={{ fontSize: 12, color: '#222' }}>{conf}</span></div>}
                            </div>
                          )}
                          {notes && (
                            <div style={{ marginBottom: 5 }}>
                              <span style={{ fontSize: 10, color: '#888', display: 'block' }}>Analyst notes</span>
                              <span style={{ fontSize: 12, color: '#222', fontStyle: 'italic' }}>{notes}</span>
                            </div>
                          )}
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e5e5', display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', gap: 16 }}>
                              <div>
                                <span style={{ fontSize: 10, color: '#888', display: 'block' }}>Lat</span>
                                <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace' }}>{lat.toFixed(6)}</span>
                              </div>
                              <div>
                                <span style={{ fontSize: 10, color: '#888', display: 'block' }}>Lon</span>
                                <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace' }}>{lon.toFixed(6)}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => { setOpenHeading(null); openStreetView(lat, lon); }}
                              style={{ fontSize: 11, color: '#1a73e8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}
                            >
                              Street View
                            </button>
                          </div>
                        </div>
                      </InfoWindow>
                    )}
                  </React.Fragment>
                );
              })}
            </GoogleMap>
          )}
        </div>
      </div>
    </div>
  );
}
