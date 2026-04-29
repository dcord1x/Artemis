from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class ReportCreate(BaseModel):
    raw_narrative: str
    source_organization: Optional[str] = ""
    source_worker_id: Optional[str] = ""
    date_received: Optional[str] = ""
    original_report_format: Optional[str] = "text"
    analyst_name: Optional[str] = ""
    coding_status: Optional[str] = "uncoded"
    confidence_level: Optional[str] = ""


class ReportUpdate(BaseModel):
    analyst_name: Optional[str] = None
    coding_status: Optional[str] = None
    confidence_level: Optional[str] = None

    # Incident basics
    incident_date: Optional[str] = None
    incident_time_exact: Optional[str] = None
    incident_time_range: Optional[str] = None
    day_of_week: Optional[str] = None
    city: Optional[str] = None
    neighbourhood: Optional[str] = None
    initial_contact_location: Optional[str] = None
    incident_location_primary: Optional[str] = None
    incident_location_secondary: Optional[str] = None
    indoor_outdoor: Optional[str] = None
    public_private: Optional[str] = None
    deserted: Optional[str] = None

    # Encounter sequence
    initial_approach_type: Optional[str] = None
    negotiation_present: Optional[str] = None
    service_discussed: Optional[str] = None
    payment_discussed: Optional[str] = None
    refusal_present: Optional[str] = None
    pressure_after_refusal: Optional[str] = None
    coercion_present: Optional[str] = None
    threats_present: Optional[str] = None
    verbal_abuse: Optional[str] = None
    physical_force: Optional[str] = None
    sexual_assault: Optional[str] = None
    robbery_theft: Optional[str] = None
    stealthing: Optional[str] = None
    loss_of_consciousness: Optional[str] = None
    non_consensual_substance: Optional[str] = None
    substance_administration_notes: Optional[str] = None
    forced_movement_dragging: Optional[str] = None
    restraint_confinement: Optional[str] = None
    weapon_present_used: Optional[str] = None
    choking_strangulation: Optional[str] = None
    prevented_exit: Optional[str] = None
    exit_type: Optional[str] = None

    # Mobility
    movement_present: Optional[str] = None
    movement_attempted: Optional[str] = None
    mode_of_movement: Optional[str] = None
    entered_vehicle: Optional[str] = None
    vehicle_driver_role: Optional[str] = None
    start_location_type: Optional[str] = None
    destination_location_type: Optional[str] = None
    public_to_private_shift: Optional[str] = None
    public_to_secluded_shift: Optional[str] = None
    cross_neighbourhood: Optional[str] = None
    cross_municipality: Optional[str] = None
    offender_control_over_movement: Optional[str] = None

    # Suspect / vehicle
    suspect_count: Optional[str] = None
    suspect_gender: Optional[str] = None
    suspect_description_text: Optional[str] = None
    suspect_race_ethnicity: Optional[str] = None
    suspect_age_estimate: Optional[str] = None
    vehicle_present: Optional[str] = None
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_colour: Optional[str] = None
    plate_partial: Optional[str] = None
    repeat_suspect_flag: Optional[str] = None
    repeat_vehicle_flag: Optional[str] = None

    # Narrative coding
    early_escalation_score: Optional[str] = None
    mobility_richness_score: Optional[str] = None
    escalation_point: Optional[str] = None
    summary_analytic: Optional[str] = None
    key_quotes: Optional[str] = None
    coder_notes: Optional[str] = None
    uncertainty_notes: Optional[str] = None
    cleaned_narrative: Optional[str] = None

    # GIS
    initial_contact_address_raw: Optional[str] = None
    incident_address_raw: Optional[str] = None
    destination_address_raw: Optional[str] = None
    geocode_status: Optional[str] = None
    lat_initial: Optional[float] = None
    lon_initial: Optional[float] = None
    lat_incident: Optional[float] = None
    lon_incident: Optional[float] = None
    lat_destination: Optional[float] = None
    lon_destination: Optional[float] = None

    # Tags
    tags: Optional[list] = None
    ai_suggestions: Optional[Any] = None

    # Provenance
    field_provenance: Optional[Any] = None
    analyst_summary: Optional[str] = None

    # Extended uncertainty
    destination_known: Optional[str] = None
    location_certainty: Optional[str] = None

    # Mobility expanded
    movement_completed: Optional[str] = None
    who_controlled_movement: Optional[str] = None
    unexplained_relocation: Optional[str] = None
    movement_confidence: Optional[str] = None
    movement_notes: Optional[str] = None

    # Encounter sequence expanded
    repeated_pressure: Optional[str] = None
    intimidation_present: Optional[str] = None
    abrupt_tone_change: Optional[str] = None
    escalation_trigger: Optional[str] = None
    verbal_abuse_before_violence: Optional[str] = None

    # GIS confidence — initial contact
    initial_contact_address_normalized: Optional[str] = None
    initial_contact_precision: Optional[str] = None
    initial_contact_source: Optional[str] = None
    initial_contact_confidence: Optional[str] = None
    initial_contact_analyst_notes: Optional[str] = None

    # GIS confidence — incident
    incident_address_normalized: Optional[str] = None
    incident_precision: Optional[str] = None
    incident_source: Optional[str] = None
    incident_confidence: Optional[str] = None
    incident_analyst_notes: Optional[str] = None

    # GIS confidence — destination
    destination_address_normalized: Optional[str] = None
    destination_precision: Optional[str] = None
    destination_source: Optional[str] = None
    destination_confidence: Optional[str] = None
    destination_analyst_notes: Optional[str] = None

    # Location-stage city fields
    initial_contact_city: Optional[str] = None
    initial_contact_city_confidence: Optional[str] = None
    incident_city: Optional[str] = None
    incident_city_confidence: Optional[str] = None
    destination_city: Optional[str] = None
    destination_city_confidence: Optional[str] = None
    cross_city_movement: Optional[str] = None


