import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  GoogleMap, useJsApiLoader, Marker, InfoWindow, Polyline,
  Autocomplete, HeatmapLayer, DrawingManager,
} from '@react-google-maps/api';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { api } from '../api';
import type { Stats, MapPoint } from '../types';
import { useNavigate } from 'react-router-dom';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
const LIBRARIES: ['places', 'visualization', 'drawing', 'geometry'] =
  ['places', 'visualization', 'drawing', 'geometry'];

type InfoWindowKey = { reportId: string; type: 'initial' | 'incident' | 'destination' };
type MapType = 'roadmap' | 'satellite' | 'terrain';

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

const SidebarLabel = ({ children }: { children: React.ReactNode }) => (
  <span style={{
    display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8,
  }}>
    {children}
  </span>
);

const Divider = () => (
  <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
);

export default function MapView() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const [stats, setStats] = useState<Stats | null>(null);

  // Existing layer toggles
  const [showMovement, setShowMovement] = useState(true);
  const [showInitial, setShowInitial] = useState(true);
  const [showIncident, setShowIncident] = useState(true);
  const [showDestination, setShowDestination] = useState(true);

  // New GIS states
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const [mapType, setMapType] = useState<MapType>('roadmap');

  // Draw & filter
  const [drawingActive, setDrawingActive] = useState(false);
  const [filterShape, setFilterShape] = useState<google.maps.Polygon | google.maps.Circle | null>(null);

  // Boundaries
  const [boundaryLoaded, setBoundaryLoaded] = useState(false);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const boundaryFileRef = useRef<HTMLInputElement>(null);

  const [openWindow, setOpenWindow] = useState<InfoWindowKey | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const hasFitRef = useRef(false);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const clusterMarkersRef = useRef<google.maps.Marker[]>([]);
  const navigate = useNavigate();

  useEffect(() => { api.getStats().then(setStats); }, []);

  const points = stats?.map_points ?? [];

  // Filter points by drawn shape
  const filteredPoints = useMemo((): MapPoint[] => {
    if (!filterShape || !isLoaded) return points;

    return points.filter((p) => {
      const coords = [
        p.lat_initial && p.lon_initial ? { lat: p.lat_initial, lng: p.lon_initial } : null,
        p.lat_incident && p.lon_incident ? { lat: p.lat_incident, lng: p.lon_incident } : null,
        p.lat_destination && p.lon_destination ? { lat: p.lat_destination, lng: p.lon_destination } : null,
      ].filter(Boolean) as { lat: number; lng: number }[];

      if (coords.length === 0) return false;

      return coords.some((coord) => {
        const latLng = new google.maps.LatLng(coord.lat, coord.lng);
        if (filterShape instanceof google.maps.Polygon) {
          return google.maps.geometry.poly.containsLocation(latLng, filterShape);
        } else if (filterShape instanceof google.maps.Circle) {
          const center = filterShape.getCenter();
          const radius = filterShape.getRadius();
          if (!center) return false;
          return google.maps.geometry.spherical.computeDistanceBetween(center, latLng) <= radius;
        }
        return false;
      });
    });
  }, [points, filterShape, isLoaded]);

  const hasAny = filteredPoints.some((p) => p.lat_initial || p.lat_incident);

  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  // Fit bounds once
  useEffect(() => {
    if (!map || !isLoaded || points.length === 0 || hasFitRef.current) return;
    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;
    points.forEach((p) => {
      if (p.lat_initial && p.lon_initial) { bounds.extend({ lat: p.lat_initial, lng: p.lon_initial }); hasCoords = true; }
      if (p.lat_incident && p.lon_incident) { bounds.extend({ lat: p.lat_incident, lng: p.lon_incident }); hasCoords = true; }
      if (p.lat_destination && p.lon_destination) { bounds.extend({ lat: p.lat_destination, lng: p.lon_destination }); hasCoords = true; }
    });
    if (hasCoords) { map.fitBounds(bounds, 40); hasFitRef.current = true; }
  }, [map, points, isLoaded]);

  // Marker clustering
  useEffect(() => {
    if (!map || !isLoaded) return;

    // Clean up previous
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current = null;
    }
    clusterMarkersRef.current.forEach((m) => m.setMap(null));
    clusterMarkersRef.current = [];

    if (!showClusters) return;

    const markers: google.maps.Marker[] = [];
    filteredPoints.forEach((p) => {
      if (showInitial && p.lat_initial && p.lon_initial) {
        markers.push(new google.maps.Marker({
          position: { lat: p.lat_initial, lng: p.lon_initial },
          icon: makeCircleIcon('#9B1D1D', 7),
        }));
      }
      if (showIncident && p.lat_incident && p.lon_incident) {
        markers.push(new google.maps.Marker({
          position: { lat: p.lat_incident, lng: p.lon_incident },
          icon: makeCircleIcon('#B45309', 7),
        }));
      }
      if (showDestination && p.lat_destination && p.lon_destination) {
        markers.push(new google.maps.Marker({
          position: { lat: p.lat_destination, lng: p.lon_destination },
          icon: makeCircleIcon('#3730A3', 6),
        }));
      }
    });

    clusterMarkersRef.current = markers;
    clustererRef.current = new MarkerClusterer({ map, markers });
  }, [map, isLoaded, showClusters, filteredPoints, showInitial, showIncident, showDestination]);

  // Boundary visibility toggle
  useEffect(() => {
    if (!map || !boundaryLoaded) return;
    map.data.setStyle((_feature) => ({
      fillColor: '#9B1D1D',
      fillOpacity: showBoundaries ? 0.08 : 0,
      strokeColor: '#9B1D1D',
      strokeWeight: showBoundaries ? 1.5 : 0,
      visible: showBoundaries,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
  }, [map, boundaryLoaded, showBoundaries]);

  const openStreetView = (lat: number, lng: number) => {
    if (!map) return;
    const sv = map.getStreetView();
    sv.setPosition({ lat, lng });
    sv.setVisible(true);
  };

  const onPlaceChanged = () => {
    if (!autocompleteRef.current || !map) return;
    const place = autocompleteRef.current.getPlace();
    if (place.geometry?.viewport) {
      map.fitBounds(place.geometry.viewport);
    } else if (place.geometry?.location) {
      map.setCenter(place.geometry.location);
      map.setZoom(13);
    }
  };

  const handleBoundaryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !map) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        // Clear existing boundary features
        map.data.forEach((f) => map.data.remove(f));
        map.data.addGeoJson(json);
        map.data.setStyle({
          fillColor: '#9B1D1D',
          fillOpacity: 0.08,
          strokeColor: '#9B1D1D',
          strokeWeight: 1.5,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        setBoundaryLoaded(true);
        setShowBoundaries(true);
      } catch {
        alert('Invalid GeoJSON file.');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

  const clearFilter = () => {
    if (filterShape) {
      filterShape.setMap(null);
      setFilterShape(null);
    }
  };

  const onPolygonComplete = (polygon: google.maps.Polygon) => {
    if (filterShape) filterShape.setMap(null);
    setFilterShape(polygon);
    setDrawingActive(false);
  };

  const onCircleComplete = (circle: google.maps.Circle) => {
    if (filterShape) filterShape.setMap(null);
    setFilterShape(circle);
    setDrawingActive(false);
  };

  // Heatmap data — all initial + incident points
  const heatmapData = useMemo(() => {
    if (!isLoaded) return [];
    return filteredPoints.flatMap((p) => {
      const result: google.maps.LatLng[] = [];
      if (p.lat_initial && p.lon_initial)
        result.push(new google.maps.LatLng(p.lat_initial, p.lon_initial));
      if (p.lat_incident && p.lon_incident)
        result.push(new google.maps.LatLng(p.lat_incident, p.lon_incident));
      return result;
    });
  }, [filteredPoints, isLoaded]);

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

  const mapTypeBtnStyle = (type: MapType) => ({
    flex: 1,
    padding: '4px 0',
    fontSize: 11,
    fontFamily: 'DM Sans, sans-serif',
    cursor: 'pointer',
    borderRadius: 5,
    border: mapType === type ? '1.5px solid var(--accent)' : '1px solid var(--border)',
    background: mapType === type ? 'var(--accent-pale, #fdf2f2)' : 'var(--surface)',
    color: mapType === type ? 'var(--accent, #9B1D1D)' : 'var(--text-2)',
    fontWeight: mapType === type ? 600 : 400,
  });

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* Sidebar */}
      <div style={{
        width: 220, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        padding: '16px 14px',
        gap: 16,
        boxShadow: 'var(--shadow-sm)',
        overflowY: 'auto',
      }}>
        <h3 style={{
          fontFamily: 'Lora, serif', fontSize: 15, fontWeight: 500,
          margin: 0, color: 'var(--text-1)',
        }}>
          Map Controls
        </h3>

        {/* Point types */}
        <div>
          <SidebarLabel>Point types</SidebarLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {([
              { key: 'initial', label: 'Initial contact', color: '#9B1D1D', checked: showInitial, set: setShowInitial },
              { key: 'incident', label: 'Incident location', color: '#B45309', checked: showIncident, set: setShowIncident },
              { key: 'destination', label: 'Destination', color: '#3730A3', checked: showDestination, set: setShowDestination },
            ] as const).map(({ key, label, color, checked, set }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
                <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} style={{ accentColor: color, width: 13, height: 13 }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
          <input type="checkbox" checked={showMovement} onChange={(e) => setShowMovement(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 13, height: 13 }} />
          Movement lines
        </label>

        <Divider />

        {/* Layers */}
        <div>
          <SidebarLabel>Layers</SidebarLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
              <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 13, height: 13 }} />
              Heatmap
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
              <input type="checkbox" checked={showClusters} onChange={(e) => setShowClusters(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 13, height: 13 }} />
              Cluster markers
            </label>
          </div>
        </div>

        <Divider />

        {/* Draw filter */}
        <div>
          <SidebarLabel>Spatial filter</SidebarLabel>
          {!filterShape ? (
            <button
              onClick={() => setDrawingActive(true)}
              style={{
                width: '100%', padding: '5px 0', fontSize: 12,
                fontFamily: 'DM Sans, sans-serif',
                background: drawingActive ? 'var(--accent, #9B1D1D)' : 'var(--surface-2)',
                color: drawingActive ? '#fff' : 'var(--text-2)',
                border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
              }}
            >
              {drawingActive ? 'Drawing… (click map)' : 'Draw filter area'}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {filteredPoints.length} / {points.length} reports visible
              </div>
              <button
                onClick={clearFilter}
                style={{
                  width: '100%', padding: '5px 0', fontSize: 12,
                  fontFamily: 'DM Sans, sans-serif',
                  background: 'var(--surface-2)', color: 'var(--text-2)',
                  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                }}
              >
                Clear filter
              </button>
            </div>
          )}
          {!filterShape && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>
              Draw a polygon or circle to filter reports by area.
            </div>
          )}
        </div>

        <Divider />

        {/* Map type */}
        <div>
          <SidebarLabel>Base map</SidebarLabel>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['roadmap', 'satellite', 'terrain'] as MapType[]).map((t) => (
              <button key={t} onClick={() => setMapType(t)} style={mapTypeBtnStyle(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <Divider />

        {/* Boundaries */}
        <div>
          <SidebarLabel>Boundaries</SidebarLabel>
          <input
            ref={boundaryFileRef}
            type="file"
            accept=".geojson,.json"
            style={{ display: 'none' }}
            onChange={handleBoundaryUpload}
          />
          <button
            onClick={() => boundaryFileRef.current?.click()}
            style={{
              width: '100%', padding: '5px 0', fontSize: 12,
              fontFamily: 'DM Sans, sans-serif',
              background: 'var(--surface-2)', color: 'var(--text-2)',
              border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
            }}
          >
            {boundaryLoaded ? 'Replace .geojson' : 'Upload .geojson'}
          </button>
          {boundaryLoaded && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>
              <input type="checkbox" checked={showBoundaries} onChange={(e) => setShowBoundaries(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 13, height: 13 }} />
              Show boundaries
            </label>
          )}
        </div>

        <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--text-3)', paddingTop: 8 }}>
          {filterShape
            ? `${filteredPoints.length} of ${points.length} report${points.length !== 1 ? 's' : ''} shown`
            : `${points.length} report${points.length !== 1 ? 's' : ''} plotted`}
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        {!hasAny && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, pointerEvents: 'none',
          }}>
            <div style={{
              textAlign: 'center', padding: 32,
              background: 'rgba(250,249,246,0.85)',
              backdropFilter: 'blur(2px)',
              borderRadius: 12, pointerEvents: 'none',
            }}>
              <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 8 }}>No geocoded locations yet.</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 300 }}>
                Add lat/lon coordinates in the GIS section of each report to see them plotted here.
              </p>
            </div>
          </div>
        )}

        {/* Search box */}
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
          <Autocomplete
            onLoad={(ref) => { autocompleteRef.current = ref; }}
            onPlaceChanged={onPlaceChanged}
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
          </Autocomplete>
        </div>

        <GoogleMap
          mapContainerStyle={{ height: '100%', width: '100%' }}
          center={{ lat: 49.28, lng: -123.12 }}
          zoom={12}
          mapTypeId={mapType}
          onLoad={onMapLoad}
          onClick={() => setOpenWindow(null)}
          options={{
            streetViewControl: true,
            mapTypeControl: false,
            fullscreenControl: true,
            zoomControl: true,
            draggableCursor: drawingActive ? 'crosshair' : undefined,
          }}
        >
          {/* Heatmap */}
          {showHeatmap && heatmapData.length > 0 && (
            <HeatmapLayer
              data={heatmapData}
              options={{ radius: 30, opacity: 0.65 }}
            />
          )}

          {/* Drawing manager */}
          {drawingActive && (
            <DrawingManager
              options={{
                drawingControl: false,
                drawingMode: google.maps.drawing.OverlayType.POLYGON,
                polygonOptions: { fillColor: '#9B1D1D', fillOpacity: 0.12, strokeColor: '#9B1D1D', strokeWeight: 2, editable: true },
                circleOptions: { fillColor: '#9B1D1D', fillOpacity: 0.12, strokeColor: '#9B1D1D', strokeWeight: 2, editable: true },
              }}
              onPolygonComplete={onPolygonComplete}
              onCircleComplete={onCircleComplete}
            />
          )}

          {/* React markers — hidden when clustering is on */}
          {!showClusters && filteredPoints.map((p) => (
            <React.Fragment key={p.report_id}>
              {showInitial && p.lat_initial && p.lon_initial && (
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

              {showIncident && p.lat_incident && p.lon_incident && (
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

              {showDestination && p.lat_destination && p.lon_destination && (
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
            </React.Fragment>
          ))}
        </GoogleMap>
      </div>
    </div>
  );
}
