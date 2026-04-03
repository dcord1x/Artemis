"""
Rule-based Red Light Alert bulletin parser.
Works without any AI API key.
Uses pdfplumber table/column detection + regex field extraction.
"""
import re
import io
import tempfile
import os
import pdfplumber
from datetime import datetime


# ── Helpers ───────────────────────────────────────────────────────────────────

MONTH_MAP = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
}

CITIES = [
    'Vancouver', 'Chilliwack', 'Burnaby', 'Surrey', 'Richmond',
    'Victoria', 'Kelowna', 'Abbotsford', 'New Westminster', 'Langley',
    'Coquitlam', 'Delta', 'Maple Ridge', 'Prince George', 'Kamloops',
    'Nanaimo', 'Vernon', 'Penticton', 'Courtenay', 'Port Coquitlam',
]

VEHICLE_COLORS = [
    'Black', 'White', 'Grey', 'Gray', 'Green', 'Blue', 'Red', 'Silver',
    'Brown', 'Gold', 'Beige', 'Tan', 'Orange', 'Purple', 'Yellow', 'Maroon',
    'Dark', 'Light',
]

VEHICLE_MAKES = [
    'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Chevy', 'Dodge', 'Chrysler',
    'GMC', 'Nissan', 'Hyundai', 'Kia', 'Mazda', 'Subaru', 'Volkswagen',
    'BMW', 'Mercedes', 'Audi', 'Jeep', 'Ram', 'Cadillac', 'Buick',
    'Pontiac', 'Acura', 'Lexus', 'Infiniti', 'Mitsubishi', 'Suzuki',
]

VEHICLE_MODELS = [
    'Camry', 'Civic', 'Accord', 'Corolla', 'Altima', 'Sentra',
    'F-150', 'F150', 'Silverado', 'Sierra', 'Ram', 'Colorado',
    'SUV', 'Pickup', 'Pick-up', 'Truck', 'Van', 'Minivan', 'Sedan',
    'Hatchback', 'Coupe', 'Tacoma', 'Tundra', 'Ranger', 'Escape',
    'Explorer', 'CR-V', 'RAV4', 'Equinox', 'Tahoe', 'Suburban',
    'Sorento', 'Sportage', 'Tucson', 'Santa Fe', 'Elantra',
]


def parse_date_string(s: str) -> str:
    """Try to convert messy date strings to YYYY-MM-DD."""
    s = s.strip()
    # Remove ordinals
    s = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', s)
    s = s.replace(',', '')

    # Try pattern: Month Day Year
    m = re.match(r'([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})', s)
    if m:
        month_str = m.group(1).lower()[:3]
        month = MONTH_MAP.get(month_str)
        if month:
            return f"{m.group(3)}-{month}-{m.group(2).zfill(2)}"

    # Try pattern: Day Month Year
    m = re.match(r'(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})', s)
    if m:
        month_str = m.group(2).lower()[:3]
        month = MONTH_MAP.get(month_str)
        if month:
            return f"{m.group(3)}-{month}-{m.group(1).zfill(2)}"

    return s


def find_date_in_text(text: str, patterns: list[str]) -> str:
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            return parse_date_string(m.group(1))
    return ''


def keyword_yes(text: str, keywords: list[str]) -> str:
    pattern = r'\b(' + '|'.join(re.escape(k) for k in keywords) + r')\b'
    return 'yes' if re.search(pattern, text, re.I) else ''