class ReportOut(BaseModel):
    id: int
    report_id: str
    raw_narrative: str
    source_organization: str
    source_worker_id: str
    date_received: str
    original_report_format: str
    analyst_name: str
    coding_status: str
    confidence_level: str

    incident_date: str
    incident_time_exact: str
    incident_time_range: str
    day_of_week: str
    city: str
    neighbourhood: str
    initial_contact_location: str
    incident_location_primary: str
    incident_location_secondary: str
    indoor_outdoor: str
    public_private: str
    deserted: str

    initial_approach_type: str
    negotiation_present: str
    service_discussed: str
    payment_discussed: str
    refusal_present: str
    pressure_after_refusal: str
    coercion_present: str
    threats_present: str
    verbal_abuse: str
    physical_force: str
    sexual_assault: str
    robbery_theft: str
    stealthing: str
    loss_of_consciousness: str
    non_consensual_substance: str
    substance_administration_notes: str
    forced_movement_dragging: str
    restraint_confinement: str
    weapon_present_used: str
    choking_strangulation: str
    prevented_exit: str
    exit_type: str

    movement_present: str
    movement_attempted: str
    mode_of_movement: str
    entered_vehicle: str
    vehicle_driver_role: str
    start_location_type: str
    destination_location_type: str
    public_to_private_shift: str
    public_to_secluded_shift: str
    cross_neighbourhood: str
    cross_municipality: str
    offender_control_over_movement: str

    suspect_count: str
    suspect_gender: str
    suspect_description_text: str
    suspect_race_ethnicity: str
    suspect_age_estimate: str
    vehicle_present: str
    vehicle_make: str
    vehicle_model: str
    vehicle_colour: str
    plate_partial: str
    repeat_suspect_flag: str
    repeat_vehicle_flag: str

    early_escalation_score: str
    mobility_richness_score: str
    escalation_point: str
    summary_analytic: str
    key_quotes: str
    coder_notes: str
    uncertainty_notes: str
    cleaned_narrative: str

    initial_contact_address_raw: str
    incident_address_raw: str
    destination_address_raw: str
    geocode_status: str
    lat_initial: Optional[float]
    lon_initial: Optional[float]
    lat_incident: Optional[float]
    lon_incident: Optional[float]
    lat_destination: Optional[float]
    lon_destination: Optional[float]

    created_at: datetime
    updated_at: datetime
    audit_log: Any
    ai_suggestions: Any
    tags: Any

    # Provenance
    field_provenance: Any
    analyst_summary: str

    # Extended uncertainty
    destination_known: str
    location_certainty: str

    # Mobility expanded
    movement_completed: str
    who_controlled_movement: str
    unexplained_relocation: str
    movement_confidence: str
    movement_notes: str

    # Encounter sequence expanded
    repeated_pressure: str
    intimidation_present: str
    abrupt_tone_change: str
    escalation_trigger: str
    verbal_abuse_before_violence: str

    # GIS confidence — initial contact
    initial_contact_address_normalized: str
    initial_contact_precision: str
    initial_contact_source: str
    initial_contact_confidence: str
    initial_contact_analyst_notes: str

    # GIS confidence — incident
    incident_address_normalized: str
    incident_precision: str
    incident_source: str
    incident_confidence: str
    incident_analyst_notes: str

    # GIS confidence — destination
    destination_address_normalized: str
    destination_precision: str
    destination_source: str
    destination_confidence: str
    destination_analyst_notes: str

    # Location-stage city fields
    initial_contact_city: str
    initial_contact_city_confidence: str
    incident_city: str
    incident_city_confidence: str
    destination_city: str
    destination_city_confidence: str
    cross_city_movement: str

    # Source provenance — PDF attachment
    source_bulletin_text: str
    source_bulletin_session_id: str

    class Config:
        from_attributes = True


class SuggestRequest(BaseModel):
    narrative: str


# ── Stage schemas ─────────────────────────────────────────────────────────────

class StageCreate(BaseModel):
    stage_order: Optional[int] = 1
    stage_type: Optional[str] = ""
    client_behaviors: Optional[list] = []
    victim_responses: Optional[list] = []
    turning_point_notes: Optional[str] = ""
    visibility: Optional[str] = ""
    guardianship: Optional[str] = ""
    isolation_level: Optional[str] = ""
    control_type: Optional[str] = ""
    location_label: Optional[str] = ""
    location_type: Optional[str] = ""
    movement_type_to_here: Optional[str] = ""


class StageUpdate(BaseModel):
    stage_order: Optional[int] = None
    stage_type: Optional[str] = None
    client_behaviors: Optional[list] = None
    victim_responses: Optional[list] = None
    turning_point_notes: Optional[str] = None
    visibility: Optional[str] = None
    guardianship: Optional[str] = None
    isolation_level: Optional[str] = None
    control_type: Optional[str] = None
    location_label: Optional[str] = None
    location_type: Optional[str] = None
    movement_type_to_here: Optional[str] = None


class StageOut(BaseModel):
    id: int
    report_id: str
    stage_order: int
    stage_type: str
    client_behaviors: Any
    victim_responses: Any
    turning_point_notes: str
    visibility: str
    guardianship: str
    isolation_level: str
    control_type: str
    location_label: str
    location_type: str
    movement_type_to_here: str

    class Config:
        from_attributes = True


class StageReorderItem(BaseModel):
    id: int
    stage_order: int
