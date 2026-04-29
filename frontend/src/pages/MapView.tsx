import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  GoogleMap, useJsApiLoader, Marker, InfoWindow, Polyline,
  Autocomplete, HeatmapLayer, DrawingManager,
} from '@react-google-maps/api';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { api } from '../api';
import type { Stats, MapPoint } from '../types';
import { useNavigate } from 'react-router-dom';
import { GOOGLE_MAPS_API_KEY, LIBRARIES } from '../mapsConfig';

// ── Types ─────────────────────────────────────────────────────────────────────
type InfoWindowKey = { reportId: string; type: 'initial' | 'incident' | 'destination' };
type MapType = 'roadmap' | 'satellite' | 'terrain';
type StyleBy = 'type' | 'harm' | 'stage' | 'status';
type DrawMode = 'polygon' | 'circle' | 'rectangle';
type FilterShape = google.maps.Polygon | google.maps.Circle | google.maps.Rectangle | null;

// ── Color helpers ─────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  initial:     '#4A90D9',
  incident:    '#C0392B',
  destination: '#7B68EE',
} as const;

function getHarmColor(p: MapPoint): string {
  if (p.sexual_assault === 'yes')  return '#8B1538';
  if (p.physical_force === 'yes')  return '#C0392B';
  if (p.coercion === 'yes')        return '#E67E22';
  if (p.robbery_theft === 'yes')   return '#8E44AD';
  return '#5D9B7A';
}

function getStageColor(p: MapPoint): string {
  const s = p.highest_stage_reached || '';
  if (s.includes('sexual'))           return '#8B1538';
  if (s.includes('physical'))         return '#C0392B';
  if (s.includes('mixed'))            return '#922B21';
  if (s.includes('robbery'))          return '#8E44AD';
  if (s.includes('coercion'))         return '#E67E22';
  if (s.includes('negotiation'))      return '#4A90D9';
  if (s === 'no clear escalation')    return '#7A8694';
  return '#7A8694';
}

function getStatusColor(p: MapPoint): string {
  if (p.coding_status === 'reviewed')    return '#2F8F5B';
  if (p.coding_status === 'coded')       return '#4A90D9';
  if (p.coding_status === 'in_progress') return '#E67E22';
  return '#9A9188';
}

function getMarkerColor(p: MapPoint, styleBy: StyleBy, pointType: keyof typeof TYPE_COLORS): string {
  if (styleBy === 'type')   return TYPE_COLORS[pointType];
  if (styleBy === 'harm')   return getHarmColor(p);
  if (styleBy === 'stage')  return getStageColor(p);
  if (styleBy === 'status') return getStatusColor(p);
  return TYPE_COLORS[pointType];
}

type Confidence = 'high' | 'medium' | 'low' | 'unknown';

function getConfidence(val: string): Confidence {
  if (!val) return 'unknown';
  const v = val.toLowerCase();
  if (v === 'high' || v === 'known')     return 'high';
  if (v === 'medium' || v === 'probable') return 'medium';
  if (v === 'low' || v === 'inferred')   return 'low';
  return 'unknown';
}

function getPointConfidence(p: MapPoint, pointType: 'initial' | 'incident' | 'destination'): Confidence {
  const overall = getConfidence(p.location_certainty);
  if (overall !== 'unknown') return overall;
  if (pointType === 'initial')     return getConfidence(p.initial_contact_city_confidence);
  if (pointType === 'incident')    return getConfidence(p.incident_city_confidence);
  if (pointType === 'destination') return getConfidence(p.destination_city_confidence);
  return 'unknown';
}

function makeMarkerIcon(color: string, scale: number, confidence: Confidence): google.maps.Symbol {
  const isUncertain = confidence === 'low' || confidence === 'unknown';
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: isUncertain ? '#ffffff' : color,
    fillOpacity: isUncertain ? 0.15 : 0.95,
    strokeColor: color,
    strokeWeight: isUncertain ? 2.5 : 1.5,
    scale: isUncertain ? scale + 2 : scale,
  };
}

