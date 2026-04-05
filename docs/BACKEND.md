# Backend Module Guide

All Python source files live in `backend/`. The entry point is `main.py`; run with `uvicorn main:app --reload --port 8000`.

---

## main.py — API Layer

30+ FastAPI endpoints. Groups:
- **CRUD** (`/reports`) — list, create, get, update, delete
- **AI/NLP** (`/suggest`, `/reports/{id}/analyze`, `/batch-analyze`, `/nlp/visualize`)
- **Import** (`/parse-bulletin`, `/parse-excel`, `/check-duplicates`, `/bulk-save`)
- **Similarity** (`/reports/{id}/similar`, `/reports/{a}/compare/{b}`, `/linkage`)
- **Stats & Research** (`/stats`, `/research/aggregate`, summary endpoints)
- **Export** (`/export/csv`, `/export/geojson`, research tables)

Also mounts the pre-built React bundle from `frontend/dist/` at `/` so a single Python process serves everything in production.

---

## models.py — Data Model

Defines two SQLAlchemy tables:

**`Report`** — ~150 columns covering all coding fields (see [CODING_FIELDS.md](CODING_FIELDS.md)):
- Source/admin metadata
- Incident basics (date, time, location, multi-city stages)
- Encounter sequence (negotiation → coercion → violence → exit)
- Mobility (movement, vehicle, offender control)
- Suspect & vehicle description
- Narrative coding (scores, quotes, analyst notes)
- GIS (three geocoded points with confidence metadata)
- Provenance + audit JSON columns

**`CaseLinkage`** — analyst verdicts on case pairs:
- `report_id_a`, `report_id_b`
- `similarity_score` (float 0–100)
- `score_breakdown` (JSON, per-domain)
- `analyst_status` + `analyst_notes`

`init_db()` creates tables and runs safe `ALTER TABLE ADD COLUMN` migrations for schema evolution.

---

## schemas.py — Pydantic Validation

- `ReportCreate` — required fields when creating a new report
- `ReportUpdate` — all fields optional (for PATCH)
- `ReportOut` — response schema (includes all computed/meta fields)
- `SuggestRequest` — body for `/suggest` endpoint

---

## ai.py — Claude Integration

Two functions:
- `get_ai_suggestions(report_id, narrative, fields, db)` — sends narrative to Claude (`claude-3-5-haiku`) with a structured prompt; returns `{field: suggested_value}` dict
- `parse_bulletin(text)` — asks Claude to extract per-incident fields from raw bulletin text; used as fallback when rules-based parser fails

Requires `ANTHROPIC_API_KEY` environment variable.

---

## nlp_analysis.py — spaCy Violence Detection

Standalone NLP pipeline (no Claude dependency). Runs on any narrative to produce:

| Output | Description |
|---|---|
| `coercion_signal` | `strong`, `possible`, `none` |
| `physical_signal` | `strong`, `possible`, `none` |
| `sexual_signal` | `strong`, `possible`, `none` |
| `movement_signal` | `strong`, `possible`, `none` |
| `weapon_signal` | `strong`, `possible`, `none` |
| `escalation_score` | 1–5 overall escalation arc |
| `patterns` | Named pattern set (e.g. `weapon_present`, `condom_refusal`) |
| `location_hints` | Extracted location-like phrases |
| `temporal_hints` | Extracted time references |

Uses spaCy `en_core_web_sm` with custom vocabulary, dependency parsing, and entity recognition. Results are stored in `ai_suggestions.nlp` on the Report record.

---

## similarity.py — Case Linkage Engine

Implements the weighted behavioral similarity algorithm (based on Tonkin et al. 2025 methodology). Computes a 0–100 score across domains:

| Domain | Fields Used |
|---|---|
| Control (physical) | `physical_force`, `offender_control_over_movement` |
| Control (coercion) | `coercion_present`, `repeated_pressure`, `intimidation_present` |
| Control (threats) | `threats_present`, `verbal_abuse` |
| Sexual | `sexual_assault`, `stealthing` |
| Style | `robbery_theft`, `negotiation_present` |
| Mobility | `movement_present`, `entered_vehicle`, `public_to_private_shift` |
| Target selection | `initial_approach_type`, `service_discussed` |
| Vehicle | `vehicle_make`, `vehicle_model`, `vehicle_colour` |
| Suspect text | `suspect_description_text` (cosine similarity) |
| Temporal | `incident_time_range`, `day_of_week` |
| Geographic | Haversine distance between geocoded points |

Used by `GET /reports/{id}/similar` and `GET /reports/{a}/compare/{b}`.

---

## weather.py — Historical Weather

Single function `get_weather(date, lat, lon)` — calls the Open-Meteo archive API to retrieve historical weather conditions (temperature, precipitation, wind) for a given date and coordinates. No API key required.

---

## parser.py — Rules-Based Bulletin Parser

Regex and heuristic rules for extracting structured fields from PDF bulletin text. Used as the primary parser in `/parse-bulletin`; Claude (`ai.py`) is the fallback when rules don't produce enough fields.

---

## import_excel.py — Excel Bulk Import

Handles `/parse-excel`. Reads Excel workbooks with `openpyxl`, maps column headers to Report fields, and returns an array of field-value dicts ready for `/bulk-save`.

---

## research.py — Research Analysis

Additional analysis features used by `/research/aggregate` and the research export endpoints. Computes cross-case statistics suitable for academic reporting.
