"""
Weighted case-to-case similarity engine.

Algorithm upgrades based on:
  - Tonkin et al. 2025 (JQC): Log similarity metric + OR-based variable weights
  - Tonkin et al. 2017 (JCJ): Bayesian domain scoring; joint absence as distinct signal
  - Hobson et al. 2021 (JEC): Explainability layer for analyst trust

Each dimension returns:
  score         : float 0–1
  weight        : int (points available, sum = 100)
  matches       : list[str]  human-readable match descriptions
  matched_fields: list[str]  DB / TypeScript field keys that matched
  joint_present : list[str]  fields jointly present in both cases (yes/yes)
  discordant    : list[str]  fields present in one case but not the other
  reason        : str        one-sentence summary shown to analyst
"""

from __future__ import annotations
import math
from datetime import datetime
from typing import Any

STOPWORDS = {
    'the','a','an','and','or','was','were','he','she','they','it','in','on',
    'at','to','of','with','had','did','not','said','told','then','after',
    'her','his','him','who','that','this','when','from','but','by','as',
}


# ── Behavioral field definitions ────────────────────────────────────────────
#
# OR-based quartile weights (Tonkin et al. 2025):
#   Q1 (highest discriminating power): 2.0
#   Q2: 1.5   Q3: 1.0   Q4: 0.5
#
# Each entry: field_name -> (or_weight, display_label, domain)

BINARY_FIELDS: dict[str, tuple[float, str, str]] = {
    # Control behaviors — highest weight domain (30%)
    'physical_force':                (2.0, 'Physical force',           'control'),
    'coercion_present':              (2.0, 'Coercion',                 'control'),
    'threats_present':               (1.5, 'Threats',                  'control'),
    'pressure_after_refusal':        (1.5, 'Pressure after refusal',   'control'),
    'offender_control_over_movement':(1.5, 'Movement control',         'control'),
    # Sexual behaviors (25%)
    'sexual_assault':                (2.0, 'Sexual assault',           'sexual'),
    'stealthing':                    (2.0, 'Stealthing',               'sexual'),
    'refusal_present':               (1.5, 'Refusal present',          'sexual'),
    # Style/approach behaviors (20%)
    'robbery_theft':                 (1.0, 'Robbery/theft',            'style'),
    'verbal_abuse':                  (1.0, 'Verbal abuse',             'style'),
    'negotiation_present':           (0.5, 'Negotiation present',      'style'),
    'service_discussed':             (0.5, 'Service discussed',        'style'),
    'payment_discussed':             (0.5, 'Payment discussed',        'style'),
    # Escape/mobility behaviors (15%)
    'movement_present':              (1.0, 'Movement present',         'escape'),
    'entered_vehicle':               (1.0, 'Entered vehicle',          'escape'),
    'public_to_private_shift':       (1.0, 'Public→private shift',    'escape'),
    'public_to_secluded_shift':      (1.0, 'Public→secluded shift',   'escape'),
    'cross_municipality':            (1.0, 'Cross municipality',       'escape'),
    'cross_neighbourhood':           (1.0, 'Cross neighbourhood',      'escape'),
    # Target selection behaviors (10%)
    'deserted':                      (1.0, 'Deserted location',        'target'),
    'repeat_suspect_flag':           (1.0, 'Repeat suspect',           'target'),
    'repeat_vehicle_flag':           (1.0, 'Repeat vehicle',           'target'),
}

DOMAIN_CONFIG: dict[str, dict] = {
    'control': {'label': 'Control behaviors',          'weight': 0.30},
    'sexual':  {'label': 'Sexual behaviors',            'weight': 0.25},
    'style':   {'label': 'Style/approach behaviors',   'weight': 0.20},
    'escape':  {'label': 'Escape/mobility behaviors',  'weight': 0.15},
    'target':  {'label': 'Target selection behaviors', 'weight': 0.10},
}


