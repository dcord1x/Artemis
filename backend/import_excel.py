"""
Import DTE DATASET for QGIS.xlsx into the Red Light Alert database.
Run once from the project root:
    backend_env/Scripts/python.exe backend/import_excel.py

Re-running is safe — it clears existing Excel-imported records first.

Violence indicator fields (coercion_present, physical_force, etc.) are left
blank so researchers code them manually. NLP rank hints are stored in
ai_suggestions["nlp"] and surfaced in the coding screen as badges.
"""
import os
import re
import sys
import uuid
from datetime import datetime

import openpyxl
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(__file__))
from models import Report, init_db, SessionLocal
try:
    from nlp_analysis import analyze_narrative, extract_locations_from_synopsis
    _NLP_AVAILABLE = True
except Exception:
    _NLP_AVAILABLE = False
    def analyze_narrative(text): return {}
    def extract_locations_from_synopsis(text): return {}

EXCEL_PATH = os.path.join(os.path.dirname(__file__), "..", "DTE DATASET for QGIS.xlsx")
SOURCE_ORG = "Red Light Alert"
SHEET_NAME = "All Incidents"


# ── location parsing ─────────────────────────────────────────────────────────

# Sentence-level split: everything before "incident occurred" is the contact side
_INCIDENT_SPLIT = re.compile(
    r'incident\s+(?:occurred|took\s+place)|assault\s+occurred|it\s+occurred',
    re.IGNORECASE,
)

# Leading pickup phrases to strip from the contact side
_PICKUP_LEAD = re.compile(
    r'^(?:worker(?:s)?\s+(?:was\s+)?picked\s+up\s+(?:on\s+foot\s+)?(?:at|on|in)|'
    r'worker(?:s)?\s+picked\s+up\s+(?:at|on)|'
    r'picked\s+up\s+(?:at|on|in)|'
    r'worker\s+was\s+(?:at|on|in)|'
    r'worker\s+reports?\s+(?:being\s+at|being\s+on)|'
    r'worker\s+was\s+engaged\s+via\s+\w+\s+and\s+(?:met|picked\s+up)\s+(?:at|on)|'
    r'worker\s+was\s+on\s+foot\s+at)\s+',
    re.IGNORECASE,
)

# Leading incident phrases to strip from the incident side
_INCIDENT_LEAD = re.compile(
    r'^(?:at|in|behind|by|near|inside|on|in\s+the|at\s+the|in\s+a|in\s+an|in\s+his|in\s+her)\s+',
    re.IGNORECASE,
)

# Trailing noise: "and the", "and", ", in the evening", etc.
_TRAILING_NOISE = re.compile(r'\s+and\s+(?:the\s+)?$|\s*,\s*in\s+the\s+\w+$', re.IGNORECASE)

# Vague / null location values
_VAGUE = re.compile(
    r'^(?:no\s+location|location\s+(?:unknown|not\s+indicated|unclear|of\s+incident\s+not\s+indicated)|'
    r'unknown|n/?a|none)$',
    re.IGNORECASE,
)


