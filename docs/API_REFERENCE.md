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
    { "index": 0, "status": "exact",    "matched_report_id": "RLA-..." },
    { "index": 1, "status": "possible", "matched_report_id": "RLA-..." },
    { "index": 2, "status": "new" }
  ]
}
```

**Status values:**

| Status | How it is determined |
|---|---|
| `exact` | SHA-256 hash of the normalized narrative matches an existing `narrative_hash` — the text is identical |
| `possible` | Fuzzy narrative similarity ≥ 0.70 (word Jaccard, stopwords removed) against same-date candidates **or** same `incident_date` AND `city` (case-insensitive) as an existing report |
| `new` | No match found; safe to import |

**Match checks run in order (first match wins):**
1. **Exact hash** — SHA-256 of whitespace-normalized, lowercased narrative.
2. **Fuzzy narrative** — word Jaccard overlap ≥ 0.70 against existing reports with the same `incident_date` (or all reports if date is blank). Catches the same incident represented in different text formats, e.g. PDF extraction vs Excel synopsis column.
3. **Date + city fallback** — same `incident_date` AND `city` (case-insensitive). Catches lightly edited re-submissions when fuzzy text similarity is below threshold.

**Hash algorithm:** narrative is whitespace-normalized (`\s+` → single space, trimmed, lowercased) then SHA-256 encoded. This means trivial formatting differences (extra spaces, line breaks) are ignored, but any content change produces a different hash.

**`/bulk-save` behavior:** also runs the exact-hash check for each incident and silently skips any that already exist, returning `skipped: [report_id, ...]` in the response.

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
| `GET` | `/research/aggregate` | Research-oriented aggregates |
| `GET` | `/reports/{report_id}/summary` | AI-generated narrative summary for a single report |
| `GET` | `/export/case-summaries` | Export all case summaries |
| `GET` | `/export/research-tables` | Export research-ready data tables |

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
