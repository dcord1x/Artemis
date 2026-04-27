# API Reference

Base URL: `http://localhost:8000` (all routes are prefixed with `/api/` when served via the frontend proxy in dev mode).

---

## Reports — CRUD

| Method | Path | Description |
|---|---|---|
| `GET` | `/reports` | List all reports with optional filters (see below) |
| `POST` | `/reports` | Create a new report |
| `GET` | `/reports/{report_id}` | Get a single report by ID |
| `PATCH` | `/reports/{report_id}` | Update a report (partial) |
| `DELETE` | `/reports/{report_id}` | Delete a report |

### GET /reports — Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `coding_status` | string | `uncoded`, `in_progress`, `coded`, `reviewed` |
| `city` | string | Searches all city fields (legacy + all three stage-specific) |
| `coercion_present` | string | `yes`, `no`, `unclear` |
| `movement_present` | string | `yes`, `no`, `unclear` |
| `physical_force` | string | `yes`, `no`, `unclear` |
| `sexual_assault` | string | `yes`, `no`, `unclear` |
| `threats_present` | string | `yes`, `no`, `unclear` |
| `vehicle_present` | string | `yes`, `no`, `unclear` |
| `date_from` | string | ISO date string `YYYY-MM-DD` |
| `date_to` | string | ISO date string `YYYY-MM-DD` |
| `search` | string | Full-text search across narrative + description |
| `nlp_coercion` | string | `1` = strong only, `2` = strong + possible |
| `nlp_physical` | string | Same scale as `nlp_coercion` |
| `nlp_sexual` | string | Same scale as `nlp_coercion` |
| `nlp_movement` | string | Same scale as `nlp_coercion` |
| `nlp_weapon` | string | Same scale as `nlp_coercion` |
| `nlp_escalation_min` | string | Minimum escalation score `1`–`5` |
| `nlp_pattern` | string | Named pattern (e.g. `weapon_present`, `condom_refusal`) |
| `cross_city_movement` | string | `yes`, `no`, `unclear` |

---

## AI & NLP

| Method | Path | Description |
|---|---|---|
| `POST` | `/suggest` | Ask Claude to suggest field values from a narrative |
| `POST` | `/reports/{report_id}/analyze` | Run spaCy NLP pipeline on a report's narrative |
| `POST` | `/reports/batch-analyze` | Run NLP pipeline on all reports in bulk |
| `POST` | `/nlp/visualize` | Return annotated HTML visualization of NLP output |

### POST /suggest — Body

```json
{
  "report_id": "string",
  "narrative": "string",
  "fields": ["incident_date", "city", "coercion_present"]  // optional subset
}
```

---

## Import / Parsing

| Method | Path | Description |
|---|---|---|
| `POST` | `/parse-bulletin` | Upload PDF/text bulletin; returns parsed field values |
| `POST` | `/parse-excel` | Upload Excel file; returns array of parsed incident rows |
| `POST` | `/check-duplicates` | Check a list of parsed incidents against existing records before import (see below) |
| `POST` | `/bulk-save` | Save an array of parsed incidents; silently skips exact duplicates |

### POST /check-duplicates — Detail

Accepts an array of `DupCheckItem` objects and returns a status for each before the analyst commits a bulk import.

**Request body:**
```json
[
  {
    "index": 0,
    "raw_narrative": "string",
    "incident_date": "YYYY-MM-DD",
    "city": "string"
  }
]
```

**Response:**
```json
{
  "results": [
    {
      "index": 0, "status": "exact", "matched_report_id": "RLA-...",
      "matched_info": { "incident_date": "2020-02-08", "city": "Vancouver", "narrative_preview": "Worker was picked up on foot…" }
    },
    {
      "index": 1, "status": "possible", "matched_report_id": "RLA-...",
      "matched_info": { "incident_date": "2019-12-15", "city": "Surrey", "narrative_preview": "…" }
    },
    { "index": 2, "status": "new" }
  ]
}
```

