# Red Light Alert — UI/UX Audit & Improvement Plan

## Context

Red Light Alert is a specialized harm-report coding and GIS research tool for documenting violence against sex workers. It is used by researchers and analysts who spend long sessions coding case files, running NLP analysis, and identifying patterns across cases. The tool must be trustworthy, focused, and efficient — it handles sensitive data and requires analyst concentration. The current aesthetic (parchment palette, Lora serif, DM Sans) is a strong foundation. The gaps are primarily in **density management**, **workflow continuity**, **information architecture**, and **missing analytical UX**.

---

## Aesthetic Direction

**Refined Archival / Intelligence Brief**
The app should feel like a beautifully designed research workstation — think declassified government brief meets academic journal. Not clinical/cold, not flashy. Serious, purposeful, legible. The warm parchment foundation is correct. Improvements push it toward:
- Stronger editorial typography hierarchy
- Structured white space (breathing room between sections)
- Subtle depth (paper-like surface layering, light grain texture)
- Purposeful motion (only where it clarifies state changes)
- Color used only as signal (red = danger/violence, amber = uncertain, green = confirmed, never decorative)

---

## 1. UI IMPROVEMENTS (Visual & Interaction Design)

### 1.1 CodingScreen — The Core Problem

**Issue:** ~80 fields on one page is cognitively overwhelming. There is no sense of progress, no section collapse, no way to jump between sections.

**Fixes:**
- **Collapsible section panels** with a header showing `fields coded / total` per section (e.g., `Encounter 4/12 ✓`). Completed sections auto-collapse.
- **Section progress bar** — a mini horizontal progress strip at the top of each section panel. Color transitions: gray → amber (in progress) → green (complete).
- **Sticky section jump rail** — a narrow vertical sidebar (left edge) with section abbreviations (APP / NEG / MOB / COE / VIO / GIS). Clicking scrolls to that section. Active section highlighted. This replaces the current static TimelineStrip or complements it.
- **Field search** — a small magnifying glass in the header bar of CodingScreen that opens a command-palette style search: type "vehicle" and it jumps to and highlights the vehicle fields. Essential for a 80-field form.
- **Autosave indicator** — subtle "Saved 3s ago" ghost text in the toolbar. Replaces the need to manually remember to save. Fire a PATCH on field blur or after 2s of inactivity.
- **Accept All Suggestions button** — one-click to accept all pending AI suggestions in a section. Currently requires accepting one-by-one.

### 1.2 Navigation & Wayfinding

**Issue:** No breadcrumbs, no "currently viewing case X of N" context, no back navigation from detail views.

**Fixes:**
- **Breadcrumb bar** below the nav header: `Cases > Report #2024-0042 > Linkage Comparison`
- **Case counter pill** on CodingScreen: `Case 12 of 47 in-progress` with ← → arrow navigation to move between cases in the current filter set (like a lightbox). Critical for high-volume coding sessions.
- **Last visited indicator** on Cases list — a subtle `→ current` marker on the case the analyst was last working on. Restore scroll position on back navigation.

### 1.3 CaseList — Density & Scannability

**Issue:** Card list is functional but dense. Quick indicators (colored dots) lack labels. Filtering is comprehensive but visually cluttered.

**Fixes:**
- **Two-mode list** — toggle between Card view and Table/Spreadsheet view. Table view shows one row per case with inline yes/no/— cells for key fields. Analysts who code dozens of cases prefer a dense row view.
- **Column picker** for table mode — choose which fields appear as columns.
- **Inline status badge** that is larger and clearer: `CODED`, `IN PROGRESS`, `UNCODED`, `REVIEWED` — full text, not just a dot.
- **Filter panel as a collapsible sidebar** (left side, 220px wide) instead of a top bar. Saves vertical space for the case list.
- **Bulk action toolbar** — appears when checkboxes are selected: "Mark Reviewed (3)", "Export Selected (3)", "Delete (3)". Currently there is no bulk workflow.

### 1.4 Analysis Dashboard

**Issue:** Statistics are text-based bars. No visual charts. Clickable stat tiles are underutilized. No date range filter to see trends over time.

