from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text
from typing import Optional, List
from pydantic import BaseModel
import csv
import hashlib
import io
import json
import re
import uuid
import os
from datetime import datetime

from models import Report, CaseLinkage, ReportStage, ResearchNote, init_db, get_db
from schemas import ReportCreate, ReportUpdate, ReportOut, SuggestRequest, StageCreate, StageUpdate, StageOut, StageReorderItem
from ai import get_ai_suggestions, parse_bulletin
from parser import parse_bulletin_rules
from similarity import compute_similarity, STOPWORDS


def _narrative_hash(raw: str) -> str:
    normalized = re.sub(r'\s+', ' ', raw.strip()).lower()
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


def _narrative_similarity(text_a: str, text_b: str) -> float:
    """
    Returns the higher of Jaccard and overlap-coefficient similarity.

    Overlap coefficient = |A ∩ B| / min(|A|, |B|).

    This handles the common cross-format case where one text (e.g. an Excel
    synopsis cell) is topically a subset of the other (e.g. a full PDF bulletin
    entry that includes headers, dates, labels, and the same synopsis text).
    In that case Jaccard is dragged down by the extra bulletin words, but the
    overlap coefficient stays high because the smaller set is mostly covered.
    """
    wa = {w.lower() for w in text_a.split() if len(w) > 2 and w.lower() not in STOPWORDS}
    wb = {w.lower() for w in text_b.split() if len(w) > 2 and w.lower() not in STOPWORDS}
    if not wa or not wb:
        return 0.0
    inter = len(wa & wb)
    jaccard = inter / len(wa | wb)
    overlap = inter / min(len(wa), len(wb))
    return max(jaccard, overlap)


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
    h = _narrative_hash(data.raw_narrative)
    existing = db.query(Report).filter(Report.narrative_hash == h).first()
    if existing:
        raise HTTPException(status_code=409,
            detail=f"Duplicate narrative — already stored as {existing.report_id}")
    report_id = f"RLA-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"
    report = Report(report_id=report_id, narrative_hash=h, **data.model_dump())
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


class BulkDeleteRequest(BaseModel):
    report_ids: List[str]


@app.post("/reports/bulk-delete")
def bulk_delete_reports(data: BulkDeleteRequest, db: Session = Depends(get_db)):
    if not data.report_ids:
        return {"ok": True, "deleted": 0}
    deleted = db.query(Report).filter(Report.report_id.in_(data.report_ids)).delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted": deleted}


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

    # Merge into existing ai_suggestions, preserving any other keys.
    # Use a new dict so SQLAlchemy detects the JSON column as changed.
    r.ai_suggestions = {**(r.ai_suggestions or {}), **result}
    r.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(r)
    return {"ok": True, "ai_suggestions": r.ai_suggestions}


# ── Batch NLP re-run ─────────────────────────────────────────────────────────

@app.post("/reports/batch-analyze")
def batch_analyze(db: Session = Depends(get_db)):
    """
    Run spaCy NLP analysis on every report that has no nlp data yet.
    Skips reports that already have ai_suggestions["nlp"] populated.
    Returns a count of reports processed.
    """
    from nlp_analysis import analyze_narrative, _nlp as _spacy_model
    reports = db.query(Report).all()
    processed = 0
    for r in reports:
        existing = r.ai_suggestions or {}
        # Skip only if a real NLP analysis was completed (coercion_rank is set).
        # Records that only have date_certainty (from a failed spaCy run) are re-analyzed.
        if existing.get("nlp", {}).get("coercion_rank") is not None:
            continue
        if not r.raw_narrative or not r.raw_narrative.strip():
            continue
        result = analyze_narrative(r.raw_narrative)
        # Use a new dict so SQLAlchemy detects the JSON column as changed.
        r.ai_suggestions = {**existing, **result}
        r.updated_at = datetime.utcnow()
        processed += 1
    db.commit()
    return {"ok": True, "processed": processed, "nlp_available": _spacy_model is not None}


# ── Bulletin import ───────────────────────────────────────────────────────────

_ATTACHMENTS_DIR = os.path.join(os.path.dirname(__file__), "..", "attachments")
os.makedirs(_ATTACHMENTS_DIR, exist_ok=True)