def parse_locations(location_text: str, synopsis: str = "") -> dict:
    """
    Return {"contact": str, "incident": str} parsed from the Location column text.
    Falls back to synopsis-based extraction for vague entries.
    Both values may be empty string if genuinely unknown.
    """
    loc = location_text.strip().replace('\n', ' ').strip() if location_text else ""

    # Null/vague
    if not loc or _VAGUE.match(loc):
        hints = extract_locations_from_synopsis(synopsis) if synopsis else {}
        return {"contact": hints.get("contact_hint", ""), "incident": hints.get("incident_hint", "")}

    # Try to split on "incident occurred / incident took place / etc."
    parts = _INCIDENT_SPLIT.split(loc, maxsplit=1)

    if len(parts) == 2:
        contact_raw, incident_raw = parts
        # Clean contact side
        contact = _PICKUP_LEAD.sub('', contact_raw.strip()).strip()
        contact = _TRAILING_NOISE.sub('', contact).strip().rstrip('.,;').strip()
        # Strip trailing ". The" remnants ("... Vancouver. The")
        contact = re.sub(r'\.\s+[Tt]he\s*$', '', contact).strip().rstrip('.,; ')
        # Strip trailing orphan " and" / " and the"
        contact = re.sub(r'\s+and(?:\s+the)?\s*$', '', contact, flags=re.IGNORECASE).strip()
        # Clean incident side
        incident = _INCIDENT_LEAD.sub('', incident_raw.strip()).strip().rstrip('.,;').strip()
        # If contact is still noisy (contains "and the" mid-string), trim at last comma/period
        if re.search(r'\band\s+the\b', contact, re.IGNORECASE):
            contact = re.split(r'\band\s+the\b', contact, flags=re.IGNORECASE)[0].strip().rstrip('.,')
        return {"contact": contact, "incident": incident}

    # No split found — single location
    # If it starts with "incident occurred", treat as incident-only
    if re.match(r'incident\s+(?:occurred|took\s+place)|assault\s+occurred', loc, re.IGNORECASE):
        incident = _INCIDENT_LEAD.sub('', re.split(r'(?:occurred|took\s+place)\s+(?:at|in|behind|by|near|on|inside)?\s*', loc, maxsplit=1, flags=re.IGNORECASE)[-1]).strip().rstrip('.,;')
        return {"contact": "", "incident": incident}

    # If it starts with "worker picked up / worker was at", treat as contact-only
    if _PICKUP_LEAD.match(loc):
        contact = _PICKUP_LEAD.sub('', loc).strip().rstrip('.,;')
        return {"contact": contact, "incident": ""}

    # Otherwise treat the whole string as the incident location
    return {"contact": "", "incident": loc.rstrip('.,;')}


# ── vehicle parsing ───────────────────────────────────────────────────────────

MAKES = ["toyota", "honda", "ford", "chevy", "chevrolet", "dodge", "bmw",
         "mercedes", "benz", "nissan", "hyundai", "kia", "mazda", "subaru",
         "jeep", "gmc", "chrysler", "pontiac", "volkswagen", "vw", "audi",
         "lexus", "acura", "infiniti", "lincoln", "cadillac", "buick", "ram",
         "mini", "mitsubishi", "volvo", "jaguar", "tesla", "porsche", "land rover",
         "range rover"]

COLORS = ["black", "white", "silver", "grey", "gray", "red", "blue", "green",
          "brown", "yellow", "gold", "orange", "purple", "beige", "tan",
          "maroon", "dark", "light", "navy", "charcoal"]

TYPES  = ["suv", "sedan", "van", "minivan", "truck", "pickup", "hatchback",
          "coupe", "convertible", "wagon", "cab", "taxi"]

def parse_vehicle(text: str):
    low = text.lower()
    if "foot" in low and "vehicle" not in low and "car" not in low and "truck" not in low:
        return {"vehicle_present": "no", "vehicle_make": "", "vehicle_colour": "",
                "vehicle_model": "", "mode_of_movement": "foot"}

    make   = next((m.title() for m in MAKES  if m in low), "")
    colour = next((c.title() for c in COLORS if c in low), "")
    vtype  = next((t.title() for t in TYPES  if t in low), "")

    plate_match = re.search(r'\b([A-Z]{2,3}[ -]?\d{3,4}[A-Z]?|\d{3,4}[ -]?[A-Z]{2,3})\b', text, re.IGNORECASE)
    plate = plate_match.group(1).upper().replace(" ", "").replace("-", "") if plate_match else ""

    return {
        "vehicle_present": "yes",
        "vehicle_make": make,
        "vehicle_colour": colour,
        "vehicle_model": vtype,
        "mode_of_movement": "vehicle",
        "plate_partial": plate,
    }


# ── city normalisation ────────────────────────────────────────────────────────

