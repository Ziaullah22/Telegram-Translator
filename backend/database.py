import asyncpg
from typing import Optional
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# DATABASE WRAPPER (database.py)
# ---------------------------------------------------------
# Provides a high-level asynchronous interface for PostgreSQL using asyncpg.
# Manages the connection pool (min_size: 5, max_size: 30) 
# and provides utility methods for common SQL operations.

class Database:
    """
    POSTGRESQL CONNECTION POOL MANAGER
    Ensures safe, concurrent access to the database using connection pooling.
    Handles automatic cleanup on application shutdown.
    """
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """
        INITIALIZES THE CONNECTION POOL
        Settings are loaded from the environment-based config.
        """
        try:
            self.pool = await asyncpg.create_pool(

                settings.database_url,
                min_size=5,
                max_size=30,
                command_timeout=60
            )
            logger.info("Database connection pool created successfully")
        except Exception as e:
            logger.error(f"Failed to create database pool: {e}")
            raise

    async def disconnect(self):
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed")

    async def execute(self, query: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def fetch(self, query: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetchval(self, query: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetchval(query, *args)

db = Database()