// ── Movement line helpers ─────────────────────────────────────────────────────
function getMovementOptions(p: MapPoint): google.maps.PolylineOptions {
  let color = '#7A8694';
  if (p.coercion === 'yes')             color = '#C0392B';
  else if (p.entered_vehicle === 'yes') color = '#E67E22';
  else if (p.public_to_private_shift === 'yes') color = '#8E44AD';
  else if (p.cross_municipality === 'yes')      color = '#4A90D9';

  const isCompleted = p.movement_completed === 'yes';
  const isAttempted = p.movement === 'yes' && !isCompleted;

  const arrowIcon: google.maps.IconSequence = {
    icon: {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 3,
      fillColor: color,
      fillOpacity: 0.9,
      strokeColor: color,
      strokeWeight: 1,
    },
    offset: '100%',
  };

  if (isAttempted) {
    return {
      strokeColor: color,
      strokeOpacity: 0,
      strokeWeight: 2,
      icons: [
        {
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.55, strokeWeight: 2, strokeColor: color, scale: 3 },
          offset: '0',
          repeat: '8px',
        },
        arrowIcon,
      ],
    };
  }

  return {
    strokeColor: color,
    strokeOpacity: 0.7,
    strokeWeight: 2.5,
    icons: [arrowIcon],
  };
}

// ── Sidebar sub-components ────────────────────────────────────────────────────
const S = {
  bg:       '#0C1E32',
  bg2:      '#142840',
  border:   'rgba(255,255,255,0.08)',
  text1:    '#FFFFFF',
  text2:    'rgba(255,255,255,0.72)',
  text3:    'rgba(255,255,255,0.38)',
  accent:   '#B38B59',
  radius:   6,
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em',
    textTransform: 'uppercase', color: S.text3, marginBottom: 10,
    fontFamily: 'DM Sans, sans-serif',
  }}>
    {children}
  </div>
);

const LayerToggle = ({
  label, color, colorShape = 'circle', checked, onChange,
}: {
  label: string; color?: string; colorShape?: 'circle' | 'line'; checked: boolean; onChange: (v: boolean) => void;
}) => (
  <label style={{
    display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
    fontSize: 12.5, color: checked ? S.text1 : S.text2,
    fontFamily: 'DM Sans, sans-serif', padding: '3px 0',
    transition: 'color 0.15s',
  }}>
    <input
      type="checkbox" checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{ display: 'none' }}
    />
    {/* Custom toggle */}
    <div style={{
      width: 28, height: 16, borderRadius: 8,
      background: checked ? S.accent : 'rgba(255,255,255,0.12)',
      border: `1px solid ${checked ? S.accent : 'rgba(255,255,255,0.15)'}`,
      position: 'relative', flexShrink: 0,
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 2,
        left: checked ? 14 : 2,
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
    {color && colorShape === 'circle' && (
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, opacity: checked ? 1 : 0.4 }} />
    )}
    {color && colorShape === 'line' && (
      <div style={{ width: 14, height: 2, background: color, borderRadius: 1, flexShrink: 0, opacity: checked ? 1 : 0.4 }} />
    )}
    <span>{label}</span>
  </label>
);

const SidebarDivider = () => (
  <div style={{ borderTop: `1px solid ${S.border}`, margin: '2px 0' }} />
);