@app.post("/parse-bulletin")
async def parse_bulletin_endpoint(file: UploadFile = File(...)):
    """
    Parse a Red Light Alert bulletin PDF into individual incident records.
    Uses AI (Claude) if ANTHROPIC_API_KEY is set, otherwise falls back to
    rule-based PDF column detection + regex extraction.
    Returns a session_id that links to the stored source PDF.
    """
    content = await file.read()
    filename = file.filename or ""
    has_api_key = bool(os.environ.get("ANTHROPIC_API_KEY"))

    # Generate a session ID and persist the source PDF for all methods
    session_id = str(uuid.uuid4())
    if filename.lower().endswith(".pdf"):
        pdf_path = os.path.join(_ATTACHMENTS_DIR, f"{session_id}.pdf")
        with open(pdf_path, "wb") as f:
            f.write(content)

    if filename.lower().endswith(".pdf"):
        # Always extract full text for provenance
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

        if has_api_key:
            try:
                incidents = await parse_bulletin(bulletin_text)
                for inc in incidents:
                    inc["_bulletin_text"] = bulletin_text
                    inc["_session_id"] = session_id
                return {"incidents": incidents, "total": len(incidents), "method": "ai", "session_id": session_id}
            except ValueError as e:
                raise HTTPException(400, str(e))
        else:
            # Rule-based path: use PDF column detection + regex
            incidents = parse_bulletin_rules(content)
            for inc in incidents:
                inc["_bulletin_text"] = bulletin_text
                inc["_session_id"] = session_id
            return {"incidents": incidents, "total": len(incidents), "method": "rules", "session_id": session_id}
    else:
        # Plain text — always use AI if available, else return error
        bulletin_text = content.decode("utf-8", errors="replace")
        if not has_api_key:
            raise HTTPException(400, "Plain text import requires an AI API key. Upload a PDF instead, or add your ANTHROPIC_API_KEY.")
        try:
            incidents = await parse_bulletin(bulletin_text)
            for inc in incidents:
                inc["_bulletin_text"] = bulletin_text
                inc["_session_id"] = session_id
            return {"incidents": incidents, "total": len(incidents), "method": "ai", "session_id": session_id}
        except ValueError as e:
            raise HTTPException(400, str(e))


@app.get("/attachments/{session_id}")
def get_attachment(session_id: str):
    """Serve a stored source PDF by its session ID."""
    # Sanitise: only allow UUID-shaped filenames
    if not re.fullmatch(r"[0-9a-f\-]{36}", session_id):
        raise HTTPException(400, "Invalid session ID")
    pdf_path = os.path.join(_ATTACHMENTS_DIR, f"{session_id}.pdf")
    if not os.path.isfile(pdf_path):
        raise HTTPException(404, "Attachment not found")
    return FileResponse(pdf_path, media_type="application/pdf", filename="source_bulletin.pdf")


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
        wb.close()
    finally:
        os.unlink(tmp_path)

    header_row = rows[0] if rows else ()
    data_rows = rows[1:]  # skip header row
    incidents = []

    for row in data_rows:
        def _cell(idx):
            return row[idx] if len(row) > idx else None

        # Build full-row source text for the Source Immutable panel
        row_source_parts = []
        for col_idx, cell_val in enumerate(row):
            header = (
                str(header_row[col_idx]).strip()
                if header_row and col_idx < len(header_row) and header_row[col_idx] is not None
                else f"Column {col_idx + 1}"
            )
            val_str = str(cell_val).strip() if cell_val is not None else ""
            row_source_parts.append(f"{header}: {val_str}")
        row_source_text = "\n".join(row_source_parts)

        synopsis_raw      = _cell(9)
        synopsis = str(synopsis_raw).strip() if synopsis_raw else ""
        if not synopsis or synopsis.lower() == "none":
            continue

        incident_date_raw = _cell(0)
        time_raw          = _cell(2)
        date_reported_raw = _cell(3)
        city_raw          = _cell(4)
        location_raw      = _cell(5)
        coords_raw        = _cell(6)
        description_raw   = _cell(7)
        vehicle_raw       = _cell(8)

        description   = str(description_raw).strip() if description_raw else ""
        vehicle_text  = str(vehicle_raw).strip()     if vehicle_raw     else ""
        location_text = str(location_raw).strip()    if location_raw    else ""

        veh  = parse_vehicle(vehicle_text)
        locs = parse_locations(location_text, synopsis)

        lat_initial = lon_initial = None
        if coords_raw and str(coords_raw).strip() not in ("None", ""):
            raw_str = str(coords_raw).strip().strip("()")
            parts = raw_str.split(",")
            if len(parts) == 2:
                try:
                    lat_initial = float(parts[0].strip())
                    lon_initial = float(parts[1].strip())
                except ValueError:
                    pass

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
            "sexual_assault":   "", "robbery_theft":   "", "stealthing":     "", "loss_of_consciousness": "",
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
            "lat_initial":  lat_initial,
            "lon_initial":  lon_initial,
            "flags": [],
            "_bulletin_text": row_source_text,
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


class DupCheckItem(PydanticBaseModel):
    index: int
    raw_narrative: str = ""
    incident_date: str = ""
    city: str = ""


class BulkSaveRequest(PydanticBaseModel):
    incidents: list[dict]
    analyst_name: str = ""
    source_organization: str = ""
    bulletin_session_id: str = ""


def _matched_info(report) -> dict:
    """Return a brief preview of a matched DB record for the duplicate review modal."""
    narrative = report.raw_narrative or ""
    return {
        "incident_date": report.incident_date or "",
        "city": report.city or "",
        "narrative_preview": narrative[:120].strip(),
    }


