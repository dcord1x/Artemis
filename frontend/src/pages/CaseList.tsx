import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Trash2, FileText, Download, X, CheckSquare, Settings, Sparkles } from 'lucide-react';
import { api } from '../api';
import type { Report } from '../types';

const STATUS_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  coded:       { color: 'var(--green)',   bg: 'var(--green-pale)',  border: 'var(--green-border)' },
  in_progress: { color: 'var(--amber)',   bg: 'var(--amber-pale)',  border: 'var(--amber-border)' },
  reviewed:    { color: 'var(--blue)',    bg: 'var(--blue-pale)',   border: 'var(--blue-border)' },
  uncoded:     { color: 'var(--text-3)',  bg: 'var(--surface-2)',   border: 'var(--border)' },
};

function Dot({ val, trueColor = 'var(--accent)' }: { val: string; trueColor?: string }) {
  if (val === 'yes') return <span title="Coded: yes" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: trueColor }} />;
  if (val === 'no')  return <span title="Coded: no"  style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: `1.5px solid var(--border-mid)` }} />;
  return <span style={{ color: 'var(--border-mid)', fontSize: 11 }}>–</span>;
}

function VehicleDot({ vehiclePresent, mode }: { vehiclePresent: string; mode: string }) {
  if (vehiclePresent === 'yes') return <span title={`Vehicle: yes${mode ? ' · ' + mode : ''}`} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }} />;
  if (vehiclePresent === 'no')  return <span title="Vehicle: no" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: '1.5px solid var(--border-mid)' }} />;
  return <span style={{ color: 'var(--border-mid)', fontSize: 11 }}>–</span>;
}

const ACTIVE_FILTER_LABELS: Record<string, (v: string) => string> = {
  sexual_assault:  (v) => `Coded: Sexual assault = ${v}`,
  threats_present: (v) => `Coded: Threats = ${v}`,
};

// ─── Column system ────────────────────────────────────────────────────────────

type ColCtx = {
  sc: { color: string; bg: string; border: string };
};

interface ColumnDef {
  id: string;
  header: string;   // chooser label
  label: string;    // table header label
  title?: string;   // tooltip
  group: string;
  align?: 'left' | 'center' | 'right';
  sortKey?: string;
  render: (r: Report, ctx: ColCtx) => React.ReactNode;
}

const txt = (v: string | number | null | undefined, mw?: number) => (
  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: mw, color: 'var(--text-2)' }}>
    {v ?? '—'}
  </span>
);

const yesNo = (v: string | null | undefined) =>
  v === 'yes' ? <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 11 }}>yes</span>
  : v === 'no' ? <span style={{ color: 'var(--text-3)', fontSize: 11 }}>no</span>
  : <span style={{ color: 'var(--border-mid)', fontSize: 11 }}>—</span>;

/** Type-safe dynamic field accessor */
const r_ = { r: (r: Report, k: string): string | null | undefined => (r as any)[k] };

