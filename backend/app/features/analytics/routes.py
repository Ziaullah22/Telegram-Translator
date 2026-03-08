from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from database import db
from auth import get_current_user
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

class RankingItem(BaseModel):
    id: int
    title: str
    subtitle: Optional[str] = None
    avg_response_time: float # in seconds
    platform: str = "telegram"
    total_responses: int

@router.get("/ranking/conversations", response_model=List[RankingItem])
async def get_conversation_ranking(
    limit: int = 10,
    account_id: Optional[int] = Query(None),
    current_user = Depends(get_current_user)
):
    """
    Returns ranking of ACTIVE PRIVATE chats (users only) by average response time.
    Excludes groups, channels, and archived/hidden chats.
    """
    params = [current_user.user_id, limit]
    account_filter = ""
    if account_id:
        account_filter = " AND c.telegram_account_id = $3"
        params.append(account_id)

    query = f"""
    WITH user_convs AS (
        -- Scope to ONLY this user's conversations upfront to avoid cross-user confusion
        SELECT c.id as conv_id
        FROM conversations c
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE ta.user_id = $1
          AND c.type = 'private'
          AND c.is_archived = FALSE
          AND c.is_hidden = FALSE
          AND c.telegram_peer_id != 777000
          AND c.title NOT ILIKE '%bot%'
          AND (c.username IS NULL OR c.username NOT ILIKE '%bot%')
          {account_filter}
    ),
    response_pairs AS (
        SELECT 
            m_in.conversation_id,
            m_in.created_at AS received_at,
            -- Find first outgoing reply after this incoming message
            (SELECT MIN(m_out.created_at) FROM messages m_out 
             WHERE m_out.conversation_id = m_in.conversation_id 
             AND m_out.created_at > m_in.created_at 
             AND m_out.is_outgoing = TRUE) AS responded_at
        FROM messages m_in
        -- Only look at messages inside the target user's conversations
        JOIN user_convs uc ON uc.conv_id = m_in.conversation_id
        WHERE m_in.is_outgoing = FALSE
          -- Only take the FIRST incoming message of each new streak
          AND NOT EXISTS (
              SELECT 1 FROM messages m_prev 
              WHERE m_prev.conversation_id = m_in.conversation_id 
                AND m_prev.created_at < m_in.created_at 
                AND m_prev.is_outgoing = FALSE
                AND m_prev.created_at > COALESCE(
                    (SELECT MAX(created_at) FROM messages m_last_out 
                     WHERE m_last_out.conversation_id = m_in.conversation_id 
                       AND m_last_out.created_at < m_in.created_at 
                       AND m_last_out.is_outgoing = TRUE),
                    '1970-01-01'::timestamp
                )
          )
    )
    SELECT 
        c.id,
        c.username,
        c.title,
        AVG(EXTRACT(EPOCH FROM (rp.responded_at - rp.received_at)))::FLOAT as avg_response_time,
        COUNT(rp.conversation_id)::INT as total_responses
    FROM conversations c
    JOIN response_pairs rp ON rp.conversation_id = c.id
    WHERE rp.responded_at IS NOT NULL
    GROUP BY c.id, c.username, c.title
    ORDER BY avg_response_time ASC, c.id DESC
    LIMIT $2
    """
    rows = await db.fetch(query, *params)
    
    def get_title(row):
        if row.get('username') and (not row.get('title') or str(row.get('title')).startswith('+')):
            return f"@{row['username']}"
        return row.get('title') or "Unknown User"

    return [
        RankingItem(
            id=row['id'],
            title=get_title(row),
            avg_response_time=row['avg_response_time'],
            total_responses=row['total_responses']
        ) for row in rows
    ]

