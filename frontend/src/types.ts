export interface Report {
  id: number;
  report_id: string;
  raw_narrative: string;
  source_organization: string;
  source_worker_id: string;
  date_received: string;
  original_report_format: string;
  analyst_name: string;
  coding_status: string;
  confidence_level: string;

  incident_date: string;
  incident_time_exact: string;
  incident_time_range: string;
  day_of_week: string;
  city: string;
  neighbourhood: string;
  initial_contact_location: string;
  incident_location_primary: string;
  incident_location_secondary: string;
  indoor_outdoor: string;
  public_private: string;
  deserted: string;

  initial_approach_type: string;
  negotiation_present: string;
  service_discussed: string;
  payment_discussed: string;
  refusal_present: string;
  pressure_after_refusal: string;
  coercion_present: string;
  threats_present: string;
  verbal_abuse: string;
  physical_force: string;
  sexual_assault: string;
  robbery_theft: string;
  stealthing: string;
  loss_of_consciousness: string;
  non_consensual_substance: string;
  substance_administration_notes: string;
  forced_movement_dragging: string;
  restraint_confinement: string;
  weapon_present_used: string;
  choking_strangulation: string;
  prevented_exit: string;
  exit_type: string;

  movement_present: string;
  movement_attempted: string;
  movement_count: string;
  mode_of_movement: string;
  entered_vehicle: string;
  vehicle_driver_role: string;
  start_location_type: string;
  destination_location_type: string;
  public_to_private_shift: string;
  public_to_secluded_shift: string;
  cross_neighbourhood: string;
  cross_municipality: string;
  offender_control_over_movement: string;

  suspect_count: string;
  suspect_gender: string;
  suspect_description_text: string;
  suspect_race_ethnicity: string;
  suspect_age_estimate: string;
  vehicle_present: string;
  vehicle_make: string;
  vehicle_year: string;
  vehicle_model: string;
  vehicle_colour: string;
  vehicle_description: string;
  plate_partial: string;
  repeat_suspect_flag: string;
  repeat_vehicle_flag: string;
  human_trafficking_flag: string;

  early_escalation_score: string;
  mobility_richness_score: string;
  escalation_point: string;
  resolution_endpoint: string;
  highest_stage_reached: string;
  turning_point: string;
  summary_analytic: string;
  key_quotes: string;
  coder_notes: string;
  uncertainty_notes: string;
  cleaned_narrative: string;

  initial_contact_address_raw: string;
  incident_address_raw: string;
  destination_address_raw: string;
  geocode_status: string;
  lat_initial: number | null;
  lon_initial: number | null;
  lat_incident: number | null;
  lon_incident: number | null;
  lat_destination: number | null;
  lon_destination: number | null;

  created_at: string;
  updated_at: string;
  audit_log: AuditEntry[];
  ai_suggestions: Record<string, any>;
  tags: string[];

  // Provenance
  field_provenance: Record<string, string>;
  analyst_summary: string;

  // Extended uncertainty
  destination_known: string;
  location_certainty: string;

  // Mobility expanded
  movement_completed: string;
  who_controlled_movement: string;
  unexplained_relocation: string;
  movement_confidence: string;
  movement_notes: string;

  // Encounter sequence expanded
  repeated_pressure: string;
  intimidation_present: string;
  abrupt_tone_change: string;
  escalation_trigger: string;
  verbal_abuse_before_violence: string;

  // Incident Overview (Encounter tab)
  primary_incident_type: string;
  overall_severity: string;
  overall_incident_summary: string;
  stage_coding_suitability: string;
  sequence_clarity: string;
  boundary_issue_present: string;
  movement_relocation_present: string;
  key_supporting_excerpts: string;

  // GIS confidence — initial contact
  initial_contact_address_normalized: string;
  initial_contact_precision: string;
  initial_contact_source: string;
  initial_contact_confidence: string;
  initial_contact_analyst_notes: string;

  // GIS confidence — incident
  incident_address_normalized: string;
  incident_precision: string;
  incident_source: string;
  incident_confidence: string;
  incident_analyst_notes: string;

  // GIS confidence — destination
  destination_address_normalized: string;
  destination_precision: string;
  destination_source: string;
  destination_confidence: string;
  destination_analyst_notes: string;

  // Location-stage city fields
  initial_contact_city: string;
  initial_contact_city_confidence: string;
  incident_city: string;
  incident_city_confidence: string;
  destination_city: string;
  destination_city_confidence: string;
  cross_city_movement: string;

  // Source provenance — PDF attachment
  source_bulletin_text: string;
  source_bulletin_session_id: string;

  // VAWG / Exploitation and Public Safety Flags
  trafficking_exploitation_concern: string;
  third_party_control_indicated: string;
  worker_appears_controlled: string;
  client_connected_to_controller: string;
  movement_to_unknown_unsafe_location: string;
  worker_unaware_how_arrived: string;
  grooming_recruitment_concern: string;
  repeat_targeting_concern: string;
  multiple_women_referenced: string;
  organized_group_offending_concern: string;
  public_safety_bulletin_suitability: string;
  public_safety_urgency_level: string;
  vawg_exploitation_notes: string;
  vawg_key_excerpts: string;

  // Mobility — new fields
  movement_purpose: string;
  basis_for_movement_coding: string;

  // Suspect — expanded
  suspect_distinctive_features: string;
  suspect_clothing: string;
  suspect_speech_notes: string;
  suspect_behavioural_descriptors: string;
  known_repeat_suspect: string;

  // Vehicle — expanded
  vehicle_role_in_encounter: string;
  vehicle_ownership_association: string;
  vehicle_confidence: string;

  // Concern flags (Suspect/Vehicle tab)
  concern_trafficking: string;
  concern_third_party_control: string;
  concern_grooming: string;
  concern_organized_offending: string;
  concern_repeat_suspect: string;
  concern_repeat_vehicle: string;
  concern_urgent_public_safety: string;
  concern_bulletin_suitable: string;
  concern_flag_rationale: string;

  // GIS — per-block location type and geocoding status
  initial_contact_location_type: string;
  incident_location_type: string;
  initial_contact_geocoding_status: string;
  incident_geocoding_status: string;
  destination_geocoding_status: string;

  // Harm classification — multi-harm support
  primary_harm: string;
  multi_harm_flag: string;
}

