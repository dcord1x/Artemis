"""
spaCy-based violence indicator analysis for Red Light Alert narratives.

Returns structured rank hints (1=High, 2=Medium, 3=No signal) stored in
ai_suggestions["nlp"]. Does NOT set coercion_present or any other coded field —
researchers make the final call.

Rank logic:
  1 — Strong grammatical evidence: subject-verb-object pattern with a
      person-directed target, or primary phrase match, or refusal→pressure arc.
  2 — Keyword present but negated, OR ambiguous object (no clear person target).
  3 — No relevant keywords found (silent — no badge shown in UI).
"""

import re
import spacy

# Load once at module level — avoids reloading on every call
try:
    _nlp = spacy.load("en_core_web_sm")
except OSError:
    _nlp = None  # Graceful fallback if model isn't installed


# ── Vocabulary sets ───────────────────────────────────────────────────────────

PERSON_PRONOUNS = {"her", "him", "them", "she", "he", "they"}

COERCION_VERBS = {
    "grab", "hold", "restrain", "pin", "block", "trap", "lock",
    "force", "drag", "pull", "prevent", "stop", "keep", "push",
    "corner", "control", "confine", "restrict",
}

PHYSICAL_VERBS = {
    "punch", "hit", "kick", "beat", "slap", "choke", "strangle",
    "stab", "headbutt", "elbow", "shove", "assault", "strike",
    "throw", "smash", "attack", "scratch", "bite",
}

MOVEMENT_VERBS = {
    "drive", "take", "bring", "transport", "move", "carry",
    "bring", "escort", "lead", "lure",
}

# Phrases that always indicate sexual assault (Rank 1 regardless of SVO)
SEXUAL_PRIMARY = [
    "rape", "raped", "raping", "gang rape", "gang raped",
    "sexual assault", "sexually assault", "sexual violence",
    "forced sex", "forced her to have sex", "forced him to have sex",
]

# Secondary — Rank 1 only if NOT negated nearby
SEXUAL_SECONDARY = [
    "forced to perform", "forced oral", "forced her to perform",
    "forced him to perform", "stealthing", "non-consensual",
    "without consent", "wouldn't stop", "kept going",
]

# Refusal / pressure arc keywords
REFUSAL_KWS = [
    "said no", "said she didn't", "said he didn't",
    "refused", "declined", "didn't want to", "tried to leave",
    "wanted to leave", "tried to get out", "no thank you",
    "told him no", "told her no", "didn't agree",
]

PRESSURE_KWS = [
    "forced", "pushed", "threatened", "blocked", "grabbed",
    "wouldn't let", "wouldn't leave", "locked", "held",
    "insisted", "kept asking", "wouldn't stop", "pulled her",
    "pulled him", "wouldn't take no",
]

# ── Transactional stage vocabulary ───────────────────────────────────────────
# Each list represents keyword signals for that stage of the encounter arc.

_STAGE_NEGOTIATION = [
    "agreed to", "how much", "offered", "asked how much", "quoted", "discussed",
    "negotiated", "said the price", "what's your rate", "what do you charge",
    "how much for", "asked the price", "agreed on", "settled on",
]

_STAGE_AGREEMENT = [
    "got in", "got into", "got in the car", "went with him", "went with her",
    "agreed to go", "accepted", "said yes", "said ok", "said okay",
    "started to", "began to", "they started", "the date began",
]

_STAGE_REFUSAL = [
    "said no", "said she didn't", "said he didn't",
    "refused", "declined", "didn't want to", "tried to leave",
    "wanted to leave", "tried to get out", "no thank you",
    "told him no", "told her no", "didn't agree",
    "asked him to stop", "asked her to stop", "said stop",
    "no condom", "wouldn't use a condom", "refused condom",
    "asked him to use", "insisted on a condom",
    "didn't want to continue", "wanted out", "changed her mind",
    "changed his mind",
]

_STAGE_PRESSURE = [
    "insisted", "kept asking", "wouldn't take no", "persisted",
    "kept pushing", "argued", "guilt-tripped", "begged", "pleaded",
    "wouldn't accept", "kept trying", "kept insisting", "wouldn't stop asking",
    "pressured", "manipulated", "convinced her", "convinced him",
    "said he would pay more", "offered more money", "bribed",
]

_STAGE_THREATS = [
    "threatened", "said he would", "said she would", "warned her", "warned him",
    "showed a weapon", "had a knife", "had a gun", "had a blade",
    "pulled out a knife", "pulled out a gun", "pulled out a blade",
    "pulled out a weapon", "pulled a knife", "pulled a gun",
    "pointed a gun", "pointed a knife", "brandished",
    "knife", "blade", "machete", "gun", "handgun", "pistol", "revolver", "rifle",
    "bat", "crowbar", "hammer", "axe", "weapon", "firearm",
    "if you don't", "or else",
    "said he'd kill", "said he'd hurt", "i'll kill", "i will kill",
    "you'll regret", "i know where you live", "find you",
    "do what i say", "do as i say", "or i'll hurt",
]

_STAGE_PHYSICAL = [
    "punched", "hit her", "hit him", "kicked", "beat", "slapped",
    "choked", "strangled", "stabbed", "headbutted", "grabbed her",
    "grabbed him", "dragged her", "dragged him", "threw her", "threw him",
    "shoved", "pushed her", "pushed him", "held her down", "held him down",
    "pinned", "restrained", "physically assaulted",
]

_STAGE_SEXUAL_VIOLENCE = [
    "raped", "rape", "sexually assaulted", "sexual assault",
    "forced sex", "forced her to", "forced him to", "forced oral",
    "stealthing", "removed the condom", "took off the condom",
    "non-consensual", "without consent",
]

_STAGE_ROBBERY = [
    "stole", "stolen", "took her money", "took his money", "took the money",
    "took her phone", "took his phone", "stole her bag", "stole his bag",
    "robbed", "robbery", "theft", "took her wallet", "took his wallet",
    "took her belongings", "took her purse",
]

_STAGE_ESCAPE = [
    "ran away", "ran off", "got away", "escaped", "managed to leave",
    "got out of the car", "got out of the vehicle", "jumped out",
    "was able to leave", "got help", "called for help", "screamed for help",
    "flagged down", "ran to safety",
]