# ── Utilities ──────────────────────────────────────────────────────────────

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def word_jaccard(text_a: str, text_b: str) -> tuple[float, list[str]]:
    wa = {w.lower() for w in text_a.split() if len(w) > 2 and w.lower() not in STOPWORDS}
    wb = {w.lower() for w in text_b.split() if len(w) > 2 and w.lower() not in STOPWORDS}
    if not wa or not wb:
        return 0.0, []
    inter = wa & wb
    union = wa | wb
    return len(inter) / len(union), sorted(inter)


def plate_similarity(plate_a: str, plate_b: str) -> tuple[float, str]:
    a = plate_a.replace(' ', '').upper()
    b = plate_b.replace(' ', '').upper()
    if not a or not b:
        return 0.0, ''
    if a == b:
        return 1.0, f'Exact plate match: {a}'
    # Longest common substring
    best, common = 0, ''
    for i in range(len(a)):
        for j in range(len(b)):
            k = 0
            while i + k < len(a) and j + k < len(b) and a[i + k] == b[j + k]:
                k += 1
            if k > best:
                best, common = k, a[i:i + k]
    if best >= 3:
        score = min(best / max(len(a), len(b)) * 1.3, 1.0)
        return score, f'Shared plate characters: {common}'
    return 0.0, ''


def _get(r: Any, field: str) -> str:
    return (getattr(r, field, '') or '').strip()


# ── Log similarity core (Tonkin et al. 2025) ────────────────────────────────

def _log_similarity(a_w: float, b_w: float, c_w: float) -> float:
    """
    Weighted log similarity: Log(1 + max(0, 3 + 3a – (b+c)))
    a_w = weighted sum of jointly-present fields (both 'yes')
    b_w = weighted sum where only case A has the behaviour
    c_w = weighted sum where only case B has the behaviour
    Joint absence (both 'no') contributes nothing — treated as uninformative
    by default but does not penalize.
    """
    return math.log(1 + max(0.0, 3 + 3 * a_w - (b_w + c_w)))


def _score_binary_fields(
    report_a: Any,
    report_b: Any,
    fields: list[tuple[str, float, str]],
) -> tuple[float, list[tuple[str, str]], list[tuple[str, str, str]], list[dict]]:
    """
    Apply the Tonkin 2025 log formula to a list of binary (yes/no) fields.

    fields: list of (field_name, or_weight, display_label)

    Returns:
      normalized_score  : float 0–1
      joint_present     : [(field_name, label), ...] — both cases 'yes'
      discordant        : [(field_name, label, side), ...] — present in one only
      field_detail      : [{field, label, value_a, value_b, status, weight}, ...]
    """
    a_w = b_w = c_w = 0.0
    total_weight = sum(w for _, w, _ in fields)
    joint_present: list[tuple[str, str]] = []
    discordant: list[tuple[str, str, str]] = []
    field_detail: list[dict] = []

    for field, weight, label in fields:
        va_raw = _get(report_a, field)
        vb_raw = _get(report_b, field)
        va = va_raw.lower()
        vb = vb_raw.lower()

        def _is_yes(v: str) -> bool:   return v == 'yes'
        def _is_prob(v: str) -> bool:  return v in ('probable', 'inferred')
        def _is_no(v: str) -> bool:    return v == 'no'
        def _is_empty(v: str) -> bool: return v in ('', 'unclear', 'unknown', 'n/a')

        status: str
        if _is_yes(va) and _is_yes(vb):
            # Full joint presence
            a_w += weight
            joint_present.append((field, label))
            status = 'joint_present'
        elif (_is_prob(va) and _is_yes(vb)) or (_is_yes(va) and _is_prob(vb)):
            # Probable/inferred vs confirmed yes → 0.7× partial joint presence
            a_w += weight * 0.7
            joint_present.append((field, label))
            status = 'probable_joint'
        elif _is_prob(va) and _is_prob(vb):
            # Both probable/inferred → 0.5× partial joint presence
            a_w += weight * 0.5
            joint_present.append((field, label))
            status = 'probable_joint'
        elif _is_yes(va) and _is_no(vb):
            b_w += weight
            discordant.append((field, label, 'A only'))
            status = 'discordant_a'
        elif _is_no(va) and _is_yes(vb):
            c_w += weight
            discordant.append((field, label, 'B only'))
            status = 'discordant_b'
        elif _is_prob(va) and _is_no(vb):
            # Probable vs no → 0.5× discordance
            b_w += weight * 0.5
            discordant.append((field, label, 'A only'))
            status = 'discordant_a'
        elif _is_no(va) and _is_prob(vb):
            c_w += weight * 0.5
            discordant.append((field, label, 'B only'))
            status = 'discordant_b'
        elif _is_no(va) and _is_no(vb):
            # Both explicitly coded as no — informative absence
            status = 'both_absent'
        elif _is_empty(va) and _is_empty(vb):
            status = 'both_empty'
        else:
            # One is coded, other is empty/unclear
            status = 'one_empty'
        # 'unclear'/'unknown'/empty → no contribution (cannot confirm or deny)

        field_detail.append({
            'field': field,
            'label': label,
            'value_a': va_raw or '',
            'value_b': vb_raw or '',
            'status': status,
            'weight': weight,
        })

    # If no fields contributed any weight (all uncoded/absent), return 0.
    # The log formula has a non-zero baseline when a_w=b_w=c_w=0 (log(4)),
    # which would inflate scores when fields are simply not coded.
    if a_w == 0.0 and b_w == 0.0 and c_w == 0.0:
        return 0.0, joint_present, discordant, field_detail

    raw = _log_similarity(a_w, b_w, c_w)
    max_raw = _log_similarity(total_weight, 0.0, 0.0) if total_weight > 0 else 1.0
    normalized = min(raw / max_raw, 1.0) if max_raw > 0 else 0.0

    return normalized, joint_present, discordant, field_detail