def extract_fields(text: str, bulletin_date: str = '', source_org: str = '') -> dict:
    """Extract structured fields from a single incident's text block."""
    fields: dict = {
        'raw_narrative': text.strip(),
        'bulletin_date': bulletin_date,
        'source_organization': source_org,
        'flags': [],
    }

    # ── Entry type ──
    is_new = bool(re.search(r'\*NEW\*', text, re.I))
    is_updated = bool(re.search(r'\bUPDAT', text, re.I))
    is_profile = bool(re.search(r'\b(charges|charge|DOB:|court|arrested|photo on page)\b', text, re.I))

    if is_new:
        fields['entry_type'] = 'incident'
    elif is_updated:
        fields['entry_type'] = 'update'
    elif is_profile:
        fields['entry_type'] = 'suspect_profile'
    else:
        fields['entry_type'] = 'incident'

    # ── City ──
    for city in CITIES:
        if re.search(r'\b' + city + r'\b', text, re.I):
            fields['city'] = city
            break

    # ── Incident date ──
    date_patterns = [
        r'[Ii]ncident occurred[- ]+(?:on\s+)?([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})',
        r'[Ii]ncident occurred[- ]+(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)? [A-Za-z]+,?\s*\d{4})',
        r'[Oo]ccurred[- ]+(?:on\s+)?([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})',
        r'[Dd]ecember\s+(\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})',
        r'[Jj]anuary\s+(\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})',
    ]
    fields['incident_date'] = find_date_in_text(text, date_patterns)

    # ── Date reported ──
    rep_patterns = [
        r'[Rr]eported\s+(?:on\s+)?([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})',
        r'[Aa]dvised\s+(?:on\s+)?([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})',
    ]
    fields['date_reported'] = find_date_in_text(text, rep_patterns)

    # ── Time ──
    time_m = re.search(r'at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))', text, re.I)
    if time_m:
        fields['incident_time_exact'] = time_m.group(1)

    # ── Location ──
    location_patterns = [
        r'[Ii]ncident occurred at\s+(.+?)[\.\n]',
        r'picked up (?:at|on|in)\s+(.+?)[\.\n]',
        r'(?:at|on)\s+((?:\d+\s+)?[A-Z][a-z]+(?:\s+(?:Street|Ave|Avenue|Road|Blvd|Drive|Lane|Way|Place|Cordova|Hastings|Main|Broadway|Georgia))[^.\n]*)',
    ]
    for pat in location_patterns:
        m = re.search(pat, text, re.I)
        if m:
            loc = m.group(1).strip()
            if len(loc) < 80:
                fields['incident_location_primary'] = loc
                break

    # Contact location (street corners, areas)
    corner_m = re.search(r'(?:at|on|around|near)\s+([A-Z][a-z]+\s+and\s+[A-Z][a-z]+)', text, re.I)
    if corner_m:
        fields['initial_contact_location'] = corner_m.group(1)

    # Neighbourhood
    dtes_m = re.search(r'\b(Downtown East Side|DTES)\b', text, re.I)
    if dtes_m:
        fields['neighbourhood'] = 'Downtown East Side'

    # ── Suspect description ──
    fields['suspect_gender'] = 'male' if re.search(r'\b[Mm]ale\b', text) else (
        'female' if re.search(r'\b[Ff]emale\b', text) else '')

    age_m = re.search(r'[Aa]ge[:\s]+(\d{2}(?:-\d{2})?)', text)
    if age_m:
        fields['suspect_age_estimate'] = age_m.group(1)

    # Race/ethnicity (as reported in bulletin)
    race_patterns = [
        r'(Caucasian)',
        r'person of colou?r',
        r'"([^"]+)"\s+descent',
        r'([A-Z][a-z]+)\s+(?:Male|Female)',
        r'AS\s+male',  # Asian
    ]
    for pat in race_patterns:
        m = re.search(pat, text, re.I)
        if m:
            fields['suspect_race_ethnicity'] = m.group(0).strip()
            break

    # Name
    name_m = re.search(r'(?:Possible\s+[Nn]ame|[Nn]ame)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', text)
    if name_m:
        fields['suspect_name'] = name_m.group(1)

    # Full suspect description block
    desc_m = re.search(
        r'([Mm]ale\..*?(?:Height|Build|Hair|Weight|wearing|Described)[^.]*\.(?:[^.\n]*\.){0,4})',
        text, re.S
    )
    if desc_m:
        fields['suspect_description_text'] = desc_m.group(1).strip()

    # Count (multiple workers mentioned)
    multi_m = re.search(r'(\d+)\s+(?:different\s+)?[Ww]orkers', text)
    if multi_m:
        fields['suspect_count'] = '1'  # suspect count, not victim count

    # ── Vehicle ──
    vehicle_block = ''
    for make in VEHICLE_MAKES:
        if re.search(r'\b' + make + r'\b', text, re.I):
            fields['vehicle_make'] = make
            fields['vehicle_present'] = 'yes'
            # Find surrounding context
            vm = re.search(r'(.{0,30}' + make + r'.{0,50})', text, re.I)
            if vm:
                vehicle_block = vm.group(1)
            break

    if re.search(r'\b(SUV|Pickup|Pick-up|Van|Truck)\b', text, re.I):
        m = re.search(r'\b(SUV|Pickup|Pick-up|Van|Truck)\b', text, re.I)
        if m:
            fields['vehicle_model'] = fields.get('vehicle_model', '') or m.group(1)
            fields['vehicle_present'] = 'yes'

    for model in VEHICLE_MODELS:
        if re.search(r'\b' + model + r'\b', text, re.I):
            fields['vehicle_model'] = model
            break

    for color in VEHICLE_COLORS:
        if re.search(r'\b' + color + r'\b', text, re.I):
            fields['vehicle_colour'] = color
            break

    # Plate
    plate_m = re.search(
        r'(?:[Ll]icense\s+[Pp]late|[Ll]icence\s+[Pp]late|[Ll]iscence\s+[Pp]late|[Pp]late|[Pp]artial\s+[Pp]late)[:\s#]+([A-Z0-9]{2,4}\s*[A-Z0-9_]{2,5})',
        text
    )
    if plate_m:
        fields['plate_partial'] = plate_m.group(1).strip()
        if fields.get('plate_partial'):
            fields['flags'].append('vehicle identified')

    if fields.get('vehicle_make') or fields.get('vehicle_model'):
        if 'vehicle identified' not in fields['flags']:
            fields['flags'].append('vehicle identified')

    # ── Violence / encounter indicators ──
    fields['robbery_theft'] = keyword_yes(text, [
        'stole', 'stolen', 'theft', 'rob', 'robbed', 'robbery', 'took', 'steal'
    ])
    if fields['robbery_theft'] == 'yes':
        fields['flags'].append('robbery')

    fields['physical_force'] = keyword_yes(text, [
        'assault', 'assaulted', 'hit', 'punch', 'attack', 'attacked', 'force', 'violence', 'violent'
    ])
    if fields['physical_force'] == 'yes':
        fields['flags'].append('physical assault')

    fields['sexual_assault'] = keyword_yes(text, [
        'sexual assault', 'sexually assaulted', 'rape', 'raped'
    ])
    if fields['sexual_assault'] == 'yes':
        fields['flags'].append('sexual assault')

    fields['coercion_present'] = keyword_yes(text, [
        'confine', 'confined', 'confinement', 'forcible', 'forcibly', 'coerce', 'coercion', 'locked'
    ])
    if fields['coercion_present'] == 'yes':
        fields['flags'].append('forcible confinement')

    fields['threats_present'] = keyword_yes(text, [
        'threat', 'threaten', 'threatened', 'threatening', 'intimidat'
    ])

    fields['verbal_abuse'] = keyword_yes(text, [
        'verbal', 'abuse', 'yell', 'shout', 'scream', 'insult', 'derogatory', 'annoying'
    ])

    fields['stealthing'] = keyword_yes(text, [
        'condom', 'stealthing', 'no condom', 'not wanting to use a condom', 'condom refusal'
    ])
    if fields['stealthing'] == 'yes':
        fields['flags'].append('stealthing/condom refusal')

    # ── Movement ──
    fields['movement_present'] = keyword_yes(text, [
        'picked up', 'pick-up', 'followed', 'following', 'drove', 'driving', 'taken', 'transported'
    ])
    fields['movement_attempted'] = keyword_yes(text, [
        'followed', 'circling', 'parking and driving'
    ])
    fields['entered_vehicle'] = keyword_yes(text, [
        'picked up', 'in his vehicle', 'in the vehicle', 'entered', 'got in', 'got into'
    ])
    fields['mode_of_movement'] = 'vehicle' if fields.get('vehicle_present') == 'yes' else ''
    fields['public_private'] = 'public' if re.search(r'\b(street|sidewalk|corner|outdoor|outside)\b', text, re.I) else ''

    if fields['movement_present'] == 'yes':
        fields['flags'].append('possible movement detected')

    # ── Police / charges ──
    if re.search(r'\b(police|charges|charged|RCMP|VPD|arrested|court)\b', text, re.I):
        fields['flags'].append('police charges')

    # ── Multiple victims ──
    if re.search(r'\b(\d+|several|multiple)\s+(?:different\s+)?(?:workers|women|victims)\b', text, re.I):
        fields['flags'].append('multiple victims')

    # ── Suspect named ──
    if fields.get('suspect_name') or re.search(r'\b[A-Z][a-z]+,\s+[A-Z][a-z]+\b', text):
        fields['flags'].append('suspect named')

    # ── Summary ──
    parts = []
    if fields.get('entry_type') == 'update':
        parts.append('Updated warning')
    elif fields.get('entry_type') == 'suspect_profile':
        parts.append('Suspect profile')
    else:
        parts.append('Incident')
    if fields.get('city'):
        parts.append(f"in {fields['city']}")
    if fields.get('incident_date'):
        parts.append(f"on {fields['incident_date']}")
    if fields.get('suspect_description_text'):
        age = fields.get('suspect_age_estimate', '')
        parts.append(f"— {fields.get('suspect_gender', 'unknown gender')} suspect" + (f", age {age}" if age else ''))
    if fields.get('vehicle_make'):
        parts.append(f"in {fields.get('vehicle_colour', '')} {fields['vehicle_make']} {fields.get('vehicle_model', '')}".strip())
    fields['summary_analytic'] = ' '.join(parts) + '.'

    return fields