export interface ReportStage {
  id: number;
  report_id: string;
  stage_order: number;
  // Core fields
  stage_type: string;
  client_behaviors: string[];
  victim_responses: string[];        // DB column name kept; UI label → "Worker Responses"
  escalation_level: string;
  location_type: string;
  movement_type_to_here: string;
  turning_point_notes: string;       // UI label → "Turning Point / Stage Summary"
  supporting_excerpt: string;
  // Situational conditions (More Details)
  visibility: string;
  guardianship: string;
  isolation_level: string;
  control_type: string;
  // Location details (More Details)
  location_label: string;
  spatial_precision: string;
  // Movement impact (More Details)
  movement_impact: string;
  able_to_leave: string;
  // Coding notes (More Details)
  coder_notes_stage: string;
  coding_confidence: string;
  temporal_sequence_note: string;
}

export interface StagePatterns {
  stage_type_frequency:      { value: string; count: number }[];
  visibility_by_stage:       Record<string, { value: string; count: number }[]>;
  guardianship_by_stage:     Record<string, { value: string; count: number }[]>;
  isolation_by_stage:        Record<string, { value: string; count: number }[]>;
  control_by_stage:          Record<string, { value: string; count: number }[]>;
  movement_by_stage:         Record<string, { value: string; count: number }[]>;
  behavior_frequency:        { value: string; count: number }[];
  response_frequency:        { value: string; count: number }[];
  escalation_frequency:      { value: string; count: number }[];
  movement_impact_frequency: { value: string; count: number }[];
  matching_cases:            string[];
  sequence_frequency:        { value: string; count: number }[];
  total_stages:              number;
  total_cases_with_stages:   number;
}

export interface SimilarityDimension {
  label: string;
  score: number;
  weight: number;
  matches: string[];
  matched_fields: string[];
  joint_present: string[];
  discordant: string[];
  reason: string;
}

export interface DomainFieldDetail {
  field: string;
  label: string;
  value_a: string;
  value_b: string;
  status: 'joint_present' | 'probable_joint' | 'discordant_a' | 'discordant_b' | 'both_absent' | 'both_empty' | 'one_empty';
  weight: number;
}

