"""
research.py — Derived analytical summaries and cross-case pattern aggregation.

Provenance rules (applied throughout):
- field_provenance state 'analyst_filled' or 'reviewed'  → labelled 'coded'
- field_provenance state 'ai_suggested'                  → labelled 'provisional'
- state 'unset' or missing                               → labelled 'unset'
  (bulk-import / not yet touched by analyst)

Derived outputs NEVER invent stages not supported by the coded data.
NLP-only contributions are always surfaced as provisional — never as confirmed findings.
"""

from collections import Counter
from typing import Any

_POSITIVE: frozenset = frozenset({'yes', 'probable', 'inferred', 'probable / inferred'})

_BULLETIN_POSITIVE: frozenset = frozenset({
    'immediate — issue bulletin', 'yes — further review needed', 'possible — analyst review',
})
_URGENCY_HIGH: frozenset = frozenset({'urgent — same-day action', 'high — within 48 hours'})

_HEATMAP_FIELDS: list = [
    'refusal_present', 'pressure_after_refusal', 'coercion_present', 'threats_present',
    'physical_force', 'sexual_assault', 'stealthing', 'robbery_theft',
    'non_consensual_substance', 'loss_of_consciousness', 'forced_movement_dragging',
    'restraint_confinement', 'weapon_present_used', 'choking_strangulation',
    'prevented_exit', 'movement_relocation_present',
    'trafficking_exploitation_concern', 'third_party_control_indicated',
    'public_safety_bulletin_suitability',
]

_VAWG_FLAG_FIELDS: list = [
    'trafficking_exploitation_concern', 'third_party_control_indicated',
    'worker_appears_controlled', 'client_connected_to_controller',
    'movement_to_unknown_unsafe_location', 'worker_unaware_how_arrived',
    'grooming_recruitment_concern', 'repeat_targeting_concern',
    'multiple_women_referenced', 'organized_group_offending_concern',
]

# ── Low-level helpers ─────────────────────────────────────────────────────────

def _get(r, field: str) -> str:
    """Return field value from ORM object or plain dict, normalised to str."""
    if isinstance(r, dict):
        return (r.get(field) or '').strip()
    return (getattr(r, field, None) or '').strip()


def _provenance(fp: dict, field: str) -> str:
    """
    Classify field provenance into one of three states:
      'coded'       — analyst explicitly set (analyst_filled | reviewed)
      'provisional' — AI suggested only (ai_suggested)
      'unset'       — not touched (unset / missing)
    """
    state = fp.get(field, 'unset') if isinstance(fp, dict) else 'unset'
    if state in ('analyst_filled', 'reviewed'):
        return 'coded'
    if state == 'ai_suggested':
        return 'provisional'
    return 'unset'


def _fp(r) -> dict:
    """Extract field_provenance dict from ORM object or dict."""
    if isinstance(r, dict):
        fp = r.get('field_provenance') or {}
    else:
        fp = getattr(r, 'field_provenance', None) or {}
    return fp if isinstance(fp, dict) else {}


# ── Encounter sequence ────────────────────────────────────────────────────────

# Ordered stage definitions: (display_label, field_name, positive_values or None)
# None means: include if field has any non-empty value.
_SEQUENCE_STAGE_DEFS = [
    ('Negotiation',             'negotiation_present',          {'yes'}),
    ('Service discussed',       'service_discussed',            {'yes'}),
    ('Refusal',                 'refusal_present',              {'yes'}),
    ('Pressure after refusal',  'pressure_after_refusal',       {'yes'}),
    ('Repeated pressure',       'repeated_pressure',            {'yes'}),
    ('Coercion',                'coercion_present',             {'yes'}),
    ('Intimidation',            'intimidation_present',         {'yes'}),
    ('Threats',                 'threats_present',              {'yes'}),
    ('Verbal abuse',            'verbal_abuse',                 {'yes'}),
    ('Abrupt tone change',      'abrupt_tone_change',           {'yes'}),
    ('Movement',                'movement_present',             {'yes'}),
    ('Environment shift: public→private',  'public_to_private_shift',  {'yes'}),
    ('Environment shift: public→secluded', 'public_to_secluded_shift', {'yes'}),
    ('Physical force',          'physical_force',               {'yes'}),
    ('Sexual assault',          'sexual_assault',               {'yes'}),
    ('Robbery / theft',         'robbery_theft',                {'yes'}),
    ('Stealthing',              'stealthing',                   {'yes'}),
]


