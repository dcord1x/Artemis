import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, ChevronDown, ChevronRight,
  CheckCircle, XCircle, HelpCircle, FileQuestion,
  AlertTriangle, Eye, EyeOff,
} from 'lucide-react';
import { api } from '../api';
import type { CompareResult, Report, SimilarityResult } from '../types';

// ── Color tokens ──────────────────────────────────────────────────────────────
const C = {
  navy:        '#0B1F33',
  navy2:       '#12324D',
  navyPale:    '#EAF3FA',
  navyBorder:  '#7FAFD0',
  teal:        '#0F766E',
  tealPale:    '#F0FDFA',
  tealBorder:  '#5EEAD4',
  amber:       '#92400E',
  amberPale:   '#FFFBEB',
  amberBorder: '#FDE68A',
  red:         '#9B1D1D',
  redPale:     '#FDF2F2',
  redBorder:   '#FECACA',
  grey:        '#6B7280',
  greyPale:    '#F9FAFB',
  greyBorder:  '#E5E7EB',
  blue:        '#1E5A8F',
  bluePale:    '#EFF6FF',
  blueBorder:  '#BFDBFE',
};

// ── Verdict configuration ─────────────────────────────────────────────────────
const VERDICTS = [
  { key: 'possible_link',     label: 'Possible Link',     Icon: CheckCircle,  color: '#065F46', bg: '#D1FAE5',    border: '#6EE7B7' },
  { key: 'needs_review',      label: 'Needs Review',      Icon: HelpCircle,   color: C.amber,   bg: C.amberPale,  border: C.amberBorder },
  { key: 'unlikely_link',     label: 'Unlikely Link',     Icon: XCircle,      color: C.grey,    bg: C.greyPale,   border: C.greyBorder },
  { key: 'insufficient_data', label: 'Insufficient Data', Icon: FileQuestion, color: C.blue,    bg: C.bluePale,   border: C.blueBorder },
];

// ── Full comparison field sections ────────────────────────────────────────────
const FIELD_SECTIONS = [
  {
    key: 'encounter',
    label: 'Encounter sequence',
    fields: [
      ['initial_approach_type', 'Approach type'],
      ['negotiation_present', 'Negotiation'],
      ['refusal_present', 'Refusal'],
      ['pressure_after_refusal', 'Pressure after refusal'],
      ['coercion_present', 'Coercion'],
      ['threats_present', 'Threats'],
      ['verbal_abuse', 'Verbal abuse'],
      ['physical_force', 'Physical force'],
      ['sexual_assault', 'Sexual assault'],
      ['robbery_theft', 'Robbery/theft'],
      ['stealthing', 'Stealthing'],
      ['escalation_point', 'Escalation point'],
      ['exit_type', 'Exit type'],
    ],
  },
  {
    key: 'mobility',
    label: 'Mobility',
    fields: [
      ['movement_present', 'Movement'],
      ['movement_attempted', 'Movement attempted'],
      ['entered_vehicle', 'Entered vehicle'],
      ['mode_of_movement', 'Mode'],
      ['start_location_type', 'Start type'],
      ['destination_location_type', 'Destination type'],
      ['public_to_private_shift', 'Public→private'],
      ['public_to_secluded_shift', 'Public→secluded'],
      ['cross_neighbourhood', 'Cross neighbourhood'],
      ['cross_municipality', 'Cross municipality'],
      ['offender_control_over_movement', 'Offender control'],
    ],
  },
  {
    key: 'suspect',
    label: 'Suspect / vehicle',
    fields: [
      ['suspect_gender', 'Gender'],
      ['suspect_race_ethnicity', 'Race/ethnicity'],
      ['suspect_age_estimate', 'Age estimate'],
      ['suspect_count', 'Suspect count'],
      ['vehicle_present', 'Vehicle present'],
      ['vehicle_make', 'Make'],
      ['vehicle_model', 'Model'],
      ['vehicle_colour', 'Colour'],
      ['plate_partial', 'Plate (partial)'],
      ['repeat_suspect_flag', 'Repeat suspect'],
      ['repeat_vehicle_flag', 'Repeat vehicle'],
    ],
  },
  {
    key: 'location',
    label: 'Location / time',
    fields: [
      ['incident_date', 'Date'],
      ['city', 'City'],
      ['neighbourhood', 'Neighbourhood'],
      ['initial_contact_location', 'Contact location'],
      ['incident_location_primary', 'Incident location'],
      ['indoor_outdoor', 'Indoor/outdoor'],
      ['public_private', 'Public/private'],
      ['deserted', 'Deserted'],
    ],
  },
];

// ── Location display guard ────────────────────────────────────────────────────
const _LOC_KEYS = new Set(['initial_contact_location', 'incident_location_primary', 'incident_location_secondary']);
const _LOC_JUNK = new Set([
  'the','a','an','this','that','he','she','they','it','him','her','them',
  'his','their','its','at','on','in','by','near','around','behind','outside',
  'inside','said','told','reported','where','there','here',
]);
const _LOC_KEYWORDS = new Set([
  'street','st','avenue','ave','boulevard','blvd','road','rd','drive','dr',
  'lane','ln','way','place','court','ct','crescent','circle','parkway','highway',
  'alley','terrace','trail','intersection','corner','block','hotel','motel',
  'mall','plaza','park','lot','garage','bar','club','restaurant','cafe','store',
  'shop','station','transit','bus','hospital','school','apartment','condo',
  'house','home','basement','suite','downtown','uptown','district','square',
  'neighbourhood','neighborhood','north','south','east','west','central',
]);

