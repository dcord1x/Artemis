# Artemis — Change Report
**Date:** 2026-06-08
**Scope:** Final targeted cleanup — pre-testing pass + initial contact reframing + session 4 NLP/AI visibility pass
**Status:** All items implemented. TypeScript builds clean. No outstanding errors.

---

## Session 1 — Methodology-Defensibility Update

### Workflow Coverage Confirmation

| Step | Status | Where in tool |
|------|--------|---------------|
| Source report → Case Record | ✅ | Coding Workspace → Case Record tab |
| Codability / Data Quality assessment | ✅ | Coding Workspace → Codability / Data Quality tab |
| Stage coding | ✅ | Coding Workspace → Stage Coding tab + StageSequencer |
| Incident-level coding | ✅ | Coding Workspace → Incident-Level Coding tab |
| Initial Contact / Approach coding | ✅ | Coding Workspace → Incident-Level Coding → Initial Contact / Approach panel |
| Situational / Environmental coding | ✅ | Coding Workspace → Incident-Level Coding → Situation / Environment panel |
| Mobility / Spatial sequence coding | ✅ | Coding Workspace → Mobility / Spatial Sequence tab |
| Narrative excerpts / uncertainty | ✅ | Coding Workspace → Narrative Excerpts tab |
| Case summary | ✅ | Coding Workspace → Case Summary tab (includes Encounter Sequence Output + Initial Contact block) |
| Cross-case analysis outputs | ✅ | Analysis Dashboard (RQ1/RQ2/RQ3 panels) + Research Outputs (RQ-labelled tabs + Filtered Case Groups) |

---

### Files Edited (Session 1)

| File | Change type |
|------|-------------|
| `frontend/src/pages/CodebookPage.tsx` | Major revision — author names removed, wording restructured, field renamed, new entries added |
| `frontend/src/pages/Analysis.tsx` | New codability distribution panels, ValDistPanel component, RQ section enhancements |
| `frontend/src/pages/ResearchOutputs.tsx` | New Filtered Case Groups tab, new CellChip component, new state |
| `frontend/src/pages/CodingScreen.tsx` | sequence_pattern FieldRow added; Encounter Sequence Output section added to Case Summary |
| `frontend/src/types.ts` | ValCount interface added; CodabilityAggregate interface added; ResearchAggregate extended |
| `backend/main.py` | _val_counts helper added; codability aggregation added to get_research_aggregate |

---

### Codebook Changes (Session 1)

- `literatureBasis` renamed to `methodologicalBasis` throughout
- All author names removed (Cornish, Wikström, Clarke, Cohen & Felson, Brantingham, Rossmo, Kinnell, Hubbard, McKeganey, Barnard, Sanders)
- Section heading "Core Concepts and Theoretical Basis" → "Core Concepts"
- Page subtitle updated to broad methodological language
- "Literature basis:" label → "Methodological basis:"
- All 14 concept definitions revised with broad, source-free methodological language
- All 20 field entries given `methodologicalBasis` text
- New concept: Escalation added
- New clarifying rules added to Stage, Visibility, Guardianship, Control, Data Quality, Coding Confidence

---

## Session 2 — Final Targeted Cleanup

### Summary of All 21 Tasks

| # | Task | Status |
|---|------|--------|
| 1 | Hide "AI Suggest" and "NLP Analyze" buttons from UI | ✅ |
| 2 | Remove NLP language from dashboard reports and pipeline steps | ✅ |
| 3 | Change provenance pill display "provisional" → "not analyst-confirmed" | ✅ |
| 4 | Remove harm types (physical_force, sexual_assault, stealthing, robbery_theft) from sequence bar stageDefs | ✅ |
| 5 | Update STAGE_LABELS with new controlled vocabulary + legacy key mappings | ✅ |
| 6 | Fix Analysis.tsx RQ section order: RQ1 → RQ2 → RQ3 (was RQ2 → RQ3 → RQ1) | ✅ |
| 7 | Fix ResearchOutputs.tsx tab order; rename spatial → "RQ3 — Spatial Movement" | ✅ |
| 8 | Add 8 new Initial Contact / Approach fields to backend/models.py | ✅ |
| 9 | Add new fields to backend/schemas.py (ReportUpdate + ReportOut) | ✅ |
| 10 | Add new fields to frontend/src/types.ts Report interface | ✅ |
| 11 | Add Initial Contact / Approach SectionPanel to CodingScreen Incident-Level Coding tab | ✅ |
| 12 | Add Initial Contact card to Analysis.tsx RQ1 section | ✅ |
| 13 | Add Initial Contact tab to ResearchOutputs.tsx (id: 'initial_contact') | ✅ |
| 14 | Add Initial Contact block to CodingScreen Case Summary tab | ✅ |
| 15 | Add Codebook entries for 6 initial contact approach fields | ✅ |
| 16 | Add approach-pattern presets to FilteredGroupsTab | ✅ |
| 17 | Add initial contact fields to backend aggregate (codability dict) | ✅ |
| 18 | Add initial contact fields to CodabilityAggregate interface in types.ts | ✅ |
| 19 | Remove NLP comment from ResearchOutputs.tsx file header | ✅ |
| 20 | Remove unused Sparkles and ScanSearch icon imports from CodingScreen | ✅ |
| 21 | Final CHANGE_REPORT.md | ✅ |

