from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, Float, DateTime, JSON, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

DATABASE_URL = f"sqlite:///{os.path.join(os.path.dirname(__file__), '..', 'redlight.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Report(Base):
    __tablename__ = "reports"

    # Source / admin
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String, unique=True, index=True)
    raw_narrative = Column(Text, nullable=False)
    source_organization = Column(String, default="")
    source_worker_id = Column(String, default="")
    date_received = Column(String, default="")
    original_report_format = Column(String, default="text")
    analyst_name = Column(String, default="")
    coding_status = Column(String, default="uncoded")  # uncoded, in_progress, coded, reviewed
    confidence_level = Column(String, default="")  # low, medium, high

    # Incident basics
    incident_date = Column(String, default="")
    incident_time_exact = Column(String, default="")
    incident_time_range = Column(String, default="")
    day_of_week = Column(String, default="")
    city = Column(String, default="")          # legacy summary field — display label "Primary case city"
    neighbourhood = Column(String, default="")

    # Location-stage city fields (replaces single city for multi-location cases)
    initial_contact_city = Column(String, default="")            # city at initial contact
    initial_contact_city_confidence = Column(String, default="") # known/probable/inferred/unknown
    incident_city = Column(String, default="")                   # city at primary incident
    incident_city_confidence = Column(String, default="")        # known/probable/inferred/unknown
    destination_city = Column(String, default="")                # city at destination/secondary location
    destination_city_confidence = Column(String, default="")     # known/probable/inferred/unknown
    cross_city_movement = Column(String, default="")             # yes/no/unclear
    initial_contact_location = Column(String, default="")
    incident_location_primary = Column(String, default="")
    incident_location_secondary = Column(String, default="")
    indoor_outdoor = Column(String, default="")  # indoor, outdoor, unclear
    public_private = Column(String, default="")  # public, private, semi-private
    deserted = Column(String, default="")  # deserted, not_deserted, unclear

    # Encounter sequence
    initial_approach_type = Column(String, default="")
    negotiation_present = Column(String, default="")
    service_discussed = Column(String, default="")
    payment_discussed = Column(String, default="")
    refusal_present = Column(String, default="")
    pressure_after_refusal = Column(String, default="")
    coercion_present = Column(String, default="")
    threats_present = Column(String, default="")
    verbal_abuse = Column(String, default="")
    physical_force = Column(String, default="")
    sexual_assault = Column(String, default="")
    robbery_theft = Column(String, default="")
    stealthing = Column(String, default="")
    loss_of_consciousness = Column(String, default="")
    non_consensual_substance = Column(String, default="")
    substance_administration_notes = Column(Text, default="")
    forced_movement_dragging = Column(String, default="")
    restraint_confinement = Column(String, default="")
    weapon_present_used = Column(String, default="")
    choking_strangulation = Column(String, default="")
    prevented_exit = Column(String, default="")
    exit_type = Column(String, default="")  # completed, escaped, abandoned, interrupted, unknown

    # Incident Overview (Encounter tab)
    primary_incident_type = Column(String, default="")
    overall_severity = Column(String, default="")
    overall_incident_summary = Column(Text, default="")
    stage_coding_suitability = Column(String, default="")
    sequence_clarity = Column(String, default="")
    boundary_issue_present = Column(String, default="")
    movement_relocation_present = Column(String, default="")
    key_supporting_excerpts = Column(Text, default="")

    # VAWG / Exploitation and Public Safety Flags (Encounter tab)
    trafficking_exploitation_concern    = Column(String, default="")
    third_party_control_indicated       = Column(String, default="")
    worker_appears_controlled           = Column(String, default="")
    client_connected_to_controller      = Column(String, default="")
    movement_to_unknown_unsafe_location = Column(String, default="")
    worker_unaware_how_arrived          = Column(String, default="")
    grooming_recruitment_concern        = Column(String, default="")
    repeat_targeting_concern            = Column(String, default="")
    multiple_women_referenced           = Column(String, default="")
    organized_group_offending_concern   = Column(String, default="")
    public_safety_bulletin_suitability  = Column(String, default="")
    public_safety_urgency_level         = Column(String, default="")
    vawg_exploitation_notes             = Column(Text, default="")
    vawg_key_excerpts                   = Column(Text, default="")

    # Mobility
    movement_present = Column(String, default="")
    movement_attempted = Column(String, default="")
    mode_of_movement = Column(String, default="")
    entered_vehicle = Column(String, default="")
    vehicle_driver_role = Column(String, default="")
    start_location_type = Column(String, default="")
    destination_location_type = Column(String, default="")
    public_to_private_shift = Column(String, default="")
    public_to_secluded_shift = Column(String, default="")
    cross_neighbourhood = Column(String, default="")
    cross_municipality = Column(String, default="")
    offender_control_over_movement = Column(String, default="")  # low, moderate, high, unclear

    # Suspect / vehicle
    suspect_count = Column(String, default="")
    suspect_gender = Column(String, default="")
    suspect_description_text = Column(Text, default="")
    suspect_race_ethnicity = Column(String, default="")
    suspect_age_estimate = Column(String, default="")
    vehicle_present = Column(String, default="")
    vehicle_make = Column(String, default="")
    vehicle_year = Column(String, default="")
    vehicle_model = Column(String, default="")
    vehicle_colour = Column(String, default="")
    vehicle_description = Column(Text, default="")
    plate_partial = Column(String, default="")
    repeat_suspect_flag = Column(String, default="")
    repeat_vehicle_flag = Column(String, default="")
    human_trafficking_flag = Column(String, default="")

    # Narrative coding
    early_escalation_score = Column(String, default="")
    mobility_richness_score = Column(String, default="")
    escalation_point = Column(String, default="")
    resolution_endpoint = Column(String, default="")     # victim escaped | offender left | assault completed | robbery completed | third-party interruption | unknown | other
    highest_stage_reached = Column(String, default="")   # no clear escalation | negotiation conflict | coercion/control | physical violence | sexual violence | robbery/theft | mixed severe harm | unknown
    turning_point = Column(String, default="")           # boundary tested | refusal ignored | pressure increased | deception/agreement shift | movement imposed | isolation increased | threat introduced | exit blocked/control asserted | physical force applied | sexual violence initiated | robbery initiated | other
    summary_analytic = Column(Text, default="")
    key_quotes = Column(Text, default="")
    coder_notes = Column(Text, default="")
    uncertainty_notes = Column(Text, default="")
    cleaned_narrative = Column(Text, default="")

    # GIS-ready
    initial_contact_address_raw = Column(String, default="")
    incident_address_raw = Column(String, default="")
    destination_address_raw = Column(String, default="")
    geocode_status = Column(String, default="")
    lat_initial = Column(Float, nullable=True)
    lon_initial = Column(Float, nullable=True)
    lat_incident = Column(Float, nullable=True)
    lon_incident = Column(Float, nullable=True)
    lat_destination = Column(Float, nullable=True)
    lon_destination = Column(Float, nullable=True)

    # Provenance
    field_provenance = Column(JSON, default=dict)   # maps field_name → "unset"|"ai_suggested"|"analyst_filled"|"reviewed"
    analyst_summary = Column(Text, default="")      # analyst interpretive summary (distinct from cleaned_narrative transcription)

    # Extended uncertainty fields
    destination_known = Column(String, default="")   # yes/no/unclear/inferred
    location_certainty = Column(String, default="")  # high/medium/low/unknown

    # Mobility — expanded
    movement_completed = Column(String, default="")       # yes/no/unclear
    who_controlled_movement = Column(String, default="")  # offender/victim/shared/unclear
    unexplained_relocation = Column(String, default="")
    movement_confidence = Column(String, default="")      # high/medium/low/unclear
    movement_notes = Column(Text, default="")

    # Encounter sequence — expanded early escalation
    repeated_pressure = Column(String, default="")             # yes/no/unclear
    intimidation_present = Column(String, default="")          # yes/no/unclear
    abrupt_tone_change = Column(String, default="")            # yes/no/unclear
    escalation_trigger = Column(Text, default="")              # free-text description
    verbal_abuse_before_violence = Column(String, default="")  # yes/no/unclear

    # GIS confidence — initial contact point
    initial_contact_address_normalized = Column(String, default="")
    initial_contact_precision = Column(String, default="")       # exact/approximate/unknown
    initial_contact_source = Column(String, default="")          # stated/inferred/unclear
    initial_contact_confidence = Column(String, default="")      # high/medium/low/none
    initial_contact_analyst_notes = Column(Text, default="")

    # GIS confidence — incident point
    incident_address_normalized = Column(String, default="")
    incident_precision = Column(String, default="")              # exact/approximate/unknown
    incident_source = Column(String, default="")                 # stated/inferred/unclear
    incident_confidence = Column(String, default="")             # high/medium/low/none
    incident_analyst_notes = Column(Text, default="")

    # GIS confidence — destination point
    destination_address_normalized = Column(String, default="")
    destination_precision = Column(String, default="")           # exact/approximate/unknown
    destination_source = Column(String, default="")              # stated/inferred/unclear
    destination_confidence = Column(String, default="")          # high/medium/low/none
    destination_analyst_notes = Column(Text, default="")

    # Source provenance — PDF attachment
    source_bulletin_text = Column(Text, default="")          # full pdfplumber extraction (all pages)
    source_bulletin_session_id = Column(String, default="")  # links to stored PDF file

    # Mobility — new fields
    movement_purpose = Column(String, default="")          # relocation to more private setting | movement during escape | etc.
    basis_for_movement_coding = Column(String, default="") # explicit narrative | inferred from sequence | inferred from GIS | etc.

    # Suspect — expanded
    suspect_distinctive_features = Column(Text, default="")
    suspect_clothing = Column(Text, default="")
    suspect_speech_notes = Column(String, default="")
    suspect_behavioural_descriptors = Column(Text, default="")
    known_repeat_suspect = Column(String, default="")

    # Vehicle — expanded
    vehicle_role_in_encounter = Column(String, default="")    # transportation only | offence location | movement/control mechanism | etc.
    vehicle_ownership_association = Column(String, default="") # suspect vehicle | victim/survivor vehicle | rideshare/taxi | etc.
    vehicle_confidence = Column(String, default="")            # high | medium | low | unclear

    # Concern flags (Suspect/Vehicle tab — replaces single human_trafficking_flag toggle)
    concern_trafficking           = Column(String, default="")
    concern_third_party_control   = Column(String, default="")
    concern_grooming              = Column(String, default="")
    concern_organized_offending   = Column(String, default="")
    concern_repeat_suspect        = Column(String, default="")
    concern_repeat_vehicle        = Column(String, default="")
    concern_urgent_public_safety  = Column(String, default="")
    concern_bulletin_suitable     = Column(String, default="")
    concern_flag_rationale        = Column(Text, default="")

    # GIS — per-block location type and geocoding status
    initial_contact_location_type    = Column(String, default="")
    incident_location_type           = Column(String, default="")
    initial_contact_geocoding_status = Column(String, default="")
    incident_geocoding_status        = Column(String, default="")
    destination_geocoding_status     = Column(String, default="")

    # Harm classification — multi-harm support
    primary_harm  = Column(String, default="")  # most analytically significant harm
    multi_harm_flag = Column(String, default="")  # yes / no / unclear — more than one harm category coded

    # Codability / Data Quality
    narrative_detail_level      = Column(String, default="")  # low/moderate/high/not_reviewed
    sequence_reconstructable    = Column(String, default="")  # yes/partial/no/unclear/not_reviewed
    movement_coding_suitability = Column(String, default="")  # full/partial/limited/not_suitable/not_reviewed
    location_coding_suitability = Column(String, default="")  # mappable/approximate/descriptive_only/not_mappable/not_reviewed
    main_data_limitation        = Column(String, default="")  # brief_narrative/vague_location/...
    data_quality_notes          = Column(Text, default="")
    initial_contact_visible     = Column(String, default="")  # yes/no/unclear
    negotiation_visible         = Column(String, default="")
    movement_visible            = Column(String, default="")
    violence_coercion_visible   = Column(String, default="")
    exit_aftermath_visible      = Column(String, default="")

    # Situation / Environment (case-level)
    primary_setting_type        = Column(String, default="")  # indoor/outdoor/mobile/mixed/unclear/not_stated
    specific_setting_type       = Column(String, default="")  # street/alley.../other/unknown
    visibility_case             = Column(String, default="")  # visible/limited_visibility/not_visible/unclear/not_stated
    isolation_case              = Column(String, default="")  # not_isolated/partially_isolated/isolated/unclear/not_stated
    guardianship_case           = Column(String, default="")  # present/limited_reduced/absent/unclear/not_stated
    access_to_help              = Column(String, default="")  # apparent/limited/absent/unclear/not_stated
    setting_control             = Column(String, default="")  # worker-controlled/client-controlled/shared/unclear/not_stated
    other_people_nearby         = Column(String, default="")  # yes/no/unclear
    security_or_business_nearby = Column(String, default="")  # yes/no/unclear
    environment_notes           = Column(Text, default="")
    environment_supporting_excerpt = Column(Text, default="")

    # Mobility — additional pattern fields
    movement_pattern_type = Column(String, default="")  # no_movement/within_same_area/public_to_vehicle/...
    movement_timing       = Column(String, default="")  # before_negotiation/after_negotiation/...

    # Narrative excerpts — topic-specific
    stage_excerpt       = Column(Text, default="")
    behaviour_excerpt   = Column(Text, default="")
    environment_excerpt = Column(Text, default="")
    movement_excerpt    = Column(Text, default="")
    uncertainty_excerpt = Column(Text, default="")

    # Case summary
    sequence_pattern = Column(String, default="")  # no_sequence_available/incident_only/contact_to_violence/...

    # GIS — mappable status
    mappable_status = Column(String, default="")  # mappable/approximate/not_mappable/withheld_sensitive/not_reviewed

    # Initial Contact / Approach
    approach_method              = Column(String, default="")  # street_approach/online_digital/referral/venue_based/unknown_unclear/other
    approach_setting             = Column(String, default="")  # public_street/online_platform/venue/private_space/unknown/other
    approach_mobility_context    = Column(String, default="")  # stationary/mobile_on_foot/mobile_in_vehicle/transitioning/unknown
    client_known_at_contact      = Column(String, default="")  # yes_known/first_contact/unclear
    initial_contact_visibility   = Column(String, default="")  # visible/limited_visibility/not_visible/unclear/not_stated
    initial_contact_guardianship = Column(String, default="")  # present/limited_reduced/absent/unclear/not_stated
    initial_contact_excerpt      = Column(Text,   default="")
    initial_contact_notes        = Column(Text,   default="")

    # Audit / meta
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    audit_log = Column(JSON, default=list)
    ai_suggestions = Column(JSON, default=dict)
    tags = Column(JSON, default=list)
    narrative_hash = Column(String(64), nullable=True, index=True)