def build_encounter_sequence(r, fp: dict | None = None) -> list[dict]:
    """
    Derive an encounter sequence from coded fields.

    Returns a list of stage dicts:
      { 'stage': str, 'provenance': 'coded'|'provisional'|'unset' }

    Only stages supported by the data are included.
    Stages sourced only from NLP (ai_suggested) are marked provisional.
    """
    if fp is None:
        fp = _fp(r)

    stages: list[dict] = []

    # ── Contact stage — always first ──────────────────────────────────────────
    approach = _get(r, 'initial_approach_type')
    contact_loc = _get(r, 'initial_contact_location')
    if approach:
        prov = _provenance(fp, 'initial_approach_type')
        stages.append({'stage': f"Contact ({approach})", 'provenance': prov})
    elif contact_loc:
        stages.append({'stage': 'Contact', 'provenance': 'coded'})
    else:
        # Contact is always the start of an encounter — mark as unset if no detail
        stages.append({'stage': 'Contact', 'provenance': 'unset'})

    # ── Main sequence stages ──────────────────────────────────────────────────
    for label, field, positive_vals in _SEQUENCE_STAGE_DEFS:
        val = _get(r, field)
        if not val:
            continue
        if positive_vals is None or val in positive_vals:
            prov = _provenance(fp, field)
            stages.append({'stage': label, 'provenance': prov})

    # ── Exit stage — special: include exit type label ─────────────────────────
    exit_type = _get(r, 'exit_type')
    if exit_type:
        _exit_labels = {
            'completed':   'Exit — incident completed',
            'escaped':     'Exit — victim escaped',
            'abandoned':   'Exit — abandoned',
            'interrupted': 'Exit — interrupted',
            'unknown':     'Exit — unknown',
        }
        label = _exit_labels.get(exit_type, f"Exit ({exit_type})")
        prov = _provenance(fp, 'exit_type')
        stages.append({'stage': label, 'provenance': prov})

    return stages


def sequence_to_string(stages: list[dict]) -> str:
    """Plain arrow-separated sequence string (no provenance markers)."""
    return ' → '.join(s['stage'] for s in stages)


def sequence_with_provenance(stages: list[dict]) -> str:
    """Arrow-separated sequence string with [provisional] markers."""
    parts = []
    for s in stages:
        label = s['stage']
        if s['provenance'] == 'provisional':
            label += ' [provisional]'
        parts.append(label)
    return ' → '.join(parts)


# ── Case-level summary builders ───────────────────────────────────────────────

def build_mobility_summary(r, fp: dict | None = None) -> list[dict]:
    """Build ordered mobility pathway summary items."""
    if fp is None:
        fp = _fp(r)

    items: list[dict] = []

    def add(text: str, field: str):
        items.append({'item': text, 'provenance': _provenance(fp, field)})

    if _get(r, 'movement_present') == 'yes':
        add('Movement present', 'movement_present')

    attempted  = _get(r, 'movement_attempted')
    completed  = _get(r, 'movement_completed')
    if attempted == 'yes' and completed != 'yes':
        add('Movement attempted (not completed)', 'movement_attempted')
    elif completed == 'yes':
        add('Movement completed', 'movement_completed')

    if _get(r, 'entered_vehicle') == 'yes':
        add('Entered vehicle', 'entered_vehicle')

    mode = _get(r, 'mode_of_movement')
    if mode:
        add(f"Mode: {mode}", 'mode_of_movement')

    if _get(r, 'public_to_private_shift') == 'yes':
        add('Public → private shift', 'public_to_private_shift')
    if _get(r, 'public_to_secluded_shift') == 'yes':
        add('Public → secluded shift', 'public_to_secluded_shift')
    if _get(r, 'cross_neighbourhood') == 'yes':
        add('Cross-neighbourhood movement', 'cross_neighbourhood')
    if _get(r, 'cross_municipality') == 'yes':
        add('Cross-municipality movement', 'cross_municipality')
    if _get(r, 'cross_city_movement') == 'yes':
        add('Cross-city movement', 'cross_city_movement')

    ctrl = _get(r, 'offender_control_over_movement')
    if ctrl:
        add(f"Offender control: {ctrl}", 'offender_control_over_movement')

    who_ctrl = _get(r, 'who_controlled_movement')
    if who_ctrl:
        add(f"Movement controlled by: {who_ctrl}", 'who_controlled_movement')

    start = _get(r, 'start_location_type')
    dest  = _get(r, 'destination_location_type')
    if start and dest:
        items.append({'item': f"Route: {start} → {dest}", 'provenance': 'coded'})
    elif start:
        items.append({'item': f"Start location type: {start}", 'provenance': 'coded'})
    elif dest:
        items.append({'item': f"Destination type: {dest}", 'provenance': 'coded'})

    # City-level route
    ic_city  = _get(r, 'initial_contact_city') or _get(r, 'city')
    inc_city = _get(r, 'incident_city') or _get(r, 'city')
    dst_city = _get(r, 'destination_city')
    if ic_city and inc_city and ic_city.lower() != inc_city.lower():
        items.append({'item': f"City route: {ic_city} → {inc_city}", 'provenance': 'coded'})
    if dst_city and inc_city and dst_city.lower() != inc_city.lower():
        items.append({'item': f"Destination city: {dst_city}", 'provenance': 'coded'})

    notes = _get(r, 'movement_notes')
    if notes:
        items.append({'item': f"Notes: {notes[:120]}", 'provenance': 'coded'})

    return items