export interface DomainScore {
  label: string;
  score: number;
  joint_present: string[];
  discordant: string[];
  field_breakdown: DomainFieldDetail[];
  has_real_coded_values: boolean;
  coded_count: number;
  total_count: number;
  score_type: 'positive_match' | 'joint_absence' | 'discordant' | 'baseline';
  score_explanation: string;
}

export interface SimilarityResult {
  score: number;
  dimensions: Record<string, SimilarityDimension>;
  domain_scores?: Record<string, DomainScore>;
  top_matching_fields?: string[];
  top_discordant_fields?: string[];
  repeat_flags: { type: string; detail: string; dimension: string }[];
  matched_fields: string[];
}

export interface SimilarCandidate {
  report_id: string;
  incident_date: string;
  city: string;
  neighbourhood: string;
  coding_status: string;
  coercion_present: string;
  movement_present: string;
  vehicle_present: string;
  physical_force: string;
  sexual_assault: string;
  suspect_gender: string;
  vehicle_make: string;
  vehicle_colour: string;
  plate_partial: string;
  similarity: SimilarityResult;
  linkage_status: string;
}

export interface CompareResult {
  report_a: Report;
  report_b: Report;
  similarity: SimilarityResult;
  linkage: { analyst_status: string; analyst_notes: string } | null;
}

export interface AuditEntry {
  ts: string;
  action: string;
  field?: string;
  from?: string;
  to?: string;
  by?: string;
}

export interface NlpViolenceCategory {
  rank1: number;
  rank2: number;
}

export interface Stats {
  total: number;
  coded: number;
  nlp_available: boolean;
  coercion: { count: number; pct: number };
  movement: { count: number; pct: number };
  physical_force: { count: number; pct: number };
  sexual_assault: { count: number; pct: number };
  threats_present: { count: number; pct: number };
  vehicle_present: { count: number; pct: number };
  vehicle_present_count: number;
  nlp_violence: {
    coercion: NlpViolenceCategory;
    physical: NlpViolenceCategory;
    sexual: NlpViolenceCategory;
    movement: NlpViolenceCategory;
    weapon: NlpViolenceCategory;
    escalation: { score3: number; score4: number; score5: number };
  };
  nlp_escalation_patterns: { pattern: string; count: number }[];
  repeated_vehicles: { plate: string; count: number }[];
  vehicle_makes: { make: string; count: number }[];
  vehicle_colours: { colour: string; count: number }[];
  vehicle_types: { type: string; count: number }[];
  approach_foot: number;
  approach_vehicle: number;
  year_breakdown: { year: number; count: number }[];
  neighbourhoods: { name: string; count: number }[];
  cities: { name: string; count: number }[];
  map_points: MapPoint[];
}

// ── Research / pattern analysis types ────────────────────────────────────────

export interface SequenceStage {
  stage: string;
  /** 'coded' | 'provisional' | 'unset' */
  provenance: string;
}

export interface SummaryItem {
  item: string;
  provenance: string;
}

export interface CaseSummary {
  report_id: string;
  coding_status: string;
  encounter_sequence: SequenceStage[];
  encounter_sequence_string: string;
  encounter_sequence_with_provenance: string;
  mobility_summary: SummaryItem[];
  environment_summary: SummaryItem[];
  harm_summary: SummaryItem[];
  exit_summary: SummaryItem[];
  has_provisional: boolean;
}

export interface SequenceRow    { sequence: string;  count: number }
export interface PatternRow     { pattern: string;   count: number }
export interface StageRow       { stage: string;     count: number }
export interface PathwayRow     { pathway: string;   count: number }
export interface RouteRow       { route: string;     count: number }

export interface AggregateSequences {
  most_common_sequences:  SequenceRow[];
  most_common_bigrams:    PatternRow[];
  stage_frequency:        StageRow[];
  escalation_pathways:    PathwayRow[];
  per_case:               {
    report_id: string;
    sequence: string;
    stage_count: number;
    primary_incident_type: string;
    overall_severity: string;
    stage_coding_suitability: string;
    movement_relocation_present: string;
    escalation_cue: string;
    main_harms: string;
  }[];
  total_cases:            number;
}