def extract_columns_from_pdf(pdf_bytes: bytes) -> list[str]:
    """Extract per-column text from a multi-column Red Light Alert PDF."""
    columns = []

    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        with pdfplumber.open(tmp_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if tables:
                    # Use first table (the bulletin columns)
                    t = tables[0]
                    num_cols = max(len(row) for row in t)
                    for col_i in range(num_cols):
                        col_text = '\n'.join(
                            (t[row_i][col_i] or '').strip()
                            for row_i in range(len(t))
                            if col_i < len(t[row_i]) and t[row_i][col_i]
                        ).strip()
                        # Clean up encoding artifacts
                        col_text = col_text.replace('\ufffd', "'").replace('â€™', "'")
                        if col_text and len(col_text) > 30:
                            columns.append(col_text)
                else:
                    # Fallback: use full page text as one block
                    text = page.extract_text() or ''
                    if text.strip():
                        columns.append(text)
    finally:
        os.unlink(tmp_path)

    return columns


def is_safety_tips_column(text: str) -> bool:
    """Return True if this column is the Safety Tips block (not an incident)."""
    return bool(re.search(r"SAFETY TIPS|DON'T:|DO:", text, re.I))


def extract_bulletin_date(text: str) -> str:
    """Extract the bulletin publication date from header text."""
    m = re.search(
        r'([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})',
        text
    )
    if m:
        return parse_date_string(m.group(1))
    return ''


def extract_source_org(text: str) -> str:
    orgs = ['WISH Drop-In Centre Society', 'WISH', 'PACE', 'SWAN Vancouver']
    for org in orgs:
        if org.lower() in text.lower():
            return org
    return ''


def parse_bulletin_rules(pdf_bytes: bytes) -> list[dict]:
    """
    Main entry point for rule-based bulletin parsing.
    Returns a list of incident dicts.
    """
    columns = extract_columns_from_pdf(pdf_bytes)

    # Try to get bulletin metadata from first page full text
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name
    try:
        with pdfplumber.open(tmp_path) as pdf:
            header_text = pdf.pages[0].extract_text() or ''
    finally:
        os.unlink(tmp_path)

    bulletin_date = extract_bulletin_date(header_text)
    source_org = extract_source_org(header_text) or 'WISH Drop-In Centre Society'

    incidents = []
    for col_text in columns:
        if is_safety_tips_column(col_text):
            continue
        if len(col_text.strip()) < 40:
            continue
        # Skip columns that are just page headers/footers
        if re.match(r'^(Red Light Alert|If you need assistance|To place a report)', col_text.strip(), re.I):
            continue

        fields = extract_fields(col_text, bulletin_date=bulletin_date, source_org=source_org)
        incidents.append(fields)

    return incidents