def build_environment_summary(r, fp: dict | None = None) -> list[dict]:
    """Build environment context summary items."""
    if fp is None:
        fp = _fp(r)

    items: list[dict] = []

    def add(text: str, field: str):
        items.append({'item': text, 'provenance': _provenance(fp, field)})

    io_val = _get(r, 'indoor_outdoor')
    if io_val:
        add(io_val.capitalize(), 'indoor_outdoor')

    pp_val = _get(r, 'public_private')
    if pp_val:
        add(pp_val.replace('_', ' ').capitalize(), 'public_private')

    des_val = _get(r, 'deserted')
    if des_val:
        add(des_val.replace('_', ' ').capitalize(), 'deserted')

    ic_loc = _get(r, 'initial_contact_location')
    if ic_loc:
        items.append({'item': f"Contact location: {ic_loc}", 'provenance': 'coded'})

    prim_loc = _get(r, 'incident_location_primary')
    if prim_loc:
        items.append({'item': f"Primary incident location: {prim_loc}", 'provenance': 'coded'})

    sec_loc = _get(r, 'incident_location_secondary')
    if sec_loc:
        items.append({'item': f"Secondary location: {sec_loc}", 'provenance': 'coded'})

    return items


def build_harm_summary(r, fp: dict | None = None) -> list[dict]:
    """Build harm indicator summary items."""
    if fp is None:
        fp = _fp(r)

    items: list[dict] = []

    harm_fields = [
        ('coercion_present',          'Coercion'),
        ('threats_present',           'Threats'),
        ('intimidation_present',      'Intimidation'),
        ('verbal_abuse',              'Verbal abuse'),
        ('verbal_abuse_before_violence', 'Verbal abuse before violence'),
        ('physical_force',            'Physical force'),
        ('sexual_assault',            'Sexual assault'),
        ('robbery_theft',             'Robbery / theft'),
        ('stealthing',                'Stealthing'),
    ]

    for field, label in harm_fields:
        if _get(r, field) == 'yes':
            items.append({'item': label, 'provenance': _provenance(fp, field)})

    trigger = _get(r, 'escalation_trigger')
    if trigger:
        items.append({'item': f"Escalation trigger: {trigger[:100]}", 'provenance': 'coded'})

    esc_pt = _get(r, 'escalation_point')
    if esc_pt:
        items.append({'item': f"Escalation point: {esc_pt}", 'provenance': 'coded'})

    return items


def build_exit_summary(r, fp: dict | None = None) -> list[dict]:
    """Build exit / outcome summary items."""
    if fp is None:
        fp = _fp(r)

    items: list[dict] = []

    exit_type = _get(r, 'exit_type')
    if exit_type:
        _labels = {
            'completed':   'Incident completed (no disruption)',
            'escaped':     'Victim escaped',
            'abandoned':   'Incident abandoned by offender',
            'interrupted': 'Incident interrupted / disrupted',
            'unknown':     'Exit outcome unknown',
        }
        items.append({'item': _labels.get(exit_type, f"Exit: {exit_type}"),
                      'provenance': _provenance(fp, 'exit_type')})

    if _get(r, 'repeat_suspect_flag') == 'yes':
        items.append({'item': 'Repeat suspect flagged', 'provenance': 'coded'})

    if _get(r, 'repeat_vehicle_flag') == 'yes':
        items.append({'item': 'Repeat vehicle flagged', 'provenance': 'coded'})

    return items


def build_full_case_summary(r) -> dict:
    """
    Build a complete case-level analytical summary from coded fields.
    All provenance states are preserved and surfaced.
    """
    fp = _fp(r)
    stages = build_encounter_sequence(r, fp)

    return {
        'report_id':                        _get(r, 'report_id'),
        'coding_status':                    _get(r, 'coding_status'),
        'encounter_sequence':               stages,
        'encounter_sequence_string':        sequence_to_string(stages),
        'encounter_sequence_with_provenance': sequence_with_provenance(stages),
        'mobility_summary':                 build_mobility_summary(r, fp),
        'environment_summary':              build_environment_summary(r, fp),
        'harm_summary':                     build_harm_summary(r, fp),
        'exit_summary':                     build_exit_summary(r, fp),
        'has_provisional': any(
            s['provenance'] == 'provisional'
            for s in stages
        ),
    }


# ── Cross-case aggregation ────────────────────────────────────────────────────

