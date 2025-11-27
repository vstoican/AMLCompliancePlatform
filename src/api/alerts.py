from typing import Any, Optional
from uuid import UUID

from psycopg import AsyncConnection


async def create_alert(
    conn: AsyncConnection,
    customer_id: Optional[UUID],
    alert_type: str,
    severity: str,
    scenario: str,
    details: dict[str, Any],
) -> int:
    query = """
        INSERT INTO alerts (customer_id, type, severity, scenario, details)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
    """
    async with conn.cursor() as cur:
        await cur.execute(query, (customer_id, alert_type, severity, scenario, details))
        row = await cur.fetchone()
        return int(row[0])
