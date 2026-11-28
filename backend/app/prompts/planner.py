"""Prompts for Today's plan, the indoor planner, the commute optimizer and the civic drafter."""

import json
from typing import Any

from app.prompts import LANGUAGE_NAMES
from app.prompts.system_base import MASTER_SYSTEM_PROMPT

DAILY_PLAN_PROMPT = """
Turn the family's fixed daily decision into a headline and 3-5 steps they can act on at a glance.
Keep the order of <verified_data>.plan.actions. Refer to people only by member_id.

<few_shot_example>
Input: stance=stay_in, NAQI 418 Severe, go_out 14:00-16:00, stay_indoors=[Member_1], purifier=true.
headline: "Severe smog (NAQI 418): keep Member_1 indoors and go out only from 14:00 to 16:00."
steps: ["Go out only between 14:00 and 16:00.", "Keep Member_1 indoors all day.", ...]
</few_shot_example>

<verified_data>
{verified_json}
</verified_data>
""".strip()

INDOOR_PROMPT = """
Explain this household's indoor air plan. summary: the purifier sizing result using
required_cadr_m3h, current_cadr_m3h and room_volume_m3. impact_reasoning: why outdoor PM2.5
matters indoors today. explanations: exactly one sentence per item in <verified_data>.fixes,
same order, saying why that fix cuts the family's exposure. Zero-cost fixes come first.
Budget tier: {budget_tier}. Never claim houseplants remove PM2.5.

<verified_data>
{verified_json}
</verified_data>
""".strip()

COMMUTE_PROMPT = """
Explain the commute recommendation. summary: compare the baseline with the recommended option
using their exact inhaled_dose_ug, co2_kg and departure times, and the given dose_saved_pct.
impact_reasoning: one sentence on why the recommended option lowers exposure (microenvironment,
time in traffic, or cleaner hour). explanations: one sentence per entry of
<verified_data>.options in the same order. Safest outdoor window: {best_window}.

<verified_data>
{verified_json}
</verified_data>
""".strip()

CIVIC_PROMPTS = {
    "rwa_advisory": "a polite advisory from residents to their Resident Welfare Association (RWA) "
    "asking for clean-air measures during this smog episode (no open burning of leaves or "
    "garbage, no fires for guards, covered construction dust, children's outdoor play limited to "
    "the cleanest window)",
    "burning_report": "a polite, factual complaint to the municipal ward office reporting open "
    "burning and asking for inspection and action under the applicable air pollution rules, "
    "including the Graded Response Action Plan (GRAP) where it is in force",
}

CIVIC_PROMPT = """
Draft {task}. Use the verified air numbers and the residents' observation. Keep it respectful,
specific and under 200 words, with a clear request and no personal names, phone numbers or
accusations against named people. Write [Your name] and [Flat / house no.] as placeholders.

<verified_data>
{verified_json}
</verified_data>

<user_input>
{user_input_json}
</user_input>
""".strip()


def _system(language: str) -> str:
    return MASTER_SYSTEM_PROMPT.format(language=LANGUAGE_NAMES.get(language, "English"))


def _dump(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=1)


def daily_plan_prompts(verified: dict[str, Any], language: str) -> tuple[str, str]:
    return _system(language), DAILY_PLAN_PROMPT.format(verified_json=_dump(verified))


def indoor_prompts(verified: dict[str, Any], budget_tier: str, language: str) -> tuple[str, str]:
    return _system(language), INDOOR_PROMPT.format(budget_tier=budget_tier, verified_json=_dump(verified))


def commute_prompts(verified: dict[str, Any], best_window: str, language: str) -> tuple[str, str]:
    return _system(language), COMMUTE_PROMPT.format(best_window=best_window, verified_json=_dump(verified))


def civic_prompts(kind: str, verified: dict[str, Any], user_input: dict[str, str], language: str) -> tuple[str, str]:
    prompt = CIVIC_PROMPT.format(
        task=CIVIC_PROMPTS[kind], verified_json=_dump(verified), user_input_json=_dump(user_input)
    )
    return _system(language), prompt
