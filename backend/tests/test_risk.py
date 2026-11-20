from app.engines.risk import assess_household, assess_member
from app.schemas.shield import MemberInput


def member(age: str = "adult", *sens: str, mid: str = "Member_1") -> MemberInput:
    return MemberInput.model_validate({"member_id": mid, "age_group": age, "sensitivities": list(sens)})


def test_healthy_adult_follows_general_public_mapping() -> None:
    assert assess_member(member(), "Poor", False).risk_level == "high"
    assert assess_member(member(), "Severe", True).risk_level == "very_high"


def test_sensitive_member_escalates_one_tier_earlier() -> None:
    assert assess_member(member("adult", "asthma"), "Moderate", False).risk_level == "high"
    assert assess_member(member("senior"), "Moderate", False).risk_level == "high"


def test_inversion_adds_tier_for_lung_and_heart_conditions() -> None:
    assert assess_member(member("adult", "asthma"), "Poor", False).risk_level == "very_high"
    assert assess_member(member("adult", "asthma"), "Poor", True).risk_level == "emergency"
    assert assess_member(member("adult", "diabetes"), "Poor", True).risk_level == "very_high"


def test_emergency_requires_a_medical_condition() -> None:
    assert assess_member(member("child"), "Severe", True).risk_level == "very_high"
    assert assess_member(member("senior", "copd"), "Severe", True).risk_level == "emergency"


def test_clean_air_never_escalates() -> None:
    assert assess_member(member("infant", "asthma"), "Good", True).risk_level == "low"


def test_household_alert_and_red_flags() -> None:
    members = [member("senior", "heart_disease"), member("infant", mid="Member_2")]
    risk = assess_household(members, "Very Poor", True)
    assert risk.should_alert
    assert risk.highest_level == "emergency"
    assert any("arm, jaw" in f for f in risk.red_flag_symptoms)
    assert any("ribs" in f for f in risk.red_flag_symptoms)
    assert len(risk.red_flag_symptoms) == len(set(risk.red_flag_symptoms))


def test_household_no_alert_in_satisfactory_air() -> None:
    assert not assess_household([member()], "Satisfactory", False).should_alert
