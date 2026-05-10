import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, SlidersHorizontal, Trash2, FileText, Download, X, CheckSquare,
  Settings, Sparkles, MapPin, Link2, Eye,
} from 'lucide-react';
import { api } from '../api';
import type { Report } from '../types';
import { useToast } from '../components/Toast';

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
  { id: 'report_id',            group: 'Admin', header: 'Case ID',             label: 'Case ID',    sortKey: 'report_id',
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
  { id: 'primary_harm',           group: 'Encounter', header: 'Primary Harm Type',     label: 'Primary Harm',  sortKey: 'primary_harm',
    render: (r) => {
      const v = r.primary_harm;
      if (!v) return <span style={{ color: 'var(--border-mid)', fontSize: 11 }}>—</span>;
      return <span style={{ fontSize: 11.5, color: 'var(--accent)' }}>{v}</span>;
    }},
  { id: 'multi_harm_flag',        group: 'Encounter', header: 'Multi-Harm',            label: 'Multi-Harm',    align: 'center', sortKey: 'multi_harm_flag',
    render: (r) => <Dot val={r.multi_harm_flag} trueColor="var(--accent)" /> },
  { id: 'initial_approach_type',  group: 'Encounter', header: 'Initial Approach Type', label: 'Approach',      sortKey: 'initial_approach_type',   render: (r) => txt(r_.r(r,'initial_approach_type'), 150) },
  { id: 'negotiation_present',    group: 'Encounter', header: 'Negotiation Present',   label: 'Negotiation',   align: 'center', sortKey: 'negotiation_present',
    render: (r) => <Dot val={r.negotiation_present} trueColor="var(--blue)" /> },
  { id: 'service_discussed',      group: 'Encounter', header: 'Service Discussed',     label: 'Service',       align: 'center', sortKey: 'service_discussed',
    render: (r) => <Dot val={r_.r(r,'service_discussed') ?? ''} trueColor="var(--blue)" /> },
  { id: 'payment_discussed',      group: 'Encounter', header: 'Payment Discussed',     label: 'Payment',       align: 'center', sortKey: 'payment_discussed',
    render: (r) => <Dot val={r_.r(r,'payment_discussed') ?? ''} trueColor="var(--blue)" /> },
  { id: 'refusal_present',        group: 'Encounter', header: 'Refusal Present',       label: 'Refusal',       align: 'center', sortKey: 'refusal_present',
    render: (r) => <Dot val={r_.r(r,'refusal_present') ?? ''} trueColor="var(--blue)" /> },
  { id: 'pressure_after_refusal', group: 'Encounter', header: 'Pressure After Refusal', label: 'Pressure / Refusal', align: 'center', sortKey: 'pressure_after_refusal',
    render: (r) => <Dot val={r_.r(r,'pressure_after_refusal') ?? ''} trueColor="var(--amber)" /> },
  { id: 'coercion_present',       group: 'Encounter', header: 'Coercion Present',      label: 'Coercion',      align: 'center', sortKey: 'coercion_present',
    render: (r) => <Dot val={r.coercion_present} trueColor="var(--accent)" /> },
  { id: 'threats_present',        group: 'Encounter', header: 'Threats Present',       label: 'Threats',       align: 'center', sortKey: 'threats_present',
    render: (r) => <Dot val={r_.r(r,'threats_present') ?? ''} trueColor="var(--amber)" /> },
  { id: 'verbal_abuse',           group: 'Encounter', header: 'Verbal Abuse',          label: 'Verbal abuse',  align: 'center', sortKey: 'verbal_abuse',
    render: (r) => <Dot val={r_.r(r,'verbal_abuse') ?? ''} trueColor="var(--amber)" /> },
  { id: 'physical_force',         group: 'Encounter', header: 'Physical Force',        label: 'Physical',      align: 'center', sortKey: 'physical_force',
    render: (r) => <Dot val={r.physical_force} trueColor="var(--accent)" /> },
  { id: 'sexual_assault',         group: 'Encounter', header: 'Sexual Assault',        label: 'Sexual assault', align: 'center', sortKey: 'sexual_assault',
    render: (r) => <Dot val={r.sexual_assault} trueColor="var(--accent)" /> },
  { id: 'robbery_theft',          group: 'Encounter', header: 'Robbery/Theft',         label: 'Robbery/theft',  align: 'center', sortKey: 'robbery_theft',
    render: (r) => <Dot val={r_.r(r,'robbery_theft') ?? ''} trueColor="var(--amber)" /> },
  { id: 'stealthing',             group: 'Encounter', header: 'Stealthing',            label: 'Stealthing',     align: 'center', sortKey: 'stealthing',
    render: (r) => <Dot val={r_.r(r,'stealthing') ?? ''} trueColor="var(--accent)" /> },
  { id: 'exit_type',              group: 'Encounter', header: 'Exit Type',             label: 'Exit type',      sortKey: 'exit_type',               render: (r) => txt(r_.r(r,'exit_type')) },
  { id: 'repeated_pressure',      group: 'Encounter', header: 'Repeated Pressure',     label: 'Rep. pressure',  align: 'center', sortKey: 'repeated_pressure',
    render: (r) => <Dot val={r_.r(r,'repeated_pressure') ?? ''} trueColor="var(--amber)" /> },
  { id: 'intimidation_present',   group: 'Encounter', header: 'Intimidation Present',  label: 'Intimidation',   align: 'center', sortKey: 'intimidation_present',
    render: (r) => <Dot val={r_.r(r,'intimidation_present') ?? ''} trueColor="var(--amber)" /> },
  { id: 'abrupt_tone_change',     group: 'Encounter', header: 'Abrupt Tone Change',    label: 'Tone change',    align: 'center', sortKey: 'abrupt_tone_change',
    render: (r) => <Dot val={r_.r(r,'abrupt_tone_change') ?? ''} trueColor="var(--amber)" /> },
  { id: 'verbal_abuse_before_violence', group: 'Encounter', header: 'Verbal Abuse Before Violence', label: 'VA → violence', align: 'center', sortKey: 'verbal_abuse_before_violence',
    render: (r) => <Dot val={r_.r(r,'verbal_abuse_before_violence') ?? ''} trueColor="var(--amber)" /> },
  { id: 'escalation_trigger',     group: 'Encounter', header: 'Escalation Trigger',    label: 'Esc. trigger',   sortKey: 'escalation_trigger',      render: (r) => txt(r_.r(r,'escalation_trigger'), 160) },

  // ── Mobility ───────────────────────────────────────────────────────────────
  { id: 'movement_present',            group: 'Mobility', header: 'Movement Present',         label: 'Movement',       align: 'center', sortKey: 'movement_present',
    render: (r) => <Dot val={r.movement_present} trueColor="var(--amber)" /> },
  { id: 'movement_attempted',          group: 'Mobility', header: 'Movement Attempted',        label: 'Mov. attempted', align: 'center', sortKey: 'movement_attempted',
    render: (r) => <Dot val={r_.r(r,'movement_attempted') ?? ''} trueColor="var(--amber)" /> },
  { id: 'movement_completed',          group: 'Mobility', header: 'Movement Completed',        label: 'Mov. completed', align: 'center', sortKey: 'movement_completed',
    render: (r) => <Dot val={r_.r(r,'movement_completed') ?? ''} trueColor="var(--amber)" /> },
  { id: 'mode_of_movement',            group: 'Mobility', header: 'Mode of Movement',          label: 'Mode',           sortKey: 'mode_of_movement',            render: (r) => txt(r.mode_of_movement) },
  { id: 'entered_vehicle',             group: 'Mobility', header: 'Entered Vehicle',           label: 'In vehicle',     align: 'center', sortKey: 'entered_vehicle',
    render: (r) => <Dot val={r_.r(r,'entered_vehicle') ?? ''} trueColor="var(--blue)" /> },
  { id: 'public_to_private_shift',     group: 'Mobility', header: 'Public→Private Shift',      label: 'Public → private', align: 'center', sortKey: 'public_to_private_shift',
    render: (r) => <Dot val={r_.r(r,'public_to_private_shift') ?? ''} trueColor="var(--amber)" /> },
  { id: 'public_to_secluded_shift',    group: 'Mobility', header: 'Public→Secluded Shift',     label: 'Public → secluded', align: 'center', sortKey: 'public_to_secluded_shift',
    render: (r) => <Dot val={r_.r(r,'public_to_secluded_shift') ?? ''} trueColor="var(--amber)" /> },
  { id: 'cross_neighbourhood',         group: 'Mobility', header: 'Cross Neighbourhood',       label: 'Cross nbhd.',    align: 'center', sortKey: 'cross_neighbourhood',
    render: (r) => <Dot val={r_.r(r,'cross_neighbourhood') ?? ''} trueColor="var(--amber)" /> },
  { id: 'cross_municipality',          group: 'Mobility', header: 'Cross Municipality',        label: 'Cross mun.',     align: 'center', sortKey: 'cross_municipality',
    render: (r) => <Dot val={r_.r(r,'cross_municipality') ?? ''} trueColor="var(--amber)" /> },
  { id: 'offender_control_over_movement', group: 'Mobility', header: 'Offender Control Over Movement', label: 'Off. control', sortKey: 'offender_control_over_movement', render: (r) => txt(r_.r(r,'offender_control_over_movement')) },
  { id: 'who_controlled_movement',     group: 'Mobility', header: 'Who Controlled Movement',   label: 'Who controlled', sortKey: 'who_controlled_movement',     render: (r) => txt(r_.r(r,'who_controlled_movement')) },
  { id: 'destination_known',           group: 'Mobility', header: 'Destination Known',         label: 'Dest. known',    sortKey: 'destination_known',           render: (r) => txt(r_.r(r,'destination_known')) },
  { id: 'movement_confidence',         group: 'Mobility', header: 'Movement Confidence',       label: 'Mob. confidence', sortKey: 'movement_confidence',         render: (r) => txt(r_.r(r,'movement_confidence')) },
  { id: 'location_certainty',          group: 'Mobility', header: 'Location Certainty',        label: 'Loc. certainty', sortKey: 'location_certainty',          render: (r) => txt(r_.r(r,'location_certainty')) },
  { id: 'movement_notes',              group: 'Mobility', header: 'Movement Notes',            label: 'Mob. notes',     sortKey: 'movement_notes',             render: (r) => txt(r_.r(r,'movement_notes'), 180) },
  { id: 'start_location_type',         group: 'Mobility', header: 'Start Location Type',       label: 'Start type',     sortKey: 'start_location_type',       render: (r) => txt(r_.r(r,'start_location_type')) },
  { id: 'destination_location_type',   group: 'Mobility', header: 'Destination Location Type', label: 'Dest. type',     sortKey: 'destination_location_type', render: (r) => txt(r_.r(r,'destination_location_type')) },

  // ── Suspect & Vehicle ──────────────────────────────────────────────────────
  { id: 'vehicle', group: 'Suspect/Vehicle', header: 'Vehicle Summary', label: 'Vehicle', title: 'Vehicle colour / make / model', sortKey: 'vehicle',
    render: (r) => {
      const vl = [r.vehicle_colour, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ');
      return vl ? <span style={{ fontSize: 11.5, color: 'var(--blue)' }}>{vl}</span>
        : r.vehicle_present === 'no' ? <span style={{ fontSize: 11, color: 'var(--text-3)' }}>foot</span>
        : <VehicleDot vehiclePresent={r.vehicle_present} mode={r.mode_of_movement} />;
    }},
  { id: 'vehicle_present',      group: 'Suspect/Vehicle', header: 'Vehicle Present',       label: 'Vehicle pres.',  align: 'center', sortKey: 'vehicle_present',
    render: (r) => <VehicleDot vehiclePresent={r.vehicle_present} mode={r.mode_of_movement} /> },
  { id: 'vehicle_make',         group: 'Suspect/Vehicle', header: 'Vehicle Make',          label: 'Make',           sortKey: 'vehicle_make',   render: (r) => txt(r.vehicle_make) },
  { id: 'vehicle_model',        group: 'Suspect/Vehicle', header: 'Vehicle Model',         label: 'Model',          sortKey: 'vehicle_model',  render: (r) => txt(r.vehicle_model) },
  { id: 'vehicle_colour',       group: 'Suspect/Vehicle', header: 'Vehicle Colour',        label: 'Colour',         sortKey: 'vehicle_colour', render: (r) => txt(r.vehicle_colour) },
  { id: 'plate_partial',        group: 'Suspect/Vehicle', header: 'Plate (Partial)',        label: 'Plate',          sortKey: 'plate_partial',  render: (r) => txt(r.plate_partial) },
  { id: 'suspect_count',        group: 'Suspect/Vehicle', header: 'Suspect Count',         label: 'Suspect #',      align: 'center', sortKey: 'suspect_count',
    render: (r) => txt(r.suspect_count != null ? String(r.suspect_count) : null) },
  { id: 'suspect_gender',       group: 'Suspect/Vehicle', header: 'Suspect Gender',        label: 'Gender',         sortKey: 'suspect_gender',       render: (r) => txt(r.suspect_gender) },
  { id: 'suspect_race_ethnicity', group: 'Suspect/Vehicle', header: 'Suspect Race/Ethnicity', label: 'Race/ethnicity', sortKey: 'suspect_race_ethnicity', render: (r) => txt(r_.r(r,'suspect_race_ethnicity'), 140) },
  { id: 'suspect_age_estimate', group: 'Suspect/Vehicle', header: 'Suspect Age Estimate',  label: 'Age estimate',   sortKey: 'suspect_age_estimate', render: (r) => txt(r_.r(r,'suspect_age_estimate')) },
  { id: 'suspect_description_text', group: 'Suspect/Vehicle', header: 'Suspect Description', label: 'Suspect desc.', sortKey: 'suspect_description_text', render: (r) => txt(r.suspect_description_text, 180) },
  { id: 'repeat_suspect_flag',  group: 'Suspect/Vehicle', header: 'Repeat Suspect Flag',   label: 'Rpt. suspect',   align: 'center', sortKey: 'repeat_suspect_flag',
    render: (r) => <Dot val={r_.r(r,'repeat_suspect_flag') ?? ''} trueColor="var(--accent)" /> },
  { id: 'repeat_vehicle_flag',  group: 'Suspect/Vehicle', header: 'Repeat Vehicle Flag',   label: 'Rpt. vehicle',   align: 'center', sortKey: 'repeat_vehicle_flag',
    render: (r) => <Dot val={r_.r(r,'repeat_vehicle_flag') ?? ''} trueColor="var(--accent)" /> },
  { id: 'linkage_flag',         group: 'Suspect/Vehicle', header: 'Linkage Flag (combined)', label: 'Linkage flag', align: 'center', title: 'Repeat suspect or vehicle flag — possible case linkage',
    render: (r) => {
      const sus = r_.r(r,'repeat_suspect_flag') === 'yes';
      const veh = r_.r(r,'repeat_vehicle_flag') === 'yes';
      if (!sus && !veh) return <span style={{ color: 'var(--border-mid)', fontSize: 11 }}>—</span>;
      return (
        <span title={[sus && 'Repeat suspect', veh && 'Repeat vehicle'].filter(Boolean).join(', ')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <Link2 size={10} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>
            {[sus && 'S', veh && 'V'].filter(Boolean).join('+')}
          </span>
        </span>
      );
    }},

  // ── Narrative Coding ───────────────────────────────────────────────────────
  { id: 'raw_narrative',          group: 'Narrative', header: 'Narrative Preview',      label: 'Narrative',      sortKey: 'raw_narrative',
    render: (r) => <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280, color: 'var(--text-2)' }}>{r.raw_narrative.slice(0, 85)}…</span> },
  { id: 'summary_analytic',       group: 'Narrative', header: 'Analytic Summary',       label: 'Analytic summ.',  sortKey: 'summary_analytic',       render: (r) => txt(r_.r(r,'summary_analytic'), 200) },
  { id: 'analyst_summary',        group: 'Narrative', header: 'Analyst Summary',        label: 'Analyst summ.',  sortKey: 'analyst_summary',        render: (r) => txt(r_.r(r,'analyst_summary'), 200) },
  { id: 'key_quotes',             group: 'Narrative', header: 'Key Quotes',             label: 'Key quotes',     sortKey: 'key_quotes',             render: (r) => txt(r_.r(r,'key_quotes'), 180) },
  { id: 'coder_notes',            group: 'Narrative', header: 'Coder Notes',            label: 'Coder notes',    sortKey: 'coder_notes',            render: (r) => txt(r_.r(r,'coder_notes'), 180) },
  { id: 'uncertainty_notes',      group: 'Narrative', header: 'Uncertainty Notes',      label: 'Uncertainty',    sortKey: 'uncertainty_notes',      render: (r) => txt(r_.r(r,'uncertainty_notes'), 180) },
  { id: 'escalation_point',       group: 'Narrative', header: 'Escalation Point',       label: 'Esc. point',     sortKey: 'escalation_point',       render: (r) => txt(r_.r(r,'escalation_point'), 150) },

  // ── GIS ───────────────────────────────────────────────────────────────────
  { id: 'geocode_status',  group: 'GIS', header: 'Geocoding Status', label: 'Geocode status', sortKey: 'geocode_status',
    render: (r) => {
      const v = r_.r(r, 'geocode_status') || '';
      const hasCoords = (r as any).lat_initial != null || (r as any).lat_incident != null;
      if (hasCoords) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}><MapPin size={10} style={{ color: 'var(--green)' }} /><span style={{ color: 'var(--green)' }}>geocoded</span></span>;
      return <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{v || 'not geocoded'}</span>;
    }},
  { id: 'lat_initial',     group: 'GIS', header: 'Lat — Initial Contact',  label: 'Lat (contact)',  align: 'right', sortKey: 'lat_initial',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lat_initial != null ? Number((r as any).lat_initial).toFixed(5) : '—'}</span> },
  { id: 'lon_initial',     group: 'GIS', header: 'Lon — Initial Contact',  label: 'Lon (contact)',  align: 'right', sortKey: 'lon_initial',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lon_initial != null ? Number((r as any).lon_initial).toFixed(5) : '—'}</span> },
  { id: 'lat_incident',    group: 'GIS', header: 'Lat — Incident',         label: 'Lat (incident)', align: 'right', sortKey: 'lat_incident',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lat_incident != null ? Number((r as any).lat_incident).toFixed(5) : '—'}</span> },
  { id: 'lon_incident',    group: 'GIS', header: 'Lon — Incident',         label: 'Lon (incident)', align: 'right', sortKey: 'lon_incident',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lon_incident != null ? Number((r as any).lon_incident).toFixed(5) : '—'}</span> },
  { id: 'lat_destination', group: 'GIS', header: 'Lat — Destination',      label: 'Lat (dest)',     align: 'right', sortKey: 'lat_destination',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lat_destination != null ? Number((r as any).lat_destination).toFixed(5) : '—'}</span> },
  { id: 'lon_destination', group: 'GIS', header: 'Lon — Destination',      label: 'Lon (dest)',     align: 'right', sortKey: 'lon_destination',
    render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{(r as any).lon_destination != null ? Number((r as any).lon_destination).toFixed(5) : '—'}</span> },
  { id: 'initial_contact_address_raw',      group: 'GIS', header: 'Address Raw — Initial Contact', label: 'Addr raw (contact)', render: (r) => txt(r_.r(r,'initial_contact_address_raw'), 180) },
  { id: 'incident_address_raw',             group: 'GIS', header: 'Address Raw — Incident',        label: 'Addr raw (incident)', render: (r) => txt(r_.r(r,'incident_address_raw'), 180) },
  { id: 'destination_address_raw',          group: 'GIS', header: 'Address Raw — Destination',     label: 'Addr raw (dest)', render: (r) => txt(r_.r(r,'destination_address_raw'), 180) },
  { id: 'initial_contact_address_normalized', group: 'GIS', header: 'Address Normalized — Initial Contact', label: 'Addr norm. (contact)', render: (r) => txt(r_.r(r,'initial_contact_address_normalized'), 180) },
  { id: 'incident_address_normalized',      group: 'GIS', header: 'Address Normalized — Incident',  label: 'Addr norm. (incident)', render: (r) => txt(r_.r(r,'incident_address_normalized'), 180) },
  { id: 'destination_address_normalized',   group: 'GIS', header: 'Address Normalized — Destination', label: 'Addr norm. (dest)', render: (r) => txt(r_.r(r,'destination_address_normalized'), 180) },
];