def clean_city(raw):
    if not raw or str(raw).strip() in ("None", "", "NONE", "UNKNOWN"):
        return ""
    c = str(raw).strip().rstrip("\n").strip()
    if "/" in c:
        c = c.split("/")[0].strip()
    return c.title()


# ── neighbourhood extraction ──────────────────────────────────────────────────

VAN_HOODS = [
    "Downtown Eastside", "DTES", "Strathcona", "Mount Pleasant", "Grandview",
    "Hastings", "Commercial Drive", "Kitsilano", "West End", "Gastown",
    "Chinatown", "Fairview", "South Granville", "Riley Park", "Sunset",
    "Renfrew", "Collingwood", "Kensington", "Cedar Cottage", "Marpole",
    "Kerrisdale", "Dunbar", "Shaughnessy", "Oakridge", "Fraser",
    "Cambie", "Joyce", "Killarney", "Fraserview", "East Vancouver",
]

SURREY_HOODS = [
    "Newton", "Guildford", "Whalley", "City Centre", "Fleetwood",
    "Cloverdale", "South Surrey", "White Rock", "Bear Creek",
    "Panorama Ridge", "Bridgeview", "Port Kells", "Bolivar Heights",
]

ALL_HOODS = VAN_HOODS + SURREY_HOODS

def extract_neighbourhood(location_text: str) -> str:
    if not location_text:
        return ""
    for hood in ALL_HOODS:
        if hood.lower() in location_text.lower():
            return hood
    return ""


# ── date / time parsing ───────────────────────────────────────────────────────

