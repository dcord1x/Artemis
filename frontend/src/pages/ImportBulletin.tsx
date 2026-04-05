import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Check, AlertTriangle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface ParsedIncident {
  raw_narrative: string;
  entry_type: string;
  bulletin_date: string;
  source_organization: string;
  incident_date: string;
  date_reported: string;
  city: string;
  neighbourhood: string;
  initial_contact_location: string;
  incident_location_primary: string;
  coercion_present: string;
  threats_present: string;
  physical_force: string;
  sexual_assault: string;
  robbery_theft: string;
  stealthing: string;
  movement_present: string;
  entered_vehicle: string;
  suspect_count: string;
  suspect_gender: string;
  suspect_description_text: string;
  suspect_race_ethnicity: string;
  suspect_age_estimate: string;
  suspect_name: string;
  vehicle_present: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_colour: string;
  plate_partial: string;
  summary_analytic: string;
  flags: string[];
  [key: string]: string | string[];
}

const ENTRY_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  incident:        { label: 'Incident',        color: 'var(--accent)',  bg: 'var(--accent-pale)',  border: 'var(--accent-border)' },
  update:          { label: 'Update',          color: 'var(--amber)',   bg: 'var(--amber-pale)',   border: 'var(--amber-border)' },
  suspect_profile: { label: 'Suspect Profile', color: 'var(--blue)',    bg: 'var(--blue-pale)',    border: 'var(--blue-border)' },
};

function YesNo({ val }: { val: string }) {
  if (val === 'yes') return <span style={{ color: 'var(--accent)', fontWeight: 600 }}>yes</span>;
  if (val === 'no')  return <span style={{ color: 'var(--text-3)' }}>no</span>;
  if (val)           return <span style={{ color: 'var(--text-3)' }}>{val}</span>;
  return <span style={{ color: 'var(--border-mid)' }}>—</span>;
}

function FlagChip({ val, label, color = 'var(--accent)' }: { val: string; label: string; color?: string }) {
  if (val !== 'yes') return null;
  return (
    <span style={{
      padding: '1px 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 600,
      color, border: `1px solid ${color}22`, background: `${color}10`,
    }}>
      {label}
    </span>
  );
}

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

