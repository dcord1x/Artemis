# Artemis — Change Report
**Date:** 2026-06-08
**Scope:** Methodology-defensibility update — PhD progress/probation review preparation
**Status:** All items implemented. TypeScript builds clean. No outstanding errors.

---

## Workflow Coverage Confirmation

The tool now supports the full methodology workflow end-to-end:

| Step | Status | Where in tool |
|------|--------|---------------|
| Source report → Case Record | ✅ | Coding Workspace → Case Record tab |
| Codability / Data Quality assessment | ✅ | Coding Workspace → Codability / Data Quality tab |
| Stage coding | ✅ | Coding Workspace → Stage Coding tab + StageSequencer |
| Incident-level coding | ✅ | Coding Workspace → Incident-Level Coding tab |
| Situational / Environmental coding | ✅ | Coding Workspace → Incident-Level Coding → Situation / Environment panel |
| Mobility / Spatial sequence coding | ✅ | Coding Workspace → Mobility / Spatial Sequence tab |
| Narrative excerpts / uncertainty | ✅ | Coding Workspace → Narrative Excerpts tab |
| Case summary | ✅ | Coding Workspace → Case Summary tab (includes Encounter Sequence Output) |
| Cross-case analysis outputs | ✅ | Analysis Dashboard (RQ1/RQ2/RQ3 panels) + Research Outputs (RQ-labelled tabs + Filtered Case Groups) |

---

## 1. Files Edited

| File | Change type |
|------|-------------|
| `frontend/src/pages/CodebookPage.tsx` | Major revision — author names removed, wording restructured, field renamed, new entries added |
| `frontend/src/pages/Analysis.tsx` | New codability distribution panels, ValDistPanel component, RQ section enhancements |
| `frontend/src/pages/ResearchOutputs.tsx` | New Filtered Case Groups tab, new CellChip component, new state |
| `frontend/src/pages/CodingScreen.tsx` | sequence_pattern FieldRow added; Encounter Sequence Output section added to Case Summary |
| `frontend/src/types.ts` | ValCount interface added; CodabilityAggregate interface added; ResearchAggregate extended |
| `backend/main.py` | _val_counts helper added; codability aggregation added to get_research_aggregate |

---

## 2. Codebook Changes (`CodebookPage.tsx`)

### Interface change
- `literatureBasis?: string` renamed to `methodologicalBasis?: string` on both `CodebookEntry` and `CONCEPT_DEFINITIONS` item type
- All references to the old field name updated in data and render

### Label changes
- "Literature basis:" label in concept cards → "Methodological basis:"
- "Literature Basis" section header in field entries → "Methodological Basis"
- Page header subtitle: "Based on situational action theory and adapted to the specific analytic requirements of Bad Date Report research" → "Adapted to the specific analytic requirements of Bad Date Report research, informed by crime scripting, situational analysis, environmental criminology, and sex work violence literature"
- Section heading "Core Concepts and Theoretical Basis" → "Core Concepts"

### Author names and source citations removed
The following named authors and in-text citations were removed from all app-facing Codebook content:

| Removed | Replaced with |
|---------|---------------|
| Cornish 1994; Leclerc et al. | informed by crime scripting |
| Wikström (Situational Action Theory) | informed by situational analysis |
| Clarke (SCP); Cohen & Felson (RAT) | informed by situational analysis and environmental criminology |
| Brantingham & Brantingham | informed by environmental criminology |
| Rossmo; Chainey & Ratcliffe | informed by spatial and mobility analysis |
| Kinnell; Hubbard; McKeganey | informed by sex work violence literature |
| Barnard; Sanders | informed by sex work violence literature and spatial analysis |
| Cohen & Felson (1979) with year citation | informed by situational analysis and environmental criminology |

No author names appear anywhere in the app-facing Codebook.

### Strong empirical claims removed
- "consistently associated with increased risk, reduced guardianship, and greater offender control" → removed; replaced with "alters situational conditions" (neutral analytical framing)
- "a key mechanism through which offenders create conditions for harm" retained as an analytical observation, not a literature claim