# Named escalation patterns — (pattern_id, label, required_stages, optional_boost_stages)
_NAMED_PATTERNS = [
    ("condom_refusal",      "Condom refusal escalation",        ["refusal"],         ["pressure", "sexual_violence"]),
    ("payment_dispute",     "Payment/money dispute",            ["negotiation"],     ["robbery", "threats"]),
    ("bait_and_switch",     "Bait-and-switch (terms changed)",  ["negotiation", "agreement"], ["refusal", "pressure"]),
    ("rapid_escalation",    "Rapid escalation (no buffer)",     ["agreement"],       ["physical", "sexual_violence"]),
    ("weapon_present",      "Weapon present/displayed",         ["threats"],         []),
    ("movement_assault",    "Moved then assaulted",             [],                  []),  # handled separately
    ("multi_suspect",       "Multiple suspects",                [],                  []),  # handled separately
    ("online_lure",         "Online solicitation lure",         [],                  []),  # handled separately
]

# Stage name → numeric severity (for scoring)
_STAGE_SEVERITY = {
    "negotiation": 1, "agreement": 1,
    "refusal": 2,
    "pressure": 3,
    "threats": 4, "physical": 4,
    "sexual_violence": 5, "robbery": 5,
    "escape": 0,  # escape is not severity — it's resolution
}

# Stage name → human label for arc display
_STAGE_LABELS = {
    "negotiation":    "Negotiation",
    "agreement":      "Agreement",
    "refusal":        "Refusal",
    "pressure":       "Pressure",
    "threats":        "Threats",
    "physical":       "Physical force",
    "sexual_violence":"Sexual violence",
    "robbery":        "Robbery",
    "escape":         "Escape",
}

# ── Weapon vocabulary ─────────────────────────────────────────────────────────

WEAPON_TERMS = [
    # Bladed
    "knife", "blade", "box cutter", "boxcutter", "machete", "razor",
    "switchblade", "pocket knife",
    # Firearms
    "gun", "handgun", "pistol", "revolver", "rifle", "firearm", "shotgun",
    # Blunt
    "bat", "baseball bat", "club", "crowbar", "pipe", "hammer",
    # Other
    "axe", "hatchet", "screwdriver", "needle", "syringe",
]

WEAPON_DISPLAY_PHRASES = [
    "pulled out a knife", "pulled out a gun", "pulled out a blade",
    "pulled out a weapon", "pulled a knife", "pulled a gun",
    "showed a knife", "showed a gun", "showed a weapon", "showed his weapon",
    "showed her weapon", "pointed a gun", "pointed a knife",
    "held a knife to", "held a gun to", "held to her throat",
    "held to his throat", "held knife", "held gun",
    "brandished", "threatened with a", "produced a knife",
    "produced a gun", "produced a weapon",
    "had a knife", "had a gun", "had a weapon",
    "flashed a", "drew a knife", "drew a gun",
    "at knifepoint", "at gunpoint", "knifepoint", "gunpoint",
]

# Movement context phrases (Rank 1 without needing SVO)
MOVEMENT_PHRASES = [
    "locked her in", "locked him in", "locked in the car",
    "locked in his car", "locked in the vehicle",
    "couldn't get out", "couldn't leave", "wouldn't let her out",
    "wouldn't let him out", "drove her to", "drove him to",
    "took her to", "took him to", "brought her to", "brought him to",
    "picked her up", "picked him up",
]


# ── Core helpers ──────────────────────────────────────────────────────────────

def _is_negated(token) -> bool:
    """Return True if token has a 'neg' dependency child (e.g. 'not', 'never')."""
    return any(child.dep_ == "neg" for child in token.children)


def _is_person_directed(verb_token) -> bool:
    """
    Return True if verb_token's direct object is a person pronoun,
    or the dobj's possessive modifier is a person pronoun.
    Covers: "grabbed her" (dobj=her) and "grabbed her arm" (dobj=arm, poss=her).
    """
    for child in verb_token.children:
        if child.dep_ == "dobj":
            if child.text.lower() in PERSON_PRONOUNS:
                return True
            # Possessive on the direct object: "grabbed her arm"
            for gc in child.children:
                if gc.dep_ == "poss" and gc.text.lower() in PERSON_PRONOUNS:
                    return True
    return False


def _detect_arc(text: str, refusal_kws: list, pressure_kws: list, window: int = 120):
    """
    Narrative arc detector: if a refusal keyword appears, scan the next
    `window` characters for a pressure keyword. Returns (matched, evidence_str).
    """
    low = text.lower()
    for rk in refusal_kws:
        idx = low.find(rk)
        if idx == -1:
            continue
        lookahead = low[idx: idx + window]
        for pk in pressure_kws:
            if pk in lookahead:
                return True, f"arc: \"{rk}\" → \"{pk}\""
    return False, None


def _phrase_present(text: str, phrases: list) -> tuple:
    """Return (True, matched_phrase) if any phrase is found in text."""
    low = text.lower()
    for ph in phrases:
        if ph in low:
            return True, ph
    return False, None


def _negation_near_phrase(text: str, phrase: str, window: int = 40) -> bool:
    """
    Return True if a negation word appears within `window` chars before the phrase.
    Simple proximity check (no full parse needed for phrase-level negation).
    """
    negations = ["not ", "never ", "didn't ", "don't ", "doesn't ",
                 "without ", "no ", "wasn't ", "weren't "]
    low = text.lower()
    idx = low.find(phrase)
    if idx == -1:
        return False
    prefix = low[max(0, idx - window): idx]
    return any(neg in prefix for neg in negations)


# ── Per-category detectors ────────────────────────────────────────────────────

