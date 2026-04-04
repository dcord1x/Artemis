import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Trash2, FileText, Download, X, BrainCircuit } from 'lucide-react';
import { api } from '../api';
import type { Report } from '../types';

const STATUS_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  coded:       { color: 'var(--green)',   bg: 'var(--green-pale)',  border: 'var(--green-border)' },
  in_progress: { color: 'var(--amber)',   bg: 'var(--amber-pale)',  border: 'var(--amber-border)' },
  reviewed:    { color: 'var(--blue)',    bg: 'var(--blue-pale)',   border: 'var(--blue-border)' },
  uncoded:     { color: 'var(--text-3)',  bg: 'var(--surface-2)',   border: 'var(--border)' },
};

/**
 * Indicator dot for a yes/no field.
 * When the coded value is blank but an NLP rank (1 or 2) is available,
 * shows a faint ring to hint that the NLP detected something — not a definitive coding.
 */
function Dot({
  val,
  trueColor = 'var(--accent)',
  nlpRank,
}: {
  val: string;
  trueColor?: string;
  nlpRank?: number;
}) {
  if (val === 'yes') return (
    <span title="Coded: yes" style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: trueColor,
    }} />
  );
  if (val === 'no') return (
    <span title="Coded: no" style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      border: `1.5px solid var(--border-mid)`,
    }} />
  );
  // Uncoded — show NLP hint if rank 1 or 2
  if (nlpRank === 1) return (
    <span title="NLP Rank 1 — high probability (uncoded)" style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: trueColor, opacity: 0.35,
      outline: `2px solid ${trueColor}`, outlineOffset: 1,
    }} />
  );
  if (nlpRank === 2) return (
    <span title="NLP Rank 2 — possible (uncoded)" style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      border: `1.5px dashed ${trueColor}`, opacity: 0.5,
    }} />
  );
  return <span style={{ color: 'var(--border-mid)', fontSize: 11 }}>–</span>;
}

/** Small vehicle/movement chip shown when vehicle or movement data is present. */
function VehicleDot({ vehiclePresent, mode, nlpRank }: { vehiclePresent: string; mode: string; nlpRank?: number }) {
  if (vehiclePresent === 'yes') return (
    <span title={`Vehicle: yes${mode ? ' · ' + mode : ''}`} style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: 'var(--blue)',
    }} />
  );
  if (vehiclePresent === 'no') return (
    <span title="Vehicle: no" style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      border: '1.5px solid var(--border-mid)',
    }} />
  );
  if (nlpRank === 1) return (
    <span title="NLP: vehicle likely (uncoded)" style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: 'var(--blue)', opacity: 0.35,
      outline: '2px solid var(--blue)', outlineOffset: 1,
    }} />
  );
  if (nlpRank === 2) return (
    <span title="NLP: vehicle possible (uncoded)" style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      border: '1.5px dashed var(--blue)', opacity: 0.5,
    }} />
  );
  return <span style={{ color: 'var(--border-mid)', fontSize: 11 }}>–</span>;
}

const NLP_FILTER_LABELS: Record<string, (v: string) => string> = {
  nlp_coercion:       (v) => v === '1' ? 'NLP: Coercion — strong signal' : 'NLP: Coercion — strong + possible',
  nlp_physical:       (v) => v === '1' ? 'NLP: Physical force — strong' : 'NLP: Physical force — strong + possible',
  nlp_sexual:         (v) => v === '1' ? 'NLP: Sexual assault — strong' : 'NLP: Sexual assault — possible',
  nlp_movement:       (v) => v === '1' ? 'NLP: Movement — strong' : 'NLP: Movement — strong + possible',
  nlp_weapon:         (v) => v === '1' ? 'NLP: Weapon — strong signal' : 'NLP: Weapon — possible',
  nlp_escalation_min: (v) => `NLP: Escalation score ≥ ${v}/5`,
  nlp_pattern:        (v) => `NLP pattern: ${v.replace(/_/g, ' ')}`,
  sexual_assault:     (v) => `Coded: Sexual assault = ${v}`,
  threats_present:    (v) => `Coded: Threats = ${v}`,
};

