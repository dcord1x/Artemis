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
