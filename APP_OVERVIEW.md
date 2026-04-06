# Red Light Alert — Full Application Overview

> A specialized harm-report coding and GIS research tool for documenting violence against sex workers. Built for researchers and analysts who need to systematically code, analyze, and map incident narratives.

---

## Table of Contents

1. [What the App Does](#1-what-the-app-does)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [How to Run](#4-how-to-run)
5. [Data Model](#5-data-model)
6. [Backend — API & Logic](#6-backend--api--logic)
7. [Frontend — Pages & Components](#7-frontend--pages--components)
8. [AI & NLP Pipeline](#8-ai--nlp-pipeline)
9. [Similarity & Linkage Engine](#9-similarity--linkage-engine)
10. [GIS & Mapping](#10-gis--mapping)
11. [Data Flow — End to End](#11-data-flow--end-to-end)
12. [File Structure](#12-file-structure)

---

## 1. What the App Does

Red Light Alert is a qualitative coding workstation for harm reports. Researchers receive raw narrative reports — written accounts of violent or harmful incidents — and need to systematically extract structured data from them for research and pattern analysis.

The workflow is:

1. **Import** a raw narrative (paste, or bulk import from PDF/bulletin)
2. **Code** it — fill ~80 structured fields covering incident basics, encounter sequence, mobility, suspect description, GIS locations
3. **Use AI assistance** — an LLM (Claude) suggests field values; a spaCy NLP pipeline flags violence signals independently
4. **Map it** — geocoded locations appear on an interactive Google Maps view with movement trajectories and Street View
5. **Analyze patterns** — an analysis dashboard shows prevalence statistics across the whole dataset
6. **Link cases** — a similarity engine compares any two cases and scores how likely they share an offender

The tool is deliberately **human-led**: AI suggestions are never auto-applied. Every field has a provenance state (unset / ai_suggested / analyst_filled / reviewed) so the audit trail is clear.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────┐
│               Browser (React SPA)            │
│  CodingScreen │ CaseList │ Analysis │ Map    │
│  ImportBulletin │ Linkage │ Similar Cases    │
└────────────────────┬────────────────────────┘
                     │ HTTP/JSON (/api/*)
                     │
┌────────────────────▼────────────────────────┐
│            Python Backend (FastAPI)          │
│                                              │
│  main.py     — REST API routes               │
│  models.py   — SQLAlchemy ORM + migrations   │
│  schemas.py  — Pydantic I/O models           │
│  ai.py       — Claude API (field suggest,    │
│                bulletin parse)               │
│  nlp_analysis.py — spaCy violence detector  │
│  similarity.py   — weighted case comparison  │
│  weather.py      — Open-Meteo lookup        │
│  parser.py       — rules-based bulletin parse│
│  import_excel.py — Excel batch import        │
└────────────────────┬────────────────────────┘
                     │ SQLAlchemy
                     ▼
              redlight.db (SQLite)
```

The frontend is a **pre-built static bundle** served directly by the FastAPI backend at `/`. In development, Vite runs on port 5173 with a proxy to the backend on port 8000.

---

## 3. Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | React 18 + TypeScript |
| Frontend build | Vite |
| Routing | React Router v6 |
| Styling | CSS custom properties (no UI library) |
| Icons | Lucide React |
| Mapping | Google Maps JavaScript API (`@react-google-maps/api`) |
| Backend framework | FastAPI (Python) |
| ORM | SQLAlchemy 2 |
| Database | SQLite (`redlight.db`) |
| AI field suggestions | Anthropic Claude API (`claude-3-5-haiku`) |
| NLP violence detection | spaCy `en_core_web_sm` |
| Weather data | Open-Meteo archive API (free, no key) |
| Geocoding (map search) | Google Places Autocomplete |

---

## 4. How to Run

### Windows
```
start_with_ai.bat    ← includes ANTHROPIC_API_KEY prompt
start.bat            ← runs without AI features
```

### Mac / Linux
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
chmod +x start_mac.sh
./start_mac.sh
```

The startup script:
1. Checks for Python 3
2. Creates a virtualenv (`venv_mac/`) and installs `requirements.txt` on first run
3. Starts the FastAPI backend on `http://localhost:8000`
4. Opens the browser

The frontend `dist/` folder (pre-built from Vite) is served as static files by FastAPI. If you make frontend changes you must run `npm run build` inside `frontend/` to regenerate it.

### Development mode (hot reload)
```bash
# Terminal 1 — backend
cd backend && uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend && npm run dev    # runs on :5173, proxies /api → :8000
```

---

## 5. Data Model

All data lives in a single SQLite file: `redlight.db`.

### Reports table (`reports`)

Each row is one coded incident report. Key field groups:

| Group | Fields | Purpose |
|-------|--------|---------|
| **Admin** | `report_id`, `analyst_name`, `source_organization`, `date_received`, `coding_status`, `confidence_level` | Who coded it, where it came from, what state it's in |
| **Incident basics** | `incident_date`, `incident_time_*`, `day_of_week`, `city`, `neighbourhood` | When and where |
| **Location stages** | `initial_contact_location/city`, `incident_location_primary/city`, `incident_location_secondary`, `destination_city` | Three-stage location model: where contact happened → where the incident occurred → where the victim ended up |
| **Environment** | `indoor_outdoor`, `public_private`, `deserted` | Physical context of the incident location |
| **Encounter sequence** | `initial_approach_type`, `negotiation_present`, `refusal_present`, `pressure_after_refusal`, `coercion_present`, `threats_present`, `verbal_abuse`, `physical_force`, `sexual_assault`, `robbery_theft`, `stealthing`, `exit_type` | What happened step by step |
| **Early escalation detail** | `repeated_pressure`, `intimidation_present`, `abrupt_tone_change`, `verbal_abuse_before_violence`, `escalation_trigger` | How the situation escalated |
| **Mobility** | `movement_present`, `movement_attempted`, `movement_completed`, `mode_of_movement`, `entered_vehicle`, `start/destination_location_type`, `public_to_private_shift`, `cross_neighbourhood`, `cross_municipality`, `cross_city_movement`, `offender_control_over_movement` | Whether and how the victim was moved |
| **Suspect/vehicle** | `suspect_count`, `suspect_gender`, `suspect_description_text`, `suspect_race_ethnicity`, `suspect_age_estimate`, `vehicle_present`, `vehicle_make/model/colour`, `plate_partial`, `repeat_suspect_flag`, `repeat_vehicle_flag` | Offender and vehicle description |
| **Narrative coding** | `early_escalation_score`, `mobility_richness_score`, `escalation_point`, `summary_analytic`, `key_quotes`, `coder_notes`, `uncertainty_notes`, `cleaned_narrative` | Analyst's interpretive layer |
| **GIS** | `*_address_raw`, `lat_*/lon_*`, `*_address_normalized`, `*_precision`, `*_source`, `*_confidence` | Three geocoded points (contact, incident, destination) with full confidence metadata |
| **Metadata** | `field_provenance` (JSON), `analyst_summary`, `audit_log` (JSON), `ai_suggestions` (JSON), `tags` (JSON array) | Audit trail, AI outputs, free-form tags |

**Provenance states** for every field:
- `unset` — never touched
- `ai_suggested` — Claude suggested a value, analyst hasn't confirmed
- `analyst_filled` — analyst typed or accepted a value
- `reviewed` — analyst explicitly marked as reviewed

### Case Linkages table (`case_linkages`)

Stores analyst verdicts on pairs of cases:
- `report_id_a`, `report_id_b`
- `similarity_score` (float, computed)
- `analyst_status`: `possible_link` | `unlikely_link` | `needs_review`
- `analyst_notes` (free text)

---

## 6. Backend — API & Logic

### `main.py` — API routes

| Method | Endpoint | What it does |
|--------|----------|-------------|
| `GET` | `/reports` | List all reports. Supports 15+ filter params: `coding_status`, `city`, `coercion_present`, `movement_present`, `date_from/to`, `search`, NLP signal filters (`nlp_coercion`, `nlp_physical`, etc.), `nlp_pattern`, `nlp_escalation_min` |
| `GET` | `/reports/:id` | Get a single report by `report_id` |
| `POST` | `/reports` | Create a new report (narrative + basic meta) |
| `PATCH` | `/reports/:id` | Update any fields on an existing report |
| `DELETE` | `/reports/:id` | Delete a report |
| `POST` | `/suggest` | Send a narrative to Claude → get JSON field suggestions back |
| `POST` | `/reports/:id/analyze` | Run spaCy NLP + weather lookup on this report's narrative |
| `GET` | `/reports/:id/similar` | Find similar cases using the similarity engine |
| `GET` | `/reports/:idA/compare/:idB` | Full comparison of two specific cases |
| `POST` | `/linkage` | Save an analyst linkage verdict |
| `GET` | `/stats` | Aggregate statistics for the Analysis dashboard |
| `GET` | `/export/csv` | Export all reports as CSV |
| `GET` | `/export/geojson` | Export geocoded points as GeoJSON |
| `POST` | `/import/bulletin` | Upload a PDF bulletin and parse it into reports |
| `POST` | `/import/excel` | Upload an Excel file and bulk-import reports |

### `models.py` — Database

- Defines the `Report` and `CaseLinkage` SQLAlchemy models
- `init_db()` runs on startup: creates tables if they don't exist, then runs **safe migrations** — tries `ALTER TABLE ... ADD COLUMN` for each known new column and silently ignores if it already exists. This means the database schema upgrades automatically without losing data.

### `schemas.py` — I/O validation

Pydantic models (`ReportCreate`, `ReportUpdate`, `ReportOut`) validate and serialize all API inputs and outputs.

### `weather.py` — Historical weather

When NLP analysis runs on a report, it calls the **Open-Meteo archive API** (free, no API key needed) to fetch historical weather for the incident date and city. Returns temperature, feels-like, weather description, precipitation, wind, and daytime/nighttime. Stored in `ai_suggestions.weather` and displayed as a weather card in the Narrative tab.

---

## 7. Frontend — Pages & Components

### Pages

#### `CodingScreen.tsx` — The core workspace
The main page. Split layout: narrative on the left (dark panel, immutable after creation), coding fields on the right.

**Left panel:**
- Source narrative (read-only, dark background — visually signals immutability)
- Analyst Transcription textarea (editable cleaned version)
- Analyst Interpretive Summary textarea
- Timeline strip showing coded field state
- Tags input

**Right panel — tab bar with 7 sections:**

| Tab | What it codes |
|-----|--------------|
| **Basics** | Date/time, city, neighbourhood, location stages (3 collapsible sub-panels) |
| **Encounter** | Negotiation & Approach, Violence Indicators, Early Escalation Detail (3 collapsible sub-panels) |
| **Mobility** | Movement, Geography, Assessment (3 collapsible sub-panels) |
| **Suspect** | Suspect Description, Vehicle (2 collapsible sub-panels) |
| **Narrative** | NLP signals panel, escalation arc, weather card, analytic scores, coder notes |
| **GIS** | Raw addresses, normalized addresses, precision/source/confidence for each of 3 location points, lat/lon display |
| **Scoring** | Behavioral domain breakdown showing how coded fields map to similarity weights |

**Toolbar features:**
- Case ← → navigation with `X / N` counter
- Coding status badge + status selector dropdown
- Autosave indicator ("Saved 23s ago")
- AI Suggest button (calls Claude)
- NLP Analyze button (runs spaCy)
- Find Similar button
- Manual Save button
- Export CSV button

**Keyboard shortcuts:**
- `Ctrl+S` — save
- `Ctrl+←` / `Ctrl+→` — navigate to previous/next case

**Collapsible section panels** (`SectionPanel.tsx`):
Each section panel shows a progress bar and coded/total count. Automatically collapses when all its fields are filled.

**Field provenance system** (`FieldRow.tsx`):
Every field has a colored left border indicating its provenance state. AI-suggested fields show an "Accept" chip. Analyst can mark a field as reviewed.

#### `CaseList.tsx` — Case browser
Lists all reports with filtering. Filters include: coding status, city, violence indicators (coercion, movement, physical force, sexual assault, vehicle), date range, free-text search. Clicking a case navigates to its CodingScreen.

#### `Analysis.tsx` — Statistics dashboard
Aggregate view across all coded cases:
- KPI stat cards: total cases, coding progress, key indicator counts
- NLP signal bars: stacked bar charts showing rank-1 (strong) vs rank-2 (possible) signal counts for coercion, physical force, sexual assault, movement, weapon
- Year breakdown, city/neighbourhood distribution
- Vehicle make/colour/type breakdowns, repeated plate fragments
- All stat cards are clickable — click to navigate to CaseList filtered to matching cases

#### `MapView.tsx` — GIS map
Interactive Google Maps view showing:
- Color-coded circle markers: red (initial contact), orange (incident), indigo (destination)
- Dashed polylines connecting the three location stages (initial contact → incident → destination)
- Click marker → InfoWindow with report ID, city, point type, coercion warning, "Open report" and "Street View" buttons
- **Street View** — built-in pegman drag control, or "Street View" button per marker jumps directly to that coordinate
- Address search via Google Places Autocomplete
- Filter by coercion; toggle movement lines
- Requires `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`

#### `ImportBulletin.tsx` — Bulk import
Upload a PDF bulletin or Excel file. The backend parses it into individual incidents using either Claude (AI parse) or rules-based extraction. Analyst reviews the parsed fields before saving.

#### `SimilarCasesPage.tsx` — Similarity search
For a given report, runs the similarity engine against all other coded cases. Shows ranked candidates with a similarity score breakdown. Clicking "Compare" opens the Linkage screen.

#### `LinkageScreen.tsx` — Side-by-side comparison
Full side-by-side comparison of two cases:
- All shared fields displayed in a three-column layout (Case A | field name | Case B)
- Similarity dimension strip showing domain scores
- Behavioral domain breakdown showing joint-present, discordant, and absent fields
- Analyst verdict panel: mark as Possible Link / Unlikely Link / Needs Review + notes

### Components

| Component | Purpose |
|-----------|---------|
| `Layout.tsx` | Nav header with logo + nav links. Wraps every page. |
| `FieldRow.tsx` | Single field row with label, input (text/select/yesno/textarea), provenance border, AI suggestion chip, NLP badge slot, mark-reviewed button |
| `TimelineStrip.tsx` | Horizontal strip at the bottom of the narrative panel showing the coded state of key fields |
| `SectionPanel.tsx` | Collapsible panel with Lora header, amber progress bar, coded/total pill. Auto-collapses when complete. |
| `Toast.tsx` | Toast notification system. `ToastProvider` wraps the app; `useToast()` hook fires notifications from any component. |

---

## 8. AI & NLP Pipeline

There are **two independent AI systems** that operate separately and never auto-write to fields.

### System 1 — Claude (Anthropic API) — `ai.py`

**Triggered by:** "AI Suggest" button in CodingScreen toolbar.

**What it does:**
Sends the raw narrative to `claude-3-5-haiku` with a structured prompt asking it to extract ~35 field values as JSON. Returns suggestions for: incident date, location, approach type, all violence indicators, mobility fields, suspect/vehicle description, escalation scores, summary, key quotes, and a `flags` array of notable signals.

Suggestions are displayed as yellow "Accept" chips next to each field. The analyst decides whether to accept or ignore each one. Accepting a suggestion sets the field value and marks provenance as `analyst_filled`.

**Bulletin parsing:** "Import Bulletin" also uses Claude to parse multi-incident PDF bulletins into structured per-incident JSON when AI parsing is selected.

### System 2 — spaCy NLP — `nlp_analysis.py`

**Triggered by:** "NLP Analyze" button in CodingScreen toolbar.

**What it does:**
Runs the narrative through `spaCy en_core_web_sm` and a hand-crafted vocabulary system to independently detect:

| Signal | Method |
|--------|--------|
| **Coercion** | Subject-Verb-Object dependency parsing; verbs like grab/hold/restrain/pin with person-directed objects |
| **Physical force** | SVO patterns with verbs like punch/kick/choke/strangle |
| **Sexual assault** | Primary phrase match (rape, sexual assault) + secondary phrase match (forced to perform, without consent) |
| **Movement/transport** | SVO patterns with verbs like drive/take/transport/lure |
| **Weapon** | Weapon term detection with negation checking |
| **Escalation arc** | Detects narrative arc stages (negotiation → refusal → pressure → threats → physical → sexual violence → robbery) and scores 1–5 |
| **Location hints** | Extracts likely location names from the narrative as clickable chips in the GIS fields |
| **Environment** | Infers location type (e.g. "vehicle", "hotel", "alley") and area character |
| **Temporal** | Extracts time-of-day bucket and date certainty |

Each signal is ranked:
- **Rank 1** — Strong grammatical evidence (SVO pattern or primary phrase)
- **Rank 2** — Possible / keyword present but uncertain
- **Rank 3** — No signal (not shown in UI)

NLP results appear as colored badges on the relevant fields and in the full NLP Signals Panel in the Narrative tab. They **never write to any field** — analysts must accept or reject each signal.

**Provenance stamping:** Results are tagged with `_source_report_id` and `_analyzed_at` so the UI can detect if the stored NLP data is stale (was generated for a different narrative).

---

## 9. Similarity & Linkage Engine

**`similarity.py`** — implements a weighted behavioral similarity algorithm based on published criminological research (Tonkin et al. 2025, Tonkin et al. 2017, Hobson et al. 2021).

### How it works

**Step 1 — Binary field comparison**
~22 behavioral fields are compared between two cases using OR-based weights:

| Domain | Fields | Weight tier |
|--------|--------|------------|
| Control behaviors | physical_force, coercion_present, threats_present, pressure_after_refusal, movement_control | Q1 (2.0) / Q2 (1.5) |
| Sexual behaviors | sexual_assault, stealthing, refusal_present | Q1 / Q2 |
| Style/approach | robbery_theft, verbal_abuse, negotiation, service/payment discussed | Q3 (1.0) / Q4 (0.5) |
| Escape/mobility | movement_present, entered_vehicle, public→private shift, cross-boundary | Q3 |
| Target selection | deserted, repeat_suspect_flag, repeat_vehicle_flag | Q3 |

**Step 2 — Domain scoring**
Each domain produces a score that accounts for:
- **Joint presence** (both cases = yes) — positive signal
- **Joint absence** (both cases = no) — weak positive signal (consistent behavior)
- **Discordant** (one yes, one no) — negative signal

**Step 3 — Specialty dimensions**
| Dimension | What it checks |
|-----------|---------------|
| Vehicle | make, colour, plate fragment overlap |
| Suspect description | text similarity of free-text descriptions |
| Temporal | day of week, time of day bucket match |
| Geographic | city, neighbourhood, location type match |
| Repeat flags | explicit `repeat_suspect_flag` / `repeat_vehicle_flag` overlap |

**Step 4 — Final score**
Weighted sum across all dimensions, normalized 0–100. Displayed to analysts with a full breakdown of which fields matched, which were discordant, and a one-sentence reason per dimension. The UI shows color-coded field agreement rows (green = joint present, red = discordant, gray = both absent).

---

## 10. GIS & Mapping

Each report can have **three geocoded points**:

| Point | Fields |
|-------|--------|
| Initial contact | `lat_initial`, `lon_initial`, `initial_contact_address_raw/normalized` |
| Primary incident | `lat_incident`, `lon_incident`, `incident_address_raw/normalized` |
| Destination | `lat_destination`, `lon_destination`, `destination_address_raw/normalized` |

Each point has a full confidence metadata block: `precision` (exact/approximate/unknown), `source` (stated/inferred/unclear), `confidence` (high/medium/low/none), and `analyst_notes`.

**MapView** renders:
- Circle markers color-coded by violence severity (red/amber/gray)
- Polylines connecting the three points per case — visually showing victim movement trajectories
- Click popups with case summary and link to CodingScreen
- Nominatim address search to pan the map

**GeoJSON export** (`/export/geojson`) produces a standard GeoJSON FeatureCollection of all geocoded points, importable into QGIS or any GIS tool.

---

## 11. Data Flow — End to End

```
1. IMPORT
   Analyst pastes narrative OR uploads PDF bulletin
        ↓
   POST /reports  →  creates Report row with raw_narrative
   (Bulletin: POST /import/bulletin → Claude parses → multiple reports)

2. AI SUGGEST (optional)
   Analyst clicks "AI Suggest"
        ↓
   POST /suggest  →  Claude reads narrative → returns JSON suggestions
   Suggestions stored in component state (NOT yet saved to DB)
   Yellow "Accept" chips appear on fields

3. NLP ANALYZE (optional)
   Analyst clicks "NLP Analyze"
        ↓
   POST /reports/:id/analyze
     → nlp_analysis.py runs spaCy on raw_narrative
     → weather.py fetches Open-Meteo data for incident date + city
     → Results saved to report.ai_suggestions.nlp + .weather
   NLP badges appear on fields, signals panel populates

4. MANUAL CODING
   Analyst fills fields one by one
   Each change: field_provenance[key] = "analyst_filled"
   Autosave fires 2s after last change (PATCH /reports/:id)
   OR analyst clicks Save manually

5. SIMILARITY CHECK
   Analyst clicks "Find Similar"
        ↓
   GET /reports/:id/similar
     → similarity.py compares against all coded cases
     → Returns ranked list with score breakdowns
   Analyst selects a candidate → opens LinkageScreen

6. LINKAGE VERDICT
   Analyst reviews side-by-side comparison
        ↓
   POST /linkage  →  saves CaseLinkage row with analyst verdict

7. ANALYSIS
   GET /stats  →  aggregates across all reports
   Analysis dashboard shows prevalence bars, KPIs, breakdowns
   Clicking a stat card → navigates to CaseList with matching filter

8. EXPORT
   GET /export/csv      → full dataset as CSV
   GET /export/geojson  → geocoded points as GeoJSON (for QGIS)
```

---

## 12. File Structure

```
Red Light Alert/
│
├── redlight.db              ← SQLite database (all your case data lives here)
├── requirements.txt         ← Python dependencies
├── start.bat                ← Windows launcher (no AI)
├── start_with_ai.bat        ← Windows launcher (prompts for API key)
├── start_mac.sh             ← Mac/Linux launcher
├── APP_OVERVIEW.md          ← This file
├── UI_UX_IMPROVEMENTS.md    ← Planned UI improvements backlog
│
├── backend/
│   ├── main.py              ← FastAPI app, all API routes
│   ├── models.py            ← SQLAlchemy models + DB init/migration
│   ├── schemas.py           ← Pydantic request/response schemas
│   ├── ai.py                ← Claude API integration (suggest + bulletin parse)
│   ├── nlp_analysis.py      ← spaCy violence detection pipeline
│   ├── similarity.py        ← Weighted case similarity engine
│   ├── weather.py           ← Open-Meteo historical weather lookup
│   ├── parser.py            ← Rules-based bulletin text parser
│   └── import_excel.py      ← Excel batch import handler
│
└── frontend/
    ├── dist/                ← Built static files served by FastAPI
    ├── src/
    │   ├── App.tsx           ← Router + ToastProvider wrapper
    │   ├── main.tsx          ← React entry point
    │   ├── index.css         ← Global CSS variables + utility classes
    │   ├── api.ts            ← All API calls (typed, centralized)
    │   ├── types.ts          ← TypeScript interfaces for all data structures
    │   │
    │   ├── components/
    │   │   ├── Layout.tsx        ← Nav header, app shell
    │   │   ├── FieldRow.tsx      ← Single coded field with provenance, AI chip
    │   │   ├── TimelineStrip.tsx ← Horizontal field-state timeline
    │   │   ├── SectionPanel.tsx  ← Collapsible section with progress bar
    │   │   └── Toast.tsx         ← Toast notification system
    │   │
    │   └── pages/
    │       ├── CodingScreen.tsx      ← Main coding workspace
    │       ├── CaseList.tsx          ← Case browser + filtering
    │       ├── Analysis.tsx          ← Statistics dashboard
    │       ├── MapView.tsx           ← GIS / Leaflet map
    │       ├── ImportBulletin.tsx    ← PDF/Excel bulletin import
    │       ├── SimilarCasesPage.tsx  ← Similarity search results
    │       └── LinkageScreen.tsx     ← Side-by-side case comparison
    │
    ├── package.json
    └── vite.config.ts
```

---

## Key Design Principles

- **Human-led, auditable** — AI never writes to fields without analyst confirmation. Every field carries a provenance tag. An audit log tracks all changes.
- **Privacy-conscious** — all data stays local (SQLite file). No cloud sync. The only outbound calls are to the Anthropic API (narratives), Open-Meteo (dates/cities, no narrative), and Google Maps API (map tiles, address search, Street View — no narrative data).
- **Research-grade** — the similarity algorithm is grounded in published criminological research. NLP signals are ranked and explained, not just flagged. Linkage verdicts are logged with analyst name and timestamp.
- **Resilient schema** — the database auto-migrates on startup. New columns are added safely without data loss, making it safe to update the app while preserving existing case data.