**Fixes:**
- **Recharts or Visx integration** for:
  - Violence indicator prevalence — horizontal bar chart
  - Incidents by month/quarter — area or bar chart
  - NLP escalation score — histogram distribution
  - City/neighbourhood breakdown — treemap or ranked bars
- **Date range slider** — filter all stats to a specific time window. Show trends (this quarter vs. last quarter).
- **KPI cards at top** — bold typographic display of 4 key numbers: Total Cases, Coding Progress %, High-violence Signal %, Unique Suspects Flagged.
- **Clickable drill-through** is already implemented — improve it with a slide-in panel (not full navigation) showing matching cases without losing dashboard context.

### 1.5 MapView — Missing Analytical Power

**Issue:** Map shows point markers but has no clustering, no heatmap, no time filter, no hover tooltip (only click popup).

**Fixes:**
- **Marker clustering** using Leaflet.markercluster — essential for dense datasets.
- **Heatmap layer toggle** — show density without individual markers, using Leaflet.heat.
- **Movement trajectory lines** already exist — add a toggle to show/hide them.
- **Time filter slider** on the map — filter visible incidents by date range with a draggable slider.
- **Hover tooltip** on markers — show case summary on hover, full popup on click.
- **Layer controls** — checkboxes to show: Initial Contact / Incident Location / Destination independently.
- **Export map as PNG** — basic screenshot export for reports.

### 1.6 ImportBulletin

**Issue:** No progress indicator for AI parsing of multi-page PDFs. No de-duplication check before saving.

**Fixes:**
- **Parsing progress indicator** — animated step-by-step: "Extracting text… → Sending to AI… → Parsing fields… → Ready to review."
- **Duplicate detection** — before bulk save, check against existing reports by date+city+narrative similarity. Show a warning "2 incidents may already exist."
- **Field validation warnings** on preview — highlight fields with impossible values (e.g., incident date in future, time range conflict).

### 1.7 LinkageScreen

**Issue:** Side-by-side comparison is functional but dimension score bars are small and unlabeled. Verdict workflow lacks confirmation.

**Fixes:**
- **Dimension bar tooltips** explaining what each dimension measures.
- **Field agreement count summary** — bold display: `14 fields agree / 3 discordant / 8 absent in both`.
- **Verdict confirmation dialog** before saving — "You are marking these cases as Possible Link. This will be logged with your name. Confirm?"
- **Previous verdicts log** — show prior linkage decisions on this case pair with analyst name + timestamp.

### 1.8 Typography & Visual Polish

- **Increase base font size** from 13.5px to 14px. At 13.5px, long coding sessions cause eye strain.
- **Section header hierarchy** — section labels should use Lora at a larger size with a left border accent stripe, not just small-caps text. Creates stronger visual anchoring.
- **Empty state designs** — currently empty states show nothing or minimal text. Add purposeful empty states: "No cases yet — import your first bulletin" with a subtle line illustration.
- **Toast notification system** — for save confirmations, export completions, analysis completions. Currently there is no feedback for completed actions.
- **Loading skeleton screens** — replace spinners with content-shaped skeletons for case list and analysis data loads.
- **Focus ring styling** — ensure all interactive elements have a visible custom focus ring (accessibility + keyboard nav).

---

## 2. NEW FEATURES & UX GAPS

### 2.1 🔴 CRITICAL GAPS

**A. Narrative Annotation / Text Highlighting**
The narrative text is displayed read-only. Analysts cannot highlight spans and link them to fields. This is the core workflow of qualitative coding tools (MAXQDA, Atlas.ti, NVivo).

**Proposed:** Allow analysts to select text in the narrative and:
- Assign the span to a field (e.g., select "he grabbed her arm" → link to `coercion_present = yes`, mark evidence span)
- Add a memo/annotation note to the span
- Highlighted spans render with color-coded underlines by category (red = violence, amber = movement, blue = suspect)
- NLP-detected evidence already exists in `ai_suggestions` — render it as clickable highlighted spans on the narrative

