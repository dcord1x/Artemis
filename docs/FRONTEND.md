# Frontend Guide

React 18 + TypeScript SPA built with Vite. Source in `frontend/src/`.

Dev server: `npm run dev` (port 5173, proxies `/api/*` to backend on 8000).
Production bundle: `frontend/dist/` (served directly by FastAPI).

---

## Pages (`src/pages/`)

### CodingScreen.tsx
Main coding workspace. Two-column layout:
- **Left** — raw narrative (immutable, scrollable)
- **Right** — 7-tab interface: Basics | Encounter | Mobility | Suspect | Narrative | GIS | Scoring

Features:
- Autosave on field change
- AI suggestion chips (accept / reject per field)
- NLP badge overlay from spaCy results
- Provenance border color per field state (unset → ai_suggested → analyst_filled → reviewed)
- `SectionPanel` components auto-collapse when all fields are filled

### CaseList.tsx
Filterable report browser. Filters: coding status, city, violence indicators (coercion, physical force, sexual assault, threats, vehicle), date range, free-text search, NLP signals.

Each row shows report ID, date, city, coding status, and key violence flags. Clicking opens CodingScreen.

### Analysis.tsx
Statistics dashboard:
- KPI cards (total cases, coded %, violence signal rates)
- NLP signal prevalence bars (coercion, physical, sexual, movement, weapon, escalation)
- Breakdowns by year, city, vehicle presence
- All stat cards and bars are clickable → navigates to CaseList with matching filters

### MapView.tsx
Interactive Leaflet map:
- Color-coded case markers by severity / coding status
- Movement polylines (initial contact → incident → destination)
- Address search via Nominatim
- Filters by city and coding status
- Click marker to open case details

### ImportBulletin.tsx
PDF or Excel upload interface:
- Choose AI parse (Claude) or rules-based parse
- Review extracted fields before saving
- Duplicate detection runs automatically before save
- Supports bulk save of multiple incidents from one file

### SimilarCasesPage.tsx
Given a focal report, fetches and ranks similar cases from the similarity engine. Shows:
- Ranked candidate list with overall score (0–100)
- Per-domain score breakdown (control, sexual, style, mobility, etc.)
- Link to open full side-by-side comparison

### LinkageScreen.tsx
Side-by-side comparison of two specific cases:
- Field-by-field diff view
- Similarity score and domain breakdown
- Analyst verdict panel: `possible_link` | `unlikely_link` | `needs_review`
- Notes field; verdict saved to `case_linkages` table

### ResearchOutputs.tsx
Research-oriented export and aggregate views. Connects to `/research/aggregate` and export endpoints.

---

## Components (`src/components/`)

### FieldRow.tsx
Single coded field row. Renders:
- Field label
- Input widget (text, select, textarea — determined by field type)
- Provenance-colored left border
- AI suggestion chip (accept/reject buttons appear when `ai_suggested`)
- NLP badge when spaCy flagged the field

Used by every section of CodingScreen.

### SectionPanel.tsx
Collapsible group of `FieldRow` components. Shows a progress bar (fields filled / total). Auto-collapses when all fields in the section have a non-empty value.

### TimelineStrip.tsx
Visual strip showing the provenance state of all fields in a section at a glance. Color bands: grey (unset), yellow (ai_suggested), blue (analyst_filled), green (reviewed).

### GisMapModal.tsx
Inline Leaflet map modal for geocoding a single address. Shows the geocoded point and lets analyst accept or adjust coordinates before saving.

### ParseViewer.tsx
Displays the raw output of a bulletin parse (AI or rules-based) as a reviewable table before bulk-save. Highlights fields that are missing or low-confidence.

### Layout.tsx
Top navigation header with logo, page links, and active-route highlighting. Wraps every page.

### Toast.tsx
Notification system. Auto-dismissing toasts for save confirmations, errors, and AI suggestion results.

---

## Key Source Files

| File | Purpose |
|---|---|
| `types.ts` | TypeScript `Report` interface and all related types |
| `api.ts` | HTTP client functions for every backend endpoint |
| `App.tsx` | React Router setup; maps routes to pages |
| `main.tsx` | React entry point |
| `index.css` / `App.css` | Global styles + Tailwind customizations |

---

## State Management

No global state library. State flows via:
- Component `useState` / `useEffect` for local UI state
- Direct API calls in page components via `api.ts`
- URL query params for CaseList filters (preserves state on navigation)

---

## Routing

| Route | Page |
|---|---|
| `/` | CaseList |
| `/code/:reportId` | CodingScreen |
| `/import` | ImportBulletin |
| `/analysis` | Analysis |
| `/map` | MapView |
| `/similar/:reportId` | SimilarCasesPage |
| `/linkage/:reportIdA/:reportIdB` | LinkageScreen |
| `/research` | ResearchOutputs |