// ── Legend ────────────────────────────────────────────────────────────────────
function LegendSection({ styleBy, showArrows }: { styleBy: StyleBy; showArrows: boolean }) {
  const items: { label: string; color: string }[] = [];

  if (styleBy === 'type') {
    items.push(
      { label: 'Initial contact', color: TYPE_COLORS.initial },
      { label: 'Incident location', color: TYPE_COLORS.incident },
      { label: 'Destination', color: TYPE_COLORS.destination },
    );
  } else if (styleBy === 'harm') {
    items.push(
      { label: 'Sexual assault', color: '#8B1538' },
      { label: 'Physical force', color: '#C0392B' },
      { label: 'Coercion', color: '#E67E22' },
      { label: 'Robbery', color: '#8E44AD' },
      { label: 'No severe harm flagged', color: '#5D9B7A' },
    );
  } else if (styleBy === 'stage') {
    items.push(
      { label: 'Sexual violence', color: '#8B1538' },
      { label: 'Physical violence', color: '#C0392B' },
      { label: 'Coercion / control', color: '#E67E22' },
      { label: 'Negotiation conflict', color: '#4A90D9' },
      { label: 'No clear escalation', color: '#7A8694' },
    );
  } else if (styleBy === 'status') {
    items.push(
      { label: 'Reviewed', color: '#2F8F5B' },
      { label: 'Coded', color: '#4A90D9' },
      { label: 'In progress', color: '#E67E22' },
      { label: 'Uncoded', color: '#9A9188' },
    );
  }

  return (
    <div>
      <SectionLabel>Legend</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: S.text2 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            {item.label}
          </div>
        ))}
        {showArrows && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: S.text2, marginTop: 2 }}>
            <div style={{ width: 14, height: 2, background: '#C0392B', borderRadius: 1 }} />
            Coercion movement
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: S.text3, marginTop: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #aaa', background: 'transparent' }} />
          Uncertain location
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MapView() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const [stats, setStats] = useState<Stats | null>(null);

  // Layer toggles
  const [showInitial, setShowInitial]           = useState(true);
  const [showIncident, setShowIncident]         = useState(true);
  const [showDestination, setShowDestination]   = useState(false);
  const [showMovement, setShowMovement]         = useState(true);
  const [showArrows, setShowArrows]             = useState(true);
  const [showHeatmap, setShowHeatmap]           = useState(false);
  const [showClusters, setShowClusters]         = useState(false);

  // Styling
  const [styleBy, setStyleBy]   = useState<StyleBy>('type');
  const [mapType, setMapType]   = useState<MapType>('roadmap');

  // Drawing / filter
  const [activeDrawMode, setActiveDrawMode] = useState<DrawMode | null>(null);
  const [filterShape, setFilterShape]       = useState<FilterShape>(null);

  // Boundaries
  const [boundaryLoaded, setBoundaryLoaded] = useState(false);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const boundaryFileRef = useRef<HTMLInputElement>(null);

  // InfoWindow
  const [openWindow, setOpenWindow] = useState<InfoWindowKey | null>(null);

  // Map instance
  const [map, setMap]           = useState<google.maps.Map | null>(null);
  const hasFitRef               = useRef(false);
  const autocompleteRef         = useRef<google.maps.places.Autocomplete | null>(null);
  const clustererRef            = useRef<MarkerClusterer | null>(null);
  const clusterMarkersRef       = useRef<google.maps.Marker[]>([]);
  const navigate                = useNavigate();

  useEffect(() => { api.getStats().then(setStats); }, []);

  const points = stats?.map_points ?? [];

  // ── Spatial filter ──────────────────────────────────────────────────────────
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
        const ll = new google.maps.LatLng(coord.lat, coord.lng);
        if (filterShape instanceof google.maps.Polygon) {
          return google.maps.geometry.poly.containsLocation(ll, filterShape);
        } else if (filterShape instanceof google.maps.Circle) {
          const center = filterShape.getCenter();
          const radius = filterShape.getRadius();
          if (!center) return false;
          return google.maps.geometry.spherical.computeDistanceBetween(center, ll) <= radius;
        } else if (filterShape instanceof google.maps.Rectangle) {
          return filterShape.getBounds()?.contains(ll) ?? false;
        }
        return false;
      });
    });
  }, [points, filterShape, isLoaded]);

  const hasAny = filteredPoints.some((p) => p.lat_initial || p.lat_incident);

  // ── Map load ────────────────────────────────────────────────────────────────
  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  useEffect(() => {
    if (!map || !isLoaded || points.length === 0 || hasFitRef.current) return;
    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;
    points.forEach((p) => {
      if (p.lat_initial && p.lon_initial)     { bounds.extend({ lat: p.lat_initial, lng: p.lon_initial }); hasCoords = true; }
      if (p.lat_incident && p.lon_incident)   { bounds.extend({ lat: p.lat_incident, lng: p.lon_incident }); hasCoords = true; }
      if (p.lat_destination && p.lon_destination) { bounds.extend({ lat: p.lat_destination, lng: p.lon_destination }); hasCoords = true; }
    });
    if (hasCoords) { map.fitBounds(bounds, 60); hasFitRef.current = true; }
  }, [map, points, isLoaded]);

  // ── Marker clustering ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !isLoaded) return;
    if (clustererRef.current) { clustererRef.current.clearMarkers(); clustererRef.current = null; }
    clusterMarkersRef.current.forEach((m) => m.setMap(null));
    clusterMarkersRef.current = [];
    if (!showClusters) return;
    const markers: google.maps.Marker[] = [];
    filteredPoints.forEach((p) => {
      const conf = getConfidence(p.location_certainty);
      if (showInitial && p.lat_initial && p.lon_initial) {
        const col = getMarkerColor(p, styleBy, 'initial');
        markers.push(new google.maps.Marker({
          position: { lat: p.lat_initial, lng: p.lon_initial },
          icon: makeMarkerIcon(col, 7, conf),
        }));
      }
      if (showIncident && p.lat_incident && p.lon_incident) {
        const col = getMarkerColor(p, styleBy, 'incident');
        markers.push(new google.maps.Marker({
          position: { lat: p.lat_incident, lng: p.lon_incident },
          icon: makeMarkerIcon(col, 8, conf),
        }));
      }
      if (showDestination && p.lat_destination && p.lon_destination) {
        const col = getMarkerColor(p, styleBy, 'destination');
        markers.push(new google.maps.Marker({
          position: { lat: p.lat_destination, lng: p.lon_destination },
          icon: makeMarkerIcon(col, 6, conf),
        }));
      }
    });
    clusterMarkersRef.current = markers;
    clustererRef.current = new MarkerClusterer({ map, markers });
  }, [map, isLoaded, showClusters, filteredPoints, showInitial, showIncident, showDestination, styleBy]);

  // ── Boundary visibility ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !boundaryLoaded) return;
    map.data.setStyle(() => ({
      fillColor: '#4A90D9',
      fillOpacity: showBoundaries ? 0.06 : 0,
      strokeColor: '#4A90D9',
      strokeWeight: showBoundaries ? 1.5 : 0,
      visible: showBoundaries,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
  }, [map, boundaryLoaded, showBoundaries]);

  // ── Street view ─────────────────────────────────────────────────────────────
  const openStreetView = (lat: number, lng: number) => {
    if (!map) return;
    const sv = map.getStreetView();
    sv.setPosition({ lat, lng });
    sv.setVisible(true);
  };

  // ── Address search ──────────────────────────────────────────────────────────
  const onPlaceChanged = () => {
    if (!autocompleteRef.current || !map) return;
    const place = autocompleteRef.current.getPlace();
    if (place.geometry?.viewport) map.fitBounds(place.geometry.viewport);
    else if (place.geometry?.location) { map.setCenter(place.geometry.location); map.setZoom(13); }
  };

  // ── Boundary upload ─────────────────────────────────────────────────────────
  const handleBoundaryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !map) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        map.data.forEach((f) => map.data.remove(f));
        map.data.addGeoJson(json);
        map.data.setStyle({
          fillColor: '#4A90D9', fillOpacity: 0.06,
          strokeColor: '#4A90D9', strokeWeight: 1.5,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        setBoundaryLoaded(true); setShowBoundaries(true);
      } catch { alert('Invalid GeoJSON file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Drawing handlers ────────────────────────────────────────────────────────
  const clearFilter = () => {
    if (filterShape) { filterShape.setMap(null); setFilterShape(null); }
  };
  const onPolygonComplete   = (s: google.maps.Polygon)   => { if (filterShape) filterShape.setMap(null); setFilterShape(s); setActiveDrawMode(null); };
  const onCircleComplete    = (s: google.maps.Circle)    => { if (filterShape) filterShape.setMap(null); setFilterShape(s); setActiveDrawMode(null); };
  const onRectangleComplete = (s: google.maps.Rectangle) => { if (filterShape) filterShape.setMap(null); setFilterShape(s); setActiveDrawMode(null); };

  const getGoogleDrawMode = (): google.maps.drawing.OverlayType | null => {
    if (!activeDrawMode) return null;
    if (activeDrawMode === 'polygon')   return google.maps.drawing.OverlayType.POLYGON;
    if (activeDrawMode === 'circle')    return google.maps.drawing.OverlayType.CIRCLE;
    if (activeDrawMode === 'rectangle') return google.maps.drawing.OverlayType.RECTANGLE;
    return null;
  };

  // ── Heatmap data ─────────────────────────────────────────────────────────────
  const heatmapData = useMemo(() => {
    if (!isLoaded) return [];
    return filteredPoints.flatMap((p) => {
      const result: google.maps.LatLng[] = [];
      if (p.lat_initial && p.lon_initial)   result.push(new google.maps.LatLng(p.lat_initial, p.lon_initial));
      if (p.lat_incident && p.lon_incident) result.push(new google.maps.LatLng(p.lat_incident, p.lon_incident));
      return result;
    });
  }, [filteredPoints, isLoaded]);

  // ── Reset workspace ─────────────────────────────────────────────────────────
  const resetWorkspace = () => {
    clearFilter();
    setActiveDrawMode(null);
    setStyleBy('type');
    setShowInitial(true); setShowIncident(true); setShowDestination(false);
    setShowMovement(true); setShowArrows(true);
    setShowHeatmap(false); setShowClusters(false);
    setOpenWindow(null);
    hasFitRef.current = false;
    if (map && points.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      let hasCoords = false;
      points.forEach((p) => {
        if (p.lat_initial && p.lon_initial)   { bounds.extend({ lat: p.lat_initial, lng: p.lon_initial }); hasCoords = true; }
        if (p.lat_incident && p.lon_incident) { bounds.extend({ lat: p.lat_incident, lng: p.lon_incident }); hasCoords = true; }
      });
      if (hasCoords) { map.fitBounds(bounds, 60); hasFitRef.current = true; }
    }
  };

  // ── InfoWindow renderer ──────────────────────────────────────────────────────
  const renderInfoWindow = (p: MapPoint, lat: number, lon: number, label: string) => {
    const harmFlags: string[] = [];
    if (p.coercion === 'yes')       harmFlags.push('Coercion');
    if (p.physical_force === 'yes') harmFlags.push('Physical force');
    if (p.sexual_assault === 'yes') harmFlags.push('Sexual assault');
    if (p.robbery_theft === 'yes')  harmFlags.push('Robbery');

    const statusColors: Record<string, string> = {
      reviewed: '#2F8F5B', coded: '#1E5A8F', in_progress: '#92400E', uncoded: '#7A8694',
    };
    const statusColor = statusColors[p.coding_status] || '#7A8694';

    return (
      <InfoWindow position={{ lat, lng: lon }} onCloseClick={() => setOpenWindow(null)}>
        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, minWidth: 200, maxWidth: 240 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: 'Lora, serif', fontSize: 13.5, fontWeight: 600, color: '#0B1F33' }}>
              {p.report_id}
            </span>
            {p.coding_status && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                background: statusColor + '18', color: statusColor,
                border: `1px solid ${statusColor}40`,
                textTransform: 'capitalize',
              }}>
                {p.coding_status.replace('_', ' ')}
              </span>
            )}
          </div>

          {/* Date / city */}
          <div style={{ color: '#5A6A78', fontSize: 11.5, marginBottom: 6, lineHeight: 1.5 }}>
            {p.incident_date && <div>{p.incident_date}</div>}
            {p.city && <div>{p.city}</div>}
            <div style={{ color: '#9A9AA0', marginTop: 2 }}>{label}</div>
          </div>

          {/* Harm flags */}
          {harmFlags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {harmFlags.map((f) => (
                <span key={f} style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 10,
                  background: '#FDF2F2', color: '#A51F1F', border: '1px solid #F5C6C6',
                }}>
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* Highest stage */}
          {p.highest_stage_reached && p.highest_stage_reached !== 'unknown' && (
            <div style={{
              fontSize: 11, padding: '4px 8px', borderRadius: 5,
              background: '#EAF3FA', color: '#1E5A8F', border: '1px solid #BFDBFE',
              marginBottom: 8,
            }}>
              Stage: {p.highest_stage_reached}
            </div>
          )}

          {/* Movement flags */}
          {(p.movement === 'yes' || p.public_to_private_shift === 'yes' || p.cross_municipality === 'yes') && (
            <div style={{ fontSize: 11, color: '#7A8694', marginBottom: 6, lineHeight: 1.6 }}>
              {p.movement === 'yes' && <div>Movement: {p.movement_completed === 'yes' ? 'Completed' : 'Present'}{p.entered_vehicle === 'yes' ? ' (vehicle)' : ''}</div>}
              {p.public_to_private_shift === 'yes' && <div>Public → private shift</div>}
              {p.cross_municipality === 'yes' && <div>Cross-municipality movement</div>}
            </div>
          )}

          {/* Actions */}
          <div style={{
            display: 'flex', gap: 10, paddingTop: 7,
            borderTop: '1px solid #EDEBE6', alignItems: 'center', marginTop: 4,
          }}>
            <button
              onClick={() => navigate(`/code/${p.report_id}`)}
              style={{
                fontSize: 11, fontWeight: 600, color: '#0B1F33', background: '#EAF3FA',
                border: '1px solid #BFDBFE', borderRadius: 5,
                cursor: 'pointer', padding: '3px 10px', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Open case
            </button>
            <button
              onClick={() => { setOpenWindow(null); openStreetView(lat, lon); }}
              style={{
                fontSize: 11, color: '#1a73e8', background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, textDecoration: 'underline',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Street View
            </button>
          </div>
        </div>
      </InfoWindow>
    );
  };

  // ── Loading state ────────────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading map…</span>
      </div>
    );
  }

  const gDrawMode = getGoogleDrawMode();

  // ── Draw mode button style ────────────────────────────────────────────────────
  const drawBtnStyle = (mode: DrawMode): React.CSSProperties => ({
    flex: 1, padding: '5px 4px', fontSize: 11, fontFamily: 'DM Sans, sans-serif',
    cursor: 'pointer', borderRadius: 5,
    border: `1px solid ${activeDrawMode === mode ? S.accent : 'rgba(255,255,255,0.15)'}`,
    background: activeDrawMode === mode ? S.accent : 'rgba(255,255,255,0.05)',
    color: activeDrawMode === mode ? '#fff' : S.text2,
    fontWeight: activeDrawMode === mode ? 600 : 400,
    transition: 'all 0.15s',
  });

  const mapTypeBtnStyle = (t: MapType): React.CSSProperties => ({
    flex: 1, padding: '5px 0', fontSize: 11,
    fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', borderRadius: 5,
    border: `1px solid ${mapType === t ? S.accent : 'rgba(255,255,255,0.12)'}`,
    background: mapType === t ? 'rgba(179,139,89,0.25)' : 'rgba(255,255,255,0.04)',
    color: mapType === t ? S.accent : S.text2,
    fontWeight: mapType === t ? 600 : 400,
    transition: 'all 0.15s',
  });

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* ── Dark GIS Sidebar ────────────────────────────────────────────────── */}
      <div style={{
        width: 230, flexShrink: 0,
        background: S.bg,
        borderRight: `1px solid ${S.border}`,
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
        boxShadow: '2px 0 12px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px 12px',
          borderBottom: `1px solid ${S.border}`,
          background: S.bg2,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: S.text1, fontFamily: 'Lora, serif', marginBottom: 2 }}>
            GIS Workspace
          </div>
          <div style={{ fontSize: 11, color: S.text3, fontFamily: 'DM Sans, sans-serif' }}>
            {filterShape
              ? `${filteredPoints.length} of ${points.length} cases visible`
              : `${points.length} case${points.length !== 1 ? 's' : ''} plotted`}
          </div>
        </div>

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* ── Point Layers ──────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Point layers</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <LayerToggle label="Initial contact" color={styleBy === 'type' ? TYPE_COLORS.initial : '#7A8694'} checked={showInitial} onChange={setShowInitial} />
              <LayerToggle label="Incident location" color={styleBy === 'type' ? TYPE_COLORS.incident : '#7A8694'} checked={showIncident} onChange={setShowIncident} />
              <LayerToggle label="Destination" color={styleBy === 'type' ? TYPE_COLORS.destination : '#7A8694'} checked={showDestination} onChange={setShowDestination} />
            </div>
          </div>

          <SidebarDivider />

          {/* ── Movement Layers ───────────────────────────────────────────── */}
          <div>
            <SectionLabel>Movement</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <LayerToggle label="Movement lines" colorShape="line" color="#7A8694" checked={showMovement} onChange={setShowMovement} />
              <LayerToggle label="Direction arrows" colorShape="line" color={S.accent} checked={showArrows} onChange={setShowArrows} />
            </div>
          </div>

          <SidebarDivider />

          {/* ── Overlay Layers ────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Overlays</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <LayerToggle label="Heatmap" checked={showHeatmap} onChange={setShowHeatmap} />
              <LayerToggle label="Cluster markers" checked={showClusters} onChange={setShowClusters} />
              {boundaryLoaded && (
                <LayerToggle label="Boundary layer" color="#4A90D9" checked={showBoundaries} onChange={setShowBoundaries} />
              )}
            </div>
          </div>

          <SidebarDivider />

          {/* ── Style By ─────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Style markers by</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {([
                ['type',   'Point type'],
                ['harm',   'Harm type'],
                ['stage',  'Highest stage'],
                ['status', 'Coding status'],
              ] as [StyleBy, string][]).map(([val, label]) => (
                <label key={val} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', fontSize: 12.5, color: styleBy === val ? S.text1 : S.text2,
                  fontFamily: 'DM Sans, sans-serif', padding: '3px 6px',
                  borderRadius: 5,
                  background: styleBy === val ? 'rgba(179,139,89,0.18)' : 'transparent',
                  transition: 'background 0.15s, color 0.15s',
                }}>
                  <input type="radio" name="styleBy" value={val} checked={styleBy === val}
                    onChange={() => setStyleBy(val)} style={{ display: 'none' }} />
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${styleBy === val ? S.accent : 'rgba(255,255,255,0.3)'}`,
                    background: styleBy === val ? S.accent : 'transparent',
                    transition: 'all 0.15s',
                  }} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <SidebarDivider />

          {/* ── Spatial Filter ────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Spatial filter</SectionLabel>
            {filterShape ? (
              <div>
                <div style={{ fontSize: 12, color: S.text2, marginBottom: 8, lineHeight: 1.5 }}>
                  <span style={{ color: S.accent, fontWeight: 600 }}>{filteredPoints.length}</span> of {points.length} cases
                </div>
                <button onClick={clearFilter} style={{
                  width: '100%', padding: '6px 0', fontSize: 12,
                  fontFamily: 'DM Sans, sans-serif',
                  background: 'rgba(255,255,255,0.07)', color: S.text2,
                  border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 6, cursor: 'pointer',
                }}>
                  Clear filter
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {(['polygon', 'circle', 'rectangle'] as DrawMode[]).map((mode) => (
                    <button key={mode} style={drawBtnStyle(mode)}
                      onClick={() => setActiveDrawMode(activeDrawMode === mode ? null : mode)}>
                      {mode === 'polygon' ? 'Poly' : mode === 'circle' ? 'Radius' : 'Rect'}
                    </button>
                  ))}
                </div>
                {activeDrawMode && (
                  <div style={{ fontSize: 11, color: S.accent, marginBottom: 4 }}>
                    Drawing {activeDrawMode} — click map to begin
                  </div>
                )}
                {!activeDrawMode && (
                  <div style={{ fontSize: 11, color: S.text3 }}>
                    Select a shape to filter visible cases
                  </div>
                )}
              </>
            )}
          </div>

          <SidebarDivider />

          {/* ── Base Map ──────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Base map</SectionLabel>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['roadmap', 'satellite', 'terrain'] as MapType[]).map((t) => (
                <button key={t} onClick={() => setMapType(t)} style={mapTypeBtnStyle(t)}>
                  {t === 'roadmap' ? 'Street' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <SidebarDivider />

          {/* ── Boundaries ────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Boundary layer</SectionLabel>
            <input ref={boundaryFileRef} type="file" accept=".geojson,.json"
              style={{ display: 'none' }} onChange={handleBoundaryUpload} />
            <button onClick={() => boundaryFileRef.current?.click()} style={{
              width: '100%', padding: '6px 0', fontSize: 12,
              fontFamily: 'DM Sans, sans-serif',
              background: 'rgba(255,255,255,0.05)', color: S.text2,
              border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 6, cursor: 'pointer',
            }}>
              {boundaryLoaded ? '↺ Replace .geojson' : 'Upload .geojson'}
            </button>
          </div>

          <SidebarDivider />

          {/* ── Legend ────────────────────────────────────────────────────── */}
          <LegendSection styleBy={styleBy} showArrows={showArrows && showMovement} />

          <SidebarDivider />

          {/* ── Tools ─────────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Tools</SectionLabel>
            <button onClick={resetWorkspace} style={{
              width: '100%', padding: '6px 0', fontSize: 12,
              fontFamily: 'DM Sans, sans-serif',
              background: 'rgba(255,255,255,0.05)', color: S.text3,
              border: `1px solid rgba(255,255,255,0.10)`, borderRadius: 6, cursor: 'pointer',
            }}>
              Reset workspace
            </button>
          </div>

        </div>
      </div>

      {/* ── Map canvas ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>

        {!hasAny && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, pointerEvents: 'none',
          }}>
            <div style={{
              textAlign: 'center', padding: 32,
              background: 'rgba(250,249,246,0.90)',
              backdropFilter: 'blur(4px)',
              borderRadius: 12, boxShadow: '0 4px 20px rgba(11,31,51,0.12)',
            }}>
              <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 8, margin: '0 0 8px' }}>No geocoded locations yet.</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 300, margin: 0 }}>
                Add coordinates in the GIS section of each report to plot them here.
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
                width: 300, padding: '8px 14px', borderRadius: 8,
                border: '1px solid rgba(11,31,51,0.12)',
                background: 'rgba(255,255,255,0.97)',
                fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                color: 'var(--text-1)', outline: 'none',
                boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
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
            draggableCursor: activeDrawMode ? 'crosshair' : undefined,
            styles: mapType === 'roadmap' ? [
              { featureType: 'poi', stylers: [{ visibility: 'simplified' }] },
              { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
            ] : undefined,
          }}
        >
          {/* Heatmap */}
          {showHeatmap && heatmapData.length > 0 && (
            <HeatmapLayer data={heatmapData} options={{ radius: 30, opacity: 0.65 }} />
          )}

          {/* Drawing manager */}
          {activeDrawMode && (
            <DrawingManager
              options={{
                drawingControl: false,
                drawingMode: gDrawMode,
                polygonOptions:   { fillColor: '#4A90D9', fillOpacity: 0.12, strokeColor: '#4A90D9', strokeWeight: 2, editable: true },
                circleOptions:    { fillColor: '#4A90D9', fillOpacity: 0.12, strokeColor: '#4A90D9', strokeWeight: 2, editable: true },
                rectangleOptions: { fillColor: '#4A90D9', fillOpacity: 0.10, strokeColor: '#4A90D9', strokeWeight: 2, editable: true },
              }}
              onPolygonComplete={onPolygonComplete}
              onCircleComplete={onCircleComplete}
              onRectangleComplete={onRectangleComplete}
            />
          )}

          {/* Markers and lines — hidden when clustering */}
          {!showClusters && filteredPoints.map((p) => (
            <React.Fragment key={p.report_id}>

              {/* Initial contact */}
              {showInitial && p.lat_initial && p.lon_initial && (
                <>
                  <Marker
                    position={{ lat: p.lat_initial, lng: p.lon_initial }}
                    icon={makeMarkerIcon(
                      getMarkerColor(p, styleBy, 'initial'),
                      7,
                      getPointConfidence(p, 'initial')
                    )}
                    onClick={() => setOpenWindow({ reportId: p.report_id, type: 'initial' })}
                    zIndex={2}
                  />
                  {openWindow?.reportId === p.report_id && openWindow.type === 'initial' &&
                    renderInfoWindow(p, p.lat_initial, p.lon_initial, 'Initial contact')}
                </>
              )}

              {/* Incident */}
              {showIncident && p.lat_incident && p.lon_incident && (
                <>
                  <Marker
                    position={{ lat: p.lat_incident, lng: p.lon_incident }}
                    icon={makeMarkerIcon(
                      getMarkerColor(p, styleBy, 'incident'),
                      8,
                      getPointConfidence(p, 'incident')
                    )}
                    onClick={() => setOpenWindow({ reportId: p.report_id, type: 'incident' })}
                    zIndex={3}
                  />
                  {openWindow?.reportId === p.report_id && openWindow.type === 'incident' &&
                    renderInfoWindow(p, p.lat_incident, p.lon_incident, 'Incident location')}
                </>
              )}

              {/* Destination */}
              {showDestination && p.lat_destination && p.lon_destination && (
                <>
                  <Marker
                    position={{ lat: p.lat_destination, lng: p.lon_destination }}
                    icon={makeMarkerIcon(
                      getMarkerColor(p, styleBy, 'destination'),
                      6,
                      getPointConfidence(p, 'destination')
                    )}
                    onClick={() => setOpenWindow({ reportId: p.report_id, type: 'destination' })}
                    zIndex={1}
                  />
                  {openWindow?.reportId === p.report_id && openWindow.type === 'destination' &&
                    renderInfoWindow(p, p.lat_destination, p.lon_destination, 'Destination')}
                </>
              )}

              {/* Movement lines */}
              {showMovement && p.movement === 'yes' && (() => {
                const opts = getMovementOptions(p);
                // If arrows disabled, strip the forward arrow icon
                const finalOpts = showArrows ? opts : {
                  ...opts,
                  icons: opts.icons?.filter((ic) =>
                    (ic.icon as google.maps.Symbol)?.path !== google.maps.SymbolPath.FORWARD_CLOSED_ARROW
                  ),
                };
                return (
                  <>
                    {p.lat_initial && p.lon_initial && p.lat_incident && p.lon_incident && (
                      <Polyline
                        path={[
                          { lat: p.lat_initial, lng: p.lon_initial },
                          { lat: p.lat_incident, lng: p.lon_incident },
                        ]}
                        options={finalOpts}
                      />
                    )}
                    {p.lat_incident && p.lon_incident && p.lat_destination && p.lon_destination && (
                      <Polyline
                        path={[
                          { lat: p.lat_incident, lng: p.lon_incident },
                          { lat: p.lat_destination, lng: p.lon_destination },
                        ]}
                        options={{
                          ...finalOpts,
                          strokeColor: TYPE_COLORS.destination,
                          icons: showArrows ? [{
                            icon: {
                              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                              scale: 3, fillColor: TYPE_COLORS.destination, fillOpacity: 0.9,
                              strokeColor: TYPE_COLORS.destination, strokeWeight: 1,
                            },
                            offset: '100%',
                          }] : [],
                        }}
                      />
                    )}
                  </>
                );
              })()}

            </React.Fragment>
          ))}
        </GoogleMap>
      </div>
    </div>
  );
}