@app.post("/check-duplicates")
def check_duplicates(items: list[DupCheckItem], db: Session = Depends(get_db)):
    """Check a list of parsed incidents against existing reports before import."""

    # Pre-load candidates grouped by date for the fuzzy pass — avoids N×all-reports queries
    all_dates = {item.incident_date.strip() for item in items if item.incident_date.strip()}
    candidates_by_date: dict[str, list] = {}
    for d in all_dates:
        candidates_by_date[d] = db.query(Report).filter(Report.incident_date == d).all()
    # Lazy no-date bucket
    candidates_no_date: list = []

    results = []
    for item in items:
        # 1. Exact match via narrative hash
        if item.raw_narrative.strip():
            h = _narrative_hash(item.raw_narrative)
            exact = db.query(Report).filter(Report.narrative_hash == h).first()
            if exact:
                results.append({
                    "index": item.index, "status": "exact",
                    "matched_report_id": exact.report_id,
                    "matched_info": _matched_info(exact),
                })
                continue

        # 2. Fuzzy narrative match — uses max(Jaccard, overlap-coefficient) so that an
        #    Excel synopsis (short) contained within a full PDF bulletin entry (long)
        #    still scores high even though Jaccard alone would be dragged down by the
        #    extra header/label words in the bulletin.  Threshold 0.45.
        #    Pool: same-date candidates first; fall back to ALL records when pool is
        #    empty (PDF parser may have stored the date differently than Excel parser).
        if item.raw_narrative.strip():
            date = item.incident_date.strip()
            pool = candidates_by_date.get(date, []) if date else []
            if not pool:
                if not candidates_no_date:
                    candidates_no_date.extend(db.query(Report).all())
                pool = candidates_no_date

            best_match = None
            best_score = 0.0
            for c in pool:
                if not c.raw_narrative:
                    continue
                score = _narrative_similarity(item.raw_narrative, c.raw_narrative)
                if score > best_score:
                    best_score = score
                    best_match = c
            if best_match and best_score >= 0.45:
                results.append({
                    "index": item.index, "status": "possible",
                    "matched_report_id": best_match.report_id,
                    "matched_info": _matched_info(best_match),
                })
                continue

        # 3. Possible match: same incident_date AND city (both non-empty)
        date = item.incident_date.strip()
        city = item.city.strip()
        if date and city:
            possible = db.query(Report).filter(
                Report.incident_date == date,
                Report.city.ilike(city),
            ).first()
            if possible:
                results.append({
                    "index": item.index, "status": "possible",
                    "matched_report_id": possible.report_id,
                    "matched_info": _matched_info(possible),
                })
                continue

        results.append({"index": item.index, "status": "new"})

    return {"results": results}


@app.post("/bulk-save")
def bulk_save(data: BulkSaveRequest, db: Session = Depends(get_db)):
    """Save a list of pre-parsed incidents as draft reports."""
    saved = []
    skipped = []
    for inc in data.incidents:
        raw = inc.get("raw_narrative", "")
        if not raw.strip():
            continue

        h = _narrative_hash(raw)
        existing = db.query(Report).filter(Report.narrative_hash == h).first()
        if existing:
            skipped.append(existing.report_id)
            continue

        report_id = f"RLA-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"
        report = Report(
            report_id=report_id,
            narrative_hash=h,
            raw_narrative=raw,
            source_bulletin_text=inc.get("_bulletin_text", ""),
            source_bulletin_session_id=inc.get("_session_id", "") or data.bulletin_session_id,
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
            loss_of_consciousness=inc.get("loss_of_consciousness", ""),
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
            lat_initial=inc.get("lat_initial"),
            lon_initial=inc.get("lon_initial"),
            ai_suggestions={"flags": inc.get("flags", []), "entry_type": inc.get("entry_type", "")},
            audit_log=[{"ts": datetime.utcnow().isoformat(), "action": "imported from bulletin", "by": data.analyst_name or "system"}],
        )
        db.add(report)
        saved.append(report_id)

    db.commit()
    return {"saved": len(saved), "report_ids": saved, "skipped": len(skipped), "skipped_report_ids": skipped}


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


def _build_geojson_props(r, loc_type: str) -> dict:
    """Shared property dict for a single location feature."""
    _stage_city = {
        "initial_contact": r.initial_contact_city or r.city or "",
        "incident":        r.incident_city or r.city or "",
        "destination":     r.destination_city or r.city or "",
    }
    _stage_city_conf = {
        "initial_contact": r.initial_contact_city_confidence or "",
        "incident":        r.incident_city_confidence or "",
        "destination":     r.destination_city_confidence or "",
    }
    return {
        "report_id": r.report_id,
        "location_type": loc_type,
        "city": _stage_city.get(loc_type, r.city or ""),
        "city_confidence": _stage_city_conf.get(loc_type, ""),
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
    }


