"""
Admin security module with encrypted password storage.
Uses Fernet symmetric encryption to ensure even server administrators cannot read the password.
"""
from cryptography.fernet import Fernet
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from pathlib import Path

# Password hashing for regular users
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Encryption key for admin password (stored separately from code)
# This key should be generated once and stored securely
ADMIN_KEY_FILE = Path(__file__).parent.parent.parent / ".admin_key"
ADMIN_PASSWORD_FILE = Path(__file__).parent.parent.parent / ".admin_password"

def generate_encryption_key():
    """Generate a new encryption key for admin password"""
    key = Fernet.generate_key()
    with open(ADMIN_KEY_FILE, "wb") as f:
        f.write(key)
    return key

def get_encryption_key():
    """Get or create encryption key"""
    if not ADMIN_KEY_FILE.exists():
        return generate_encryption_key()
    with open(ADMIN_KEY_FILE, "rb") as f:
        return f.read()

def encrypt_admin_password(password: str) -> bytes:
    """Encrypt admin password using Fernet symmetric encryption"""
    key = get_encryption_key()
    fernet = Fernet(key)
    return fernet.encrypt(password.encode())

def decrypt_admin_password() -> str:
    """Decrypt admin password"""
    if not ADMIN_PASSWORD_FILE.exists():
        raise ValueError("Admin password not set")
    
    key = get_encryption_key()
    fernet = Fernet(key)
    
    with open(ADMIN_PASSWORD_FILE, "rb") as f:
        encrypted_password = f.read()
    
    return fernet.decrypt(encrypted_password).decode()

def set_admin_password(password: str):
    """Set encrypted admin password"""
    encrypted = encrypt_admin_password(password)
    with open(ADMIN_PASSWORD_FILE, "wb") as f:
        f.write(encrypted)

def verify_admin_password(password: str) -> bool:
    """Verify admin password"""
    try:
        stored_password = decrypt_admin_password()
        return password == stored_password
    except Exception:
        return False

def is_admin_password_set() -> bool:
    """Check if admin password is set"""
    return ADMIN_PASSWORD_FILE.exists()

# JWT settings for admin
ADMIN_SECRET_KEY = os.getenv("ADMIN_JWT_SECRET", "admin-secret-key-change-in-production")
ADMIN_ALGORITHM = "HS256"
ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

def create_admin_access_token(data: dict):
    """Create JWT token for admin"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "admin"})
    encoded_jwt = jwt.encode(to_encode, ADMIN_SECRET_KEY, algorithm=ADMIN_ALGORITHM)
    return encoded_jwt

# HTTP Bearer token authentication
security = HTTPBearer()

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify admin JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, ADMIN_SECRET_KEY, algorithms=[ADMIN_ALGORITHM])
        
        if payload.get("type") != "admin":
            raise credentials_exception
        
        return payload
    except JWTError:
        raise credentials_exception