def aggregate_sequences(reports: list) -> dict:
    """
    Aggregate encounter sequences across all reports.

    Returns:
      most_common_sequences   — full sequence strings, ranked by frequency
      most_common_bigrams     — consecutive stage pairs (transition patterns)
      stage_frequency         — how often each stage appears across the dataset
      escalation_pathways     — sequences of harm stages only
      per_case                — per-case sequence strings for CSV export
    """
    seq_counter:     Counter = Counter()
    bigram_counter:  Counter = Counter()
    stage_counter:   Counter = Counter()
    harm_counter:    Counter = Counter()

    _HARM_STAGES = {
        'Physical force', 'Sexual assault', 'Robbery / theft',
        'Coercion', 'Threats', 'Intimidation', 'Verbal abuse',
    }

    per_case = []

    for r in reports:
        fp = _fp(r)
        stages = build_encounter_sequence(r, fp)
        names  = [s['stage'] for s in stages]

        # Normalise Contact variants for counting
        def _norm(n: str) -> str:
            return 'Contact' if n.startswith('Contact') else n

        norm_names = [_norm(n) for n in names]

        if len(norm_names) >= 2:
            seq_counter[' → '.join(norm_names)] += 1

        for n in norm_names:
            stage_counter[n] += 1

        for i in range(len(norm_names) - 1):
            bigram_counter[f"{norm_names[i]} → {norm_names[i + 1]}"] += 1

        # Escalation pathway: only harm stages in order
        harm_stages_present = [n for n in norm_names if n in _HARM_STAGES]
        if len(harm_stages_present) >= 2:
            harm_counter[' → '.join(harm_stages_present)] += 1

        escalation_cue = 'yes' if any(
            _get(r, f) == 'yes' for f in ('repeated_pressure', 'intimidation_present', 'abrupt_tone_change', 'verbal_abuse_before_violence')
        ) else ''
        main_harms = ', '.join(
            lbl for fld, lbl in [
                ('coercion_present', 'coercion'), ('physical_force', 'physical force'),
                ('sexual_assault', 'sexual assault'), ('robbery_theft', 'robbery'),
                ('threats_present', 'threats'), ('weapon_present_used', 'weapon'),
                ('choking_strangulation', 'choking'), ('prevented_exit', 'exit blocked'),
            ]
            if _get(r, fld) in _POSITIVE
        )
        per_case.append({
            'report_id':                   _get(r, 'report_id'),
            'sequence':                    ' → '.join(names),
            'stage_count':                 len(names),
            'primary_incident_type':       _get(r, 'primary_incident_type'),
            'overall_severity':            _get(r, 'overall_severity'),
            'stage_coding_suitability':    _get(r, 'stage_coding_suitability'),
            'movement_relocation_present': _get(r, 'movement_relocation_present'),
            'escalation_cue':              escalation_cue,
            'main_harms':                  main_harms,
        })

    return {
        'most_common_sequences':  [{'sequence': s, 'count': c}
                                    for s, c in seq_counter.most_common(20)],
        'most_common_bigrams':    [{'pattern': p, 'count': c}
                                    for p, c in bigram_counter.most_common(20)],
        'stage_frequency':        [{'stage': s, 'count': c}
                                    for s, c in stage_counter.most_common(30)],
        'escalation_pathways':    [{'pathway': p, 'count': c}
                                    for p, c in harm_counter.most_common(15)],
        'per_case':               per_case,
        'total_cases':            len(reports),
    }