def parse_date(val) -> str:
    if not val:
        return ""
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    from datetime import datetime
    for fmt in ("%m/%d/%Y", "%m-%d-%Y", "%Y-%m-%d", "%m/%d/%y", "%B %d, %Y"):
        try:
            return datetime.strptime(s.split(" ")[0], fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return s[:10] if len(s) >= 10 else s

def parse_time(val) -> str:
    """
    Extract HH:MM from a time value.
    Handles:
      - datetime objects (use time part only — Excel stores times as datetime with a
        placeholder date of 2024-02-07, so only HH:MM is meaningful)
      - strings like "3PM", "4:30-8:00pm", "03:00:00", "HH:MM AM/PM"
    Returns "HH:MM" in 24-hour format, or "" if unparseable.
    """
    if not val:
        return ""
    # datetime / date-like objects — always use time part only
    if hasattr(val, "strftime"):
        return val.strftime("%H:%M")
    s = str(val).strip()
    # Strip Excel datetime prefix (e.g. "2024-02-07 15:30:00" → use "15:30:00" only)
    # The date part is an artifact; only the time is real
    date_prefix = re.match(r"^\d{4}-\d{2}-\d{2}\s+", s)
    if date_prefix:
        s = s[date_prefix.end():]
    # Time range: "4:30-8:00pm" or "4-8pm" — take first value
    range_m = re.match(r"(\d{1,2}(?::\d{2})?)\s*(?:am|pm)?\s*[-–]\s*\d", s, re.IGNORECASE)
    if range_m:
        s = s[:range_m.end(1)]
    # Match HH:MM or H:MM optionally with AM/PM
    m = re.search(r"(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?", s)
    if m:
        h, mn, ampm = int(m.group(1)), int(m.group(2)), (m.group(3) or "").upper()
        if ampm == "PM" and h < 12:
            h += 12
        elif ampm == "AM" and h == 12:
            h = 0
        return f"{h:02d}:{mn:02d}"
    # Plain hour with AM/PM: "3PM", "11am"
    m2 = re.search(r"(\d{1,2})\s*([AaPp][Mm])", s)
    if m2:
        h, ampm = int(m2.group(1)), m2.group(2).upper()
        if ampm == "PM" and h < 12:
            h += 12
        elif ampm == "AM" and h == 12:
            h = 0
        return f"{h:02d}:00"
    return ""


# ── suspect parsing ───────────────────────────────────────────────────────────

def parse_suspect_count(desc: str) -> str:
    low = desc.lower()
    if low.startswith("2 ") or " 2 males" in low or " 2 females" in low or " two " in low:
        return "2"
    if " 3 " in low or " three " in low:
        return "3"
    return "1"

def parse_gender(desc: str) -> str:
    low = desc.lower()
    if "female" in low:
        return "female"
    if "male" in low:
        return "male"
    return ""


# ── main import ───────────────────────────────────────────────────────────────

def run():
    init_db()
    db: Session = SessionLocal()

    deleted = db.query(Report).filter(Report.source_organization == SOURCE_ORG).delete()
    db.commit()
    if deleted:
        print(f"Removed {deleted} existing Excel records.")

    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    ws = wb[SHEET_NAME]
    rows = list(ws.iter_rows(values_only=True))
    data_rows = rows[1:]

    saved = 0
    skipped = 0
    coord_ok = 0
    coord_fail = 0

    for i, row in enumerate(data_rows, 1):
        incident_date_raw = row[0]
        time_raw          = row[2]
        date_reported_raw = row[3]
        city_raw          = row[4]
        location_raw      = row[5]
        coords_raw        = row[6]
        description_raw   = row[7]
        vehicle_raw       = row[8]
        synopsis_raw      = row[9]

        synopsis = str(synopsis_raw).strip() if synopsis_raw else ""
        if not synopsis or synopsis == "None":
            skipped += 1
            continue

        description  = str(description_raw).strip() if description_raw else ""
        vehicle_text = str(vehicle_raw).strip() if vehicle_raw else ""
        location_text = str(location_raw).strip() if location_raw else ""

        veh = parse_vehicle(vehicle_text)
        locs = parse_locations(location_text, synopsis)

        lat_initial = lon_initial = None
        if coords_raw and str(coords_raw).strip() not in ("None", ""):
            raw_str = str(coords_raw).strip().strip("()")
            parts = raw_str.split(",")
            if len(parts) == 2:
                try:
                    lat_initial = float(parts[0].strip())
                    lon_initial = float(parts[1].strip())
                    coord_ok += 1
                except ValueError:
                    print(f"  [row {i}] Could not parse coordinates: {coords_raw!r}")
                    coord_fail += 1
            else:
                print(f"  [row {i}] Unexpected coordinate format (not 2 parts): {coords_raw!r}")
                coord_fail += 1

        # NLP analysis — stores ranked hints in ai_suggestions, leaves coded fields blank
        nlp_result = analyze_narrative(synopsis)

        # ── Temporal metadata ──────────────────────────────────────────────
        incident_date_str = parse_date(incident_date_raw)
        date_reported_str = parse_date(date_reported_raw)

        # Day of week from incident date
        dow = ""
        if incident_date_str:
            try:
                dt = datetime.strptime(incident_date_str, "%Y-%m-%d")
                dow = dt.strftime("%A")  # "Monday", "Tuesday", etc.
            except ValueError:
                pass

        # Date certainty: check for range strings or large gap between incident and report
        incident_date_raw_str = str(incident_date_raw).strip() if incident_date_raw else ""
        date_certainty = "exact"
        date_cert_reason = ""
        # Range pattern in raw value (e.g. "8-4-19 and 9-7-19", "12-3-19 - 12-6-19")
        if re.search(r'\band\b|\s[-–]\s', incident_date_raw_str):
            date_certainty = "range"
            date_cert_reason = f"raw value: {incident_date_raw_str}"
        # Vague expression in narrative
        elif nlp_result.get("nlp", {}).get("temporal", {}).get("vague_date_expr"):
            date_certainty = "vague"
            date_cert_reason = nlp_result["nlp"]["temporal"]["vague_date_expr"]
        # Large gap between incident and report dates (>30 days → likely approximate)
        elif incident_date_str and date_reported_str:
            try:
                inc_dt  = datetime.strptime(incident_date_str, "%Y-%m-%d")
                rep_dt  = datetime.strptime(date_reported_str, "%Y-%m-%d")
                gap_days = abs((rep_dt - inc_dt).days)
                if gap_days > 30:
                    date_certainty = "approximate"
                    date_cert_reason = f"{gap_days} day gap between incident and report"
            except ValueError:
                pass

        # Store certainty data inside ai_suggestions so UI can display it
        if "nlp" in nlp_result:
            nlp_result["nlp"]["date_certainty"] = date_certainty
            nlp_result["nlp"]["date_certainty_reason"] = date_cert_reason

        # Time of day from explicit time field first, narrative fallback
        incident_time = parse_time(time_raw)
        if incident_time:
            # Derive bucket from explicit time
            try:
                h = int(incident_time.split(":")[0])
                if 0 <= h < 6:
                    explicit_bucket = "early morning"
                elif 6 <= h < 12:
                    explicit_bucket = "morning"
                elif 12 <= h < 17:
                    explicit_bucket = "afternoon"
                elif 17 <= h < 21:
                    explicit_bucket = "evening"
                else:
                    explicit_bucket = "night"
            except ValueError:
                explicit_bucket = ""
            if "nlp" in nlp_result and nlp_result["nlp"].get("temporal") is not None:
                nlp_result["nlp"]["temporal"]["time_of_day_bucket"] = explicit_bucket
                nlp_result["nlp"]["temporal"]["time_of_day_source"] = "explicit_time"

        report_id = f"RLA-EXCEL-{str(uuid.uuid4())[:8].upper()}"

        report = Report(
            report_id=report_id,
            raw_narrative=synopsis,
            source_organization=SOURCE_ORG,
            date_received=date_reported_str,
            coding_status="uncoded",
            confidence_level="",

            incident_date=incident_date_str,
            incident_time_exact=incident_time,
            day_of_week=dow,
            city=clean_city(city_raw),
            neighbourhood=extract_neighbourhood(location_text),
            initial_contact_location=locs["contact"],
            incident_location_primary=locs["incident"],

            # Violence / coding fields intentionally blank — researcher codes these
            coercion_present="",
            threats_present="",
            verbal_abuse="",
            physical_force="",
            sexual_assault="",
            robbery_theft="",
            movement_present="",
            entered_vehicle="",

            # Cross-municipality flag: set if the two parsed locations are in different cities
            cross_municipality="yes" if (
                locs["contact"] and locs["incident"]
                and locs["contact"].lower() != locs["incident"].lower()
                and clean_city(city_raw)
                and any(city.lower() in locs["incident"].lower()
                        for city in ["richmond", "surrey", "burnaby", "delta",
                                     "langley", "abbotsford", "chilliwack",
                                     "new westminster", "north vancouver",
                                     "west vancouver", "maple ridge", "coquitlam",
                                     "port coquitlam", "white rock"])
            ) else "",

            vehicle_present=veh.get("vehicle_present", ""),
            vehicle_make=veh.get("vehicle_make", ""),
            vehicle_colour=veh.get("vehicle_colour", ""),
            vehicle_model=veh.get("vehicle_model", ""),
            mode_of_movement=veh.get("mode_of_movement", ""),
            plate_partial=veh.get("plate_partial", ""),

            suspect_description_text=description,
            suspect_count=parse_suspect_count(description),
            suspect_gender=parse_gender(description),

            lat_initial=lat_initial,
            lon_initial=lon_initial,

            ai_suggestions=nlp_result,
            audit_log=[{
                "ts": datetime.utcnow().isoformat(),
                "action": "imported from Excel",
                "by": "import_excel.py",
            }],
        )

        db.add(report)
        saved += 1

        if i % 50 == 0:
            print(f"  {i}/{len(data_rows)} processed…")

    db.commit()
    db.close()
    print(f"Done. Imported {saved} records, skipped {skipped} empty rows.")
    print(f"Coordinates: {coord_ok} parsed OK, {coord_fail} failed/unexpected format.")


if __name__ == "__main__":
    run()
