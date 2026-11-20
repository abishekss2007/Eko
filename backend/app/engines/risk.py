"""Per-member risk tiers and red-flag symptoms. Deterministic, so SOS works without AI."""

from app.data import RiskLevel, get_assumptions
from app.schemas.shield import HouseholdRisk, MemberInput, MemberRisk


def _bump(level: RiskLevel, steps: int, ceiling: RiskLevel) -> RiskLevel:
    levels = get_assumptions().risk.levels
    target = min(levels.index(level) + steps, levels.index(ceiling))
    return levels[max(target, levels.index(level))]


def assess_member(member: MemberInput, category: str, inversion: bool) -> MemberRisk:
    """General-public tier from the NAQI band, then escalate for vulnerability.

    - Vulnerable age group or any medical sensitivity: one tier earlier (CPCB guidance).
    - Inversion with lung or heart conditions: one more tier.
    - ``emergency`` is reserved for members with a medical sensitivity.
    - No escalation in the cleanest band ("Good").
    """
    rules = get_assumptions().risk
    base = rules.general_public_by_category[category]
    reasons = [f"Outdoor air is {category}"]
    medical = set(member.sensitivities) & rules.medical_sensitivities
    vulnerable_age = member.age_group in rules.vulnerable_age_groups

    steps = 0
    if medical or vulnerable_age:
        steps += 1
        reasons.append("Sensitive group: affected one level earlier than the general public")
    trapped = sorted(set(member.sensitivities) & rules.inversion_sensitive_conditions)
    if inversion and trapped:
        steps += 1
        reasons.append("Cold, still air is trapping smog, which strains lungs and heart")

    ceiling: RiskLevel = (
        "emergency" if medical or not rules.emergency_requires_medical_sensitivity else "very_high"
    )
    clean_air = category == get_assumptions().naqi.categories[0].name
    level = base if clean_air else _bump(base, steps, ceiling)
    return MemberRisk(member_id=member.member_id, risk_level=level, reasons=reasons)


def red_flags_for(members: list[MemberInput]) -> list[str]:
    """General danger signs plus condition-specific ones, de-duplicated and ordered."""
    rules = get_assumptions().red_flags
    flags = list(rules.general)
    keys: list[str] = []
    for member in members:
        keys.extend(member.sensitivities)
        keys.append(member.age_group)
    for key in dict.fromkeys(keys):
        flags.extend(rules.by_condition.get(key, ()))
    return list(dict.fromkeys(flags))


def assess_household(members: list[MemberInput], category: str, inversion: bool) -> HouseholdRisk:
    """Assess every member and decide whether to push an alert."""
    rules = get_assumptions().risk
    results = [assess_member(m, category, inversion) for m in members]
    highest = max((r.risk_level for r in results), key=rules.levels.index)
    threshold = rules.levels.index(rules.alert_threshold)
    return HouseholdRisk(
        members=results,
        highest_level=highest,
        should_alert=rules.levels.index(highest) >= threshold,
        red_flag_symptoms=red_flags_for(members),
    )
