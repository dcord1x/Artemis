import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  GoogleMap, Marker, InfoWindow, Polyline,
  Autocomplete, HeatmapLayer, DrawingManager,
} from '@react-google-maps/api';
import { MarkerClusterer, type Renderer } from '@googlemaps/markerclusterer';
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { api } from '../api';
import type { Stats, MapPoint } from '../types';
import { useNavigate } from 'react-router-dom';
import { useMaps } from '../context/MapsContext';
import { broadPos as _broadPos } from '../utils';

// ── Types ─────────────────────────────────────────────────────────────────────
type InfoWindowKey = { reportId: string; type: 'initial' | 'incident' | 'destination' };
type MapType = 'roadmap' | 'satellite' | 'terrain';
type StyleBy = 'type' | 'harm' | 'stage' | 'status';
type DrawMode = 'polygon' | 'circle' | 'rectangle' | 'buffer';
type AnalyticView = 'distribution' | 'movement' | 'harm' | 'stage' | 'status' | 'linkage';

const ANALYTIC_VIEWS: { id: AnalyticView; label: string; desc: string; tooltip: string; styleBy: StyleBy }[] = [
  { id: 'distribution', label: 'Point Distribution',        styleBy: 'type',
    desc: 'Shows geocoded initial contact, incident, and destination points.',
    tooltip: 'Displays all geocoded location points. Only cases with at least one geocoded point are shown.' },
  { id: 'movement',     label: 'Encounter Movement',        styleBy: 'type',
    desc: 'Shows movement pathways where two or more location points are coded.',
    tooltip: 'Movement lines connect coded location points. Only cases with movement coded as present are shown.' },
  { id: 'harm',         label: 'Harm Patterning',           styleBy: 'harm',
    desc: 'Styles cases by coded harm indicators.',
    tooltip: 'Colour reflects the most severe coded harm indicator. Cases with no harm coded appear as green — this does not imply no harm occurred.' },
  { id: 'stage',        label: 'Highest Stage',             styleBy: 'stage',
    desc: 'Styles cases by the highest coded escalation stage.',
    tooltip: 'Colour reflects the highest stage reached in analyst coding. Uncoded cases appear as grey.' },
  { id: 'status',       label: 'Coding Status',             styleBy: 'status',
    desc: 'Shows reviewed, coded, in progress, uncoded, or uncertain location status.',
    tooltip: 'Reflects coding completeness. Uncoded cases have no analyst-confirmed field values.' },
  { id: 'linkage',      label: 'Repeat Suspect / Vehicle Flags',   styleBy: 'status',
    desc: 'Flags cases with coded repeat suspect concern, repeat vehicle concern, or analyst linkage indicators. Analyst review required before treating as linked.',
    tooltip: 'This view shows cases where repeat suspect or vehicle flags have been coded, or where analyst linkage indicators are present. It does not confirm any cases are linked. Treat as a starting point for cross-case review only.' },
];

type LegendItem = {
  label: string;
  color: string;
  shape?: 'circle' | 'ring' | 'line' | 'diamond' | 'triangle' | 'alert-diamond';
};

const VIEW_LEGEND: Record<AnalyticView, LegendItem[]> = {
  distribution: [
    { label: 'Initial contact',        color: '#4A90D9', shape: 'circle' },
    { label: 'Incident location',      color: '#C0392B', shape: 'diamond' },
    { label: 'Destination',            color: '#10b981', shape: 'triangle' },
    { label: 'Uncertain / unverified', color: '#aaa',    shape: 'ring' },
  ],
  movement: [
    { label: 'Initial contact',        color: '#4A90D9', shape: 'circle' },
    { label: 'Incident location',      color: '#C0392B', shape: 'diamond' },
    { label: 'Destination',            color: '#10b981', shape: 'triangle' },
    { label: 'Coercive movement',      color: '#C0392B', shape: 'line' },
    { label: 'Vehicle movement',       color: '#E67E22', shape: 'line' },
    { label: 'Public → private',       color: '#8E44AD', shape: 'line' },
    { label: 'Cross-municipality',     color: '#4A90D9', shape: 'line' },
    { label: 'Other movement',         color: '#7A8694', shape: 'line' },
    { label: 'Uncertain / unverified', color: '#aaa',    shape: 'ring' },
  ],
  harm: [
    { label: 'Sexual assault',                  color: '#8B1538' },
    { label: 'Physical force',                  color: '#C0392B' },
    { label: 'Coercion',                        color: '#E67E22' },
    { label: 'Robbery',                         color: '#8E44AD' },
    { label: 'Multiple harms coded',            color: '#922B21' },
    { label: 'No severe harm indicator coded',  color: '#5D9B7A' },
    { label: 'Uncertain / unverified',          color: '#aaa', shape: 'ring' },
  ],
  stage: [
    { label: 'Sexual violence',        color: '#8B1538' },
    { label: 'Physical violence',      color: '#C0392B' },
    { label: 'Mixed severe harm',      color: '#922B21' },
    { label: 'Robbery / theft',        color: '#8E44AD' },
    { label: 'Coercion / control',     color: '#E67E22' },
    { label: 'Negotiation conflict',   color: '#4A90D9' },
    { label: 'No clear escalation',    color: '#7A8694' },
    { label: 'Uncertain / unverified', color: '#aaa', shape: 'ring' },
  ],
  status: [
    { label: 'Reviewed',               color: '#2F8F5B' },
    { label: 'Coded',                  color: '#4A90D9' },
    { label: 'In progress',            color: '#E67E22' },
    { label: 'Uncoded',                color: '#9A9188' },
    { label: 'Uncertain / unverified', color: '#aaa', shape: 'ring' },
  ],
  linkage: [
    { label: 'Both suspect + vehicle flagged', color: '#C0392B', shape: 'alert-diamond' },
    { label: 'Repeat suspect flagged',         color: '#E67E22', shape: 'alert-diamond' },
    { label: 'Repeat vehicle flagged',         color: '#8E44AD', shape: 'alert-diamond' },
    { label: 'Plate partial only',             color: '#4A90D9', shape: 'alert-diamond' },
    { label: 'Analyst linkage indicator',      color: '#B38B59', shape: 'alert-diamond' },
    { label: 'Uncertain / unverified',         color: '#aaa',    shape: 'ring' },
  ],
};

const DRAW_MODE_LABELS: Record<DrawMode, { label: string; title: string }> = {
  polygon:   { label: 'Draw Area',        title: 'Draw a freeform polygon to filter visible cases' },
  circle:    { label: 'Radius Search',    title: 'Draw a radius circle to filter visible cases' },
  rectangle: { label: 'Rectangle',        title: 'Draw a rectangle to filter visible cases' },
  buffer:    { label: 'Buffer Zone',      title: 'Click a point and set a buffer radius around it' },
};
type FilterShape = google.maps.Polygon | google.maps.Circle | google.maps.Rectangle | null;

interface GisLayer {
  id: string;
  name: string;
  color: string;
  opacity: number;
  visible: boolean;
  dataLayer: google.maps.Data;
}

// ── Color helpers ─────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  initial:     '#4A90D9',
  incident:    '#C0392B',
  destination: '#10b981',
} as const;

function getHarmColor(p: MapPoint): string {
  // Count coded harms for multi-harm detection
  let harmCount = 0;
  if (p.sexual_assault === 'yes') harmCount++;
  if (p.physical_force === 'yes') harmCount++;
  if (p.coercion === 'yes')       harmCount++;
  if (p.robbery_theft === 'yes')  harmCount++;

  if (harmCount >= 2) return '#922B21'; // Multi-harm — darker crimson
  if (p.sexual_assault === 'yes') return '#8B1538';
  if (p.physical_force === 'yes') return '#C0392B';
  if (p.coercion === 'yes')       return '#E67E22';
  if (p.robbery_theft === 'yes')  return '#8E44AD';
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

function getLinkageColor(p: MapPoint): string {
  const hasSuspect = _broadPos(p.repeat_suspect_flag) || _broadPos(p.known_repeat_suspect);
  const hasVehicle = _broadPos(p.repeat_vehicle_flag);
  if (hasSuspect && hasVehicle) return '#C0392B';    // both — red alert
  if (hasSuspect)               return '#E67E22';    // suspect only — orange
  if (hasVehicle)               return '#8E44AD';    // vehicle only — purple
  if ((p.plate_partial || '').trim().length > 0) return '#4A90D9'; // plate partial
  return '#B38B59';                                  // analyst indicator
}

function getMarkerColor(p: MapPoint, styleBy: StyleBy, pointType: keyof typeof TYPE_COLORS, view?: AnalyticView): string {
  if (view === 'linkage')   return getLinkageColor(p);
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

// SVG path strings for non-circle shapes
const DIAMOND_PATH   = 'M 0,-1 1,0 0,1 -1,0 Z';
const TRIANGLE_PATH  = 'M 0,1.15 1.05,-0.75 -1.05,-0.75 Z';  // downward triangle

function makeMarkerSymbol(
  color: string,
  pointType: 'initial' | 'incident' | 'destination',
  confidence: Confidence,
  view: AnalyticView = 'distribution',
  p?: MapPoint,
): google.maps.Symbol {
  const isUncertain = confidence === 'low';

  // Linkage view: bold alert diamonds — size and stroke vary by flag combination
  if (view === 'linkage') {
    const isBoth = p && _broadPos(p.repeat_suspect_flag) && _broadPos(p.repeat_vehicle_flag);
    return {
      path: DIAMOND_PATH,
      fillColor: isUncertain ? 'transparent' : color,
      fillOpacity: isUncertain ? 0 : 1.0,
      strokeColor: isBoth ? '#ffffff' : color,
      strokeWeight: isBoth ? 3 : 2,
      scale: isBoth ? 13 : 10,
    };
  }

  // Shapes by point type: circle / diamond / downward-triangle
  const path = pointType === 'incident' ? DIAMOND_PATH
             : pointType === 'destination' ? TRIANGLE_PATH
             : google.maps.SymbolPath.CIRCLE;

  const baseScale = pointType === 'incident' ? 8
                  : pointType === 'destination' ? 7
                  : 6;

  if (isUncertain) {
    return {
      path,
      fillColor: 'transparent',
      fillOpacity: 0,
      strokeColor: color,
      strokeWeight: 2,
      scale: baseScale + 1,
    };
  }

  return {
    path,
    fillColor: color,
    fillOpacity: 0.90,
    strokeColor: pointType === 'incident' ? '#ffffff' : color,
    strokeWeight: pointType === 'incident' ? 1.5 : 1,
    scale: baseScale,
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
      scale: 4,
      fillColor: color,
      fillOpacity: 0.95,
      strokeColor: color,
      strokeWeight: 1,
    },
    offset: '100%',
  };

  if (isAttempted) {
    return {
      strokeColor: color,
      strokeOpacity: 0,
      strokeWeight: 3,
      icons: [
        {
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.65, strokeWeight: 2.5, strokeColor: color, scale: 3 },
          offset: '0',
          repeat: '8px',
        },
        arrowIcon,
      ],
    };
  }

  return {
    strokeColor: color,
    strokeOpacity: 0.82,
    strokeWeight: 3.5,
    icons: [arrowIcon],
  };
}