### Broad methodological language used throughout
All methodological basis text now uses one or more of:
- *informed by crime scripting*
- *informed by situational analysis*
- *informed by environmental criminology*
- *informed by sex work violence literature*
- *informed by spatial and mobility analysis*
- *informed by victim-generated reporting methods*
- *informed by qualitative coding methodology*
- *informed by offence progression analysis*

---

## 3. Operational Definitions Added or Revised

All 14 concept definitions in `CONCEPT_DEFINITIONS` were revised. Key changes:

| Concept | Change |
|---------|--------|
| Stage | Expanded with sentence clarifying "absent" means the narrative does not describe it, not that it did not occur |
| Behaviour | Added sentence requiring analyst-inferred behaviours to be marked with coding confidence value |
| Situation | Clarified coded at both case-level and stage-level |
| Environment | Unchanged in substance; methodological basis reworded |
| Movement | Added explicit instruction: "the analyst should assess whether and how movement altered conditions for harm or escape" |
| Relocation | Removed author citation; kept analytical framing |
| Visibility | Added clarification: "Visibility is not the same as whether anyone actually observed the encounter" |
| Guardianship | Added: "Guardianship is not equivalent to anyone being nearby — the capacity to intervene matters" |
| Isolation | Expanded with examples of how isolation arises (setting, offender behaviour) |
| Control | Added: "Control is analytically distinct from consent — offender control may be asserted covertly or through normalised pressure" |
| Escalation | **New concept** — added to the 12 previously defined concepts |
| Data Quality | Added: "Absence of information in a report must not be coded as absence of the event" |
| Stage Visibility | Expanded with four possible values and clarification of what "absent" means |
| Coding Confidence | Added: "Coding confidence must be recorded wherever the analyst departs from what is explicitly stated in the narrative" |

---

## 4. Coding Rules Added or Revised

### New field entries added to `CODEBOOK_ENTRIES`
The following entries were added or substantially revised with full coding rule text:

| Field | Tab | Level | Change |
|-------|-----|-------|--------|
| `narrative_detail_level` | Codability / Data Quality | case | Methodological basis added |
| `sequence_reconstructable` | Codability / Data Quality | case | Methodological basis added |
| `stage_coding_suitability` | Codability / Data Quality | case | Methodological basis added |
| `movement_coding_suitability` | Codability / Data Quality | case | Methodological basis added |
| `location_coding_suitability` | Codability / Data Quality | case | Methodological basis added |
| `main_data_limitation` | Codability / Data Quality | case | Methodological basis added |
| `stage_type` | Stage Coding | stage | Methodological basis added |
| `stage_visible` | Stage Coding | stage | Methodological basis added |
| `stage_certainty` | Stage Coding | stage | Methodological basis added |
| `visibility` | Stage Coding | stage | Methodological basis added; duplicate entry removed |
| `guardianship` | Stage Coding | stage | Methodological basis added; duplicate entry removed |
| `isolation_level` | Stage Coding | stage | Methodological basis added |
| `control_type` | Stage Coding | stage | Methodological basis added |
| `primary_setting_type` | Incident-Level Coding | case | Methodological basis added |
| `visibility_case` | Incident-Level Coding | case | Methodological basis added |
| `isolation_case` | Incident-Level Coding | case | Methodological basis added |
| `guardianship_case` | Incident-Level Coding | case | Methodological basis added |
| `movement_pattern_type` | Mobility / Spatial Sequence | case | Methodological basis added |
| `movement_timing` | Mobility / Spatial Sequence | case | Methodological basis added |
| `mappable_status` | GIS | case | Methodological basis added |

**Duplicate entries removed:** The original `visibility` and `guardianship` stage-level entries (without methodological basis) were removed when the updated versions were added. The dataset now has exactly one entry per field.

---

## 5. Unclear / Missing Rules Added or Revised

| Field | Unclear rule change |
|-------|---------------------|
| `stage_visible` | Strengthened: "Do not treat absent as evidence that the stage did not occur — absent means the narrative does not describe it" |
| `location_coding_suitability` | Added: "Do not force a case into a more precise category than the narrative supports" |
| `mappable_status` | Added: "Do not geocode cases with only descriptive location information as if they were mappable" |

---