def _detect_coercion(text: str, doc) -> tuple[int, list[str]]:
    """Returns (rank, evidence_list)."""
    evidence = []

    # SVO check: restraint/control verb + person-directed
    for token in doc:
        if token.lemma_.lower() in COERCION_VERBS and token.pos_ == "VERB":
            if _is_negated(token):
                evidence.append(f"keyword (negated): {token.text}")
                continue
            if _is_person_directed(token):
                evidence.append(f"restraint SVO: {token.text} → person")
                return 1, evidence

    # Narrative arc: refusal → pressure
    arc_found, arc_str = _detect_arc(text, REFUSAL_KWS, PRESSURE_KWS)
    if arc_found:
        evidence.append(arc_str)
        return 1, evidence

    # Phrase patterns (wouldn't let her leave etc.)
    coercion_phrases = [
        "wouldn't let her", "wouldn't let him", "wouldn't let them",
        "blocked her", "blocked him", "locked her", "locked him",
        "held her down", "held him down", "pinned her", "pinned him",
        "restrained her", "restrained him",
        # Inability to leave
        "couldn't leave", "couldn't get out", "couldn't escape",
        "unable to leave", "no way out", "trapped her", "trapped him",
        "refused to let her", "refused to let him", "refused to let them",
        "wouldn't let her leave", "wouldn't let him leave",
        "wouldn't open the door", "locked the door",
        "child lock", "child locks",
        # Forced compliance
        "forced her to", "forced him to", "forced them to",
        "made her do", "made him do", "had no choice",
        "said she had no choice", "said he had no choice",
        "had to comply", "had to do it",
        # Persistent pressure overriding refusal
        "kept going despite", "continued despite", "ignored her refusal",
        "ignored his refusal", "wouldn't take no",
        # Payment/financial coercion
        "wouldn't pay unless", "said he'd only pay if",
        "withheld payment", "refused to pay until",
        # Condom-related coercion
        "removed the condom without", "took off the condom without",
        "stealthing", "condom removed",
    ]
    found, ph = _phrase_present(text, coercion_phrases)
    if found:
        if not _negation_near_phrase(text, ph):
            evidence.append(f"coercion phrase: \"{ph}\"")
            return 1, evidence
        else:
            evidence.append(f"phrase (negated): \"{ph}\"")

    # Rank 2: keyword present but no strong pattern
    coercion_kws = ["threaten", "threat", "coerce", "forced", "restrain",
                    "scared", "afraid", "intimidat", "wouldn't take no",
                    "no choice", "compelled", "overpowered", "manipulat",
                    "pressured", "trapped", "confined", "couldn't say no",
                    "felt she had to", "felt he had to"]
    low = text.lower()
    for kw in coercion_kws:
        if kw in low:
            if not _negation_near_phrase(text, kw):
                if not evidence:  # don't downgrade if we already have negated evidence
                    evidence.append(f"keyword: {kw}")
                return 2, evidence

    if evidence:  # negated evidence only
        return 2, evidence

    return 3, []


def _detect_physical(text: str, doc) -> tuple[int, list[str]]:
    """Returns (rank, evidence_list)."""
    evidence = []

    for token in doc:
        if token.lemma_.lower() in PHYSICAL_VERBS and token.pos_ == "VERB":
            if _is_negated(token):
                evidence.append(f"keyword (negated): {token.text}")
                continue
            if _is_person_directed(token):
                evidence.append(f"physical SVO: {token.text} → person")
                return 1, evidence

    # Physical phrases not caught by SVO
    physical_phrases = [
        "punched her", "punched him", "kicked her", "kicked him",
        "hit her", "hit him", "beat her", "beat him",
        "slapped her", "slapped him", "choked her", "choked him",
        "strangled her", "strangled him", "stabbed her", "stabbed him",
        "dragged her", "dragged him", "threw her", "threw him",
    ]
    found, ph = _phrase_present(text, physical_phrases)
    if found:
        if not _negation_near_phrase(text, ph):
            evidence.append(f"physical phrase: \"{ph}\"")
            return 1, evidence
        else:
            evidence.append(f"phrase (negated): \"{ph}\"")

    # Rank 2: keyword present but no person target or negated
    physical_kws = ["punch", "punch", "kick", "beat", "slap", "assault",
                    "attacked", "headbutt", "choke", "stab", "hit him", "hit her",
                    "physical", "violence"]
    low = text.lower()
    for kw in physical_kws:
        if kw in low:
            if not _negation_near_phrase(text, kw):
                if not evidence:
                    evidence.append(f"keyword: {kw}")
                return 2, evidence

    if evidence:
        return 2, evidence

    return 3, []


def _detect_sexual(text: str) -> tuple[int, list[str]]:
    """Returns (rank, evidence_list). No SVO needed — primary phrases are unambiguous."""
    low = text.lower()

    # Primary: always Rank 1
    for ph in SEXUAL_PRIMARY:
        if ph in low:
            return 1, [f"primary term: \"{ph}\""]

    # Secondary: Rank 1 if not negated
    for ph in SEXUAL_SECONDARY:
        if ph in low:
            if not _negation_near_phrase(text, ph):
                return 1, [f"secondary term: \"{ph}\""]
            else:
                return 2, [f"term (negated): \"{ph}\""]

    return 3, []


def _detect_movement(text: str, doc) -> tuple[int, list[str]]:
    """Returns (rank, evidence_list)."""
    evidence = []

    # Strong movement phrases (Rank 1 without SVO)
    found, ph = _phrase_present(text, MOVEMENT_PHRASES)
    if found:
        if not _negation_near_phrase(text, ph):
            return 1, [f"movement phrase: \"{ph}\""]

    # SVO: transport verb + person-directed
    for token in doc:
        if token.lemma_.lower() in MOVEMENT_VERBS and token.pos_ == "VERB":
            if _is_negated(token):
                evidence.append(f"keyword (negated): {token.text}")
                continue
            if _is_person_directed(token):
                evidence.append(f"transport SVO: {token.text} → person")
                return 1, evidence

    # Rank 2: movement keyword without clear person direction
    movement_kws = ["drove", "driven", "transported", "picked up",
                    "taken to", "brought to", "moved to", "crossed"]
    low = text.lower()
    for kw in movement_kws:
        if kw in low:
            if not _negation_near_phrase(text, kw):
                if not evidence:
                    evidence.append(f"keyword: {kw}")
                return 2, evidence

    if evidence:
        return 2, evidence

    return 3, []