class ReportStage(Base):
    __tablename__ = "report_stages"

    id          = Column(Integer, primary_key=True, index=True)
    report_id   = Column(String, index=True)       # FK → reports.report_id
    stage_order = Column(Integer, default=1)        # 1-based ordering within report
    stage_type  = Column(String, default="")        # initial_contact|negotiation|movement|escalation|outcome

    # Behaviours
    client_behaviors    = Column(JSON, default=list)  # ["pressure","deception","aggression","payment_dispute","condom_refusal","other"]
    victim_responses    = Column(JSON, default=list)  # ["resistance","compliance","exit_attempt","negotiation","other"]
    turning_point_notes = Column(Text, default="")

    # Situational conditions
    visibility      = Column(String, default="")  # public|semi_public|semi_private|private|unknown
    guardianship    = Column(String, default="")  # present|reduced|absent|delayed|unknown
    isolation_level = Column(String, default="")  # not_isolated|partially_isolated|isolated|unknown
    control_type    = Column(String, default="")  # victim|offender|shared|unclear

    # Location
    location_label        = Column(String, default="")  # free text e.g. "street corner", "parked car"
    location_type         = Column(String, default="")  # street_outdoor|vehicle|hotel_motel|residence|...
    movement_type_to_here = Column(String, default="")  # no_movement|worker_independent|client_picked_up|...

    # Core — escalation + excerpt (UPDATE.md)
    escalation_level   = Column(String, default="")   # no_escalation|tension_concern|coercion_control|threats|physical_violence|sexual_violence|post_incident|unknown
    supporting_excerpt = Column(Text,   default="")   # verbatim quote from the report

    # More Details — location precision
    spatial_precision  = Column(String, default="")   # exact_address|intersection|landmark|neighbourhood|approximate|unknown

    # More Details — movement impact
    movement_impact    = Column(String, default="")   # no_change|reduced_visibility|increased_isolation|reduced_ability_leave|increased_control|changed_location|unknown|other
    able_to_leave      = Column(String, default="")   # yes|limited_unclear|no|unknown

    # More Details — coding notes
    coder_notes_stage       = Column(String, default="")  # stage-level coder notes (distinct from report-level coder_notes)
    coding_confidence       = Column(String, default="")  # high|moderate|low|not_enough_info
    temporal_sequence_note  = Column(Text,   default="")  # ordering/temporal context note

    # Stage visibility and certainty (PhD methodology)
    stage_visible   = Column(String, default="")  # present|absent|unclear|not_applicable
    stage_certainty = Column(String, default="")  # clear|partial|inferred|unclear|not_enough_information

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CaseLinkage(Base):
    __tablename__ = "case_linkages"

    id = Column(Integer, primary_key=True, index=True)
    report_id_a = Column(String, index=True)
    report_id_b = Column(String, index=True)
    similarity_score = Column(Float, default=0.0)
    score_breakdown = Column(JSON, default=dict)
    analyst_status = Column(String, default="")   # possible_link | unlikely_link | needs_review
    analyst_notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ResearchNote(Base):
    __tablename__ = "research_notes"

    id = Column(Integer, primary_key=True, index=True)
    note_text = Column(Text, default="")
    tagged_report_ids = Column(JSON, default=list)   # list of report_id strings
    tagged_pattern = Column(String, default="")       # e.g. "stage:escalation visibility:private"
    created_at = Column(DateTime, default=datetime.utcnow)


