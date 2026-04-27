# Backend Module Guide

All Python source files live in `backend/`. Entry point: `main.py` — run with `uvicorn main:app --reload --port 8000`.

---

## main.py — API Layer

40+ FastAPI endpoints organized in groups:

- **CRUD** (`/reports`) — list, create, get, update, delete
- **Stage CRUD** (`/reports/{id}/stages`) — list, create, update, delete, reorder
- **AI/NLP** (`/suggest`, `/reports/{id}/analyze`, `/batch-analyze`, `/nlp/visualize`)
- **Import** (`/parse-bulletin`, `/parse-excel`, `/check-duplicates`, `/bulk-save`)
- **Similarity** (`/reports/{id}/similar`, `/reports/{a}/compare/{b}`, `/linkage`)
- **Stats & Research** (`/stats`, `/research/aggregate`, `/research/stage-patterns`)
- **Export** (`/export/csv`, `/export/geojson`, `/export/case-summaries`, `/export/research-tables`)

Mounts the pre-built React bundle from `frontend/dist/` at `/` — a single Python process serves everything in production. The SPA fallback (`/{full_path:path}`) returns `index.html` with `Cache-Control: no-store` so the browser always fetches the latest build.

### Duplicate Detection

`_narrative_hash(raw)` normalizes text (collapse whitespace, lowercase) and returns a SHA-256 digest. Stored in `Report.narrative_hash` on every save.

`_narrative_similarity(text_a, text_b)` returns `max(Jaccard, overlap-coefficient)` on meaningful words. Handles the cross-format case where an Excel synopsis is a topical subset of a longer PDF bulletin entry.

`POST /check-duplicates` runs three checks per item (first match wins):
1. **Exact** — SHA-256 hash match
2. **Fuzzy** — narrative similarity ≥ 0.45 against same-date candidates
3. **Date + city fallback** — same `incident_date` AND `city`

Returns `status: "exact" | "possible" | "new"` plus `matched_info` for non-new results. Used by `DupReviewModal` for side-by-side previews before save.

---

## models.py — Data Model

Three SQLAlchemy tables:

**`Report`** — ~150 columns covering all coding fields (see [CODING_FIELDS.md](CODING_FIELDS.md)):
- Source/admin metadata
- Incident basics (date, time, multi-city location stages)
- Encounter sequence (negotiation → coercion → violence → exit)
- Mobility (movement, vehicle, offender control)
- Suspect & vehicle description
- Narrative coding (scores, escalation point, resolution endpoint, quotes, notes)
- GIS (three geocoded points with full confidence metadata)
- Provenance + audit JSON columns

**`ReportStage`** — analyst-coded stages, linked to `reports` via `report_id`:

| Column | Type | Notes |
|--------|------|-------|
| `report_id` | string | FK to `reports.report_id` |
| `stage_order` | int | 1-based ordering within the report |
| `stage_type` | string | `initial_contact`, `negotiation`, `movement`, `escalation`, `outcome` |
| `client_behaviors` | JSON | Array of behavior codes |
| `victim_responses` | JSON | Array of response codes |
| `turning_point_notes` | text | Free-text turning point description |
| `visibility` | string | `public`, `semi_public`, `semi_private`, `private`, `unknown` |
| `guardianship` | string | `present`, `reduced`, `absent`, `delayed`, `unknown` |
| `isolation_level` | string | `not_isolated`, `partially_isolated`, `isolated`, `unknown` |
| `control_type` | string | `victim`, `offender`, `shared`, `unclear` |
| `location_label` | string | Descriptive label (e.g. "parked car") |
| `location_type` | string | `public`, `semi_public`, `private`, `unknown` |
| `movement_type_to_here` | string | `none`, `walk`, `vehicle`, `unknown` |

**`CaseLinkage`** — analyst verdicts on case pairs:
- `report_id_a`, `report_id_b`
- `similarity_score` (float 0–100)
- `score_breakdown` (JSON, per-domain)
- `analyst_status` + `analyst_notes`

`init_db()` creates all tables on startup and runs safe `ALTER TABLE ADD COLUMN` migrations for new columns — schema evolves without data loss.

---

## schemas.py — Pydantic Validation

**Report schemas:**
- `ReportCreate` — required fields when creating a new report
- `ReportUpdate` — all fields optional (PATCH)
- `ReportOut` — full response schema

