from typing import AsyncIterator

from psycopg_pool import AsyncConnectionPool

from .config import settings

pool: AsyncConnectionPool | None = None


def get_pool() -> AsyncConnectionPool:
    global pool
    if pool is None:
        dsn = (
            f"postgresql://{settings.database_user}:"
            f"{settings.database_password}@"
            f"{settings.database_host}:{settings.database_port}/"
            f"{settings.database_name}"
        )
        pool = AsyncConnectionPool(
            dsn,
            min_size=1,
            max_size=10,
            timeout=10,
        )
    return pool


async def connection() -> AsyncIterator:
    async with get_pool().connection() as conn:
        yield conn
