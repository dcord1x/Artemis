# Coding Fields Reference

All fields in the `Report` model, organized by section. Each field stores a string value unless noted.

Provenance state is tracked separately in `field_provenance` (JSON): `unset | ai_suggested | analyst_filled | reviewed`.

---

## Section 1 — Source / Admin

| Field | Values / Notes |
|---|---|
| `report_id` | Auto-generated UUID |
| `raw_narrative` | Original incident narrative text (immutable after save) |
| `source_organization` | Organization that submitted the report |
| `source_worker_id` | Anonymous worker identifier |
| `date_received` | Date report was received |
| `original_report_format` | `text`, `pdf`, `excel` |
| `analyst_name` | Name of analyst coding this report |
| `coding_status` | `uncoded`, `in_progress`, `coded`, `reviewed` |
| `confidence_level` | `low`, `medium`, `high` |

---

## Section 2 — Incident Basics

| Field | Values / Notes |
|---|---|
| `incident_date` | Date of incident (`YYYY-MM-DD`) |
| `incident_time_exact` | Exact time if known |
| `incident_time_range` | Time range (e.g. "evening") |
| `day_of_week` | Mon–Sun |
| `city` | Legacy summary city label |
| `neighbourhood` | Neighbourhood name |
| `initial_contact_city` | City at initial contact stage |
| `initial_contact_city_confidence` | `known`, `probable`, `inferred`, `unknown` |
| `incident_city` | City at primary incident stage |
| `incident_city_confidence` | `known`, `probable`, `inferred`, `unknown` |
| `destination_city` | City at destination / secondary stage |
| `destination_city_confidence` | `known`, `probable`, `inferred`, `unknown` |
| `cross_city_movement` | `yes`, `no`, `unclear` |
| `initial_contact_location` | Address / description of initial contact location |
| `incident_location_primary` | Primary incident address / description |
| `incident_location_secondary` | Secondary location (if applicable) |
| `indoor_outdoor` | `indoor`, `outdoor`, `unclear` |
| `public_private` | `public`, `private`, `semi-private` |
| `deserted` | `deserted`, `not_deserted`, `unclear` |

---

## Section 3 — Encounter Sequence

| Field | Values / Notes |
|---|---|
| `initial_approach_type` | How suspect made initial contact |
| `negotiation_present` | `yes`, `no`, `unclear` |
| `service_discussed` | `yes`, `no`, `unclear` |
| `payment_discussed` | `yes`, `no`, `unclear` |
| `refusal_present` | `yes`, `no`, `unclear` |
| `pressure_after_refusal` | `yes`, `no`, `unclear` |
| `coercion_present` | `yes`, `no`, `unclear` |
| `threats_present` | `yes`, `no`, `unclear` |
| `verbal_abuse` | `yes`, `no`, `unclear` |
| `physical_force` | `yes`, `no`, `unclear` |
| `sexual_assault` | `yes`, `no`, `unclear` |
| `robbery_theft` | `yes`, `no`, `unclear` |
| `stealthing` | `yes`, `no`, `unclear` |
| `exit_type` | `completed`, `escaped`, `abandoned`, `interrupted`, `unknown` |
| `repeated_pressure` | `yes`, `no`, `unclear` |
| `intimidation_present` | `yes`, `no`, `unclear` |
| `abrupt_tone_change` | `yes`, `no`, `unclear` |
| `escalation_trigger` | Free-text description of what triggered escalation |
| `verbal_abuse_before_violence` | `yes`, `no`, `unclear` |

---

## Section 4 — Mobility

