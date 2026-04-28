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
    exit_type = Column(String, default="")  # completed, escaped, abandoned, interrupted, unknown

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
    vehicle_model = Column(String, default="")
    vehicle_colour = Column(String, default="")
    plate_partial = Column(String, default="")
    repeat_suspect_flag = Column(String, default="")
    repeat_vehicle_flag = Column(String, default="")

    # Narrative coding
    early_escalation_score = Column(String, default="")
    mobility_richness_score = Column(String, default="")
    escalation_point = Column(String, default="")
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
    location_type         = Column(String, default="")  # public|semi_public|private|unknown
    movement_type_to_here = Column(String, default="")  # none|walk|vehicle|unknown

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
    ]
    with engine.connect() as conn:
        for col_name, col_def in _new_columns:
            try:
                conn.execute(text(f"ALTER TABLE reports ADD COLUMN {col_name} {col_def}"))
                conn.commit()
            except Exception:
                pass  # column already exists


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
