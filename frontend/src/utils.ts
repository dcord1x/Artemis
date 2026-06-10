/** Returns true for "positive" coded values: yes, probable, inferred, probable / inferred */
export const broadPos = (v: string | undefined): boolean =>
  ['yes', 'probable', 'inferred', 'probable / inferred'].includes(v || '');

/**
 * Central lookup map for stored field values → clean display labels.
 * Stored backend values (snake_case) are never changed; only the display is formatted.
 * Add entries here whenever a new select field stores snake_case values.
 */
export const FIELD_VALUE_LABELS: Record<string, string> = {
  // approach_method
  street_approach:           'Street / in-person approach',
  online_digital:            'Online / digital',
  referral:                  'Referral',
  venue_based:               'Venue-based',
  phone_text:                'Phone / text',
  vehicle_based:             'Vehicle-based',
  third_party_arranged:      'Third-party arranged',
  unknown_unclear:           'Unknown / unclear',

  // approach_setting
  public_street:             'Public street',
  online_platform:           'Online platform',
  venue_indoor:              'Venue (indoor)',
  private_space:             'Private space',

  // approach_mobility_context
  stationary:                'Stationary',
  mobile_on_foot:            'Mobile on foot',
  mobile_in_vehicle:         'Mobile in vehicle',
  transitioning:             'Transitioning',

  // client_known_at_contact
  yes_known:                 'Yes — previously known',
  first_contact:             'First contact',

  // initial_contact_visibility & initial_contact_guardianship
  limited_visibility:        'Limited visibility',
  not_visible:               'Not visible',
  not_stated:                'Not stated',
  limited_reduced:           'Limited / reduced',

  // basis_for_movement_coding — display-only remap, stored value unchanged
  'NLP suggestion only':     'System-suggested',

  // Stage type keys (stored values → display labels)
  initial_contact:           'Initial contact',
  screening_recognition:     'Screening / recognition',
  negotiation:               'Negotiation',
  pickup_meeting:            'Pickup / meeting',
  movement_travel:           'Movement / relocation',
  movement_relocation:       'Movement / relocation',
  arrival_location:          'Arrival / setting',
  arrival_setting:           'Arrival / setting',
  escalation:                'Escalation',
  violence_coercion:         'Violence / coercion',
  exit_escape:               'Exit / escape',
  aftermath:                 'Aftermath / warning',
  aftermath_warning:         'Aftermath / warning',
  exit_aftermath:            'Exit / aftermath',

  // Harm indicators (stored snake_case → display)
  physical_force:            'Physical force',
  sexual_assault:            'Sexual assault',
  robbery_theft:             'Robbery / theft',
  coercion_present:          'Coercion present',
  threats_present:           'Threats present',
  choking_strangulation:     'Choking / strangulation',
  forced_movement_dragging:  'Forced movement',
  restraint_confinement:     'Restraint / confinement',
  weapon_present_used:       'Weapon present / used',
  non_consensual_substance:  'Non-consensual substance',
  prevented_exit:            'Prevented exit',

  // Movement impact (StageSequencer stored values)
  no_change:                 'No meaningful change',
  reduced_visibility:        'Reduced visibility',
  increased_isolation:       'Increased isolation',
  reduced_ability_leave:     'Reduced ability to leave',
  increased_control:         'Increased client control',
  changed_location:          'Changed agreed location',

  // Spatial / location precision
  exact_address:             'Exact address',
  intersection:              'Intersection',
  landmark:                  'Landmark / business',
  neighbourhood:             'Neighbourhood',
  approximate:               'Approximate area',
  municipality_only:         'City / municipality',
  not_mappable:              'Not mappable',

  // Common coded values
  not_applicable:            'Not applicable',
  not_enough_information:    'Not enough information',
  not_reviewed:              'Not reviewed',
  not_coded:                 'Not coded',
  worker_controlled:         'Worker-controlled',
  client_controlled:         'Client-controlled',
  shared:                    'Shared',
  high:                      'High',
  medium:                    'Medium',
  low:                       'Low',

  // Blank/unknown sentinels — explicit display
  unknown:                   'Unknown',
  unclear:                   'Unclear',
  other:                     'Other',
  present:                   'Present',
  absent:                    'Absent',
  visible:                   'Visible',
  vehicle:                   'Vehicle',
};

/**
 * Returns a clean display label for a stored field value.
 * - Explicit entries in FIELD_VALUE_LABELS take priority.
 * - Fallback: converts snake_case identifiers to sentence case.
 * - Other strings (already human-readable) are returned unchanged.
 */
export function formatLabel(value: string): string {
  if (!value) return value;
  if (Object.prototype.hasOwnProperty.call(FIELD_VALUE_LABELS, value)) {
    return FIELD_VALUE_LABELS[value];
  }
  if (value.includes('_') && /^[a-z0-9_]+$/.test(value)) {
    return value.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
  }
  return value;
}
