# Red Light Alert — Full Application Overview

> A specialized harm-report coding and GIS research tool for documenting violence against sex workers. Built for researchers and analysts who need to systematically code, stage-sequence, analyze, and map incident narratives.

---

## Table of Contents

1. [What the App Does](#1-what-the-app-does)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [How to Run](#4-how-to-run)
5. [Data Model](#5-data-model)
6. [Backend — API & Logic](#6-backend--api--logic)
7. [Frontend — Pages & Components](#7-frontend--pages--components)
8. [Stage Sequencing System](#8-stage-sequencing-system)
9. [AI & NLP Pipeline](#9-ai--nlp-pipeline)
10. [Similarity & Linkage Engine](#10-similarity--linkage-engine)
11. [GIS & Mapping](#11-gis--mapping)
12. [Data Flow — End to End](#12-data-flow--end-to-end)
13. [File Structure](#13-file-structure)

> **Last updated: 2026-04-28** — Extended harm fields, GIS modal geocoding, MapView GIS overhaul (heatmap/clustering/draw-filter), Bulletin page, Research Notes, linkage patterns, `logo.png`.

---

## 1. What the App Does

Red Light Alert is a qualitative coding workstation for harm reports. Researchers receive raw narrative reports — written accounts of violent or harmful incidents — and need to systematically extract structured data for research and pattern analysis.

The workflow is:

1. **Import** a raw narrative (paste, or bulk import from PDF/bulletin)
2. **Code** it — fill ~80 structured fields covering incident basics, encounter sequence, mobility, suspect description, GIS locations
3. **Stage-sequence it** — break each report into ordered analyst-defined stages (Initial Contact → Negotiation → Movement → Escalation → Outcome), each carrying behaviours, situational conditions, and location
4. **Use AI assistance** — Claude suggests field values; spaCy NLP flags violence signals independently
5. **Map it** — geocoded locations appear on an interactive Google Maps view with movement trajectories and Street View
6. **Analyze patterns** — statistics dashboard and stage pattern analysis across the whole dataset
7. **Link cases** — a similarity engine compares any two cases and scores how likely they share an offender

The tool is deliberately **human-led**: AI suggestions are never auto-applied. Every field has a provenance state (`unset / ai_suggested / analyst_filled / reviewed`) so the audit trail is always clear.

The core analytic unit is: **stage → behaviour → conditions → location**. This enables queries like: *"Show me all cases where escalation occurred after movement into a private location with absent guardianship."*

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                  Browser (React SPA)                  │
│  CodingScreen │ CaseList │ Analysis │ Map             │
│  ImportBulletin │ Linkage │ ResearchOutputs           │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP/JSON
                        │
┌───────────────────────▼──────────────────────────────┐
│              Python Backend (FastAPI)                 │
│                                                       │
│  main.py         — REST API routes (40+ endpoints)    │
│  models.py       — SQLAlchemy ORM + auto-migrations   │
│  schemas.py      — Pydantic I/O models                │
│  ai.py           — Claude API (field suggest, parse)  │
│  nlp_analysis.py — spaCy violence detector            │
│  similarity.py   — weighted case comparison           │
│  weather.py      — Open-Meteo lookup                  │
│  parser.py       — rules-based bulletin parse         │
│  import_excel.py — Excel batch import                 │
│  research.py     — cross-case aggregate analysis      │
└───────────────────────┬──────────────────────────────┘
                        │ SQLAlchemy
                        ▼
                 redlight.db (SQLite)
          ┌──────────────────────────┐
          │  reports                 │
          │  report_stages  ← NEW    │
          │  case_linkages           │
          └──────────────────────────┘
```

The frontend is a **pre-built static bundle** served directly by the FastAPI backend at `/`. In development, Vite runs on port 5173 with a proxy to the backend on port 8000.

---

## 3. Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | React 19 + TypeScript |
| Frontend build | Vite |
| Routing | React Router v7 |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React |
| Mapping | Google Maps JavaScript API (`@react-google-maps/api`, `@googlemaps/markerclusterer`) |
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
```bat
start.bat    ← builds frontend, checks for git updates, starts backend, opens browser
```

Add `ANTHROPIC_API_KEY` to `backend/.env` to enable AI suggestions.

### Mac / Linux
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
chmod +x start_mac.sh
./start_mac.sh
```

### Development mode (hot reload)
```bash
# Terminal 1 — backend
cd backend && uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend && npm run dev    # runs on :5173, proxies /api → :8000
```

---

## 5. Data Model

All data lives in a single SQLite file: `redlight.db`. Four tables.

### `reports` table

Each row is one coded incident report. ~160+ fields organized by purpose:

| Group | Sample Fields | Purpose |
|-------|--------------|---------|
| **Admin** | `report_id`, `analyst_name`, `coding_status`, `confidence_level` | Source, coder, state |
| **Incident basics** | `incident_date`, `incident_time_*`, `day_of_week`, `city`, `neighbourhood` | When and where |
| **Location stages** | `initial_contact_location/city`, `incident_location_primary/city`, `destination_city` | Three-point location model |
| **Environment** | `indoor_outdoor`, `public_private`, `deserted` | Physical context |
| **Encounter sequence** | `negotiation_present`, `refusal_present`, `coercion_present`, `physical_force`, `sexual_assault`, `exit_type` | Step-by-step events |
| **Extended harm** | `loss_of_consciousness`, `non_consensual_substance`, `substance_administration_notes`, `forced_movement_dragging`, `restraint_confinement`, `weapon_present_used`, `choking_strangulation`, `prevented_exit` | Detailed harm indicators (new) |
| **Early escalation** | `repeated_pressure`, `intimidation_present`, `abrupt_tone_change`, `escalation_trigger` | How situation escalated |
| **Mobility** | `movement_present`, `mode_of_movement`, `entered_vehicle`, `public_to_private_shift`, `offender_control_over_movement`, `unexplained_relocation` | Movement and control |
| **Suspect/vehicle** | `suspect_count`, `suspect_gender`, `vehicle_make/model/colour`, `plate_partial` | Offender description |
| **Narrative coding** | `early_escalation_score`, `escalation_point`, `resolution_endpoint`, `summary_analytic`, `key_quotes`, `coder_notes` | Analyst interpretation |
| **GIS** | `*_address_raw/normalized`, `lat_*/lon_*`, `*_precision/source/confidence` | Three geocoded points with metadata |
| **Metadata** | `field_provenance` (JSON), `audit_log` (JSON), `ai_suggestions` (JSON), `tags` (JSON) | Audit trail |

**Provenance states** for every field:
- `unset` — never touched
- `ai_suggested` — Claude suggested a value, not yet confirmed
- `analyst_filled` — analyst typed or accepted a value
- `reviewed` — analyst explicitly marked as reviewed

### `report_stages` table — NEW

Each row is one analyst-coded stage within a report. Linked to `reports` via `report_id`.

| Field | Values | Purpose |
|-------|--------|---------|
| `report_id` | string | Links to parent report |
| `stage_order` | int (1-based) | Ordering within the report |
| `stage_type` | `initial_contact` \| `negotiation` \| `movement` \| `escalation` \| `outcome` | What type of event this stage represents |
| `client_behaviors` | JSON array | `pressure`, `deception`, `aggression`, `payment_dispute`, `condom_refusal`, `other` |
| `victim_responses` | JSON array | `resistance`, `compliance`, `exit_attempt`, `negotiation`, `other` |
| `turning_point_notes` | text | Free-text description of turning point / key shift |
| `visibility` | `public` \| `semi_public` \| `semi_private` \| `private` \| `unknown` | How visible the interaction was to bystanders |
| `guardianship` | `present` \| `reduced` \| `absent` \| `delayed` \| `unknown` | Whether capable guardians could intervene |
| `isolation_level` | `not_isolated` \| `partially_isolated` \| `isolated` \| `unknown` | Victim's separation from support |
| `control_type` | `victim` \| `offender` \| `shared` \| `unclear` | Who controlled space, transport, movement |
| `location_label` | text | Descriptive label (e.g. "parked car", "hotel room") |
| `location_type` | `public` \| `semi_public` \| `private` \| `unknown` | Type of location at this stage |
| `movement_type_to_here` | `none` \| `walk` \| `vehicle` \| `unknown` | How victim arrived at this stage's location |

### `case_linkages` table

Analyst verdicts on case pairs:
- `report_id_a`, `report_id_b`
- `similarity_score` (float, 0–100, computed)
- `analyst_status`: `possible_link` | `unlikely_link` | `needs_review`
- `analyst_notes` (free text)

### `research_notes` table

Analyst-written analytic notes saved from the Research tab:
- `id`, `analyst_name`, `note_text`, `created_at`
- Managed via `GET/POST/DELETE /research/notes`

---

## 6. Backend — API & Logic

### `main.py` — API routes (40+ endpoints)

**Reports CRUD:**

| Method | Endpoint | What it does |
|--------|----------|-------------|
| `GET` | `/reports` | List all reports. 15+ filter params: `coding_status`, `city`, `coercion_present`, `movement_present`, `date_from/to`, `search`, NLP signal filters, `nlp_pattern`, `nlp_escalation_min` |
| `GET` | `/reports/:id` | Get a single report |
| `POST` | `/reports` | Create a new report |
| `PATCH` | `/reports/:id` | Update any fields |
| `DELETE` | `/reports/:id` | Delete a report |

**Stage CRUD (new):**

| Method | Endpoint | What it does |
|--------|----------|-------------|
| `GET` | `/reports/:id/stages` | List all stages for a report, ordered by `stage_order` |
| `POST` | `/reports/:id/stages` | Create a new stage |
| `PUT` | `/reports/:id/stages/:stage_id` | Update a stage's fields |
| `DELETE` | `/reports/:id/stages/:stage_id` | Delete a stage |
| `PUT` | `/reports/:id/stages/reorder` | Bulk-update `stage_order` for all stages |

**Research:**

| Method | Endpoint | What it does |
|--------|----------|-------------|
| `GET` | `/research/aggregate` | Cross-case sequences, mobility, environment aggregates |
| `GET` | `/research/stage-patterns` | Stage-level cross-case analysis with filter params (`stage_type`, `visibility`, `guardianship`) |
| `GET` | `/research/linkage-patterns` | Repeated vehicles, locations, behaviours across cases |
| `GET/POST/DELETE` | `/research/notes` | Analyst research notes (create, list, delete) |
| `GET` | `/export/bulletin-data` | Structured data bundle for the Bulletin page |

**Other key endpoints:** `/suggest`, `/reports/:id/analyze`, `/stats`, `/parse-bulletin`, `/parse-excel`, `/check-duplicates`, `/bulk-save`, `/reports/:id/similar`, `/linkage`, `/export/csv`, `/export/geojson`

**Excel import (`/parse-excel`)** — now builds a `_bulletin_text` field per row: every column is serialized as `Header: Value` newline-delimited text, providing a human-readable source for the Source Immutable panel.

### `models.py` — Database

- Defines `Report`, `CaseLinkage`, and `ReportStage` SQLAlchemy models
- `init_db()` runs on startup: creates all tables, then runs **safe migrations** (`ALTER TABLE ADD COLUMN`) for any new columns — schema upgrades automatically without data loss

### `schemas.py` — I/O validation

Pydantic models: `ReportCreate`, `ReportUpdate`, `ReportOut`, `SuggestRequest`, `StageCreate`, `StageUpdate`, `StageOut`, `StageReorderItem`

---

## 7. Frontend — Pages & Components

### CodingScreen.tsx — The core workspace

Split layout: narrative on the left (dark panel, immutable), coding fields on the right.

**Right panel — 8-tab interface:**

| Tab | What it codes |
|-----|--------------|
| **Basics** | Date/time, city, neighbourhood, three location stages with city confidence |
| **Stages** *(new)* | Analyst-ordered stage sequence — each stage carries behaviours, conditions, and location |
| **Encounter** | Negotiation & Approach, Violence Indicators, Early Escalation Detail |
| **Mobility** | Movement, Geography, Assessment |
| **Suspect** | Suspect Description, Vehicle |
| **Narrative** | NLP signals, escalation arc, weather card, analytic scores, coder notes |
| **GIS** | Raw/normalized addresses, precision/source/confidence, lat/lon for 3 points |
| **Scoring** | Behavioral domain breakdown showing similarity weight mapping |

### ResearchOutputs.tsx

Research-oriented aggregate analysis. Seven tabs + Research Notes panel:

| Tab | Contents |
|-----|---------|
| **Stage Patterns** *(default)* | Stage type frequency, stage sequence patterns, behaviour/response frequencies, conditions-by-stage cross-tab, isolation + date range filter panel |
| **Encounter Sequences** | NLP-derived encounter sequence frequencies (bigrams, escalation pathways) |
| **Mobility Pathways** | Movement and route pattern aggregates |
| **Environmental Patterns** | Indoor/outdoor, public/private, deserted distributions with violence cross-tabs |
| **Spatial Overview** | Embedded Google Maps overview of all geocoded points |
| **Case Linkage View** | Repeated vehicles, locations, and behaviours across cases |
| **Case Sequence Table** | Per-case encounter sequence with provenance flags |

Includes a **Research Notes** side panel — save, view, and delete analyst notes with `POST/GET/DELETE /research/notes`.

Also includes a **"Generate Bulletin"** button linking to `/bulletin`.

### Other pages

| Page | Purpose |
|------|---------|
| `CaseList.tsx` | Filterable case browser with status, violence flags, date range, NLP signal filters |
| `Analysis.tsx` | KPI dashboard — stat cards, NLP bars, year/city/vehicle breakdowns |
| `MapView.tsx` | Full GIS workstation (see Section 11) |
| `ImportBulletin.tsx` | PDF/Excel upload, duplicate detection, bulk save |
| `SimilarCasesPage.tsx` | Similarity engine ranked results |
| `LinkageScreen.tsx` | Side-by-side case comparison with analyst verdict |
| `BulletinOutput.tsx` | Analytic Summary Report — structured brief sections A–G, filters, embedded map, browser print-to-PDF |

### Components

| Component | Purpose |
|-----------|---------|
| `StageSequencer.tsx` | Full stage coding UI — add/reorder/delete stages; per-stage behaviours, conditions, location; definition tooltips; sequence summary strip |
| `Layout.tsx` | App shell with nav bar; uses `/logo.png` image (38px) instead of inline SVG |
| `FieldRow.tsx` | Single field with label, input, provenance border, AI chip, NLP badge |
| `SectionPanel.tsx` | Collapsible group with progress bar |
| `TimelineStrip.tsx` | Visual field-state overview strip |
| `Toast.tsx` | Auto-dismissing notification system |
| `GisMapModal.tsx` | Geocoded points map modal with click-to-place, geocode-from-address, Places Autocomplete (see Section 11) |
| `DupReviewModal.tsx` | Pre-save duplicate review with Skip / Import controls |

---

## 8. Stage Sequencing System

This is the primary analytic layer for the research study. It was built to satisfy UPDATE.md requirements RQ1–RQ3.

### Analytic unit

Each stage carries four linked components:
```
stage_type  →  behaviours  →  conditions  →  location
```

This enables the key research query: *"Show me cases where escalation occurred after movement into a private location with absent guardianship."*

### Stage types (fixed vocabulary)

| Type | Definition |
|------|-----------|
| `initial_contact` | First moment of interaction |
| `negotiation` | Discussion of terms, services, or payment |
| `movement` | Physical relocation — on foot or by vehicle |
| `escalation` | Shift from negotiation to coercion or violence |
| `outcome` | Resolution — assault completed, escaped, interrupted, etc. |

### Per-stage fields

**Behaviours** — multi-select checkboxes, both parties:
- Client: pressure, deception, aggression, payment dispute, condom refusal, other
- Victim: resistance, compliance, exit attempt, negotiation, other
- Plus free-text turning point notes

**Conditions** — fixed select with definition tooltips:
- Visibility: public → semi-public → semi-private → private → unknown
- Guardianship: present → reduced → absent → delayed → unknown
- Isolation: not isolated → partially isolated → isolated → unknown
- Control: victim / offender / shared / unclear

**Location:**
- Label (free text: "street corner", "parked car")
- Type: public / semi-public / private / unknown
- Movement to here: none / walk / vehicle / unknown

### Cross-case stage patterns (`/research/stage-patterns`)

Returns with optional filters (`stage_type`, `visibility`, `guardianship`):
- Stage type frequency counts
- Condition distributions per stage type
- Behaviour and response frequency rankings
- Stage sequence frequency across all cases
- List of matching `report_id`s for filtered queries

---

## 9. AI & NLP Pipeline

Two independent systems. Neither auto-writes to fields.

### System 1 — Claude (Anthropic API)

**Triggered by:** "AI Suggest" button.

Sends the raw narrative to `claude-3-5-haiku` → returns ~35 field suggestions as JSON. Displayed as yellow "Accept" chips. Accepting sets provenance to `analyst_filled`.

Also used for bulletin parsing (`/parse-bulletin`) when AI mode is selected.

### System 2 — spaCy NLP

**Triggered by:** "NLP Analyze" button.

Runs `en_core_web_sm` + custom vocabulary to detect:

| Signal | Method |
|--------|--------|
| Coercion | SVO dependency parsing (grab/hold/restrain/pin) |
| Physical force | SVO patterns (punch/kick/choke/strangle) |
| Sexual assault | Primary phrase match + secondary contextual match |
| Movement/transport | SVO patterns (drive/take/transport/lure) |
| Weapon | Term detection with negation checking |
| Escalation arc | Stage sequence scoring 1–5 |
| Location hints | Named location-like phrases → clickable chips in GIS fields |
| Environment | Infers location type, area character |
| Temporal | Time-of-day bucket, date certainty |

Each signal ranked: **Rank 1** (strong) / **Rank 2** (possible) / **Rank 3** (none — not shown).

Results stored in `ai_suggestions.nlp`; NLP badges appear on relevant fields and in the Narrative tab signals panel.

---

## 10. Similarity & Linkage Engine

`similarity.py` — weighted behavioral similarity based on Tonkin et al. 2025 methodology. Produces a 0–100 score across domains.

| Domain | Fields |
|--------|--------|
| Control (physical) | `physical_force`, `offender_control_over_movement` |
| Control (coercion) | `coercion_present`, `repeated_pressure`, `intimidation_present` |
| Control (threats) | `threats_present`, `verbal_abuse` |
| Sexual | `sexual_assault`, `stealthing` |
| Style/approach | `robbery_theft`, `negotiation_present`, `service_discussed` |
| Mobility | `movement_present`, `entered_vehicle`, `public_to_private_shift` |
| Vehicle | `vehicle_make`, `vehicle_colour`, `plate_partial` |
| Suspect text | `suspect_description_text` (cosine similarity) |
| Temporal | `incident_time_range`, `day_of_week` |
| Geographic | Haversine distance between geocoded points |

Scoring logic: **joint presence** (positive), **joint absence** (weak positive), **discordant** (negative).

---

## 11. GIS & Mapping

Each report has **three geocoded points**: initial contact, primary incident, destination.

Each point has full metadata: `address_raw`, `address_normalized`, `lat/lon`, `precision` (exact/approximate/unknown), `source` (stated/inferred/unclear), `confidence` (high/medium/low/none), `analyst_notes`.

### MapView (`/map`) — full GIS workstation

Loaded libraries: `places`, `visualization`, `drawing`, `geometry`.

**Layer toggles:**
- Color-coded circle markers (red / orange / indigo) with show/hide per point type
- Dashed polylines showing victim movement trajectories
- **Heatmap layer** (`HeatmapLayer`) — density visualization of all incident points
- **Marker clustering** (`MarkerClusterer` from `@googlemaps/markerclusterer`) — groups nearby markers at low zoom
- **Map type switcher** — roadmap / satellite / terrain

**Draw-to-filter:**
- `DrawingManager` lets analyst draw a polygon or circle on the map
- `filteredPoints` memo uses `google.maps.geometry.poly.containsLocation` (polygon) or `spherical.computeDistanceBetween` (circle) to spatially filter all displayed points and stats to the drawn shape

**Boundary layer:**
- Upload a GeoJSON file to overlay named boundaries (neighbourhoods, policing areas, etc.)

**Other:**
- Click popups with case summary + "Open report" and "Street View"
- Google Places Autocomplete address search
- Bounds fit fires only once on initial load (`hasFitRef`)

### GisMapModal — coding-screen map modal

Opened from the GIS tab in CodingScreen. Now supports interactive coordinate editing:

- **`onGeocode` prop** — callback that writes updated lat/lon (and optionally normalized address) back to the report fields
- **Click-to-place** — analyst selects a point type (initial / incident / destination), clicks the map; coordinates are reverse-geocoded and returned via `onGeocode`
- **Geocode-from-address** — button next to each point resolves the existing normalized address string to lat/lon via Google Geocoder
- **Places Autocomplete** — search bar pans the map to a searched address without affecting coded fields
- **Escape key** — dismisses place-selection mode first, then closes modal

### GeoJSON export

`GET /export/geojson` produces a standard FeatureCollection importable into QGIS.

---

## 12. Data Flow — End to End

```
1. IMPORT
   Paste narrative OR upload PDF bulletin
        ↓
   POST /reports → creates Report row with raw_narrative
   (Bulletin: POST /parse-bulletin → Claude parses → DupReviewModal → POST /bulk-save)

2. CODE (case-level fields)
   Analyst fills Basics, Encounter, Mobility, Suspect, Narrative, GIS tabs
   Each change: field_provenance[key] = "analyst_filled"
   Autosave fires 2s after last change

3. STAGE SEQUENCE (new)
   Analyst clicks Stages tab → Add Stage → picks type
   For each stage: codes behaviours, conditions, location
   Each change autosaves via debounced PUT /reports/:id/stages/:stage_id

4. AI ASSIST (optional)
   POST /suggest → Claude → yellow Accept chips on fields
   POST /reports/:id/analyze → spaCy + weather → NLP badges + signals panel

5. SIMILARITY CHECK
   GET /reports/:id/similar → ranked candidates → LinkageScreen
   POST /linkage → saves analyst verdict

6. ANALYSIS & RESEARCH
   GET /stats → Analysis dashboard (case-level)
   GET /research/stage-patterns → Stage Patterns tab (stage-level cross-case)
   GET /research/aggregate → Encounter sequences, mobility, environment tabs
   GET /research/linkage-patterns → Case Linkage View tab
   GET/POST/DELETE /research/notes → Research Notes panel

7. BULLETIN
   GET /export/bulletin-data → structured data bundle
   /bulletin → BulletinOutput page (sections A–G, filters, map, print-to-PDF)

8. EXPORT
   GET /export/csv → full dataset
   GET /export/geojson → geocoded points for QGIS
   GET /export/research-tables → ZIP of all research CSVs
```

---

## 13. File Structure

```
Red Light Alert/
│
├── redlight.db              ← SQLite database (all case data)
├── requirements.txt         ← Python dependencies
├── start.bat                ← Windows launcher (builds + starts)
├── start_mac.sh             ← Mac/Linux launcher
├── APP_OVERVIEW.md          ← This file
│
├── backend/
│   ├── main.py              ← FastAPI app, all 40+ API routes
│   ├── models.py            ← SQLAlchemy: Report, CaseLinkage, ReportStage
│   ├── schemas.py           ← Pydantic: ReportCreate/Update/Out, Stage schemas
│   ├── ai.py                ← Claude API (suggest + bulletin parse)
│   ├── nlp_analysis.py      ← spaCy violence detection pipeline
│   ├── similarity.py        ← Weighted case similarity engine
│   ├── weather.py           ← Open-Meteo historical weather
│   ├── parser.py            ← Rules-based bulletin text parser
│   ├── import_excel.py      ← Excel batch import handler
│   └── research.py          ← Cross-case aggregate analysis
│
└── frontend/
    ├── dist/                ← Built static files served by FastAPI
    └── src/
        ├── App.tsx              ← Router + ToastProvider
        ├── api.ts               ← All API calls (typed, centralized)
        ├── types.ts             ← Report, ReportStage, StagePatterns, …
        │
        ├── components/
        │   ├── StageSequencer.tsx   ← Stage coding UI (NEW)
        │   ├── FieldRow.tsx         ← Single coded field
        │   ├── SectionPanel.tsx     ← Collapsible section with progress bar
        │   ├── TimelineStrip.tsx    ← Field-state timeline strip
        │   ├── Toast.tsx            ← Notification system
        │   ├── GisMapModal.tsx      ← Geocoded points map modal
        │   ├── DupReviewModal.tsx   ← Pre-save duplicate review
        │   └── ParseViewer.tsx      ← Bulletin parse preview
        │
        └── pages/
            ├── CodingScreen.tsx      ← Main coding workspace (8 tabs)
            ├── CaseList.tsx          ← Case browser + filtering
            ├── Analysis.tsx          ← KPI statistics dashboard
            ├── MapView.tsx           ← Full GIS workstation (heatmap, cluster, draw-filter)
            ├── ImportBulletin.tsx    ← PDF/Excel import
            ├── SimilarCasesPage.tsx  ← Similarity search results
            ├── LinkageScreen.tsx     ← Side-by-side case comparison
            ├── ResearchOutputs.tsx   ← Stage patterns + research aggregates (7 tabs + notes)
            └── BulletinOutput.tsx    ← Analytic Summary Report (sections A–G, PDF export)

---

## Key Design Principles

- **Human-led, auditable** — AI never writes to fields without analyst confirmation. Every field carries a provenance tag. An audit log tracks all changes.
- **Stage-structured analysis** — the core analytic unit is `stage → behaviour → conditions → location`, enabling structured cross-case comparison answering specific research questions.
- **Privacy-conscious** — all data stays local (SQLite). No cloud sync. Outbound calls only: Anthropic API (narratives), Open-Meteo (dates/cities), Google Maps API (tiles, address search, Street View — no narrative data).
- **Research-grade** — similarity algorithm grounded in published criminological research. NLP signals ranked and explained. Linkage verdicts logged with analyst name and timestamp.
- **Resilient schema** — database auto-migrates on startup. New columns and tables are added safely without data loss.
```
