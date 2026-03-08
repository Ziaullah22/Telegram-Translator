from fastapi import APIRouter, HTTPException, status, Depends
from datetime import timedelta
from app.core.config import settings
from app.core.database import db
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
)
from models import UserCreate, UserLogin, Token, UserResponse
import logging


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=Token)
async def register(user: UserCreate):
    if len(user.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long",
        )

    existing_user = await db.fetchrow(
        "SELECT id FROM users WHERE username = $1",
        user.username,
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    password_hash = get_password_hash(user.password)

    try:
        user_id = await db.fetchval(
            """
            INSERT INTO users (username, password_hash, email)
            VALUES ($1, $2, $3)
            RETURNING id
            """,
            user.username,
            password_hash,
            user.email,
        )

        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
        access_token = create_access_token(
            data={"user_id": user_id, "username": user.username},
            expires_delta=access_token_expires,
        )

        logger.info(f"New user registered: {user.username} (ID: {user_id})")

        return {"access_token": access_token, "token_type": "bearer"}

    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register user",
        )


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.fetchrow(
        "SELECT id, username, password_hash, is_active FROM users WHERE username = $1",
        credentials.username,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not user['is_active']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    if not verify_password(credentials.password, user['password_hash']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    await db.execute(
        "UPDATE users SET last_login = NOW() WHERE id = $1",
        user['id'],
    )

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"user_id": user['id'], "username": user['username']},
        expires_delta=access_token_expires,
    )

    logger.info(f"User logged in: {credentials.username} (ID: {user['id']})")

    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user = Depends(get_current_user)):
    user = await db.fetchrow(
        "SELECT id, username, email, is_active, created_at FROM users WHERE id = $1",
        current_user.user_id,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return {
        "id": user['id'],
        "username": user['username'],
        "email": user['email'],
        "is_active": user['is_active'],
        "created_at": user['created_at'],
    }