---

### Files Edited (Session 2)

| File | Change type |
|------|-------------|
| `backend/models.py` | 8 new Initial Contact fields added to Report model class + _new_columns migration list |
| `backend/schemas.py` | 8 new fields added to ReportUpdate (Optional[str]) and ReportOut (str = "") |
| `backend/main.py` | 6 new approach fields added to codability aggregate |
| `frontend/src/types.ts` | 8 new fields added to Report interface; 6 new fields added to CodabilityAggregate |
| `frontend/src/pages/CodingScreen.tsx` | AI/NLP buttons hidden; provenance pill label changed; harm types removed from stageDefs; Initial Contact / Approach SectionPanel added; Initial Contact block added to Case Summary |
| `frontend/src/pages/Analysis.tsx` | NLP language removed; RQ sections reordered RQ1 → RQ2 → RQ3; Initial Contact card added under RQ1; STAGE_LABELS updated with new vocabulary |
| `frontend/src/pages/ResearchOutputs.tsx` | Tab order fixed; spatial tab renamed to "RQ3 — Spatial Movement"; 'initial_contact' tab added; InitialContactTab component added; 5 new approach-pattern presets added to FilteredGroupsTab; NLP provenance comment updated |
| `frontend/src/pages/CodebookPage.tsx` | 6 new Codebook entries added for Initial Contact / Approach fields |

---

### New Database Fields (auto-migrating, additive only)

| Field | Type | Values |
|-------|------|--------|
| `approach_method` | VARCHAR | street_approach · online_digital · referral · venue_based · phone_text · vehicle_based · third_party_arranged · unknown_unclear · other |
| `approach_setting` | VARCHAR | public_street · online_platform · venue_indoor · private_space · vehicle · unknown · other |
| `approach_mobility_context` | VARCHAR | stationary · mobile_on_foot · mobile_in_vehicle · transitioning · unknown |
| `client_known_at_contact` | VARCHAR | yes_known · first_contact · unclear |
| `initial_contact_visibility` | VARCHAR | visible · limited_visibility · not_visible · unclear · not_stated |
| `initial_contact_guardianship` | VARCHAR | present · limited_reduced · absent · unclear · not_stated |
| `initial_contact_excerpt` | TEXT | free text |
| `initial_contact_notes` | TEXT | free text |

All fields default to empty string. No existing records are modified. Migration is additive only.

---

### Stage Vocabulary — Controlled Vocabulary (New)

The encounter sequence bar and Analysis Dashboard now use the following controlled vocabulary for stage_type values:

| Key | Display label |
|-----|--------------|
| initial_contact | Contact |
| screening_recognition | Screening |
| negotiation | Negotiation |
| pickup_meeting | Pickup |
| movement_relocation | Movement |
| arrival_setting | Arrival |
| escalation | Escalation |
| violence_coercion | Violence |
| exit_escape | Exit |
| aftermath_warning | Aftermath |
| other | Other |
| unknown_unclear | Unknown |

Legacy keys (movement_travel, arrival_location, aftermath) are also mapped for display continuity without overwriting stored data.

Harm indicators (physical_force, sexual_assault, stealthing, robbery_theft) are no longer included as sequence bar nodes in the Case Summary tab. They remain fully coded in the Incident-Level Harm section and are displayed in the Harm Indicators box in Case Summary.

---

### NLP / AI Changes

| Location | Change |
|----------|--------|
| CodingScreen toolbar | "AI Suggest" button removed from visible interface |
| CodingScreen toolbar | "NLP Analyze" button removed from visible interface |
| CodingScreen NLP error display | Removed |
| CodingScreen provenance pill | "provisional" → "not analyst-confirmed" |
| CodingScreen SummaryTab note | NLP wording replaced with analyst-led language |
| Analysis.tsx insights | NLP insight removed |
| Analysis.tsx pipeline step | "NLP Screened" → "Imported" |
| Analysis.tsx coding attention queue | NLP queue row removed |
| Analysis.tsx RQ2 text | NLP wording removed |
| Analysis.tsx RQ2 card | NLP provisional bar chart section removed |
| Analysis.tsx coding gaps | "NLP Signals" metric card replaced with "Analyst Review Needed" |
| ResearchOutputs.tsx header comment | NLP provenance note updated to analyst-led language |