const COL_MAP = Object.fromEntries(COLUMN_DEFS.map(c => [c.id, c]));
const COL_GROUPS = Array.from(new Set(COLUMN_DEFS.map(c => c.group)));

const DEFAULT_VISIBLE: string[] = [
  'report_id', 'incident_date', 'city', 'coding_status', 'analyst_name',
  'geocode_status', 'location_certainty', 'primary_harm', 'movement_present',
  'vehicle', 'suspect_description_text', 'linkage_flag', 'raw_narrative',
];

const LS_VISIBLE = 'caselist_visible_cols_v3';
const LS_ORDER   = 'caselist_col_order_v3';

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
  const [search,              setSearch]              = useState(() => searchParams.get('search') || '');
  const [filterStatus,        setFilterStatus]        = useState(() => searchParams.get('coding_status') || '');
  const [filterCoercion,      setFilterCoercion]      = useState(() => searchParams.get('coercion_present') || '');
  const [filterMovement,      setFilterMovement]      = useState(() => searchParams.get('movement_present') || '');
  const [filterPhysical,      setFilterPhysical]      = useState(() => searchParams.get('physical_force') || '');
  const [filterVehicle,       setFilterVehicle]       = useState(() => searchParams.get('vehicle_present') || '');
  const [filterCity,          setFilterCity]          = useState(() => searchParams.get('city') || '');
  const [filterDateFrom,      setFilterDateFrom]      = useState(() => searchParams.get('date_from') || '');
  const [filterDateTo,        setFilterDateTo]        = useState(() => searchParams.get('date_to') || '');
  const [filterSexualAssault, setFilterSexualAssault] = useState(() => searchParams.get('sexual_assault') || '');
  const [filterThreats,       setFilterThreats]       = useState(() => searchParams.get('threats_present') || '');
  const [filterHarm,          setFilterHarm]          = useState(() => searchParams.get('primary_harm') || '');
  const [filterLinkage,       setFilterLinkage]       = useState('');
  const [filterGeocode,       setFilterGeocode]       = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Batch NLP
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const addToast = useToast();

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

  // Client-side post-filters (harm type, linkage flag)
  const filteredReports = useMemo(() => {
    let rs = reports;
    if (filterHarm) rs = rs.filter(r => r.primary_harm === filterHarm);
    if (filterLinkage === 'yes') rs = rs.filter(r => r_.r(r,'repeat_suspect_flag') === 'yes' || r_.r(r,'repeat_vehicle_flag') === 'yes');
    if (filterLinkage === 'no')  rs = rs.filter(r => r_.r(r,'repeat_suspect_flag') !== 'yes' && r_.r(r,'repeat_vehicle_flag') !== 'yes');
    if (filterGeocode === 'yes') rs = rs.filter(r => (r as any).lat_initial != null || (r as any).lat_incident != null);
    if (filterGeocode === 'no')  rs = rs.filter(r => (r as any).lat_initial == null && (r as any).lat_incident == null);
    return rs;
  }, [reports, filterHarm, filterLinkage, filterGeocode]);

  // Summary stats (computed from full backend result, ignoring client-side filters)
  const stats = useMemo(() => {
    let coded = 0, uncoded = 0, inProgress = 0, geocoded = 0, linkage = 0, multiHarm = 0;
    for (const r of reports) {
      if (r.coding_status === 'coded')       coded++;
      else if (r.coding_status === 'uncoded') uncoded++;
      else if (r.coding_status === 'in_progress') inProgress++;
      if ((r as any).lat_initial != null || (r as any).lat_incident != null) geocoded++;
      if (r_.r(r,'repeat_suspect_flag') === 'yes' || r_.r(r,'repeat_vehicle_flag') === 'yes') linkage++;
      if (r.multi_harm_flag === 'yes') multiHarm++;
    }
    return { total: reports.length, coded, uncoded, inProgress, geocoded, linkage, multiHarm };
  }, [reports]);

  const handleSort = (key: string) => {
    if (sortColumn === key) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(key); setSortDirection('asc'); }
  };

  const yesNoVal = (v: string | null | undefined) => v === 'yes' ? 2 : v === 'no' ? 1 : 0;

  const DATE_SORT_KEYS = new Set(['incident_date', 'date_received']);
  const toTs = (v: string | null | undefined): number => {
    if (!v) return 0;
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  };

  const sortedReports = useMemo(() => {
    if (!sortColumn) return filteredReports;
    return [...filteredReports].sort((a, b) => {
      const get = (r: Report): string | number => {
        if (sortColumn === 'vehicle')       return [r.vehicle_colour, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ');
        if (sortColumn === 'incident_date') return toTs(r.incident_date || r.date_received?.slice(0, 10));
        const raw = (r as any)[sortColumn];
        if (raw === 'yes' || raw === 'no' || raw === 'unclear') return yesNoVal(raw);
        if (DATE_SORT_KEYS.has(sortColumn)) return toTs(raw);
        return raw ?? '';
      };
      const av = get(a), bv = get(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredReports, sortColumn, sortDirection]);

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

  const handleExportSelected = () => {
    api.exportCsv();
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
    try {
      const res = await api.batchAnalyze();
      if (!res.nlp_available) {
        addToast('NLP unavailable — spaCy model not loaded on server. Run: python -m spacy download en_core_web_sm', 'error');
      } else if (res.processed === 0) {
        addToast('NLP All — all cases already have NLP data. Open a case and click "NLP Analyze" to re-run on a specific case.', 'info');
      } else {
        addToast(`NLP complete — ${res.processed} case${res.processed !== 1 ? 's' : ''} analyzed. Open cases to review signals.`, 'success');
        load();
      }
    } catch {
      addToast('NLP batch failed — check that the backend is running', 'error');
    } finally {
      setBatchAnalyzing(false);
    }
  };

  const clearAllFilters = () => {
    setSearch(''); setFilterStatus(''); setFilterCoercion(''); setFilterMovement('');
    setFilterPhysical(''); setFilterVehicle(''); setFilterCity(''); setFilterDateFrom('');
    setFilterDateTo(''); setFilterSexualAssault(''); setFilterThreats('');
    setFilterHarm(''); setFilterLinkage(''); setFilterGeocode('');
  };

  const anyFilterActive = search || filterStatus || filterCoercion || filterMovement ||
    filterPhysical || filterVehicle || filterCity || filterDateFrom || filterDateTo ||
    filterSexualAssault || filterThreats || filterHarm || filterLinkage || filterGeocode;

  const advancedFilterCount = [filterCoercion, filterMovement, filterPhysical, filterVehicle,
    filterSexualAssault, filterThreats, filterHarm, filterLinkage].filter(Boolean).length;

  const sel = (value: string, set: (v: string) => void, options: [string, string][], active?: boolean) => (
    <select value={value} onChange={(e) => set(e.target.value)}
      style={{
        padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
        background: (active ?? !!value) ? 'var(--accent-pale)' : 'var(--surface)',
        fontSize: 12.5, fontFamily: 'DM Sans, sans-serif',
        color: (active ?? !!value) ? 'var(--accent)' : 'var(--text-2)',
        outline: 'none', cursor: 'pointer',
      }}>
      {options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
    </select>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* ── Filter bar ── */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', flexWrap: 'nowrap', overflowX: 'auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', flex: '1 1 160px', minWidth: 140 }}>
            <Search size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <input
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 12.5, color: 'var(--text-1)', outline: 'none', fontFamily: 'DM Sans, sans-serif' }}
              placeholder="Search narratives, suspects, vehicles…"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 0 }}><X size={11} /></button>}
          </div>

          <input
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: filterCity ? 'var(--accent-pale)' : 'var(--surface)', fontSize: 12.5, fontFamily: 'DM Sans, sans-serif', color: filterCity ? 'var(--accent)' : 'var(--text-1)', outline: 'none', width: 70, flexShrink: 0 }}
            placeholder="City…" value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
          />

          <input type="date" title="Incident date from"
            style={{ padding: '4px 5px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 11, fontFamily: 'DM Sans, sans-serif', color: 'var(--text-1)', outline: 'none', width: 112, flexShrink: 0 }}
            value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
          />
          <span style={{ color: 'var(--text-3)', fontSize: 11, flexShrink: 0 }}>–</span>
          <input type="date" title="Incident date to"
            style={{ padding: '4px 5px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 11, fontFamily: 'DM Sans, sans-serif', color: 'var(--text-1)', outline: 'none', width: 112, flexShrink: 0 }}
            value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
          />

          {sel(filterStatus, setFilterStatus, [['','All statuses'],['uncoded','Uncoded'],['in_progress','In Progress'],['coded','Coded'],['reviewed','Reviewed']])}
          {sel(filterGeocode, setFilterGeocode, [['','Geocode: any'],['yes','Geocoded'],['no','Not geocoded']])}
          <button onClick={() => setShowAdvancedFilters(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6, border: `1px solid ${showAdvancedFilters || advancedFilterCount > 0 ? 'var(--accent)' : 'var(--border)'}`, background: showAdvancedFilters || advancedFilterCount > 0 ? 'var(--accent-pale)' : 'var(--surface)', fontSize: 12, color: advancedFilterCount > 0 ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', flexShrink: 0, whiteSpace: 'nowrap' }}>
            <SlidersHorizontal size={12} />
            {advancedFilterCount > 0 ? `Filters (${advancedFilterCount})` : 'Filters'}
          </button>

          {anyFilterActive && (
            <button onClick={clearAllFilters} title="Clear all filters"
              style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', flexShrink: 0 }}>
              <X size={10} /> Clear
            </button>
          )}

          <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0, marginLeft: 2 }} />

          <button className="btn-ghost" onClick={() => setShowChooser(true)} title="Configure columns"
            style={{ fontSize: 12, flexShrink: 0, color: showChooser ? 'var(--blue)' : undefined }}>
            <Settings size={12} style={{ color: 'var(--blue)' }} /> Columns
          </button>
          <button className="btn-ghost" onClick={() => api.exportCsv()} style={{ fontSize: 12, flexShrink: 0 }}>
            <Download size={12} /> CSV
          </button>
          <button className="btn-ghost" onClick={() => api.exportGeoJson()} style={{ fontSize: 12, flexShrink: 0 }}>
            <Download size={12} /> GeoJSON
          </button>
          <button className="btn-ghost" onClick={handleBatchAnalyze} disabled={batchAnalyzing} style={{ fontSize: 12, flexShrink: 0 }}>
            <Sparkles size={12} style={{ color: 'var(--amber)' }} />
            {batchAnalyzing ? 'Processing…' : 'NLP All'}
          </button>
          {reports.length > 0 && <>
            <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />
            <button className="btn-ghost" onClick={handleDeleteAll}
              style={{ fontSize: 12, flexShrink: 0, color: 'var(--critical-red, #A51F1F)' }}
              title="Delete all currently visible reports">
              <Trash2 size={12} /> Del All
            </button>
          </>}
        </div>

        {/* Advanced filters (collapsible) */}
        {showAdvancedFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px 7px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {sel(filterCoercion,      setFilterCoercion,      [['','Coercion: any'],['yes','Coercion: yes'],['no','Coercion: no']])}
            {sel(filterMovement,      setFilterMovement,      [['','Movement: any'],['yes','Movement: yes'],['no','Movement: no']])}
            {sel(filterPhysical,      setFilterPhysical,      [['','Physical: any'],['yes','Physical: yes'],['no','Physical: no']])}
            {sel(filterVehicle,       setFilterVehicle,       [['','Vehicle: any'],['yes','Vehicle: yes'],['no','Vehicle: no']])}
            {sel(filterSexualAssault, setFilterSexualAssault, [['','Sexual assault: any'],['yes','SA: yes'],['no','SA: no']])}
            {sel(filterThreats,       setFilterThreats,       [['','Threats: any'],['yes','Threats: yes'],['no','Threats: no']])}
            {sel(filterHarm, setFilterHarm, [
              ['','Harm type: any'],
              ['Physical violence','Physical violence'],
              ['Sexual violence','Sexual violence'],
              ['Robbery / theft','Robbery / theft'],
              ['Coercion / intimidation','Coercion / intimidation'],
              ['Non-payment / payment dispute','Non-payment'],
              ['Suspicious / concerning behaviour','Suspicious'],
              ['Substance-facilitated harm','Substance harm'],
              ['Movement / relocation concern','Movement concern'],
              ['Multiple harms','Multiple harms'],
              ['Other','Other'],
              ['Unknown / unclear','Unknown'],
            ])}
            {sel(filterLinkage, setFilterLinkage, [['','Linkage: any'],['yes','Has linkage flag'],['no','No linkage flag']])}
          </div>
        )}

        {/* Summary strip */}
        {!loading && reports.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '3px 14px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)', background: 'var(--bg)', flexWrap: 'wrap' }}>
            {[
              { val: stats.total,      label: 'total',    color: 'var(--text-2)' },
              { val: stats.coded,      label: 'coded',    color: 'var(--green)' },
              { val: stats.uncoded,    label: 'uncoded',  color: 'var(--text-3)' },
              ...(stats.inProgress > 0 ? [{ val: stats.inProgress, label: 'in progress', color: 'var(--amber)' }] : []),
              { val: stats.geocoded,   label: 'geocoded', color: 'var(--blue)' },
              ...(stats.linkage > 0    ? [{ val: stats.linkage,    label: 'linkage flags', color: 'var(--accent)' }] : []),
            ].map((s, i) => (
              <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, paddingRight: 10, borderRight: i < 3 || s.label === 'geocoded' ? '1px solid var(--border)' : 'none', paddingLeft: i > 0 ? 10 : 0 }}>
                <strong style={{ color: s.color, fontWeight: 600 }}>{s.val}</strong> {s.label}
              </span>
            ))}
            {filteredReports.length !== reports.length && (
              <span style={{ marginLeft: 10, color: 'var(--accent)', fontStyle: 'italic' }}>
                {filteredReports.length} matching current filters
              </span>
            )}
          </div>
        )}

      </div>

      {/* Bulk selection bar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 20px', background: 'var(--blue-pale)', borderBottom: '1px solid var(--blue-border)', flexShrink: 0, flexWrap: 'wrap' }}>
          <CheckSquare size={14} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--blue)' }}>{selected.size} selected</span>

          <button onClick={handleExportSelected}
            style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--blue-border)', background: 'var(--blue-pale)', color: 'var(--blue)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            <Download size={12} /> Export CSV
          </button>
          <button onClick={handleBatchAnalyze} disabled={batchAnalyzing}
            style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--amber-border)', background: 'var(--amber-pale)', color: 'var(--amber)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            <Sparkles size={12} /> {batchAnalyzing ? 'Processing…' : 'Run NLP'}
          </button>
          <button onClick={handleDeleteSelected}
            style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--critical-red-border, #F5C6C6)', background: 'var(--critical-red-pale, #FDF2F2)', color: 'var(--critical-red, #A51F1F)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            <Trash2 size={12} /> Delete
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontFamily: 'DM Sans, sans-serif', textDecoration: 'underline' }}>
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
        ) : sortedReports.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 12 }}>
            <FileText size={36} style={{ color: 'var(--border-mid)' }} />
            <p style={{ color: 'var(--text-3)', fontSize: 14, margin: 0 }}>{reports.length === 0 ? 'No reports found.' : 'No reports match the current filters.'}</p>
            {reports.length === 0
              ? <button onClick={() => navigate('/')} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Add your first report →</button>
              : <button onClick={clearAllFilters} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear filters</button>
            }
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1.5px solid var(--border)', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ padding: '9px 10px', width: 32 }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} title="Select / deselect all visible" style={{ cursor: 'pointer', accentColor: 'var(--blue)' }} />
                </th>

                {/* Status badge column */}
                <th style={{ padding: '9px 8px', width: 56, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-3)' }} title="Row flags: coding status · geocoded · linkage">
                  Flags
                </th>

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

                <th style={{ padding: '9px 8px', width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {sortedReports.map((r, i) => {
                const sc    = STATUS_COLORS[r.coding_status] || STATUS_COLORS.uncoded;
                const ctx: ColCtx = { sc };
                const isGeocoded = (r as any).lat_initial != null || (r as any).lat_incident != null;
                const hasLinkage = r_.r(r,'repeat_suspect_flag') === 'yes' || r_.r(r,'repeat_vehicle_flag') === 'yes';
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

                    {/* Row flags */}
                    <td style={{ padding: '6px 8px', width: 56 }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                        {/* Coding status badge */}
                        <span title={`Coding status: ${r.coding_status}`}
                          style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: sc.color, flexShrink: 0 }} />
                        {/* Geocoded pin */}
                        {isGeocoded && (
                          <span title="Geocoded" style={{ display: 'flex' }}>
                            <MapPin size={9} style={{ color: 'var(--blue)', flexShrink: 0 }} />
                          </span>
                        )}
                        {/* Linkage flag */}
                        {hasLinkage && (
                          <span title="Linkage flag: repeat suspect or vehicle" style={{ display: 'flex' }}>
                            <Link2 size={9} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                          </span>
                        )}
                      </div>
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

                    {/* Quick actions */}
                    <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
                        className="row-actions">
                        <button title="Open case"
                          onClick={() => navigate(`/code/${r.report_id}`)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', padding: '3px 5px', borderRadius: 4, display: 'flex', alignItems: 'center' }}>
                          <Eye size={12} />
                        </button>
                        <button title="View on map"
                          onClick={() => navigate(`/map?report=${r.report_id}`)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', padding: '3px 5px', borderRadius: 4, display: 'flex', alignItems: 'center' }}>
                          <MapPin size={12} />
                        </button>
                        <button title="Delete report"
                          onClick={(e) => handleDelete(e, r.report_id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--border-mid)', padding: '3px 5px', borderRadius: 4, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)')}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--border-mid)')}>
                          <Trash2 size={12} />
                        </button>
                      </div>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={15} style={{ color: 'var(--blue)' }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>Choose Columns</span>
              </div>
              <button onClick={() => setShowChooser(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '8px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg)' }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                Drag column headers in the table to reorder. Check/uncheck to show or hide.
              </span>
              <button onClick={resetCols} style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                Reset to defaults
              </button>
            </div>

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

      <style>{`
        .row-actions { opacity: 0; transition: opacity 0.12s; }
        tr:hover .row-actions { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