@router.get("/ranking/accounts", response_model=List[RankingItem])
async def get_account_ranking(
    limit: int = 10,
    current_user = Depends(get_current_user)
):
    """
    Returns ranking of Telegram accounts by average response time for the current user.
    """
    query = """
    WITH response_pairs AS (
        SELECT 
            c.telegram_account_id,
            m_in.created_at AS received_at,
            (SELECT MIN(m_out.created_at) FROM messages m_out 
             WHERE m_out.conversation_id = c.id 
             AND m_out.created_at > m_in.created_at 
             AND m_out.is_outgoing = TRUE) AS responded_at
        FROM messages m_in
        JOIN conversations c ON m_in.conversation_id = c.id
        WHERE m_in.is_outgoing = FALSE
          AND c.type = 'private'
          AND c.telegram_peer_id != 777000
          AND c.title NOT ILIKE '%bot%'
          AND (c.username IS NULL OR c.username NOT ILIKE '%bot%')
          -- [FEATURE: Analytics Logic] Only take the FIRST message of an unreplied incoming streak
          AND NOT EXISTS (
              SELECT 1 FROM messages m_prev 
              WHERE m_prev.conversation_id = c.id 
                AND m_prev.created_at < m_in.created_at 
                AND m_prev.is_outgoing = FALSE
                AND m_prev.created_at > COALESCE(
                    (SELECT MAX(created_at) FROM messages m_last_out 
                     WHERE m_last_out.conversation_id = c.id 
                       AND m_last_out.created_at < m_in.created_at 
                       AND m_last_out.is_outgoing = TRUE),
                    '1970-01-01'::timestamp
                )
          )
    )
    SELECT 
        ta.id,
        ta.display_name as title,
        AVG(EXTRACT(EPOCH FROM (responded_at - received_at)))::FLOAT as avg_response_time,
        COUNT(rp.telegram_account_id)::INT as total_responses
    FROM telegram_accounts ta
    JOIN response_pairs rp ON ta.id = rp.telegram_account_id
    WHERE ta.user_id = $1 AND ta.is_active = TRUE AND rp.responded_at IS NOT NULL
    GROUP BY ta.id, ta.display_name
    ORDER BY avg_response_time ASC, ta.id ASC
    LIMIT $2
    """
    rows = await db.fetch(query, current_user.user_id, limit)
    return [
        RankingItem(
            id=row['id'],
            title=row['title'] or "Unknown Account",
            avg_response_time=row['avg_response_time'],
            total_responses=row['total_responses']
        ) for row in rows
    ]

@router.get("/admin/ranking/accounts", response_model=List[RankingItem])
async def get_admin_account_ranking(
    limit: int = 20
):
    """
    Admin-only: Returns ranking of ALL accounts in the system.
    """
    query = """
    WITH response_pairs AS (
        SELECT 
            c.telegram_account_id,
            m_in.created_at AS received_at,
            (SELECT MIN(m_out.created_at) FROM messages m_out 
             WHERE m_out.conversation_id = c.id 
             AND m_out.created_at > m_in.created_at 
             AND m_out.is_outgoing = TRUE) AS responded_at
        FROM messages m_in
        JOIN conversations c ON m_in.conversation_id = c.id
        WHERE m_in.is_outgoing = FALSE
          AND c.type = 'private'
          AND c.telegram_peer_id != 777000
          AND c.title NOT ILIKE '%bot%'
          AND (c.username IS NULL OR c.username NOT ILIKE '%bot%')
          -- [FEATURE: Analytics Logic] Only take the FIRST message of an unreplied incoming streak
          AND NOT EXISTS (
              SELECT 1 FROM messages m_prev 
              WHERE m_prev.conversation_id = c.id 
                AND m_prev.created_at < m_in.created_at 
                AND m_prev.is_outgoing = FALSE
                AND m_prev.created_at > COALESCE(
                    (SELECT MAX(created_at) FROM messages m_last_out 
                     WHERE m_last_out.conversation_id = c.id 
                       AND m_last_out.created_at < m_in.created_at 
                       AND m_last_out.is_outgoing = TRUE),
                    '1970-01-01'::timestamp
                )
          )
    )
    SELECT 
        ta.id,
        ta.display_name as title,
        u.email as subtitle,
        AVG(EXTRACT(EPOCH FROM (responded_at - received_at)))::FLOAT as avg_response_time,
        COUNT(rp.telegram_account_id)::INT as total_responses
    FROM telegram_accounts ta
    JOIN response_pairs rp ON ta.id = rp.telegram_account_id
    JOIN users u ON ta.user_id = u.id
    WHERE ta.is_active = TRUE AND rp.responded_at IS NOT NULL
    GROUP BY ta.id, ta.display_name, u.email
    ORDER BY avg_response_time ASC, ta.id ASC
    LIMIT $1
    """
    rows = await db.fetch(query, limit)
    return [
        RankingItem(
            id=row['id'],
            title=row['title'] or f"Account {row['id']}",
            subtitle=row['subtitle'],
            avg_response_time=row['avg_response_time'],
            total_responses=row['total_responses']
        ) for row in rows
    ]