NLP backend functionality, NLP text scan, Claude AI excerpt extraction, and ParseViewer remain fully functional but are no longer surfaced in the main toolbar. They are accessible in the Narrative Excerpts tab accordion (existing behaviour).

---

### Research Outputs — New Tab Order

| Position | Tab ID | Label |
|----------|--------|-------|
| 1 | encounter_overview | Coded Case Overview |
| 2 | stage_patterns | RQ1 — Stage Patterns |
| 3 | sequences | RQ1 — Encounter Sequences |
| 4 | initial_contact | RQ1 — Initial Contact |
| 5 | environment | RQ2 — Environmental Patterns |
| 6 | mobility | RQ3 — Mobility Pathways |
| 7 | spatial | RQ3 — Spatial Movement |
| 8 | filtered_groups | Filtered Case Groups |
| 9 | linkage_view | Case Comparison |
| 10 | caselist | Case Sequence Table |
| 11 | vawg | Supplementary Flags |

---

### Analysis Dashboard — Section Order

| Order | Section |
|-------|---------|
| 1 | Coding Progress (pipeline + metrics) |
| 2 | Spatial Overview |
| 3 | Coding Attention Queue |
| 4 | RQ1 — Stage Visibility and Encounter Sequence |
| 5 | RQ1 — Initial Contact and Approach (new) |
| 6 | RQ2 — Behavioural and Situational Conditions |
| 7 | RQ3 — Mobility and Spatial Movement |
| 8 | Codability and Data Quality |
| 9 | Research Outputs link section |
| 10 | Methodological Note |

---

### Filtered Case Groups — New Presets

| Preset ID | Label | Filter |
|-----------|-------|--------|
| street_approach | Street approach | approach_method = street_approach |
| online_approach | Online / digital approach | approach_method = online_digital |
| vehicle_approach | Vehicle-based approach | approach_method = vehicle_based |
| ic_low_visibility | Low visibility at contact | initial_contact_visibility = not_visible |
| ic_no_guardianship | No guardianship at contact | initial_contact_guardianship = absent |

---

### Risks and Follow-Up Items

**has_sequence_pattern backend filter (pre-existing)**
The preset "Has sequence pattern" passes `{ has_sequence_pattern: 'yes' }` as a query parameter. This requires the backend `GET /reports` endpoint to support this parameter. If not supported, the preset returns unfiltered results rather than failing. Recommend verifying backend filter support or replacing with a client-side filter.

**approach_method and initial_contact_visibility backend filters**
The new approach-pattern presets in FilteredGroupsTab pass approach_method and initial_contact_visibility as query parameters. These require the backend `GET /reports` endpoint to support these parameters. Same risk as above — unfiltered results if backend does not handle them.

**NLP internals preserved**
All NLP computation (nlp.coercion, nlp.physical, nlp.sexual, nlp.movement) remains in Analysis.tsx `d` computed data. The values are no longer rendered but are still calculated. This is safe and allows future reactivation without data loss.

**Existing saved cases unaffected**
All new database columns default to empty string. No existing case records are modified. The migration adds columns only.

---

## Session 3 — Initial Contact / Approach Reframing

**Reason:** Initial Contact / Approach was incorrectly framed as a separate RQ1 section. RQ1 addresses what behavioural stages can be identified across violent encounters using community-generated narrative reports. Initial contact is one stage within RQ1, not a separate research question.

### Changes Made

| Location | Old | New |
|----------|-----|-----|
| Analysis.tsx | "RQ1 — Initial Contact and Approach" as a separate section below RQ2 | "Initial Contact Stage Detail" sub-section folded inside the RQ1 card |
| Analysis.tsx description | "How contact was first made and the situational conditions at the point of approach." | "Breakdown of the initial contact stage where the report provides enough detail. These fields help describe how the encounter began but do not define a separate research question." |
| ResearchOutputs.tsx | Separate tab "RQ1 — Initial Contact" | Removed; content added as "Initial Contact Stage Detail" subsection inside RQ1 — Encounter Sequences tab |
| ResearchOutputs.tsx tab order | 11 tabs including 'initial_contact' | 10 tabs; no standalone initial contact tab |
| CodebookPage.tsx — all 6 approach fields | methodologicalBasis framed approach as a core encounter element | methodologicalBasis now reads: "Approach fields provide additional detail for the Initial Contact stage. They support stage reconstruction by recording how contact began when the narrative provides this information. They should not be interpreted as evidence of offender motive." |