function sanitizeLocDisplay(fieldKey: string, val: string): string {
  if (!_LOC_KEYS.has(fieldKey) || !val) return val;
  const tokens = val.toLowerCase().match(/[a-zA-Z']+/g) ?? [];
  if (!tokens.length) return '';
  if (tokens.length === 1 && _LOC_JUNK.has(tokens[0])) return '';
  if (tokens.every(t => _LOC_JUNK.has(t))) return '';
  if (tokens.some(t => _LOC_KEYWORDS.has(t))) return val;
  const meaningful = tokens.filter(t => !_LOC_JUNK.has(t) && t.length >= 3);
  if (meaningful.length >= 2 && val.length >= 8) return val;
  if (meaningful.length === 1 && val.length >= 6) return val;
  return '';
}

// ── Pure helper functions ─────────────────────────────────────────────────────

function classifySimilarity(score: number): { label: string; color: string; bg: string; border: string } {
  if (score >= 60) return { label: 'High similarity',      color: C.navy,  bg: C.navyPale,  border: C.navyBorder };
  if (score >= 35) return { label: 'Moderate similarity',  color: C.amber, bg: C.amberPale, border: C.amberBorder };
  return              { label: 'Low similarity',           color: C.grey,  bg: C.greyPale,  border: C.greyBorder };
}

function generateExplanation(sim: SimilarityResult): string {
  const spatial  = sim.dimensions['spatial'];
  const temporal = sim.dimensions['temporal'];

  const reasons: string[] = [];
  if (spatial?.score  >= 0.5) reasons.push('geographically close');
  if (temporal?.score >= 0.5) reasons.push('temporally near');

  const parts: string[] = [];
  if (reasons.length > 0) {
    parts.push(`Flagged because the cases are ${reasons.join(' and ')}.`);
  }

  const behaviorDims = ['suspect', 'vehicle', 'encounter', 'violence', 'mobility'] as const;
  const missingLabels: string[] = [];
  const presentLabels: string[] = [];
  for (const k of behaviorDims) {
    const d = sim.dimensions[k];
    if (!d || d.score === 0) {
      missingLabels.push({ suspect: 'suspect', vehicle: 'vehicle', encounter: 'encounter behaviour', violence: 'violence', mobility: 'mobility pattern' }[k]);
    } else {
      presentLabels.push({ suspect: 'suspect', vehicle: 'vehicle', encounter: 'encounter behaviour', violence: 'violence', mobility: 'mobility' }[k]);
    }
  }

  if (presentLabels.length > 0) {
    parts.push(`Current structured overlap is present in: ${presentLabels.join(', ')}.`);
  }
  if (missingLabels.length > 0) {
    parts.push(`No distinctive ${missingLabels.join(', ')} pattern has been confirmed from coded fields.`);
  }
  return parts.join(' ') || 'Similarity score based on available coded fields.';
}

function generateSummary(sim: SimilarityResult, _a: Report, _b: Report): string {
  const spatial  = sim.dimensions['spatial'];
  const temporal = sim.dimensions['temporal'];
  const parts: string[] = [];

  const flagReasons: string[] = [];
  if (spatial?.matches[0])  flagReasons.push(spatial.matches[0]);
  if (temporal?.matches[0]) flagReasons.push(temporal.matches[0]);

  if (flagReasons.length > 0) {
    parts.push(`These cases were flagged because they share ${flagReasons.join(' and ')}.`);
  } else {
    parts.push('These cases were flagged based on coded field overlap.');
  }

  if (spatial?.score >= 0.5) {
    parts.push(`The strongest overlap is geographic proximity: ${spatial.reason}.`);
  }
  if (temporal?.score >= 0.5 && temporal.reason !== 'No incident dates available') {
    parts.push(`Temporally: ${temporal.reason}.`);
  }

  const uncoded = ['suspect', 'vehicle', 'violence', 'mobility'].filter(k => {
    const d = sim.dimensions[k];
    return !d || d.score === 0;
  }).map(k => ({ suspect: 'suspect description', vehicle: 'vehicle details', violence: 'violence and control indicators', mobility: 'mobility sequence' }[k]!));

  if (uncoded.length > 0) {
    parts.push(`Behavioural overlap is limited because ${uncoded.join(', ')} ${uncoded.length === 1 ? 'is' : 'are'} missing or not yet coded.`);
  }

  if (sim.score < 35) {
    parts.push('This pair should be treated as a review candidate, not a confirmed linkage.');
  } else if (sim.score < 60) {
    parts.push('This pair warrants analyst review. Similarity is moderate but requires further assessment.');
  } else {
    parts.push('This pair shows multiple indicators of possible linkage. Analyst review is strongly recommended.');
  }

  return parts.join(' ');
}

// ── Domain card interpretation ────────────────────────────────────────────────

interface DomainCardData {
  key: string;
  label: string;
  interpretiveStatus: string;
  statusType: 'strong' | 'moderate' | 'weak' | 'insufficient' | 'contradiction';
  reason: string;
  completeness: 'available' | 'partial' | 'missing';
}

function buildDomainCards(sim: SimilarityResult): DomainCardData[] {
  const DOMAIN_META: { key: string; label: string }[] = [
    { key: 'spatial',        label: 'Geography' },
    { key: 'temporal',       label: 'Time' },
    { key: 'suspect',        label: 'Suspect' },
    { key: 'vehicle',        label: 'Vehicle' },
    { key: 'encounter',      label: 'Encounter behaviour' },
    { key: 'mobility',       label: 'Mobility' },
    { key: 'violence',       label: 'Violence / control' },
  ];

  return DOMAIN_META.map(({ key, label }) => {
    const dim = sim.dimensions[key];
    if (!dim) {
      return { key, label, interpretiveStatus: 'Not comparable', statusType: 'insufficient' as const, reason: 'No data available', completeness: 'missing' as const };
    }

    const hasDiscordant = dim.discordant && dim.discordant.length > 0;
    const hasMatches    = dim.matches.length > 0;
    const score         = dim.score;

    let statusType: DomainCardData['statusType'];
    let interpretiveStatus: string;
    let completeness: DomainCardData['completeness'];

    // Completeness
    if (hasMatches || score > 0)       completeness = 'available';
    else if (hasDiscordant)            completeness = 'partial';
    else                               completeness = 'missing';

    // Status
    if (hasDiscordant && !hasMatches) {
      statusType = 'contradiction';
      interpretiveStatus = 'Possible contradiction';
    } else if (key === 'spatial' || key === 'temporal') {
      if (score >= 0.8)       { statusType = 'strong';      interpretiveStatus = 'Strong proximity'; }
      else if (score >= 0.5)  { statusType = 'moderate';    interpretiveStatus = 'Moderate proximity'; }
      else if (score >= 0.2)  { statusType = 'weak';        interpretiveStatus = 'Weak proximity'; }
      else                    { statusType = 'insufficient'; interpretiveStatus = 'Insufficient data'; completeness = 'missing'; }
    } else if (key === 'suspect') {
      const onlyGender = dim.matches.length === 1 && dim.matches[0].startsWith('Gender:');
      if (onlyGender)         { statusType = 'weak';        interpretiveStatus = 'Low-specificity overlap'; }
      else if (score >= 0.5)  { statusType = 'moderate';    interpretiveStatus = 'Possible overlap'; }
      else if (score >= 0.2)  { statusType = 'weak';        interpretiveStatus = 'Weak overlap'; }
      else                    { statusType = 'insufficient'; interpretiveStatus = 'Insufficient data'; completeness = 'missing'; }
    } else {
      if (score >= 0.6)       { statusType = 'strong';      interpretiveStatus = 'Possible similarity'; }
      else if (score >= 0.3)  { statusType = 'moderate';    interpretiveStatus = 'Partial overlap'; }
      else if (score > 0)     { statusType = 'weak';        interpretiveStatus = 'Weak overlap'; }
      else                    { statusType = 'insufficient'; interpretiveStatus = 'No meaningful overlap identified'; completeness = 'missing'; }
    }

    return { key, label, interpretiveStatus, statusType, reason: dim.reason, completeness };
  });
}

function statusTypeStyle(st: DomainCardData['statusType']): { color: string; bg: string; border: string } {
  switch (st) {
    case 'strong':       return { color: C.teal,  bg: C.tealPale,  border: C.tealBorder };
    case 'moderate':     return { color: C.navy,  bg: C.navyPale,  border: C.navyBorder };
    case 'weak':         return { color: C.grey,  bg: C.greyPale,  border: C.greyBorder };
    case 'contradiction':return { color: C.red,   bg: C.redPale,   border: C.redBorder };
    default:             return { color: C.amber, bg: C.amberPale, border: C.amberBorder };
  }
}

function completenessLabel(c: DomainCardData['completeness']): { text: string; color: string } {
  switch (c) {
    case 'available': return { text: 'Data available',  color: C.teal };
    case 'partial':   return { text: 'Partial data',    color: C.amber };
    default:          return { text: 'Missing data',    color: C.red };
  }
}

// ── Similarity items (section B) ──────────────────────────────────────────────

interface SimilarityItem {
  type: string;
  caseAValue: string;
  caseBValue: string;
  analystValue: string;
  isDistinctive: boolean;
}

function buildDistinctiveSimilarities(sim: SimilarityResult, a: Report, b: Report): SimilarityItem[] {
  const items: SimilarityItem[] = [];

  const spatial = sim.dimensions['spatial'];
  if (spatial && spatial.score > 0) {
    items.push({
      type: 'Geographic proximity',
      caseAValue: a.neighbourhood || a.city || 'Unknown',
      caseBValue: b.neighbourhood || b.city || 'Unknown',
      analystValue: spatial.score >= 0.8 ? 'Strong spatial proximity — supports review'
                  : spatial.score >= 0.5 ? 'Moderate spatial proximity'
                  : 'Weak spatial proximity — low analytical value without other indicators',
      isDistinctive: spatial.score >= 0.5,
    });
  }

  const temporal = sim.dimensions['temporal'];
  if (temporal && temporal.score > 0) {
    const aDate = a.incident_date ? `${a.incident_date}${a.incident_time_exact ? `, ${a.incident_time_exact}` : ''}` : 'Unknown date';
    const bDate = b.incident_date ? `${b.incident_date}${b.incident_time_exact ? `, ${b.incident_time_exact}` : ''}` : 'Unknown date';
    items.push({
      type: 'Temporal proximity',
      caseAValue: aDate,
      caseBValue: bDate,
      analystValue: temporal.score >= 0.8 ? 'Strong temporal proximity'
                  : temporal.score >= 0.5 ? 'Moderate temporal proximity'
                  : 'Weak temporal proximity',
      isDistinctive: temporal.score >= 0.5,
    });
  }

  const suspect = sim.dimensions['suspect'];
  if (suspect) {
    const aDesc = [a.suspect_gender, a.suspect_race_ethnicity, a.suspect_age_estimate].filter(Boolean).join(', ') || 'unknown';
    const bDesc = [b.suspect_gender, b.suspect_race_ethnicity, b.suspect_age_estimate].filter(Boolean).join(', ') || 'unknown';
    const onlyGender = suspect.matches.length === 1 && suspect.matches[0].startsWith('Gender:');
    items.push({
      type: 'Shared behaviour (suspect)',
      caseAValue: aDesc,
      caseBValue: bDesc,
      analystValue: suspect.score === 0
        ? 'Not enough coded data to assess'
        : onlyGender
        ? 'Low-specificity overlap — gender alone is not a distinctive linkage indicator'
        : suspect.score >= 0.5 ? 'Possible overlap — requires analyst assessment'
        : 'Weak overlap',
      isDistinctive: !onlyGender && suspect.score >= 0.4,
    });
  }

  const vehicle = sim.dimensions['vehicle'];
  if (vehicle && vehicle.matches.length > 0) {
    const aVeh = [a.vehicle_make, a.vehicle_model, a.vehicle_colour].filter(Boolean).join(' ') || 'not coded';
    const bVeh = [b.vehicle_make, b.vehicle_model, b.vehicle_colour].filter(Boolean).join(' ') || 'not coded';
    items.push({
      type: 'Vehicle details',
      caseAValue: aVeh,
      caseBValue: bVeh,
      analystValue: vehicle.score >= 0.5 ? 'Possible overlap — should be verified' : 'Partial overlap identified',
      isDistinctive: vehicle.score >= 0.4,
    });
  }

  const encounter = sim.dimensions['encounter'];
  if (encounter && encounter.matches.length > 0) {
    items.push({
      type: 'Encounter behaviour',
      caseAValue: encounter.matches.join(', '),
      caseBValue: encounter.matches.join(', '),
      analystValue: `Shared: ${encounter.matches.join(', ')}`,
      isDistinctive: encounter.score >= 0.4,
    });
  }

  const violence = sim.dimensions['violence'];
  if (violence && violence.matches.length > 0) {
    items.push({
      type: 'Violence / control indicators',
      caseAValue: violence.matches.join(', '),
      caseBValue: violence.matches.join(', '),
      analystValue: 'Possible similarity — requires analyst interpretation',
      isDistinctive: violence.score >= 0.5,
    });
  }

  return items;
}

// ── Contradictions (section C) ────────────────────────────────────────────────

interface ContradictionItem {
  dimension: string;
  fieldName: string;
  description: string;
}

function buildContradictions(sim: SimilarityResult): ContradictionItem[] {
  const FIELD_LABELS: Record<string, string> = {
    suspect_gender: 'Suspect gender', suspect_race_ethnicity: 'Suspect race/ethnicity',
    suspect_age_estimate: 'Suspect age estimate', vehicle_make: 'Vehicle make',
    vehicle_model: 'Vehicle model', vehicle_colour: 'Vehicle colour',
    plate_partial: 'Partial plate', coercion_present: 'Coercion',
    pressure_after_refusal: 'Pressure after refusal', negotiation_present: 'Negotiation',
    physical_force: 'Physical force', sexual_assault: 'Sexual assault',
    stealthing: 'Stealthing', threats_present: 'Threats',
    robbery_theft: 'Robbery/theft', verbal_abuse: 'Verbal abuse',
    movement_present: 'Movement', entered_vehicle: 'Entered vehicle',
    public_to_private_shift: 'Public→private shift', cross_municipality: 'Cross municipality',
    initial_approach_type: 'Approach type', exit_type: 'Exit type',
  };

  const DIM_LABELS: Record<string, string> = {
    suspect: 'Suspect description', vehicle: 'Vehicle details',
    encounter: 'Encounter behaviour', violence: 'Violence type',
    mobility: 'Mobility pattern',
  };

  const items: ContradictionItem[] = [];

  for (const [dimKey, dim] of Object.entries(sim.dimensions)) {
    if (!dim.discordant || dim.discordant.length === 0) continue;
    const dimLabel = DIM_LABELS[dimKey] || dimKey;
    for (const field of dim.discordant) {
      const fieldLabel = FIELD_LABELS[field] || field.replace(/_/g, ' ');
      items.push({
        dimension: dimLabel,
        fieldName: field,
        description: `Different ${fieldLabel} coded between cases`,
      });
    }
  }

  return items;
}

// ── Missing data (section D) ──────────────────────────────────────────────────

function buildMissingData(_sim: SimilarityResult, a: Report, b: Report): string[] {
  const missing: string[] = [];
  const v = (r: Report, f: string) => String((r as any)[f] || '').trim();
  const isEmpty = (val: string) => !val || val === 'unknown' || val === 'unclear';

  if (isEmpty(v(b, 'suspect_description_text')) && isEmpty(v(b, 'suspect_gender'))) {
    missing.push('Suspect description not coded in Case B');
  } else if (isEmpty(v(a, 'suspect_description_text')) && isEmpty(v(a, 'suspect_gender'))) {
    missing.push('Suspect description not coded in Case A');
  }

  const aNoVeh = isEmpty(v(a, 'vehicle_make')) && isEmpty(v(a, 'vehicle_colour'));
  const bNoVeh = isEmpty(v(b, 'vehicle_make')) && isEmpty(v(b, 'vehicle_colour'));
  if (aNoVeh && bNoVeh) missing.push('Vehicle description missing in both cases');
  else if (aNoVeh)      missing.push('Vehicle description not coded in Case A');
  else if (bNoVeh)      missing.push('Vehicle description not coded in Case B');

  if (isEmpty(v(a, 'movement_present')) || isEmpty(v(b, 'movement_present'))) {
    missing.push('Mobility sequence incomplete or not coded in one or both cases');
  }

  if (isEmpty(v(a, 'physical_force')) || isEmpty(v(b, 'physical_force'))) {
    missing.push('Violence/control indicators not fully coded');
  }

  if (!a.lat_incident || !b.lat_incident) {
    missing.push('Precise incident coordinates not available — location comparison is limited to neighbourhood/city level');
  }

  if (isEmpty(v(a, 'incident_date')) || isEmpty(v(b, 'incident_date'))) {
    missing.push('Incident date missing in one or both cases');
  }

  missing.push('Narrative review recommended before drawing linkage conclusions');

  return missing;
}

// ── Encounter sequence staging ────────────────────────────────────────────────

interface EncounterStage {
  stage: string;
  status: 'present' | 'absent' | 'uncoded';
  value: string;
}

function getEncounterStages(r: Report): EncounterStage[] {
  const v = (f: string) => String((r as any)[f] || '').toLowerCase().trim();
  const isPresent  = (val: string) => val === 'yes' || val === 'probable' || val === 'inferred';
  const isAbsent   = (val: string) => val === 'no';
  const toStatus   = (val: string): EncounterStage['status'] =>
    isPresent(val) ? 'present' : isAbsent(val) ? 'absent' : 'uncoded';

  const approachVal = v('initial_approach_type');
  const violenceVal =
    isPresent(v('physical_force')) || isPresent(v('sexual_assault')) || isPresent(v('threats_present')) ? 'yes' :
    (isAbsent(v('physical_force')) && isAbsent(v('sexual_assault')) && isAbsent(v('threats_present'))) ? 'no' : '';

  return [
    { stage: 'Approach',     status: approachVal ? 'present' : 'uncoded',    value: approachVal  || 'unknown' },
    { stage: 'Negotiation',  status: toStatus(v('negotiation_present')),      value: v('negotiation_present')  || 'unknown' },
    { stage: 'Movement',     status: toStatus(v('movement_present')),         value: v('movement_present')     || 'unknown' },
    { stage: 'Coercion',     status: toStatus(v('coercion_present')),         value: v('coercion_present')     || 'unknown' },
    { stage: 'Violence',     status: toStatus(violenceVal),                   value: violenceVal               || 'unknown' },
    { stage: 'Exit',         status: v('exit_type') ? 'present' : 'uncoded', value: v('exit_type')            || 'unknown' },
  ];
}

// ── Field comparison status ───────────────────────────────────────────────────

type FieldStatus = 'match' | 'possible_similarity' | 'contradiction' | 'missing_a' | 'missing_b' | 'missing_both' | 'not_comparable';

function getFieldStatus(valA: string, valB: string): FieldStatus {
  const a = valA.toLowerCase().trim();
  const b = valB.toLowerCase().trim();
  if (!a && !b) return 'missing_both';
  if (!a)       return 'missing_a';
  if (!b)       return 'missing_b';
  if (a === b)  return 'match';

  const isYes = (v: string) => v === 'yes' || v === 'probable' || v === 'inferred';
  const isNo  = (v: string) => v === 'no';

  if (isYes(a) && isYes(b)) return 'possible_similarity';
  if ((isYes(a) && isNo(b)) || (isNo(a) && isYes(b))) return 'contradiction';
  return 'not_comparable';
}

const FIELD_STATUS_CFG: Record<FieldStatus, { label: string; color: string; bg: string; border: string }> = {
  match:              { label: 'Potential overlap',    color: C.teal,  bg: C.tealPale,  border: C.tealBorder },
  possible_similarity:{ label: 'Possible similarity',  color: C.navy,  bg: C.navyPale,  border: C.navyBorder },
  contradiction:      { label: 'Direct contradiction', color: C.red,   bg: C.redPale,   border: C.redBorder },
  missing_a:          { label: 'Missing in A',         color: C.amber, bg: C.amberPale, border: C.amberBorder },
  missing_b:          { label: 'Missing in B',         color: C.amber, bg: C.amberPale, border: C.amberBorder },
  missing_both:       { label: 'Missing in both',      color: C.grey,  bg: C.greyPale,  border: C.greyBorder },
  not_comparable:     { label: 'Not comparable',       color: C.grey,  bg: C.greyPale,  border: C.greyBorder },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'inline-block',
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: '#fff',
        background: C.navy, padding: '3px 10px', borderRadius: 4,
        marginBottom: subtitle ? 6 : 0,
      }}>
        {title}
      </div>
      {subtitle && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function DomainCardGrid({ sim }: { sim: SimilarityResult }) {
  const cards = buildDomainCards(sim);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
      gap: 10,
    }}>
      {cards.map((card) => {
        const ss  = statusTypeStyle(card.statusType);
        const cl  = completenessLabel(card.completeness);
        return (
          <div key={card.key} style={{
            background: 'var(--surface)',
            border: `1px solid ${ss.border}`,
            borderRadius: 8,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 5, letterSpacing: '0.03em' }}>
              {card.label}
            </div>
            <div style={{
              fontSize: 12, fontWeight: 600, color: ss.color,
              background: ss.bg, borderRadius: 4,
              padding: '3px 8px', display: 'inline-block',
              marginBottom: 6,
            }}>
              {card.interpretiveStatus}
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.45 }}>
              {card.reason}
            </p>
            <div style={{ fontSize: 10, fontWeight: 600, color: cl.color }}>
              {cl.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DistinctiveSimilarities({ sim, a, b }: { sim: SimilarityResult; a: Report; b: Report }) {
  const items = buildDistinctiveSimilarities(sim, a, b);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'grid',
          gridTemplateColumns: '180px 1fr 1fr 1fr',
          gap: 0,
          border: '1px solid var(--border)',
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--surface)',
          opacity: item.isDistinctive ? 1 : 0.75,
        }}>
          <div style={{ padding: '10px 12px', borderRight: '1px solid var(--border)', background: C.navy, display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', lineHeight: 1.35 }}>{item.type}</span>
          </div>
          <div style={{ padding: '10px 12px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 3 }}>CASE A</div>
            <div style={{ fontSize: 12, color: 'var(--text-1)' }}>{item.caseAValue}</div>
          </div>
          <div style={{ padding: '10px 12px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 3 }}>CASE B</div>
            <div style={{ fontSize: 12, color: 'var(--text-1)' }}>{item.caseBValue}</div>
          </div>
          <div style={{ padding: '10px 12px', background: item.isDistinctive ? C.tealPale : C.greyPale }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 3 }}>ANALYST VALUE</div>
            <div style={{ fontSize: 11.5, color: item.isDistinctive ? C.teal : C.grey, fontWeight: item.isDistinctive ? 600 : 400 }}>
              {item.analystValue}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContradictionsSection({ sim }: { sim: SimilarityResult }) {
  const items = buildContradictions(sim);

  if (items.length === 0) {
    return (
      <div style={{
        padding: '14px 16px',
        background: C.greyPale,
        border: `1px solid ${C.greyBorder}`,
        borderRadius: 8,
        fontSize: 12.5,
        color: 'var(--text-2)',
        lineHeight: 1.6,
      }}>
        <strong style={{ color: C.navy }}>No direct contradictions identified from coded fields.</strong>
        {' '}This does not confirm linkage. It only means no conflicting information has been coded in the available structured fields.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '10px 14px',
          background: C.redPale,
          border: `1px solid ${C.redBorder}`,
          borderRadius: 6,
        }}>
          <AlertTriangle size={14} color={C.red} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.red, marginBottom: 2 }}>{item.dimension}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MissingDataSection({ sim, a, b }: { sim: SimilarityResult; a: Report; b: Report }) {
  const items = buildMissingData(sim, a, b);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '8px 12px',
          background: C.amberPale,
          border: `1px solid ${C.amberBorder}`,
          borderRadius: 5,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: C.amber, flexShrink: 0, marginTop: 5,
          }} />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

function TimelineRow({ label, stages }: { label: string; stages: EncounterStage[] }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: C.navy,
        letterSpacing: '0.04em', marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 0 }}>
        {stages.map((s, i) => {
          const isFirst = i === 0;
          const isLast  = i === stages.length - 1;
          const bg      = s.status === 'present' ? C.navyPale : s.status === 'absent' ? C.greyPale : C.amberPale;
          const border  = s.status === 'present' ? C.navyBorder : s.status === 'absent' ? C.greyBorder : C.amberBorder;
          const valColor= s.status === 'present' ? C.navy : s.status === 'absent' ? C.grey : C.amber;

          return (
            <div key={s.stage} style={{
              flex: 1,
              padding: '8px 6px',
              background: bg,
              border: `1px solid ${border}`,
              borderRight: isLast ? `1px solid ${border}` : 'none',
              borderRadius: isFirst ? '6px 0 0 6px' : isLast ? '0 6px 6px 0' : 0,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 4, letterSpacing: '0.03em' }}>
                {s.stage}
              </div>
              <div style={{
                fontSize: 10,
                color: valColor,
                fontStyle: s.status === 'uncoded' ? 'italic' : 'normal',
                fontWeight: s.status === 'present' ? 600 : 400,
              }}>
                {s.status === 'uncoded' ? 'uncoded' : s.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SequenceComparison({ a, b }: { a: Report; b: Report; sim: SimilarityResult }) {
  const stagesA = getEncounterStages(a);
  const stagesB = getEncounterStages(b);

  const bMissing = stagesB.filter(s => s.status === 'uncoded').length;
  const aMissing = stagesA.filter(s => s.status === 'uncoded').length;

  let interpretation = '';
  if (bMissing >= 4 || aMissing >= 4) {
    interpretation = 'Sequence comparison is limited because one or both cases have insufficient stage coding. Coded stages cannot be meaningfully compared without the full sequence.';
  } else if (bMissing >= 2 || aMissing >= 2) {
    interpretation = 'Partial sequence data available. Comparison should be treated as provisional — missing stages may affect the assessment.';
  } else {
    const sharedPresent = stagesA.filter((s, i) => s.status === 'present' && stagesB[i].status === 'present').length;
    if (sharedPresent >= 3) {
      interpretation = 'Both cases have sufficient coding to compare sequences. Multiple stages are coded in both cases — analyst should review for meaningful pattern overlap.';
    } else {
      interpretation = 'Sequences can be compared but shared coded stages are limited. Analyst review of raw narratives is recommended.';
    }
  }

  return (
    <div>
      <TimelineRow label={`Case A — ${a.report_id}`} stages={stagesA} />
      <TimelineRow label={`Case B — ${b.report_id}`} stages={stagesB} />
      <div style={{
        marginTop: 10, padding: '10px 14px',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 6, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55,
        fontStyle: 'italic',
      }}>
        {interpretation}
      </div>
    </div>
  );
}

function FullFieldComparison({ a, b, matchedFields }: { a: Report; b: Report; matchedFields: Set<string> }) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showMissing, setShowMissing] = useState(false);

  const toggle = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button
          onClick={() => setShowMissing(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: `1px solid var(--border)`,
            borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
            fontSize: 11.5, color: 'var(--text-3)',
          }}
        >
          {showMissing ? <EyeOff size={12} /> : <Eye size={12} />}
          {showMissing ? 'Hide missing fields' : 'Show missing fields'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {FIELD_SECTIONS.map((sec) => {
          const isOpen = expandedSections.has(sec.key);
          const allFields = sec.fields as [string, string][];

          return (
            <div key={sec.key} style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--surface)',
            }}>
              <button
                onClick={() => toggle(sec.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '10px 14px',
                  background: isOpen ? C.navyPale : 'var(--surface)',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  borderBottom: isOpen ? `1px solid ${C.navyBorder}` : 'none',
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.navy }}>
                  {sec.label}
                </span>
                {isOpen
                  ? <ChevronDown size={14} color={C.navy} />
                  : <ChevronRight size={14} color="var(--text-3)" />}
              </button>

              {isOpen && (
                <div>
                  {/* Table header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 140px',
                    padding: '5px 14px',
                    background: 'var(--surface-2)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {['Field', 'Case A', 'Case B', 'Assessment'].map(h => (
                      <span key={h} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
                        {h}
                      </span>
                    ))}
                  </div>

                  {allFields.map(([fieldKey, fieldLabel]) => {
                    const rawA = String((a as any)[fieldKey] || '');
                    const rawB = String((b as any)[fieldKey] || '');
                    const valA = sanitizeLocDisplay(fieldKey, rawA);
                    const valB = sanitizeLocDisplay(fieldKey, rawB);
                    const status = getFieldStatus(valA, valB);

                    if (!showMissing && status === 'missing_both') return null;

                    const cfg = FIELD_STATUS_CFG[status];
                    const isMatched = matchedFields.has(fieldKey);

                    return (
                      <div key={fieldKey} style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 140px',
                        padding: '6px 14px',
                        borderBottom: '1px solid var(--border)',
                        background: isMatched ? `${C.navyPale}60` : 'transparent',
                        alignItems: 'center',
                      }}>
                        <span style={{
                          fontSize: 12, color: 'var(--text-1)',
                          fontWeight: isMatched ? 500 : 400,
                        }}>
                          {isMatched && <span style={{ color: C.navy, marginRight: 5 }}>◆</span>}
                          {fieldLabel}
                        </span>
                        <span style={{
                          fontSize: 12, color: valA ? 'var(--text-1)' : 'var(--text-3)',
                          fontStyle: valA ? 'normal' : 'italic',
                        }}>
                          {valA || '—'}
                        </span>
                        <span style={{
                          fontSize: 12, color: valB ? 'var(--text-1)' : 'var(--text-3)',
                          fontStyle: valB ? 'normal' : 'italic',
                        }}>
                          {valB || '—'}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 600,
                          color: cfg.color,
                          background: cfg.bg !== C.greyPale ? cfg.bg : 'transparent',
                          padding: cfg.bg !== C.greyPale ? '2px 7px' : '0',
                          borderRadius: 4,
                          border: cfg.bg !== C.greyPale ? `1px solid ${cfg.border}` : 'none',
                          display: 'inline-block', lineHeight: 1.4,
                        }}>
                          {cfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnalystDecision({
  verdict, setVerdict,
  rationale, setRationale,
  supports, setSupports,
  against, setAgainst,
  missingNote, setMissingNote,
  followUp, setFollowUp,
  onSave, saving, saved,
  reportIdA, reportIdB,
}: {
  verdict: string; setVerdict: (v: string) => void;
  rationale: string; setRationale: (v: string) => void;
  supports: string; setSupports: (v: string) => void;
  against: string; setAgainst: (v: string) => void;
  missingNote: string; setMissingNote: (v: string) => void;
  followUp: string; setFollowUp: (v: string) => void;
  onSave: () => void; saving: boolean; saved: boolean;
  reportIdA: string; reportIdB: string;
}) {
  const canSave = !!verdict && rationale.trim().length >= 5;
  const [showStructured, setShowStructured] = useState(false);

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${C.navyBorder}`,
      borderRadius: 10,
      padding: '20px 24px',
    }}>
      {/* Verdict selection */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, marginBottom: 10 }}>Linkage verdict</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {VERDICTS.map(({ key, label, Icon, color, bg, border }) => {
            const active = verdict === key;
            return (
              <button
                key={key}
                onClick={() => setVerdict(active ? '' : key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 6,
                  border: `1.5px solid ${active ? border : 'var(--border)'}`,
                  background: active ? bg : 'var(--surface-2)',
                  color: active ? color : 'var(--text-3)',
                  fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Required rationale */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.navy, marginBottom: 6 }}>
          Analyst rationale
          <span style={{ color: C.red, marginLeft: 4 }}>*</span>
          <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 11, marginLeft: 8 }}>Required before saving</span>
        </label>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Briefly state the basis for your verdict. What drives your assessment of this case pair?"
          rows={3}
          style={{
            width: '100%', padding: '9px 12px',
            border: `1px solid ${rationale.trim().length >= 5 ? 'var(--border)' : C.amberBorder}`,
            borderRadius: 6, background: 'var(--bg)',
            fontSize: 13, color: 'var(--text-1)', lineHeight: 1.55,
            resize: 'vertical', fontFamily: 'DM Sans, sans-serif', outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => (e.target.style.borderColor = C.navyBorder)}
          onBlur={e => (e.target.style.borderColor = rationale.trim().length >= 5 ? 'var(--border)' : C.amberBorder)}
        />
      </div>

      {/* Structured prompts (optional) */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => setShowStructured(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11.5, color: 'var(--text-3)', padding: 0, marginBottom: showStructured ? 12 : 0,
          }}
        >
          {showStructured ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Optional structured prompts
        </button>

        {showStructured && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['What supports linkage?', supports, setSupports],
              ['What argues against linkage?', against, setAgainst],
              ['What data is missing?', missingNote, setMissingNote],
              ['What follow-up is needed?', followUp, setFollowUp],
            ].map(([label, value, setter]) => (
              <div key={label as string}>
                <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-2)', marginBottom: 5, fontWeight: 500 }}>
                  {label as string}
                </label>
                <textarea
                  value={value as string}
                  onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%', padding: '7px 10px',
                    border: '1px solid var(--border)', borderRadius: 5,
                    background: 'var(--bg)', fontSize: 12.5,
                    color: 'var(--text-1)', resize: 'vertical',
                    fontFamily: 'DM Sans, sans-serif', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.target.style.borderColor = C.navyBorder)}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review record note */}
      <div style={{
        padding: '8px 12px',
        background: 'var(--surface-2)', borderRadius: 5,
        fontSize: 11, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.5,
      }}>
        Saved review records include: case IDs ({reportIdA} / {reportIdB}), verdict, analyst rationale, system-generated summary, and timestamp.
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={onSave}
          disabled={saving || !canSave}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 18px', borderRadius: 6,
            border: 'none',
            background: saved ? '#D1FAE5' : canSave ? C.navy : 'var(--border)',
            color: saved ? '#065F46' : canSave ? '#fff' : 'var(--text-3)',
            fontSize: 13, fontWeight: 600,
            cursor: canSave ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          <Save size={13} />
          {saving ? 'Saving…' : saved ? 'Review saved ✓' : 'Save linkage review'}
        </button>
        {!canSave && !saving && (
          <span style={{ fontSize: 11.5, color: C.amber }}>
            {!verdict ? 'Select a verdict to save' : 'Enter analyst rationale to save'}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LinkageScreen() {
  const { reportIdA, reportIdB } = useParams<{ reportIdA: string; reportIdB: string }>();
  const navigate = useNavigate();

  const [result, setResult]     = useState<CompareResult | null>(null);
  const [loading, setLoading]   = useState(true);
  const [verdict, setVerdict]   = useState('');
  const [rationale, setRationale] = useState('');
  const [supports, setSupports] = useState('');
  const [against, setAgainst]   = useState('');
  const [missingNote, setMissingNote] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    if (!reportIdA || !reportIdB) return;
    api.compareReports(reportIdA, reportIdB).then((r) => {
      setResult(r);
      setVerdict(r.linkage?.analyst_status || '');
      // Pre-populate rationale if previously saved
      if (r.linkage?.analyst_notes) setRationale(r.linkage.analyst_notes);
      setLoading(false);
    });
  }, [reportIdA, reportIdB]);

  const handleSave = useCallback(async () => {
    if (!reportIdA || !reportIdB) return;
    setSaving(true);
    const parts: string[] = [rationale.trim()];
    if (supports.trim())    parts.push(`[Supports linkage] ${supports.trim()}`);
    if (against.trim())     parts.push(`[Against linkage] ${against.trim()}`);
    if (missingNote.trim()) parts.push(`[Missing data] ${missingNote.trim()}`);
    if (followUp.trim())    parts.push(`[Follow-up] ${followUp.trim()}`);
    await api.saveLinkage({
      report_id_a: reportIdA,
      report_id_b: reportIdB,
      analyst_status: verdict,
      analyst_notes: parts.join('\n\n'),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, [reportIdA, reportIdB, verdict, rationale, supports, against, missingNote, followUp]);

  if (loading || !result) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--text-3)', fontSize: 13,
      }}>
        Comparing cases…
      </div>
    );
  }

  const { report_a, report_b, similarity } = result;
  const matchedFields   = new Set(similarity.matched_fields);
  const classification  = classifySimilarity(similarity.score);
  const explanation     = generateExplanation(similarity);
  const summary         = generateSummary(similarity, report_a, report_b);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* ── Page header ── */}
      <div style={{
        flexShrink: 0,
        background: C.navy,
        padding: '14px 24px',
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>

          {/* Back */}
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 4, display: 'flex', marginTop: 2 }}
          >
            <ArrowLeft size={15} />
          </button>

          {/* Case IDs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                padding: '3px 12px', borderRadius: 5,
                fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
                background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.9)',
                border: '1px solid rgba(255,255,255,0.2)',
              }}>
                Case A: {report_a.report_id}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>compared with</span>
              <span style={{
                padding: '3px 12px', borderRadius: 5,
                fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
                background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.9)',
                border: '1px solid rgba(255,255,255,0.2)',
              }}>
                Case B: {report_b.report_id}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              Human-led linkage review — analyst decision required
            </div>
          </div>

          {/* Score + classification */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              background: `${classification.bg}22`,
              border: `1px solid ${classification.border}66`,
              borderRadius: 8, padding: '8px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                {Math.round(similarity.score)}
                <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.5)', marginLeft: 2 }}>/100</span>
              </div>
              <div style={{
                fontSize: 11, fontWeight: 600, color: classification.color,
                background: classification.bg, borderRadius: 4,
                padding: '2px 8px', marginTop: 4, display: 'inline-block',
              }}>
                {classification.label}
              </div>
            </div>
          </div>
        </div>

        {/* Plain-language explanation */}
        <div style={{
          marginTop: 12, padding: '10px 14px',
          background: 'rgba(255,255,255,0.07)',
          borderRadius: 6,
          fontSize: 12.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.55,
          borderLeft: `3px solid rgba(255,255,255,0.2)`,
        }}>
          {explanation}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* A. Linkage Summary */}
        <section>
          <SectionHeader title="A. Linkage Summary" subtitle="Plain-language analyst briefing" />
          <div style={{
            padding: '18px 20px',
            background: 'var(--surface)',
            border: `1px solid ${C.navyBorder}`,
            borderLeft: `4px solid ${C.navy}`,
            borderRadius: 8,
            fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7,
          }}>
            {summary}
          </div>
        </section>

        {/* Domain cards */}
        <section>
          <SectionHeader title="Domain Overview" subtitle="Interpretive status per analytical domain — requires analyst review" />
          <DomainCardGrid sim={similarity} />
        </section>

        {/* B. Distinctive Similarities */}
        <section>
          <SectionHeader
            title="B. Distinctive Similarities"
            subtitle="Similarities with analytical value — generic overlap (e.g. male gender alone) is labelled as low-specificity"
          />
          <DistinctiveSimilarities sim={similarity} a={report_a} b={report_b} />
        </section>

        {/* C. Differences / Contradictions */}
        <section>
          <SectionHeader
            title="C. Differences / Contradictions"
            subtitle="Coded fields where the cases differ — a strong linkage case requires explaining contradictions, not ignoring them"
          />
          <ContradictionsSection sim={similarity} />
        </section>

        {/* D. Missing Data */}
        <section>
          <SectionHeader
            title="D. Missing Data / Follow-up Needed"
            subtitle="Blank fields do not mean 'no similarity' — missing data means cannot assess"
          />
          <MissingDataSection sim={similarity} a={report_a} b={report_b} />
        </section>

        {/* Encounter Sequence Comparison */}
        <section>
          <SectionHeader
            title="Encounter Sequence Comparison"
            subtitle="Each stage shows whether coded data exists. Uncoded stages are not treated as non-matches."
          />
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8, padding: '18px 20px',
          }}>
            <SequenceComparison a={report_a} b={report_b} sim={similarity} />
          </div>
        </section>

        {/* E. Full Field Comparison */}
        <section>
          <SectionHeader
            title="E. Full Field Comparison"
            subtitle="Collapsed by default — expand domains to view side-by-side coded values"
          />
          <FullFieldComparison a={report_a} b={report_b} matchedFields={matchedFields} />
        </section>

        {/* F. Analyst Decision */}
        <section>
          <SectionHeader
            title="F. Analyst Decision"
            subtitle="Verdict and rationale required. The system assists — the analyst decides."
          />
          <AnalystDecision
            verdict={verdict}       setVerdict={setVerdict}
            rationale={rationale}   setRationale={setRationale}
            supports={supports}     setSupports={setSupports}
            against={against}       setAgainst={setAgainst}
            missingNote={missingNote} setMissingNote={setMissingNote}
            followUp={followUp}     setFollowUp={setFollowUp}
            onSave={handleSave}
            saving={saving}
            saved={saved}
            reportIdA={reportIdA!}
            reportIdB={reportIdB!}
          />
        </section>

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