const COLUMN_DEFS: ColumnDef[] = [
  // ── Admin ──────────────────────────────────────────────────────────────────
  { id: 'report_id',            group: 'Admin', header: 'Report ID',          label: 'ID',         sortKey: 'report_id',
    render: (r) => <span style={{ color: 'var(--text-3)', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{r.report_id}</span> },
  { id: 'coding_status',        group: 'Admin', header: 'Coding Status',       label: 'Status',     sortKey: 'coding_status',
    render: (r, ctx) => <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: ctx.sc.color, background: ctx.sc.bg, border: `1px solid ${ctx.sc.border}` }}>{r.coding_status}</span> },
  { id: 'analyst_name',         group: 'Admin', header: 'Analyst',             label: 'Analyst',    sortKey: 'analyst_name',
    render: (r) => txt(r.analyst_name) },
  { id: 'source_organization',  group: 'Admin', header: 'Source Organization', label: 'Source Org', sortKey: 'source_organization',
    render: (r) => txt(r_.r(r,'source_organization')) },
  { id: 'date_received',        group: 'Admin', header: 'Date Received',       label: 'Received',   sortKey: 'date_received',
    render: (r) => txt(r.date_received?.slice(0, 10)) },
  { id: 'confidence_level',     group: 'Admin', header: 'Confidence Level',    label: 'Confidence', sortKey: 'confidence_level',
    render: (r) => txt(r_.r(r,'confidence_level')) },
  { id: 'original_report_format', group: 'Admin', header: 'Report Format',     label: 'Format',     sortKey: 'original_report_format',
    render: (r) => txt(r_.r(r,'original_report_format')) },
  { id: 'source_worker_id',     group: 'Admin', header: 'Source Worker ID',    label: 'Worker ID',  sortKey: 'source_worker_id',
    render: (r) => txt(r_.r(r,'source_worker_id')) },

  // ── Incident Basics ────────────────────────────────────────────────────────
  { id: 'incident_date', group: 'Incident', header: 'Incident Date', label: 'Inc. Date', title: 'Incident date (date incident occurred — not import date)', sortKey: 'incident_date',
    render: (r) => <span style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{r.incident_date || r.date_received?.slice(0, 10) || '—'}</span> },
  { id: 'day_of_week', group: 'Incident', header: 'Day of Week', label: 'Day', title: 'Day of week', sortKey: 'day_of_week',
    render: (r) => <span style={{ color: 'var(--text-3)', fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.day_of_week ? r.day_of_week.slice(0, 3) : '—'}</span> },
  { id: 'incident_time_exact',  group: 'Incident', header: 'Incident Time (Exact)',  label: 'Time',       sortKey: 'incident_time_exact',  render: (r) => txt(r_.r(r,'incident_time_exact')) },
  { id: 'incident_time_range',  group: 'Incident', header: 'Incident Time (Range)',  label: 'Time Range', sortKey: 'incident_time_range',  render: (r) => txt(r_.r(r,'incident_time_range')) },
  { id: 'city',                 group: 'Incident', header: 'City',                   label: 'City',       sortKey: 'city',
    render: (r) => <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{r.city || '—'}</span> },
  { id: 'neighbourhood',        group: 'Incident', header: 'Neighbourhood',          label: 'Nbhd',       sortKey: 'neighbourhood',        render: (r) => txt(r.neighbourhood) },
  { id: 'initial_contact_city', group: 'Incident', header: 'Initial Contact City',   label: 'Contact City', sortKey: 'initial_contact_city', render: (r) => txt(r_.r(r,'initial_contact_city')) },
  { id: 'incident_city',        group: 'Incident', header: 'Incident City',          label: 'Inc City',   sortKey: 'incident_city',        render: (r) => txt(r_.r(r,'incident_city')) },
  { id: 'destination_city',     group: 'Incident', header: 'Destination City',       label: 'Dest City',  sortKey: 'destination_city',     render: (r) => txt(r_.r(r,'destination_city')) },
  { id: 'initial_contact_location', group: 'Incident', header: 'Initial Contact Location', label: 'Contact Location', sortKey: 'initial_contact_location', render: (r) => txt(r_.r(r,'initial_contact_location'), 180) },
  { id: 'incident_location_primary', group: 'Incident', header: 'Incident Location (Primary)', label: 'Inc Location', sortKey: 'incident_location_primary', render: (r) => txt(r_.r(r,'incident_location_primary'), 180) },
  { id: 'incident_location_secondary', group: 'Incident', header: 'Incident Location (Secondary)', label: 'Inc Location 2', sortKey: 'incident_location_secondary', render: (r) => txt(r_.r(r,'incident_location_secondary'), 180) },
  { id: 'indoor_outdoor',  group: 'Incident', header: 'Indoor/Outdoor', label: 'In/Out',    sortKey: 'indoor_outdoor',  render: (r) => txt(r_.r(r,'indoor_outdoor')) },
  { id: 'public_private',  group: 'Incident', header: 'Public/Private', label: 'Pub/Priv',  sortKey: 'public_private',  render: (r) => txt(r_.r(r,'public_private')) },
  { id: 'deserted',        group: 'Incident', header: 'Deserted',       label: 'Deserted',  sortKey: 'deserted',        render: (r) => txt(r_.r(r,'deserted')) },
  { id: 'cross_city_movement', group: 'Incident', header: 'Cross-City Movement', label: 'Cross City', align: 'center', sortKey: 'cross_city_movement',
    render: (r) => yesNo(r_.r(r,'cross_city_movement')) },

  // ── Encounter ──────────────────────────────────────────────────────────────
  { id: 'initial_approach_type',    group: 'Encounter', header: 'Initial Approach Type', label: 'Approach',   sortKey: 'initial_approach_type',   render: (r) => txt(r_.r(r,'initial_approach_type'), 150) },
  { id: 'negotiation_present',      group: 'Encounter', header: 'Negotiation Present',   label: 'Negot',      align: 'center', sortKey: 'negotiation_present',
    render: (r) => <Dot val={r.negotiation_present} trueColor="var(--blue)" /> },
  { id: 'service_discussed',        group: 'Encounter', header: 'Service Discussed',     label: 'Service',    align: 'center', sortKey: 'service_discussed',
    render: (r) => <Dot val={r_.r(r,'service_discussed') ?? ''} trueColor="var(--blue)" /> },
  { id: 'payment_discussed',        group: 'Encounter', header: 'Payment Discussed',     label: 'Payment',    align: 'center', sortKey: 'payment_discussed',
    render: (r) => <Dot val={r_.r(r,'payment_discussed') ?? ''} trueColor="var(--blue)" /> },
  { id: 'refusal_present',          group: 'Encounter', header: 'Refusal Present',       label: 'Refusal',    align: 'center', sortKey: 'refusal_present',
    render: (r) => <Dot val={r_.r(r,'refusal_present') ?? ''} trueColor="var(--blue)" /> },
  { id: 'pressure_after_refusal',   group: 'Encounter', header: 'Pressure After Refusal', label: 'PaR',       align: 'center', sortKey: 'pressure_after_refusal',
    render: (r) => <Dot val={r_.r(r,'pressure_after_refusal') ?? ''} trueColor="var(--amber)" /> },
  { id: 'coercion_present',         group: 'Encounter', header: 'Coercion Present', label: 'C', title: 'Coercion', align: 'center', sortKey: 'coercion_present',
    render: (r) => <Dot val={r.coercion_present} trueColor="var(--accent)" /> },
  { id: 'threats_present',          group: 'Encounter', header: 'Threats Present',       label: 'Threats',    align: 'center', sortKey: 'threats_present',
    render: (r) => <Dot val={r_.r(r,'threats_present') ?? ''} trueColor="var(--amber)" /> },
  { id: 'verbal_abuse',             group: 'Encounter', header: 'Verbal Abuse',          label: 'VA',         align: 'center', sortKey: 'verbal_abuse',
    render: (r) => <Dot val={r_.r(r,'verbal_abuse') ?? ''} trueColor="var(--amber)" /> },
  { id: 'physical_force',           group: 'Encounter', header: 'Physical Force',        label: 'F', title: 'Physical force', align: 'center', sortKey: 'physical_force',
    render: (r) => <Dot val={r.physical_force} trueColor="var(--accent)" /> },
  { id: 'sexual_assault',           group: 'Encounter', header: 'Sexual Assault',        label: 'SA',         align: 'center', sortKey: 'sexual_assault',
    render: (r) => <Dot val={r.sexual_assault} trueColor="var(--accent)" /> },
  { id: 'robbery_theft',            group: 'Encounter', header: 'Robbery/Theft',         label: 'Rob',        align: 'center', sortKey: 'robbery_theft',
    render: (r) => <Dot val={r_.r(r,'robbery_theft') ?? ''} trueColor="var(--amber)" /> },
  { id: 'stealthing',               group: 'Encounter', header: 'Stealthing',            label: 'Stlth',      align: 'center', sortKey: 'stealthing',
    render: (r) => <Dot val={r_.r(r,'stealthing') ?? ''} trueColor="var(--accent)" /> },
  { id: 'exit_type',                group: 'Encounter', header: 'Exit Type',             label: 'Exit',       sortKey: 'exit_type',               render: (r) => txt(r_.r(r,'exit_type')) },
  { id: 'repeated_pressure',        group: 'Encounter', header: 'Repeated Pressure',     label: 'Rep Pres',   align: 'center', sortKey: 'repeated_pressure',
    render: (r) => <Dot val={r_.r(r,'repeated_pressure') ?? ''} trueColor="var(--amber)" /> },
  { id: 'intimidation_present',     group: 'Encounter', header: 'Intimidation Present',  label: 'Intim',      align: 'center', sortKey: 'intimidation_present',
    render: (r) => <Dot val={r_.r(r,'intimidation_present') ?? ''} trueColor="var(--amber)" /> },
  { id: 'abrupt_tone_change',       group: 'Encounter', header: 'Abrupt Tone Change',    label: 'ATC',        align: 'center', sortKey: 'abrupt_tone_change',
    render: (r) => <Dot val={r_.r(r,'abrupt_tone_change') ?? ''} trueColor="var(--amber)" /> },
  { id: 'verbal_abuse_before_violence', group: 'Encounter', header: 'Verbal Abuse Before Violence', label: 'VaBV', align: 'center', sortKey: 'verbal_abuse_before_violence',
    render: (r) => <Dot val={r_.r(r,'verbal_abuse_before_violence') ?? ''} trueColor="var(--amber)" /> },
  { id: 'escalation_trigger',       group: 'Encounter', header: 'Escalation Trigger',   label: 'Esc Trigger', sortKey: 'escalation_trigger',      render: (r) => txt(r_.r(r,'escalation_trigger'), 160) },

  // ── Mobility ───────────────────────────────────────────────────────────────
  { id: 'movement_present',            group: 'Mobility', header: 'Movement Present',         label: 'M', title: 'Movement present', align: 'center', sortKey: 'movement_present',
    render: (r) => <Dot val={r.movement_present} trueColor="var(--amber)" /> },
  { id: 'movement_attempted',          group: 'Mobility', header: 'Movement Attempted',        label: 'M Atmp',  align: 'center', sortKey: 'movement_attempted',
    render: (r) => <Dot val={r_.r(r,'movement_attempted') ?? ''} trueColor="var(--amber)" /> },
  { id: 'movement_completed',          group: 'Mobility', header: 'Movement Completed',        label: 'M Comp',  align: 'center', sortKey: 'movement_completed',
    render: (r) => <Dot val={r_.r(r,'movement_completed') ?? ''} trueColor="var(--amber)" /> },
  { id: 'mode_of_movement',            group: 'Mobility', header: 'Mode of Movement',          label: 'Mode',    sortKey: 'mode_of_movement',            render: (r) => txt(r.mode_of_movement) },
  { id: 'entered_vehicle',             group: 'Mobility', header: 'Entered Vehicle',           label: 'In Veh',  align: 'center', sortKey: 'entered_vehicle',
    render: (r) => <Dot val={r_.r(r,'entered_vehicle') ?? ''} trueColor="var(--blue)" /> },
  { id: 'public_to_private_shift',     group: 'Mobility', header: 'Public→Private Shift',      label: 'PtP',     align: 'center', sortKey: 'public_to_private_shift',
    render: (r) => <Dot val={r_.r(r,'public_to_private_shift') ?? ''} trueColor="var(--amber)" /> },
  { id: 'public_to_secluded_shift',    group: 'Mobility', header: 'Public→Secluded Shift',     label: 'PtS',     align: 'center', sortKey: 'public_to_secluded_shift',
    render: (r) => <Dot val={r_.r(r,'public_to_secluded_shift') ?? ''} trueColor="var(--amber)" /> },
  { id: 'cross_neighbourhood',         group: 'Mobility', header: 'Cross Neighbourhood',       label: 'X-Nbhd',  align: 'center', sortKey: 'cross_neighbourhood',
    render: (r) => <Dot val={r_.r(r,'cross_neighbourhood') ?? ''} trueColor="var(--amber)" /> },
  { id: 'cross_municipality',          group: 'Mobility', header: 'Cross Municipality',        label: 'X-Mun',   align: 'center', sortKey: 'cross_municipality',
    render: (r) => <Dot val={r_.r(r,'cross_municipality') ?? ''} trueColor="var(--amber)" /> },
  { id: 'offender_control_over_movement', group: 'Mobility', header: 'Offender Control Over Movement', label: 'Off Ctrl', sortKey: 'offender_control_over_movement', render: (r) => txt(r_.r(r,'offender_control_over_movement')) },
  { id: 'who_controlled_movement',     group: 'Mobility', header: 'Who Controlled Movement',   label: 'Who Ctrl', sortKey: 'who_controlled_movement',     render: (r) => txt(r_.r(r,'who_controlled_movement')) },
  { id: 'destination_known',           group: 'Mobility', header: 'Destination Known',         label: 'Dest Kn',  sortKey: 'destination_known',           render: (r) => txt(r_.r(r,'destination_known')) },
  { id: 'movement_confidence',         group: 'Mobility', header: 'Movement Confidence',       label: 'Mob Conf', sortKey: 'movement_confidence',         render: (r) => txt(r_.r(r,'movement_confidence')) },
  { id: 'location_certainty',          group: 'Mobility', header: 'Location Certainty',        label: 'Loc Cert', sortKey: 'location_certainty',          render: (r) => txt(r_.r(r,'location_certainty')) },
  { id: 'movement_notes',              group: 'Mobility', header: 'Movement Notes',            label: 'Mob Notes', sortKey: 'movement_notes',             render: (r) => txt(r_.r(r,'movement_notes'), 180) },
  { id: 'start_location_type',         group: 'Mobility', header: 'Start Location Type',       label: 'Start Type', sortKey: 'start_location_type',       render: (r) => txt(r_.r(r,'start_location_type')) },
  { id: 'destination_location_type',   group: 'Mobility', header: 'Destination Location Type', label: 'Dest Type',  sortKey: 'destination_location_type', render: (r) => txt(r_.r(r,'destination_location_type')) },

  // ── Suspect & Vehicle ──────────────────────────────────────────────────────
  { id: 'vehicle', group: 'Suspect/Vehicle', header: 'Vehicle Description', label: 'Vehicle', title: 'Vehicle details', sortKey: 'vehicle',
    render: (r) => {
      const vl = [r.vehicle_colour, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ');
      return vl ? <span style={{ fontSize: 11.5, color: 'var(--blue)' }}>{vl}</span>
        : r.vehicle_present === 'no' ? <span style={{ fontSize: 11, color: 'var(--text-3)' }}>foot</span>
        : <VehicleDot vehiclePresent={r.vehicle_present} mode={r.mode_of_movement} />;
    }},
  { id: 'vehicle_present',      group: 'Suspect/Vehicle', header: 'Vehicle Present',       label: 'Veh',        align: 'center', sortKey: 'vehicle_present',
    render: (r) => <VehicleDot vehiclePresent={r.vehicle_present} mode={r.mode_of_movement} /> },
  { id: 'vehicle_make',         group: 'Suspect/Vehicle', header: 'Vehicle Make',          label: 'Veh Make',   sortKey: 'vehicle_make',   render: (r) => txt(r.vehicle_make) },
  { id: 'vehicle_model',        group: 'Suspect/Vehicle', header: 'Vehicle Model',         label: 'Veh Model',  sortKey: 'vehicle_model',  render: (r) => txt(r.vehicle_model) },
  { id: 'vehicle_colour',       group: 'Suspect/Vehicle', header: 'Vehicle Colour',        label: 'Colour',     sortKey: 'vehicle_colour', render: (r) => txt(r.vehicle_colour) },
  { id: 'plate_partial',        group: 'Suspect/Vehicle', header: 'Plate (Partial)',        label: 'Plate',      sortKey: 'plate_partial',  render: (r) => txt(r.plate_partial) },
  { id: 'suspect_count',        group: 'Suspect/Vehicle', header: 'Suspect Count',         label: 'Sus #',      align: 'center', sortKey: 'suspect_count',
    render: (r) => txt(r.suspect_count != null ? String(r.suspect_count) : null) },
  { id: 'suspect_gender',       group: 'Suspect/Vehicle', header: 'Suspect Gender',        label: 'Sus Gender', sortKey: 'suspect_gender',       render: (r) => txt(r.suspect_gender) },
  { id: 'suspect_race_ethnicity', group: 'Suspect/Vehicle', header: 'Suspect Race/Ethnicity', label: 'Sus Race', sortKey: 'suspect_race_ethnicity', render: (r) => txt(r_.r(r,'suspect_race_ethnicity'), 140) },
  { id: 'suspect_age_estimate', group: 'Suspect/Vehicle', header: 'Suspect Age Estimate',  label: 'Sus Age',    sortKey: 'suspect_age_estimate', render: (r) => txt(r_.r(r,'suspect_age_estimate')) },
  { id: 'suspect_description_text', group: 'Suspect/Vehicle', header: 'Suspect Description', label: 'Sus Desc', sortKey: 'suspect_description_text', render: (r) => txt(r.suspect_description_text, 180) },
  { id: 'repeat_suspect_flag',  group: 'Suspect/Vehicle', header: 'Repeat Suspect Flag',   label: 'Rpt Sus',    align: 'center', sortKey: 'repeat_suspect_flag',
    render: (r) => <Dot val={r_.r(r,'repeat_suspect_flag') ?? ''} trueColor="var(--accent)" /> },
  { id: 'repeat_vehicle_flag',  group: 'Suspect/Vehicle', header: 'Repeat Vehicle Flag',   label: 'Rpt Veh',    align: 'center', sortKey: 'repeat_vehicle_flag',
    render: (r) => <Dot val={r_.r(r,'repeat_vehicle_flag') ?? ''} trueColor="var(--accent)" /> },

  // ── Narrative Coding ───────────────────────────────────────────────────────
  { id: 'raw_narrative',          group: 'Narrative', header: 'Narrative Snippet',      label: 'Narrative',   sortKey: 'raw_narrative',
    render: (r) => <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280, color: 'var(--text-2)' }}>{r.raw_narrative.slice(0, 85)}…</span> },
  { id: 'summary_analytic',       group: 'Narrative', header: 'Analytic Summary',       label: 'Summary',     sortKey: 'summary_analytic',       render: (r) => txt(r_.r(r,'summary_analytic'), 200) },
  { id: 'analyst_summary',        group: 'Narrative', header: 'Analyst Summary',        label: 'Anl Summary', sortKey: 'analyst_summary',        render: (r) => txt(r_.r(r,'analyst_summary'), 200) },
  { id: 'key_quotes',             group: 'Narrative', header: 'Key Quotes',             label: 'Key Quotes',  sortKey: 'key_quotes',             render: (r) => txt(r_.r(r,'key_quotes'), 180) },
  { id: 'coder_notes',            group: 'Narrative', header: 'Coder Notes',            label: 'Coder Notes', sortKey: 'coder_notes',            render: (r) => txt(r_.r(r,'coder_notes'), 180) },
  { id: 'uncertainty_notes',      group: 'Narrative', header: 'Uncertainty Notes',      label: 'Uncertainty', sortKey: 'uncertainty_notes',      render: (r) => txt(r_.r(r,'uncertainty_notes'), 180) },
  { id: 'escalation_point',       group: 'Narrative', header: 'Escalation Point',       label: 'Esc Point',   sortKey: 'escalation_point',       render: (r) => txt(r_.r(r,'escalation_point'), 150) },

  // ── GIS ───────────────────────────────────────────────────────────────────
  { id: 'lat_initial',     group: 'GIS', header: 'Lat — Initial Contact',  label: 'Lat (Contact)',  align: 'right', sortKey: 'lat_initial',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lat_initial != null ? Number((r as any).lat_initial).toFixed(5) : '—'}</span> },
  { id: 'lon_initial',     group: 'GIS', header: 'Lon — Initial Contact',  label: 'Lon (Contact)',  align: 'right', sortKey: 'lon_initial',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lon_initial != null ? Number((r as any).lon_initial).toFixed(5) : '—'}</span> },
  { id: 'lat_incident',    group: 'GIS', header: 'Lat — Incident',         label: 'Lat (Incident)', align: 'right', sortKey: 'lat_incident',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lat_incident != null ? Number((r as any).lat_incident).toFixed(5) : '—'}</span> },
  { id: 'lon_incident',    group: 'GIS', header: 'Lon — Incident',         label: 'Lon (Incident)', align: 'right', sortKey: 'lon_incident',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lon_incident != null ? Number((r as any).lon_incident).toFixed(5) : '—'}</span> },
  { id: 'lat_destination', group: 'GIS', header: 'Lat — Destination',      label: 'Lat (Dest)',     align: 'right', sortKey: 'lat_destination',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lat_destination != null ? Number((r as any).lat_destination).toFixed(5) : '—'}</span> },
  { id: 'lon_destination', group: 'GIS', header: 'Lon — Destination',      label: 'Lon (Dest)',     align: 'right', sortKey: 'lon_destination',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lon_destination != null ? Number((r as any).lon_destination).toFixed(5) : '—'}</span> },
  { id: 'geocode_status',  group: 'GIS', header: 'Geocode Status',          label: 'Geo Status',     sortKey: 'geocode_status',
    render: (r) => txt(r_.r(r, 'geocode_status')) },
  { id: 'initial_contact_address_raw',      group: 'GIS', header: 'Address Raw — Initial Contact', label: 'Addr Raw (Contact)', render: (r) => txt(r_.r(r,'initial_contact_address_raw'), 180) },
  { id: 'incident_address_raw',             group: 'GIS', header: 'Address Raw — Incident',        label: 'Addr Raw (Incident)', render: (r) => txt(r_.r(r,'incident_address_raw'), 180) },
  { id: 'destination_address_raw',          group: 'GIS', header: 'Address Raw — Destination',     label: 'Addr Raw (Dest)', render: (r) => txt(r_.r(r,'destination_address_raw'), 180) },
  { id: 'initial_contact_address_normalized', group: 'GIS', header: 'Address Normalized — Initial Contact', label: 'Addr Norm (Contact)', render: (r) => txt(r_.r(r,'initial_contact_address_normalized'), 180) },
  { id: 'incident_address_normalized',      group: 'GIS', header: 'Address Normalized — Incident',  label: 'Addr Norm (Incident)', render: (r) => txt(r_.r(r,'incident_address_normalized'), 180) },
  { id: 'destination_address_normalized',   group: 'GIS', header: 'Address Normalized — Destination', label: 'Addr Norm (Dest)', render: (r) => txt(r_.r(r,'destination_address_normalized'), 180) },
];