def _detect_weapon(text: str) -> tuple[int, list[str]]:
    """
    Returns (rank, evidence_list) for weapon detection.
    Rank 1: weapon clearly displayed, produced, or used in context.
    Rank 2: weapon term present without clear display/action context.
    """
    low = text.lower()
    evidence = []

    # Strongest signal: explicit display/threat phrases
    for phrase in WEAPON_DISPLAY_PHRASES:
        if phrase in low:
            if not _negation_near_phrase(text, phrase):
                evidence.append(f'weapon display phrase: "{phrase}"')
                return 1, evidence

    # Weapon term + nearby action verb (within 80 chars)
    action_verbs = [
        "pulled", "showed", "pointed", "held", "brandished", "produced",
        "drew", "flashed", "threatened", "used", "stabbed", "shot",
        "struck", "attacked with", "hit with",
    ]
    for wt in WEAPON_TERMS:
        idx = low.find(wt)
        if idx == -1:
            continue
        if _negation_near_phrase(text, wt):
            evidence.append(f'weapon (negated): "{wt}"')
            continue
        window = low[max(0, idx - 80): idx + len(wt) + 80]
        for av in action_verbs:
            if av in window:
                evidence.append(f'weapon + action: "{wt}" near "{av}"')
                return 1, evidence
        # Weapon term present without clear action context — possible
        evidence.append(f'weapon mentioned: "{wt}"')
        return 2, evidence

    if evidence:  # negated only
        return 2, evidence

    return 3, []


# ── Escalation arc detection ──────────────────────────────────────────────────

def _detect_escalation(text: str) -> dict:
    """
    Detect transactional escalation through the common commercial encounter stages.

    Returns:
    {
        "stages": ["negotiation", "refusal", "physical"],      # stages detected
        "highest_stage": "physical",                           # most severe
        "score": 4,                                            # 1–5 escalation score
        "patterns": ["condom_refusal", "rapid_escalation"],    # named patterns
        "arc": "Negotiation → Refusal → Physical force",       # human-readable arc
    }
    Score guide:
      1 = no escalation / normal transaction
      2 = refusal present, may have been resolved
      3 = pressure / manipulation after refusal
      4 = threats or physical force
      5 = sexual violence or robbery
    """
    low = text.lower()

    def _any(kws):
        return any(k in low for k in kws)

    # ── Stage detection ──────────────────────────────────────────────────────
    present = {}
    present["negotiation"]    = _any(_STAGE_NEGOTIATION)
    present["agreement"]      = _any(_STAGE_AGREEMENT)
    present["refusal"]        = _any(_STAGE_REFUSAL)
    present["pressure"]       = _any(_STAGE_PRESSURE)
    present["threats"]        = _any(_STAGE_THREATS)
    present["physical"]       = _any(_STAGE_PHYSICAL)
    present["sexual_violence"]= _any(_STAGE_SEXUAL_VIOLENCE)
    present["robbery"]        = _any(_STAGE_ROBBERY)
    present["escape"]         = _any(_STAGE_ESCAPE)

    detected_stages = [s for s in _STAGE_SEVERITY if present.get(s)]

    # If nothing at all found
    if not detected_stages:
        return {"stages": [], "highest_stage": None, "score": 1,
                "patterns": [], "arc": "No escalation detected"}

    # ── Score: highest severity among detected stages ─────────────────────────
    severity_values = [_STAGE_SEVERITY[s] for s in detected_stages if _STAGE_SEVERITY.get(s, 0) > 0]
    max_severity = max(severity_values) if severity_values else 1

    # Boost score if multiple high stages co-occur
    high_stages = [s for s in detected_stages if _STAGE_SEVERITY.get(s, 0) >= 4]
    if len(high_stages) >= 2:
        score = 5
    else:
        score = max_severity if max_severity else 1

    highest = max(detected_stages, key=lambda s: _STAGE_SEVERITY.get(s, 0))

    # ── Named pattern matching ────────────────────────────────────────────────
    patterns = []

    # Condom refusal: refusal keyword specifically about condoms
    if any(k in low for k in ["no condom", "wouldn't use a condom", "refused condom",
                               "insisted on a condom", "asked him to use a condom",
                               "condom refusal", "removed the condom", "took off the condom",
                               "stealthing"]):
        patterns.append("condom_refusal")

    # Payment dispute: price/money argument → robbery or threats
    if _any(_STAGE_NEGOTIATION) and (_any(_STAGE_ROBBERY) or _any(_STAGE_THREATS)):
        patterns.append("payment_dispute")

    # Bait-and-switch: agreed terms changed mid-encounter
    bait_kws = ["changed his mind", "said he wanted more", "demanded more",
                "wasn't what was agreed", "more than agreed", "changed the deal",
                "wanted more than", "said it was different", "renegotiated"]
    if _any(bait_kws) or (present["agreement"] and present["refusal"] and present["pressure"]):
        patterns.append("bait_and_switch")

    # Rapid escalation: agreement → physical/sexual with no refusal/pressure step
    if present["agreement"] and (_STAGE_SEVERITY.get(highest, 0) >= 4) and not present["pressure"] and not present["refusal"]:
        patterns.append("rapid_escalation")

    # Weapon present — uses WEAPON_TERMS + display phrases for broad coverage
    weapon_signals = WEAPON_TERMS + [
        "at knifepoint", "at gunpoint", "knifepoint", "gunpoint",
        "pulled out a", "showed a weapon", "brandished",
    ]
    if any(k in low for k in weapon_signals):
        patterns.append("weapon_present")

    # Multiple suspects
    if any(k in low for k in ["two men", "two males", "two suspects", "two guys",
                               "group of men", "group of males", "several men",
                               "another man", "another suspect", "second suspect",
                               "his friend", "his buddy", "2 males", "2 men"]):
        patterns.append("multi_suspect")

    # Online lure
    if any(k in low for k in ["craigslist", "online", "texted", "via text",
                               "kijiji", "backpage", "leolist", "massage parlour",
                               "responded to an ad", "booked online", "calling"]):
        patterns.append("online_lure")

    # Drugging / intoxication
    if any(k in low for k in [
        "drugged", "drug her", "drug him", "put something in", "spiked her drink",
        "spiked his drink", "gave her a drink", "gave him a drink", "drink was spiked",
        "rohypnol", "roofie", "roofied", "ketamine", "ghb", "date rape drug",
        "passed out", "blacked out", "couldn't remember", "don't remember",
        "woke up", "came to", "alcohol", "drunk", "intoxicated", "couldn't stand",
        "heavily intoxicated", "stumbling",
    ]):
        patterns.append("drugging_intoxication")

    # Confinement: victim unable to leave / escape blocked
    if any(k in low for k in [
        "couldn't leave", "couldn't get out", "unable to leave", "wouldn't let her leave",
        "wouldn't let him leave", "locked the door", "blocked the door", "blocked the exit",
        "no way out", "trapped", "confined", "held against", "kept her there",
        "kept him there", "refused to stop the car", "wouldn't stop driving",
        "locked in", "unable to escape", "prevented her from leaving",
        "prevented him from leaving",
    ]):
        patterns.append("confinement")

    # ── Arc description ───────────────────────────────────────────────────────
    # Build readable arc in severity order
    arc_order = ["negotiation", "agreement", "refusal", "pressure",
                 "threats", "physical", "sexual_violence", "robbery", "escape"]
    arc_stages = [s for s in arc_order if present.get(s)]
    arc = " → ".join(_STAGE_LABELS[s] for s in arc_stages) if arc_stages else "No escalation"

    return {
        "stages": detected_stages,
        "highest_stage": highest,
        "score": score,
        "patterns": patterns,
        "arc": arc,
    }


