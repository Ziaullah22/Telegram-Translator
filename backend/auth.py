from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import settings
from models import TokenData
from database import db

security = HTTPBearer()

# Verify an unhashed plaintext password against a stored bcrypt hash
def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Bcrypt has a 72-byte limit, truncate if necessary
    password_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(password_bytes, hashed_password.encode('utf-8'))

# Generate a secure bcrypt hash with salt for a plaintext password
def get_password_hash(password: str) -> str:
    # Bcrypt has a 72-byte limit, truncate if necessary
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

# Create a JSON Web Token (JWT) encoding the provided user payload data and expiration timestamp
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return encoded_jwt

# FastAPI dependency to authenticate and decode a user's JWT from authorization headers and verify their active status
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenData:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    deactivated_exception = HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Account is deactivated",
    )

    try:
        token = credentials.credentials
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id: int = payload.get("user_id")
        username: str = payload.get("username")
        impersonated_by: Optional[str] = payload.get("impersonated_by")

        if user_id is None or username is None:
            raise credentials_exception

        # Check if user is still active in database
        user = await db.fetchrow(
            "SELECT is_active FROM users WHERE id = $1",
            user_id
        )
        
        if not user:
            raise credentials_exception
            
        if not user['is_active']:
            raise deactivated_exception

        token_data = TokenData(user_id=user_id, username=username, impersonated_by=impersonated_by)
        return token_data
    except JWTError:
        raise credentials_exception