def init_db():
    Base.metadata.create_all(bind=engine)
    # Safe migrations: add new columns if they don't exist yet
    _new_columns = [
        ("cleaned_narrative", "TEXT DEFAULT ''"),
        ("escalation_point", "VARCHAR DEFAULT ''"),
        # Provenance
        ("field_provenance", "TEXT DEFAULT '{}'"),
        ("analyst_summary", "TEXT DEFAULT ''"),
        # Extended uncertainty
        ("destination_known", "VARCHAR DEFAULT ''"),
        ("location_certainty", "VARCHAR DEFAULT ''"),
        # Mobility expanded
        ("movement_completed", "VARCHAR DEFAULT ''"),
        ("who_controlled_movement", "VARCHAR DEFAULT ''"),
        ("movement_confidence", "VARCHAR DEFAULT ''"),
        ("movement_notes", "TEXT DEFAULT ''"),
        # Encounter sequence expanded
        ("repeated_pressure", "VARCHAR DEFAULT ''"),
        ("intimidation_present", "VARCHAR DEFAULT ''"),
        ("abrupt_tone_change", "VARCHAR DEFAULT ''"),
        ("escalation_trigger", "TEXT DEFAULT ''"),
        ("verbal_abuse_before_violence", "VARCHAR DEFAULT ''"),
        # GIS confidence — initial contact
        ("initial_contact_address_normalized", "VARCHAR DEFAULT ''"),
        ("initial_contact_precision", "VARCHAR DEFAULT ''"),
        ("initial_contact_source", "VARCHAR DEFAULT ''"),
        ("initial_contact_confidence", "VARCHAR DEFAULT ''"),
        ("initial_contact_analyst_notes", "TEXT DEFAULT ''"),
        # GIS confidence — incident
        ("incident_address_normalized", "VARCHAR DEFAULT ''"),
        ("incident_precision", "VARCHAR DEFAULT ''"),
        ("incident_source", "VARCHAR DEFAULT ''"),
        ("incident_confidence", "VARCHAR DEFAULT ''"),
        ("incident_analyst_notes", "TEXT DEFAULT ''"),
        # GIS confidence — destination
        ("destination_address_normalized", "VARCHAR DEFAULT ''"),
        ("destination_precision", "VARCHAR DEFAULT ''"),
        ("destination_source", "VARCHAR DEFAULT ''"),
        ("destination_confidence", "VARCHAR DEFAULT ''"),
        ("destination_analyst_notes", "TEXT DEFAULT ''"),
        # Location-stage city fields
        ("initial_contact_city", "VARCHAR DEFAULT ''"),
        ("initial_contact_city_confidence", "VARCHAR DEFAULT ''"),
        ("incident_city", "VARCHAR DEFAULT ''"),
        ("incident_city_confidence", "VARCHAR DEFAULT ''"),
        ("destination_city", "VARCHAR DEFAULT ''"),
        ("destination_city_confidence", "VARCHAR DEFAULT ''"),
        ("cross_city_movement", "VARCHAR DEFAULT ''"),
        # Deduplication
        ("narrative_hash", "VARCHAR(64) DEFAULT NULL"),
        # PDF provenance
        ("source_bulletin_text", "TEXT DEFAULT ''"),
        ("source_bulletin_session_id", "VARCHAR DEFAULT ''"),
        # Suspect / vehicle expanded
        ("vehicle_present", "VARCHAR DEFAULT ''"),
        ("vehicle_make", "VARCHAR DEFAULT ''"),
        ("vehicle_year", "VARCHAR DEFAULT ''"),
        ("vehicle_model", "VARCHAR DEFAULT ''"),
        ("vehicle_colour", "VARCHAR DEFAULT ''"),
        ("vehicle_description", "TEXT DEFAULT ''"),
        ("plate_partial", "VARCHAR DEFAULT ''"),
        ("repeat_suspect_flag", "VARCHAR DEFAULT ''"),
        ("repeat_vehicle_flag", "VARCHAR DEFAULT ''"),
        ("human_trafficking_flag", "VARCHAR DEFAULT ''"),
        # Suspect info
        ("suspect_count", "VARCHAR DEFAULT ''"),
        ("suspect_gender", "VARCHAR DEFAULT ''"),
        ("suspect_description_text", "TEXT DEFAULT ''"),
        ("suspect_race_ethnicity", "VARCHAR DEFAULT ''"),
        ("suspect_age_estimate", "VARCHAR DEFAULT ''"),
        # Encounter sequence (base)
        ("stealthing", "VARCHAR DEFAULT ''"),
        ("exit_type", "VARCHAR DEFAULT ''"),
        ("initial_approach_type", "VARCHAR DEFAULT ''"),
        ("negotiation_present", "VARCHAR DEFAULT ''"),
        ("service_discussed", "VARCHAR DEFAULT ''"),
        ("payment_discussed", "VARCHAR DEFAULT ''"),
        ("refusal_present", "VARCHAR DEFAULT ''"),
        ("pressure_after_refusal", "VARCHAR DEFAULT ''"),
        ("coercion_present", "VARCHAR DEFAULT ''"),
        ("threats_present", "VARCHAR DEFAULT ''"),
        ("verbal_abuse", "VARCHAR DEFAULT ''"),
        ("physical_force", "VARCHAR DEFAULT ''"),
        ("sexual_assault", "VARCHAR DEFAULT ''"),
        ("robbery_theft", "VARCHAR DEFAULT ''"),
        # Mobility (base)
        ("movement_present", "VARCHAR DEFAULT ''"),
        ("movement_attempted", "VARCHAR DEFAULT ''"),
        ("mode_of_movement", "VARCHAR DEFAULT ''"),
        ("entered_vehicle", "VARCHAR DEFAULT ''"),
        ("vehicle_driver_role", "VARCHAR DEFAULT ''"),
        ("start_location_type", "VARCHAR DEFAULT ''"),
        ("destination_location_type", "VARCHAR DEFAULT ''"),
        ("public_to_private_shift", "VARCHAR DEFAULT ''"),
        ("public_to_secluded_shift", "VARCHAR DEFAULT ''"),
        ("cross_neighbourhood", "VARCHAR DEFAULT ''"),
        ("cross_municipality", "VARCHAR DEFAULT ''"),
        ("offender_control_over_movement", "VARCHAR DEFAULT ''"),
        # Location (base)
        ("initial_contact_location", "VARCHAR DEFAULT ''"),
        ("incident_location_primary", "VARCHAR DEFAULT ''"),
        ("incident_location_secondary", "VARCHAR DEFAULT ''"),
        ("indoor_outdoor", "VARCHAR DEFAULT ''"),
        ("public_private", "VARCHAR DEFAULT ''"),
        ("deserted", "VARCHAR DEFAULT ''"),
        # Narrative coding (base)
        ("early_escalation_score", "VARCHAR DEFAULT ''"),
        ("mobility_richness_score", "VARCHAR DEFAULT ''"),
        ("summary_analytic", "TEXT DEFAULT ''"),
        ("key_quotes", "TEXT DEFAULT ''"),
        ("coder_notes", "TEXT DEFAULT ''"),
        ("uncertainty_notes", "TEXT DEFAULT ''"),
        # GIS (base)
        ("initial_contact_address_raw", "VARCHAR DEFAULT ''"),
        ("incident_address_raw", "VARCHAR DEFAULT ''"),
        ("destination_address_raw", "VARCHAR DEFAULT ''"),
        ("geocode_status", "VARCHAR DEFAULT ''"),
        ("lat_initial", "REAL"),
        ("lon_initial", "REAL"),
        ("lat_incident", "REAL"),
        ("lon_incident", "REAL"),
        ("lat_destination", "REAL"),
        ("lon_destination", "REAL"),
        # Admin (base)
        ("confidence_level", "VARCHAR DEFAULT ''"),
        ("incident_time_exact", "VARCHAR DEFAULT ''"),
        ("incident_time_range", "VARCHAR DEFAULT ''"),
        ("day_of_week", "VARCHAR DEFAULT ''"),
        ("neighbourhood", "VARCHAR DEFAULT ''"),
        # Violence indicators
        ("loss_of_consciousness", "VARCHAR DEFAULT ''"),
        ("non_consensual_substance", "VARCHAR DEFAULT ''"),
        ("substance_administration_notes", "TEXT DEFAULT ''"),
        ("forced_movement_dragging", "VARCHAR DEFAULT ''"),
        ("restraint_confinement", "VARCHAR DEFAULT ''"),
        ("weapon_present_used", "VARCHAR DEFAULT ''"),
        ("choking_strangulation", "VARCHAR DEFAULT ''"),
        ("prevented_exit", "VARCHAR DEFAULT ''"),
        # Mobility expanded
        ("unexplained_relocation", "VARCHAR DEFAULT ''"),
        ("resolution_endpoint", "VARCHAR DEFAULT ''"),
        ("highest_stage_reached", "VARCHAR DEFAULT ''"),
        ("turning_point", "VARCHAR DEFAULT ''"),
        # Incident Overview (Encounter tab)
        ("primary_incident_type", "VARCHAR DEFAULT ''"),
        ("overall_severity", "VARCHAR DEFAULT ''"),
        ("overall_incident_summary", "TEXT DEFAULT ''"),
        ("stage_coding_suitability", "VARCHAR DEFAULT ''"),
        ("sequence_clarity", "VARCHAR DEFAULT ''"),
        ("boundary_issue_present", "VARCHAR DEFAULT ''"),
        ("movement_relocation_present", "VARCHAR DEFAULT ''"),
        ("key_supporting_excerpts", "TEXT DEFAULT ''"),
        # VAWG / Exploitation and Public Safety Flags
        ("trafficking_exploitation_concern",    "VARCHAR DEFAULT ''"),
        ("third_party_control_indicated",       "VARCHAR DEFAULT ''"),
        ("worker_appears_controlled",           "VARCHAR DEFAULT ''"),
        ("client_connected_to_controller",      "VARCHAR DEFAULT ''"),
        ("movement_to_unknown_unsafe_location", "VARCHAR DEFAULT ''"),
        ("worker_unaware_how_arrived",          "VARCHAR DEFAULT ''"),
        ("grooming_recruitment_concern",        "VARCHAR DEFAULT ''"),
        ("repeat_targeting_concern",            "VARCHAR DEFAULT ''"),
        ("multiple_women_referenced",           "VARCHAR DEFAULT ''"),
        ("organized_group_offending_concern",   "VARCHAR DEFAULT ''"),
        ("public_safety_bulletin_suitability",  "VARCHAR DEFAULT ''"),
        ("public_safety_urgency_level",         "VARCHAR DEFAULT ''"),
        ("vawg_exploitation_notes",             "TEXT DEFAULT ''"),
        ("vawg_key_excerpts",                   "TEXT DEFAULT ''"),
        # Mobility new
        ("movement_purpose",                    "VARCHAR DEFAULT ''"),
        ("basis_for_movement_coding",           "VARCHAR DEFAULT ''"),
        # Suspect expanded
        ("suspect_distinctive_features",        "TEXT DEFAULT ''"),
        ("suspect_clothing",                    "TEXT DEFAULT ''"),
        ("suspect_speech_notes",                "VARCHAR DEFAULT ''"),
        ("suspect_behavioural_descriptors",     "TEXT DEFAULT ''"),
        ("known_repeat_suspect",                "VARCHAR DEFAULT ''"),
        # Vehicle expanded
        ("vehicle_role_in_encounter",           "VARCHAR DEFAULT ''"),
        ("vehicle_ownership_association",       "VARCHAR DEFAULT ''"),
        ("vehicle_confidence",                  "VARCHAR DEFAULT ''"),
        # Concern flags
        ("concern_trafficking",                 "VARCHAR DEFAULT ''"),
        ("concern_third_party_control",         "VARCHAR DEFAULT ''"),
        ("concern_grooming",                    "VARCHAR DEFAULT ''"),
        ("concern_organized_offending",         "VARCHAR DEFAULT ''"),
        ("concern_repeat_suspect",              "VARCHAR DEFAULT ''"),
        ("concern_repeat_vehicle",              "VARCHAR DEFAULT ''"),
        ("concern_urgent_public_safety",        "VARCHAR DEFAULT ''"),
        ("concern_bulletin_suitable",           "VARCHAR DEFAULT ''"),
        ("concern_flag_rationale",              "TEXT DEFAULT ''"),
        # GIS per-block
        ("initial_contact_location_type",       "VARCHAR DEFAULT ''"),
        ("incident_location_type",              "VARCHAR DEFAULT ''"),
        ("initial_contact_geocoding_status",    "VARCHAR DEFAULT ''"),
        ("incident_geocoding_status",           "VARCHAR DEFAULT ''"),
        ("destination_geocoding_status",        "VARCHAR DEFAULT ''"),
        # Harm classification
        ("primary_harm",                        "VARCHAR DEFAULT ''"),
        ("multi_harm_flag",                     "VARCHAR DEFAULT ''"),
        # Codability / Data Quality
        ("narrative_detail_level",              "VARCHAR DEFAULT ''"),
        ("sequence_reconstructable",            "VARCHAR DEFAULT ''"),
        ("movement_coding_suitability",         "VARCHAR DEFAULT ''"),
        ("location_coding_suitability",         "VARCHAR DEFAULT ''"),
        ("main_data_limitation",                "VARCHAR DEFAULT ''"),
        ("data_quality_notes",                  "TEXT DEFAULT ''"),
        ("initial_contact_visible",             "VARCHAR DEFAULT ''"),
        ("negotiation_visible",                 "VARCHAR DEFAULT ''"),
        ("movement_visible",                    "VARCHAR DEFAULT ''"),
        ("violence_coercion_visible",           "VARCHAR DEFAULT ''"),
        ("exit_aftermath_visible",              "VARCHAR DEFAULT ''"),
        # Situation / Environment
        ("primary_setting_type",                "VARCHAR DEFAULT ''"),
        ("specific_setting_type",               "VARCHAR DEFAULT ''"),
        ("visibility_case",                     "VARCHAR DEFAULT ''"),
        ("isolation_case",                      "VARCHAR DEFAULT ''"),
        ("guardianship_case",                   "VARCHAR DEFAULT ''"),
        ("access_to_help",                      "VARCHAR DEFAULT ''"),
        ("setting_control",                     "VARCHAR DEFAULT ''"),
        ("other_people_nearby",                 "VARCHAR DEFAULT ''"),
        ("security_or_business_nearby",         "VARCHAR DEFAULT ''"),
        ("environment_notes",                   "TEXT DEFAULT ''"),
        ("environment_supporting_excerpt",      "TEXT DEFAULT ''"),
        # Mobility pattern
        ("movement_pattern_type",               "VARCHAR DEFAULT ''"),
        ("movement_timing",                     "VARCHAR DEFAULT ''"),
        # Narrative excerpts
        ("stage_excerpt",                       "TEXT DEFAULT ''"),
        ("behaviour_excerpt",                   "TEXT DEFAULT ''"),
        ("environment_excerpt",                 "TEXT DEFAULT ''"),
        ("movement_excerpt",                    "TEXT DEFAULT ''"),
        ("uncertainty_excerpt",                 "TEXT DEFAULT ''"),
        # Case summary
        ("sequence_pattern",                    "VARCHAR DEFAULT ''"),
        # GIS
        ("mappable_status",                     "VARCHAR DEFAULT ''"),
        # Initial Contact / Approach
        ("approach_method",                     "VARCHAR DEFAULT ''"),
        ("approach_setting",                    "VARCHAR DEFAULT ''"),
        ("approach_mobility_context",           "VARCHAR DEFAULT ''"),
        ("client_known_at_contact",             "VARCHAR DEFAULT ''"),
        ("initial_contact_visibility",          "VARCHAR DEFAULT ''"),
        ("initial_contact_guardianship",        "VARCHAR DEFAULT ''"),
        ("initial_contact_excerpt",             "TEXT DEFAULT ''"),
        ("initial_contact_notes",               "TEXT DEFAULT ''"),
    ]
    with engine.connect() as conn:
        for col_name, col_def in _new_columns:
            try:
                conn.execute(text(f"ALTER TABLE reports ADD COLUMN {col_name} {col_def}"))
                conn.commit()
            except Exception:
                pass  # column already exists

    # Safe migrations for report_stages
    _stage_new_columns = [
        ("escalation_level",       "VARCHAR DEFAULT ''"),
        ("supporting_excerpt",     "TEXT DEFAULT ''"),
        ("spatial_precision",      "VARCHAR DEFAULT ''"),
        ("movement_impact",        "VARCHAR DEFAULT ''"),
        ("able_to_leave",          "VARCHAR DEFAULT ''"),
        ("coder_notes_stage",      "VARCHAR DEFAULT ''"),
        ("coding_confidence",      "VARCHAR DEFAULT ''"),
        ("temporal_sequence_note", "TEXT DEFAULT ''"),
        ("stage_visible",          "VARCHAR DEFAULT ''"),
        ("stage_certainty",        "VARCHAR DEFAULT ''"),
    ]
    with engine.connect() as conn:
        for col_name, col_def in _stage_new_columns:
            try:
                conn.execute(text(f"ALTER TABLE report_stages ADD COLUMN {col_name} {col_def}"))
                conn.commit()
            except Exception:
                pass  # column already exists


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
