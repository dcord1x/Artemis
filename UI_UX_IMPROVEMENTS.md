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
- ✅ **Collapsible section panels** — `SectionPanel` shows `fields coded / total`. Completed sections auto-collapse.
- ✅ **Section progress bar** — amber horizontal strip per section panel.
- **Sticky section jump rail** — a narrow vertical sidebar (left edge) with section abbreviations. Clicking scrolls to that section. Active section highlighted. *(not yet built)*
- **Field search** — command-palette style search: type "vehicle" to jump to and highlight vehicle fields. *(not yet built)*
- ✅ **Autosave indicator** — "Saved Xs ago" ghost text in toolbar. Fires PATCH 2s after last change.
- **Accept All Suggestions button** — one-click to accept all pending AI suggestions in a section. *(not yet built)*

### 1.2 Navigation & Wayfinding

**Issue:** No breadcrumbs, no "currently viewing case X of N" context, no back navigation from detail views.

**Fixes:**
- **Breadcrumb bar** below the nav header: `Cases > Report #2024-0042 > Linkage Comparison` *(not yet built)*
- ✅ **Case counter pill** — `Case X of N` with ← → arrow navigation in CodingScreen toolbar.
- **Last visited indicator** on Cases list — subtle `→ current` marker + restore scroll on back navigation. *(not yet built)*

### 1.3 CaseList — Density & Scannability

**Issue:** Card list is functional but dense. Quick indicators (colored dots) lack labels. Filtering is comprehensive but visually cluttered.

**Fixes:**
- **Two-mode list** — toggle between Card view and Table/Spreadsheet view. Table view shows one row per case with inline yes/no/— cells for key fields. *(not yet built)*
- ✅ **Column picker** for table mode — ServiceNow-style column manager.
- **Inline status badge** — larger, full-text: `CODED`, `IN PROGRESS`, `UNCODED`, `REVIEWED`. *(not yet built)*
- **Filter panel as a collapsible sidebar** (left side, 220px wide) instead of a top bar. *(not yet built)*
- ✅ **Bulk action toolbar** — bulk delete and delete-all-visible.

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

**C. ✅ Autosave** — Implemented. Fires PATCH 2s after last field change; "Saved Xs ago" indicator in toolbar.

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

**K. ✅ Keyboard Shortcut System** — Partially implemented.
- ✅ `Ctrl+S` → Save
- ✅ `Ctrl+→` / `Ctrl+←` → Next/prev case in filtered list
- `Ctrl+A` → Accept all AI suggestions in current section *(not yet built)*
- `Ctrl+R` → Mark current field as reviewed *(not yet built)*
- `1` / `2` / `3` → Fill yes/no/unclear on focused yes-no field *(not yet built)*
- `/` → Open field search *(not yet built)*

**L. ✅ Weather Data Display** — Implemented. Weather card shown in the Narrative tab when NLP analysis has been run.

**M. Memo / Analyst Journal**
A case-level free-text memo pad separate from `coder_notes` — a running log of analytical thoughts, hypotheses, follow-up questions.

**Proposed:** A collapsible memo panel on CodingScreen (right sidebar or bottom drawer). Timestamped entries, auto-saved separately from the case fields.

**N. Bulk Re-analysis**
If NLP vocabulary is updated, there is no way to re-run analysis on all existing cases.

**Proposed:** On the Analysis page, a "Re-analyze All Cases" button (with confirmation) that queues all cases for NLP re-analysis with a progress counter.

**O. Coding Session Timer**
Researchers need to track time spent coding for grant reporting.

**Proposed:** A subtle timer in the CodingScreen header tracking time-on-task per case. Auto-pauses after 5min of inactivity. Stores `coding_time_minutes` per case.

**P. ✅ Custom Tags** — Implemented. Free-text tag input on each case, filterable in CaseList.

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

## 5. IMPLEMENTATION STATUS

### Shipped

| Feature | Notes |
|---------|-------|
| Autosave with "Saved Xs ago" indicator | Fires 2s after last change |
| Section collapse + per-section progress | `SectionPanel` auto-collapses when complete |
| Case ← → navigation arrows | Counter pill in CodingScreen toolbar |
| Toast notification system | `Toast.tsx` + `useToast()` hook |
| Keyboard shortcuts (Ctrl+S, Ctrl+←/→) | Active in CodingScreen |
| Column picker for CaseList table mode | ServiceNow-style column manager |
| Bulk action toolbar on CaseList | Bulk delete + delete-all-visible |
| Custom tags | Tag input on each case, filterable |
| Weather data display | Weather card in Narrative tab |

### Remaining (Prioritized)

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Narrative annotation / highlighted evidence spans | High | High |
| 2 | Triage / Quick-code mode | Medium | High |
| 3 | Recharts on Analysis page | Medium | High |
| 4 | Map clustering + time filter slider | Medium | High |
| 5 | Field search (command palette) | Medium | Medium |
| 6 | Validation rules engine | Medium | Medium |
| 7 | Offender profile builder | High | High |
| 8 | Case timeline view | High | Medium |
| 9 | Report export / print view | Medium | Medium |
| 10 | Inter-rater reliability tracker | High | High |
| 11 | Suspect/vehicle network graph | High | Medium |
| 12 | Dataset health dashboard | High | Medium |
