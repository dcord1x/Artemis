from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text
from typing import Optional
import csv
import io
import json
import uuid
import os
from datetime import datetime

from models import Report, CaseLinkage, init_db, get_db
from schemas import ReportCreate, ReportUpdate, ReportOut, SuggestRequest
from ai import get_ai_suggestions, parse_bulletin
from parser import parse_bulletin_rules
from similarity import compute_similarity

app = FastAPI(title="Red Light Alert API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


# ── Reports CRUD ──────────────────────────────────────────────────────────────

_VALID_NLP_PATTERNS = {
    'condom_refusal', 'payment_dispute', 'bait_and_switch',
    'rapid_escalation', 'weapon_present', 'multi_suspect', 'online_lure',
    'drugging_intoxication', 'confinement',
}


@app.get("/reports", response_model=list[ReportOut])
def list_reports(
    coding_status: Optional[str] = None,
    city: Optional[str] = None,
    coercion_present: Optional[str] = None,
    movement_present: Optional[str] = None,
    physical_force: Optional[str] = None,
    sexual_assault: Optional[str] = None,
    threats_present: Optional[str] = None,
    vehicle_present: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    # NLP signal filters (drill-down from Analysis page)
    nlp_coercion: Optional[str] = None,      # "1" = strong only, "2" = strong+possible
    nlp_physical: Optional[str] = None,
    nlp_sexual: Optional[str] = None,
    nlp_movement: Optional[str] = None,
    nlp_weapon: Optional[str] = None,
    nlp_escalation_min: Optional[str] = None, # minimum escalation score (1–5)
    nlp_pattern: Optional[str] = None,        # named pattern, e.g. "weapon_present"
    cross_city_movement: Optional[str] = None, # yes/no/unclear
    db: Session = Depends(get_db),
):
    q = db.query(Report)
    if coding_status:
        q = q.filter(Report.coding_status == coding_status)
    if city:
        # Search across all city fields — legacy summary + stage-specific
        q = q.filter(
            Report.city.ilike(f"%{city}%") |
            Report.initial_contact_city.ilike(f"%{city}%") |
            Report.incident_city.ilike(f"%{city}%") |
            Report.destination_city.ilike(f"%{city}%")
        )
    if coercion_present:
        q = q.filter(Report.coercion_present == coercion_present)
    if movement_present:
        q = q.filter(Report.movement_present == movement_present)
    if physical_force:
        q = q.filter(Report.physical_force == physical_force)
    if sexual_assault:
        q = q.filter(Report.sexual_assault == sexual_assault)
    if threats_present:
        q = q.filter(Report.threats_present == threats_present)
    if vehicle_present:
        q = q.filter(Report.vehicle_present == vehicle_present)
    if date_from:
        q = q.filter(Report.incident_date >= date_from)
    if date_to:
        q = q.filter(Report.incident_date <= date_to)
    if search:
        q = q.filter(
            Report.raw_narrative.ilike(f"%{search}%") |
            Report.suspect_description_text.ilike(f"%{search}%") |
            Report.vehicle_make.ilike(f"%{search}%") |
            Report.plate_partial.ilike(f"%{search}%")
        )
    # NLP signal filters — JSON path extraction (SQLite json_extract)
    _nlp_rank_fields = [
        (nlp_coercion,  '$.nlp.coercion_rank'),
        (nlp_physical,  '$.nlp.physical_rank'),
        (nlp_sexual,    '$.nlp.sexual_rank'),
        (nlp_movement,  '$.nlp.movement_rank'),
        (nlp_weapon,    '$.nlp.weapon_rank'),
    ]
    for rank_param, json_path in _nlp_rank_fields:
        if rank_param:
            try:
                rank_val = int(rank_param)
            except ValueError:
                continue
            q = q.filter(sql_text(
                f"json_extract(ai_suggestions, '{json_path}') IS NOT NULL AND "
                f"CAST(json_extract(ai_suggestions, '{json_path}') AS INTEGER) <= {rank_val}"
            ))
    if nlp_escalation_min:
        try:
            min_score = int(nlp_escalation_min)
            q = q.filter(sql_text(
                f"json_extract(ai_suggestions, '$.nlp.escalation.score') IS NOT NULL AND "
                f"CAST(json_extract(ai_suggestions, '$.nlp.escalation.score') AS INTEGER) >= {min_score}"
            ))
        except ValueError:
            pass
    if nlp_pattern and nlp_pattern in _VALID_NLP_PATTERNS:
        q = q.filter(sql_text(
            f"ai_suggestions LIKE '%\"{nlp_pattern}\"%'"
        ))
    if cross_city_movement:
        q = q.filter(Report.cross_city_movement == cross_city_movement)
    return q.order_by(Report.created_at.desc()).all()


@app.post("/reports", response_model=ReportOut)
def create_report(data: ReportCreate, db: Session = Depends(get_db)):
    report_id = f"RLA-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"
    report = Report(report_id=report_id, **data.model_dump())
    report.audit_log = [{"ts": datetime.utcnow().isoformat(), "action": "created", "by": data.analyst_name or "system"}]
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@app.get("/reports/{report_id}", response_model=ReportOut)
def get_report(report_id: str, db: Session = Depends(get_db)):
    r = db.query(Report).filter(Report.report_id == report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    return r


@app.patch("/reports/{report_id}", response_model=ReportOut)
def update_report(report_id: str, data: ReportUpdate, db: Session = Depends(get_db)):
    r = db.query(Report).filter(Report.report_id == report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")

    update_data = data.model_dump(exclude_unset=True)
    log = r.audit_log or []

    for key, val in update_data.items():
        old = getattr(r, key, None)
        if old != val:
            log.append({
                "ts": datetime.utcnow().isoformat(),
                "action": "updated",
                "field": key,
                "from": str(old),
                "to": str(val),
                "by": data.analyst_name or "system",
            })
            setattr(r, key, val)

    r.audit_log = log
    r.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(r)
    return r


@app.delete("/reports/{report_id}")
def delete_report(report_id: str, db: Session = Depends(get_db)):
    r = db.query(Report).filter(Report.report_id == report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    db.delete(r)
    db.commit()
    return {"ok": True}


# ── AI suggestions ────────────────────────────────────────────────────────────

@app.post("/suggest")
async def suggest(data: SuggestRequest):
    suggestions = await get_ai_suggestions(data.narrative)
    return suggestions


@app.post("/reports/{report_id}/analyze")
def analyze_report(report_id: str, db: Session = Depends(get_db)):
    """
    Run spaCy NLP analysis + weather fetch on a report and update ai_suggestions.
    Weather is only fetched when the report has an exact incident_date and city.
    """
    from nlp_analysis import analyze_narrative
    from weather import fetch_weather
    r = db.query(Report).filter(Report.report_id == report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")

    result = analyze_narrative(r.raw_narrative or "")

    # Resolve hour from incident_time_exact (HH:MM) for hourly weather lookup
    weather_hour: int | None = None
    if r.incident_time_exact:
        try:
            weather_hour = int(r.incident_time_exact.split(":")[0])
        except (ValueError, IndexError):
            pass

    # Fetch historical weather when we have a real date (not vague/range) and city
    weather_data: dict = {}
    date_certainty = (result.get("nlp", {}) or {}).get("date_certainty", "")
    if (
        r.incident_date
        and len(r.incident_date) == 10
        and (r.incident_city or r.city)
        and date_certainty not in ("vague", "range")
    ):
        weather_city = r.incident_city or r.city
        weather_data = fetch_weather(r.incident_date, weather_city, hour=weather_hour)
        if "error" in weather_data:
            weather_data = {"error": weather_data["error"]}

    if weather_data:
        result["weather"] = weather_data

    # Stamp provenance so the frontend can verify the NLP data belongs to this report
    if "nlp" in result and isinstance(result["nlp"], dict):
        result["nlp"]["_source_report_id"] = report_id
        result["nlp"]["_analyzed_at"] = datetime.utcnow().isoformat()

    # Merge into existing ai_suggestions, preserving any other keys
    existing = r.ai_suggestions or {}
    existing.update(result)
    r.ai_suggestions = existing
    r.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(r)
    return {"ok": True, "ai_suggestions": r.ai_suggestions}


# ── Bulletin import ───────────────────────────────────────────────────────────

@app.post("/parse-bulletin")
async def parse_bulletin_endpoint(file: UploadFile = File(...)):
    """
    Parse a Red Light Alert bulletin PDF into individual incident records.
    Uses AI (Claude) if ANTHROPIC_API_KEY is set, otherwise falls back to
    rule-based PDF column detection + regex extraction.
    """
    content = await file.read()
    filename = file.filename or ""
    has_api_key = bool(os.environ.get("ANTHROPIC_API_KEY"))

    if filename.lower().endswith(".pdf"):
        if has_api_key:
            # AI path: extract full text then send to Claude
            import tempfile, pdfplumber
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            try:
                text_pages = []
                with pdfplumber.open(tmp_path) as pdf:
                    for page in pdf.pages:
                        t = page.extract_text()
                        if t:
                            text_pages.append(t)
                bulletin_text = "\n\n".join(text_pages)
            finally:
                os.unlink(tmp_path)
            try:
                incidents = await parse_bulletin(bulletin_text)
                return {"incidents": incidents, "total": len(incidents), "method": "ai"}
            except ValueError as e:
                raise HTTPException(400, str(e))
        else:
            # Rule-based path: use PDF column detection + regex
            incidents = parse_bulletin_rules(content)
            return {"incidents": incidents, "total": len(incidents), "method": "rules"}
    else:
        # Plain text — always use AI if available, else return error
        bulletin_text = content.decode("utf-8", errors="replace")
        if not has_api_key:
            raise HTTPException(400, "Plain text import requires an AI API key. Upload a PDF instead, or add your ANTHROPIC_API_KEY.")
        try:
            incidents = await parse_bulletin(bulletin_text)
            return {"incidents": incidents, "total": len(incidents), "method": "ai"}
        except ValueError as e:
            raise HTTPException(400, str(e))


@app.post("/parse-excel")
async def parse_excel_endpoint(file: UploadFile = File(...)):
    """
    Parse an Excel dataset (same column layout as DTE DATASET for QGIS.xlsx)
    into individual incident records for preview before bulk-save.
    """
    import tempfile
    import openpyxl
    from import_excel import (
        parse_date, parse_time, parse_vehicle, parse_locations,
        clean_city, extract_neighbourhood, parse_suspect_count, parse_gender,
    )

    content = await file.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        wb = openpyxl.load_workbook(tmp_path, read_only=True, data_only=True)
        ws = wb["All Incidents"] if "All Incidents" in wb.sheetnames else wb.active
        rows = list(ws.iter_rows(values_only=True))
    finally:
        os.unlink(tmp_path)

    data_rows = rows[1:]  # skip header row
    incidents = []

    for row in data_rows:
        def _cell(idx):
            return row[idx] if len(row) > idx else None

        synopsis_raw      = _cell(9)
        synopsis = str(synopsis_raw).strip() if synopsis_raw else ""
        if not synopsis or synopsis.lower() == "none":
            continue

        incident_date_raw = _cell(0)
        time_raw          = _cell(2)
        date_reported_raw = _cell(3)
        city_raw          = _cell(4)
        location_raw      = _cell(5)
        description_raw   = _cell(7)
        vehicle_raw       = _cell(8)

        description   = str(description_raw).strip() if description_raw else ""
        vehicle_text  = str(vehicle_raw).strip()     if vehicle_raw     else ""
        location_text = str(location_raw).strip()    if location_raw    else ""

        veh  = parse_vehicle(vehicle_text)
        locs = parse_locations(location_text, synopsis)

        incidents.append({
            "raw_narrative":              synopsis,
            "entry_type":                 "incident",
            "bulletin_date":              parse_date(date_reported_raw),
            "source_organization":        "Red Light Alert",
            "incident_date":              parse_date(incident_date_raw),
            "date_reported":              parse_date(date_reported_raw),
            "city":                       clean_city(city_raw),
            "neighbourhood":              extract_neighbourhood(location_text),
            "initial_contact_location":   locs["contact"],
            "incident_location_primary":  locs["incident"],
            # Violence fields intentionally blank — researcher codes these
            "coercion_present": "", "threats_present": "", "physical_force": "",
            "sexual_assault":   "", "robbery_theft":   "", "stealthing":     "",
            "movement_present": "", "entered_vehicle":  "",
            "suspect_count":              parse_suspect_count(description),
            "suspect_gender":             parse_gender(description),
            "suspect_description_text":   description,
            "suspect_race_ethnicity": "", "suspect_age_estimate": "", "suspect_name": "",
            "vehicle_present":  veh.get("vehicle_present", ""),
            "vehicle_make":     veh.get("vehicle_make",    ""),
            "vehicle_model":    veh.get("vehicle_model",   ""),
            "vehicle_colour":   veh.get("vehicle_colour",  ""),
            "plate_partial":    veh.get("plate_partial",   ""),
            "summary_analytic": "",
            "flags": [],
        })

    return {"incidents": incidents, "total": len(incidents), "method": "excel"}


from pydantic import BaseModel as PydanticBaseModel

class VisualizeRequest(PydanticBaseModel):
    text: str


@app.post("/nlp/visualize")
def visualize_parse(data: VisualizeRequest):
    """
    Run a text snippet through spaCy and return displaCy SVG/HTML for both
    the dependency parse (dep) and named entity recognition (ent) views.
    Used to verify SVO pattern matching and negation detection.
    """
    from spacy import displacy
    from nlp_analysis import nlp_model

    text = (data.text or "").strip()[:2000]  # truncate — long texts produce unusable SVGs
    if not text:
        raise HTTPException(status_code=400, detail="text must not be empty")
    if nlp_model is None:
        raise HTTPException(status_code=503, detail="spaCy model not loaded")

    doc = nlp_model(text)
    return {
        "dep_html": displacy.render(doc, style="dep", page=False, minify=True),
        "ent_html": displacy.render(doc, style="ent", page=False, minify=True),
    }


class BulkSaveRequest(PydanticBaseModel):
    incidents: list[dict]
    analyst_name: str = ""
    source_organization: str = ""


@app.post("/bulk-save")
def bulk_save(data: BulkSaveRequest, db: Session = Depends(get_db)):
    """Save a list of pre-parsed incidents as draft reports."""
    saved = []
    for inc in data.incidents:
        report_id = f"RLA-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"
        raw = inc.get("raw_narrative", "")
        if not raw.strip():
            continue

        report = Report(
            report_id=report_id,
            raw_narrative=raw,
            source_organization=inc.get("source_organization") or data.source_organization,
            analyst_name=data.analyst_name,
            date_received=inc.get("bulletin_date") or datetime.utcnow().strftime("%Y-%m-%d"),
            coding_status="uncoded",
            incident_date=inc.get("incident_date", ""),
            city=inc.get("city", ""),
            neighbourhood=inc.get("neighbourhood", ""),
            initial_contact_location=inc.get("initial_contact_location", ""),
            incident_location_primary=inc.get("incident_location_primary", ""),
            indoor_outdoor=inc.get("indoor_outdoor", ""),
            public_private=inc.get("public_private", ""),
            initial_approach_type=inc.get("initial_approach_type", ""),
            negotiation_present=inc.get("negotiation_present", ""),
            refusal_present=inc.get("refusal_present", ""),
            pressure_after_refusal=inc.get("pressure_after_refusal", ""),
            coercion_present=inc.get("coercion_present", ""),
            threats_present=inc.get("threats_present", ""),
            verbal_abuse=inc.get("verbal_abuse", ""),
            physical_force=inc.get("physical_force", ""),
            sexual_assault=inc.get("sexual_assault", ""),
            robbery_theft=inc.get("robbery_theft", ""),
            stealthing=inc.get("stealthing", ""),
            exit_type=inc.get("exit_type", ""),
            movement_present=inc.get("movement_present", ""),
            movement_attempted=inc.get("movement_attempted", ""),
            entered_vehicle=inc.get("entered_vehicle", ""),
            mode_of_movement=inc.get("mode_of_movement", ""),
            public_to_private_shift=inc.get("public_to_private_shift", ""),
            public_to_secluded_shift=inc.get("public_to_secluded_shift", ""),
            offender_control_over_movement=inc.get("offender_control_over_movement", ""),
            suspect_count=str(inc.get("suspect_count", "")),
            suspect_gender=inc.get("suspect_gender", ""),
            suspect_description_text=inc.get("suspect_description_text", ""),
            suspect_race_ethnicity=inc.get("suspect_race_ethnicity", ""),
            suspect_age_estimate=str(inc.get("suspect_age_estimate", "")),
            vehicle_present=inc.get("vehicle_present", ""),
            vehicle_make=inc.get("vehicle_make", ""),
            vehicle_model=inc.get("vehicle_model", ""),
            vehicle_colour=inc.get("vehicle_colour", ""),
            plate_partial=inc.get("plate_partial", ""),
            summary_analytic=inc.get("summary_analytic", ""),
            ai_suggestions={"flags": inc.get("flags", []), "entry_type": inc.get("entry_type", "")},
            audit_log=[{"ts": datetime.utcnow().isoformat(), "action": "imported from bulletin", "by": data.analyst_name or "system"}],
        )
        db.add(report)
        saved.append(report_id)

    db.commit()
    return {"saved": len(saved), "report_ids": saved}


# ── Export ────────────────────────────────────────────────────────────────────

@app.get("/export/csv")
def export_csv(db: Session = Depends(get_db)):
    reports = db.query(Report).all()
    if not reports:
        raise HTTPException(404, "No reports to export")

    output = io.StringIO()
    fieldnames = [c.name for c in Report.__table__.columns if c.name not in ("audit_log", "ai_suggestions")]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for r in reports:
        row = {f: getattr(r, f, "") for f in fieldnames}
        # Convert lists/dicts to strings for CSV
        for k, v in row.items():
            if isinstance(v, (list, dict)):
                row[k] = json.dumps(v)
            elif v is None:
                row[k] = ""
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=redlight_export.csv"},
    )


@app.get("/export/geojson")
def export_geojson(db: Session = Depends(get_db)):
    reports = db.query(Report).all()
    features = []
    # Stage-specific city lookup: prefer stage-level city, fall back to legacy summary field
    _stage_city = {
        "initial_contact": lambda r: r.initial_contact_city or r.city or "",
        "incident":        lambda r: r.incident_city or r.city or "",
        "destination":     lambda r: r.destination_city or r.city or "",
    }
    _stage_city_conf = {
        "initial_contact": lambda r: r.initial_contact_city_confidence or "",
        "incident":        lambda r: r.incident_city_confidence or "",
        "destination":     lambda r: r.destination_city_confidence or "",
    }
    location_types = [
        ("initial_contact", "lat_initial", "lon_initial"),
        ("incident", "lat_incident", "lon_incident"),
        ("destination", "lat_destination", "lon_destination"),
    ]
    for r in reports:
        for loc_type, lat_col, lon_col in location_types:
            lat = getattr(r, lat_col)
            lon = getattr(r, lon_col)
            if lat is None or lon is None:
                continue
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "report_id": r.report_id,
                    "location_type": loc_type,
                    # Stage-specific city (more accurate for cross-city cases)
                    "city": _stage_city[loc_type](r),
                    "city_confidence": _stage_city_conf[loc_type](r),
                    # Legacy summary city preserved for backward compat
                    "primary_case_city": r.city or "",
                    "cross_city_movement": r.cross_city_movement or "",
                    "neighbourhood": r.neighbourhood or "",
                    "incident_date": r.incident_date or "",
                    "coercion_present": r.coercion_present or "",
                    "movement_present": r.movement_present or "",
                    "physical_force": r.physical_force or "",
                    "sexual_assault": r.sexual_assault or "",
                    "vehicle_present": r.vehicle_present or "",
                    "exit_type": r.exit_type or "",
                    "public_to_private_shift": r.public_to_private_shift or "",
                    "offender_control_over_movement": r.offender_control_over_movement or "",
                    "coding_status": r.coding_status or "",
                    "source_organization": r.source_organization or "",
                },
            })
    geojson = {"type": "FeatureCollection", "features": features}
    return StreamingResponse(
        iter([json.dumps(geojson, indent=2)]),
        media_type="application/geo+json",
        headers={"Content-Disposition": "attachment; filename=redlight_export.geojson"},
    )


# ── Similarity / linkage ─────────────────────────────────────────────────────

@app.get("/reports/{report_id}/similar")
def get_similar_cases(
    report_id: str,
    limit: int = 20,
    min_score: float = 10.0,
    db: Session = Depends(get_db),
):
    target = db.query(Report).filter(Report.report_id == report_id).first()
    if not target:
        raise HTTPException(404, "Report not found")

    others = db.query(Report).filter(Report.report_id != report_id).all()
    results = []
    for r in others:
        sim = compute_similarity(target, r)
        if sim['score'] >= min_score:
            results.append({
                'report_id': r.report_id,
                'incident_date': r.incident_date or '',
                'city': r.city or '',
                'neighbourhood': r.neighbourhood or '',
                'coding_status': r.coding_status or '',
                'coercion_present': r.coercion_present or '',
                'movement_present': r.movement_present or '',
                'vehicle_present': r.vehicle_present or '',
                'physical_force': r.physical_force or '',
                'sexual_assault': r.sexual_assault or '',
                'suspect_gender': r.suspect_gender or '',
                'vehicle_make': r.vehicle_make or '',
                'vehicle_colour': r.vehicle_colour or '',
                'plate_partial': r.plate_partial or '',
                'similarity': sim,
                # existing linkage status if any
                'linkage_status': '',
            })

    results.sort(key=lambda x: x['similarity']['score'], reverse=True)

    # Attach existing linkage assessments
    ids = [x['report_id'] for x in results[:limit]]
    linkages = db.query(CaseLinkage).filter(
        ((CaseLinkage.report_id_a == report_id) | (CaseLinkage.report_id_b == report_id))
    ).all()
    linkage_map = {}
    for lk in linkages:
        other = lk.report_id_b if lk.report_id_a == report_id else lk.report_id_a
        linkage_map[other] = lk.analyst_status

    for item in results[:limit]:
        item['linkage_status'] = linkage_map.get(item['report_id'], '')

    return results[:limit]


@app.get("/reports/{report_id_a}/compare/{report_id_b}")
def compare_reports(report_id_a: str, report_id_b: str, db: Session = Depends(get_db)):
    a = db.query(Report).filter(Report.report_id == report_id_a).first()
    b = db.query(Report).filter(Report.report_id == report_id_b).first()
    if not a or not b:
        raise HTTPException(404, "One or both reports not found")

    sim = compute_similarity(a, b)

    linkage = db.query(CaseLinkage).filter(
        ((CaseLinkage.report_id_a == report_id_a) & (CaseLinkage.report_id_b == report_id_b)) |
        ((CaseLinkage.report_id_a == report_id_b) & (CaseLinkage.report_id_b == report_id_a))
    ).first()

    return {
        'report_a': ReportOut.model_validate(a).model_dump(),
        'report_b': ReportOut.model_validate(b).model_dump(),
        'similarity': sim,
        'linkage': {
            'analyst_status': linkage.analyst_status,
            'analyst_notes': linkage.analyst_notes,
        } if linkage else None,
    }


class LinkageUpdate(PydanticBaseModel):
    report_id_a: str
    report_id_b: str
    analyst_status: str
    analyst_notes: str = ""


@app.post("/linkage")
def save_linkage(data: LinkageUpdate, db: Session = Depends(get_db)):
    existing = db.query(CaseLinkage).filter(
        ((CaseLinkage.report_id_a == data.report_id_a) & (CaseLinkage.report_id_b == data.report_id_b)) |
        ((CaseLinkage.report_id_a == data.report_id_b) & (CaseLinkage.report_id_b == data.report_id_a))
    ).first()

    if existing:
        existing.analyst_status = data.analyst_status
        existing.analyst_notes = data.analyst_notes
        existing.updated_at = datetime.utcnow()
    else:
        # Compute score to store
        ra = db.query(Report).filter(Report.report_id == data.report_id_a).first()
        rb = db.query(Report).filter(Report.report_id == data.report_id_b).first()
        sim = compute_similarity(ra, rb) if ra and rb else {}
        lk = CaseLinkage(
            report_id_a=data.report_id_a,
            report_id_b=data.report_id_b,
            similarity_score=sim.get('score', 0.0),
            score_breakdown=sim.get('dimensions', {}),
            analyst_status=data.analyst_status,
            analyst_notes=data.analyst_notes,
        )
        db.add(lk)

    db.commit()
    return {"ok": True}


# ── Stats / patterns ─────────────────────────────────────────────────────────

@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    reports = db.query(Report).all()
    total = len(reports)

    def pct(field, val):
        count = sum(1 for r in reports if getattr(r, field) == val)
        return {"count": count, "pct": round(count / total * 100, 1) if total else 0}

    # Repeated vehicles
    vehicles = [r.plate_partial for r in reports if r.plate_partial]
    from collections import Counter
    vehicle_counts = Counter(vehicles)
    repeated_vehicles = [{"plate": p, "count": c} for p, c in vehicle_counts.most_common(10) if c > 1]

    # Vehicle makes — normalise to title-case for deduplication
    makes = [r.vehicle_make.strip().title() for r in reports if r.vehicle_make and r.vehicle_make.strip()]
    make_counts = Counter(makes)

    neighbourhoods = [r.neighbourhood.strip().title() for r in reports if r.neighbourhood and r.neighbourhood.strip()]
    neighbourhood_counts = Counter(neighbourhoods)

    _SKIP_CITIES = {'', 'none', 'unknown', 'n/a', 'probable', 'inferred'}
    # Collect from all stage-specific city fields; fall back to legacy summary city.
    # For each report, prefer stage-specific over summary; de-duplicate within report.
    city_entries = []
    for r in reports:
        stage_cities = {
            c.strip().title()
            for c in [r.initial_contact_city or '', r.incident_city or '', r.destination_city or '']
            if c and c.strip().lower() not in _SKIP_CITIES
        }
        if stage_cities:
            city_entries.extend(stage_cities)
        elif r.city and r.city.strip().lower() not in _SKIP_CITIES:
            city_entries.append(r.city.strip().title())
    city_counts = Counter(city_entries)

    # Vehicle colours — normalise case
    colours = [r.vehicle_colour.strip().title() for r in reports if r.vehicle_colour and r.vehicle_colour.strip()]
    colour_counts = Counter(colours)

    # Vehicle types (stored in vehicle_model after import) — normalise
    _KNOWN_TYPES = {"sedan", "suv", "van", "minivan", "truck", "pickup", "hatchback",
                    "coupe", "convertible", "wagon", "cab", "taxi"}
    vtypes = [r.vehicle_model.strip().title() for r in reports
              if r.vehicle_model and r.vehicle_model.strip().lower() in _KNOWN_TYPES]
    vtype_counts = Counter(vtypes)

    # Approach type
    foot_count = sum(1 for r in reports if r.mode_of_movement == "foot")
    vehicle_approach = sum(1 for r in reports if r.mode_of_movement == "vehicle")

    # Year breakdown
    year_counts: Counter = Counter()
    for r in reports:
        if r.incident_date and len(r.incident_date) >= 4:
            try:
                year = int(r.incident_date[:4])
                if 2000 <= year <= 2100:
                    year_counts[year] += 1
            except ValueError:
                pass

    # ── NLP violence detection counts (from ai_suggestions, pre-coding) ──────
    def _nlp_rank(field: str, rank: int) -> int:
        return sum(
            1 for r in reports
            if (r.ai_suggestions or {}).get("nlp", {}).get(field) == rank
        )

    def _nlp_esc(min_score: int) -> int:
        return sum(
            1 for r in reports
            if (r.ai_suggestions or {}).get("nlp", {}).get("escalation", {}).get("score", 0) >= min_score
        )

    nlp_violence = {
        "coercion":  {"rank1": _nlp_rank("coercion_rank", 1),  "rank2": _nlp_rank("coercion_rank", 2)},
        "physical":  {"rank1": _nlp_rank("physical_rank", 1),  "rank2": _nlp_rank("physical_rank", 2)},
        "sexual":    {"rank1": _nlp_rank("sexual_rank", 1),    "rank2": _nlp_rank("sexual_rank", 2)},
        "movement":  {"rank1": _nlp_rank("movement_rank", 1),  "rank2": _nlp_rank("movement_rank", 2)},
        "weapon":    {"rank1": _nlp_rank("weapon_rank", 1),    "rank2": _nlp_rank("weapon_rank", 2)},
        "escalation": {
            "score3": _nlp_esc(3),
            "score4": _nlp_esc(4),
            "score5": _nlp_esc(5),
        },
    }

    # Named escalation patterns across all cases
    pattern_counter: Counter = Counter()
    for r in reports:
        patterns = (r.ai_suggestions or {}).get("nlp", {}).get("escalation", {}).get("patterns", [])
        for p in patterns:
            pattern_counter[p] += 1

    return {
        "total": total,
        "coded": sum(1 for r in reports if r.coding_status == "coded"),
        "coercion": pct("coercion_present", "yes"),
        "movement": pct("movement_present", "yes"),
        "physical_force": pct("physical_force", "yes"),
        "sexual_assault": pct("sexual_assault", "yes"),
        "threats_present": pct("threats_present", "yes"),
        "vehicle_present": pct("vehicle_present", "yes"),
        "vehicle_present_count": sum(1 for r in reports if r.vehicle_present == "yes") or sum(1 for r in reports if r.mode_of_movement == "vehicle"),
        "nlp_violence": nlp_violence,
        "nlp_escalation_patterns": [{"pattern": p, "count": c} for p, c in pattern_counter.most_common(10)],
        "repeated_vehicles": repeated_vehicles,
        "vehicle_makes": [{"make": m, "count": c} for m, c in make_counts.most_common(10)],
        "vehicle_colours": [{"colour": c, "count": n} for c, n in colour_counts.most_common(8)],
        "vehicle_types": [{"type": t, "count": c} for t, c in vtype_counts.most_common(8)],
        "approach_foot": foot_count,
        "approach_vehicle": vehicle_approach,
        "year_breakdown": [{"year": y, "count": c} for y, c in sorted(year_counts.items())],
        "neighbourhoods": [{"name": n, "count": c} for n, c in neighbourhood_counts.most_common(10)],
        "cities": [{"name": c, "count": n} for c, n in city_counts.most_common(15)],
        "map_points": [
            {
                "report_id": r.report_id,
                "lat_initial": r.lat_initial,
                "lon_initial": r.lon_initial,
                "lat_incident": r.lat_incident,
                "lon_incident": r.lon_incident,
                "lat_destination": r.lat_destination,
                "lon_destination": r.lon_destination,
                "coercion": r.coercion_present,
                "movement": r.movement_present,
                "city": r.city,
            }
            for r in reports
            if r.lat_initial or r.lat_incident
        ],
    }


# ── Research analysis ─────────────────────────────────────────────────────────

@app.get("/research/aggregate")
def get_research_aggregate(db: Session = Depends(get_db)):
    """Full cross-case research analysis: sequences, mobility, environment."""
    from research import aggregate_sequences, aggregate_mobility, aggregate_environment
    reports = db.query(Report).all()
    return {
        'sequences':   aggregate_sequences(reports),
        'mobility':    aggregate_mobility(reports),
        'environment': aggregate_environment(reports),
        'total':       len(reports),
    }


@app.get("/reports/{report_id}/summary")
def get_case_summary(report_id: str, db: Session = Depends(get_db)):
    """Case-level structured analytical summary derived from coded fields."""
    from research import build_full_case_summary
    r = db.query(Report).filter(Report.report_id == report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    return build_full_case_summary(r)


@app.get("/export/case-summaries")
def export_case_summaries(db: Session = Depends(get_db)):
    """Export per-case analytical summaries as CSV (research-ready)."""
    from research import build_full_case_summary
    reports = db.query(Report).all()

    output = io.StringIO()
    fieldnames = [
        'report_id', 'coding_status', 'incident_date', 'city',
        'encounter_sequence', 'encounter_sequence_with_provenance',
        'has_provisional', 'mobility_summary', 'environment_summary',
        'harm_indicators', 'exit_outcome',
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for r in reports:
        summary = build_full_case_summary(r)

        def _items_to_str(items):
            return '; '.join(
                item['item'] + (' [provisional]' if item['provenance'] == 'provisional' else '')
                for item in items
            )

        writer.writerow({
            'report_id':                        r.report_id,
            'coding_status':                    r.coding_status or '',
            'incident_date':                    r.incident_date or '',
            'city':                             r.city or '',
            'encounter_sequence':               summary['encounter_sequence_string'],
            'encounter_sequence_with_provenance': summary['encounter_sequence_with_provenance'],
            'has_provisional':                  'yes' if summary['has_provisional'] else 'no',
            'mobility_summary':                 _items_to_str(summary['mobility_summary']),
            'environment_summary':              _items_to_str(summary['environment_summary']),
            'harm_indicators':                  _items_to_str(summary['harm_summary']),
            'exit_outcome':                     _items_to_str(summary['exit_summary']),
        })

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename=redlight_case_summaries.csv'},
    )


@app.get("/export/research-tables")
def export_research_tables(db: Session = Depends(get_db)):
    """
    Export all research aggregate tables as a ZIP of CSVs.

    Contents:
      aggregate_sequences.csv           — full encounter sequence frequencies
      aggregate_sequence_patterns.csv   — stage-pair bigram frequencies
      stage_frequency.csv               — individual stage occurrence counts
      escalation_pathways.csv           — harm-stage-only pathway sequences
      per_case_sequences.csv            — each case's derived sequence
      aggregate_mobility_counts.csv     — mobility indicator counts + pct
      aggregate_mobility_pathways.csv   — recurring mobility combinations
      aggregate_route_patterns.csv      — start→destination type patterns
      aggregate_environment.csv         — indoor/outdoor, public/private, deserted
      aggregate_location_types.csv      — location type frequency
      aggregate_env_violence.csv        — violence/movement cross-tabulations
      aggregate_environment_patterns.csv — combined environment+harm patterns
    """
    import zipfile
    from research import aggregate_sequences, aggregate_mobility, aggregate_environment

    reports = db.query(Report).all()
    seq_data = aggregate_sequences(reports)
    mob_data = aggregate_mobility(reports)
    env_data = aggregate_environment(reports)

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:

        def _csv_str(fieldnames, rows):
            buf = io.StringIO()
            w = csv.DictWriter(buf, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)
            return buf.getvalue()

        def _csv_rows(headers, rows):
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(headers)
            w.writerows(rows)
            return buf.getvalue()

        # Sequence tables
        zf.writestr('aggregate_sequences.csv',
            _csv_str(['sequence', 'count'], seq_data['most_common_sequences']))
        zf.writestr('aggregate_sequence_patterns.csv',
            _csv_str(['pattern', 'count'], seq_data['most_common_bigrams']))
        zf.writestr('stage_frequency.csv',
            _csv_str(['stage', 'count'], seq_data['stage_frequency']))
        zf.writestr('escalation_pathways.csv',
            _csv_str(['pathway', 'count'], seq_data['escalation_pathways']))
        zf.writestr('per_case_sequences.csv',
            _csv_str(['report_id', 'sequence', 'stage_count'], seq_data['per_case']))

        # Mobility tables
        total_m = mob_data['total'] or 1
        mob_count_rows = [
            [k, v, round(v / total_m * 100, 1)]
            for k, v in mob_data['counts'].items()
        ]
        zf.writestr('aggregate_mobility_counts.csv',
            _csv_rows(['mobility_indicator', 'count', 'pct_of_total'], mob_count_rows))
        zf.writestr('aggregate_mobility_pathways.csv',
            _csv_str(['pathway', 'count'], mob_data['recurring_pathways']))
        zf.writestr('aggregate_route_patterns.csv',
            _csv_str(['route', 'count'], mob_data['route_patterns']))
        zf.writestr('cross_city_pathways.csv',
            _csv_str(['pathway', 'count'], mob_data['cross_city_pathways']))

        # Environment tables
        env_dist_rows = []
        for val, cnt in env_data['indoor_outdoor'].items():
            env_dist_rows.append(['indoor_outdoor', val, cnt])
        for val, cnt in env_data['public_private'].items():
            env_dist_rows.append(['public_private', val, cnt])
        for val, cnt in env_data['deserted'].items():
            env_dist_rows.append(['deserted', val, cnt])
        zf.writestr('aggregate_environment.csv',
            _csv_rows(['dimension', 'value', 'count'], env_dist_rows))

        zf.writestr('aggregate_location_types.csv',
            _csv_str(['type', 'count'], env_data['location_types']))

        # Cross-tabulations
        xtab_rows = []
        for env_dim, cross_dict in [
            ('indoor_outdoor', env_data['violence_by_environment']),
            ('public_private',  env_data['movement_by_setting']),
            ('deserted',        env_data['deserted_analysis']),
        ]:
            for val, metrics in cross_dict.items():
                xtab_rows.append([
                    env_dim, val,
                    metrics['count'],
                    metrics['physical_force'],
                    metrics['sexual_assault'],
                    metrics['coercion'],
                    metrics['movement'],
                ])
        zf.writestr('aggregate_env_violence.csv',
            _csv_rows(
                ['env_dimension', 'env_value', 'n_cases',
                 'physical_force', 'sexual_assault', 'coercion', 'movement'],
                xtab_rows,
            ))

        zf.writestr('aggregate_environment_patterns.csv',
            _csv_str(['pattern', 'count'], env_data['combined_patterns']))

    zip_buf.seek(0)
    return StreamingResponse(
        iter([zip_buf.getvalue()]),
        media_type='application/zip',
        headers={'Content-Disposition': 'attachment; filename=redlight_research_tables.zip'},
    )


# ── Static files (production build) ──────────────────────────────────────────
# Serve the Vite-built frontend when it exists.
# API routes above take priority; this catches everything else.

_DIST = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')

if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        index = os.path.join(_DIST, "index.html")
        return FileResponse(index)