@app.get("/export/geojson")
def export_geojson(
    report_ids: str = "",
    include_lines: bool = False,
    db: Session = Depends(get_db),
):
    """Export cases as GeoJSON point features.

    Optional query params:
    - report_ids: comma-separated IDs to export (omit for all)
    - include_lines: if true, also append LineString features for movement paths
    """
    q = db.query(Report)
    if report_ids:
        id_list = [rid.strip() for rid in report_ids.split(",") if rid.strip()]
        q = q.filter(Report.report_id.in_(id_list))
    reports = q.all()

    features = []
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
                "properties": _build_geojson_props(r, loc_type),
            })

    if include_lines:
        for r in reports:
            coords = []
            for lat_col, lon_col in [("lat_initial", "lon_initial"), ("lat_incident", "lon_incident"), ("lat_destination", "lon_destination")]:
                lat = getattr(r, lat_col)
                lon = getattr(r, lon_col)
                if lat is not None and lon is not None:
                    coords.append([lon, lat])
            if len(coords) >= 2:
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": coords},
                    "properties": {
                        "report_id": r.report_id,
                        "location_type": "movement_path",
                        "city": r.city or "",
                        "incident_date": r.incident_date or "",
                        "movement_present": r.movement_present or "",
                        "cross_city_movement": r.cross_city_movement or "",
                        "coding_status": r.coding_status or "",
                    },
                })

    geojson = {"type": "FeatureCollection", "features": features}
    return StreamingResponse(
        iter([json.dumps(geojson, indent=2)]),
        media_type="application/geo+json",
        headers={"Content-Disposition": "attachment; filename=redlight_export.geojson"},
    )


@app.get("/export/shapefile")
def export_shapefile(
    report_ids: str = "",
    include_lines: bool = False,
    db: Session = Depends(get_db),
):
    """Export cases as a zipped Shapefile bundle (QGIS-ready).

    Optional query params:
    - report_ids: comma-separated IDs to export (omit for all)
    - include_lines: if true, also include a movement LineString shapefile
    """
    import shapefile
    import zipfile

    q = db.query(Report)
    if report_ids:
        id_list = [rid.strip() for rid in report_ids.split(",") if rid.strip()]
        q = q.filter(Report.report_id.in_(id_list))
    reports = q.all()

    location_types = [
        ("initial_contact", "lat_initial", "lon_initial"),
        ("incident", "lat_incident", "lon_incident"),
        ("destination", "lat_destination", "lon_destination"),
    ]

    # ── Point shapefile ────────────────────────────────────────────────────────
    pt_shp = io.BytesIO()
    pt_shx = io.BytesIO()
    pt_dbf = io.BytesIO()
    with shapefile.Writer(shp=pt_shp, shx=pt_shx, dbf=pt_dbf, shapeType=shapefile.POINT) as w:
        w.field("report_id",  "C", 64)
        w.field("loc_type",   "C", 32)
        w.field("city",       "C", 64)
        w.field("inc_date",   "C", 20)
        w.field("coercion",   "C", 16)
        w.field("movement",   "C", 16)
        w.field("phys_force", "C", 16)
        w.field("sex_aslt",   "C", 16)
        w.field("veh_prsnt",  "C", 16)
        w.field("exit_type",  "C", 32)
        w.field("pub_priv",   "C", 16)
        w.field("offndr_ctrl","C", 32)
        w.field("status",     "C", 32)
        w.field("source_org", "C", 64)
        w.field("cross_city", "C", 16)
        w.field("nbhd",       "C", 64)
        for r in reports:
            for loc_type, lat_col, lon_col in location_types:
                lat = getattr(r, lat_col)
                lon = getattr(r, lon_col)
                if lat is None or lon is None:
                    continue
                w.point(lon, lat)
                w.record(
                    r.report_id or "",
                    loc_type,
                    r.city or "",
                    r.incident_date or "",
                    r.coercion_present or "",
                    r.movement_present or "",
                    r.physical_force or "",
                    r.sexual_assault or "",
                    r.vehicle_present or "",
                    r.exit_type or "",
                    r.public_to_private_shift or "",
                    r.offender_control_over_movement or "",
                    r.coding_status or "",
                    r.source_organization or "",
                    r.cross_city_movement or "",
                    r.neighbourhood or "",
                )

    # ── Movement LineString shapefile (optional) ───────────────────────────────
    ln_shp = ln_shx = ln_dbf = None
    if include_lines:
        ln_shp = io.BytesIO()
        ln_shx = io.BytesIO()
        ln_dbf = io.BytesIO()
        with shapefile.Writer(shp=ln_shp, shx=ln_shx, dbf=ln_dbf, shapeType=shapefile.POLYLINE) as w:
            w.field("report_id",  "C", 64)
            w.field("city",       "C", 64)
            w.field("inc_date",   "C", 20)
            w.field("movement",   "C", 16)
            w.field("cross_city", "C", 16)
            w.field("status",     "C", 32)
            for r in reports:
                coords = []
                for lat_col, lon_col in [("lat_initial", "lon_initial"), ("lat_incident", "lon_incident"), ("lat_destination", "lon_destination")]:
                    lat = getattr(r, lat_col)
                    lon = getattr(r, lon_col)
                    if lat is not None and lon is not None:
                        coords.append([lon, lat])
                if len(coords) >= 2:
                    w.line([coords])
                    w.record(
                        r.report_id or "",
                        r.city or "",
                        r.incident_date or "",
                        r.movement_present or "",
                        r.cross_city_movement or "",
                        r.coding_status or "",
                    )

    # ── Bundle into ZIP ────────────────────────────────────────────────────────
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("redlight_points.shp", pt_shp.getvalue())
        zf.writestr("redlight_points.shx", pt_shx.getvalue())
        zf.writestr("redlight_points.dbf", pt_dbf.getvalue())
        if include_lines and ln_shp:
            zf.writestr("redlight_movements.shp", ln_shp.getvalue())
            zf.writestr("redlight_movements.shx", ln_shx.getvalue())
            zf.writestr("redlight_movements.dbf", ln_dbf.getvalue())

    zip_buf.seek(0)
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=redlight_shapefile.zip"},
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
    from nlp_analysis import _nlp as _spacy_model
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
        "nlp_available": _spacy_model is not None,
        "map_points": [
            {
                "report_id": r.report_id,
                "lat_initial": r.lat_initial,
                "lon_initial": r.lon_initial,
                "lat_incident": r.lat_incident,
                "lon_incident": r.lon_incident,
                "lat_destination": r.lat_destination,
                "lon_destination": r.lon_destination,
                # harm flags
                "coercion": r.coercion_present,
                "physical_force": r.physical_force,
                "sexual_assault": r.sexual_assault,
                "robbery_theft": r.robbery_theft,
                # movement
                "movement": r.movement_present,
                "movement_completed": r.movement_completed,
                "entered_vehicle": r.entered_vehicle,
                "public_to_private_shift": r.public_to_private_shift,
                "cross_municipality": r.cross_municipality,
                # sequence
                "highest_stage_reached": r.highest_stage_reached,
                # meta
                "city": r.city,
                "incident_date": r.incident_date,
                "coding_status": r.coding_status,
                # location confidence
                "location_certainty": r.location_certainty,
                "initial_contact_city_confidence": r.initial_contact_city_confidence,
                "incident_city_confidence": r.incident_city_confidence,
                "destination_city_confidence": r.destination_city_confidence,
            }
            for r in reports
            if r.lat_initial or r.lat_incident
        ],
    }


