import os
import json
import anthropic

client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

SYSTEM_PROMPT = """You are an analyst assistant helping researchers code harm reports from community-generated narratives about violence against sex workers.

Extract structured fields from the provided narrative. Return ONLY a valid JSON object with these fields (use empty string "" if unclear, "yes"/"no" for boolean fields, "unclear" if ambiguous):

{
  "incident_date": "",
  "incident_time_range": "",
  "day_of_week": "",
  "city": "",
  "neighbourhood": "",
  "initial_contact_location": "",
  "incident_location_primary": "",
  "indoor_outdoor": "",
  "public_private": "",
  "initial_approach_type": "",
  "negotiation_present": "",
  "refusal_present": "",
  "pressure_after_refusal": "",
  "coercion_present": "",
  "threats_present": "",
  "verbal_abuse": "",
  "physical_force": "",
  "sexual_assault": "",
  "robbery_theft": "",
  "stealthing": "",
  "exit_type": "",
  "movement_present": "",
  "movement_attempted": "",
  "mode_of_movement": "",
  "entered_vehicle": "",
  "public_to_private_shift": "",
  "public_to_secluded_shift": "",
  "offender_control_over_movement": "",
  "suspect_count": "",
  "suspect_gender": "",
  "suspect_description_text": "",
  "suspect_age_estimate": "",
  "vehicle_present": "",
  "vehicle_make": "",
  "vehicle_model": "",
  "vehicle_colour": "",
  "plate_partial": "",
  "early_escalation_score": "",
  "mobility_richness_score": "",
  "summary_analytic": "",
  "key_quotes": "",
  "flags": []
}

For early_escalation_score and mobility_richness_score, use 1-5 scale.
For flags, include strings like "possible movement detected", "possible refusal/pressure sequence", "suspect description present", "vehicle identified", "stealthing/condom refusal" if relevant.
Keep summary_analytic to 1-2 sentences.
For key_quotes, extract 1-3 direct quotes from the narrative that are analytically significant."""

BULLETIN_PARSE_PROMPT = """You are an analyst assistant helping researchers parse "Red Light Alert" bulletins — community safety bulletins about bad dates and dangerous suspects targeting sex workers. These are published by organizations like WISH Drop-In Centre Society in Vancouver.

A bulletin contains MULTIPLE separate incident/suspect reports in a multi-column layout. Your job is to split the bulletin into individual entries and extract structured data for each.

Return ONLY a valid JSON array of objects. Each object represents one distinct incident or suspect alert with these fields:

{
  "raw_narrative": "The complete original text for this incident, preserving all details",
  "entry_type": "incident" or "suspect_profile" or "update",
  "bulletin_date": "Date of the bulletin itself (e.g. 2020-02-13)",
  "source_organization": "Issuing organization name",
  "incident_date": "YYYY-MM-DD or approximate",
  "date_reported": "When reported to organization",
  "city": "",
  "neighbourhood": "",
  "initial_contact_location": "",
  "incident_location_primary": "",
  "indoor_outdoor": "",
  "public_private": "",
  "initial_approach_type": "",
  "negotiation_present": "",
  "refusal_present": "",
  "pressure_after_refusal": "",
  "coercion_present": "",
  "threats_present": "",
  "verbal_abuse": "",
  "physical_force": "",
  "sexual_assault": "",
  "robbery_theft": "",
  "stealthing": "",
  "exit_type": "",
  "movement_present": "",
  "movement_attempted": "",
  "entered_vehicle": "",
  "mode_of_movement": "",
  "public_to_private_shift": "",
  "public_to_secluded_shift": "",
  "offender_control_over_movement": "",
  "suspect_count": "1",
  "suspect_gender": "",
  "suspect_description_text": "",
  "suspect_race_ethnicity": "",
  "suspect_age_estimate": "",
  "suspect_name": "",
  "vehicle_present": "",
  "vehicle_make": "",
  "vehicle_model": "",
  "vehicle_colour": "",
  "plate_partial": "",
  "summary_analytic": "",
  "flags": []
}

Rules:
- Use "yes"/"no"/"unclear" for boolean fields, "" if not mentioned
- Dates as YYYY-MM-DD where possible
- Include the FULL original text in raw_narrative for each entry
- For "suspect_profile" entries (named individuals with photos/charges but no specific new incident described), still extract what is known
- For "update" entries, note it is an update to a prior report
- flags: include relevant strings like "vehicle identified", "suspect named", "stealthing/condom refusal", "robbery", "sexual assault", "forcible confinement", "multiple victims", "repeat suspect", "police charges"
- DO NOT include the safety tips section or resource phone numbers as an entry
- Ignore page headers/footers"""


async def get_ai_suggestions(narrative: str) -> dict:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return {"error": "No API key configured", "flags": []}

    try:
        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": f"Extract structured fields from this harm report narrative:\n\n{narrative}"
                }
            ],
            system=SYSTEM_PROMPT,
        )
        text = message.content[0].text.strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
        return {"error": "Could not parse response", "flags": []}
    except Exception as e:
        return {"error": str(e), "flags": []}


async def parse_bulletin(text: str) -> list[dict]:
    """Parse a full bulletin text into individual incident records."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise ValueError("No ANTHROPIC_API_KEY configured. Add your API key to start_with_ai.bat to use bulletin parsing.")

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": f"Parse this Red Light Alert bulletin into individual incident/suspect entries:\n\n{text}"
            }
        ],
        system=BULLETIN_PARSE_PROMPT,
    )
    text_response = message.content[0].text.strip()
    start = text_response.find("[")
    end = text_response.rfind("]") + 1
    if start >= 0 and end > start:
        return json.loads(text_response[start:end])
    raise ValueError("Could not parse bulletin response as JSON array")