export interface MobilityCounts {
  movement_present: number;
  movement_attempted: number;
  movement_completed: number;
  entered_vehicle: number;
  public_to_private: number;
  public_to_secluded: number;
  cross_neighbourhood: number;
  cross_municipality: number;
  cross_city: number;
  offender_controlled_high: number;
  offender_controlled_moderate: number;
}

export interface AggregateMobility {
  counts:              MobilityCounts;
  mode_breakdown:      { mode: string; count: number }[];
  recurring_pathways:  PathwayRow[];
  route_patterns:      RouteRow[];
  cross_city_pathways: PathwayRow[];
  total:               number;
}

export interface EnvCross {
  count: number;
  physical_force: number;
  sexual_assault: number;
  coercion: number;
  movement: number;
}

export interface AggregateEnvironment {
  indoor_outdoor:          Record<string, number>;
  public_private:          Record<string, number>;
  deserted:                Record<string, number>;
  location_types:          { type: string; count: number }[];
  specific_locations:      { location: string; count: number }[];
  location_mentions_total: number;
  violence_by_environment: Record<string, EnvCross>;
  movement_by_setting:     Record<string, EnvCross>;
  deserted_analysis:       Record<string, EnvCross>;
  combined_patterns:       PatternRow[];
  total:                   number;
}

export interface EncounterIndicatorCounts {
  negotiation_present: number;
  refusal_present: number;
  pressure_after_refusal: number;
  boundary_issue_present: number;
  coercion_present: number;
  threats_present: number;
  verbal_abuse: number;
  physical_force: number;
  non_consensual_substance: number;
  sexual_assault: number;
  stealthing: number;
  robbery_theft: number;
  loss_of_consciousness: number;
  forced_movement_dragging: number;
  restraint_confinement: number;
  weapon_present_used: number;
  choking_strangulation: number;
  prevented_exit: number;
  movement_relocation_present: number;
  repeated_pressure: number;
  intimidation_present: number;
  abrupt_tone_change: number;
  verbal_abuse_before_violence: number;
}

export interface AggregateEncounter {
  incident_type_distribution: { value: string; count: number }[];
  severity_distribution:      { value: string; count: number }[];
  suitability_distribution:   { value: string; count: number }[];
  clarity_distribution:       { value: string; count: number }[];
  indicator_counts:           EncounterIndicatorCounts;
  cross_tabs: {
    refusal_then_coercion:   number;
    pressure_then_force:     number;
    movement_with_harm:      number;
    substance_with_blackout: number;
  };
  total: number;
}

export interface AggregateVawgFlagCounts {
  trafficking_exploitation_concern: number;
  third_party_control_indicated: number;
  worker_appears_controlled: number;
  client_connected_to_controller: number;
  movement_to_unknown_unsafe_location: number;
  worker_unaware_how_arrived: number;
  grooming_recruitment_concern: number;
  repeat_targeting_concern: number;
  multiple_women_referenced: number;
  organized_group_offending_concern: number;
  public_safety_bulletin_suitability_positive: number;
  public_safety_urgency_urgent_high: number;
}

export interface AggregateVawgFlaggedRow {
  report_id: string;
  incident_date: string;
  city: string;
  primary_incident_type: string;
  overall_severity: string;
  public_safety_urgency_level: string;
  public_safety_bulletin_suitability: string;
  coding_status: string;
  vawg_key_excerpts: string;
  reasons: string[];
}

export interface AggregateVawg {
  flag_counts: AggregateVawgFlagCounts;
  urgency_distribution: { value: string; count: number }[];
  bulletin_suitability_distribution: { value: string; count: number }[];
  cross_tabs: {
    trafficking_with_movement: number;
    trafficking_with_substance: number;
    trafficking_with_blackout: number;
    third_party_with_unknown_location: number;
    group_offending_with_sexual_violence: number;
    bulletin_suitable_with_repeat_target: number;
  };
  cooccurrence: {
    fields: string[];
    matrix: number[][];
  };
  flagged_for_review: AggregateVawgFlaggedRow[];
  total: number;
}

export interface DataQuality {
  total_imported:         number;
  with_encounter_coded:   number;
  with_stage_coding:      number;
  with_location_coded:    number;
  with_movement_coded:    number;
  with_vawg_coded:        number;
  with_severity_coded:    number;
  with_suitability_coded: number;
  with_clarity_coded:     number;
  with_harm_coded:        number;
}

