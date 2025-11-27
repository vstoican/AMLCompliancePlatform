from typing import List, Tuple

from .models import RiskIndicators


def calculate_risk(indicators: RiskIndicators, override: str | None = None) -> Tuple[float, str, List[str]]:
    reasons: List[str] = []
    score = indicators.geography_risk * 0.3 + indicators.product_risk * 0.2 + indicators.behavior_risk * 0.3

    if indicators.adverse_media:
        score += 2
        reasons.append("Adverse media hit")
    if indicators.pep_flag:
        score += 3
        reasons.append("PEP flag")
    if indicators.sanctions_hit:
        score += 5
        reasons.append("Sanctions hit")

    if override:
        reasons.append(f"Manual override: {override}")

    level = "low"
    if score >= 7:
        level = "high"
    elif score >= 4:
        level = "medium"

    return round(score, 2), level, reasons