// ── Attribute table columns ────────────────────────────────────────────────────
const ATTR_COLS: { key: keyof MapPoint; label: string; filterable?: boolean }[] = [
  { key: 'report_id',                      label: 'Case ID' },
  { key: 'incident_date',                  label: 'Date' },
  { key: 'city',                           label: 'Municipality',      filterable: true },
  { key: 'coding_status',                  label: 'Coding Status',     filterable: true },
  { key: 'highest_stage_reached',          label: 'Highest Stage',     filterable: true },
  { key: 'coercion',                       label: 'Coercion',          filterable: true },
  { key: 'physical_force',                 label: 'Physical' },
  { key: 'sexual_assault',                 label: 'Sexual' },
  { key: 'robbery_theft',                  label: 'Robbery' },
  { key: 'movement',                       label: 'Movement',          filterable: true },
  { key: 'vehicle_present',               label: 'Vehicle' },
  { key: 'plate_partial',                 label: 'Plate (partial)' },
  { key: 'repeat_suspect_flag',           label: 'Repeat Suspect',    filterable: true },
  { key: 'repeat_vehicle_flag',           label: 'Repeat Vehicle',    filterable: true },
  { key: 'initial_contact_address_raw',   label: 'Contact Location' },
  { key: 'incident_address_raw',          label: 'Incident Location' },
  { key: 'initial_contact_precision',     label: 'Precision' },
  { key: 'initial_contact_geocoding_status', label: 'Geocode Status', filterable: true },
];

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
function LegendSection({ analyticView }: { analyticView: AnalyticView }) {
  const items = VIEW_LEGEND[analyticView];
  const view = ANALYTIC_VIEWS.find(v => v.id === analyticView);
  return (
    <div>
      <SectionLabel>
        {view ? `Legend: ${view.label}` : 'Legend'}
      </SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: S.text2 }}>
            {item.shape === 'line' ? (
              <div style={{ width: 14, height: 2.5, background: item.color, borderRadius: 1, flexShrink: 0 }} />
            ) : item.shape === 'ring' ? (
              <div style={{ width: 9, height: 9, borderRadius: '50%', border: `2px solid ${item.color}`, background: 'transparent', flexShrink: 0 }} />
            ) : item.shape === 'diamond' ? (
              <div style={{ width: 9, height: 9, transform: 'rotate(45deg)', background: item.color, flexShrink: 0 }} />
            ) : item.shape === 'triangle' ? (
              <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `9px solid ${item.color}`, flexShrink: 0 }} />
            ) : item.shape === 'alert-diamond' ? (
              <div style={{ width: 10, height: 10, transform: 'rotate(45deg)', background: item.color, flexShrink: 0, boxShadow: `0 0 0 1.5px rgba(255,255,255,0.25)` }} />
            ) : (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            )}
            {item.label}
          </div>
        ))}
      </div>
      {(analyticView === 'harm' || analyticView === 'stage' || analyticView === 'status') && (
        <div style={{ fontSize: 9.5, color: S.text3, marginTop: 7, fontStyle: 'italic', lineHeight: 1.4 }}>
          Shape indicates location type: ● contact · ◆ incident · ▼ destination
        </div>
      )}
    </div>
  );
}

// ── Case panel sub-components ─────────────────────────────────────────────────
function CasePanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: S.text3, marginBottom: 5, fontFamily: 'DM Sans, sans-serif' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>{children}</div>
    </div>
  );
}