@router.get("/admin/ranking/colleagues", response_model=List[RankingItem])
async def get_admin_colleague_ranking(
    limit: int = 20
):
    """
    Admin-only: Returns ranking of Colleagues (users) by their average response time across all their accounts.
    """
    query = """
    WITH response_pairs AS (
        SELECT 
            ta.user_id,
            m_in.created_at AS received_at,
            (SELECT MIN(m_out.created_at) FROM messages m_out 
             WHERE m_out.conversation_id = c.id 
             AND m_out.created_at > m_in.created_at 
             AND m_out.is_outgoing = TRUE) AS responded_at
        FROM messages m_in
        JOIN conversations c ON m_in.conversation_id = c.id
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE m_in.is_outgoing = FALSE
          AND c.type = 'private'
          AND c.telegram_peer_id != 777000
          AND c.title NOT ILIKE '%bot%'
          AND (c.username IS NULL OR c.username NOT ILIKE '%bot%')
          -- [FEATURE: Analytics Logic] Only take the FIRST message of an unreplied incoming streak
          AND NOT EXISTS (
              SELECT 1 FROM messages m_prev 
              WHERE m_prev.conversation_id = c.id 
                AND m_prev.created_at < m_in.created_at 
                AND m_prev.is_outgoing = FALSE
                AND m_prev.created_at > COALESCE(
                    (SELECT MAX(created_at) FROM messages m_last_out 
                     WHERE m_last_out.conversation_id = c.id 
                       AND m_last_out.created_at < m_in.created_at 
                       AND m_last_out.is_outgoing = TRUE),
                    '1970-01-01'::timestamp
                )
          )
    )
    SELECT 
        u.id,
        u.email as title,
        AVG(EXTRACT(EPOCH FROM (responded_at - received_at)))::FLOAT as avg_response_time,
        COUNT(rp.user_id)::INT as total_responses
    FROM users u
    JOIN response_pairs rp ON u.id = rp.user_id
    WHERE u.role = 'user' AND rp.responded_at IS NOT NULL
    GROUP BY u.id, u.email
    ORDER BY avg_response_time ASC, u.id ASC
    LIMIT $1
    """
    rows = await db.fetch(query, limit)
    return [
        RankingItem(
            id=row['id'],
            title=row['title'],
            avg_response_time=row['avg_response_time'],
            total_responses=row['total_responses']
        ) for row in rows
    ]