**B. Quick-Code / Triage Mode**
For initial triage of newly imported cases, analysts only need to assess ~10 key violence indicators, not all 80 fields. There is no streamlined mode for this.

**Proposed:** A "Triage Mode" toggle on CodingScreen that shows only: coercion, movement, physical_force, sexual_assault, threats, vehicle_present, weapon, escalation_score. Saves as `coding_status = in_progress`. Allows rapid first-pass assessment before full coding.

**C. Autosave**
Currently analysts must manually hit Save. On a 80-field form, this risks data loss. Auto-save on blur or after 2s idle is essential.

**D. Undo / Redo**
No ability to undo a field change. Especially risky when "Accept All Suggestions" is added. Should maintain a local change stack (Ctrl+Z / Ctrl+Y).

### 2.2 🟠 HIGH VALUE

**E. Offender Profile Builder**
When cases are linked, there is no way to aggregate field values across linked cases into a composite offender profile.

**Proposed:** On SimilarCasesPage / LinkageScreen, a "Build Profile" button that aggregates: most common vehicle make/color, plate fragments, suspect description consensus, behavioral patterns across all "Possible Link" cases. Exported as a PDF profile sheet.

**F. Case Timeline View**
There is a MapView showing spatial distribution but no temporal view. Cases have dates — a horizontal timeline would reveal temporal clustering patterns.

**Proposed:** A Timeline page (or tab on Analysis) showing cases as dots on a horizontal time axis. Group by month/week. Color by violence severity. Click to open case. Filter by city or NLP signal.

**G. Validation Rules Engine**
Logical inconsistencies can slip through with 150 fields:
- `movement_present = no` but `entered_vehicle = yes`
- `sexual_assault = yes` but no encounter fields filled
- `vehicle_present = no` but vehicle make/color filled

**Proposed:** A validation layer that runs on save and shows a non-blocking warning panel: "3 field inconsistencies found — review before marking Coded."

**H. Inter-rater Reliability Tracker**
If two analysts code the same case independently, there's no mechanism to compare codings and calculate agreement. This is essential for research validity.

**Proposed:** Allow a second analyst to create a "parallel coding" of an existing case. A comparison view shows field-by-field agreement/disagreement and calculates Cohen's Kappa for key fields.

**I. Report Export / Print View**
No way to export a single case as a formatted report for sharing with stakeholders, law enforcement, or academic papers.

**Proposed:** A "Generate Report" button on CodingScreen that creates a formatted HTML print view (or PDF via browser print) showing: narrative, key coded fields, NLP signals, GIS locations, linked cases, analyst notes. Styled to match the app's editorial aesthetic.

**J. Suspect / Vehicle Repeat Network Graph**
The app flags `repeat_suspect` and `repeat_vehicle` but there's no visual showing which cases share features.

**Proposed:** A mini network graph on the Analysis page — nodes are cases, edges are shared features (partial plate match, vehicle description match, suspect description match). Built with react-force-graph or D3.

### 2.3 🟡 MEDIUM VALUE

**K. Keyboard Shortcut System**
Power users coding dozens of cases need keyboard navigation. No shortcuts currently exist.

**Proposed shortcuts:**
- `Ctrl+S` → Save
- `Ctrl+→` / `Ctrl+←` → Next/prev case in filtered list
- `Ctrl+A` → Accept all AI suggestions in current section
- `Ctrl+R` → Mark current field as reviewed
- `1` / `2` / `3` → Fill yes/no/unclear on focused yes-no field
- `/` → Open field search

**L. Weather Data Display**
The backend fetches historical weather data (`weather.py`) and stores it in `ai_suggestions`. It is never displayed in the UI.

**Proposed:** Show a small weather chip on CodingScreen header: `⛅ 12°C, partly cloudy` when weather data is available.

**M. Memo / Analyst Journal**
A case-level free-text memo pad separate from `coder_notes` — a running log of analytical thoughts, hypotheses, follow-up questions.

**Proposed:** A collapsible memo panel on CodingScreen (right sidebar or bottom drawer). Timestamped entries, auto-saved separately from the case fields.