# ── Location extraction from synopsis ────────────────────────────────────────

# Patterns that signal where the worker was when first contacted
_CONTACT_PATTERNS = [
    re.compile(r'worker\s+(?:was\s+)?(?:working|standing|sitting|waiting)\s+(?:at|on|near|by|around)\s+([^,.]+)', re.IGNORECASE),
    re.compile(r'worker\s+was\s+(?:at|on)\s+([^,.]+)', re.IGNORECASE),
    re.compile(r'(?:approached|contacted|met)\s+(?:the\s+)?worker\s+(?:at|on|near)\s+([^,.]+)', re.IGNORECASE),
    re.compile(r'worker\s+reports?\s+(?:being\s+at|being\s+on|sitting\s+(?:at|on|by))\s+([^,.]+)', re.IGNORECASE),
]

# Patterns that signal where the incident happened (destination)
_INCIDENT_PATTERNS = [
    re.compile(r'(?:drove|driven|taken|brought|transported|went|taken)\s+(?:her|him|them)?\s*to\s+([^,.]+)', re.IGNORECASE),
    re.compile(r'incident\s+occurred\s+(?:at|in|behind|by|near|on|inside)\s+([^,.]+)', re.IGNORECASE),
    re.compile(r'(?:arrived?|ended?\s+up)\s+(?:at|in)\s+([^,.]+)', re.IGNORECASE),
    re.compile(r'(?:went|moved?|pulled?)\s+to\s+(?:a\s+)?([^,.]{5,60})', re.IGNORECASE),
    re.compile(r'(?:stopped?|parked?)\s+(?:at|near|by|in\s+front\s+of)\s+([^,.]+)', re.IGNORECASE),
]

_CLEANUP = re.compile(r'\s+', re.IGNORECASE)

# Verbs that signal the captured group is a narrative clause, not a bare location.
# When any of these appear in a ≥4-token string, we strip the clause up to the
# last location-introducing preposition to recover just the location name.
_CLAUSE_VERBS = frozenset({
    'was', 'were', 'had', 'got', 'gone', 'went', 'said', 'told',
    'picked', 'brought', 'drove', 'driven', 'taken', 'walked', 'moved',
    'waited', 'stood', 'working', 'sitting', 'reported', 'described',
    'happened', 'occurred', 'started', 'ended', 'began',
})
_CLAUSE_PREPS = ('at', 'near', 'by', 'on', 'in', 'beside', 'outside', 'behind', 'beside')


def _strip_clause_prefix(s: str) -> str:
    """
    If s looks like a narrative clause fragment (≥4 tokens, contains a clause
    verb), find the last location-introducing preposition and return only the
    phrase that follows it.

    Examples:
      "worker was picked up at Victoria and Kingsway" → "Victoria and Kingsway"
      "taken to the Kingsway area"                   → "Kingsway area"
      "Victoria and Kingsway"                        → unchanged (no verb)
    """
    tokens = s.split()
    if len(tokens) < 4:
        return s
    lower = [t.lower().rstrip('.,;') for t in tokens]
    if not any(t in _CLAUSE_VERBS for t in lower):
        return s  # Not clause-like — leave as-is
    # Walk backwards: find last preposition, return what follows
    for i in range(len(lower) - 1, 0, -1):
        if lower[i] in _CLAUSE_PREPS:
            remainder = ' '.join(tokens[i + 1:]).strip().rstrip('.,;')
            # Only use the remainder if it's non-trivial
            if len(remainder.split()) >= 1 and len(remainder) >= 4:
                return remainder
    return s


def _clean_loc(s: str) -> str:
    """Strip narrative clause prefixes, leading articles, pronouns and tidy whitespace."""
    s = _CLEANUP.sub(' ', s).strip().rstrip('.,;')
    # Strip full clause prefix before the actual location name
    s = _strip_clause_prefix(s)
    # Strip leading articles and possessive pronouns
    s = re.sub(r'^(?:the|a|an|his|her|their|its)\s+', '', s, flags=re.IGNORECASE)
    # Strip leading prepositions that sneak through regex capture
    s = re.sub(r'^(?:at|on|in|by|near|around|behind|outside|inside)\s+', '', s, flags=re.IGNORECASE)
    return s.strip()

# ── Location phrase validation ────────────────────────────────────────────────
#
# Strategy: positive validation — a candidate must EARN acceptance rather than
# merely avoid a small deny-list. Require at least one of:
#   A) A recognised location-type keyword (street, hotel, park, etc.)
#   B) A street number combined with at least one meaningful word
#   C) At least 2 meaningful content tokens (not stopwords) of length ≥ 3
#      AND total phrase length ≥ 8 chars
#
# Hard-reject single stop-words, pronouns, prepositions, and known-junk tokens.

