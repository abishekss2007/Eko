"""Family Health Shield prompt: few-shot conditioned, XML-delimited, schema-locked."""

import json
from typing import Any

from app.prompts import LANGUAGE_NAMES
from app.prompts.system_base import MASTER_SYSTEM_PROMPT

HEALTH_SHIELD_PROMPT = """
Write the Family Health Shield explanation for this household: a smog summary, one alert per
member (impact reasoning, push notification, 3-4 indoor steps, care-plan reminder) and a
30-second doctor handoff script. Return exactly one member_alerts entry per member in
<verified_data>, using the same member_id.

<few_shot_example>
Input: NAQI 388 (Very Poor), PM2.5 235, temperature 11 C, wind 4 km/h, inversion_detected=true.
Member_1: senior, copd, risk_level=emergency, care_note="Keep nebulizer ready in winter; avoid morning walk".
Good output style:
- impact_reasoning: "At 235 ug/m3 PM2.5 with 11 C still air, fine particles stay trapped at
  breathing height and can tighten Member_1's COPD airways."
- care_plan_reminder: "Skip the morning walk as your doctor advised, and keep your prescribed
  winter breathing equipment within reach."
- doctor_handoff_summary: "I am calling about Member_1, a senior family member with COPD who is
  struggling to breathe. Outdoor NAQI here is 388 with PM2.5 at 235 and 11 C winter smog.
  Please tell us what to do right now while we arrange transport."
</few_shot_example>

<verified_data>
{verified_json}
</verified_data>

<user_care_notes>
{care_notes_json}
</user_care_notes>
""".strip()


def build_health_shield_prompts(
    verified: dict[str, Any], care_notes: list[dict[str, str]], language: str
) -> tuple[str, str]:
    """Return (system_instruction, user_prompt). Inputs must already be sanitized."""
    system = MASTER_SYSTEM_PROMPT.format(language=LANGUAGE_NAMES.get(language, "English"))
    prompt = HEALTH_SHIELD_PROMPT.format(
        verified_json=json.dumps(verified, ensure_ascii=False, indent=1),
        care_notes_json=json.dumps(care_notes, ensure_ascii=False, indent=1),
    )
    return system, prompt
