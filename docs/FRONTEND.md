# Frontend Guide

React 19 + TypeScript SPA built with Vite. Source in `frontend/src/`.

Dev server: `npm run dev` (port 5173, proxies `/api/*` to backend on 8000).
Production bundle: `frontend/dist/` (served directly by FastAPI with `Cache-Control: no-store` on `index.html`).

---

## Pages (`src/pages/`)

### CodingScreen.tsx
Main coding workspace. Resizable two-column split layout:
- **Left** — raw narrative (immutable, dark background), analyst transcription textarea, analyst summary textarea, timeline strip, tags
- **Right** — 8-tab interface

**Tabs:**

| Tab | Contents |
|-----|---------|
| **Basics** | Date/time, city, neighbourhood, three location stages with city-confidence selects |
| **Stages** *(new)* | `StageSequencer` component — analyst-defined ordered stages, each with behaviours, conditions, and location |
| **Encounter** | Negotiation & Approach, Violence Indicators, Early Escalation Detail (3 collapsible sub-panels) |
| **Mobility** | Movement, Geography, Assessment (3 collapsible sub-panels) |
| **Suspect** | Suspect Description, Vehicle |
| **Narrative** | NLP signals panel, escalation arc, weather card, escalation/resolution selects, analytic scores, coder notes |
| **GIS** | Raw/normalized addresses, precision/source/confidence, lat/lon for 3 points |
| **Scoring** | Behavioral domain breakdown showing similarity weight mapping |

**Toolbar:** case ← → navigation, coding status badge + selector, autosave indicator, AI Suggest, NLP Analyze, Find Similar, Save, Export CSV.

**Keyboard shortcuts:** `Ctrl+S` save, `Ctrl+←`/`Ctrl+→` navigate cases.

### CaseList.tsx
Filterable case browser. Filters: coding status, city, violence indicators, date range, free-text search, NLP signals. Each row shows report ID, date, city, coding status, key violence flags.

### Analysis.tsx
Aggregate statistics dashboard:
- KPI stat cards (total, coded, violence rates) — all clickable → filtered CaseList
- NLP signal prevalence bars (coercion, physical, sexual, movement, weapon, escalation)
- Year breakdown, city/neighbourhood distribution
- Vehicle make/colour/type breakdowns, repeated plate fragments

### MapView.tsx
Interactive Google Maps view:
- Color-coded circle markers: red (initial contact), orange (incident), indigo (destination)
- Dashed movement polylines per case
- Click marker → InfoWindow with report ID, city, coercion warning, "Open report" and "Street View"
- Street View — pegman drag or per-marker button
- Google Places Autocomplete address search
- Filter by coercion flag; toggle movement lines
- Requires `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`

### ImportBulletin.tsx
PDF or Excel upload. Choose AI parse (Claude) or rules-based. Duplicate detection runs automatically after parse — exact matches (red) and possible matches (amber) shown per card. DupReviewModal intercepts save if any flagged item is selected.

### SimilarCasesPage.tsx
For a focal report, fetches ranked similar cases from the similarity engine. Shows score + per-domain breakdown. "Compare" opens LinkageScreen.

### LinkageScreen.tsx
Side-by-side comparison of two cases. Field-by-field diff, similarity domain scores, analyst verdict panel (`possible_link` | `unlikely_link` | `needs_review`) with notes saved to `case_linkages`.

### ResearchOutputs.tsx
Research-oriented aggregate analysis. Five tabs — **Stage Patterns is the default**:

| Tab | Contents |
|-----|---------|
| **Stage Patterns** *(new, default)* | Filter panel (stage type, visibility, guardianship), matching case IDs, stage frequency bars, sequence frequency, behaviour/response frequencies, conditions-by-stage cross-tab table |
| **Encounter Sequences** | NLP-derived encounter sequence frequencies, bigrams, escalation pathways |
| **Mobility Pathways** | Movement/route pattern aggregates |
| **Environmental Patterns** | Indoor/outdoor, public/private, deserted distributions + violence cross-tabs |
| **Case Sequence Table** | Per-case sequence with provisional flags |

---

## Components (`src/components/`)

### StageSequencer.tsx *(new)*
Full stage coding UI. Self-contained — loads/saves its own data via the stage API.

Features:
- **Add Stage** dropdown — pick from 5 fixed stage types (Initial Contact, Negotiation, Movement, Escalation, Outcome)
- **Stage cards** in order with: colored type badge, completion indicator (n/6 fields), ↑↓ reorder arrows, delete button, expand/collapse toggle
- **Expanded panel** — four sub-sections:
  - *Behaviours:* client behaviour checkboxes, victim response checkboxes, turning point textarea
  - *Conditions:* visibility, guardianship, isolation, control — all fixed-option selects with `?` definition tooltips
  - *Location:* label text input, location type select, movement-to-here select
- **Autosave** — 800ms debounce on every field change
- **Validation warning** — yellow banner if no stages are defined when saving as `coded`
- **Sequence strip** — shows the full ordered sequence at the bottom (e.g. `Initial Contact → Negotiation → Escalation → Outcome`)

### FieldRow.tsx
Single coded field row:
- Label, input widget (text / select / textarea / yesno / yesno-extended)
- Provenance-colored left border
- AI suggestion chip (Accept/Reject when `ai_suggested`)
- NLP badge slot (from spaCy results)
- Mark-reviewed button

### SectionPanel.tsx
Collapsible group of `FieldRow` components. Shows progress bar (filled/total). Auto-collapses when all fields have non-empty values.

### TimelineStrip.tsx
Horizontal strip showing provenance state of all fields at a glance. Color bands: grey (unset), yellow (ai_suggested), blue (analyst_filled), green (reviewed).

### DupReviewModal.tsx
Pre-save duplicate review modal. For each flagged incident: incoming vs matched narrative previews, status badge, per-item Skip/Import toggle. Confirm sends only approved items to `/bulk-save`. Escape key and backdrop click close without saving.

### GisMapModal.tsx
Inline Google Maps modal for reviewing geocoded coordinates. Shows all three point types as markers with InfoWindows containing full metadata (raw/normalized address, precision, source, confidence, lat/lon). Street View button per point.

### ParseViewer.tsx
Reviewable table of bulletin parse output before bulk-save. Highlights missing or low-confidence fields.

### Layout.tsx
Top navigation header with logo + page links + active-route highlighting. Wraps every page.

### Toast.tsx
Auto-dismissing notification system. `ToastProvider` wraps the app; `useToast()` hook available anywhere.

---

## Key Source Files

| File | Purpose |
|------|---------|
| `types.ts` | `Report`, `ReportStage`, `StagePatterns`, `SimilarityResult`, `ResearchAggregate`, and all related interfaces |
| `api.ts` | HTTP client for all endpoints — reports CRUD, stage CRUD, stats, research, similarity, import, export |
| `App.tsx` | React Router setup; maps routes to pages |
| `main.tsx` | React entry point |
| `index.css` | Global CSS variables + utility classes |

---

## State Management

No global state library. State flows via:
- Component `useState` / `useEffect` for local UI state
- Direct API calls in page components via `api.ts`
- `StageSequencer` manages its own stage state independently
- URL query params for CaseList filters (preserves state on navigation)

---

## Routing

| Route | Page |
|-------|------|
| `/` | CaseList |
| `/code/:reportId` | CodingScreen |
| `/import` | ImportBulletin |
| `/analysis` | Analysis |
| `/map` | MapView |
| `/similar/:reportId` | SimilarCasesPage |
| `/linkage/:reportIdA/:reportIdB` | LinkageScreen |
| `/research` | ResearchOutputs |