def _compute_domain_scores(report_a: Any, report_b: Any) -> tuple[dict, list[str], list[str]]:
    """
    Compute 5-domain behavioral breakdown for explainability (Tonkin et al. 2017).
    Returns:
      domain_scores      : {domain_key: {label, score, joint_present, discordant}}
      top_matching_fields: top 5 matching fields by OR weight
      top_discordant_fields: top 5 discordant fields by OR weight
    """
    by_domain: dict[str, list[tuple[str, float, str]]] = {d: [] for d in DOMAIN_CONFIG}
    for field, (weight, label, domain) in BINARY_FIELDS.items():
        by_domain[domain].append((field, weight, label))

    domain_scores: dict[str, dict] = {}
    all_joint: list[tuple[str, float]] = []
    all_discordant: list[tuple[str, float]] = []

    for domain_key, fields in by_domain.items():
        if not fields:
            continue
        norm_score, joint_present, discordant, field_detail = _score_binary_fields(report_a, report_b, fields)

        # ── Score type classification ──────────────────────────────────────────
        # coded_count: fields with any explicit yes/no/probable in either case
        # has_real_coded_values: True if ANY field was explicitly coded
        # score_type drives frontend colour and explanation:
        #   positive_match  — ≥1 field jointly present (both yes/probable)
        #   discordant      — one case yes, other no; no joint match
        #   joint_absence   — all coded fields are both-no; formula baseline applies
        #   baseline        — no fields coded in either case; score is pure formula baseline
        coded_statuses = {'joint_present', 'probable_joint', 'discordant_a', 'discordant_b', 'both_absent'}
        coded_count = sum(1 for d in field_detail if d['status'] in coded_statuses)
        has_real_coded_values = coded_count > 0

        n_jp = len(joint_present)
        n_dc = len(discordant)
        n_absent = sum(1 for d in field_detail if d['status'] == 'both_absent')

        if not has_real_coded_values:
            score_type = 'baseline'
        elif n_jp > 0:
            score_type = 'positive_match'
        elif n_dc > 0:
            score_type = 'discordant'
        else:
            # All coded fields are 'no' in both cases
            score_type = 'joint_absence'

        # Human-readable explanation of why the score is this number
        pct = round(norm_score * 100)
        field_names = [d['label'] for d in field_detail]
        jp_labels = [l for _, l in joint_present]
        dc_labels = [l for _, l, _ in discordant]

        if score_type == 'baseline':
            score_explanation = (
                f"No analyst-coded values yet. "
                f"0 of {len(fields)} field{'s' if len(fields)!=1 else ''} coded "
                f"({', '.join(field_names)}). "
                f"Score suppressed until fields are coded."
            )
        elif score_type == 'positive_match':
            parts = [f"Both cases show: {', '.join(jp_labels)}."]
            if dc_labels:
                parts.append(f"Differs on: {', '.join(dc_labels)}.")
            score_explanation = " ".join(parts)
        elif score_type == 'discordant':
            score_explanation = (
                f"Cases differ on: {', '.join(dc_labels)}. "
                f"No behaviors coded in both cases."
            )
        else:  # joint_absence
            absent_labels = [d['label'] for d in field_detail if d['status'] == 'both_absent']
            names = absent_labels if absent_labels else field_names
            score_explanation = (
                f"Neither case shows this behavior. "
                f"Both coded 'no' for: {', '.join(names)}. "
                f"Absence is not a similarity signal — score suppressed."
            )

        domain_scores[domain_key] = {
            'label': DOMAIN_CONFIG[domain_key]['label'],
            'score': round(norm_score, 3),
            'joint_present': [f for f, _ in joint_present],
            'discordant': [f for f, _, _ in discordant],
            'field_breakdown': field_detail,
            'has_real_coded_values': has_real_coded_values,
            'coded_count': coded_count,
            'total_count': len(field_detail),
            'score_type': score_type,
            'score_explanation': score_explanation,
        }
        for f, _ in joint_present:
            all_joint.append((f, BINARY_FIELDS[f][0]))
        for f, _, _ in discordant:
            all_discordant.append((f, BINARY_FIELDS[f][0]))

    top_matching = [f for f, _ in sorted(all_joint, key=lambda x: -x[1])[:5]]
    top_discordant = [f for f, _ in sorted(all_discordant, key=lambda x: -x[1])[:5]]
    return domain_scores, top_matching, top_discordant