**N. Bulk Re-analysis**
If NLP vocabulary is updated, there is no way to re-run analysis on all existing cases.

**Proposed:** On the Analysis page, a "Re-analyze All Cases" button (with confirmation) that queues all cases for NLP re-analysis with a progress counter.

**O. Coding Session Timer**
Researchers need to track time spent coding for grant reporting.

**Proposed:** A subtle timer in the CodingScreen header tracking time-on-task per case. Auto-pauses after 5min of inactivity. Stores `coding_time_minutes` per case.

**P. Custom Tags**
The field set is fixed. Analysts sometimes need ad-hoc tagging (e.g., "flagged for legal review", "awaiting corroboration").

**Proposed:** A tag input on each case (like GitHub issue labels). Free-text tags, auto-complete from existing tags, filterable in CaseList.

### 2.4 🟢 FUTURE / RESEARCH FEATURES

**Q. Dataset Health Dashboard**
A dedicated view showing: which fields are consistently left blank (training gaps), coder-level productivity stats, completeness heatmap across all cases.

**R. Academic Export Formats**
- Export in NVivo-compatible format
- Export coded fields as SPSS/R-compatible data frame
- BibTeX/citation export for case references

**S. Multi-user Support with Role-based Access**
Currently single-user. For team deployments: login, analyst role vs. supervisor role, case assignment, supervisor review workflow.

**T. Survivor Voice Field**
A dedicated structured field (separate from narrative) to capture the survivor's own framing of what happened — not filtered through analyst interpretation. Respects survivor agency in how harm is categorized.

---

## 3. ACCESSIBILITY & TECHNICAL GAPS

- **Color blind accessibility:** Red/green distinction (coercion=red, safe=green) fails for deuteranopia. Add pattern/icon layer to all color-coded indicators (not color alone).
- **Screen reader support:** Form fields need proper `<label>` associations. Provenance borders convey meaning only through color — needs text equivalent.
- **Mobile/tablet:** App is desktop-only. A simplified mobile view for viewing cases and adding notes would serve fieldwork contexts.
- **Session persistence:** Filter settings, scroll position, and open sections do not persist. Returning to a case requires re-scrolling.
- **No error boundary:** If the backend is down, the app shows raw fetch errors with no graceful degradation or offline message.
- **No offline mode:** In low-connectivity environments, the app is entirely non-functional.

---

## 4. INFORMATION ARCHITECTURE GAPS

**Missing pages:**
- `/timeline` — Temporal case view (chronological event stream)
- `/offender-profiles` — Aggregated profiles from linked case sets
- `/settings` — API key management, default org, NLP vocabulary customization, analyst preferences
- `/help` — Field definitions, coding guide, keyboard shortcuts reference

**Missing in header nav:** Settings and Help should be icon-only buttons (gear + question mark) on the far right of the nav header — not full nav items.

---

## 5. PRIORITIZED IMPLEMENTATION ORDER

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Autosave with "Saved Xs ago" indicator | Low | Critical |
| 2 | Section collapse + per-section progress | Medium | High |
| 3 | Case ← → navigation arrows | Low | High |
| 4 | Toast notification system | Low | Medium |
| 5 | Keyboard shortcuts (Ctrl+S, arrows, 1/2/3) | Low | High |
| 6 | Narrative annotation / highlighted evidence spans | High | High |
| 7 | Triage / Quick-code mode | Medium | High |
| 8 | Recharts on Analysis page | Medium | High |
| 9 | Map clustering + time filter slider | Medium | High |
| 10 | Field search (command palette) | Medium | Medium |
| 11 | Validation rules engine | Medium | Medium |
| 12 | Weather data display chip | Low | Low |
| 13 | Bulk action toolbar on CaseList | Medium | Medium |
| 14 | Offender profile builder | High | High |
| 15 | Case timeline view | High | Medium |
| 16 | Report export / print view | Medium | Medium |
| 17 | Inter-rater reliability tracker | High | High |
| 18 | Custom tags | Medium | Medium |
| 19 | Suspect/vehicle network graph | High | Medium |
| 20 | Dataset health dashboard | High | Medium |