# All words that are never a location by themselves — also used to identify
# "meaningful" tokens (any token NOT in this set with len ≥ 3 counts).
_LOC_STOPWORDS = {
    # Articles / determiners
    "the", "a", "an", "this", "that", "these", "those",
    # Pronouns
    "he", "she", "they", "it", "i", "we", "you",
    "him", "her", "them", "his", "their", "its",
    "himself", "herself", "themselves", "myself", "yourself",
    # Prepositions / conjunctions that appear as extraction artefacts
    "at", "on", "in", "by", "near", "to", "from", "of", "for",
    "around", "behind", "outside", "inside", "beside", "across",
    "along", "between", "within", "through", "toward", "towards",
    "onto", "into", "out", "up", "down", "off", "over", "under", "past",
    "and", "or", "but", "with", "without",
    # Vague spatial references that alone convey no location
    "somewhere", "anywhere", "nearby", "there", "here", "where",
    # Relative / interrogative pronouns
    "which", "who", "whom", "what", "when",
    # Common junk completions from regex over-capture
    "said", "told", "reported", "mentioned", "stated",
}

# Recognised location-type keywords — presence of any of these is sufficient
# evidence that the phrase describes a real place.
_LOC_KEYWORDS = {
    # Street / road types
    "street", "st", "avenue", "ave", "boulevard", "blvd", "road", "rd",
    "drive", "dr", "lane", "ln", "way", "place", "pl", "court", "ct",
    "crescent", "cres", "circle", "cir", "parkway", "pkwy",
    "highway", "hwy", "freeway", "expressway", "alley", "terrace",
    "trail", "pass", "row", "close", "path",
    # Intersection / block
    "intersection", "corner", "block", "blocks", "strip",
    # Transit / infrastructure
    "station", "transit", "bus", "stop", "depot", "terminal", "platform",
    # Venue / building types
    "hotel", "motel", "inn", "hostel", "airbnb",
    "mall", "plaza", "centre", "center", "complex",
    "park", "lot", "garage", "parkade", "parking",
    "bar", "club", "lounge", "pub", "tavern",
    "restaurant", "cafe", "coffee", "diner",
    "store", "shop", "market", "grocery", "pharmacy",
    "school", "hospital", "clinic", "church", "library",
    "casino", "gym", "arena", "stadium",
    # Residential / dwelling
    "apartment", "apt", "condo", "house", "home", "basement",
    "suite", "unit", "room", "townhouse", "duplex", "residence",
    # Geographic descriptors
    "downtown", "uptown", "district", "neighbourhood", "neighborhood",
    "square", "bridge", "park", "ravine", "alleyway", "laneway",
    "north", "south", "east", "west", "central",
}


def _is_valid_location(s: str) -> bool:
    """
    Positive validation: return True only when s looks like a plausible location
    phrase. Single stop-words, pronouns, prepositions, or short junk fragments
    always return False.

    Acceptance criteria (first match wins):
      A) Phrase contains a recognised location-type keyword.
      B) Phrase contains a street/building number AND ≥ 1 meaningful content word.
      C) Phrase has ≥ 2 meaningful content tokens (not in _LOC_STOPWORDS, len ≥ 3)
         AND total phrase length ≥ 8 characters.

    Hard rejections (checked before the above):
      - Empty or shorter than 4 characters.
      - No alphabetic characters.
      - All tokens are stop-words.
      - Exactly one token and it is a stop-word.
    """
    if not s or len(s) < 4:
        return False
    if not re.search(r'[a-zA-Z]', s):
        return False

    tokens = re.findall(r"[a-zA-Z']+", s.lower())
    if not tokens:
        return False

    # Hard reject: single-token stop-word (e.g. "the", "near", "him")
    if len(tokens) == 1 and tokens[0] in _LOC_STOPWORDS:
        return False

    # Hard reject: all tokens are stop-words (e.g. "he said", "her to")
    if all(t in _LOC_STOPWORDS for t in tokens):
        return False

    # A) Recognised location keyword present
    if any(t in _LOC_KEYWORDS for t in tokens):
        return True

    # B) Street/building number + at least one meaningful word
    has_number = bool(re.search(r'\b\d+\w*\b', s))
    meaningful = [t for t in tokens if t not in _LOC_STOPWORDS and len(t) >= 3]
    if has_number and len(meaningful) >= 1:
        return True

    # C) Two or more meaningful content tokens with sufficient total length
    if len(meaningful) >= 2 and len(s) >= 8:
        return True

    return False


def extract_locations_from_synopsis(text: str) -> dict:
    """
    Extract contact and incident location hints from a narrative.
    Returns {"contact_hint": str, "incident_hint": str} — empty string if not found.
    These are hints only; researcher confirms in the location fields.
    """
    contact_hint = ""
    incident_hint = ""

    for pat in _CONTACT_PATTERNS:
        m = pat.search(text)
        if m:
            candidate = _clean_loc(m.group(1))
            if _is_valid_location(candidate):
                contact_hint = candidate
                break

    for pat in _INCIDENT_PATTERNS:
        m = pat.search(text)
        if m:
            candidate = _clean_loc(m.group(1))
            if _is_valid_location(candidate) and candidate.lower() != contact_hint.lower():
                incident_hint = candidate
                break

    return {"contact_hint": contact_hint, "incident_hint": incident_hint}


# ── Temporal extraction ───────────────────────────────────────────────────────

# Vague date expressions that indicate the incident date is approximated
_VAGUE_DATE_EXPRS = [
    "last month", "a few weeks ago", "a couple weeks ago", "few weeks ago",
    "last week", "a few days ago", "recently", "a while ago", "some time ago",
    "last year", "earlier this year", "a couple months ago", "a few months ago",
    "two months ago", "three months ago", "several months ago",
    "about a month ago", "about two weeks ago", "about a week ago",
    "over a month ago", "nearly a month ago", "months ago", "weeks ago",
    "days ago", "a few years ago", "years ago",
]

# Time-of-day bucket → signal phrases (checked in order — first match wins)
_TIME_BUCKETS = [
    ("early morning", [
        "early morning", "early hours", "wee hours", "early am",
        "1 am", "2 am", "3 am", "4 am", "5 am",
        "1am", "2am", "3am", "4am", "5am",
        "1:00 am", "2:00 am", "3:00 am", "4:00 am", "5:00 am",
    ]),
    ("morning", [
        "morning", " a.m.", "6 am", "7 am", "8 am", "9 am", "10 am", "11 am",
        "6am", "7am", "8am", "9am", "10am", "11am",
    ]),
    ("afternoon", [
        "afternoon", "midday", "noon", "lunchtime",
        "12 pm", "1 pm", "2 pm", "3 pm", "4 pm",
        "12pm", "1pm", "2pm", "3pm", "4pm",
    ]),
    ("evening", [
        "evening", "dusk", "after dark",
        "5 pm", "6 pm", "7 pm", "8 pm",
        "5pm", "6pm", "7pm", "8pm",
    ]),
    ("night", [
        "night", "midnight", "late night", "overnight", "after midnight",
        "9 pm", "10 pm", "11 pm",
        "9pm", "10pm", "11pm",
        "nighttime", "night-time",
    ]),
]