# ── Dimensions ─────────────────────────────────────────────────────────────

def _suspect(a: Any, b: Any) -> dict:
    matches, mf, score = [], [], 0.0

    if _get(a, 'suspect_gender') and _get(a, 'suspect_gender') == _get(b, 'suspect_gender'):
        matches.append(f'Gender: {_get(a, "suspect_gender")}')
        mf.append('suspect_gender')
        score += 0.25
    if _get(a, 'suspect_race_ethnicity') and _get(a, 'suspect_race_ethnicity').lower() == _get(b, 'suspect_race_ethnicity').lower():
        matches.append(f'Race/ethnicity: {_get(a, "suspect_race_ethnicity")}')
        mf.append('suspect_race_ethnicity')
        score += 0.25
    if _get(a, 'suspect_age_estimate') and _get(a, 'suspect_age_estimate') == _get(b, 'suspect_age_estimate'):
        matches.append(f'Age estimate: {_get(a, "suspect_age_estimate")}')
        mf.append('suspect_age_estimate')
        score += 0.2

    if _get(a, 'suspect_description_text') and _get(b, 'suspect_description_text'):
        j, words = word_jaccard(_get(a, 'suspect_description_text'), _get(b, 'suspect_description_text'))
        if j > 0.12:
            score += j * 0.3
            mf.append('suspect_description_text')
            matches.append(f'Description overlap ({round(j*100)}%): {", ".join(words[:6])}')

    return {
        'label': 'Suspect descriptors',
        'score': min(score, 1.0),
        'weight': 20,
        'matches': matches,
        'matched_fields': mf,
        'joint_present': [],
        'discordant': [],
        'reason': f'{len(matches)} matching attribute{"s" if len(matches) != 1 else ""}' if matches else 'No overlapping descriptor fields',
    }