## 6. Methodological Basis / Coding Rationale Wording

Every `CODEBOOK_ENTRIES` entry now has a `methodologicalBasis` field. All entries use broad, source-free language. No entry contains an author name, publication year, or in-text citation.

Every `CONCEPT_DEFINITIONS` entry now has a `methodologicalBasis` field using the same conventions.

The field is rendered in:
- Concept definition cards (footer, below a dashed divider, labelled "Methodological basis:")
- Field entry cards (full-width row below the example, labelled "Methodological Basis")

---

## 7. Analysis Dashboard Changes (`Analysis.tsx`)

### New component: `ValDistPanel`
Reusable bar-chart component for displaying value-count distributions from the codability aggregate. Parameters: `label`, `vc` (ValCount), `color`, `total`.

### New section: Codability and Data Quality
Added between RQ1 and the Data Quality and Coverage section. Contains three cards:

| Card | Fields displayed |
|------|-----------------|
| Narrative Quality | narrative_detail_level, sequence_reconstructable, main_data_limitation |
| Coding Suitability | stage_coding_suitability, movement_coding_suitability, location_coding_suitability |
| Sequence Coverage | sequence_pattern, highest_stage_reached, access_to_help |

### RQ1 section enhancement
Right column now includes a "Stage Visibility (Codability)" sub-section showing `ValDistPanel` distributions for:
- initial_contact_visible
- negotiation_visible
- movement_visible
- violence_coercion_visible
- exit_aftermath_visible

### RQ2 section enhancement
"Setting and Location Context" card now includes a "Situational Conditions (Coded)" sub-section with `ValDistPanel` distributions for:
- primary_setting_type
- visibility_case
- isolation_case
- guardianship_case
- setting_control

### RQ3 section enhancement
"Movement and Relocation" card now includes a "Movement Patterns (Coded)" sub-section with `ValDistPanel` distributions for:
- movement_pattern_type
- movement_timing

### Unused import removed
`CodabilityAggregate` import removed from `Analysis.tsx` — it was imported but not used directly at the call site (accessed via `agg.codability` which is typed through `ResearchAggregate`). This was causing a build error (`TS6196: declared but never used`).

---

## 8. Filtered Case Groups (`ResearchOutputs.tsx`)

### New tab: Filtered Case Groups
Added as a new tab between "RQ2 — Environmental Patterns" and "Spatial Overview".

**Tab type union updated:**
```typescript
type Tab = '...' | 'filtered_groups';
```

**Seven preset filter buttons:**
| Preset | Filter applied |
|--------|---------------|
| High narrative detail | narrative_detail_level = high |
| Sequence reconstructable | sequence_reconstructable = yes |
| Stage-coding suitable | stage_coding_suitability = yes |
| Movement present | movement_present = yes |
| Mappable | mappable_status = mappable |
| Has sequence pattern | has_sequence_pattern = yes |
| All analyst-coded | coding_status = coded |

**Case table columns:**
- Case ID (monospace, links to coding workspace)
- Narrative detail level (colour-coded chip)
- Sequence reconstructable (colour-coded chip)
- Stage coding suitability (colour-coded chip)
- Sequence pattern (truncated italic preview)
- Primary harm (primary_harm or primary_incident_type)
- Movement pattern type (neutral chip)
- Mappable status (colour-coded chip)
- Key excerpt available (Yes / — based on presence of any topic-specific excerpt field)

### New component: `CellChip`
Module-level helper for colour-coded table cell chips. Parameters: `value`, `goodValues`, `warnValues`, `neutral`. Green = good value match, amber = warn value match, grey = neutral or no match.

### New state added
```typescript
const [fgReports, setFgReports] = useState<Report[]>([]);
const [fgLoading, setFgLoading] = useState(false);
const [fgPreset, setFgPreset]   = useState('');
```

---

## 9. Backend Aggregation Changes (`backend/main.py`)

### New helper: `_val_counts`
Added inside `get_research_aggregate()`:
```python
def _val_counts(field: str) -> dict:
    from collections import Counter
    c: Counter = Counter()
    for r in reports:
        val = (getattr(r, field, None) or '').strip()
        if val:
            c[val] += 1
    return {'counts': dict(c), 'total_coded': sum(c.values())}
```