def aggregate_mobility(reports: list) -> dict:
    """
    Aggregate mobility patterns across all reports.

    Returns counts per mobility indicator, mode breakdown,
    recurring pathway combinations, route type patterns,
    and cross-city pathways.
    """
    total = len(reports)

    counts = {
        'movement_present':           sum(1 for r in reports if _get(r, 'movement_present')           == 'yes'),
        'movement_attempted':         sum(1 for r in reports if _get(r, 'movement_attempted')         == 'yes'),
        'movement_completed':         sum(1 for r in reports if _get(r, 'movement_completed')         == 'yes'),
        'entered_vehicle':            sum(1 for r in reports if _get(r, 'entered_vehicle')            == 'yes'),
        'public_to_private':          sum(1 for r in reports if _get(r, 'public_to_private_shift')    == 'yes'),
        'public_to_secluded':         sum(1 for r in reports if _get(r, 'public_to_secluded_shift')   == 'yes'),
        'cross_neighbourhood':        sum(1 for r in reports if _get(r, 'cross_neighbourhood')        == 'yes'),
        'cross_municipality':         sum(1 for r in reports if _get(r, 'cross_municipality')         == 'yes'),
        'cross_city':                 sum(1 for r in reports if _get(r, 'cross_city_movement')        == 'yes'),
        'offender_controlled_high':   sum(1 for r in reports if _get(r, 'offender_control_over_movement') == 'high'),
        'offender_controlled_moderate': sum(1 for r in reports if _get(r, 'offender_control_over_movement') == 'moderate'),
    }

    mode_counter:    Counter = Counter()
    pathway_counter: Counter = Counter()
    route_counter:   Counter = Counter()
    city_counter:    Counter = Counter()

    for r in reports:
        mode = _get(r, 'mode_of_movement')
        if mode:
            mode_counter[mode] += 1

        # Pathway combination labels
        parts = []
        if _get(r, 'entered_vehicle') == 'yes':
            parts.append('vehicle pickup')
        if _get(r, 'public_to_private_shift') == 'yes':
            parts.append('public→private')
        elif _get(r, 'public_to_secluded_shift') == 'yes':
            parts.append('public→secluded')
        if _get(r, 'cross_neighbourhood') == 'yes':
            parts.append('cross-neighbourhood')
        if _get(r, 'cross_municipality') == 'yes' or _get(r, 'cross_city_movement') == 'yes':
            parts.append('cross-city/municipality')
        if _get(r, 'offender_control_over_movement') in ('high', 'moderate'):
            parts.append('offender-controlled')
        if parts:
            pathway_counter[' + '.join(parts)] += 1

        # Route type
        start = _get(r, 'start_location_type')
        dest  = _get(r, 'destination_location_type')
        if start and dest:
            route_counter[f"{start} → {dest}"] += 1

        # Cross-city pathway
        ic_city  = (_get(r, 'initial_contact_city') or _get(r, 'city')).title()
        inc_city = (_get(r, 'incident_city') or _get(r, 'city')).title()
        if ic_city and inc_city and ic_city != inc_city:
            city_counter[f"{ic_city} → {inc_city}"] += 1

    return {
        'counts':              counts,
        'mode_breakdown':      [{'mode': m, 'count': c}  for m, c in mode_counter.most_common(10)],
        'recurring_pathways':  [{'pathway': p, 'count': c} for p, c in pathway_counter.most_common(15)],
        'route_patterns':      [{'route': r, 'count': c}  for r, c in route_counter.most_common(10)],
        'cross_city_pathways': [{'pathway': p, 'count': c} for p, c in city_counter.most_common(10)],
        'total':               total,
    }