def _vehicle(a: Any, b: Any) -> dict:
    matches, mf, score = [], [], 0.0

    if _get(a, 'vehicle_make') and _get(a, 'vehicle_make').lower() == _get(b, 'vehicle_make').lower():
        matches.append(f'Make: {_get(a, "vehicle_make")}')
        mf.append('vehicle_make')
        score += 0.30
    if _get(a, 'vehicle_model') and _get(a, 'vehicle_model').lower() == _get(b, 'vehicle_model').lower():
        matches.append(f'Model: {_get(a, "vehicle_model")}')
        mf.append('vehicle_model')
        score += 0.20
    if _get(a, 'vehicle_colour') and _get(a, 'vehicle_colour').lower() == _get(b, 'vehicle_colour').lower():
        matches.append(f'Colour: {_get(a, "vehicle_colour")}')
        mf.append('vehicle_colour')
        score += 0.20
    if _get(a, 'plate_partial') and _get(b, 'plate_partial'):
        ps, pr = plate_similarity(_get(a, 'plate_partial'), _get(b, 'plate_partial'))
        if ps > 0:
            score += ps * 0.40
            mf.append('plate_partial')
            matches.append(pr)

    reason = ', '.join(matches) if matches else 'No vehicle match'
    return {
        'label': 'Vehicle details',
        'score': min(score, 1.0),
        'weight': 20,
        'matches': matches,
        'matched_fields': mf,
        'joint_present': [],
        'discordant': [],
        'reason': reason,
    }


def _encounter(a: Any, b: Any) -> dict:
    """
    Encounter pattern similarity using Tonkin 2025 log formula for binary fields.
    Categorical fields (approach type, exit type) scored with exact-match bonus.
    """
    binary_fields = [
        ('coercion_present',       2.0, 'Coercion'),
        ('pressure_after_refusal', 1.5, 'Pressure after refusal'),
        ('negotiation_present',    0.5, 'Negotiation present'),
        ('service_discussed',      0.5, 'Service discussed'),
        ('payment_discussed',      0.5, 'Payment discussed'),
    ]
    score, joint_present, discordant, _ = _score_binary_fields(a, b, binary_fields)
    matches = [label for _, label in joint_present]
    mf = [field for field, _ in joint_present]

    # Categorical fields — exact match bonus
    for field, label in [('initial_approach_type', 'Approach type'), ('exit_type', 'Exit type')]:
        va, vb = _get(a, field), _get(b, field)
        if va and va == vb:
            matches.append(f'{label}: {va}')
            mf.append(field)
            score += 0.10  # up to 0.20 bonus across both fields

    return {
        'label': 'Encounter pattern',
        'score': min(score, 1.0),
        'weight': 15,
        'matches': matches,
        'matched_fields': mf,
        'joint_present': [f for f, _ in joint_present],
        'discordant': [f for f, _, _ in discordant],
        'reason': f'Shared: {", ".join(matches)}' if matches else 'Different encounter patterns',
    }


def _violence(a: Any, b: Any) -> dict:
    """
    Violence type similarity using Tonkin 2025 log formula.
    High-weight fields (physical_force, sexual_assault, stealthing) are Q1.
    Penalizes discordant violence profiles — offenders rarely switch violence types.
    """
    binary_fields = [
        ('physical_force', 2.0, 'Physical force'),
        ('sexual_assault', 2.0, 'Sexual assault'),
        ('stealthing',     2.0, 'Stealthing'),
        ('threats_present',1.5, 'Threats'),
        ('robbery_theft',  1.0, 'Robbery/theft'),
        ('verbal_abuse',   1.0, 'Verbal abuse'),
    ]
    score, joint_present, discordant, _ = _score_binary_fields(a, b, binary_fields)
    matches = [label for _, label in joint_present]
    mf = [field for field, _ in joint_present]

    return {
        'label': 'Violence type',
        'score': min(score, 1.0),
        'weight': 15,
        'matches': matches,
        'matched_fields': mf,
        'joint_present': [f for f, _ in joint_present],
        'discordant': [f for f, _, _ in discordant],
        'reason': f'Both cases: {", ".join(matches)}' if matches else 'No shared violence types',
    }