`matched_info` is included for all non-`new` results and contains the first 120 characters of the matched record's narrative plus its date and city. Used by `DupReviewModal` to show side-by-side previews without a second API call.

**Status values:**

| Status | How it is determined |
|---|---|
| `exact` | SHA-256 hash of the normalized narrative matches an existing `narrative_hash` — the text is identical |
| `possible` | Fuzzy narrative similarity ≥ 0.45 (max of Jaccard and overlap-coefficient, stopwords removed) against same-date candidates **or** same `incident_date` AND `city` (case-insensitive) as an existing report |
| `new` | No match found; safe to import |

**Match checks run in order (first match wins):**
1. **Exact hash** — SHA-256 of whitespace-normalized, lowercased narrative.
2. **Fuzzy narrative** — `max(Jaccard, overlap-coefficient)` ≥ 0.45 against existing reports with the same `incident_date` (or all reports if date is blank). The overlap coefficient (`|A∩B| / min(|A|,|B|)`) handles the PDF-vs-Excel case where the synopsis is topically a subset of a longer bulletin entry; Jaccard alone would be dragged down by the extra header/label words in the bulletin.
3. **Date + city fallback** — same `incident_date` AND `city` (case-insensitive). Catches lightly edited re-submissions when fuzzy text similarity is below threshold.

**Hash algorithm:** narrative is whitespace-normalized (`\s+` → single space, trimmed, lowercased) then SHA-256 encoded. This means trivial formatting differences (extra spaces, line breaks) are ignored, but any content change produces a different hash.

**`/bulk-save` behavior:** also runs the exact-hash check for each incident and silently skips any that already exist, returning `skipped: [report_id, ...]` in the response. "Possible" duplicates that the analyst approved in `DupReviewModal` are sent here and saved normally (no hash collision, so they pass through).

---

## Stage CRUD

Each report has an ordered list of analyst-coded stages stored in the `report_stages` table.

| Method | Path | Description |
|---|---|---|
| `GET` | `/reports/{report_id}/stages` | List all stages for a report, ordered by `stage_order` |
| `POST` | `/reports/{report_id}/stages` | Create a new stage on a report |
| `PUT` | `/reports/{report_id}/stages/{stage_id}` | Update a stage (partial — all fields optional) |
| `DELETE` | `/reports/{report_id}/stages/{stage_id}` | Delete a stage |
| `PUT` | `/reports/{report_id}/stages/reorder` | Bulk-update `stage_order` for all stages on a report |

> **Route order matters:** `/stages/reorder` is registered before `/stages/{stage_id}` in `main.py` so FastAPI does not treat the literal string `reorder` as a stage ID.

### POST /reports/{id}/stages — Body

```json
{
  "stage_type": "initial_contact",
  "stage_order": 1,
  "client_behaviors": ["pressure", "deception"],
  "victim_responses": ["compliance"],
  "turning_point_notes": "",
  "visibility": "public",
  "guardianship": "present",
  "isolation_level": "not_isolated",
  "control_type": "offender",
  "location_label": "street corner",
  "location_type": "public",
  "movement_type_to_here": "none"
}
```

All fields except `stage_type` are optional on create (default to empty string / empty array).

### PUT /reports/{id}/stages/{stage_id} — Body

Same shape as `POST` but all fields optional (PATCH semantics).

### PUT /reports/{id}/stages/reorder — Body

```json
[
  { "id": 12, "stage_order": 1 },
  { "id": 13, "stage_order": 2 },
  { "id": 14, "stage_order": 3 }
]
```

### Stage response shape (`StageOut`)

```json
{
  "id": 12,
  "report_id": "RLA-...",
  "stage_order": 1,
  "stage_type": "initial_contact",
  "client_behaviors": ["pressure"],
  "victim_responses": ["compliance"],
  "turning_point_notes": "",
  "visibility": "public",
  "guardianship": "present",
  "isolation_level": "not_isolated",
  "control_type": "offender",
  "location_label": "street corner",
  "location_type": "public",
  "movement_type_to_here": "none"
}
```