def extract_temporal_info(text: str) -> dict:
    """
    Extract time-of-day bucket and vague date signals from narrative text.

    Returns:
      {
        "time_of_day_bucket": "morning"|"afternoon"|"evening"|"night"|"early morning"|"",
        "time_of_day_source": "narrative_cue"|"",
        "vague_date_expr":    "last month"|...|"",
        "date_certainty":     "exact"|"approximate"|"vague",
      }
    """
    low = text.lower()

    # Vague date check
    vague_expr = ""
    for expr in _VAGUE_DATE_EXPRS:
        if expr in low:
            vague_expr = expr
            break

    date_certainty = "vague" if vague_expr else "exact"

    # Time-of-day bucket from narrative text
    time_bucket = ""
    for bucket, signals in _TIME_BUCKETS:
        if any(sig in low for sig in signals):
            time_bucket = bucket
            break

    return {
        "time_of_day_bucket": time_bucket,
        "time_of_day_source": "narrative_cue" if time_bucket else "",
        "vague_date_expr": vague_expr,
        "date_certainty": date_certainty,
    }


# ── Environmental extraction ──────────────────────────────────────────────────

# ── Explicit non-residential overrides — checked first ───────────────────────
# If any of these match, the location is definitely NOT a residence.
_NON_RESIDENTIAL_SIGNALS = [
    "alley", "alleyway", "back alley", "back ally", "back lane", "laneway", "lane",
    "behind the store", "behind a store", "behind the building", "behind the shop",
    "behind the plaza", "behind the mall",
    "parking lot", "parking garage", "parkade", "underground parking", "parking structure",
    "in his car", "in her car", "in the car", "in a car", "in his vehicle", "in the vehicle",
    "in a van", "in his van", "in the back seat", "back seat", "front seat",
    "in his truck", "in the truck", "in his suv", "in a taxi",
    "hotel", "motel", "airbnb", "short-term rental", "inn", "hostel",
    "park", "ravine", "trail", "wooded area", "bushes", "forest", "green space",
    "street", "sidewalk", "road", "avenue", "boulevard", "intersection", "corner of",
    "outside the", "out front of", "open area",
]

# Location type → signal phrases (checked in priority order — first match wins)
_ENV_LOCATION_TYPES = [
    # 1. High-specificity outdoor/public spaces first
    ("alley/back lane",  ["alley", "alleyway", "back alley", "back ally", "laneway", "back lane"]),
    ("vehicle",          ["in his car", "in her car", "in the car", "in a car",
                          "in his vehicle", "in the vehicle", "in a van", "in his van",
                          "in the back seat", "back seat", "front seat", "in his truck",
                          "in the truck", "in his suv", "in a taxi"]),
    ("hotel/motel",      ["hotel", "motel", "airbnb", "short-term rental", "inn", "hostel", "suite"]),
    ("park/outdoor",     ["park", "ravine", "trail", "wooded", "bushes", "forest",
                          "nature path", "green space"]),
    ("parking lot",      ["parking lot", "parking garage", "parkade", "parking structure",
                          "underground parking"]),
    ("street/intersection", ["street", "sidewalk", "road", "avenue", "boulevard",
                              "intersection", "corner of", "block of"]),
    ("business exterior",["behind the store", "behind a store", "behind the building",
                          "behind the shop", "behind the plaza", "behind the mall",
                          "out front of", "outside the store", "outside the building",
                          "business park", "strip mall", "strip club"]),
    ("business/venue",   ["store", "shop", "mall", "bar", "restaurant", "club",
                          "cafe", "office", "business"]),
    ("indoor",           ["inside", "indoors", "interior"]),
    # 2. Residence — only when explicit possessive/specific phrases are present
    # Generic "apartment", "condo", "basement" alone are NOT enough — require person-ownership cue
    ("offender residence", ["his house", "his apartment", "his place", "his home",
                            "his condo", "his basement", "suspect's place",
                            "suspect's apartment", "suspect's house", "suspect's home",
                            "took her to his", "brought her to his", "drove her to his",
                            "took him to his", "brought him to his"]),
    ("victim residence",   ["her house", "her apartment", "her place", "her home",
                            "her room", "her condo", "worker's place", "worker's apartment",
                            "worker's home", "victim's apartment", "victim's place",
                            "victim's home", "at her house", "at her place"]),
    ("other residence",    ["their place", "their home", "their house", "their apartment",
                            "a house", "a residence", "a home", "someone's house",
                            "a condo", "condo", "townhouse", "duplex", "a suite"]),
    # 3. Absolute last resort — only if one of these exact standalone words appears
    # and NO non-residential signal is present (enforced in extract_environment)
    ("unknown residence",  ["residence", "basement", "apartment building"]),
]

# Lighting condition → signal phrases
_ENV_LIGHTING = [
    ("dark",     ["dark", "no lights", "no lighting", "pitch black", "dimly lit",
                  "poorly lit", "unlit", "lights were off", "lights off", "nighttime",
                  "no street lights"]),
    ("dim",      ["dim ", "dimly", "low light", "low lighting", "dusk", "twilight",
                  "fading light"]),
    ("well-lit", ["well-lit", "well lit", "brightly lit", "bright lights",
                  "street lights", "streetlights", "lights on", "lit up",
                  "well-lighted"]),
]

# Area character → signal phrases
_ENV_AREA = [
    ("deserted",    ["deserted", "abandoned", "empty", "isolated", "secluded",
                     "no one around", "nobody around", "quiet area", "no witnesses",
                     "remote", "out of sight", "away from", "nobody could see"]),
    ("busy",        ["busy", "crowded", "populated", "people around", "witnesses",
                     "public area", "busy street", "lots of people", "traffic",
                     "busy area"]),
    ("residential", ["residential", "neighbourhood", "neighborhood", "houses",
                     "homes nearby", "apartment building"]),
]