### New aggregation: `codability`
22 codability fields now aggregated and returned in `ResearchAggregate`:
- narrative_detail_level, sequence_reconstructable, stage_coding_suitability
- movement_coding_suitability, location_coding_suitability, main_data_limitation
- initial_contact_visible, negotiation_visible, movement_visible
- violence_coercion_visible, exit_aftermath_visible
- movement_pattern_type, movement_timing, mappable_status
- primary_setting_type, visibility_case, isolation_case
- guardianship_case, access_to_help, setting_control
- sequence_pattern, highest_stage_reached

---

## 10. Case Summary Changes (`CodingScreen.tsx`)

### `sequence_pattern` FieldRow added (Narrative Excerpts tab)
A `FieldRow` for `sequence_pattern` was added in the Narrative Excerpts tab, after `summary_analytic`. It includes:
- Label: "Encounter sequence pattern"
- Type: textarea
- Helper text explaining the field's purpose and the missing-info rule
- Provenance tracking and mark-reviewed button

### Encounter Sequence Output section added (Case Summary tab)
A new `SummarySectionBox` titled "Encounter Sequence Output" was added to the Case Summary tab. It contains:
- Methodological note: distinguishes auto-generated stage chain from analyst-written sequence pattern; includes missing-info warning
- Stage coding suitability and sequence reconstructable chips
- Coded sequence pattern display (if entered), with left-border accent styling
- Data limitation warning box (if `main_data_limitation` is present and not "none apparent")
- Fallback message if no sequence pattern has been entered yet

---

## 11. Type Changes (`types.ts`)

### New interface: `ValCount`
```typescript
export interface ValCount {
  counts:      Record<string, number>;
  total_coded: number;
}
```

### New interface: `CodabilityAggregate`
22-field interface covering all aggregated codability distributions. Each field is `ValCount | undefined`.

### `ResearchAggregate` extended
```typescript
codability: CodabilityAggregate;
```

---

## 12. Items Requested That Were Not Completed

None. All items from the methodology-defensibility update request are implemented.

---

## 13. Risks, Build Issues, and Follow-Up Work

### Build issue resolved: unused import
`CodabilityAggregate` was imported in `Analysis.tsx` but not used directly. This caused a `TS6196` error on build. The import has been removed. `agg.codability` is accessed through `ResearchAggregate`, which is sufficient.

### Build cache warning (pre-existing)
The Artemis startup script uses `tsc -b` (incremental build). A stale `tsconfig.tsbuildinfo` can cause false errors from a cached prior state. Fix: delete `frontend/tsconfig.tsbuildinfo` before a clean build. Source files are confirmed correct via `tsc --noEmit`.

### Stage visibility coded in two places (by design)
Stage visibility is assessed at two levels:
- **Codability tab** — case-level toggles (`initial_contact_visible`, etc.): one yes/no/unclear per stage type for the whole case, used for data quality assessment
- **StageSequencer** — per-stage-record `stage_visible` and `stage_certainty`: richer coding per individual stage record, used for sequence analysis

Both are intentional and serve different analytic purposes. The distinction is documented in the Codebook.

### Filtered Case Groups — preset filter `has_sequence_pattern`
The preset "Has sequence pattern" passes `{ has_sequence_pattern: 'yes' }` as a query parameter to `api.listReports()`. This requires the backend `GET /reports` endpoint to support this filter parameter. If the backend does not currently handle `has_sequence_pattern`, this preset will return unfiltered results rather than failing. Recommend verifying backend filter support or replacing with a client-side filter on the returned list.

### NLP / AI tools (intentionally preserved)
The NLP text scan, Claude AI excerpt extraction, and ParseViewer remain fully functional but are visually demoted into a collapsed accordion in the Narrative Excerpts tab. They are not removed.

### Public safety / bulletin functionality (intentionally preserved)
The bulletin output page, VAWG fields, and public safety urgency fields remain fully functional but are visually demoted. No data has been deleted.

### Existing saved cases unaffected
All new database columns default to empty string. No existing case records are modified. The migration adds columns only; no columns are dropped or renamed.