export default function ImportBulletin() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dupWarning, setDupWarning] = useState<{ count: number; ids: string[] } | null>(null);
  const [dupStatus, setDupStatus] = useState<Record<number, { status: string; matchedId: string }>>({});

  const [incidents, setIncidents] = useState<ParsedIncident[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [analystName, setAnalystName] = useState(() => localStorage.getItem('analyst_name') || '');
  const [sourceOrg, setSourceOrg] = useState('');
  const [parseMethod, setParseMethod] = useState<'ai' | 'rules' | 'excel' | null>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    setError('');
    setParsing(true);
    setIncidents([]);
    setSelected(new Set());
    setParseMethod(null);
    setDupStatus({});

    try {
      const form = new FormData();
      form.append('file', file);
      const isExcel = file.name.toLowerCase().endsWith('.xlsx');
      const endpoint = isExcel ? `${BASE}/parse-excel` : `${BASE}/parse-bulletin`;
      const res = await fetch(endpoint, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Parse failed'); return; }
      const parsed: any[] = data.incidents || [];
      setIncidents(parsed);
      setParseMethod(data.method || null);
      setSelected(new Set(parsed.map((_: any, i: number) => i)));

      // Check each incident for duplicates in the background
      if (parsed.length > 0) {
        fetch(`${BASE}/check-duplicates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.map((inc: any, i: number) => ({
            index: i,
            raw_narrative: inc.raw_narrative || '',
            incident_date: inc.incident_date || '',
            city: inc.city || '',
          }))),
        })
          .then((r) => r.json())
          .then((dup) => {
            const map: Record<number, { status: string; matchedId: string }> = {};
            for (const r of dup.results || []) {
              if (r.status !== 'new') map[r.index] = { status: r.status, matchedId: r.matched_report_id };
            }
            setDupStatus(map);
          })
          .catch(() => {/* non-critical, ignore */});
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSave = async () => {
    const toSave = incidents.filter((_, i) => selected.has(i));
    if (!toSave.length) return;
    setSaving(true);
    setDupWarning(null);
    localStorage.setItem('analyst_name', analystName);
    try {
      const res = await fetch(`${BASE}/bulk-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidents: toSave, analyst_name: analystName, source_organization: sourceOrg }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Save failed'); return; }
      if (data.skipped > 0) setDupWarning({ count: data.skipped, ids: data.skipped_report_ids });
      if (data.saved > 0) navigate('/cases');
    } finally { setSaving(false); }
  };

  const toggleSelect = (i: number) => {
    setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };
  const toggleExpand = (i: number) => {
    setExpanded((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <h2 style={{ fontFamily: 'Lora, serif', fontSize: 16, fontWeight: 500, margin: 0, color: 'var(--text-1)' }}>
          Import Bulletin
        </h2>

        {parseMethod === 'ai' && (
          <span style={{
            fontSize: 11.5, padding: '2px 10px', borderRadius: 20, fontWeight: 500,
            color: 'var(--amber)', background: 'var(--amber-pale)', border: '1px solid var(--amber-border)',
          }}>✦ AI parsed</span>
        )}
        {parseMethod === 'rules' && (
          <span style={{
            fontSize: 11.5, padding: '2px 10px', borderRadius: 20, fontWeight: 500,
            color: 'var(--blue)', background: 'var(--blue-pale)', border: '1px solid var(--blue-border)',
          }}>⚙ Rule-based — review fields carefully</span>
        )}
        {parseMethod === 'excel' && (
          <span style={{
            fontSize: 11.5, padding: '2px 10px', borderRadius: 20, fontWeight: 500,
            color: 'var(--green)', background: 'var(--green-pale)', border: '1px solid var(--green-border)',
          }}>⊞ Excel import — violence fields left blank for coding</span>
        )}

        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--surface)', fontSize: 13, fontFamily: 'DM Sans, sans-serif',
              color: 'var(--text-1)', outline: 'none', width: 140,
            }}
            placeholder="Analyst name"
            value={analystName}
            onChange={(e) => setAnalystName(e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
          <input
            style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--surface)', fontSize: 13, fontFamily: 'DM Sans, sans-serif',
              color: 'var(--text-1)', outline: 'none', width: 220,
            }}
            placeholder="Source organization"
            value={sourceOrg}
            onChange={(e) => setSourceOrg(e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />

          {incidents.length > 0 && (
            <>
              <button className="btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setSelected(new Set(incidents.map((_, i) => i)))}>Select all</button>
              <button className="btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setSelected(new Set())}>None</button>
              <button
                className="btn-primary"
                disabled={saving || selected.size === 0}
                onClick={handleSave}
                style={{ fontSize: 12.5 }}
              >
                <Check size={13} />
                {saving ? 'Saving…' : `Save ${selected.size} report${selected.size !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', borderRadius: 8, marginBottom: 16,
            background: 'var(--accent-pale)', border: '1px solid var(--accent-border)',
            color: 'var(--accent)', fontSize: 13,
          }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}
        {dupWarning && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 16px', borderRadius: 8, marginBottom: 16,
            background: 'var(--amber-pale)', border: '1px solid var(--amber-border)',
            color: 'var(--amber)', fontSize: 13,
          }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>{dupWarning.count} duplicate{dupWarning.count !== 1 ? 's' : ''} skipped</strong>
              {' — already in the database as '}{dupWarning.ids.join(', ')}.
            </div>
          </div>
        )}

        {/* Drop zone */}
        {incidents.length === 0 && !parsing && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 16, height: 280,
              border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-mid)'}`,
              borderRadius: 12,
              background: dragging ? 'var(--accent-pale)' : 'var(--surface)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 12,
              background: 'var(--surface-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Upload size={22} style={{ color: 'var(--text-3)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, color: 'var(--text-1)', margin: '0 0 6px', fontFamily: 'Lora, serif' }}>
                Drop a bulletin PDF or your Excel dataset here
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 4px' }}>
                PDF — split into individual reports &nbsp;·&nbsp; Excel (.xlsx) — bulk import rows
              </p>
              <p style={{ fontSize: 12, color: 'var(--border-mid)', margin: 0 }}>
                PDF works without AI · Add API key for smarter extraction
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.xlsx"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        )}

        {/* Parsing */}
        {parsing && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: 240 }}>
            <Loader2 size={28} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0, fontFamily: 'Lora, serif' }}>Parsing file…</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Extracting individual incidents</p>
          </div>
        )}

        {/* Results */}
        {incidents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <FileText size={14} style={{ color: 'var(--text-3)' }} />
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {incidents.length} entries parsed — select which to import
              </span>
            </div>

            {incidents.map((inc, i) => {
              const style = ENTRY_STYLE[inc.entry_type] || ENTRY_STYLE.incident;
              const isSelected = selected.has(i);
              const isExpanded = expanded.has(i);
              const dup = dupStatus[i];

              return (
                <div
                  key={i}
                  className="card"
                  style={{
                    border: `1px solid ${isSelected ? style.border : 'var(--border)'}`,
                    opacity: isSelected ? 1 : 0.55,
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px',
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(i)}
                      style={{ accentColor: 'var(--accent)', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                    />

                    <span style={{
                      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                      color: style.color, background: style.bg, border: `1px solid ${style.border}`,
                    }}>
                      {style.label}
                    </span>

                    {dup && (
                      <span title={`Matched: ${dup.matchedId}`} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                        color: dup.status === 'exact' ? 'var(--accent)' : 'var(--amber)',
                        background: dup.status === 'exact' ? 'var(--accent-pale)' : 'var(--amber-pale)',
                        border: `1px solid ${dup.status === 'exact' ? 'var(--accent-border)' : 'var(--amber-border)'}`,
                      }}>
                        <AlertTriangle size={10} />
                        {dup.status === 'exact' ? 'Duplicate' : 'Possible duplicate'}
                      </span>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                      {inc.incident_date && (
                        <span style={{ fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{inc.incident_date}</span>
                      )}
                      {inc.city && (
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{inc.city}</span>
                      )}
                      {inc.suspect_name && (
                        <span style={{ fontSize: 12.5, color: 'var(--amber)', fontWeight: 500 }}>{inc.suspect_name}</span>
                      )}
                      {inc.vehicle_colour && inc.vehicle_make && (
                        <span style={{ fontSize: 12, color: 'var(--blue)' }}>
                          {inc.vehicle_colour} {inc.vehicle_make} {inc.vehicle_model}
                        </span>
                      )}
                      {inc.plate_partial && (
                        <span style={{
                          fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                          color: 'var(--accent)', background: 'var(--accent-pale)',
                          padding: '1px 6px', borderRadius: 4, border: '1px solid var(--accent-border)',
                        }}>
                          {inc.plate_partial}
                        </span>
                      )}
                    </div>

                    {/* Indicator chips */}
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <FlagChip val={inc.coercion_present} label="C" color="var(--accent)" />
                      <FlagChip val={inc.physical_force} label="F" color="#C2410C" />
                      <FlagChip val={inc.sexual_assault} label="SA" color="#9F1239" />
                      <FlagChip val={inc.robbery_theft} label="R" color="var(--amber)" />
                      <FlagChip val={inc.stealthing} label="S" color="#9D174D" />
                      <FlagChip val={inc.movement_present} label="M" color="var(--amber)" />
                      <FlagChip val={inc.vehicle_present} label="V" color="var(--blue)" />
                    </div>

                    <button
                      onClick={() => toggleExpand(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, flexShrink: 0 }}
                    >
                      {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  </div>

                  {/* Summary (collapsed) */}
                  {inc.summary_analytic && !isExpanded && (
                    <div style={{ padding: '0 14px 10px 40px', fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                      {inc.summary_analytic}
                    </div>
                  )}

                  {/* Flags (collapsed) */}
                  {inc.flags?.length > 0 && !isExpanded && (
                    <div style={{ padding: '0 14px 10px 40px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {inc.flags.map((flag) => (
                        <span key={flag} style={{
                          fontSize: 11, padding: '1px 8px', borderRadius: 4,
                          color: 'var(--amber)', background: 'var(--amber-pale)', border: '1px solid var(--amber-border)',
                        }}>{flag}</span>
                      ))}
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{
                      padding: '12px 14px 14px',
                      borderTop: '1px solid var(--border)',
                      background: 'var(--bg)',
                    }}>
                      {/* Raw narrative */}
                      <div style={{ marginBottom: 14 }}>
                        <div className="section-label" style={{ marginBottom: 6 }}>Original narrative</div>
                        <div style={{
                          fontSize: 13, lineHeight: 1.65, color: 'var(--text-2)',
                          whiteSpace: 'pre-wrap',
                          padding: '10px 12px', borderRadius: 6,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          maxHeight: 180, overflow: 'auto',
                        }}>
                          {inc.raw_narrative}
                        </div>
                      </div>

                      {/* Field grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px', marginBottom: 12 }}>
                        {[
                          ['Incident date', 'incident_date'],
                          ['City', 'city'],
                          ['Neighbourhood', 'neighbourhood'],
                          ['Contact location', 'initial_contact_location'],
                          ['Primary location', 'incident_location_primary'],
                          ['Movement', 'movement_present'],
                          ['Entered vehicle', 'entered_vehicle'],
                          ['Coercion', 'coercion_present'],
                          ['Threats', 'threats_present'],
                          ['Physical force', 'physical_force'],
                          ['Sexual assault', 'sexual_assault'],
                          ['Robbery/theft', 'robbery_theft'],
                          ['Stealthing', 'stealthing'],
                          ['Vehicle make', 'vehicle_make'],
                          ['Vehicle colour', 'vehicle_colour'],
                          ['Plate (partial)', 'plate_partial'],
                        ].map(([label, key]) => (
                          <div key={key} style={{
                            display: 'flex', gap: 8, alignItems: 'center',
                            padding: '3px 0', borderBottom: '1px solid var(--border)',
                            fontSize: 12,
                          }}>
                            <span style={{ color: 'var(--text-3)', width: 130, flexShrink: 0 }}>{label}</span>
                            <YesNo val={inc[key] as string} />
                          </div>
                        ))}
                      </div>

                      {inc.suspect_description_text && (
                        <div style={{ marginBottom: 10 }}>
                          <div className="section-label" style={{ marginBottom: 4 }}>Suspect description</div>
                          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{inc.suspect_description_text}</div>
                        </div>
                      )}

                      {inc.summary_analytic && (
                        <div style={{ marginBottom: 10 }}>
                          <div className="section-label" style={{ marginBottom: 4 }}>Summary</div>
                          <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>{inc.summary_analytic}</div>
                        </div>
                      )}

                      {inc.flags?.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {inc.flags.map((flag) => (
                            <span key={flag} style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 4,
                              color: 'var(--amber)', background: 'var(--amber-pale)', border: '1px solid var(--amber-border)',
                            }}>{flag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Upload another */}
            <button
              onClick={() => { setIncidents([]); setSelected(new Set()); setError(''); fileRef.current?.click(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 16px', borderRadius: 8,
                border: '2px dashed var(--border)', background: 'none',
                color: 'var(--text-3)', fontSize: 13, cursor: 'pointer',
                transition: 'all 0.15s', marginTop: 4,
                width: '100%', justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)';
              }}
            >
              <Upload size={14} /> Upload another file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.xlsx"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.[0]) { setIncidents([]); handleFile(e.target.files[0]); } }}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