# ── Stage CRUD ────────────────────────────────────────────────────────────────

@app.get("/reports/{report_id}/stages", response_model=list[StageOut])
def list_stages(report_id: str, db: Session = Depends(get_db)):
    return (
        db.query(ReportStage)
        .filter(ReportStage.report_id == report_id)
        .order_by(ReportStage.stage_order)
        .all()
    )


@app.post("/reports/{report_id}/stages", response_model=StageOut)
def create_stage(report_id: str, body: StageCreate, db: Session = Depends(get_db)):
    stage = ReportStage(
        report_id=report_id,
        stage_order=body.stage_order or 1,
        stage_type=body.stage_type or "",
        client_behaviors=body.client_behaviors or [],
        victim_responses=body.victim_responses or [],
        turning_point_notes=body.turning_point_notes or "",
        visibility=body.visibility or "",
        guardianship=body.guardianship or "",
        isolation_level=body.isolation_level or "",
        control_type=body.control_type or "",
        location_label=body.location_label or "",
        location_type=body.location_type or "",
        movement_type_to_here=body.movement_type_to_here or "",
    )
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return stage


@app.put("/reports/{report_id}/stages/reorder")
def reorder_stages(report_id: str, items: list[StageReorderItem], db: Session = Depends(get_db)):
    for item in items:
        stage = db.query(ReportStage).filter(
            ReportStage.id == item.id,
            ReportStage.report_id == report_id,
        ).first()
        if stage:
            stage.stage_order = item.stage_order
    db.commit()
    return {"ok": True}


