import asyncpg
from typing import Optional
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Database manager class responsible for maintaining connection pool and executing queries
class Database:
    # Initialize the Database instance with an empty connection pool
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    # Connect to the PostgreSQL database and establish a connection pool
    async def connect(self):
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

    # Disconnect from the database and close the connection pool gracefully
    async def disconnect(self):
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed")

    # Execute a query that doesn't return rows (e.g., INSERT, UPDATE, DELETE)
    async def execute(self, query: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    # Execute a query and fetch all resulting rows from the database
    async def fetch(self, query: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    # Execute a query and return a single row, or None if no row exists
    async def fetchrow(self, query: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    # Execute a query and return a single specific value from the first row/column
    async def fetchval(self, query: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetchval(query, *args)

db = Database()