function CasePanelRow({ label, value, highlight, truncate }: { label: string; value: string; highlight?: boolean; truncate?: boolean }) {
  if (!value || value === '—' || value === 'Not coded') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 4, fontSize: 10.5, fontFamily: 'DM Sans, sans-serif' }}>
        <span style={{ color: S.text3 }}>{label}</span>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>{value || 'Not coded'}</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 4, fontSize: 10.5, fontFamily: 'DM Sans, sans-serif' }}>
      <span style={{ color: S.text3 }}>{label}</span>
      <span style={{
        color: highlight ? '#E67E22' : S.text2, fontWeight: highlight ? 600 : 400,
        overflow: truncate ? 'hidden' : 'visible',
        textOverflow: truncate ? 'ellipsis' : 'clip',
        whiteSpace: truncate ? 'nowrap' : 'normal',
        maxWidth: truncate ? 170 : 'none',
      }}>{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MapView() {
  const { isLoaded } = useMaps();

  const [stats, setStats] = useState<Stats | null>(null);

  // Layer toggles
  const [showInitial, setShowInitial]           = useState(true);
  const [showIncident, setShowIncident]         = useState(true);
  const [showDestination, setShowDestination]   = useState(false);
  const [showMovement, setShowMovement]         = useState(true);
  const [showArrows, setShowArrows]             = useState(true);
  const [showHeatmap, setShowHeatmap]           = useState(false);
  const [showClusters, setShowClusters]         = useState(false);

  // Harm patterning mode and individual toggles
  const [harmMode, setHarmMode] = useState<'primary' | 'all' | 'multi'>('primary');
  const [showHarmSexual, setShowHarmSexual]     = useState(true);
  const [showHarmPhysical, setShowHarmPhysical] = useState(true);
  const [showHarmCoercion, setShowHarmCoercion] = useState(true);
  const [showHarmRobbery, setShowHarmRobbery]   = useState(true);
  const [showHarmNone, setShowHarmNone]         = useState(true);

  // Movement sub-type toggles (used in 'movement' analytic view)
  const [showVehicleMovement, setShowVehicleMovement]     = useState(true);
  const [showCoerciveMovement, setShowCoerciveMovement]   = useState(true);
  const [showGeoShift, setShowGeoShift]                   = useState(true);
  const [showMultiFeatureOnly, setShowMultiFeatureOnly]   = useState(false);

  // Analytic view + styling
  const [analyticView, setAnalyticView] = useState<AnalyticView>('distribution');
  const [styleBy, setStyleBy]   = useState<StyleBy>('type');
  const [mapType, setMapType]   = useState<MapType>('roadmap');

  // Drawing / filter
  const [activeDrawMode, setActiveDrawMode] = useState<DrawMode | null>(null);
  const [filterShape, setFilterShape]       = useState<FilterShape>(null);

  // Buffer tool
  const [bufferGeoJson,     setBufferGeoJson]     = useState<Feature<Polygon | MultiPolygon> | null>(null);
  const [bufferOverlay,     setBufferOverlay]      = useState<google.maps.Polygon | null>(null);
  const [bufferRadiusInput, setBufferRadiusInput]  = useState('500');
  const [pendingBufferClick,setPendingBufferClick] = useState<google.maps.LatLng | null>(null);

  // GIS layers (replaces single boundary state)
  const [gisLayers,       setGisLayers]       = useState<GisLayer[]>([]);
  const layerFileRef                           = useRef<HTMLInputElement>(null);
  const [pendingLayerFile, setPendingLayerFile] = useState<{ json: object; defaultName: string } | null>(null);
  const [pendingLayerName, setPendingLayerName] = useState<string | null>(null);
  const [pendingLayerColor,setPendingLayerColor]= useState('#4A90D9');

  // Attribute table
  const [attrTableOpen, setAttrTableOpen] = useState(false);
  const [attrSortCol,   setAttrSortCol]   = useState<keyof MapPoint>('incident_date');
  const [attrSortAsc,   setAttrSortAsc]   = useState(false);
  const [attrActiveRow, setAttrActiveRow] = useState<string | null>(null);
  const [attrFilterValues, setAttrFilterValues] = useState<Partial<Record<keyof MapPoint, string>>>({});

  // Measure tool
  const [measureActive, setMeasureActive] = useState(false);
  const [measurePointA, setMeasurePointA] = useState<google.maps.LatLng | null>(null);
  const [measurePointB, setMeasurePointB] = useState<google.maps.LatLng | null>(null);
  const measureMarkerA = useRef<google.maps.Marker | null>(null);
  const measureMarkerB = useRef<google.maps.Marker | null>(null);
  const measureLine    = useRef<google.maps.Polyline | null>(null);

  // InfoWindow
  const [openWindow, setOpenWindow] = useState<InfoWindowKey | null>(null);

  // Selected case side panel
  const [selectedCaseId, setSelectedCaseId]         = useState<string | null>(null);
  const [selectedCaseReport, setSelectedCaseReport] = useState<Record<string, string> | null>(null);
  const [selectedCasePanelOpen, setSelectedCasePanelOpen] = useState(false);

  // Linkage candidate set
  const [linkageCandidates, setLinkageCandidates] = useState<Set<string>>(new Set());

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
    // Buffer branch (Turf.js)
    if (bufferGeoJson && isLoaded) {
      return points.filter((p) => {
        const coords: [number, number][] = [
          p.lon_initial  != null && p.lat_initial  != null ? [p.lon_initial,  p.lat_initial]  : null,
          p.lon_incident != null && p.lat_incident != null ? [p.lon_incident, p.lat_incident] : null,
          p.lon_destination != null && p.lat_destination != null ? [p.lon_destination, p.lat_destination] : null,
        ].filter((c): c is [number, number] => c !== null);
        if (coords.length === 0) return false;
        return coords.some((c) => turf.booleanPointInPolygon(turf.point(c), bufferGeoJson));
      });
    }
    // Shape filter branch (Google Maps geometry)
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
  }, [points, filterShape, bufferGeoJson, isLoaded]);

  const hasAny = useMemo(() => filteredPoints.some((p) => p.lat_initial || p.lat_incident), [filteredPoints]);
  const hasActiveFilter = useMemo(() => filterShape !== null || bufferGeoJson !== null, [filterShape, bufferGeoJson]);

  // ── Spatial summary stats ───────────────────────────────────────────────────
  const spatialSummary = useMemo(() => {
    if (!hasActiveFilter || filteredPoints.length === 0) return null;
    const coded   = filteredPoints.filter(p => p.coding_status === 'coded' || p.coding_status === 'reviewed').length;
    const withMov = filteredPoints.filter(p => p.movement === 'yes').length;
    const uncertain = filteredPoints.filter(p => {
      const c = getConfidence(p.location_certainty);
      return c === 'low' || c === 'unknown';
    }).length;
    const ptsInitial = filteredPoints.filter(p => p.lat_initial && p.lon_initial).length;
    const ptsIncident = filteredPoints.filter(p => p.lat_incident && p.lon_incident).length;
    const ptsDestination = filteredPoints.filter(p => p.lat_destination && p.lon_destination).length;
    const harmCounts: Record<string, number> = {};
    filteredPoints.forEach(p => {
      const h = p.sexual_assault === 'yes' ? 'Sexual assault'
        : p.physical_force === 'yes' ? 'Physical force'
        : p.coercion === 'yes' ? 'Coercion'
        : p.robbery_theft === 'yes' ? 'Robbery' : null;
      if (h) harmCounts[h] = (harmCounts[h] || 0) + 1;
    });
    const topHarm = Object.entries(harmCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const stageCounts: Record<string, number> = {};
    filteredPoints.forEach(p => {
      const s = (p.highest_stage_reached || '').split('|')[0].trim();
      if (s && s !== 'unknown') stageCounts[s] = (stageCounts[s] || 0) + 1;
    });
    const topStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { total: filteredPoints.length, coded, uncoded: filteredPoints.length - coded, withMov, uncertain, topHarm, topStage, ptsInitial, ptsIncident, ptsDestination };
  }, [filteredPoints, hasActiveFilter]);

  // ── Linkage candidate helpers ───────────────────────────────────────────────
  const isLinkageCandidate = useCallback((p: MapPoint): boolean => {
    return (
      _broadPos(p.repeat_suspect_flag) ||
      _broadPos(p.known_repeat_suspect) ||
      _broadPos(p.repeat_vehicle_flag) ||
      (p.plate_partial || '').trim().length > 0 ||
      (p.suspect_distinctive_features || '').trim().length > 0 ||
      (p.vehicle_description || '').trim().length > 0 ||
      linkageCandidates.has(p.report_id)
    );
  }, [linkageCandidates]);

  const displayPoints = useMemo(() =>
    analyticView === 'linkage'
      ? filteredPoints.filter(isLinkageCandidate)
      : filteredPoints,
  [filteredPoints, analyticView, isLinkageCandidate]);

  const harmFilteredPoints = useMemo(() => {
    if (analyticView !== 'harm') return displayPoints;

    const hasMultiHarm = (p: MapPoint): boolean => {
      let count = 0;
      if (p.sexual_assault === 'yes') count++;
      if (p.physical_force === 'yes') count++;
      if (p.coercion === 'yes') count++;
      if (p.robbery_theft === 'yes') count++;
      return count >= 2;
    };

    if (harmMode === 'multi') return displayPoints.filter(hasMultiHarm);

    return displayPoints.filter(p => {
      if (p.sexual_assault === 'yes' && showHarmSexual)   return true;
      if (p.physical_force === 'yes' && showHarmPhysical) return true;
      if (p.coercion === 'yes' && showHarmCoercion)        return true;
      if (p.robbery_theft === 'yes' && showHarmRobbery)    return true;
      // No severe harm coded
      const noHarm = p.sexual_assault !== 'yes' && p.physical_force !== 'yes' && p.coercion !== 'yes' && p.robbery_theft !== 'yes';
      if (noHarm && showHarmNone) return true;
      return false;
    });
  }, [displayPoints, analyticView, harmMode, showHarmSexual, showHarmPhysical, showHarmCoercion, showHarmRobbery, showHarmNone]);

  const renderPoints = useMemo(() => {
    if (analyticView !== 'movement' || !showMultiFeatureOnly) return harmFilteredPoints;
    return harmFilteredPoints.filter(p => {
      let count = 0;
      if (p.entered_vehicle === 'yes') count++;
      if (p.coercion === 'yes') count++;
      if (p.public_to_private_shift === 'yes') count++;
      if (p.cross_municipality === 'yes') count++;
      return count >= 2;
    });
  }, [harmFilteredPoints, analyticView, showMultiFeatureOnly]);

  // ── Analytic view configurator ──────────────────────────────────────────────
  const applyAnalyticView = (v: AnalyticView) => {
    setAnalyticView(v);
    const cfg = ANALYTIC_VIEWS.find(a => a.id === v);
    if (cfg) setStyleBy(cfg.styleBy);
    if (v === 'movement') {
      setShowMovement(true); setShowArrows(true);
      setShowInitial(true); setShowIncident(true); setShowDestination(true);
    } else if (v === 'linkage') {
      setShowMovement(false);
    }
  };

  // ── Attribute table sorted data ─────────────────────────────────────────────
  const sortedAttrPoints = useMemo(() => {
    const filtered = filteredPoints.filter(p => {
      for (const [key, val] of Object.entries(attrFilterValues)) {
        if (!val) continue;
        const cellVal = String(p[key as keyof MapPoint] ?? '').toLowerCase();
        if (!cellVal.includes(val.toLowerCase())) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      const cmp = String(a[attrSortCol] ?? '').localeCompare(String(b[attrSortCol] ?? ''), undefined, { numeric: true });
      return attrSortAsc ? cmp : -cmp;
    });
  }, [filteredPoints, attrSortCol, attrSortAsc, attrFilterValues]);

  // Clear active row when filter changes
  useEffect(() => { setAttrActiveRow(null); }, [filteredPoints]);

  // ── Measure distance ─────────────────────────────────────────────────────────
  const measuredDistance = useMemo(() => {
    if (!measurePointA || !measurePointB || !isLoaded) return null;
    const m = google.maps.geometry.spherical.computeDistanceBetween(measurePointA, measurePointB);
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
  }, [measurePointA, measurePointB, isLoaded]);

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
    displayPoints.forEach((p) => {
      const conf = getConfidence(p.location_certainty);
      if (showInitial && p.lat_initial && p.lon_initial) {
        const col = getMarkerColor(p, styleBy, 'initial', analyticView);
        markers.push(new google.maps.Marker({
          position: { lat: p.lat_initial, lng: p.lon_initial },
          icon: makeMarkerSymbol(col, 'initial', conf, analyticView, p),
        }));
      }
      if (showIncident && p.lat_incident && p.lon_incident) {
        const col = getMarkerColor(p, styleBy, 'incident', analyticView);
        markers.push(new google.maps.Marker({
          position: { lat: p.lat_incident, lng: p.lon_incident },
          icon: makeMarkerSymbol(col, 'incident', conf, analyticView, p),
        }));
      }
      if (showDestination && p.lat_destination && p.lon_destination) {
        const col = getMarkerColor(p, styleBy, 'destination', analyticView);
        markers.push(new google.maps.Marker({
          position: { lat: p.lat_destination, lng: p.lon_destination },
          icon: makeMarkerSymbol(col, 'destination', conf, analyticView, p),
        }));
      }
    });
    clusterMarkersRef.current = markers;
    const clusterRenderer: Renderer = {
      render({ count, position }) {
        const size = count > 20 ? 36 : count > 5 ? 30 : 24;
        const color = count > 20 ? '#ef4444' : count > 5 ? '#f59e0b' : '#4a90d9';
        return new google.maps.Marker({
          position,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: color,
            fillOpacity: 0.92,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: size / 4,
          },
          label: {
            text: String(count),
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: '700',
          },
          zIndex: 1000 + count,
        });
      },
    };
    clustererRef.current = new MarkerClusterer({ map, markers, renderer: clusterRenderer });
  }, [map, isLoaded, showClusters, displayPoints, showInitial, showIncident, showDestination, styleBy]);

  // ── GIS layer cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      gisLayers.forEach((l) => l.dataLayer.setMap(null));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Street view ─────────────────────────────────────────────────────────────
  const openStreetView = (lat: number, lng: number) => {
    if (!map) return;
    const sv = map.getStreetView();
    sv.setPosition({ lat, lng });
    sv.setVisible(true);
  };

  const fetchSelectedCase = useCallback(async (reportId: string) => {
    try {
      const report = await api.getReport(reportId);
      setSelectedCaseReport(report as unknown as Record<string, string>);
      setSelectedCaseId(reportId);
      setSelectedCasePanelOpen(true);
    } catch { /* silently fail — popup still works */ }
  }, []);

  // ── Address search ──────────────────────────────────────────────────────────
  const onPlaceChanged = () => {
    if (!autocompleteRef.current || !map) return;
    const place = autocompleteRef.current.getPlace();
    if (place.geometry?.viewport) map.fitBounds(place.geometry.viewport);
    else if (place.geometry?.location) { map.setCenter(place.geometry.location); map.setZoom(13); }
  };

  // ── Drawing handlers ────────────────────────────────────────────────────────
  const clearFilter = () => {
    if (filterShape) { filterShape.setMap(null); setFilterShape(null); }
    if (bufferOverlay) { bufferOverlay.setMap(null); setBufferOverlay(null); }
    setBufferGeoJson(null);
    setPendingBufferClick(null);
  };

  const onPolygonComplete   = (s: google.maps.Polygon)   => { if (filterShape) filterShape.setMap(null); setFilterShape(s); setActiveDrawMode(null); };
  const onCircleComplete    = (s: google.maps.Circle)    => { if (filterShape) filterShape.setMap(null); setFilterShape(s); setActiveDrawMode(null); };
  const onRectangleComplete = (s: google.maps.Rectangle) => { if (filterShape) filterShape.setMap(null); setFilterShape(s); setActiveDrawMode(null); };

  const getGoogleDrawMode = (): google.maps.drawing.OverlayType | null => {
    if (!activeDrawMode || activeDrawMode === 'buffer') return null;
    if (activeDrawMode === 'polygon')   return google.maps.drawing.OverlayType.POLYGON;
    if (activeDrawMode === 'circle')    return google.maps.drawing.OverlayType.CIRCLE;
    if (activeDrawMode === 'rectangle') return google.maps.drawing.OverlayType.RECTANGLE;
    return null;
  };

  // ── Buffer tool ─────────────────────────────────────────────────────────────
  const applyBuffer = (center: google.maps.LatLng, radiusMeters: number) => {
    if (!map) return;
    const pt = turf.point([center.lng(), center.lat()]);
    const buffered = turf.buffer(pt, radiusMeters / 1000, { units: 'kilometers' });
    if (!buffered) return;
    setBufferGeoJson(buffered);

    // Remove existing overlays
    if (bufferOverlay) { bufferOverlay.setMap(null); }
    if (filterShape)   { filterShape.setMap(null); setFilterShape(null); }

    // Render as Google Maps Polygon (use first ring; handles both Polygon and MultiPolygon)
    const firstRing = (
      buffered.geometry.type === 'MultiPolygon'
        ? buffered.geometry.coordinates[0][0]
        : buffered.geometry.coordinates[0]
    ) as [number, number][];
    const poly = new google.maps.Polygon({
      paths: firstRing.map(([lng, lat]) => ({ lat, lng })),
      fillColor: '#E67E22', fillOpacity: 0.10,
      strokeColor: '#E67E22', strokeWeight: 2,
      map,
    });
    setBufferOverlay(poly);
    setPendingBufferClick(null);
    setActiveDrawMode(null);
  };

  // ── GIS layer handlers ──────────────────────────────────────────────────────
  const handleLayerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !map) return;
    const defaultName = file.name.replace(/\.(geojson|json)$/i, '');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        setPendingLayerFile({ json, defaultName });
        setPendingLayerName(defaultName);
        setPendingLayerColor('#4A90D9');
      } catch { alert('Invalid GeoJSON file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmAddLayer = () => {
    if (!pendingLayerFile || !map) return;
    const color = pendingLayerColor;
    const dataLayer = new google.maps.Data({ map });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer.addGeoJson(pendingLayerFile.json as any);
    dataLayer.setStyle({
      fillColor: color, fillOpacity: 0.08,
      strokeColor: color, strokeWeight: 1.5,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const newLayer: GisLayer = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      name: pendingLayerName || pendingLayerFile.defaultName,
      color,
      opacity: 0.08,
      visible: true,
      dataLayer,
    };
    setGisLayers((prev) => [...prev, newLayer]);
    setPendingLayerFile(null);
    setPendingLayerName(null);
  };

  const toggleLayerVisibility = (id: string, visible: boolean) => {
    setGisLayers((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      l.dataLayer.setStyle({
        fillColor: l.color, fillOpacity: visible ? l.opacity : 0,
        strokeColor: l.color, strokeWeight: visible ? 1.5 : 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      return { ...l, visible };
    }));
  };

  const removeLayer = (id: string) => {
    setGisLayers((prev) => {
      const layer = prev.find((l) => l.id === id);
      if (layer) { layer.dataLayer.setMap(null); }
      return prev.filter((l) => l.id !== id);
    });
  };

  const changeLayerColor = (id: string, color: string) => {
    setGisLayers((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      l.dataLayer.setStyle({
        fillColor: color, fillOpacity: l.visible ? l.opacity : 0,
        strokeColor: color, strokeWeight: l.visible ? 1.5 : 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      return { ...l, color };
    }));
  };

  // ── Measure tool handlers ───────────────────────────────────────────────────
  const clearMeasure = () => {
    if (measureMarkerA.current) { measureMarkerA.current.setMap(null); measureMarkerA.current = null; }
    if (measureMarkerB.current) { measureMarkerB.current.setMap(null); measureMarkerB.current = null; }
    if (measureLine.current)    { measureLine.current.setMap(null);    measureLine.current = null; }
    setMeasurePointA(null);
    setMeasurePointB(null);
  };

  // ── Attribute table handlers ─────────────────────────────────────────────────
  const handleAttrRowClick = (p: MapPoint) => {
    setAttrActiveRow(p.report_id);
    if (!map || !p.lat_initial || !p.lon_initial) return;
    // Auto-disable clusters so InfoWindow is visible
    if (showClusters) setShowClusters(false);
    map.panTo({ lat: p.lat_initial, lng: p.lon_initial });
    map.setZoom(15);
    setOpenWindow({ reportId: p.report_id, type: 'initial' });
  };

  const handleAttrSort = (col: keyof MapPoint) => {
    if (attrSortCol === col) {
      setAttrSortAsc((v) => !v);
    } else {
      setAttrSortCol(col);
      setAttrSortAsc(true);
    }
  };

  // ── Map click handler ───────────────────────────────────────────────────────
  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;

    // Measure tool
    if (measureActive) {
      if (!measurePointA) {
        setMeasurePointA(e.latLng);
        if (measureMarkerA.current) measureMarkerA.current.setMap(null);
        measureMarkerA.current = new google.maps.Marker({
          position: e.latLng, map: map!,
          label: { text: 'A', color: '#fff', fontSize: '10px', fontWeight: '700' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9, fillColor: S.accent, fillOpacity: 1,
            strokeColor: '#fff', strokeWeight: 2,
          },
        });
      } else if (!measurePointB) {
        setMeasurePointB(e.latLng);
        if (measureMarkerB.current) measureMarkerB.current.setMap(null);
        measureMarkerB.current = new google.maps.Marker({
          position: e.latLng, map: map!,
          label: { text: 'B', color: '#fff', fontSize: '10px', fontWeight: '700' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9, fillColor: S.accent, fillOpacity: 1,
            strokeColor: '#fff', strokeWeight: 2,
          },
        });
        if (measureLine.current) measureLine.current.setMap(null);
        measureLine.current = new google.maps.Polyline({
          path: [measurePointA, e.latLng],
          strokeColor: S.accent, strokeWeight: 2.5, strokeOpacity: 0.85, map: map!,
        });
      } else {
        clearMeasure();
      }
      return;
    }

    // Buffer click
    if (activeDrawMode === 'buffer') {
      setPendingBufferClick(e.latLng);
      return;
    }

    setOpenWindow(null);
  };

  // ── Heatmap data ─────────────────────────────────────────────────────────────
  const heatmapData = useMemo(() => {
    if (!isLoaded) return [];
    return displayPoints.flatMap((p) => {
      const result: google.maps.LatLng[] = [];
      if (p.lat_initial && p.lon_initial)   result.push(new google.maps.LatLng(p.lat_initial, p.lon_initial));
      if (p.lat_incident && p.lon_incident) result.push(new google.maps.LatLng(p.lat_incident, p.lon_incident));
      return result;
    });
  }, [displayPoints, isLoaded]);

  // ── Reset workspace ─────────────────────────────────────────────────────────
  const resetWorkspace = () => {
    clearFilter();
    clearMeasure();
    setMeasureActive(false);
    setActiveDrawMode(null);
    setAnalyticView('distribution');
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

    // View-specific content
    let viewContent: React.ReactNode = null;

    if (analyticView === 'harm' || analyticView === 'distribution') {
      viewContent = (
        <>
          {harmFlags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
              {harmFlags.map((f) => (
                <span key={f} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#FDF2F2', color: '#A51F1F', border: '1px solid #F5C6C6' }}>{f}</span>
              ))}
            </div>
          )}
          {p.highest_stage_reached && p.highest_stage_reached !== 'unknown' && (
            <div style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, background: '#EAF3FA', color: '#1E5A8F', border: '1px solid #BFDBFE', marginBottom: 6 }}>
              Stage: {p.highest_stage_reached}
            </div>
          )}
        </>
      );
    } else if (analyticView === 'movement') {
      viewContent = (
        <div style={{ fontSize: 11, color: '#5A6A78', marginBottom: 6, lineHeight: 1.6 }}>
          {p.movement === 'yes' && <div><strong>Movement:</strong> {p.movement_completed === 'yes' ? 'Completed' : 'Present'}</div>}
          {p.mode_of_movement && <div><strong>Mode:</strong> {p.mode_of_movement}</div>}
          {p.entered_vehicle === 'yes' && <div>Entered vehicle</div>}
          {p.offender_control_over_movement && p.offender_control_over_movement !== 'none indicated' && (
            <div><strong>Control:</strong> {p.offender_control_over_movement}</div>
          )}
          {p.public_to_private_shift === 'yes' && <div>Public → private shift</div>}
          {p.cross_municipality === 'yes' && <div>Cross-municipality</div>}
        </div>
      );
    } else if (analyticView === 'stage') {
      const stages = (p.highest_stage_reached || '').split('|').map(s => s.trim()).filter(Boolean);
      viewContent = stages.length > 0 ? (
        <div style={{ marginBottom: 6 }}>
          {stages.map((st) => (
            <div key={st} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#EAF3FA', color: '#1E5A8F', border: '1px solid #BFDBFE', marginBottom: 3, display: 'inline-block', marginRight: 3 }}>{st}</div>
          ))}
        </div>
      ) : <div style={{ fontSize: 11, color: '#9A9AA0', marginBottom: 6 }}>No stage coded</div>;
    } else if (analyticView === 'status') {
      viewContent = (
        <div style={{ fontSize: 11, color: '#5A6A78', marginBottom: 6, lineHeight: 1.7 }}>
          <div><strong>Status:</strong> {(p.coding_status || 'uncoded').replace('_', ' ')}</div>
          {harmFlags.length > 0 && <div><strong>Harm flags:</strong> {harmFlags.join(', ')}</div>}
        </div>
      );
    } else if (analyticView === 'linkage') {
      viewContent = (
        <div style={{ fontSize: 11, color: '#5A6A78', marginBottom: 6, lineHeight: 1.7 }}>
          {p.repeat_suspect_flag && p.repeat_suspect_flag !== 'no' && <div>Repeat suspect flag: <strong>{p.repeat_suspect_flag}</strong></div>}
          {p.known_repeat_suspect && p.known_repeat_suspect !== 'no' && <div>Known/repeat indicator: <strong>{p.known_repeat_suspect}</strong></div>}
          {p.repeat_vehicle_flag && p.repeat_vehicle_flag !== 'no' && <div>Repeat vehicle flag: <strong>{p.repeat_vehicle_flag}</strong></div>}
          {p.plate_partial && <div>Plate: <strong>{p.plate_partial}</strong></div>}
          {p.suspect_distinctive_features && <div>Distinctive: <strong>{p.suspect_distinctive_features.slice(0, 60)}</strong></div>}
        </div>
      );
    }

    return (
      <InfoWindow position={{ lat, lng: lon }} onCloseClick={() => setOpenWindow(null)}>
        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, minWidth: 200, maxWidth: 240 }}>
          {/* Header — same for all views */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: 'Lora, serif', fontSize: 13.5, fontWeight: 600, color: '#0B1F33' }}>{p.report_id}</span>
            {p.coding_status && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: statusColor + '18', color: statusColor, border: `1px solid ${statusColor}40`, textTransform: 'capitalize' }}>
                {p.coding_status.replace('_', ' ')}
              </span>
            )}
          </div>
          <div style={{ color: '#5A6A78', fontSize: 11.5, marginBottom: 6, lineHeight: 1.5 }}>
            {p.incident_date && <div>{p.incident_date}</div>}
            {p.city && <div>{p.city}</div>}
            <div style={{ color: '#9A9AA0', marginTop: 1 }}>{label}</div>
          </div>

          {viewContent}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 7, borderTop: '1px solid #EDEBE6', alignItems: 'center', marginTop: 2 }}>
            <button onClick={() => navigate(`/code/${p.report_id}`)} style={{ fontSize: 11, fontWeight: 600, color: '#0B1F33', background: '#EAF3FA', border: '1px solid #BFDBFE', borderRadius: 5, cursor: 'pointer', padding: '3px 10px', fontFamily: 'DM Sans, sans-serif' }}>Open case</button>
            <button onClick={() => { setOpenWindow(null); openStreetView(lat, lon); }} style={{ fontSize: 11, color: '#1a73e8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'DM Sans, sans-serif' }}>Street View</button>
            <button onClick={() => fetchSelectedCase(p.report_id)} style={{ fontSize: 11, color: '#1E5A8F', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'DM Sans, sans-serif' }}>Full details</button>
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
    flex: 1, padding: '5px 2px', fontSize: 10.5, fontFamily: 'DM Sans, sans-serif',
    cursor: 'pointer', borderRadius: 5,
    border: `1px solid ${activeDrawMode === mode ? S.accent : 'rgba(255,255,255,0.15)'}`,
    background: activeDrawMode === mode ? S.accent : 'rgba(255,255,255,0.05)',
    color: activeDrawMode === mode ? '#fff' : S.text2,
    fontWeight: activeDrawMode === mode ? 600 : 400,
    transition: 'all 0.15s',
    minWidth: 0,
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

  const toolBtnStyle = (active = false): React.CSSProperties => ({
    width: '100%', padding: '6px 0', fontSize: 12,
    fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', borderRadius: 6,
    border: `1px solid ${active ? S.accent : 'rgba(255,255,255,0.12)'}`,
    background: active ? 'rgba(179,139,89,0.18)' : 'rgba(255,255,255,0.05)',
    color: active ? S.accent : S.text2,
    transition: 'all 0.15s',
  });

  // ── Shared modal overlay style ────────────────────────────────────────────────
  const modalStyle: React.CSSProperties = {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 20,
    background: S.bg2,
    border: `1px solid ${S.border}`,
    borderRadius: 10,
    padding: '16px 20px',
    boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
    fontFamily: 'DM Sans, sans-serif',
    color: S.text1,
    display: 'flex', flexDirection: 'column', gap: 12,
    minWidth: 240,
  };

  const modalInputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', fontSize: 12,
    fontFamily: 'DM Sans, sans-serif',
    background: 'rgba(255,255,255,0.07)', color: S.text1,
    border: `1px solid rgba(255,255,255,0.18)`, borderRadius: 6,
    outline: 'none', boxSizing: 'border-box',
  };

  const modalBtnPrimary: React.CSSProperties = {
    flex: 1, padding: '6px 0', fontSize: 12, fontFamily: 'DM Sans, sans-serif',
    background: S.accent, color: '#fff', border: 'none',
    borderRadius: 6, cursor: 'pointer', fontWeight: 600,
  };

  const modalBtnSecondary: React.CSSProperties = {
    flex: 1, padding: '6px 0', fontSize: 12, fontFamily: 'DM Sans, sans-serif',
    background: 'rgba(255,255,255,0.06)', color: S.text2,
    border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 6, cursor: 'pointer',
  };

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
            GIS Analysis Workspace
          </div>
          <div style={{ fontSize: 10.5, color: S.text3, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 }}>
            {hasActiveFilter
              ? `${filteredPoints.length} of ${points.length} cases in filter`
              : `${points.length} case${points.length !== 1 ? 's' : ''} geocoded`}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(179,139,89,0.55)', fontFamily: 'DM Sans, sans-serif', marginTop: 2, fontStyle: 'italic' }}>
            Narrative coding · mobility · spatial analysis
          </div>
        </div>

        {/* Data sufficiency notice */}
        <div style={{
          padding: '6px 12px',
          background: 'rgba(179,139,89,0.07)',
          borderBottom: `1px solid rgba(179,139,89,0.15)`,
          fontSize: 10, color: 'rgba(179,139,89,0.7)',
          fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5,
          fontStyle: 'italic',
        }}>
          Map outputs reflect only coded and geocoded fields. Absence of a point, pathway, or flag does not mean absence in the original report.
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
              {analyticView === 'movement' && showMovement && (
                <>
                  <div style={{ fontSize: 10, color: S.text3, padding: '4px 0 2px', borderTop: `1px solid ${S.border}`, marginTop: 2 }}>Movement type filters</div>
                  <LayerToggle label="Vehicle movement" colorShape="line" color="#E67E22" checked={showVehicleMovement} onChange={setShowVehicleMovement} />
                  <LayerToggle label="Coercive movement" colorShape="line" color="#C0392B" checked={showCoerciveMovement} onChange={setShowCoerciveMovement} />
                  <LayerToggle label="Geography shift" colorShape="line" color="#8E44AD" checked={showGeoShift} onChange={setShowGeoShift} />
                  <div style={{ fontSize: 10, color: S.text3, padding: '4px 0 2px', borderTop: `1px solid ${S.border}`, marginTop: 2 }}>Case filter</div>
                  <LayerToggle label="Multi-feature only" color={S.accent} checked={showMultiFeatureOnly} onChange={setShowMultiFeatureOnly} />
                </>
              )}
            </div>
          </div>

          <SidebarDivider />

          {analyticView === 'harm' && (
            <>
              <SidebarDivider />
              <div>
                <SectionLabel>Harm patterning mode</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {(['primary','all','multi'] as const).map((mode) => {
                    const labels = { primary: 'Primary harm only', all: 'All coded harms', multi: 'Multi-harm cases only' };
                    const descs = {
                      primary: 'Each case shown by most severe harm',
                      all: 'Each harm layer shown independently',
                      multi: 'Only cases with 2+ coded harms',
                    };
                    return (
                      <label key={mode} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', padding: '3px 5px', borderRadius: 4, background: harmMode === mode ? 'rgba(179,139,89,0.15)' : 'transparent' }}>
                        <input type="radio" name="harmMode" value={mode} checked={harmMode === mode} onChange={() => setHarmMode(mode)} style={{ display: 'none' }} />
                        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 3, border: `2px solid ${harmMode === mode ? S.accent : 'rgba(255,255,255,0.3)'}`, background: harmMode === mode ? S.accent : 'transparent' }} />
                        <div>
                          <div style={{ fontSize: 11.5, color: harmMode === mode ? S.text1 : S.text2, fontWeight: harmMode === mode ? 600 : 400 }}>{labels[mode]}</div>
                          <div style={{ fontSize: 10, color: S.text3 }}>{descs[mode]}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {harmMode !== 'multi' && (
                  <>
                    <div style={{ fontSize: 10, color: S.text3, marginBottom: 5 }}>Show harm categories</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <LayerToggle label="Sexual assault" color="#8B1538" checked={showHarmSexual} onChange={setShowHarmSexual} />
                      <LayerToggle label="Physical force" color="#C0392B" checked={showHarmPhysical} onChange={setShowHarmPhysical} />
                      <LayerToggle label="Coercion" color="#E67E22" checked={showHarmCoercion} onChange={setShowHarmCoercion} />
                      <LayerToggle label="Robbery" color="#8E44AD" checked={showHarmRobbery} onChange={setShowHarmRobbery} />
                      <LayerToggle label="No severe harm coded" color="#5D9B7A" checked={showHarmNone} onChange={setShowHarmNone} />
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* ── Overlay Layers ────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Overlays</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <LayerToggle label="Heatmap" checked={showHeatmap} onChange={setShowHeatmap} />
              <LayerToggle label="Cluster markers" checked={showClusters} onChange={setShowClusters} />
            </div>
          </div>

          <SidebarDivider />

          {/* ── Analytic View ─────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Analytic View</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {ANALYTIC_VIEWS.map((v) => (
                <label key={v.id} title={v.desc} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: '4px 6px',
                  borderRadius: 5,
                  background: analyticView === v.id ? 'rgba(179,139,89,0.18)' : 'transparent',
                  transition: 'background 0.15s',
                }}>
                  <input type="radio" name="analyticView" value={v.id}
                    checked={analyticView === v.id}
                    onChange={() => applyAnalyticView(v.id)}
                    style={{ display: 'none' }} />
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                    border: `2px solid ${analyticView === v.id ? S.accent : 'rgba(255,255,255,0.3)'}`,
                    background: analyticView === v.id ? S.accent : 'transparent',
                    transition: 'all 0.15s',
                  }} />
                  <div>
                    <div style={{ fontSize: 12, color: analyticView === v.id ? S.text1 : S.text2, fontWeight: analyticView === v.id ? 600 : 400 }}>
                      {v.label}
                    </div>
                    <div style={{ fontSize: 10, color: S.text3, lineHeight: 1.3, marginTop: 1 }}>{v.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <SidebarDivider />

          {/* ── Spatial Filter ────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Spatial Filter</SectionLabel>
            {hasActiveFilter ? (
              <div>
                {/* Spatial summary panel */}
                {spatialSummary && (
                  <div style={{
                    background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(255,255,255,0.10)`,
                    borderRadius: 6, padding: '8px 10px', marginBottom: 8, fontSize: 11,
                    fontFamily: 'DM Sans, sans-serif', color: S.text2,
                    display: 'flex', flexDirection: 'column', gap: 3,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: S.text3 }}>Cases in area</span>
                      <span style={{ color: S.accent, fontWeight: 700 }}>{spatialSummary.total}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: S.text3 }}>Coded / uncoded</span>
                      <span>{spatialSummary.coded} / {spatialSummary.uncoded}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: S.text3 }}>With movement</span>
                      <span>{spatialSummary.withMov}</span>
                    </div>
                    {spatialSummary.uncertain > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: S.text3 }}>Uncertain location</span>
                        <span style={{ color: '#E67E22' }}>{spatialSummary.uncertain}</span>
                      </div>
                    )}
                    {spatialSummary.topHarm && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: S.text3 }}>Most common harm</span>
                        <span style={{ maxWidth: 90, textAlign: 'right', lineHeight: 1.2 }}>{spatialSummary.topHarm}</span>
                      </div>
                    )}
                    {spatialSummary.topStage && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: S.text3 }}>Most common stage</span>
                        <span style={{ maxWidth: 90, textAlign: 'right', lineHeight: 1.2 }}>{spatialSummary.topStage}</span>
                      </div>
                    )}
                    <div style={{ borderTop: `1px solid rgba(255,255,255,0.08)`, paddingTop: 5, marginTop: 2 }}>
                      <div style={{ color: S.text3, marginBottom: 3 }}>Points in area</div>
                      {spatialSummary.ptsInitial > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: S.text3 }}>Initial contact</span>
                          <span>{spatialSummary.ptsInitial}</span>
                        </div>
                      )}
                      {spatialSummary.ptsIncident > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: S.text3 }}>Incident</span>
                          <span>{spatialSummary.ptsIncident}</span>
                        </div>
                      )}
                      {spatialSummary.ptsDestination > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: S.text3 }}>Destination</span>
                          <span>{spatialSummary.ptsDestination}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 9.5, color: S.text3, fontStyle: 'italic', marginTop: 2 }}>
                      Analyst review recommended before drawing conclusions
                    </div>
                  </div>
                )}
                {/* View in table button */}
                <button
                  onClick={() => setAttrTableOpen(true)}
                  style={{
                    width: '100%', padding: '5px 0', fontSize: 11, fontFamily: 'DM Sans, sans-serif',
                    background: 'rgba(179,139,89,0.12)', color: S.accent,
                    border: `1px solid rgba(179,139,89,0.3)`, borderRadius: 5, cursor: 'pointer', marginBottom: 6,
                  }}
                >
                  View selected cases in table
                </button>
                {/* Export selection */}
                {filteredPoints.length > 0 && (() => {
                  const filteredIds = filteredPoints.map(p => p.report_id);
                  const exportBtnStyle: React.CSSProperties = {
                    width: '100%', padding: '5px 0', fontSize: 11,
                    fontFamily: 'DM Sans, sans-serif',
                    background: 'rgba(255,255,255,0.05)', color: S.text2,
                    border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 5,
                    cursor: 'pointer', marginBottom: 4, textAlign: 'center',
                  };
                  const exportCsv = () => {
                    const cols = ATTR_COLS;
                    const header = cols.map(c => c.label).join(',');
                    const rows = filteredPoints.map(p =>
                      cols.map(c => JSON.stringify(String(p[c.key] ?? ''))).join(',')
                    );
                    const csv = [header, ...rows].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'redlight_spatial_selection.csv';
                    a.click(); URL.revokeObjectURL(url);
                  };
                  return (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: S.text3, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Export selection</div>
                      <button style={exportBtnStyle} onClick={exportCsv} title="Export selected cases as CSV">
                        CSV (case data)
                      </button>
                      <button style={exportBtnStyle} onClick={() => api.exportFilteredGeoJson(filteredIds)} title="Export geocoded points as GeoJSON">
                        GeoJSON (points)
                      </button>
                      <button style={exportBtnStyle} onClick={() => api.exportMovementsGeoJson(filteredIds)} title="Export movement lines as GeoJSON">
                        GeoJSON (movements)
                      </button>
                      <button style={exportBtnStyle} onClick={() => api.exportShapefile(filteredIds, true)} title="Export as shapefile for use in QGIS / ArcGIS">
                        Shapefile (.zip)
                      </button>
                    </div>
                  );
                })()}
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
                <div style={{ display: 'flex', gap: 3, marginBottom: 8, flexWrap: 'wrap' }}>
                  {(['polygon', 'circle', 'rectangle', 'buffer'] as DrawMode[]).map((mode) => (
                    <button key={mode} style={drawBtnStyle(mode)}
                      title={DRAW_MODE_LABELS[mode].title}
                      onClick={() => setActiveDrawMode(activeDrawMode === mode ? null : mode)}>
                      {DRAW_MODE_LABELS[mode].label}
                    </button>
                  ))}
                </div>
                {activeDrawMode === 'buffer' && (
                  <div style={{ fontSize: 11, color: S.accent, marginBottom: 4 }}>
                    Click map to place buffer centre
                  </div>
                )}
                {activeDrawMode && activeDrawMode !== 'buffer' && (
                  <div style={{ fontSize: 11, color: S.accent, marginBottom: 4 }}>
                    {DRAW_MODE_LABELS[activeDrawMode].label} — click map to begin
                  </div>
                )}
                {!activeDrawMode && (
                  <div style={{ fontSize: 11, color: S.text3 }}>
                    Draw a shape to filter and summarize cases in the selected area
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

          {/* ── GIS Layers ────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Context Layers</SectionLabel>
            <input ref={layerFileRef} type="file" accept=".geojson,.json"
              style={{ display: 'none' }} onChange={handleLayerFileChange} />
            <button
              onClick={() => layerFileRef.current?.click()}
              title="Import a GeoJSON file as a context layer"
              style={{
                width: '100%', padding: '6px 0', fontSize: 12,
                fontFamily: 'DM Sans, sans-serif',
                background: 'rgba(255,255,255,0.05)', color: S.text2,
                border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 6,
                cursor: 'pointer',
                marginBottom: 6,
              }}>
              + Import GeoJSON layer
            </button>
            <div style={{
              fontSize: 10, color: S.text3, lineHeight: 1.65, marginBottom: gisLayers.length > 0 ? 8 : 0,
            }}>
              <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.28)', marginBottom: 3 }}>Optional context layers to import:</div>
              neighbourhood boundaries · police jurisdictions · transit corridors · commercial zones · parks · industrial areas · schools · hotels / lodging · stroll areas
            </div>
            {gisLayers.map((layer) => (
              <div key={layer.id} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 0', borderBottom: `1px solid ${S.border}`,
              }}>
                <input
                  type="checkbox" checked={layer.visible}
                  onChange={(e) => toggleLayerVisibility(layer.id, e.target.checked)}
                  style={{ width: 12, height: 12, accentColor: S.accent, flexShrink: 0, cursor: 'pointer' }}
                />
                <input
                  type="color" value={layer.color}
                  onChange={(e) => changeLayerColor(layer.id, e.target.value)}
                  style={{ width: 18, height: 18, padding: 0, border: 'none', borderRadius: 3, cursor: 'pointer', flexShrink: 0, background: 'none' }}
                  title="Change layer colour"
                />
                <span style={{
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontSize: 11.5, color: layer.visible ? S.text2 : S.text3,
                  fontFamily: 'DM Sans, sans-serif',
                }}>{layer.name}</span>
                <button onClick={() => removeLayer(layer.id)} style={{
                  background: 'none', border: 'none', color: S.text3,
                  cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0,
                }} title="Remove layer">×</button>
              </div>
            ))}
          </div>

          <SidebarDivider />

          {/* ── Legend ────────────────────────────────────────────────────── */}
          <LegendSection analyticView={analyticView} />

          <SidebarDivider />

          {/* ── Tools ─────────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Tools</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {/* Measure distance */}
              <button
                onClick={() => { if (measureActive) clearMeasure(); setMeasureActive((v) => !v); }}
                style={toolBtnStyle(measureActive)}
              >
                {measureActive ? 'Measuring…' : 'Measure distance'}
              </button>
              {measureActive && measurePointA && !measurePointB && (
                <div style={{ fontSize: 11, color: S.accent }}>Click a second point on the map</div>
              )}
              {/* Attribute table toggle */}
              <button onClick={() => setAttrTableOpen((v) => !v)} style={toolBtnStyle(attrTableOpen)}>
                {attrTableOpen ? 'Hide attribute table' : 'Attribute table'}
              </button>
              {/* Reset */}
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
      </div>

      {/* ── Right column: map + attribute table drawer ───────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

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

          {/* Measure distance label */}
          {measuredDistance && (
            <div style={{
              position: 'absolute', bottom: 48, left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 8,
              background: S.bg2,
              border: `1px solid ${S.accent}`,
              borderRadius: 6,
              padding: '5px 16px',
              color: S.accent,
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 13, fontWeight: 600,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              pointerEvents: 'none',
            }}>
              Distance: {measuredDistance}
            </div>
          )}

          {/* Buffer radius prompt */}
          {pendingBufferClick && (
            <div style={modalStyle}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Buffer radius (metres)</div>
              <input
                type="number" value={bufferRadiusInput} min={50} max={50000}
                onChange={(e) => setBufferRadiusInput(e.target.value)}
                style={modalInputStyle}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyBuffer(pendingBufferClick!, Number(bufferRadiusInput));
                  if (e.key === 'Escape') { setPendingBufferClick(null); }
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={modalBtnPrimary}
                  onClick={() => applyBuffer(pendingBufferClick!, Number(bufferRadiusInput))}>
                  Apply
                </button>
                <button style={modalBtnSecondary}
                  onClick={() => setPendingBufferClick(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Layer name/color prompt */}
          {pendingLayerFile && (
            <div style={modalStyle}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Name this layer</div>
              <input
                type="text" value={pendingLayerName ?? ''}
                onChange={(e) => setPendingLayerName(e.target.value)}
                style={modalInputStyle}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAddLayer();
                  if (e.key === 'Escape') setPendingLayerFile(null);
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: S.text3, fontFamily: 'DM Sans, sans-serif' }}>Colour</span>
                <input
                  type="color" value={pendingLayerColor}
                  onChange={(e) => setPendingLayerColor(e.target.value)}
                  style={{ width: 32, height: 26, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={modalBtnPrimary} onClick={confirmAddLayer}>Add layer</button>
                <button style={modalBtnSecondary} onClick={() => setPendingLayerFile(null)}>Cancel</button>
              </div>
            </div>
          )}

          <GoogleMap
            mapContainerStyle={{ height: '100%', width: '100%' }}
            center={{ lat: 49.28, lng: -123.12 }}
            zoom={12}
            mapTypeId={mapType}
            onLoad={onMapLoad}
            onClick={handleMapClick}
            options={{
              streetViewControl: true,
              mapTypeControl: false,
              fullscreenControl: true,
              zoomControl: true,
              draggableCursor: (activeDrawMode || measureActive) ? 'crosshair' : undefined,
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

            {/* Drawing manager — not rendered in buffer mode */}
            {activeDrawMode && activeDrawMode !== 'buffer' && (
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
            {!showClusters && renderPoints.map((p) => (
              <React.Fragment key={p.report_id}>

                {/* Initial contact */}
                {showInitial && p.lat_initial && p.lon_initial && (
                  <>
                    <Marker
                      position={{ lat: p.lat_initial, lng: p.lon_initial }}
                      icon={makeMarkerSymbol(
                        getMarkerColor(p, styleBy, 'initial', analyticView),
                        'initial',
                        getPointConfidence(p, 'initial'),
                        analyticView, p
                      )}
                      onClick={() => { setOpenWindow({ reportId: p.report_id, type: 'initial' }); fetchSelectedCase(p.report_id); }}
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
                      icon={makeMarkerSymbol(
                        getMarkerColor(p, styleBy, 'incident', analyticView),
                        'incident',
                        getPointConfidence(p, 'incident'),
                        analyticView, p
                      )}
                      onClick={() => { setOpenWindow({ reportId: p.report_id, type: 'incident' }); fetchSelectedCase(p.report_id); }}
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
                      icon={makeMarkerSymbol(
                        getMarkerColor(p, styleBy, 'destination', analyticView),
                        'destination',
                        getPointConfidence(p, 'destination'),
                        analyticView, p
                      )}
                      onClick={() => { setOpenWindow({ reportId: p.report_id, type: 'destination' }); fetchSelectedCase(p.report_id); }}
                      zIndex={1}
                    />
                    {openWindow?.reportId === p.report_id && openWindow.type === 'destination' &&
                      renderInfoWindow(p, p.lat_destination, p.lon_destination, 'Destination')}
                  </>
                )}

                {/* Movement lines */}
                {showMovement && p.movement === 'yes' && (() => {
                  // Sub-type toggles (only apply in movement view)
                  if (analyticView === 'movement') {
                    if (p.coercion === 'yes' && !showCoerciveMovement) return null;
                    if (p.entered_vehicle === 'yes' && !showVehicleMovement) return null;
                    if ((p.public_to_private_shift === 'yes' || p.public_to_secluded_shift === 'yes') && !showGeoShift) return null;
                  }
                  const opts = getMovementOptions(p);
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

          {/* Selected case panel */}
          {selectedCasePanelOpen && selectedCaseReport && (
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: 290, height: '100%',
              background: 'rgba(12, 30, 50, 0.97)',
              backdropFilter: 'blur(4px)',
              borderLeft: `1px solid rgba(255,255,255,0.1)`,
              zIndex: 10, overflowY: 'auto',
              fontFamily: 'DM Sans, sans-serif',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Header */}
              <div style={{ padding: '10px 14px 8px', background: S.bg2, borderBottom: `1px solid ${S.border}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: S.text1, fontFamily: 'Lora, serif' }}>
                    {String(selectedCaseReport.report_id || '')}
                  </span>
                  <button onClick={() => setSelectedCasePanelOpen(false)} style={{
                    background: 'none', border: 'none', color: S.text3, cursor: 'pointer', fontSize: 18, lineHeight: 1,
                  }}>×</button>
                </div>
                <div style={{ fontSize: 10.5, color: S.text3, marginTop: 3 }}>
                  {String(selectedCaseReport.incident_date || '—')} · {String(selectedCaseReport.city || '—')}
                  {selectedCaseReport.neighbourhood ? ` · ${selectedCaseReport.neighbourhood}` : ''}
                </div>
                {(() => {
                  const status = String(selectedCaseReport.coding_status || 'uncoded');
                  const cfg: Record<string, string> = {
                    reviewed: '#2F8F5B', coded: '#4A90D9', in_progress: '#E67E22', uncoded: '#9A9188',
                  };
                  const c = cfg[status] || '#9A9188';
                  return <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: c + '20', color: c, border: `1px solid ${c}40`, marginTop: 4, display: 'inline-block' }}>{status.replace('_',' ')}</span>;
                })()}
              </div>

              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                {/* Location */}
                <CasePanelSection title="Location">
                  <CasePanelRow label="Raw source" value={String(selectedCaseReport.initial_contact_address_raw || '—')} />
                  <CasePanelRow label="Normalized" value={String(selectedCaseReport.initial_contact_address_normalized || '—')} />
                  <CasePanelRow label="Precision" value={String(selectedCaseReport.initial_contact_precision || '—')} />
                  <CasePanelRow label="Geocode status" value={String(selectedCaseReport.initial_contact_geocoding_status || '—')} />
                  <CasePanelRow label="Confidence" value={String(selectedCaseReport.initial_contact_confidence || '—')} />
                </CasePanelSection>

                {/* Encounter */}
                <CasePanelSection title="Encounter">
                  <CasePanelRow label="Highest stage" value={String(selectedCaseReport.highest_stage_reached || 'Not coded')} />
                  <CasePanelRow label="Turning point" value={String(selectedCaseReport.turning_point || 'Not coded')} />
                  {['coercion_present','physical_force','sexual_assault','robbery_theft'].map((f) => {
                    const v = String(selectedCaseReport[f] || '');
                    if (!v || v === 'no' || v === '') return null;
                    return <CasePanelRow key={f} label={f.replace(/_/g,' ')} value={v} highlight />;
                  })}
                </CasePanelSection>

                {/* Movement */}
                {String(selectedCaseReport.movement_present || '') !== 'no' && (
                  <CasePanelSection title="Movement">
                    <CasePanelRow label="Movement present" value={String(selectedCaseReport.movement_present || 'Not coded')} />
                    <CasePanelRow label="Mode" value={String(selectedCaseReport.mode_of_movement || '—')} />
                    <CasePanelRow label="Who controlled" value={String(selectedCaseReport.who_controlled_movement || '—')} />
                  </CasePanelSection>
                )}

                {/* Suspect */}
                <CasePanelSection title="Suspect">
                  <CasePanelRow label="Description" value={String(selectedCaseReport.suspect_description_text || 'Not coded')} truncate />
                  <CasePanelRow label="Distinctive features" value={String(selectedCaseReport.suspect_distinctive_features || '—')} truncate />
                  <CasePanelRow label="Known / repeat" value={String(selectedCaseReport.known_repeat_suspect || 'Not coded')} highlight={_broadPos(String(selectedCaseReport.known_repeat_suspect || ''))} />
                  <CasePanelRow label="Repeat flag" value={String(selectedCaseReport.repeat_suspect_flag || 'Not coded')} highlight={_broadPos(String(selectedCaseReport.repeat_suspect_flag || ''))} />
                </CasePanelSection>

                {/* Vehicle */}
                {String(selectedCaseReport.vehicle_present || '') !== 'no' && (
                  <CasePanelSection title="Vehicle">
                    <CasePanelRow label="Vehicle present" value={String(selectedCaseReport.vehicle_present || 'Not coded')} />
                    <CasePanelRow label="Description" value={[selectedCaseReport.vehicle_make, selectedCaseReport.vehicle_model, selectedCaseReport.vehicle_colour].filter(Boolean).join(' ') || '—'} />
                    <CasePanelRow label="Plate (partial)" value={String(selectedCaseReport.plate_partial || '—')} />
                    <CasePanelRow label="Repeat vehicle flag" value={String(selectedCaseReport.repeat_vehicle_flag || 'Not coded')} highlight={_broadPos(String(selectedCaseReport.repeat_vehicle_flag || ''))} />
                  </CasePanelSection>
                )}

                {/* Analyst notes */}
                {(selectedCaseReport.coder_notes || selectedCaseReport.uncertainty_notes) && (
                  <CasePanelSection title="Analyst Notes">
                    {selectedCaseReport.coder_notes && <CasePanelRow label="Coder notes" value={String(selectedCaseReport.coder_notes)} truncate />}
                    {selectedCaseReport.uncertainty_notes && <CasePanelRow label="Uncertainty" value={String(selectedCaseReport.uncertainty_notes)} truncate />}
                  </CasePanelSection>
                )}
              </div>

              {/* Actions */}
              <div style={{ padding: '10px 14px', borderTop: `1px solid ${S.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <button onClick={() => navigate(`/code/${selectedCaseId}`)} style={{
                  width: '100%', padding: '6px 0', fontSize: 12, fontFamily: 'DM Sans, sans-serif',
                  background: S.accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                }}>Open case</button>
                <button
                  onClick={() => {
                    if (!selectedCaseId) return;
                    setLinkageCandidates(prev => { const n = new Set(prev); n.add(selectedCaseId); return n; });
                  }}
                  style={{
                    width: '100%', padding: '6px 0', fontSize: 11, fontFamily: 'DM Sans, sans-serif',
                    background: linkageCandidates.has(selectedCaseId || '') ? 'rgba(179,139,89,0.25)' : 'rgba(255,255,255,0.05)',
                    color: linkageCandidates.has(selectedCaseId || '') ? S.accent : S.text2,
                    border: `1px solid ${linkageCandidates.has(selectedCaseId || '') ? 'rgba(179,139,89,0.4)' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  {linkageCandidates.has(selectedCaseId || '') ? '⚑ In linkage candidate set' : 'Add to linkage candidates'}
                </button>
                <button
                  onClick={() => { alert('Compare Cases function — coming in a future release. Select multiple cases to compare suspect descriptors, vehicle descriptions, locations, movement, harm indicators, and analyst notes.'); }}
                  style={{
                    width: '100%', padding: '6px 0', fontSize: 11, fontFamily: 'DM Sans, sans-serif',
                    background: 'rgba(255,255,255,0.03)', color: S.text3,
                    border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 6, cursor: 'pointer',
                  }}
                  title="Compare Cases — coming soon. Will allow field-by-field comparison of suspect, vehicle, location, harm, and analyst data across selected cases."
                >
                  Compare cases (coming soon)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Attribute Table Drawer ───────────────────────────────────────────── */}
        <div style={{
          height: attrTableOpen ? 260 : 0,
          overflow: 'hidden',
          transition: 'height 0.22s ease',
          borderTop: `1px solid ${S.border}`,
          background: S.bg,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}>
          {/* Table header bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 14px', background: S.bg2, flexShrink: 0,
            borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ fontSize: 11, color: S.text2, fontFamily: 'DM Sans, sans-serif' }}>
              Showing <strong style={{ color: S.accent }}>{sortedAttrPoints.length}</strong> case{sortedAttrPoints.length !== 1 ? 's' : ''}
              {hasActiveFilter && <span style={{ color: S.text3, marginLeft: 6 }}>(filtered)</span>}
            </span>
            <button onClick={() => setAttrTableOpen(false)} style={{
              background: 'none', border: 'none', color: S.text3,
              cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px',
            }}>×</button>
          </div>

          {/* Scrollable table */}
          <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
            <table style={{
              borderCollapse: 'collapse', width: '100%', minWidth: 750,
              fontFamily: 'DM Sans, sans-serif', fontSize: 11.5,
            }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: S.bg2, zIndex: 1 }}>
                  {ATTR_COLS.map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleAttrSort(key)}
                      style={{
                        padding: '6px 12px', textAlign: 'left',
                        color: attrSortCol === key ? S.accent : S.text3,
                        fontWeight: 600, fontSize: 10.5,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        cursor: 'pointer', userSelect: 'none',
                        borderBottom: `1px solid ${S.border}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                      {attrSortCol === key && (
                        <span style={{ marginLeft: 4 }}>{attrSortAsc ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                </tr>
                <tr>
                  {ATTR_COLS.map(({ key, filterable }) => (
                    <th key={key} style={{ padding: '3px 6px', background: S.bg }}>
                      {filterable ? (
                        <input
                          value={attrFilterValues[key] || ''}
                          onChange={(e) => setAttrFilterValues(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder="filter…"
                          style={{
                            width: '100%', padding: '2px 5px', fontSize: 10,
                            background: 'rgba(255,255,255,0.06)', color: S.text2,
                            border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 3,
                            fontFamily: 'DM Sans, sans-serif', outline: 'none',
                          }}
                        />
                      ) : <div />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedAttrPoints.map((p) => (
                  <tr
                    key={p.report_id}
                    onClick={() => handleAttrRowClick(p)}
                    style={{
                      cursor: 'pointer',
                      background: attrActiveRow === p.report_id
                        ? 'rgba(179,139,89,0.18)'
                        : 'transparent',
                      borderBottom: `1px solid ${S.border}`,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (attrActiveRow !== p.report_id)
                        (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.04)';
                    }}
                    onMouseLeave={(e) => {
                      if (attrActiveRow !== p.report_id)
                        (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                    }}
                  >
                    {ATTR_COLS.map(({ key }) => (
                      <td key={key} style={{
                        padding: '5px 12px', color: S.text2,
                        whiteSpace: 'nowrap', maxWidth: 160,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {String(p[key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