---

## Similarity & Linkage

| Method | Path | Description |
|---|---|---|
| `GET` | `/reports/{report_id}/similar` | Find and rank similar cases using the linkage engine |
| `GET` | `/reports/{report_id_a}/compare/{report_id_b}` | Side-by-side comparison of two cases with field diff |
| `POST` | `/linkage` | Save an analyst verdict on a case pair |

### GET /reports/{id}/similar — Response

Returns a ranked list of candidates with:
- `score` — overall similarity (0–100)
- `breakdown` — per-domain scores (control, sexual, style, mobility, target_selection, vehicle, suspect_text, temporal, geographic)

---

## Statistics & Research

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats` | Aggregate statistics across all reports (KPIs, signal prevalence, breakdowns) |
| `GET` | `/research/aggregate` | Research-oriented aggregates (encounter sequences, mobility, environment) |
| `GET` | `/research/stage-patterns` | Cross-case stage pattern analysis with optional filters (see below) |
| `GET` | `/reports/{report_id}/summary` | AI-generated narrative summary for a single report |
| `GET` | `/export/case-summaries` | Export all case summaries |
| `GET` | `/export/research-tables` | Export research-ready data tables |

### GET /research/stage-patterns — Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `stage_type` | string | Filter to a specific stage type (`initial_contact`, `negotiation`, `movement`, `escalation`, `outcome`) |
| `visibility` | string | Filter to stages with this visibility value |
| `guardianship` | string | Filter to stages with this guardianship value |

All parameters are optional. When no filters are provided, aggregates run across all stages in all cases.

### GET /research/stage-patterns — Response

```json
{
  "stage_type_frequency": [
    { "value": "escalation", "count": 42 },
    { "value": "initial_contact", "count": 38 }
  ],
  "visibility_by_stage": {
    "escalation": [
      { "value": "private", "count": 28 },
      { "value": "semi_private", "count": 10 }
    ]
  },
  "guardianship_by_stage": { "escalation": [{ "value": "absent", "count": 31 }] },
  "isolation_by_stage":    { "escalation": [{ "value": "isolated", "count": 25 }] },
  "control_by_stage":      { "escalation": [{ "value": "offender", "count": 33 }] },
  "movement_by_stage":     { "movement":   [{ "value": "vehicle", "count": 19 }] },
  "behavior_frequency": [
    { "value": "aggression", "count": 35 }
  ],
  "response_frequency": [
    { "value": "compliance", "count": 28 }
  ],
  "sequence_frequency": [
    { "value": "initial_contact → negotiation → escalation → outcome", "count": 14 }
  ],
  "matching_cases": ["RLA-001", "RLA-007"],
  "total_stages": 187,
  "total_cases_with_stages": 51
}
```

`matching_cases` contains the `report_id` values of every case that has at least one stage matching all supplied filter criteria. Used by the Stage Patterns tab in ResearchOutputs to build a filterable case list.

---

## Export

| Method | Path | Description |
|---|---|---|
| `GET` | `/export/csv` | Export all reports as CSV |
| `GET` | `/export/geojson` | Export geocoded cases as GeoJSON FeatureCollection |

---

## NLP Pattern Names

The `nlp_pattern` filter and NLP output use these named patterns:

| Pattern | Meaning |
|---|---|
| `condom_refusal` | Suspect refused condom use |
| `payment_dispute` | Payment refused or disputed |
| `bait_and_switch` | Terms changed after negotiation |
| `rapid_escalation` | Violence escalated quickly |
| `weapon_present` | Weapon mentioned |
| `multi_suspect` | More than one suspect |
| `online_lure` | Contact made online |
| `drugging_intoxication` | Drugging or intoxication mentioned |
| `confinement` | Victim was confined or controlled |