**Stage schemas:**
- `StageCreate` — body for POST `/stages`
- `StageUpdate` — body for PUT `/stages/:id` (all fields optional)
- `StageOut` — full stage response with `id`
- `StageReorderItem` — `{id, stage_order}` used by the reorder endpoint

**Other:**
- `SuggestRequest` — body for `/suggest`

---

## ai.py — Claude Integration

Two functions:
- `get_ai_suggestions(narrative)` — sends narrative to `claude-3-5-haiku` with a structured prompt; returns `{field: suggested_value}` dict for ~35 fields
- `parse_bulletin(text)` — asks Claude to extract per-incident fields from raw bulletin text; used when rules-based parser produces insufficient results

Requires `ANTHROPIC_API_KEY` environment variable.

---

## nlp_analysis.py — spaCy Violence Detection

Standalone NLP pipeline (no Claude dependency). Runs on any narrative:

| Output | Description |
|--------|-------------|
| `coercion_rank` | 1 (strong), 2 (possible), 3 (none) |
| `physical_rank` | Same scale |
| `sexual_rank` | Same scale |
| `movement_rank` | Same scale |
| `weapon_rank` | Same scale |
| `escalation.score` | 1–5 overall escalation arc |
| `escalation.patterns` | Named patterns (`weapon_present`, `condom_refusal`, etc.) |
| `location_hints` | Extracted location-like phrases |
| `temporal` | Time-of-day bucket, date certainty |
| `environment` | Inferred area character and location type |

Uses spaCy `en_core_web_sm` with custom vocabulary, dependency parsing, and negation checking. Results stored in `ai_suggestions.nlp` on the Report record.

---

## research.py — Cross-Case Analysis

Used by `/research/aggregate` and export endpoints. Three aggregate functions:

- `aggregate_sequences(reports)` — encounter sequence frequencies, bigrams, escalation pathways
- `aggregate_mobility(reports)` — movement counts, route patterns, cross-city pathways
- `aggregate_environment(reports)` — indoor/outdoor, public/private, deserted distributions + violence cross-tabs

Also: `build_full_case_summary(report)` — builds a per-case structured summary used by `/reports/:id/summary` and the case-summaries CSV export.

### Stage patterns endpoint (`/research/stage-patterns`)

Queries the `report_stages` table directly. Accepts filter params:
- `stage_type` — limit to a specific stage type
- `visibility` — limit to a specific visibility value
- `guardianship` — limit to a specific guardianship value

Returns:
- `stage_type_frequency` — count per type
- `visibility_by_stage`, `guardianship_by_stage`, `isolation_by_stage`, `control_by_stage` — condition distributions per stage type
- `behavior_frequency`, `response_frequency` — behavior code frequencies
- `movement_by_stage` — movement type per stage
- `sequence_frequency` — most common stage orderings across all cases
- `matching_cases` — `report_id`s of cases with stages matching the filter

---

## similarity.py — Case Linkage Engine

Weighted behavioral similarity based on Tonkin et al. 2025 methodology. Computes 0–100 score across domains:

| Domain | Fields Used |
|--------|-------------|
| Control (physical) | `physical_force`, `offender_control_over_movement` |
| Control (coercion) | `coercion_present`, `repeated_pressure`, `intimidation_present` |
| Control (threats) | `threats_present`, `verbal_abuse` |
| Sexual | `sexual_assault`, `stealthing` |
| Style | `robbery_theft`, `negotiation_present` |
| Mobility | `movement_present`, `entered_vehicle`, `public_to_private_shift` |
| Vehicle | `vehicle_make`, `vehicle_model`, `vehicle_colour` |
| Suspect text | `suspect_description_text` (cosine similarity) |
| Temporal | `incident_time_range`, `day_of_week` |
| Geographic | Haversine distance between geocoded points |

Used by `GET /reports/{id}/similar` and `GET /reports/{a}/compare/{b}`.

---

## weather.py — Historical Weather

`get_weather(date, lat, lon)` — calls Open-Meteo archive API to retrieve historical weather conditions (temperature, precipitation, wind) for a given date and coordinates. No API key required. Results stored in `ai_suggestions.weather`.

---

## parser.py — Rules-Based Bulletin Parser

Regex and heuristics for extracting structured fields from PDF bulletin text. Primary parser in `/parse-bulletin`; Claude (`ai.py`) is the fallback.

---

## import_excel.py — Excel Bulk Import

Handles `/parse-excel`. Reads Excel workbooks with `openpyxl`, maps column headers to Report fields, returns array of field-value dicts ready for `/bulk-save`.