const COL_MAP = Object.fromEntries(COLUMN_DEFS.map(c => [c.id, c]));
const COL_GROUPS = Array.from(new Set(COLUMN_DEFS.map(c => c.group)));

const DEFAULT_VISIBLE: string[] = [
  'report_id', 'incident_date', 'day_of_week', 'city', 'raw_narrative',
  'vehicle', 'coercion_present', 'movement_present', 'physical_force',
  'sexual_assault', 'coding_status',
];

const LS_VISIBLE = 'caselist_visible_cols_v2';
const LS_ORDER   = 'caselist_col_order_v2';

function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CaseList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState<string | null>('incident_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [search,           setSearch]           = useState(() => searchParams.get('search') || '');
  const [filterStatus,     setFilterStatus]     = useState(() => searchParams.get('coding_status') || '');
  const [filterCoercion,   setFilterCoercion]   = useState(() => searchParams.get('coercion_present') || '');
  const [filterMovement,   setFilterMovement]   = useState(() => searchParams.get('movement_present') || '');
  const [filterPhysical,   setFilterPhysical]   = useState(() => searchParams.get('physical_force') || '');
  const [filterVehicle,    setFilterVehicle]    = useState(() => searchParams.get('vehicle_present') || '');
  const [filterCity,       setFilterCity]       = useState(() => searchParams.get('city') || '');
  const [filterDateFrom,   setFilterDateFrom]   = useState(() => searchParams.get('date_from') || '');
  const [filterDateTo,     setFilterDateTo]     = useState(() => searchParams.get('date_to') || '');
  const [filterSexualAssault, setFilterSexualAssault] = useState(() => searchParams.get('sexual_assault') || '');
  const [filterThreats,       setFilterThreats]       = useState(() => searchParams.get('threats_present') || '');

  // Batch NLP
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchResult, setBatchResult]       = useState<string | null>(null);

  // Column chooser state
  const [visibleCols, setVisibleCols] = useState<string[]>(() => lsGet(LS_VISIBLE, DEFAULT_VISIBLE));
  const [colOrder,    setColOrder]    = useState<string[]>(() => lsGet(LS_ORDER, DEFAULT_VISIBLE));
  const [showChooser, setShowChooser] = useState(false);

  // Drag-to-reorder refs
  const dragColRef     = useRef<string | null>(null);
  const dragOverColRef = useRef<string | null>(null);

  useEffect(() => { localStorage.setItem(LS_VISIBLE, JSON.stringify(visibleCols)); }, [visibleCols]);
  useEffect(() => { localStorage.setItem(LS_ORDER,   JSON.stringify(colOrder));   }, [colOrder]);

  // Ordered visible columns (colOrder controls sequence, visibleCols controls on/off)
  const orderedCols = useMemo(() => {
    const ordered = colOrder.filter(id => visibleCols.includes(id) && COL_MAP[id]);
    const extra   = visibleCols.filter(id => !ordered.includes(id) && COL_MAP[id]);
    return [...ordered, ...extra];
  }, [visibleCols, colOrder]);

  const activeFilters: { key: string; value: string; clear: () => void }[] = [
    { key: 'sexual_assault',  value: filterSexualAssault, clear: () => setFilterSexualAssault('') },
    { key: 'threats_present', value: filterThreats,       clear: () => setFilterThreats('') },
  ].filter(f => f.value);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const params: Record<string, string> = {};
    if (search)              params.search           = search;
    if (filterStatus)        params.coding_status    = filterStatus;
    if (filterCoercion)      params.coercion_present = filterCoercion;
    if (filterMovement)      params.movement_present = filterMovement;
    if (filterPhysical)      params.physical_force   = filterPhysical;
    if (filterVehicle)       params.vehicle_present  = filterVehicle;
    if (filterCity)          params.city             = filterCity;
    if (filterDateFrom)      params.date_from        = filterDateFrom;
    if (filterDateTo)        params.date_to          = filterDateTo;
    if (filterSexualAssault) params.sexual_assault   = filterSexualAssault;
    if (filterThreats)       params.threats_present  = filterThreats;
    try {
      setReports(await api.listReports(params));
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
    filterSexualAssault, filterThreats,
  ]);


  const handleSort = (key: string) => {
    if (sortColumn === key) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(key); setSortDirection('asc'); }
  };

  const yesNoVal = (v: string | null | undefined) => v === 'yes' ? 2 : v === 'no' ? 1 : 0;

  const sortedReports = useMemo(() => {
    if (!sortColumn) return reports;
    return [...reports].sort((a, b) => {
      const get = (r: Report): string | number => {
        if (sortColumn === 'vehicle')        return [r.vehicle_colour, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ');
        const raw = (r as any)[sortColumn];
        // yes/no fields — sort yes > no > unset
        if (raw === 'yes' || raw === 'no' || raw === 'unclear') return yesNoVal(raw);
        return raw ?? '';
      };
      const av = get(a), bv = get(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [reports, sortColumn, sortDirection]);

  const handleDelete = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this report? This cannot be undone.')) return;
    await api.deleteReport(reportId);
    setSelected(prev => { const n = new Set(prev); n.delete(reportId); return n; });
    load();
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selected);
    if (!confirm(`Delete ${ids.length} selected report${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    await api.deleteReports(ids);
    setSelected(new Set()); load();
  };

  const handleDeleteAll = async () => {
    const count = sortedReports.length;
    if (!confirm(`Delete ALL ${count} visible report${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    await api.deleteReports(sortedReports.map(r => r.report_id));
    setSelected(new Set()); load();
  };

  const allVisibleSelected = sortedReports.length > 0 && sortedReports.every(r => selected.has(r.report_id));
  const toggleSelectAll = () => { allVisibleSelected ? setSelected(new Set()) : setSelected(new Set(sortedReports.map(r => r.report_id))); };
  const toggleSelect = (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    setSelected(prev => { const n = new Set(prev); n.has(reportId) ? n.delete(reportId) : n.add(reportId); return n; });
  };

  // Column drag-to-reorder handlers
  const onDragStart = (colId: string) => { dragColRef.current = colId; };
  const onDragOver  = (e: React.DragEvent, colId: string) => { e.preventDefault(); dragOverColRef.current = colId; };
  const onDrop      = () => {
    const from = dragColRef.current, to = dragOverColRef.current;
    if (!from || !to || from === to) return;
    setColOrder(prev => {
      const order = [...prev];
      if (!order.includes(from)) order.push(from);
      if (!order.includes(to))   order.push(to);
      const fi = order.indexOf(from), ti = order.indexOf(to);
      order.splice(fi, 1);
      order.splice(ti, 0, from);
      return order;
    });
    dragColRef.current = null; dragOverColRef.current = null;
  };

  // Toggle a column on/off
  const toggleCol = (id: string, on: boolean) => {
    if (on) {
      setVisibleCols(prev => [...prev, id]);
      setColOrder(prev => prev.includes(id) ? prev : [...prev, id]);
    } else {
      setVisibleCols(prev => prev.filter(c => c !== id));
    }
  };

  const resetCols = () => { setVisibleCols(DEFAULT_VISIBLE); setColOrder(DEFAULT_VISIBLE); };

  const handleBatchAnalyze = async () => {
    setBatchAnalyzing(true);
    setBatchResult(null);
    try {
      const res = await api.batchAnalyze();
      if (!res.nlp_available) {
        setBatchResult('NLP not available — spaCy model not loaded on server');
      } else {
        setBatchResult(`NLP complete — ${res.processed} case${res.processed !== 1 ? 's' : ''} processed`);
        load();
      }
    } catch {
      setBatchResult('NLP batch failed — check server logs');
    } finally {
      setBatchAnalyzing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* ── Filter bar ── */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}>

        {/* Row 1: Search / dates  ←→  action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px' }}>

          {/* Search — grows to fill leftover space */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', flex: 1, minWidth: 0 }}>
            <Search size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <input
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-1)', outline: 'none', fontFamily: 'DM Sans, sans-serif' }}
              placeholder="Search narratives, suspects, vehicles…"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* City */}
          <input
            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--text-1)', outline: 'none', width: 80, flexShrink: 0 }}
            placeholder="City…" value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
          />

          {/* Date range — fixed narrow width */}
          <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>Incident date:</span>
          <input type="date" title="Incident date from"
            style={{ padding: '5px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 11, fontFamily: 'DM Sans, sans-serif', color: 'var(--text-1)', outline: 'none', width: 120, flexShrink: 0 }}
            value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
          />
          <span style={{ color: 'var(--text-3)', fontSize: 12, flexShrink: 0 }}>–</span>
          <input type="date" title="Date to"
            style={{ padding: '5px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 11, fontFamily: 'DM Sans, sans-serif', color: 'var(--text-1)', outline: 'none', width: 120, flexShrink: 0 }}
            value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
          />

          <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {reports.length} record{reports.length !== 1 ? 's' : ''}
          </span>

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

          {/* Action buttons — all flexShrink: 0 so they never get squeezed */}
          <button className="btn-ghost" onClick={() => setShowChooser(true)} title="Configure columns"
            style={{ fontSize: 12.5, flexShrink: 0, color: showChooser ? 'var(--blue)' : undefined }}>
            <Settings size={13} style={{ color: 'var(--blue)' }} /> Columns
          </button>
          <button className="btn-ghost" onClick={() => api.exportCsv()} style={{ fontSize: 12.5, flexShrink: 0 }}>
            <Download size={13} /> CSV
          </button>
          <button className="btn-ghost" onClick={() => api.exportGeoJson()} style={{ fontSize: 12.5, flexShrink: 0 }}>
            <Download size={13} /> GeoJSON
          </button>
          <button className="btn-ghost" onClick={handleBatchAnalyze} disabled={batchAnalyzing} style={{ fontSize: 12.5, flexShrink: 0 }}>
            <Sparkles size={13} style={{ color: 'var(--amber)' }} />
            {batchAnalyzing ? 'Processing…' : 'NLP All'}
          </button>
          {reports.length > 0 && <>
            <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
            <button className="btn-ghost" onClick={handleDeleteAll}
              style={{ fontSize: 12.5, flexShrink: 0, color: 'var(--critical-red, #A51F1F)', borderColor: 'var(--critical-red-border, #F5C6C6)' }}
              title="Delete all currently visible reports">
              <Trash2 size={13} /> Delete All
            </button>
          </>}
        </div>

        {/* Row 2: Dropdown filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 9px', borderTop: '1px solid var(--border)' }}>
          <SlidersHorizontal size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          {[
            { value: filterStatus,   set: setFilterStatus,   options: [['','All statuses'],['uncoded','Uncoded'],['in_progress','In Progress'],['coded','Coded'],['reviewed','Reviewed']] },
            { value: filterCoercion, set: setFilterCoercion, options: [['','Coercion: any'],['yes','Coercion: yes'],['no','Coercion: no']] },
            { value: filterMovement, set: setFilterMovement, options: [['','Movement: any'],['yes','Movement: yes'],['no','Movement: no']] },
            { value: filterPhysical, set: setFilterPhysical, options: [['','Physical force: any'],['yes','Force: yes'],['no','Force: no']] },
            { value: filterVehicle,  set: setFilterVehicle,  options: [['','Vehicle: any'],['yes','Vehicle: yes'],['no','Vehicle: no']] },
          ].map((f, i) => (
            <select key={i} value={f.value} onChange={(e) => f.set(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: f.value ? 'var(--accent-pale)' : 'var(--surface)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: f.value ? 'var(--accent)' : 'var(--text-1)', outline: 'none', cursor: 'pointer' }}>
              {f.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
          ))}
          {batchResult && (
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontStyle: 'italic', marginLeft: 8 }}>{batchResult}</span>
          )}
        </div>

      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 20px', background: 'var(--amber-pale)', borderBottom: '1px solid var(--amber-border)', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>Active filters:</span>
          {activeFilters.map(({ key, value, clear }) => {
            const label = ACTIVE_FILTER_LABELS[key]?.(value) ?? `${key}: ${value}`;
            return (
              <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 20, fontSize: 11.5, fontWeight: 500, background: 'var(--amber-pale)', color: 'var(--amber)', border: '1px solid var(--amber-border)' }}>
                {label}
                <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--amber)', opacity: 0.7 }}><X size={11} /></button>
              </span>
            );
          })}
          <button onClick={() => { setFilterSexualAssault(''); setFilterThreats(''); }}
            style={{ fontSize: 11, color: 'var(--amber)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', textDecoration: 'underline' }}>
            Clear all
          </button>
        </div>
      )}

      {/* Bulk selection bar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 20px', background: 'var(--blue-pale)', borderBottom: '1px solid var(--blue-border)', flexShrink: 0 }}>
          <CheckSquare size={14} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--blue)' }}>{selected.size} selected</span>
          <button onClick={handleDeleteSelected} style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--critical-red-border, #F5C6C6)', background: 'var(--critical-red-pale, #FDF2F2)', color: 'var(--critical-red, #A51F1F)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            <Trash2 size={12} /> Delete Selected
          </button>
          <button onClick={() => setSelected(new Set())} style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontFamily: 'DM Sans, sans-serif', textDecoration: 'underline' }}>
            Clear selection
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
        ) : loadError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 12 }}>
            <p style={{ color: 'var(--accent)', fontSize: 14, margin: 0 }}>Could not reach backend: {loadError}</p>
            <button onClick={load} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 14px', cursor: 'pointer' }}>Retry</button>
          </div>
        ) : reports.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 12 }}>
            <FileText size={36} style={{ color: 'var(--border-mid)' }} />
            <p style={{ color: 'var(--text-3)', fontSize: 14, margin: 0 }}>No reports found.</p>
            <button onClick={() => navigate('/')} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Add your first report →</button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1.5px solid var(--border)', position: 'sticky', top: 0, zIndex: 1 }}>
                {/* Checkbox */}
                <th style={{ padding: '9px 10px', width: 32 }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} title="Select / deselect all visible" style={{ cursor: 'pointer', accentColor: 'var(--blue)' }} />
                </th>

                {/* Dynamic columns */}
                {orderedCols.map(colId => {
                  const col = COL_MAP[colId];
                  if (!col) return null;
                  const isSort = col.sortKey && sortColumn === col.sortKey;
                  return (
                    <th
                      key={col.id}
                      draggable
                      onDragStart={() => onDragStart(col.id)}
                      onDragOver={(e) => onDragOver(e, col.id)}
                      onDrop={onDrop}
                      onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                      title={col.title ?? col.header}
                      style={{
                        padding: '9px 10px',
                        textAlign: (col.align ?? 'left') as any,
                        fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
                        color: isSort ? 'var(--text-1)' : 'var(--text-3)',
                        fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
                        cursor: col.sortKey ? 'pointer' : 'grab',
                        userSelect: 'none',
                        borderRight: '1px solid var(--border)',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--border)', fontSize: 10, cursor: 'grab' }} title="Drag to reorder">⠿</span>
                        {col.label}
                        {col.sortKey && (
                          <span style={{ opacity: isSort ? 1 : 0.3 }}>
                            {isSort ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}

                {/* Actions */}
                <th style={{ padding: '9px 8px', width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {sortedReports.map((r, i) => {
                const sc    = STATUS_COLORS[r.coding_status] || STATUS_COLORS.uncoded;
                const ctx: ColCtx = { sc };
                return (
                  <tr
                    key={r.report_id}
                    onClick={() => navigate(`/code/${r.report_id}`)}
                    style={{
                      cursor: 'pointer',
                      background: selected.has(r.report_id) ? 'var(--blue-pale)' : i % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { if (!selected.has(r.report_id)) e.currentTarget.style.background = 'var(--accent-pale)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = selected.has(r.report_id) ? 'var(--blue-pale)' : i % 2 === 0 ? 'var(--surface)' : 'var(--bg)'; }}
                  >
                    {/* Checkbox */}
                    <td style={{ padding: '8px 10px', width: 32 }} onClick={(e) => toggleSelect(e, r.report_id)}>
                      <input type="checkbox" checked={selected.has(r.report_id)} onChange={() => {}} style={{ cursor: 'pointer', accentColor: 'var(--blue)' }} />
                    </td>

                    {/* Dynamic cells */}
                    {orderedCols.map(colId => {
                      const col = COL_MAP[colId];
                      if (!col) return null;
                      return (
                        <td key={col.id} style={{ padding: '8px 10px', textAlign: (col.align ?? 'left') as any, borderRight: '1px solid var(--border)' }}>
                          {col.render(r, ctx)}
                        </td>
                      );
                    })}

                    {/* Delete */}
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      <button
                        onClick={(e) => handleDelete(e, r.report_id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--border-mid)', padding: 4, borderRadius: 4, transition: 'color 0.15s' }}
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

      {/* ── Column Chooser Drawer ── */}
      {showChooser && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.35)' }}
          onClick={() => setShowChooser(false)}
        >
          <div
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: 340,
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={15} style={{ color: 'var(--blue)' }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>Choose Columns</span>
              </div>
              <button onClick={() => setShowChooser(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                <X size={16} />
              </button>
            </div>

            {/* Hint */}
            <div style={{ padding: '8px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg)' }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                Drag column headers in the table to reorder. Check/uncheck to show or hide.
              </span>
              <button onClick={resetCols} style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                Reset to defaults
              </button>
            </div>

            {/* Column list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px 20px' }}>
              {COL_GROUPS.map(group => (
                <div key={group} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
                    {group}
                  </div>
                  {COLUMN_DEFS.filter(c => c.group === group).map(col => (
                    <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={visibleCols.includes(col.id)}
                        onChange={(e) => toggleCol(col.id, e.target.checked)}
                        style={{ accentColor: 'var(--blue)', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{col.header}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>{col.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                onClick={() => setShowChooser(false)}
                style={{ width: '100%', padding: '8px', borderRadius: 6, border: 'none', background: 'var(--blue)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
