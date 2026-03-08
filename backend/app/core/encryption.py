"""
AES-256 Encryption Service for Secure Message Storage
This module provides encryption/decryption functionality for messages using AES-256-GCM.
Designed to be modular and can be easily enabled/disabled via admin settings.
"""
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import os
import base64
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class EncryptionService:
    """
    AES-256-GCM encryption service for message data.
    Uses authenticated encryption with associated data (AEAD) for security.
    """
    
    def __init__(self, encryption_key: str):
        """
        Initialize encryption service with a key.
        
        Args:
            encryption_key: Base encryption key from environment variable
        """
        if not encryption_key:
            raise ValueError("Encryption key cannot be empty")
        
        # Derive a 256-bit key from the provided key using PBKDF2HMAC
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,  # 256 bits
            salt=b'telegram_translator_salt',  # Static salt for deterministic key derivation
            iterations=100000,
        )
        self.key = kdf.derive(encryption_key.encode())
        self.aesgcm = AESGCM(self.key)
    
    def encrypt(self, plaintext: Optional[str]) -> Optional[str]:
        """
        Encrypt plaintext using AES-256-GCM.
        
        Args:
            plaintext: Text to encrypt
            
        Returns:
            Base64-encoded encrypted data with nonce prepended, or None if input is None
        """
        if plaintext is None or plaintext == "":
            return plaintext
        
        try:
            # Generate a random 96-bit nonce (12 bytes) for GCM
            nonce = os.urandom(12)
            
            # Encrypt the data
            ciphertext = self.aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
            
            # Prepend nonce to ciphertext and encode as base64
            encrypted_data = nonce + ciphertext
            return base64.b64encode(encrypted_data).decode('utf-8')
        
        except Exception as e:
            logger.error(f"Encryption error: {e}")
            raise
    
    def decrypt(self, encrypted_data: Optional[str]) -> Optional[str]:
        """
        Decrypt AES-256-GCM encrypted data.
        
        Args:
            encrypted_data: Base64-encoded encrypted data with nonce prepended
            
        Returns:
            Decrypted plaintext, or None if input is None
        """
        if encrypted_data is None or encrypted_data == "":
            return encrypted_data
        
        try:
            # Decode from base64
            data = base64.b64decode(encrypted_data.encode('utf-8'))
            
            # Extract nonce (first 12 bytes) and ciphertext
            nonce = data[:12]
            ciphertext = data[12:]
            
            # Decrypt the data
            plaintext = self.aesgcm.decrypt(nonce, ciphertext, None)
            return plaintext.decode('utf-8')
        
        except Exception as e:
            logger.error(f"Decryption error: {e}")
            raise
    
    def encrypt_message_fields(self, original_text: Optional[str], 
                               translated_text: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """
        Encrypt both original and translated message text fields.
        
        Args:
            original_text: Original message text
            translated_text: Translated message text
            
        Returns:
            Tuple of (encrypted_original, encrypted_translated)
        """
        encrypted_original = self.encrypt(original_text) if original_text else None
        encrypted_translated = self.encrypt(translated_text) if translated_text else None
        return encrypted_original, encrypted_translated
    
    def decrypt_message_fields(self, encrypted_original: Optional[str],
                               encrypted_translated: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """
        Decrypt both original and translated message text fields.
        
        Args:
            encrypted_original: Encrypted original message text
            encrypted_translated: Encrypted translated message text
            
        Returns:
            Tuple of (decrypted_original, decrypted_translated)
        """
        decrypted_original = self.decrypt(encrypted_original) if encrypted_original else None
        decrypted_translated = self.decrypt(encrypted_translated) if encrypted_translated else None
        return decrypted_original, decrypted_translated


# Global encryption service instance
_encryption_service: Optional[EncryptionService] = None


def initialize_encryption_service(encryption_key: str):
    """
    Initialize the global encryption service instance.
    Should be called once at application startup.
    
    Args:
        encryption_key: Encryption key from environment variable
    """
    global _encryption_service
    if encryption_key:
        _encryption_service = EncryptionService(encryption_key)
        logger.info("Encryption service initialized successfully")
    else:
        logger.warning("Encryption key not provided - encryption service not initialized")


def get_encryption_service() -> Optional[EncryptionService]:
    """
    Get the global encryption service instance.
    
    Returns:
        EncryptionService instance or None if not initialized
    """
    return _encryption_service


async def is_encryption_enabled(db) -> bool:
    """
    Check if encryption is currently enabled in the system settings.
    
    Args:
        db: Database connection
        
    Returns:
        True if encryption is enabled, False otherwise
    """
    try:
        result = await db.fetchval(
            "SELECT encryption_enabled FROM system_settings WHERE id = 1"
        )
        return result if result is not None else False
    except Exception as e:
        logger.error(f"Error checking encryption status: {e}")
        return False


async def encrypt_message_if_enabled(db, original_text: Optional[str], 
                                     translated_text: Optional[str]) -> Tuple[Optional[str], Optional[str], bool]:
    """
    Encrypt message fields if encryption is enabled in settings.
    
    Args:
        db: Database connection
        original_text: Original message text
        translated_text: Translated message text
        
    Returns:
        Tuple of (processed_original, processed_translated, is_encrypted)
    """
    encryption_enabled = await is_encryption_enabled(db)
    
    if encryption_enabled and _encryption_service:
        encrypted_original, encrypted_translated = _encryption_service.encrypt_message_fields(
            original_text, translated_text
        )
        return encrypted_original, encrypted_translated, True
    
    return original_text, translated_text, False


async def decrypt_message_if_encrypted(is_encrypted: bool, original_text: Optional[str],
                                       translated_text: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Decrypt message fields if they are encrypted.
    
    Args:
        is_encrypted: Whether the message is encrypted
        original_text: Original message text (possibly encrypted)
        translated_text: Translated message text (possibly encrypted)
        
    Returns:
        Tuple of (decrypted_original, decrypted_translated)
    """
    if is_encrypted and _encryption_service:
        try:
            return _encryption_service.decrypt_message_fields(original_text, translated_text)
        except Exception as e:
            logger.error(f"Failed to decrypt message: {e}")
            return "[Decryption Error]", "[Decryption Error]"
    
    return original_text, translated_text