def aggregate_environment(reports: list) -> dict:
    """
    Aggregate environmental patterns across all reports.

    Returns distributions (indoor/outdoor, public/private, deserted),
    location type frequencies, cross-tabulations of violence/movement by
    environment, and combined pattern counts.
    """
    total = len(reports)

    io_counter:  Counter = Counter()
    pp_counter:  Counter = Counter()
    des_counter: Counter = Counter()
    loc_counter: Counter = Counter()

    # Keyword → canonical location type category.
    # Checked in order; first match wins.
    _LOC_CLASSIFY: list[tuple[str, str]] = [
        # Vehicles first (avoid "avenue" hitting "vehicle")
        ('vehicle',       'vehicle / car'),
        (' car ',         'vehicle / car'),
        ('truck',         'vehicle / car'),
        ('suv',           'vehicle / car'),
        ('van ',          'vehicle / car'),
        # Accommodation
        ('hotel',         'hotel / motel'),
        ('motel',         'hotel / motel'),
        ('airbnb',        'hotel / motel'),
        # Residence
        ('residence',     'residence'),
        ('house',         'residence'),
        ('apartment',     'residence'),
        ('condo',         'residence'),
        ('home',          'residence'),
        ('unit ',         'residence'),
        ('suite',         'residence'),
        # Outdoor / lanes
        ('alley',         'alley / lane'),
        (' lane',         'alley / lane'),
        # Streets / roads
        ('street',        'street / roadway'),
        (' road',         'street / roadway'),
        ('avenue',        'street / roadway'),
        ('boulevard',     'street / roadway'),
        ('highway',       'street / roadway'),
        ('intersection',  'known intersection'),
        (' and ',         'known intersection'),
        (' & ',           'known intersection'),
        # Parks / outdoor
        ('park',          'park / outdoor area'),
        ('outdoor',       'park / outdoor area'),
        ('field',         'park / outdoor area'),
        # Parking
        ('parking lot',   'parking lot'),
        ('parking',       'parking lot'),
        # Commercial / business
        ('business',      'business / commercial site'),
        ('store',         'business / commercial site'),
        ('shop',          'business / commercial site'),
        ('mall',          'business / commercial site'),
        ('office',        'business / commercial site'),
        # Venues
        ('bar',           'bar / venue'),
        ('club',          'bar / venue'),
        ('restaurant',    'bar / venue'),
        # Digital / online
        ('online',        'online / digital'),
        ('app',           'online / digital'),
        ('text',          'online / digital'),
        ('phone',         'online / digital'),
        # Unknown explicit
        ('unknown',       'unknown / unclear'),
        ('unclear',       'unknown / unclear'),
        ('not known',     'unknown / unclear'),
        ('not specified', 'unknown / unclear'),
    ]

    # Narrative-fragment detection: if the raw value looks like a sentence
    # (long, starts with a stopword, or contains a full stop), classify it
    # as "other / unclear" rather than dumping it as a category label.
    _NARRATIVE_STARTERS = (
        'the ', 'it ', 'she ', 'he ', 'they ', 'worker ', 'suspect ',
        'client ', 'victim ', 'this ', 'an ', 'a ', 'after ', 'when ',
        'at the time', 'foot ',  # e.g. "foot" as lone word → not a category
    )

    def _classify_location(loc: str) -> tuple[str, str | None]:
        """
        Return (category, specific_location | None).

        category         — one of the canonical type strings above
        specific_location — non-None when the value looks like a named place
                            (intersection, neighbourhood, municipality) rather
                            than a generic type string.
        """
        raw = loc.strip()
        if not raw:
            return ('unknown / unclear', None)

        lc = raw.lower()

        # Reject outright if it looks like a sentence fragment
        is_long_narrative = len(raw) > 40 or '.' in raw or raw.endswith(',')
        starts_narrative  = any(lc.startswith(s) for s in _NARRATIVE_STARTERS)
        if is_long_narrative or starts_narrative:
            return ('other / unclear', None)

        # Keyword classification
        for keyword, category in _LOC_CLASSIFY:
            if keyword in lc:
                # If it matched "and" / "&" but is short it may be a named intersection
                if keyword in (' and ', ' & '):
                    return (category, raw.title())
                return (category, None)

        # Short, looks like a proper noun / named place → specific location
        if len(raw) <= 35:
            return ('known neighbourhood / municipality', raw.title())

        return ('other / unclear', None)

    specific_loc_counter: Counter = Counter()
    location_mentions_total: int = 0  # may exceed case count (up to 3 fields per case)

    for r in reports:
        io = _get(r, 'indoor_outdoor')
        if io:
            io_counter[io] += 1

        pp = _get(r, 'public_private')
        if pp:
            pp_counter[pp] += 1

        des = _get(r, 'deserted')
        if des:
            des_counter[des] += 1

        for field in ('initial_contact_location', 'incident_location_primary',
                      'incident_location_secondary'):
            loc = _get(r, field)
            if not loc:
                continue
            location_mentions_total += 1
            category, specific = _classify_location(loc)
            loc_counter[category] += 1
            if specific:
                specific_loc_counter[specific] += 1

    # ── Cross-tabulations ─────────────────────────────────────────────────────
    def _harm_cross(subset: list) -> dict:
        n = len(subset)
        return {
            'count':          n,
            'physical_force': sum(1 for r in subset if _get(r, 'physical_force') == 'yes'),
            'sexual_assault': sum(1 for r in subset if _get(r, 'sexual_assault') == 'yes'),
            'coercion':       sum(1 for r in subset if _get(r, 'coercion_present') == 'yes'),
            'movement':       sum(1 for r in subset if _get(r, 'movement_present') == 'yes'),
        }

    violence_by_env: dict = {}
    for val in ['indoor', 'outdoor', 'unclear']:
        subset = [r for r in reports if _get(r, 'indoor_outdoor') == val]
        if subset:
            violence_by_env[val] = _harm_cross(subset)

    movement_by_setting: dict = {}
    for val in ['public', 'private', 'semi-private']:
        subset = [r for r in reports if _get(r, 'public_private') == val]
        if subset:
            movement_by_setting[val] = _harm_cross(subset)

    deserted_analysis: dict = {}
    for val in ['deserted', 'not_deserted']:
        subset = [r for r in reports if _get(r, 'deserted') == val]
        if subset:
            deserted_analysis[val] = _harm_cross(subset)

    # Combined: environment + movement + harm
    combined_counter: Counter = Counter()
    for r in reports:
        io = _get(r, 'indoor_outdoor')
        pp = _get(r, 'public_private')
        has_move   = _get(r, 'movement_present') == 'yes'
        has_force  = _get(r, 'physical_force') == 'yes' or _get(r, 'sexual_assault') == 'yes'
        has_coerce = _get(r, 'coercion_present') == 'yes'

        if io and pp and (has_force or has_coerce):
            parts = [f"{io} / {pp}"]
            if has_move:
                parts.append('with movement')
            if has_force:
                parts.append('+ violence')
            if has_coerce:
                parts.append('+ coercion')
            combined_counter[' '.join(parts)] += 1

    return {
        'indoor_outdoor':        dict(io_counter),
        'public_private':        dict(pp_counter),
        'deserted':              dict(des_counter),
        'location_types':        [{'type': t, 'count': c}
                                   for t, c in loc_counter.most_common(20)],
        'specific_locations':    [{'location': loc, 'count': c}
                                   for loc, c in specific_loc_counter.most_common(20)
                                   if c >= 2],   # only show repeated locations
        'location_mentions_total': location_mentions_total,
        'violence_by_environment': violence_by_env,
        'movement_by_setting':   movement_by_setting,
        'deserted_analysis':     deserted_analysis,
        'combined_patterns':     [{'pattern': p, 'count': c}
                                   for p, c in combined_counter.most_common(15)],
        'total':                 total,
    }


