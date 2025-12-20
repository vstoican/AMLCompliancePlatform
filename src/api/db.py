from typing import AsyncIterator

from psycopg_pool import AsyncConnectionPool

from .config import settings

pool: AsyncConnectionPool | None = None
_pool_opened: bool = False


def _get_dsn() -> str:
    return (
        f"postgresql://{settings.database_user}:"
        f"{settings.database_password}@"
        f"{settings.database_host}:{settings.database_port}/"
        f"{settings.database_name}"
    )


def get_pool() -> AsyncConnectionPool:
    """Get the connection pool. Must call init_pool() first in async context."""
    global pool
    if pool is None:
        # Create pool with open=False to avoid deprecation warning
        pool = AsyncConnectionPool(
            _get_dsn(),
            min_size=1,
            max_size=10,
            timeout=10,
            open=False,
        )
    return pool


async def init_pool() -> None:
    """Initialize and open the connection pool. Call this at startup."""
    global _pool_opened
    if not _pool_opened:
        await get_pool().open()
        _pool_opened = True


async def close_pool() -> None:
    """Close the connection pool. Call this at shutdown."""
    global pool, _pool_opened
    if pool is not None and _pool_opened:
        await pool.close()
        _pool_opened = False


async def connection() -> AsyncIterator:
    async with get_pool().connection() as conn:
        yield conn