def _mobility(a: Any, b: Any) -> dict:
    """
    Mobility/movement pattern similarity using Tonkin 2025 log formula.
    Mode of movement (categorical) scored with exact-match bonus.
    """
    binary_fields = [
        ('movement_present',              1.0, 'Movement present'),
        ('entered_vehicle',               1.0, 'Vehicle entry'),
        ('public_to_private_shift',       1.0, 'Public→private shift'),
        ('public_to_secluded_shift',      1.0, 'Public→secluded shift'),
        ('cross_municipality',            1.0, 'Cross municipality'),
        ('cross_neighbourhood',           1.0, 'Cross neighbourhood'),
        ('offender_control_over_movement',1.5, 'Movement control'),
    ]
    score, joint_present, discordant, _ = _score_binary_fields(a, b, binary_fields)
    matches = [label for _, label in joint_present]
    mf = [field for field, _ in joint_present]

    # Categorical
    va, vb = _get(a, 'mode_of_movement'), _get(b, 'mode_of_movement')
    if va and va.lower() == vb.lower():
        matches.append(f'Mode: {va}')
        mf.append('mode_of_movement')
        score += 0.10

    return {
        'label': 'Mobility pattern',
        'score': min(score, 1.0),
        'weight': 15,
        'matches': matches,
        'matched_fields': mf,
        'joint_present': [f for f, _ in joint_present],
        'discordant': [f for f, _, _ in discordant],
        'reason': f'Shared: {", ".join(matches)}' if matches else 'Different mobility patterns',
    }


def _location_types(a: Any, b: Any) -> dict:
    """
    Location/environment similarity.
    'deserted' is binary and uses log formula; environment type fields are categorical.
    """
    binary_fields = [
        ('deserted', 1.0, 'Deserted location'),
    ]
    score, joint_present, discordant, _ = _score_binary_fields(a, b, binary_fields)
    matches = [label for _, label in joint_present]
    mf = [field for field, _ in joint_present]

    # Categorical fields
    for field, label in [
        ('start_location_type',       'Start type'),
        ('destination_location_type', 'Destination type'),
        ('indoor_outdoor',            'Indoor/outdoor'),
        ('public_private',            'Public/private'),
    ]:
        va, vb = _get(a, field), _get(b, field)
        if va and va == vb:
            matches.append(f'{label}: {va}')
            mf.append(field)
            score += 0.20  # 4 fields × 0.20 = 0.80 max from categorical

    return {
        'label': 'Location types',
        'score': min(score, 1.0),
        'weight': 10,
        'matches': matches,
        'matched_fields': mf,
        'joint_present': [f for f, _ in joint_present],
        'discordant': [f for f, _, _ in discordant],
        'reason': f'Shared: {", ".join(matches)}' if matches else 'Different location types',
    }


def _spatial(a: Any, b: Any) -> dict:
    matches, mf, score = [], [], 0.0
    reason = 'No geocoded coordinates available'

    lat_a = a.lat_incident or a.lat_initial
    lon_a = a.lon_incident or a.lon_initial
    lat_b = b.lat_incident or b.lat_initial
    lon_b = b.lon_incident or b.lon_initial

    if lat_a and lon_a and lat_b and lon_b:
        dist = haversine_km(lat_a, lon_a, lat_b, lon_b)
        mf += ['lat_incident', 'lon_incident']
        if dist < 0.5:
            score, reason = 1.0, f'{dist:.2f} km apart (same area)'
            matches.append(f'{dist:.2f} km between incident locations')
        elif dist < 2.0:
            score, reason = 0.8, f'{dist:.2f} km apart (nearby)'
            matches.append(f'{dist:.2f} km between incident locations')
        elif dist < 5.0:
            score, reason = 0.5, f'{dist:.1f} km apart (same district)'
            matches.append(f'{dist:.1f} km between incident locations')
        elif dist < 20.0:
            score, reason = 0.2, f'{dist:.1f} km apart'
        else:
            reason = f'{dist:.1f} km apart (distant)'
    elif _get(a, 'neighbourhood') and _get(a, 'neighbourhood').lower() == _get(b, 'neighbourhood').lower():
        score, reason = 0.6, f'Same neighbourhood: {_get(a, "neighbourhood")}'
        matches.append(f'Neighbourhood: {_get(a, "neighbourhood")}')
        mf.append('neighbourhood')
    elif _get(a, 'city') and _get(a, 'city').lower() == _get(b, 'city').lower():
        score, reason = 0.2, f'Same city: {_get(a, "city")}'
        matches.append(f'City: {_get(a, "city")}')
        mf.append('city')

    return {
        'label': 'Geographic proximity',
        'score': score,
        'weight': 10,
        'matches': matches,
        'matched_fields': mf,
        'joint_present': [],
        'discordant': [],
        'reason': reason,
    }