### Research Outputs — Corrected Tab Order

| Position | Tab ID | Label |
|----------|--------|-------|
| 1 | encounter_overview | Coded Case Overview |
| 2 | stage_patterns | RQ1 — Stage Patterns |
| 3 | sequences | RQ1 — Encounter Sequences (includes Initial Contact Stage Detail subsection) |
| 4 | environment | RQ2 — Environmental Patterns |
| 5 | mobility | RQ3 — Mobility Pathways |
| 6 | spatial | RQ3 — Spatial Movement |
| 7 | filtered_groups | Filtered Case Groups |
| 8 | linkage_view | Case Comparison |
| 9 | caselist | Case Sequence Table |
| 10 | vawg | Supplementary Flags |

### Analysis Dashboard — Corrected Section Order

| Order | Section |
|-------|---------|
| 1 | Coding Progress |
| 2 | Spatial Overview |
| 3 | Coding Attention Queue |
| 4 | RQ1 — Stage Visibility and Encounter Sequence (includes Initial Contact Stage Detail sub-section at the bottom) |
| 5 | RQ2 — Behavioural and Situational Conditions |
| 6 | RQ3 — Mobility and Spatial Movement |
| 7 | Codability and Data Quality |
| 8 | Research Outputs |
| 9 | Methodological Note |

### Methodological Note (added to Initial Contact Stage Detail subsection)

> "Initial contact is coded as one possible stage in the encounter sequence. These fields record what the report makes visible about how the encounter began, including contact method, setting, known/repeat client status and early visibility or guardianship. These fields support RQ1 by describing the initial contact stage where it is visible, but they are not treated as a separate research question."

### Files Edited (Session 3)

| File | Change |
|------|--------|
| `frontend/src/pages/Analysis.tsx` | Removed standalone "RQ1 — Initial Contact and Approach" section; folded content as "INITIAL CONTACT STAGE DETAIL" sub-section inside the RQ1 card |
| `frontend/src/pages/ResearchOutputs.tsx` | Removed 'initial_contact' tab type and TABS entry; removed InitialContactTab component; added "Initial Contact Stage Detail" Panel as subsection at the bottom of SequencesTab |
| `frontend/src/pages/CodebookPage.tsx` | Updated methodologicalBasis on all 6 approach field entries to stage-detail framing |
| `CHANGE_REPORT.md` | Updated to document all reframing changes |

---

## Session 4 — Final NLP/AI Visibility Pass + Filtered Groups Fix

**Reason:** Pre-testing cleanup. Remove all remaining user-facing NLP/AI language. Fix Filtered Case Groups returning all records when no analyst-coded matches exist. Add screening_recognition as a codeable stage type.

### Changes Made

| File | Change |
|------|--------|
| `frontend/src/pages/BulletinOutput.tsx` | "Required for NLP signals" → "Required before use as findings"; caution banner updated to remove NLP wording |
| `frontend/src/pages/CaseList.tsx` | "NLP All" button → "Auto-populate"; "Run NLP" button → "Auto-populate"; all three toast messages updated to remove NLP branding |
| `frontend/src/pages/CodingScreen.tsx` | EscalationArc header "NLP — Escalation Arc" → "Escalation Arc"; subtitle "Machine detection only" → "System-detected only" |
| `frontend/src/components/StageSequencer.tsx` | Added `screening_recognition` ("Screening / Recognition") to STAGE_TYPES and STAGE_COLORS |
| `frontend/src/pages/ResearchOutputs.tsx` | (Completed in session 4 continuation) FilteredGroupsTab rewrote to client-side filtering with `fgAllReports` cache; FG_PRESETS converted from backend params to `filter: (r: Report) => boolean` functions; zero-match message added; filter note added; table columns updated |
| `frontend/src/components/FieldRow.tsx` | (Completed in session 4 continuation) `ai_suggested` dot label: 'AI' → 'unreviewed'; suggestion chip tooltip updated |

### Filtered Case Groups — Client-Side Filtering

FG_PRESETS now use `filter: (r: Report) => boolean` functions with a `notBlank()` guard that excludes blank, 'not_reviewed', and 'uncoded' values. `loadFgReports` fetches all reports once (cached in `fgAllReports`) and applies the filter client-side. Zero-match shows "No analyst-coded cases match this filter yet." instead of returning all records.

### Stage Vocabulary — Screening Added