| Field | Values / Notes |
|---|---|
| `movement_present` | `yes`, `no`, `unclear` |
| `movement_attempted` | `yes`, `no`, `unclear` |
| `mode_of_movement` | `vehicle`, `on_foot`, `transit`, `unclear` |
| `entered_vehicle` | `yes`, `no`, `unclear` |
| `vehicle_driver_role` | Role of vehicle driver in incident |
| `start_location_type` | Type of start location |
| `destination_location_type` | Type of destination location |
| `public_to_private_shift` | `yes`, `no`, `unclear` |
| `public_to_secluded_shift` | `yes`, `no`, `unclear` |
| `cross_neighbourhood` | `yes`, `no`, `unclear` |
| `cross_municipality` | `yes`, `no`, `unclear` |
| `offender_control_over_movement` | `low`, `moderate`, `high`, `unclear` |
| `movement_completed` | `yes`, `no`, `unclear` |
| `who_controlled_movement` | `offender`, `victim`, `shared`, `unclear` |
| `movement_confidence` | `high`, `medium`, `low`, `unclear` |
| `movement_notes` | Free-text notes on movement |
| `destination_known` | `yes`, `no`, `unclear`, `inferred` |
| `location_certainty` | `high`, `medium`, `low`, `unknown` |

---

## Section 5 — Suspect & Vehicle

| Field | Values / Notes |
|---|---|
| `suspect_count` | Number of suspects |
| `suspect_gender` | Gender description |
| `suspect_description_text` | Free-text physical description |
| `suspect_race_ethnicity` | Race/ethnicity description |
| `suspect_age_estimate` | Estimated age or range |
| `vehicle_present` | `yes`, `no`, `unclear` |
| `vehicle_make` | Make of vehicle |
| `vehicle_model` | Model of vehicle |
| `vehicle_colour` | Colour of vehicle |
| `plate_partial` | Partial plate number if captured |
| `repeat_suspect_flag` | `yes`, `no`, `unclear` |
| `repeat_vehicle_flag` | `yes`, `no`, `unclear` |

---

## Section 6 — Narrative Coding

| Field | Values / Notes |
|---|---|
| `early_escalation_score` | Score 1–5 for early escalation indicators |
| `mobility_richness_score` | Score for richness of mobility information |
| `escalation_point` | At what point escalation occurred |
| `summary_analytic` | Analyst-written analytic summary |
| `key_quotes` | Key quotes from the narrative |
| `coder_notes` | Internal notes for the coder |
| `uncertainty_notes` | Notes on uncertain/ambiguous fields |
| `cleaned_narrative` | Cleaned/redacted version of narrative |
| `analyst_summary` | Analyst interpretive summary (distinct from cleaned_narrative) |

---

## Section 7 — GIS

Three geocoded location stages: **initial contact**, **incident**, **destination**.

For each stage the same set of fields is repeated:

| Field Pattern | Values / Notes |
|---|---|
| `{stage}_address_raw` | Raw address string from narrative |
| `{stage}_address_normalized` | Standardized address after geocoding |
| `lat_{stage}` / `lon_{stage}` | Float coordinates (nullable) |
| `{stage}_precision` | `exact`, `approximate`, `unknown` |
| `{stage}_source` | `stated`, `inferred`, `unclear` |
| `{stage}_confidence` | `high`, `medium`, `low`, `none` |
| `{stage}_analyst_notes` | Free-text notes on geocoding decision |

Where `{stage}` is `initial_contact`, `incident`, or `destination`.

`geocode_status` — overall geocoding status for the case.

---

## Meta / Audit Fields

| Field | Type | Notes |
|---|---|---|
| `field_provenance` | JSON | Maps `field_name → state` (`unset`, `ai_suggested`, `analyst_filled`, `reviewed`) |
| `ai_suggestions` | JSON | Stores Claude outputs and NLP results |
| `audit_log` | JSON | Timestamped change log |
| `tags` | JSON | Array of analyst-applied tags |
| `narrative_hash` | string | SHA-256 of normalized narrative for deduplication |
| `created_at` / `updated_at` | DateTime | Auto-managed |

---

## Case Linkage Fields (`case_linkages` table)

| Field | Notes |
|---|---|
| `report_id_a` / `report_id_b` | The two cases being compared |
| `similarity_score` | Overall score 0–100 |
| `score_breakdown` | JSON: per-domain scores (control, sexual, style, mobility, target_selection, vehicle, suspect_text, temporal, geographic) |
| `analyst_status` | `possible_link`, `unlikely_link`, `needs_review` |
| `analyst_notes` | Free-text analyst verdict |