def aggregate_encounter(reports: list) -> dict:
    """
    Aggregate encounter-level (whole-incident) indicator fields across all reports.

    Counts positive responses (yes / probable / inferred / probable / inferred) for
    all major Encounter tab indicators and builds frequency distributions for
    categorical fields (primary incident type, overall severity, etc.).
    Also builds useful cross-tabulations.
    """
    total = len(reports)

    incident_type_ctr: Counter = Counter()
    severity_ctr:      Counter = Counter()
    suitability_ctr:   Counter = Counter()
    clarity_ctr:       Counter = Counter()

    indicator_fields = [
        'negotiation_present', 'refusal_present', 'pressure_after_refusal',
        'boundary_issue_present', 'coercion_present', 'threats_present',
        'verbal_abuse', 'physical_force', 'non_consensual_substance',
        'sexual_assault', 'stealthing', 'robbery_theft', 'loss_of_consciousness',
        'forced_movement_dragging', 'restraint_confinement', 'weapon_present_used',
        'choking_strangulation', 'prevented_exit', 'movement_relocation_present',
        'repeated_pressure', 'intimidation_present', 'abrupt_tone_change',
        'verbal_abuse_before_violence',
    ]
    indicator_counts = {f: 0 for f in indicator_fields}

    refusal_then_coercion   = 0
    pressure_then_force     = 0
    movement_with_harm      = 0
    substance_with_blackout = 0

    for r in reports:
        it = _get(r, 'primary_incident_type')
        if it:
            incident_type_ctr[it] += 1

        sev = _get(r, 'overall_severity')
        if sev:
            severity_ctr[sev] += 1

        suit = _get(r, 'stage_coding_suitability')
        if suit:
            suitability_ctr[suit] += 1

        cl = _get(r, 'sequence_clarity')
        if cl:
            clarity_ctr[cl] += 1

        for field in indicator_fields:
            if _get(r, field) in _POSITIVE:
                indicator_counts[field] += 1

        # Cross-tabulations — accumulated in main loop (single pass)
        if _get(r, 'refusal_present') in _POSITIVE and _get(r, 'coercion_present') in _POSITIVE:
            refusal_then_coercion += 1
        if _get(r, 'pressure_after_refusal') in _POSITIVE and _get(r, 'physical_force') in _POSITIVE:
            pressure_then_force += 1
        if _get(r, 'movement_relocation_present') in _POSITIVE and (
            _get(r, 'coercion_present') in _POSITIVE
            or _get(r, 'physical_force') in _POSITIVE
            or _get(r, 'sexual_assault') in _POSITIVE
        ):
            movement_with_harm += 1
        if _get(r, 'non_consensual_substance') in _POSITIVE and _get(r, 'loss_of_consciousness') in _POSITIVE:
            substance_with_blackout += 1

    return {
        'incident_type_distribution': [{'value': v, 'count': c} for v, c in incident_type_ctr.most_common()],
        'severity_distribution':      [{'value': v, 'count': c} for v, c in severity_ctr.most_common()],
        'suitability_distribution':   [{'value': v, 'count': c} for v, c in suitability_ctr.most_common()],
        'clarity_distribution':       [{'value': v, 'count': c} for v, c in clarity_ctr.most_common()],
        'indicator_counts':           indicator_counts,
        'cross_tabs': {
            'refusal_then_coercion':    refusal_then_coercion,
            'pressure_then_force':      pressure_then_force,
            'movement_with_harm':       movement_with_harm,
            'substance_with_blackout':  substance_with_blackout,
        },
        'total': total,
    }