export default function CaseList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);

  // Standard filters — initialised from URL params (set by Analysis drilldown links)
  const [search,          setSearch]          = useState(() => searchParams.get('search') || '');
  const [filterStatus,    setFilterStatus]    = useState(() => searchParams.get('coding_status') || '');
  const [filterCoercion,  setFilterCoercion]  = useState(() => searchParams.get('coercion_present') || '');
  const [filterMovement,  setFilterMovement]  = useState(() => searchParams.get('movement_present') || '');
  const [filterPhysical,  setFilterPhysical]  = useState(() => searchParams.get('physical_force') || '');
  const [filterVehicle,   setFilterVehicle]   = useState(() => searchParams.get('vehicle_present') || '');
  const [filterCity,      setFilterCity]      = useState(() => searchParams.get('city') || '');
  const [filterDateFrom,  setFilterDateFrom]  = useState(() => searchParams.get('date_from') || '');
  const [filterDateTo,    setFilterDateTo]    = useState(() => searchParams.get('date_to') || '');

  // NLP-based filters (from Analysis drilldown — not shown in dropdowns)
  const [filterNlpCoercion,    setFilterNlpCoercion]    = useState(() => searchParams.get('nlp_coercion') || '');
  const [filterNlpPhysical,    setFilterNlpPhysical]    = useState(() => searchParams.get('nlp_physical') || '');
  const [filterNlpSexual,      setFilterNlpSexual]      = useState(() => searchParams.get('nlp_sexual') || '');
  const [filterNlpMovement,    setFilterNlpMovement]    = useState(() => searchParams.get('nlp_movement') || '');
  const [filterNlpWeapon,      setFilterNlpWeapon]      = useState(() => searchParams.get('nlp_weapon') || '');
  const [filterNlpEscalation,  setFilterNlpEscalation]  = useState(() => searchParams.get('nlp_escalation_min') || '');
  const [filterNlpPattern,     setFilterNlpPattern]     = useState(() => searchParams.get('nlp_pattern') || '');
  const [filterSexualAssault,  setFilterSexualAssault]  = useState(() => searchParams.get('sexual_assault') || '');
  const [filterThreats,        setFilterThreats]        = useState(() => searchParams.get('threats_present') || '');

  // Active NLP chips — key/value pairs shown as removable filter badges
  const activeNlpFilters: { key: string; value: string; clear: () => void }[] = [
    { key: 'nlp_coercion',    value: filterNlpCoercion,   clear: () => setFilterNlpCoercion('') },
    { key: 'nlp_physical',    value: filterNlpPhysical,   clear: () => setFilterNlpPhysical('') },
    { key: 'nlp_sexual',      value: filterNlpSexual,     clear: () => setFilterNlpSexual('') },
    { key: 'nlp_movement',    value: filterNlpMovement,   clear: () => setFilterNlpMovement('') },
    { key: 'nlp_weapon',      value: filterNlpWeapon,     clear: () => setFilterNlpWeapon('') },
    { key: 'nlp_escalation_min', value: filterNlpEscalation, clear: () => setFilterNlpEscalation('') },
    { key: 'nlp_pattern',     value: filterNlpPattern,    clear: () => setFilterNlpPattern('') },
    { key: 'sexual_assault',  value: filterSexualAssault, clear: () => setFilterSexualAssault('') },
    { key: 'threats_present', value: filterThreats,       clear: () => setFilterThreats('') },
  ].filter(f => f.value);

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const params: Record<string, string> = {};
    if (search)              params.search          = search;
    if (filterStatus)        params.coding_status   = filterStatus;
    if (filterCoercion)      params.coercion_present = filterCoercion;
    if (filterMovement)      params.movement_present = filterMovement;
    if (filterPhysical)      params.physical_force  = filterPhysical;
    if (filterVehicle)       params.vehicle_present = filterVehicle;
    if (filterCity)          params.city            = filterCity;
    if (filterDateFrom)      params.date_from       = filterDateFrom;
    if (filterDateTo)        params.date_to         = filterDateTo;
    if (filterNlpCoercion)   params.nlp_coercion    = filterNlpCoercion;
    if (filterNlpPhysical)   params.nlp_physical    = filterNlpPhysical;
    if (filterNlpSexual)     params.nlp_sexual      = filterNlpSexual;
    if (filterNlpMovement)   params.nlp_movement    = filterNlpMovement;
    if (filterNlpWeapon)     params.nlp_weapon      = filterNlpWeapon;
    if (filterNlpEscalation) params.nlp_escalation_min = filterNlpEscalation;
    if (filterNlpPattern)    params.nlp_pattern     = filterNlpPattern;
    if (filterSexualAssault) params.sexual_assault  = filterSexualAssault;
    if (filterThreats)       params.threats_present = filterThreats;
    try {
      const data = await api.listReports(params);
      setReports(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to connect to backend');
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [
    search, filterStatus, filterCoercion, filterMovement, filterPhysical,
    filterVehicle, filterCity, filterDateFrom, filterDateTo,
    filterNlpCoercion, filterNlpPhysical, filterNlpSexual, filterNlpMovement,
    filterNlpWeapon, filterNlpEscalation, filterNlpPattern,
    filterSexualAssault, filterThreats,
  ]);

  const handleBatchAnalyze = async () => {
    setBatchAnalyzing(true);
    setBatchResult(null);
    try {
      const result = await api.batchAnalyze();
      setBatchResult(`NLP run on ${result.processed} case${result.processed !== 1 ? 's' : ''}`);
      load(); // refresh list so NLP dots update
    } catch (e: any) {
      setBatchResult(e?.message || 'Batch NLP failed');
    } finally {
      setBatchAnalyzing(false);
    }
  };

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const sortedReports = useMemo(() => {
    if (!sortColumn) return reports;
    return [...reports].sort((a, b) => {
      const getSortVal = (r: Report): string | number => {
        switch (sortColumn) {
          case 'report_id':       return r.report_id ?? '';
          case 'incident_date':   return r.incident_date ?? r.date_received?.slice(0, 10) ?? '';
          case 'day_of_week':     return r.day_of_week ?? '';
          case 'city':            return r.city ?? '';
          case 'raw_narrative':   return r.raw_narrative ?? '';
          case 'vehicle':         return [r.vehicle_colour, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ');
          case 'coercion_present':  return r.coercion_present === 'yes' ? 2 : r.coercion_present === 'no' ? 1 : 0;
          case 'movement_present':  return r.movement_present === 'yes' ? 2 : r.movement_present === 'no' ? 1 : 0;
          case 'physical_force':    return r.physical_force === 'yes' ? 2 : r.physical_force === 'no' ? 1 : 0;
          case 'sexual_assault':    return r.sexual_assault === 'yes' ? 2 : r.sexual_assault === 'no' ? 1 : 0;
          case 'escalation':      return (r.ai_suggestions as any)?.nlp?.escalation?.score ?? -1;
          case 'coding_status':   return r.coding_status ?? '';
          default:                return '';
        }
      };
      const av = getSortVal(a);
      const bv = getSortVal(b);
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [reports, sortColumn, sortDirection]);

  const handleDelete = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this report? This cannot be undone.')) return;
    await api.deleteReport(reportId);
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flex: 1, minWidth: 220,
          padding: '5px 12px',
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--bg)',
        }}>
          <Search size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 13, color: 'var(--text-1)', outline: 'none',
              fontFamily: 'DM Sans, sans-serif',
            }}
            placeholder="Search narratives, suspects, vehicles, plates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <SlidersHorizontal size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />

        {/* City filter */}
        <input
          style={{
            padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--surface)', fontSize: 13, fontFamily: 'DM Sans, sans-serif',
            color: 'var(--text-1)', outline: 'none', width: 110,
          }}
          placeholder="City…"
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
        />

        {/* Date range */}
        <input
          type="date"
          title="Date from"
          style={{
            padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--surface)', fontSize: 12, fontFamily: 'DM Sans, sans-serif',
            color: 'var(--text-1)', outline: 'none',
          }}
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
        />
        <span style={{ color: 'var(--text-3)', fontSize: 12 }}>–</span>
        <input
          type="date"
          title="Date to"
          style={{
            padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--surface)', fontSize: 12, fontFamily: 'DM Sans, sans-serif',
            color: 'var(--text-1)', outline: 'none',
          }}
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
        />

        {/* Dropdown filters */}
        {[
          { value: filterStatus, set: setFilterStatus, options: [
            ['', 'All statuses'], ['uncoded','Uncoded'], ['in_progress','In Progress'],
            ['coded','Coded'], ['reviewed','Reviewed'],
          ]},
          { value: filterCoercion, set: setFilterCoercion, options: [
            ['', 'Coercion: any'], ['yes','Coercion: yes'], ['no','Coercion: no'],
          ]},
          { value: filterMovement, set: setFilterMovement, options: [
            ['', 'Movement: any'], ['yes','Movement: yes'], ['no','Movement: no'],
          ]},
          { value: filterPhysical, set: setFilterPhysical, options: [
            ['', 'Physical force: any'], ['yes','Force: yes'], ['no','Force: no'],
          ]},
          { value: filterVehicle, set: setFilterVehicle, options: [
            ['', 'Vehicle: any'], ['yes','Vehicle: yes'], ['no','Vehicle: no'],
          ]},
        ].map((f, i) => (
          <select
            key={i}
            value={f.value}
            onChange={(e) => f.set(e.target.value)}
            style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--surface)', fontSize: 13, fontFamily: 'DM Sans, sans-serif',
              color: 'var(--text-1)', outline: 'none', cursor: 'pointer',
            }}
          >
            {f.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
        ))}

        <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {reports.length} record{reports.length !== 1 ? 's' : ''}
        </span>

        <button
          className="btn-ghost"
          onClick={handleBatchAnalyze}
          disabled={batchAnalyzing}
          title="Run NLP analysis on all cases that don't have it yet"
          style={{ fontSize: 12.5 }}
        >
          <BrainCircuit size={13} style={{ color: 'var(--blue)' }} />
          {batchAnalyzing ? 'Running NLP…' : 'NLP All'}
        </button>
        {batchResult && (
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {batchResult}
          </span>
        )}
        <button className="btn-ghost" onClick={() => api.exportCsv()} style={{ fontSize: 12.5 }}>
          <Download size={13} /> CSV
        </button>
        <button className="btn-ghost" onClick={() => api.exportGeoJson()} style={{ fontSize: 12.5 }}>
          <Download size={13} /> GeoJSON
        </button>
      </div>

      {/* Active NLP filter chips — shown when navigating from Analysis */}
      {activeNlpFilters.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '6px 20px',
          background: 'var(--amber-pale)',
          borderBottom: '1px solid var(--amber-border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>
            Active filters:
          </span>
          {activeNlpFilters.map(({ key, value, clear }) => {
            const labelFn = NLP_FILTER_LABELS[key];
            const label = labelFn ? labelFn(value) : `${key}: ${value}`;
            return (
              <span key={key} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 8px', borderRadius: 20,
                fontSize: 11.5, fontWeight: 500,
                background: 'var(--amber-pale)', color: 'var(--amber)',
                border: '1px solid var(--amber-border)',
              }}>
                {label}
                <button
                  onClick={clear}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--amber)', opacity: 0.7 }}
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
          <button
            onClick={() => {
              setFilterNlpCoercion(''); setFilterNlpPhysical(''); setFilterNlpSexual('');
              setFilterNlpMovement(''); setFilterNlpWeapon(''); setFilterNlpEscalation('');
              setFilterNlpPattern(''); setFilterSexualAssault(''); setFilterThreats('');
            }}
            style={{ fontSize: 11, color: 'var(--amber)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', textDecoration: 'underline' }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-3)', fontSize: 13 }}>
            Loading…
          </div>
        ) : loadError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 12 }}>
            <p style={{ color: 'var(--accent)', fontSize: 14, margin: 0 }}>Could not reach backend: {loadError}</p>
            <button
              onClick={load}
              style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 14px', cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        ) : reports.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 12 }}>
            <FileText size={36} style={{ color: 'var(--border-mid)' }} />
            <p style={{ color: 'var(--text-3)', fontSize: 14, margin: 0 }}>No reports found.</p>
            <button
              onClick={() => navigate('/')}
              style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Add your first report →
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1.5px solid var(--border)', position: 'sticky', top: 0, zIndex: 1 }}>
                {[
                  { h: 'ID',        title: '',                 align: 'left',   col: 'report_id' },
                  { h: 'Date',      title: 'Incident date',    align: 'left',   col: 'incident_date' },
                  { h: 'Day',       title: 'Day of week',      align: 'left',   col: 'day_of_week' },
                  { h: 'City',      title: 'City',             align: 'left',   col: 'city' },
                  { h: 'Narrative', title: '',                 align: 'left',   col: 'raw_narrative' },
                  { h: 'Vehicle',   title: 'Vehicle details',  align: 'left',   col: 'vehicle' },
                  { h: 'C',         title: 'Coercion — filled dot=coded yes; faint=NLP rank 1; dashed=NLP rank 2', align: 'center', col: 'coercion_present' },
                  { h: 'M',         title: 'Movement present', align: 'center', col: 'movement_present' },
                  { h: 'F',         title: 'Physical force',   align: 'center', col: 'physical_force' },
                  { h: 'SA',        title: 'Sexual assault',   align: 'center', col: 'sexual_assault' },
                  { h: 'Esc',       title: 'Escalation score (NLP)', align: 'center', col: 'escalation' },
                  { h: 'Status',    title: '',                 align: 'left',   col: 'coding_status' },
                  { h: '',          title: '',                 align: 'right',  col: null },
                ].map(({ h, title, align, col }, i) => (
                  <th
                    key={i}
                    onClick={col ? () => handleSort(col) : undefined}
                    style={{
                      padding: '9px 10px', textAlign: align as any,
                      fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
                      color: col && sortColumn === col ? 'var(--text-1)' : 'var(--text-3)',
                      fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
                      cursor: col ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                    title={title}
                  >
                    {h}{col && (
                      <span style={{ marginLeft: 4, opacity: sortColumn === col ? 1 : 0.35 }}>
                        {sortColumn === col ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedReports.map((r, i) => {
                const sc = STATUS_COLORS[r.coding_status] || STATUS_COLORS.uncoded;
                const nlp = (r.ai_suggestions as any)?.nlp ?? {};
                const escScore: number = nlp.escalation?.score ?? 0;
                const escColor = escScore >= 5 ? '#7F1D1D' : escScore >= 4 ? '#B91C1C' : escScore >= 3 ? '#EA580C' : '#D97706';
                const vehLabel = [r.vehicle_colour, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ') || '';
                const dateCert: string = nlp.date_certainty ?? '';
                return (
                  <tr
                    key={r.report_id}
                    onClick={() => navigate(`/code/${r.report_id}`)}
                    style={{
                      cursor: 'pointer',
                      background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-pale)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? 'var(--surface)' : 'var(--bg)')}
                  >
                    {/* ID */}
                    <td style={{ padding: '8px 10px', color: 'var(--text-3)', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{r.report_id}</td>

                    {/* Date — amber if vague/approximate, blue if range */}
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        color: dateCert === 'vague' || dateCert === 'approximate' ? 'var(--amber)' : dateCert === 'range' ? 'var(--blue)' : 'var(--text-2)',
                        fontWeight: dateCert && dateCert !== 'exact' ? 500 : 400,
                      }} title={dateCert && dateCert !== 'exact' ? `Date certainty: ${dateCert}${nlp.date_certainty_reason ? ' — ' + nlp.date_certainty_reason : ''}` : undefined}>
                        {r.incident_date || r.date_received?.slice(0, 10) || '—'}
                      </span>
                    </td>

                    {/* Day of week */}
                    <td style={{ padding: '8px 10px', color: 'var(--text-3)', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                      {r.day_of_week ? r.day_of_week.slice(0, 3) : '—'}
                    </td>

                    {/* City */}
                    <td style={{ padding: '8px 10px', color: 'var(--text-1)', fontWeight: 500 }}>{r.city || '—'}</td>

                    {/* Narrative snippet */}
                    <td style={{ padding: '8px 10px', color: 'var(--text-2)', maxWidth: 280 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.raw_narrative.slice(0, 85)}…
                      </span>
                    </td>

                    {/* Vehicle */}
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {vehLabel ? (
                        <span style={{ fontSize: 11.5, color: 'var(--blue)' }}>{vehLabel}</span>
                      ) : r.vehicle_present === 'no' ? (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>foot</span>
                      ) : (
                        <VehicleDot vehiclePresent={r.vehicle_present} mode={r.mode_of_movement} nlpRank={nlp.movement_rank} />
                      )}
                    </td>

                    {/* C — Coercion */}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <Dot val={r.coercion_present} trueColor="var(--accent)" nlpRank={nlp.coercion_rank} />
                    </td>

                    {/* M — Movement */}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <Dot val={r.movement_present} trueColor="var(--amber)" nlpRank={nlp.movement_rank} />
                    </td>

                    {/* F — Physical force */}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <Dot val={r.physical_force} trueColor="var(--accent)" nlpRank={nlp.physical_rank} />
                    </td>

                    {/* SA — Sexual assault */}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <Dot val={r.sexual_assault} trueColor="var(--accent)" nlpRank={nlp.sexual_rank} />
                    </td>

                    {/* Escalation score */}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {escScore >= 2 ? (
                        <span title={`Escalation score ${escScore}/5: ${nlp.escalation?.arc ?? ''}`} style={{
                          fontSize: 11.5, fontWeight: 700, color: escColor,
                          background: `${escColor}15`, border: `1px solid ${escColor}40`,
                          padding: '1px 5px', borderRadius: 4,
                        }}>{escScore}</span>
                      ) : (
                        <span style={{ color: 'var(--border-mid)', fontSize: 11 }}>–</span>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                        fontSize: 11, fontWeight: 500,
                        color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`,
                      }}>
                        {r.coding_status}
                      </span>
                    </td>

                    {/* Delete */}
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      <button
                        onClick={(e) => handleDelete(e, r.report_id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--border-mid)', padding: 4, borderRadius: 4,
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--border-mid)')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