@app.put("/reports/{report_id}/stages/{stage_id}", response_model=StageOut)
def update_stage(report_id: str, stage_id: int, body: StageUpdate, db: Session = Depends(get_db)):
    stage = db.query(ReportStage).filter(
        ReportStage.id == stage_id,
        ReportStage.report_id == report_id,
    ).first()
    if not stage:
        raise HTTPException(404, "Stage not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(stage, field, value)
    db.commit()
    db.refresh(stage)
    return stage


@app.delete("/reports/{report_id}/stages/{stage_id}")
def delete_stage(report_id: str, stage_id: int, db: Session = Depends(get_db)):
    stage = db.query(ReportStage).filter(
        ReportStage.id == stage_id,
        ReportStage.report_id == report_id,
    ).first()
    if not stage:
        raise HTTPException(404, "Stage not found")
    db.delete(stage)
    db.commit()
    return {"ok": True}


# ── Research: stage patterns ───────────────────────────────────────────────────

@app.get("/research/stage-patterns")
def get_stage_patterns(
    stage_type:   Optional[str] = None,
    visibility:   Optional[str] = None,
    guardianship: Optional[str] = None,
    isolation:    Optional[str] = None,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Cross-case stage analysis.
    Returns:
      - stage_type_frequency: count per stage type
      - visibility_by_stage: distribution of visibility values per stage type
      - guardianship_by_stage: distribution of guardianship per stage type
      - isolation_by_stage: distribution of isolation per stage type
      - control_by_stage: distribution of control type per stage type
      - behavior_frequency: client_behavior code counts across all stages
      - response_frequency: victim_response code counts across all stages
      - movement_by_stage: movement_type_to_here distribution per stage type
      - matching_cases: report_ids of cases with any stage matching the filter params
    """
    from collections import Counter, defaultdict

    query = db.query(ReportStage)
    if stage_type:
        query = query.filter(ReportStage.stage_type == stage_type)
    if visibility:
        query = query.filter(ReportStage.visibility == visibility)
    if guardianship:
        query = query.filter(ReportStage.guardianship == guardianship)
    if isolation:
        query = query.filter(ReportStage.isolation_level == isolation)
    if date_from or date_to:
        # Join to Report to filter by incident_date
        query = query.join(Report, ReportStage.report_id == Report.report_id)
        if date_from:
            query = query.filter(Report.incident_date >= date_from)
        if date_to:
            query = query.filter(Report.incident_date <= date_to)

    stages = query.all()

    # Frequency counters
    type_freq: Counter = Counter()
    vis_by_stage: dict = defaultdict(Counter)
    guard_by_stage: dict = defaultdict(Counter)
    iso_by_stage: dict = defaultdict(Counter)
    ctrl_by_stage: dict = defaultdict(Counter)
    move_by_stage: dict = defaultdict(Counter)
    behavior_freq: Counter = Counter()
    response_freq: Counter = Counter()
    matching_cases: set = set()

    for s in stages:
        t = s.stage_type or "unknown"
        type_freq[t] += 1
        if s.visibility:   vis_by_stage[t][s.visibility] += 1
        if s.guardianship: guard_by_stage[t][s.guardianship] += 1
        if s.isolation_level: iso_by_stage[t][s.isolation_level] += 1
        if s.control_type:    ctrl_by_stage[t][s.control_type] += 1
        if s.movement_type_to_here: move_by_stage[t][s.movement_type_to_here] += 1
        for b in (s.client_behaviors or []):
            behavior_freq[b] += 1
        for r in (s.victim_responses or []):
            response_freq[r] += 1
        matching_cases.add(s.report_id)

    def _counter_to_list(c: Counter):
        return [{"value": k, "count": v} for k, v in c.most_common()]

    def _nested_to_dict(d: dict):
        return {k: _counter_to_list(v) for k, v in d.items()}

    # Per-case stage sequences (for cross-case grouping)
    all_stages = db.query(ReportStage).order_by(ReportStage.report_id, ReportStage.stage_order).all()
    seq_map: dict = defaultdict(list)
    for s in all_stages:
        seq_map[s.report_id].append(s.stage_type or "?")
    seq_strings: Counter = Counter(" → ".join(v) for v in seq_map.values() if v)

    return {
        "stage_type_frequency":  _counter_to_list(type_freq),
        "visibility_by_stage":   _nested_to_dict(vis_by_stage),
        "guardianship_by_stage": _nested_to_dict(guard_by_stage),
        "isolation_by_stage":    _nested_to_dict(iso_by_stage),
        "control_by_stage":      _nested_to_dict(ctrl_by_stage),
        "movement_by_stage":     _nested_to_dict(move_by_stage),
        "behavior_frequency":    _counter_to_list(behavior_freq),
        "response_frequency":    _counter_to_list(response_freq),
        "matching_cases":        sorted(matching_cases),
        "sequence_frequency":    _counter_to_list(seq_strings),
        "total_stages":          len(stages),
        "total_cases_with_stages": len(seq_map),
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


@app.get("/research/linkage-patterns")
def get_linkage_patterns(db: Session = Depends(get_db)):
    """
    Aggregate potential linkage signals across all reports:
    - repeated_vehicles: plates / make+colour combos seen in 2+ cases
    - repeated_locations: initial contact / incident locations in 2+ cases
    - behavior_clusters: co-occurring violence indicator patterns in 2+ cases
    """
    from collections import Counter, defaultdict

    reports = db.query(Report).all()

    # ── Repeated plates ───────────────────────────────────────────────────────
    plate_map: dict = defaultdict(list)
    for r in reports:
        p = (r.plate_partial or "").strip().upper()
        if p:
            plate_map[p].append(r.report_id)

    repeated_vehicles = []
    # Plates with 2+ cases
    for plate, rids in plate_map.items():
        if len(rids) >= 2:
            repeated_vehicles.append({"descriptor": plate, "count": len(rids), "report_ids": rids, "type": "plate"})

    # Make + colour combos with 2+ cases
    make_colour_map: dict = defaultdict(list)
    for r in reports:
        make = (r.vehicle_make or "").strip().title()
        colour = (r.vehicle_colour or "").strip().title()
        if make and colour:
            key = f"{colour} {make}"
            make_colour_map[key].append(r.report_id)
    for desc, rids in make_colour_map.items():
        if len(rids) >= 2:
            repeated_vehicles.append({"descriptor": desc, "count": len(rids), "report_ids": rids, "type": "make_colour"})

    repeated_vehicles.sort(key=lambda x: -x["count"])

    # ── Repeated locations ────────────────────────────────────────────────────
    loc_map: dict = defaultdict(list)
    for r in reports:
        for loc_field in ["initial_contact_location", "incident_location_primary"]:
            loc = (getattr(r, loc_field, None) or "").strip()
            if loc and len(loc) > 3:
                loc_map[loc].append(r.report_id)

    repeated_locations = []
    for loc, rids in loc_map.items():
        unique_rids = list(dict.fromkeys(rids))  # preserve order, deduplicate
        if len(unique_rids) >= 2:
            repeated_locations.append({"descriptor": loc, "count": len(unique_rids), "report_ids": unique_rids})
    repeated_locations.sort(key=lambda x: -x["count"])

    # ── Behavior clusters ─────────────────────────────────────────────────────
    _FLAGS = [
        ("coercion_present",  "Coercion"),
        ("threats_present",   "Threats"),
        ("physical_force",    "Physical force"),
        ("sexual_assault",    "Sexual assault"),
        ("movement_present",  "Movement"),
        ("entered_vehicle",   "Vehicle entry"),
    ]
    cluster_map: dict = defaultdict(list)
    for r in reports:
        active = [label for field, label in _FLAGS if getattr(r, field, "") == "yes"]
        if len(active) >= 2:
            key = " + ".join(active)
            cluster_map[key].append(r.report_id)

    behavior_clusters = [
        {"descriptor": k, "count": len(v), "report_ids": v}
        for k, v in cluster_map.items()
        if len(v) >= 2
    ]
    behavior_clusters.sort(key=lambda x: -x["count"])

    return {
        "repeated_vehicles":  repeated_vehicles[:20],
        "repeated_locations": repeated_locations[:20],
        "behavior_clusters":  behavior_clusters[:20],
    }


# ── Research Notes CRUD ───────────────────────────────────────────────────────

class ResearchNoteCreate(BaseModel):
    note_text: str
    tagged_report_ids: list = []
    tagged_pattern: str = ""


@app.get("/research/notes")
def list_research_notes(db: Session = Depends(get_db)):
    notes = db.query(ResearchNote).order_by(ResearchNote.created_at.desc()).all()
    return [
        {
            "id": n.id,
            "note_text": n.note_text,
            "tagged_report_ids": n.tagged_report_ids or [],
            "tagged_pattern": n.tagged_pattern or "",
            "created_at": n.created_at.isoformat() if n.created_at else "",
        }
        for n in notes
    ]


@app.post("/research/notes")
def create_research_note(body: ResearchNoteCreate, db: Session = Depends(get_db)):
    note = ResearchNote(
        note_text=body.note_text,
        tagged_report_ids=body.tagged_report_ids,
        tagged_pattern=body.tagged_pattern,
        created_at=datetime.utcnow(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "note_text": note.note_text,
        "tagged_report_ids": note.tagged_report_ids or [],
        "tagged_pattern": note.tagged_pattern or "",
        "created_at": note.created_at.isoformat() if note.created_at else "",
    }


@app.delete("/research/notes/{note_id}")
def delete_research_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(ResearchNote).filter(ResearchNote.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    db.delete(note)
    db.commit()
    return {"ok": True}


# ── Bulletin data export ──────────────────────────────────────────────────────

@app.get("/export/bulletin-data")
def get_bulletin_data(
    date_from: Optional[str] = None,
    date_to:   Optional[str] = None,
    status:    Optional[str] = None,
    city:      Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Return all data needed to render a structured analytic bulletin.
    Filters: date_from, date_to, status (coding_status), city.
    Sections: meta, overview, map_points, behavioral, conditions, movement, linkage.
    """
    from collections import Counter
    from research import aggregate_sequences, aggregate_mobility, aggregate_environment

    query = db.query(Report)
    if date_from:
        query = query.filter(Report.incident_date >= date_from)
    if date_to:
        query = query.filter(Report.incident_date <= date_to)
    if status:
        query = query.filter(Report.coding_status == status)
    if city:
        query = query.filter(
            (Report.city.ilike(f"%{city}%")) |
            (Report.initial_contact_city.ilike(f"%{city}%")) |
            (Report.incident_city.ilike(f"%{city}%"))
        )

    reports = query.all()
    total = len(reports)

    if total == 0:
        return {
            "meta": {"case_count": 0, "date_from": date_from, "date_to": date_to, "status": status, "city": city},
            "overview": {}, "map_points": [], "behavioral": {}, "conditions": {}, "movement": {}, "linkage": {},
        }

    # ── Sections ──────────────────────────────────────────────────────────────
    dates = [r.incident_date for r in reports if r.incident_date]
    cities_ctr: Counter = Counter()
    for r in reports:
        for c in [r.city, r.initial_contact_city, r.incident_city]:
            if c and c.strip():
                cities_ctr[c.strip().title()] += 1

    location_types = Counter()
    for r in reports:
        lt = r.destination_location_type or r.start_location_type
        if lt:
            location_types[lt] += 1

    overview = {
        "case_count": total,
        "date_earliest": min(dates) if dates else None,
        "date_latest": max(dates) if dates else None,
        "top_cities": [{"city": c, "count": n} for c, n in cities_ctr.most_common(5)],
        "location_type_dist": [{"type": k, "count": v} for k, v in location_types.most_common()],
        "coded_count": sum(1 for r in reports if r.coding_status in ("coded", "reviewed")),
    }

    map_points = [
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
    ]

    seq_data = aggregate_sequences(reports)
    behavioral = {
        "top_sequences": seq_data["most_common_sequences"][:5],
        "escalation_points": Counter(r.escalation_point for r in reports if r.escalation_point).most_common(5),
        "top_transitions": seq_data["most_common_bigrams"][:5],
    }

    env_data = aggregate_environment(reports)

    # Stage-level situational aggregates
    from collections import defaultdict
    report_ids = [r.report_id for r in reports]
    stages_q = db.query(ReportStage).filter(ReportStage.report_id.in_(report_ids)).all() if report_ids else []
    _sit_fields = ("visibility", "guardianship", "isolation_level", "control_type")
    sit_overall: dict = {f: Counter() for f in _sit_fields}
    sit_by_stage: dict = {f: defaultdict(Counter) for f in _sit_fields}
    for s in stages_q:
        t = s.stage_type or "unknown"
        for f in _sit_fields:
            val = getattr(s, f, None)
            if val:
                sit_overall[f][val] += 1
                sit_by_stage[f][t][val] += 1
    # Collapse to plain dicts; by_stage → {stage_type: {field: top_value, field_count: n}}
    sit_by_stage_summary: dict = {}
    for stype in ["initial_contact", "negotiation", "movement", "escalation", "outcome"]:
        row: dict = {}
        for f in _sit_fields:
            top = sit_by_stage[f][stype].most_common(1)
            if top:
                row[f] = top[0][0]
                row[f + "_count"] = top[0][1]
        if row:
            sit_by_stage_summary[stype] = row

    conditions = {
        "indoor_outdoor": env_data["indoor_outdoor"],
        "public_private": env_data["public_private"],
        "deserted": env_data["deserted"],
        "location_types": env_data["location_types"][:8],
        "visibility": dict(sit_overall["visibility"]),
        "guardianship": dict(sit_overall["guardianship"]),
        "isolation_level": dict(sit_overall["isolation_level"]),
        "control_type": dict(sit_overall["control_type"]),
        "situational_by_stage": sit_by_stage_summary,
        "total_stages_coded": len(stages_q),
    }

    mob_data = aggregate_mobility(reports)
    mob_total = mob_data["total"] or 1
    movement = {
        "pct_movement": round(mob_data["counts"]["movement_present"] / mob_total * 100, 1),
        "pct_entered_vehicle": round(mob_data["counts"]["entered_vehicle"] / mob_total * 100, 1),
        "pct_public_to_private": round(mob_data["counts"]["public_to_private"] / mob_total * 100, 1),
        "top_transitions": mob_data["route_patterns"][:5],
        "common_pathways": mob_data["recurring_pathways"][:5],
    }

    # Linkage signals from the full dataset (not filtered — analysts want patterns across all cases)
    plate_ctr: Counter = Counter(r.plate_partial for r in reports if r.plate_partial)
    repeated_plates = [{"descriptor": p, "count": c} for p, c in plate_ctr.most_common(5) if c >= 2]

    make_colour_ctr: Counter = Counter()
    for r in reports:
        m = (r.vehicle_make or "").strip().title()
        cl = (r.vehicle_colour or "").strip().title()
        if m and cl:
            make_colour_ctr[f"{cl} {m}"] += 1
    repeated_make_colour = [{"descriptor": k, "count": v} for k, v in make_colour_ctr.most_common(5) if v >= 2]

    loc_ctr: Counter = Counter()
    for r in reports:
        for lf in ["initial_contact_location", "incident_location_primary"]:
            loc = (getattr(r, lf, None) or "").strip()
            if loc and len(loc) > 3:
                loc_ctr[loc] += 1
    repeated_locations = [{"descriptor": k, "count": v} for k, v in loc_ctr.most_common(5) if v >= 2]

    linkage = {
        "repeated_plates": repeated_plates,
        "repeated_vehicles": repeated_make_colour,
        "repeated_locations": repeated_locations,
        "note": "Flagged as potential linkage only — not confirmed.",
    }

    return {
        "meta": {"case_count": total, "date_from": date_from, "date_to": date_to, "status": status, "city": city},
        "overview": overview,
        "map_points": map_points,
        "behavioral": behavioral,
        "conditions": conditions,
        "movement": movement,
        "linkage": linkage,
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
        # Serve real files that exist in the dist root (logo.png, favicon, etc.)
        candidate = os.path.join(_DIST, full_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        index = os.path.join(_DIST, "index.html")
        return FileResponse(index, headers={"Cache-Control": "no-store"})