def aggregate_vawg(reports: list) -> dict:
    """
    Aggregate VAWG / Exploitation and Public Safety Flag fields across all reports.
    Single pass: builds flag counts, distributions, cross-tabs,
    co-occurrence matrix, and flagged-for-review list.
    """
    total = len(reports)

    flag_counts = {f: 0 for f in _VAWG_FLAG_FIELDS}
    bulletin_positive_count = 0
    urgency_high_count      = 0
    urgency_ctr:   Counter = Counter()
    bulletin_ctr:  Counter = Counter()

    n = len(_HEATMAP_FIELDS)
    matrix = [[0] * n for _ in range(n)]

    cross_tabs = {
        'trafficking_with_movement':            0,
        'trafficking_with_substance':           0,
        'trafficking_with_blackout':            0,
        'third_party_with_unknown_location':    0,
        'group_offending_with_sexual_violence': 0,
        'bulletin_suitable_with_repeat_target': 0,
    }

    flagged_for_review: list = []

    for r in reports:
        # Flag counts (VAWG select fields)
        for field in _VAWG_FLAG_FIELDS:
            if _get(r, field) in _POSITIVE:
                flag_counts[field] += 1

        # Bulletin suitability / urgency
        bull = _get(r, 'public_safety_bulletin_suitability')
        if bull:
            bulletin_ctr[bull] += 1
        if bull in _BULLETIN_POSITIVE:
            bulletin_positive_count += 1

        urg = _get(r, 'public_safety_urgency_level')
        if urg:
            urgency_ctr[urg] += 1
        if urg in _URGENCY_HIGH:
            urgency_high_count += 1

        # Co-occurrence matrix — upper triangle, mirrored after loop
        # Field index 18 (public_safety_bulletin_suitability) uses bulletin-specific positive set
        row_vals = [_get(r, f) for f in _HEATMAP_FIELDS]
        positives = [
            v in _BULLETIN_POSITIVE if i == 18 else v in _POSITIVE
            for i, v in enumerate(row_vals)
        ]
        for i in range(n):
            if positives[i]:
                matrix[i][i] += 1
                for j in range(i + 1, n):
                    if positives[j]:
                        matrix[i][j] += 1

        # Cross-tabs
        traf = _get(r, 'trafficking_exploitation_concern') in _POSITIVE
        if traf:
            if _get(r, 'movement_relocation_present') in _POSITIVE:
                cross_tabs['trafficking_with_movement'] += 1
            if _get(r, 'non_consensual_substance') in _POSITIVE:
                cross_tabs['trafficking_with_substance'] += 1
            if _get(r, 'loss_of_consciousness') in _POSITIVE:
                cross_tabs['trafficking_with_blackout'] += 1
        if _get(r, 'third_party_control_indicated') in _POSITIVE and \
                _get(r, 'movement_to_unknown_unsafe_location') in _POSITIVE:
            cross_tabs['third_party_with_unknown_location'] += 1
        if _get(r, 'organized_group_offending_concern') in _POSITIVE and \
                _get(r, 'sexual_assault') in _POSITIVE:
            cross_tabs['group_offending_with_sexual_violence'] += 1
        if bull in _BULLETIN_POSITIVE and \
                _get(r, 'repeat_targeting_concern') in _POSITIVE:
            cross_tabs['bulletin_suitable_with_repeat_target'] += 1

        # Flagged for review
        any_vawg_flag = any(_get(r, f) in _POSITIVE for f in _VAWG_FLAG_FIELDS)
        is_flagged = any_vawg_flag or bull in _BULLETIN_POSITIVE or urg in _URGENCY_HIGH
        if is_flagged and _get(r, 'coding_status') != 'uncoded':
            reasons = []
            if traf:
                reasons.append('trafficking/exploitation concern')
            if _get(r, 'third_party_control_indicated') in _POSITIVE:
                reasons.append('third-party control')
            if _get(r, 'worker_appears_controlled') in _POSITIVE:
                reasons.append('worker appears controlled')
            if _get(r, 'grooming_recruitment_concern') in _POSITIVE:
                reasons.append('grooming/recruitment')
            if _get(r, 'repeat_targeting_concern') in _POSITIVE:
                reasons.append('repeat targeting')
            if _get(r, 'multiple_women_referenced') in _POSITIVE:
                reasons.append('multiple women referenced')
            if _get(r, 'organized_group_offending_concern') in _POSITIVE:
                reasons.append('group offending concern')
            if bull in _BULLETIN_POSITIVE:
                reasons.append('bulletin suitable')
            if urg in _URGENCY_HIGH:
                reasons.append(f'urgency: {urg}')
            flagged_for_review.append({
                'report_id':                          _get(r, 'report_id'),
                'incident_date':                      _get(r, 'incident_date'),
                'city':                               _get(r, 'city'),
                'primary_incident_type':              _get(r, 'primary_incident_type'),
                'overall_severity':                   _get(r, 'overall_severity'),
                'public_safety_urgency_level':        urg,
                'public_safety_bulletin_suitability': bull,
                'coding_status':                      _get(r, 'coding_status'),
                'vawg_key_excerpts':                  _get(r, 'vawg_key_excerpts'),
                'reasons':                            reasons,
            })

    # Mirror co-occurrence matrix upper triangle
    for i in range(n):
        for j in range(i + 1, n):
            matrix[j][i] = matrix[i][j]

    return {
        'flag_counts': {
            **flag_counts,
            'public_safety_bulletin_suitability_positive': bulletin_positive_count,
            'public_safety_urgency_urgent_high':            urgency_high_count,
        },
        'urgency_distribution':             [{'value': v, 'count': c} for v, c in urgency_ctr.most_common()],
        'bulletin_suitability_distribution':[{'value': v, 'count': c} for v, c in bulletin_ctr.most_common()],
        'cross_tabs':                       cross_tabs,
        'cooccurrence': {
            'fields': _HEATMAP_FIELDS,
            'matrix': matrix,
        },
        'flagged_for_review': flagged_for_review,
        'total':              total,
    }
