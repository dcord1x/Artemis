/**
 * StageSequencer.tsx
 *
 * Analyst-driven stage coding component.
 * Supports structured behavioural sequencing, situational analysis,
 * and movement/location analysis.
 *
 * Two-level card structure:
 *   Core fields  — always visible: stage type, client behaviour, worker response,
 *                  escalation level, location type, movement, turning point summary,
 *                  supporting excerpt.
 *   More details — collapsed by default: situational conditions, location details,
 *                  movement impact, coding notes.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '../api';
import type { ReportStage } from '../types';

// ── Option definitions ────────────────────────────────────────────────────────

const STAGE_TYPES = [
  { value: 'initial_contact',   label: 'Initial Contact',
    def: 'The first moment of interaction between the client and the worker.' },
  { value: 'negotiation',       label: 'Negotiation',
    def: 'Discussion of terms, services, or payment; includes service refusal.' },
  { value: 'pickup_meeting',    label: 'Pickup / Meeting',
    def: 'The client and worker meet in person; may involve entering a vehicle.' },
  { value: 'movement_travel',   label: 'Movement / Travel',
    def: 'Physical relocation from one place to another.' },
  { value: 'arrival_location',  label: 'Arrival at Location',
    def: 'The worker arrives at the location where the encounter takes place.' },
  { value: 'escalation',        label: 'Escalation',
    def: 'Shift toward coercion, threats, control, or violence.' },
  { value: 'violence_coercion', label: 'Violence / Coercion',
    def: 'Physical or sexual violence, or non-physical coercion controlling the worker.' },
  { value: 'exit_escape',       label: 'Exit / Escape',
    def: 'The worker exits, escapes, or the encounter ends.' },
  { value: 'aftermath',         label: 'Aftermath',
    def: 'Events occurring after the main encounter — reporting, care, relocation.' },
  { value: 'other',             label: 'Other',
    def: 'Stage type not captured by the categories above.' },
  { value: 'unknown_unclear',   label: 'Unknown / unclear',
    def: 'The stage type cannot be determined from the report.' },
];

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  initial_contact:   { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
  negotiation:       { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
  pickup_meeting:    { bg: '#FEFCE8', border: '#FDE68A', text: '#A16207' },
  movement_travel:   { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
  arrival_location:  { bg: '#F0F9FF', border: '#BAE6FD', text: '#0369A1' },
  escalation:        { bg: '#FFF1F2', border: '#FECDD3', text: '#BE123C' },
  violence_coercion: { bg: '#FFF0F0', border: '#FECACA', text: '#991B1B' },
  exit_escape:       { bg: '#F0FFF4', border: '#A7F3D0', text: '#065F46' },
  aftermath:         { bg: '#FAF5FF', border: '#E9D5FF', text: '#7C3AED' },
  other:             { bg: '#F8FAFC', border: '#CBD5E1', text: '#475569' },
  unknown_unclear:   { bg: '#F9FAFB', border: '#D1D5DB', text: '#6B7280' },
};

const CLIENT_BEHAVIORS = [
  { value: 'pressure_coercion',           label: 'Pressure / coercion',
    def: 'Persistent verbal pushing or non-physical coercion to obtain compliance.' },
  { value: 'deception_misrepresentation', label: 'Deception / misrepresentation',
    def: 'Lies about payment, identity, services, or intent.' },
  { value: 'verbal_aggression',           label: 'Verbal aggression',
    def: 'Shouting, insults, or threatening verbal tone.' },
  { value: 'threats_intimidation',        label: 'Threats / intimidation',
    def: 'Explicit threats of harm, exposure, or consequences to force compliance.' },
  { value: 'payment_dispute',             label: 'Payment dispute / refusal to pay',
    def: 'Refusing to pay, demanding refunds, or altering payment terms mid-encounter.' },
  { value: 'boundary_violation',          label: 'Boundary violation',
    def: 'Attempting or carrying out acts beyond what was agreed.' },
  { value: 'condom_refusal',              label: 'Condom refusal / removal',
    def: 'Refusing to use a condom or removing it without consent.' },
  { value: 'physical_force',              label: 'Physical force',
    def: 'Grabbing, hitting, restraining, or other non-sexual physical violence.' },
  { value: 'sexual_violence',             label: 'Sexual violence',
    def: 'Sexual acts without consent or beyond agreed terms.' },
  { value: 'confinement',                 label: 'Confinement / refusal to let worker leave',
    def: 'Locking doors, blocking exits, or physically preventing the worker from leaving.' },
  { value: 'robbery_theft',               label: 'Robbery / theft',
    def: 'Taking money, phone, ID, or other possessions by force or deception.' },
  { value: 'substance_administration',    label: 'Substance administration / suspected drugging',
    def: 'Administering or suspected administering of substances without consent.' },
  { value: 'weapon_present',              label: 'Weapon present / threatened',
    def: 'A weapon was displayed or its use threatened.' },
  { value: 'abandonment',                 label: 'Abandonment',
    def: 'Worker was left in an unsafe or unfamiliar location.' },
  { value: 'surveillance_stalking',       label: 'Surveillance / stalking',
    def: 'Following, watching, or monitoring the worker before, during, or after the encounter.' },
  { value: 'forced_movement',             label: 'Forced movement / relocation',
    def: 'Moving the worker to a different location without consent or by force.' },
  { value: 'property_interference',       label: 'Property interference',
    def: 'Taking, hiding, damaging, or controlling the worker\'s belongings, phone, or documents.' },
  { value: 'image_video_threat',          label: 'Image / video threat',
    def: 'Threatening to record, share, or use images or video to coerce or humiliate.' },
  { value: 'refusal_to_leave_alone',      label: 'Refusal to leave worker alone',
    def: 'Persisting after the worker ended the encounter — not leaving, following, re-contacting.' },
  { value: 'impersonation',              label: 'Impersonation / false identity',
    def: 'Pretending to be law enforcement, a known person, or using a false name or role.' },
  { value: 'drug_facilitation',           label: 'Drug facilitation / suspected drugging',
    def: 'Offering or administering substances to reduce worker\'s capacity to resist or escape.' },
  { value: 'luring',                      label: 'Luring / false pretence for movement',
    def: 'Using deception about destination, purpose, or safety to get the worker to relocate.' },
  { value: 'blocking_help',              label: 'Blocking help / isolating from support',
    def: 'Taking the worker\'s phone, preventing calls, or cutting off access to support.' },
  { value: 'other',                       label: 'Other',
    def: 'Client behaviour not captured by the categories above.' },
  { value: 'not_stated_unclear',          label: 'Not stated / unclear',
    def: 'Client behaviour is not described or cannot be determined.' },
];

const WORKER_RESPONSES = [
  { value: 'negotiation',           label: 'Negotiation',
    def: 'Attempted to renegotiate terms or reach an agreement.' },
  { value: 'resistance_refusal',    label: 'Resistance / refusal',
    def: 'Active verbal or physical refusal or push-back.' },
  { value: 'de_escalation_attempt', label: 'De-escalation attempt',
    def: 'Tried to calm the situation, reduce tension, or avoid conflict.' },
  { value: 'attempted_exit',        label: 'Attempted exit',
    def: 'Tried to leave the situation before or during the encounter.' },
  { value: 'escape',                label: 'Escape',
    def: 'Successfully left or escaped the situation.' },
  { value: 'help_seeking',          label: 'Help-seeking',
    def: 'Signalled for help, called police, or sought assistance.' },
  { value: 'survival_compliance',   label: 'Survival compliance / appeasement',
    def: 'Complied in order to avoid greater harm — under coercion or fear.' },
  { value: 'unable_to_respond',          label: 'Unable to respond / incapacitated',
    def: 'Was physically incapacitated, unconscious, or otherwise unable to act.' },
  { value: 'verbal_boundary_setting',    label: 'Verbal boundary setting',
    def: 'Clearly stating limits, declining an act, or verbally asserting a boundary.' },
  { value: 'refusal_of_service',         label: 'Refusal of service',
    def: 'Declining to provide a service or to proceed with the encounter.' },
  { value: 'refusal_to_enter_vehicle',   label: 'Refusal to enter vehicle',
    def: 'Declining to get into the client\'s vehicle or refusing to be transported.' },
  { value: 'calling_for_help',           label: 'Calling for help / signalling',
    def: 'Calling out, using a phone, activating a safety app, or otherwise signalling for assistance.' },
  { value: 'defensive_action',           label: 'Defensive action',
    def: 'Physically protecting oneself without full escape — blocking, pushing away, shielding.' },
  { value: 'physical_resistance',        label: 'Physical resistance',
    def: 'Actively fighting back, struggling, or using force to resist harm.' },
  { value: 'fought_back',                label: 'Fought back / defensive physical force',
    def: 'Physically fought back using defensive force — kicking, striking, pushing, or otherwise actively using physical force to resist, escape, or stop the assault. Distinct from general physical resistance; describes deliberate, directed defensive action.' },
  { value: 'freezing',                   label: 'Freezing / dissociation',
    def: 'Unable to act due to fear, shock, or trauma response — not incapacitation.' },
  { value: 'partial_compliance',         label: 'Partial compliance',
    def: 'Complying with some demands but refusing or resisting others — not full survival compliance.' },
  { value: 'escape_after_opportunity',   label: 'Escape after finding opportunity',
    def: 'Left the situation when an opportunity arose — a door unlocked, client distracted, etc.' },
  { value: 'reporting_after_event',      label: 'Reporting after the event',
    def: 'Disclosing to a service provider, police, or support worker after the encounter ended.' },
  { value: 'other',                      label: 'Other',
    def: 'Worker response not captured by the categories above.' },
  { value: 'not_stated_unclear',         label: 'Not stated / unclear',
    def: 'Worker response is not described or cannot be determined.' },
];

const ESCALATION_LEVEL_OPTS = [
  { value: 'no_escalation',    label: 'No escalation evident',
    def: 'No sign of escalating risk or threat at this stage.' },
  { value: 'tension_concern',  label: 'Tension / concern',
    def: 'Noticeable tension or concern but no explicit threat or coercion.' },
  { value: 'coercion_control', label: 'Coercion / control',
    def: 'Non-violent but controlling behaviour — manipulation, blocking exit, etc.' },
  { value: 'threats',          label: 'Threats / intimidation',
    def: 'Explicit verbal threats of harm, exposure, or consequences.' },
  { value: 'physical_violence',label: 'Physical violence',
    def: 'Physical assault, restraint, or force.' },
  { value: 'sexual_violence',  label: 'Sexual violence',
    def: 'Sexual violence or non-consensual sexual acts.' },
  { value: 'robbery_theft',    label: 'Robbery / theft',
    def: 'Taking money, possessions, or documents by force, coercion, or deception.' },
  { value: 'post_incident',    label: 'Post-incident / aftermath',
    def: 'This stage follows the main incident — aftermath or recovery.' },
  { value: 'unknown',          label: 'Unknown / not stated',
    def: 'Escalation level cannot be determined from the report.' },
];

const LOCATION_TYPE_OPTS = [
  { value: 'street_outdoor',  label: 'Street / public outdoor area',
    def: 'Street, sidewalk, or other open public outdoor space.' },
  { value: 'vehicle',         label: 'Vehicle',
    def: 'Inside a car, truck, van, or other vehicle.' },
  { value: 'hotel_motel',     label: 'Hotel / motel',
    def: 'A commercial short-stay accommodation.' },
  { value: 'residence',       label: 'Residence',
    def: 'A private home, apartment, or dwelling.' },
  { value: 'business',        label: 'Business / commercial location',
    def: 'A shop, bar, office, or other commercial space.' },
  { value: 'parking_lot',     label: 'Parking lot',
    def: 'An open or enclosed parking area.' },
  { value: 'industrial',      label: 'Industrial area',
    def: 'Industrial yard, warehouse, or similar.' },
  { value: 'park_secluded',   label: 'Park / secluded outdoor area',
    def: 'A park, trail, or secluded outdoor location.' },
  { value: 'support_service', label: 'Support service / agency',
    def: 'A shelter, drop-in, health clinic, or similar service location.' },
  { value: 'unknown',         label: 'Unknown / not stated',
    def: 'Location type cannot be determined from the report.' },
  { value: 'other',           label: 'Other',
    def: 'Location type not captured by the categories above.' },
];

const MOVEMENT_TYPE_OPTS = [
  { value: 'no_movement',        label: 'No movement',
    def: 'No movement occurred to reach this stage.' },
  { value: 'worker_independent', label: 'Worker travelled independently',
    def: 'Worker arrived under their own power, without the client.' },
  { value: 'client_picked_up',   label: 'Client picked up worker',
    def: 'Client collected or picked up the worker.' },
  { value: 'client_drove',       label: 'Client drove worker',
    def: 'Client transported the worker in a vehicle.' },
  { value: 'movement_agreed',    label: 'Movement agreed',
    def: 'Both parties agreed to move to this location.' },
  { value: 'movement_coercive',  label: 'Movement became coercive',
    def: 'Movement was initially agreed but became coercive.' },
  { value: 'taken_unexpected',   label: 'Worker was taken somewhere unexpected',
    def: 'Worker was transported to a location different from what was agreed.' },
  { value: 'woke_up_elsewhere',  label: 'Worker woke up elsewhere / does not know how they arrived',
    def: 'Worker does not know how they arrived at this location.' },
  { value: 'public_to_private',  label: 'Public to private location',
    def: 'Moved from a public outdoor or visible space to a private indoor location.' },
  { value: 'public_to_secluded', label: 'Public to secluded outdoor area',
    def: 'Moved from a public space to a less visible or secluded outdoor location.' },
  { value: 'cross_neighbourhood', label: 'Cross-neighbourhood movement',
    def: 'Moved between distinct neighbourhoods within the same city or municipality.' },
  { value: 'cross_municipality', label: 'Cross-municipality movement',
    def: 'Moved across a municipal or jurisdictional boundary.' },
  { value: 'unknown',            label: 'Unknown / not stated',
    def: 'Whether or how movement occurred cannot be determined.' },
  { value: 'other',              label: 'Other',
    def: 'Movement type not captured by the categories above.' },
];

// ── More Details constants ────────────────────────────────────────────────────

const VISIBILITY_OPTS = [
  { value: 'public',       label: 'High / publicly visible',
    def: 'Clearly visible to passersby — street, open outdoor area.' },
  { value: 'semi_public',  label: 'Moderate / some visibility',
    def: 'Some visibility but reduced foot traffic or partial concealment.' },
  { value: 'semi_private', label: 'Low / hidden from view',
    def: 'Interior or concealed location with no meaningful visibility.' },
  { value: 'unknown',      label: 'Unknown / not stated',
    def: 'Visibility cannot be determined from the report.' },
];

const GUARDIANSHIP_OPTS = [
  { value: 'present', label: 'Present',
    def: 'Capable guardians (other people, security, police) were nearby and able to intervene.' },
  { value: 'reduced', label: 'Limited',
    def: 'Guardians present but unlikely to notice or intervene (distant, distracted).' },
  { value: 'absent',  label: 'Absent',
    def: 'No capable guardians were present.' },
  { value: 'unknown', label: 'Unknown / not stated',
    def: 'Guardianship cannot be determined.' },
];

const ISOLATION_OPTS = [
  { value: 'not_isolated',       label: 'Low',
    def: 'Worker had access to support, witnesses, or escape routes.' },
  { value: 'partially_isolated', label: 'Moderate',
    def: 'Some isolation — limited exit options or reduced social support.' },
  { value: 'isolated',           label: 'High',
    def: 'Worker was separated from support networks, witnesses, and exit options.' },
  { value: 'unknown',            label: 'Unknown / not stated',
    def: 'Isolation level cannot be determined.' },
];

const CONTROL_OPTS = [
  { value: 'victim',   label: 'Low / client had limited control',
    def: 'Worker controlled the space, transport, or movement at this stage.' },
  { value: 'shared',   label: 'Moderate / control increasing',
    def: 'Control was shared or shifting toward the client.' },
  { value: 'offender', label: 'High / client controlled movement, exit, money, or safety',
    def: 'Client controlled the space, transport, or movement.' },
  { value: 'unclear',  label: 'Unknown / not stated',
    def: 'Cannot determine who controlled the situation.' },
];

const SPATIAL_PRECISION_OPTS = [
  { value: 'exact_address', label: 'Exact address',
    def: 'Full street address is given.' },
  { value: 'intersection',  label: 'Intersection / block',
    def: 'Cross-street or block-level description.' },
  { value: 'landmark',      label: 'Landmark / business',
    def: 'Named location, business, or landmark.' },
  { value: 'neighbourhood', label: 'Neighbourhood',
    def: 'Neighbourhood or district name only.' },
  { value: 'approximate',   label: 'Approximate / general area',
    def: 'General area or vague location description.' },
  { value: 'unknown',       label: 'Unknown / not stated',
    def: 'Spatial precision cannot be determined.' },
];

const MOVEMENT_IMPACT_OPTS = [
  { value: 'no_change',             label: 'No meaningful change',
    def: 'Movement did not alter risk or control.' },
  { value: 'reduced_visibility',    label: 'Reduced visibility',
    def: 'Movement made the encounter less visible.' },
  { value: 'increased_isolation',   label: 'Increased isolation',
    def: 'Movement increased the worker\'s isolation.' },
  { value: 'reduced_ability_leave', label: 'Reduced ability to leave',
    def: 'Movement made it harder for the worker to exit.' },
  { value: 'increased_control',     label: 'Increased client control',
    def: 'Movement increased the client\'s control over the worker.' },
  { value: 'changed_location',      label: 'Changed agreed location',
    def: 'Worker was taken somewhere other than agreed.' },
  { value: 'unknown',               label: 'Unknown / not stated',
    def: 'Impact of movement cannot be determined.' },
  { value: 'other',                 label: 'Other',
    def: 'Impact not captured by the categories above.' },
];

const ABLE_TO_LEAVE_OPTS = [
  { value: 'yes',             label: 'Yes',
    def: 'Worker could leave freely.' },
  { value: 'limited_unclear', label: 'Limited / unclear',
    def: 'Ability to leave was constrained or ambiguous.' },
  { value: 'no',              label: 'No',
    def: 'Worker could not leave.' },
  { value: 'unknown',         label: 'Unknown / not stated',
    def: 'Cannot be determined.' },
];

const CODING_CONFIDENCE_OPTS = [
  { value: 'high',            label: 'High: clearly stated in report',
    def: 'The coding is directly supported by explicit text.' },
  { value: 'moderate',        label: 'Moderate: reasonably inferred',
    def: 'The coding is a reasonable inference from context.' },
  { value: 'low',             label: 'Low: unclear or partial support',
    def: 'The coding is uncertain; evidence is weak or ambiguous.' },
  { value: 'not_enough_info', label: 'Not enough information',
    def: 'Insufficient information to code confidently.' },
];

// ── Tooltip helper ────────────────────────────────────────────────────────────

function DefTooltip({ def }: { def: string }) {
  return (
    <span
      title={def}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%',
        border: '1px solid var(--border)', background: 'var(--surface-2)',
        color: 'var(--text-3)', fontSize: 9.5, fontWeight: 700,
        cursor: 'help', flexShrink: 0, marginLeft: 4,
      }}
    >?</span>
  );
}

// ── Field label ───────────────────────────────────────────────────────────────

function FieldLabel({ label, def }: { label: string; def?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
        letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      {def && <DefTooltip def={def} />}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────

function StageSelect({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; def: string }[];
  placeholder?: string;
}) {
  const isLegacy = value && !options.find((o) => o.value === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', padding: '5px 8px', fontSize: 12.5,
        border: '1px solid var(--border)', borderRadius: 4,
        background: 'var(--bg)', color: value ? 'var(--text-1)' : 'var(--text-3)',
        cursor: 'pointer',
      }}
    >
      <option value="">{placeholder ?? '— select —'}</option>
      {isLegacy && (
        <option value={value}>(legacy: {value})</option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Checkbox group ────────────────────────────────────────────────────────────

function CheckboxGroup({
  options, value, onChange, columns = 1,
}: {
  options: { value: string; label: string; def: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  columns?: number;
}) {
  const toggle = (code: string) => {
    if (value.includes(code)) {
      onChange(value.filter((c) => c !== code));
    } else {
      onChange([...value, code]);
    }
  };
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: '3px 10px',
    }}>
      {options.map((o) => (
        <label
          key={o.value}
          title={o.def}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 5,
            fontSize: 12, color: 'var(--text-2)', cursor: 'pointer',
            padding: '2px 0', lineHeight: 1.3,
          }}
        >
          <input
            type="checkbox"
            checked={value.includes(o.value)}
            onChange={() => toggle(o.value)}
            style={{ cursor: 'pointer', accentColor: 'var(--accent)', marginTop: 2, flexShrink: 0 }}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

// ── Single stage card ─────────────────────────────────────────────────────────

const ICON_BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 4, border: 'none', background: 'transparent',
  color: 'var(--text-3)', cursor: 'pointer', borderRadius: 3,
  flexShrink: 0,
};

function StageCard({
  stage, index, total,
  onUpdate, onDelete, onMoveUp, onMoveDown,
}: {
  stage: ReportStage;
  index: number;
  total: number;
  onUpdate: (id: number, patch: Partial<ReportStage>) => void;
  onDelete: (id: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  const [expanded,     setExpanded]     = useState(true);
  const [moreExpanded, setMoreExpanded] = useState(false);

  const colors   = STAGE_COLORS[stage.stage_type] ?? { bg: 'var(--surface-2)', border: 'var(--border)', text: 'var(--text-2)' };
  const typeLabel = STAGE_TYPES.find((t) => t.value === stage.stage_type)?.label ?? stage.stage_type;
  const typeDef   = STAGE_TYPES.find((t) => t.value === stage.stage_type)?.def ?? '';

  const set = (patch: Partial<ReportStage>) => onUpdate(stage.id, patch);

  // Completion: 8 core fields
  const filled = [
    stage.stage_type,
    (stage.client_behaviors ?? []).length > 0 ? 'x' : '',
    (stage.victim_responses  ?? []).length > 0 ? 'x' : '',
    stage.escalation_level,
    stage.location_type,
    stage.movement_type_to_here,
    stage.turning_point_notes,
    stage.supporting_excerpt,
  ].filter(Boolean).length;
  const coreTotal = 8;

  // Dot indicator for More Details content
  const hasMoreDetails = !!(
    stage.visibility || stage.guardianship || stage.isolation_level ||
    stage.control_type || stage.location_label || stage.spatial_precision ||
    stage.movement_impact || stage.able_to_leave ||
    stage.coder_notes_stage || stage.coding_confidence || stage.temporal_sequence_note ||
    stage.stage_visible || stage.stage_certainty
  );

  return (
    <div style={{
      border: `1px solid ${colors.border}`,
      borderRadius: 6, background: 'var(--bg)',
      marginBottom: 8,
    }}>
      {/* Card header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: colors.bg,
        borderRadius: expanded ? '6px 6px 0 0' : 6,
        cursor: 'pointer',
      }}
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Order badge */}
        <span style={{
          flexShrink: 0, width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%', background: colors.border, color: colors.text,
          fontSize: 11, fontWeight: 700,
        }}>
          {index + 1}
        </span>

        {/* Stage type badge */}
        <span title={typeDef} style={{
          fontSize: 12, fontWeight: 600, color: colors.text,
          background: colors.bg, border: `1px solid ${colors.border}`,
          padding: '2px 8px', borderRadius: 4, cursor: 'help',
        }}>
          {typeLabel || <span style={{ fontStyle: 'italic', opacity: 0.6 }}>— no type —</span>}
        </span>

        {/* Completion indicator */}
        <span style={{
          fontSize: 10.5,
          color: filled === coreTotal ? 'var(--green)' : 'var(--text-3)',
          marginLeft: 2,
        }}>
          Stage completion: {filled}/{coreTotal}
        </span>

        {/* More details dot */}
        {hasMoreDetails && (
          <span title="Additional details coded" style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--accent)', display: 'inline-block', flexShrink: 0,
          }} />
        )}

        <div style={{ flex: 1 }} />

        {/* Reorder buttons */}
        <button
          title="Move up"
          onClick={(e) => { e.stopPropagation(); onMoveUp(index); }}
          disabled={index === 0}
          style={{ ...ICON_BTN, opacity: index === 0 ? 0.3 : 1 }}
        >
          <ArrowUp size={13} />
        </button>
        <button
          title="Move down"
          onClick={(e) => { e.stopPropagation(); onMoveDown(index); }}
          disabled={index === total - 1}
          style={{ ...ICON_BTN, opacity: index === total - 1 ? 0.3 : 1 }}
        >
          <ArrowDown size={13} />
        </button>

        {/* Delete */}
        <button
          title="Delete stage"
          onClick={(e) => { e.stopPropagation(); onDelete(stage.id); }}
          style={{ ...ICON_BTN, color: 'var(--red, #DC2626)' }}
        >
          <Trash2 size={13} />
        </button>

        {/* Expand toggle */}
        <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {/* ── Expanded body ──────────────────────────────────────────────────── */}
      {expanded && (
        <div style={{ padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Stage type */}
          <div>
            <FieldLabel label="Stage Type" def="Select the type of event that characterises this stage." />
            <StageSelect
              value={stage.stage_type}
              onChange={(v) => set({ stage_type: v })}
              options={STAGE_TYPES}
            />
          </div>

          {/* ── Behaviours ─────────────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px',
            }}>
              <div>
                <FieldLabel
                  label="Client Behaviour"
                  def="What did the client do at this stage? Select all that apply."
                />
                <CheckboxGroup
                  options={CLIENT_BEHAVIORS}
                  value={stage.client_behaviors ?? []}
                  onChange={(v) => set({ client_behaviors: v })}
                  columns={2}
                />
              </div>
              <div>
                <FieldLabel
                  label="Worker Response"
                  def="How did the worker respond at this stage? Select all that apply."
                />
                <CheckboxGroup
                  options={WORKER_RESPONSES}
                  value={stage.victim_responses ?? []}
                  onChange={(v) => set({ victim_responses: v })}
                  columns={2}
                />
              </div>
            </div>
          </div>

          {/* ── Escalation level ───────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <FieldLabel
              label="Escalation Level"
              def="What was the level of risk or escalation at this stage?"
            />
            <StageSelect
              value={stage.escalation_level ?? ''}
              onChange={(v) => set({ escalation_level: v })}
              options={ESCALATION_LEVEL_OPTS}
            />
          </div>

          {/* ── Location type + movement ────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
              <div>
                <FieldLabel
                  label="Location Type"
                  def="What type of location did this stage occur at?"
                />
                <StageSelect
                  value={stage.location_type}
                  onChange={(v) => set({ location_type: v })}
                  options={LOCATION_TYPE_OPTS}
                />
              </div>
              <div>
                <FieldLabel
                  label="Movement to This Stage"
                  def="How did the worker arrive at this stage's location?"
                />
                <StageSelect
                  value={stage.movement_type_to_here}
                  onChange={(v) => set({ movement_type_to_here: v })}
                  options={MOVEMENT_TYPE_OPTS}
                />
              </div>
            </div>
          </div>

          {/* ── Turning point + excerpt ─────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <FieldLabel
                label="Turning Point / Stage Summary"
                def="Briefly note what changed during this stage or why this stage matters analytically."
              />
              <textarea
                value={stage.turning_point_notes ?? ''}
                onChange={(e) => set({ turning_point_notes: e.target.value })}
                placeholder="Briefly describe what changed during this stage or why this stage matters."
                rows={2}
                style={{
                  width: '100%', padding: '6px 8px', fontSize: 12.5,
                  border: '1px solid var(--border)', borderRadius: 4,
                  background: 'var(--bg)', color: 'var(--text-1)',
                  resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <FieldLabel
                label="Supporting Excerpt"
                def="Paste the exact phrase or short passage from the report that supports this stage coding."
              />
              <textarea
                value={stage.supporting_excerpt ?? ''}
                onChange={(e) => set({ supporting_excerpt: e.target.value })}
                placeholder="Paste the exact phrase or short passage from the report that supports this stage coding."
                rows={2}
                style={{
                  width: '100%', padding: '6px 8px', fontSize: 12.5,
                  border: '1px solid var(--border)', borderRadius: 4,
                  background: 'var(--bg)', color: 'var(--text-1)',
                  resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* ── More details toggle ─────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <button
              onClick={() => setMoreExpanded((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 8px', border: '1px solid var(--border)',
                borderRadius: 4, background: moreExpanded ? 'var(--surface-2)' : 'var(--bg)',
                color: 'var(--text-3)', fontSize: 11.5, fontWeight: 600,
                cursor: 'pointer', letterSpacing: '0.02em',
              }}
            >
              {moreExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Stage details
              {hasMoreDetails && !moreExpanded && (
                <span title="Additional details coded" style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--accent)', display: 'inline-block', marginLeft: 2,
                }} />
              )}
            </button>
          </div>

          {/* ── More details section ────────────────────────────────────────── */}
          {moreExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Situational Conditions */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)',
                  letterSpacing: '0.03em', marginBottom: 8, textTransform: 'uppercase' }}>
                  Situational Conditions
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
                  <div>
                    <FieldLabel label="Visibility" def="How visible was this interaction to bystanders?" />
                    <StageSelect
                      value={stage.visibility}
                      onChange={(v) => set({ visibility: v })}
                      options={VISIBILITY_OPTS}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Guardianship" def="Were capable guardians present or able to intervene?" />
                    <StageSelect
                      value={stage.guardianship}
                      onChange={(v) => set({ guardianship: v })}
                      options={GUARDIANSHIP_OPTS}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Isolation" def="Was the worker separated from support networks and exit routes?" />
                    <StageSelect
                      value={stage.isolation_level}
                      onChange={(v) => set({ isolation_level: v })}
                      options={ISOLATION_OPTS}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Control" def="Who controlled the space, transport, and movement at this stage?" />
                    <StageSelect
                      value={stage.control_type}
                      onChange={(v) => set({ control_type: v })}
                      options={CONTROL_OPTS}
                    />
                  </div>
                </div>
              </div>

              {/* Location Details */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)',
                  letterSpacing: '0.03em', marginBottom: 8, textTransform: 'uppercase' }}>
                  Location Details
                </div>
                <div style={{ marginBottom: 10 }}>
                  <FieldLabel
                    label="Location Description"
                    def="Brief descriptive label for this location."
                  />
                  <input
                    type="text"
                    value={stage.location_label ?? ''}
                    onChange={(e) => set({ location_label: e.target.value })}
                    placeholder="e.g. street corner, parked car, hotel room, residence, industrial area."
                    style={{
                      width: '100%', padding: '5px 8px', fontSize: 12.5,
                      border: '1px solid var(--border)', borderRadius: 4,
                      background: 'var(--bg)', color: 'var(--text-1)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <FieldLabel label="Spatial Precision" def="How precisely is the location identified in the report?" />
                  <StageSelect
                    value={stage.spatial_precision ?? ''}
                    onChange={(v) => set({ spatial_precision: v })}
                    options={SPATIAL_PRECISION_OPTS}
                  />
                </div>
              </div>

              {/* Movement Impact */}
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
                  <div>
                    <FieldLabel
                      label="Movement Impact"
                      def="Did movement to this stage change the worker's safety, visibility, or autonomy?"
                    />
                    <StageSelect
                      value={stage.movement_impact ?? ''}
                      onChange={(v) => set({ movement_impact: v })}
                      options={MOVEMENT_IMPACT_OPTS}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Able to Leave" def="Was the worker able to leave this location freely?" />
                    <StageSelect
                      value={stage.able_to_leave ?? ''}
                      onChange={(v) => set({ able_to_leave: v })}
                      options={ABLE_TO_LEAVE_OPTS}
                    />
                  </div>
                </div>
              </div>

              {/* Coding Notes */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)',
                  letterSpacing: '0.03em', marginBottom: 8, textTransform: 'uppercase' }}>
                  Coding Notes
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <FieldLabel
                      label="Coder Notes"
                      def="Note any uncertainty, interpretation issue, or coding decision for this stage."
                    />
                    <textarea
                      value={stage.coder_notes_stage ?? ''}
                      onChange={(e) => set({ coder_notes_stage: e.target.value })}
                      placeholder="Note any uncertainty, interpretation issue, or coding decision."
                      rows={2}
                      style={{
                        width: '100%', padding: '6px 8px', fontSize: 12.5,
                        border: '1px solid var(--border)', borderRadius: 4,
                        background: 'var(--bg)', color: 'var(--text-1)',
                        resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel
                      label="Coding Confidence"
                      def="How confident are you in the coding for this stage?"
                    />
                    <StageSelect
                      value={stage.coding_confidence ?? ''}
                      onChange={(v) => set({ coding_confidence: v })}
                      options={CODING_CONFIDENCE_OPTS}
                    />
                  </div>
                  <div>
                    <FieldLabel
                      label="Temporal / Sequence Note"
                      def="Note whether this stage occurred before movement, after pickup, during travel, after arrival, after violence, or whether the order is unclear."
                    />
                    <textarea
                      value={stage.temporal_sequence_note ?? ''}
                      onChange={(e) => set({ temporal_sequence_note: e.target.value })}
                      placeholder="Note whether this stage occurred before movement, after pickup, during travel, after arrival, after violence, or whether the order is unclear."
                      rows={2}
                      style={{
                        width: '100%', padding: '6px 8px', fontSize: 12.5,
                        border: '1px solid var(--border)', borderRadius: 4,
                        background: 'var(--bg)', color: 'var(--text-1)',
                        resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel
                      label="Stage Visible in Report"
                      def="Is this stage visible in the narrative? Code only where supported by the report."
                    />
                    <StageSelect
                      value={stage.stage_visible ?? ''}
                      onChange={(v) => set({ stage_visible: v })}
                      options={[
                        { value: 'present',        label: 'Present — supported by narrative',  def: 'The stage is explicitly or clearly described in the report.' },
                        { value: 'absent',         label: 'Absent — not described',            def: 'The stage is not described or referred to in the report.' },
                        { value: 'unclear',        label: 'Unclear — insufficient detail',     def: 'The report refers to this stage but without enough detail to code it.' },
                        { value: 'not_applicable', label: 'Not applicable',                    def: 'This stage does not apply to this type of encounter.' },
                      ]}
                    />
                  </div>
                  <div>
                    <FieldLabel
                      label="Stage Certainty"
                      def="How confident are you that this stage is correctly identified and sequenced?"
                    />
                    <StageSelect
                      value={stage.stage_certainty ?? ''}
                      onChange={(v) => set({ stage_certainty: v })}
                      options={[
                        { value: 'clear',                  label: 'Clear — explicitly stated',          def: 'The stage is stated directly and unambiguously in the report.' },
                        { value: 'partial',                label: 'Partial — mostly supported',         def: 'Most elements of the stage are supported but some detail is missing.' },
                        { value: 'inferred',               label: 'Inferred — implied but not stated',  def: 'The stage is implied by context but not directly described.' },
                        { value: 'unclear',                label: 'Unclear — significant ambiguity',    def: 'The stage cannot be confidently identified due to ambiguous or conflicting information.' },
                        { value: 'not_enough_information', label: 'Not enough information',             def: 'The report does not contain enough information to assess this stage.' },
                      ]}
                    />
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>
      )}
    </div>
  );
}