@router.get("/admin/users/{user_id}/ranking/conversations", response_model=List[RankingItem])
async def get_admin_user_conversation_ranking(
    user_id: int,
    limit: int = 10,
    account_id: Optional[int] = Query(None)
):
    """
    Admin-only: Returns ranking of ACTIVE PRIVATE chats (users only) by average response time for a specific user.
    """
    params = [user_id, limit]
    account_filter = ""
    if account_id:
        account_filter = " AND c.telegram_account_id = $3"
        params.append(account_id)

    query = f"""
    WITH user_convs AS (
        -- Scope to ONLY the target user's conversations upfront
        SELECT c.id as conv_id
        FROM conversations c
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE ta.user_id = $1
          AND c.type = 'private'
          AND c.is_archived = FALSE
          AND c.is_hidden = FALSE
          AND c.telegram_peer_id != 777000
          AND c.title NOT ILIKE '%bot%'
          AND (c.username IS NULL OR c.username NOT ILIKE '%bot%')
          {account_filter}
    ),
    response_pairs AS (
        SELECT 
            m_in.conversation_id,
            m_in.created_at AS received_at,
            (SELECT MIN(m_out.created_at) FROM messages m_out 
             WHERE m_out.conversation_id = m_in.conversation_id 
             AND m_out.created_at > m_in.created_at 
             AND m_out.is_outgoing = TRUE) AS responded_at
        FROM messages m_in
        JOIN user_convs uc ON uc.conv_id = m_in.conversation_id
        WHERE m_in.is_outgoing = FALSE
          AND NOT EXISTS (
              SELECT 1 FROM messages m_prev 
              WHERE m_prev.conversation_id = m_in.conversation_id 
                AND m_prev.created_at < m_in.created_at 
                AND m_prev.is_outgoing = FALSE
                AND m_prev.created_at > COALESCE(
                    (SELECT MAX(created_at) FROM messages m_last_out 
                     WHERE m_last_out.conversation_id = m_in.conversation_id 
                       AND m_last_out.created_at < m_in.created_at 
                       AND m_last_out.is_outgoing = TRUE),
                    '1970-01-01'::timestamp
                )
          )
    )
    SELECT 
        c.id,
        c.username,
        c.title,
        AVG(EXTRACT(EPOCH FROM (rp.responded_at - rp.received_at)))::FLOAT as avg_response_time,
        COUNT(rp.conversation_id)::INT as total_responses
    FROM conversations c
    JOIN response_pairs rp ON rp.conversation_id = c.id
    WHERE rp.responded_at IS NOT NULL
    GROUP BY c.id, c.username, c.title
    ORDER BY avg_response_time ASC, c.id DESC
    LIMIT $2
    """
    rows = await db.fetch(query, *params)
    
    def get_title(row):
        if row.get('username') and (not row.get('title') or str(row.get('title')).startswith('+')):
            return f"@{row['username']}"
        return row.get('title') or "Unknown User"

    return [
        RankingItem(
            id=row['id'],
            title=get_title(row),
            avg_response_time=row['avg_response_time'],
            total_responses=row['total_responses']
        ) for row in rows
    ]

@router.get("/admin/users/{user_id}/ranking/accounts", response_model=List[RankingItem])
async def get_admin_user_account_ranking(
    user_id: int,
    limit: int = 10
):
    """
    Admin-only: Returns ranking of Telegram accounts by average response time for a specific user.
    """
    query = """
    WITH response_pairs AS (
        SELECT 
            c.telegram_account_id,
            m_in.created_at AS received_at,
            (SELECT MIN(m_out.created_at) FROM messages m_out 
             WHERE m_out.conversation_id = c.id 
             AND m_out.created_at > m_in.created_at 
             AND m_out.is_outgoing = TRUE) AS responded_at
        FROM messages m_in
        JOIN conversations c ON m_in.conversation_id = c.id
        WHERE m_in.is_outgoing = FALSE
          AND c.type = 'private'
          AND c.telegram_peer_id != 777000
          AND c.title NOT ILIKE '%bot%'
          AND (c.username IS NULL OR c.username NOT ILIKE '%bot%')
          -- [FEATURE: Analytics Logic] Only take the FIRST message of an unreplied incoming streak
          AND NOT EXISTS (
              SELECT 1 FROM messages m_prev 
              WHERE m_prev.conversation_id = c.id 
                AND m_prev.created_at < m_in.created_at 
                AND m_prev.is_outgoing = FALSE
                AND m_prev.created_at > COALESCE(
                    (SELECT MAX(created_at) FROM messages m_last_out 
                     WHERE m_last_out.conversation_id = c.id 
                       AND m_last_out.created_at < m_in.created_at 
                       AND m_last_out.is_outgoing = TRUE),
                    '1970-01-01'::timestamp
                )
          )
    )
    SELECT 
        ta.id,
        ta.display_name as title,
        AVG(EXTRACT(EPOCH FROM (responded_at - received_at)))::FLOAT as avg_response_time,
        COUNT(rp.telegram_account_id)::INT as total_responses
    FROM telegram_accounts ta
    JOIN response_pairs rp ON ta.id = rp.telegram_account_id
    WHERE ta.user_id = $1 AND ta.is_active = TRUE AND rp.responded_at IS NOT NULL
    GROUP BY ta.id, ta.display_name
    ORDER BY avg_response_time ASC, ta.id ASC
    LIMIT $2
    """
    rows = await db.fetch(query, user_id, limit)
    return [
        RankingItem(
            id=row['id'],
            title=row['title'] or "Unknown Account",
            avg_response_time=row['avg_response_time'],
            total_responses=row['total_responses']
        ) for row in rows
    ]