export interface ResearchAggregate {
  sequences:    AggregateSequences;
  mobility:     AggregateMobility;
  environment:  AggregateEnvironment;
  encounter:    AggregateEncounter;
  vawg:         AggregateVawg;
  data_quality: DataQuality;
  total:        number;
}

export interface MapPoint {
  report_id: string;
  lat_initial: number | null;
  lon_initial: number | null;
  lat_incident: number | null;
  lon_incident: number | null;
  lat_destination: number | null;
  lon_destination: number | null;
  // harm flags
  coercion: string;
  physical_force: string;
  sexual_assault: string;
  robbery_theft: string;
  // movement
  movement: string;
  movement_completed: string;
  entered_vehicle: string;
  mode_of_movement: string;
  offender_control_over_movement: string;
  public_to_private_shift: string;
  public_to_secluded_shift: string;
  cross_municipality: string;
  // sequence
  highest_stage_reached: string;
  // meta
  city: string;
  incident_date: string;
  coding_status: string;
  // location confidence
  location_certainty: string;
  initial_contact_city_confidence: string;
  incident_city_confidence: string;
  destination_city_confidence: string;
  // enriched for map workspace
  neighbourhood: string;
  repeat_suspect_flag: string;
  known_repeat_suspect: string;
  repeat_vehicle_flag: string;
  vehicle_present: string;
  plate_partial: string;
  suspect_distinctive_features: string;
  vehicle_description: string;
  initial_contact_address_raw: string;
  initial_contact_precision: string;
  initial_contact_geocoding_status: string;
  incident_address_raw: string;
  incident_precision: string;
  incident_geocoding_status: string;
  primary_harm: string;
}

// ── Research Notes ────────────────────────────────────────────────────────────

export interface ResearchNote {
  id: number;
  note_text: string;
  tagged_report_ids: string[];
  tagged_pattern: string;
  created_at: string;
}

// ── Linkage Patterns ──────────────────────────────────────────────────────────

export interface LinkageItem {
  descriptor: string;
  count: number;
  report_ids: string[];
  type?: string;
}

export interface LinkagePatterns {
  repeated_vehicles: LinkageItem[];
  repeated_locations: LinkageItem[];
  behavior_clusters: LinkageItem[];
}

// ── Bulletin Data ─────────────────────────────────────────────────────────────

export interface BulletinOverview {
  case_count: number;
  date_earliest: string | null;
  date_latest: string | null;
  top_cities: { city: string; count: number }[];
  location_type_dist: { type: string; count: number }[];
  coded_count: number;
  geocoded_count: number;
  harm_counts: {
    coercion: number;
    physical_force: number;
    sexual_assault: number;
    robbery_theft: number;
    threats: number;
    weapon: number;
    restraint: number;
    choking: number;
  };
}

export interface BulletinBehavioral {
  top_sequences: { sequence: string; count: number }[];
  escalation_points: [string, number][];
  top_transitions: { pattern: string; count: number }[];
}

export interface BulletinConditions {
  indoor_outdoor: Record<string, number>;
  public_private: Record<string, number>;
  deserted: Record<string, number>;
  location_types: { type: string; count: number }[];
  // Stage-level situational conditions
  total_stages_coded: number;
  visibility: Record<string, number>;
  guardianship: Record<string, number>;
  isolation_level: Record<string, number>;
  control_type: Record<string, number>;
  situational_by_stage: Record<string, any>;
}

export interface BulletinMovement {
  pct_movement: number;
  pct_entered_vehicle: number;
  pct_public_to_private: number;
  top_transitions: { route: string; count: number }[];
  common_pathways: { pathway: string; count: number }[];
}

export interface BulletinLinkage {
  repeated_plates: { descriptor: string; count: number }[];
  repeated_vehicles: { descriptor: string; count: number }[];
  repeated_locations: { descriptor: string; count: number }[];
  note: string;
}

export interface BulletinData {
  meta: {
    case_count: number;
    date_from: string | null;
    date_to: string | null;
    status: string | null;
    city: string | null;
  };
  overview: BulletinOverview;
  map_points: MapPoint[];
  behavioral: BulletinBehavioral;
  conditions: BulletinConditions;
  movement: BulletinMovement;
  linkage: BulletinLinkage;
}