// ── Main StageSequencer ───────────────────────────────────────────────────────

export default function StageSequencer({ reportId }: { reportId: string }) {
  const [stages, setStages] = useState<ReportStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const debounceRefs = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Load stages on mount
  useEffect(() => {
    api.getStages(reportId)
      .then((data) => setStages(data.sort((a, b) => a.stage_order - b.stage_order)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reportId]);

  // ── Add stage ───────────────────────────────────────────────────────────────
  const addStage = async (type: string) => {
    const nextOrder = stages.length > 0 ? Math.max(...stages.map((s) => s.stage_order)) + 1 : 1;
    const created = await api.createStage(reportId, {
      stage_type: type,
      stage_order: nextOrder,
      client_behaviors: [],
      victim_responses: [],
      escalation_level: '',
      supporting_excerpt: '',
    });
    setStages((prev) => [...prev, created]);
    setShowTypeMenu(false);
  };

  // ── Delete stage ─────────────────────────────────────────────────────────────
  const deleteStage = async (id: number) => {
    await api.deleteStage(reportId, id);
    setStages((prev) => prev.filter((s) => s.id !== id));
  };

  // ── Reorder ──────────────────────────────────────────────────────────────────
  const reorder = useCallback(async (newStages: ReportStage[]) => {
    const reindexed = newStages.map((s, i) => ({ ...s, stage_order: i + 1 }));
    setStages(reindexed);
    await api.reorderStages(reportId, reindexed.map((s) => ({ id: s.id, stage_order: s.stage_order })));
  }, [reportId]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...stages];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    reorder(next);
  };

  const moveDown = (index: number) => {
    if (index === stages.length - 1) return;
    const next = [...stages];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    reorder(next);
  };

  // ── Debounced update ─────────────────────────────────────────────────────────
  const handleUpdate = (id: number, patch: Partial<ReportStage>) => {
    // Optimistic local update
    setStages((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));

    // Debounce API call (800ms)
    if (debounceRefs.current[id]) clearTimeout(debounceRefs.current[id]);
    debounceRefs.current[id] = setTimeout(() => {
      api.updateStage(reportId, id, patch).catch(() => {});
    }, 800);
  };

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13, fontStyle: 'italic' }}>
        Loading stages…
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            Stage Sequence
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            Break this report into ordered stages. Code behaviour, response, escalation, and location at each stage.
          </div>
        </div>

        {/* Add stage button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowTypeMenu((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 5,
              border: '1px solid var(--accent-border, var(--accent))',
              background: 'var(--accent-pale, #EFF6FF)',
              color: 'var(--accent)', fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={13} />
            Add Stage
          </button>

          {showTypeMenu && (
            <div style={{
              position: 'absolute', top: '110%', right: 0, zIndex: 50,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              minWidth: 220, padding: '4px 0',
            }}>
              {STAGE_TYPES.map((t) => {
                const colors = STAGE_COLORS[t.value];
                return (
                  <button
                    key={t.value}
                    onClick={() => addStage(t.value)}
                    title={t.def}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '8px 14px',
                      border: 'none', background: 'transparent',
                      fontSize: 12.5, color: 'var(--text-1)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: colors?.text ?? 'var(--text-3)', flexShrink: 0,
                    }} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Validation warning */}
      {stages.length === 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px', borderRadius: 6,
          border: '1px solid #FDE68A', background: '#FFFBEB',
          color: '#92400E', fontSize: 12.5, marginBottom: 14,
        }}>
          <span style={{ flexShrink: 0, fontSize: 16 }}>⚠</span>
          <div>
            <strong>No stages defined.</strong> Reports should be broken into ordered stages before
            marking as coded. Add at least: <em>Initial Contact → Negotiation → Escalation → Exit / Escape</em>.
          </div>
        </div>
      )}

      {/* Stage cards */}
      {stages.map((stage, index) => (
        <StageCard
          key={stage.id}
          stage={stage}
          index={index}
          total={stages.length}
          onUpdate={handleUpdate}
          onDelete={deleteStage}
          onMoveUp={moveUp}
          onMoveDown={moveDown}
        />
      ))}

      {/* Sequence summary strip */}
      {stages.length > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          padding: '10px 14px', borderRadius: 6,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          marginTop: 4,
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)',
            letterSpacing: '0.04em', textTransform: 'uppercase', marginRight: 4 }}>
            Sequence:
          </span>
          {stages.map((s, i) => {
            const colors = STAGE_COLORS[s.stage_type];
            const label = STAGE_TYPES.find((t) => t.value === s.stage_type)?.label ?? s.stage_type;
            return (
              <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  fontSize: 11.5, padding: '2px 8px', borderRadius: 4,
                  background: colors?.bg ?? 'var(--surface-2)',
                  border: `1px solid ${colors?.border ?? 'var(--border)'}`,
                  color: colors?.text ?? 'var(--text-2)',
                  fontWeight: 500,
                }}>
                  {label || '?'}
                </span>
                {i < stages.length - 1 && (
                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>→</span>
                )}
              </span>
            );
          })}
        </div>
      )}

    </div>
  );
}
