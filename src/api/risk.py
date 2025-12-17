from typing import List, Tuple

from .models import RiskIndicators


def calculate_risk(indicators: RiskIndicators, override: str | None = None) -> Tuple[float, str, List[str]]:
    """
    Calculate risk score on a 1-100 scale.

    Formula: (geography * 30 + product * 20 + behavior * 30) / 8 + penalties

    Risk factors: 1-10 each
    Weights: Geography 30%, Product 20%, Behavior 30%
    Base score range: 10-100
    Penalties: PEP +10, Sanctions +15, Adverse Media +5

    Thresholds:
    - High: >= 70
    - Medium: 40-69
    - Low: < 40
    """
    reasons: List[str] = []

    # Calculate weighted base score: scale to 1-100
    # (1*30 + 1*20 + 1*30) / 8 = 80/8 = 10 (minimum)
    # (10*30 + 10*20 + 10*30) / 8 = 800/8 = 100 (maximum)
    score = (indicators.geography_risk * 30 + indicators.product_risk * 20 + indicators.behavior_risk * 30) / 8

    # Add penalty points
    if indicators.adverse_media:
        score += 5
        reasons.append("Adverse media hit")
    if indicators.pep_flag:
        score += 10
        reasons.append("PEP flag")
    if indicators.sanctions_hit:
        score += 15
        reasons.append("Sanctions hit")

    # Cap at 100
    score = min(score, 100)

    if override:
        reasons.append(f"Manual override: {override}")

    # Determine risk level
    level = "low"
    if score >= 70:
        level = "high"
    elif score >= 40:
        level = "medium"

    return round(score, 2), level, reasons