def extract_environment(text: str) -> dict:
    """
    Extract environmental context signals from narrative text.

    Returns:
      {
        "location_type":  "vehicle"|"alley/back lane"|"offender residence"|...|"",
        "lighting":       "dark"|"dim"|"well-lit"|"",
        "area_character": "deserted"|"busy"|"residential"|"",
      }

    Residence subtypes: offender residence / victim residence / other residence / unknown residence.
    Residence is only assigned when explicit possessive/ownership cues are present.
    If non-residential signals are detected, residence is never returned even if residence
    keywords also appear in the text.
    """
    low = text.lower()

    # Check whether any strong non-residential signal is present.
    # If so, we will not assign any residence type even if residence keywords match.
    has_non_residential = any(sig in low for sig in _NON_RESIDENTIAL_SIGNALS)

    location_type = ""
    for ltype, signals in _ENV_LOCATION_TYPES:
        if any(sig in low for sig in signals):
            # Block residence assignment when non-residential context is present
            if "residence" in ltype and has_non_residential:
                continue
            location_type = ltype
            break

    lighting = ""
    for lcat, signals in _ENV_LIGHTING:
        if any(sig in low for sig in signals):
            lighting = lcat
            break

    area_character = ""
    for acat, signals in _ENV_AREA:
        if any(sig in low for sig in signals):
            area_character = acat
            break

    return {
        "location_type": location_type,
        "lighting": lighting,
        "area_character": area_character,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def analyze_narrative(text: str) -> dict:
    """
    Analyse a narrative string and return a structured dict suitable for
    storage in Report.ai_suggestions.

    Output:
    {
        "nlp": {
            "coercion_rank": 1|2|3,
            "coercion_evidence": [...],
            "physical_rank": 1|2|3,
            "physical_evidence": [...],
            "sexual_rank": 1|2|3,
            "sexual_evidence": [...],
            "movement_rank": 1|2|3,
            "movement_evidence": [...],
        },
        "flags": ["Coercion — Rank 1 (restraint pattern)", ...]  # only rank 1/2
    }
    """
    if not text or not text.strip():
        return {"nlp": {}, "flags": []}

    if _nlp is None:
        return {"nlp": {}, "flags": [], "error": "spaCy model not available"}

    try:
        doc = _nlp(text)
    except Exception as e:
        return {"nlp": {}, "flags": [], "error": str(e)}

    c_rank, c_ev = _detect_coercion(text, doc)
    p_rank, p_ev = _detect_physical(text, doc)
    s_rank, s_ev = _detect_sexual(text)
    m_rank, m_ev = _detect_movement(text, doc)
    w_rank, w_ev = _detect_weapon(text)
    locs = extract_locations_from_synopsis(text)
    esc = _detect_escalation(text)
    temporal = extract_temporal_info(text)
    env = extract_environment(text)

    # If two distinct locations found in narrative, movement is strongly indicated
    if locs["contact_hint"] and locs["incident_hint"] and m_rank > 1:
        m_rank = 1
        m_ev = [f"two locations: \"{locs['contact_hint']}\" → \"{locs['incident_hint']}\""]

    LABEL = {1: "Rank 1 — high probability", 2: "Rank 2 — possible (review)"}
    flags = []
    if c_rank <= 2:
        flags.append(f"Coercion — {LABEL[c_rank]}: {c_ev[0] if c_ev else ''}")
    if p_rank <= 2:
        flags.append(f"Physical force — {LABEL[p_rank]}: {p_ev[0] if p_ev else ''}")
    if s_rank <= 2:
        flags.append(f"Sexual assault — {LABEL[s_rank]}: {s_ev[0] if s_ev else ''}")
    if m_rank <= 2:
        flags.append(f"Movement — {LABEL[m_rank]}: {m_ev[0] if m_ev else ''}")
    if w_rank <= 2:
        flags.append(f"Weapon — {LABEL[w_rank]}: {w_ev[0] if w_ev else ''}")
    if locs["contact_hint"] or locs["incident_hint"]:
        flags.append(f"Locations extracted — contact: \"{locs['contact_hint'] or 'unknown'}\" | incident: \"{locs['incident_hint'] or 'unknown'}\"")
    if esc["score"] >= 3:
        pattern_labels = {
            "condom_refusal":   "condom refusal",
            "payment_dispute":  "payment dispute",
            "bait_and_switch":  "bait-and-switch",
            "rapid_escalation": "rapid escalation",
            "weapon_present":   "weapon present",
            "multi_suspect":    "multiple suspects",
            "online_lure":      "online lure",
        }
        pattern_str = (" · " + " · ".join(pattern_labels[p] for p in esc["patterns"] if p in pattern_labels)) if esc["patterns"] else ""
        flags.append(f"Escalation score {esc['score']}/5 — {esc['arc']}{pattern_str}")
    if temporal["vague_date_expr"]:
        flags.append(f"Vague date expression: \"{temporal['vague_date_expr']}\" — incident date may be approximate")
    if env["location_type"]:
        env_parts = [f"location: {env['location_type']}"]
        if env["lighting"]:
            env_parts.append(f"lighting: {env['lighting']}")
        if env["area_character"]:
            env_parts.append(f"area: {env['area_character']}")
        flags.append("Environment — " + " · ".join(env_parts))

    return {
        "nlp": {
            "coercion_rank": c_rank,
            "coercion_evidence": c_ev,
            "physical_rank": p_rank,
            "physical_evidence": p_ev,
            "sexual_rank": s_rank,
            "sexual_evidence": s_ev,
            "movement_rank": m_rank,
            "movement_evidence": m_ev,
            "weapon_rank": w_rank,
            "weapon_evidence": w_ev,
            "contact_location_hint": locs["contact_hint"],
            "incident_location_hint": locs["incident_hint"],
            "escalation": esc,
            "temporal": temporal,
            "environment": env,
        },
        "flags": flags,
    }

# Public alias so main.py can reuse the loaded model for displaCy rendering
# without triggering a second spacy.load() call.
nlp_model = _nlp