def _temporal(a: Any, b: Any) -> dict:
    matches, mf, score = [], [], 0.0
    reason = 'No incident dates available'

    da, db_ = _get(a, 'incident_date'), _get(b, 'incident_date')
    if da and db_:
        try:
            d_a = datetime.fromisoformat(da)
            d_b = datetime.fromisoformat(db_)
            days = abs((d_a - d_b).days)
            mf.append('incident_date')
            if days == 0:
                score, reason = 1.0, 'Same date'
                matches.append('Same incident date')
            elif days <= 7:
                score, reason = 0.8, f'{days} day{"s" if days != 1 else ""} apart'
                matches.append(f'{days} days between incidents')
            elif days <= 30:
                score, reason = 0.5, f'{days} days apart'
                matches.append(f'{days} days between incidents')
            elif days <= 90:
                score, reason = 0.25, f'{days} days apart'
            else:
                reason = f'{days} days apart'
        except ValueError:
            reason = 'Could not parse date'

    return {
        'label': 'Temporal proximity',
        'score': score,
        'weight': 5,
        'matches': matches,
        'matched_fields': mf,
        'joint_present': [],
        'discordant': [],
        'reason': reason,
    }


# ── Main entry point ───────────────────────────────────────────────────────

def compute_similarity(report_a: Any, report_b: Any) -> dict:
    dims = {
        'suspect':       _suspect(report_a, report_b),
        'vehicle':       _vehicle(report_a, report_b),
        'encounter':     _encounter(report_a, report_b),
        'violence':      _violence(report_a, report_b),
        'mobility':      _mobility(report_a, report_b),
        'location_type': _location_types(report_a, report_b),
        'spatial':       _spatial(report_a, report_b),
        'temporal':      _temporal(report_a, report_b),
    }

    total_weight = sum(d['weight'] for d in dims.values())
    weighted = sum(d['score'] * d['weight'] for d in dims.values()) / total_weight
    overall = round(weighted * 100, 1)

    # Domain-level behavioral breakdown for explainability (Hobson et al. 2021)
    domain_scores, top_matching_fields, top_discordant_fields = _compute_domain_scores(
        report_a, report_b
    )

    # Collect repeat flags
    repeat_flags = []
    for dim_key, dim in dims.items():
        for m in dim['matches']:
            flag_type = dim_key
            if 'plate' in m.lower():
                flag_type = 'plate'
            elif 'vehicle' in m.lower() or 'make' in m.lower() or 'colour' in m.lower():
                flag_type = 'vehicle'
            elif dim_key == 'suspect':
                flag_type = 'suspect'
            elif dim_key == 'spatial':
                flag_type = 'location'
            repeat_flags.append({'type': flag_type, 'detail': m, 'dimension': dim_key})

    # All matched field keys across all dimensions (for frontend highlighting)
    all_matched_fields = list({f for d in dims.values() for f in d['matched_fields']})

    return {
        'score': overall,
        'dimensions': dims,
        'domain_scores': domain_scores,
        'top_matching_fields': top_matching_fields,
        'top_discordant_fields': top_discordant_fields,
        'repeat_flags': repeat_flags,
        'matched_fields': all_matched_fields,
    }