`screening_recognition` is now available as a codeable stage type in StageSequencer with label "Screening / Recognition" and purple colour scheme (`#F5F3FF / #DDD6FE / #6D28D9`). This aligns with the STAGE_LABELS controlled vocabulary in Analysis.tsx.

### TypeScript Build

All changes compile clean. `npx tsc --noEmit` exits with no errors after all session 4 edits.

---

## Session 5 — Central Display-Label Formatter (snake_case → readable labels)

**Reason:** Approach method and related Initial Contact / Approach select dropdowns were showing raw snake_case stored values (e.g. `street_approach`, `online_digital`, `mobile_on_foot`) directly to the user in form dropdowns, Case Summary, Analysis bar charts, and Research Outputs table cells. Stored backend values must not change; display only is fixed.

### Architecture

A central `formatLabel(value: string): string` function was added to `frontend/src/utils.ts` alongside a `FIELD_VALUE_LABELS: Record<string, string>` lookup map. The function:
1. Checks the explicit lookup map first
2. Falls back to converting snake_case identifiers (`/^[a-z0-9_]+$/`) to sentence case
3. Returns all other strings (human-readable values with spaces, mixed case) unchanged

This ensures the formatter is safe to apply broadly — free text, city names, and properly labelled values pass through unchanged.

### Where raw snake_case values were appearing

| Location | Field(s) | Fix |
|----------|----------|-----|
| CodingScreen — Approach method `<select>` dropdown options | `approach_method`, `approach_setting`, `approach_mobility_context`, `client_known_at_contact`, `initial_contact_visibility`, `initial_contact_guardianship` | `FieldRow.tsx` now calls `formatLabel(o)` for all `<option>` label text |
| CodingScreen — Case Summary IC / Approach block | Same 6 fields | `SummaryKVRow` now calls `formatLabel(value)` before rendering |
| CodingScreen — Mobility dropdown "Basis for movement coding" | `basis_for_movement_coding` option `'NLP suggestion only'` | Added to `FIELD_VALUE_LABELS` → displays as `'System-suggested'`; stored value unchanged |
| Analysis Dashboard — ValDistPanel bar chart value labels | All codability aggregate keys (approach_method etc.) | `ValDistPanel` now calls `formatLabel(val)` |
| Research Outputs — SequencesTab Initial Contact Detail `renderDist` bars | Same 6 fields | `renderDist` now calls `formatLabel(val)` |
| Research Outputs — FilteredGroupsTab table `CellChip` | `approach_method`, `approach_setting` | `CellChip` now calls `formatLabel(value)` |

### Explicit label mappings added (approach fields)

| Stored value | Display label |
|---|---|
| `street_approach` | Street / in-person approach |
| `online_digital` | Online / digital |
| `referral` | Referral |
| `venue_based` | Venue-based |
| `phone_text` | Phone / text |
| `vehicle_based` | Vehicle-based |
| `third_party_arranged` | Third-party arranged |
| `unknown_unclear` | Unknown / unclear |
| `public_street` | Public street |
| `online_platform` | Online platform |
| `venue_indoor` | Venue (indoor) |
| `private_space` | Private space |
| `stationary` | Stationary |
| `mobile_on_foot` | Mobile on foot |
| `mobile_in_vehicle` | Mobile in vehicle |
| `transitioning` | Transitioning |
| `yes_known` | Yes — previously known |
| `first_contact` | First contact |
| `limited_visibility` | Limited visibility |
| `not_visible` | Not visible |
| `not_stated` | Not stated |
| `limited_reduced` | Limited / reduced |
| `NLP suggestion only` | System-suggested |

### Files Edited (Session 5)

| File | Change |
|------|--------|
| `frontend/src/utils.ts` | Added `FIELD_VALUE_LABELS` map and `formatLabel()` function |
| `frontend/src/components/FieldRow.tsx` | Added `formatLabel` import; `<option>` text now uses `formatLabel(o)` |
| `frontend/src/pages/Analysis.tsx` | Added `formatLabel` import; ValDistPanel `{val}` → `{formatLabel(val)}` |
| `frontend/src/pages/ResearchOutputs.tsx` | Added `formatLabel` import; `renderDist` `{val}` and `CellChip` `{value}` → wrapped with `formatLabel` |
| `frontend/src/pages/CodingScreen.tsx` | Added `formatLabel` to utils import; `SummaryKVRow` `{value}` → `{formatLabel(value)}` |
| `CHANGE_REPORT.md` | Session 5 documented |

### TypeScript Build

All changes compile clean. `npx tsc --noEmit` exits with no errors after all session 5 edits.
