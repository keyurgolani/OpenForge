from cryptography.fernet import Fernet
from openforge.config import get_settings
import logging

logger = logging.getLogger("openforge.crypto")

_fernet: Fernet | None = None


def get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        settings = get_settings()
        key = settings.encryption_key
        if not key:
            key = Fernet.generate_key().decode()
            logger.warning(
                "No encryption key set. Generated ephemeral key. "
                "Set ENCRYPTION_KEY in .env for persistence."
            )
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt_value(plaintext: str) -> bytes:
    """Encrypt a string (e.g., API key). Returns bytes for storage in BYTEA column."""
    return get_fernet().encrypt(plaintext.encode())


def decrypt_value(ciphertext: bytes) -> str:
    """Decrypt bytes back to a string."""
    return get_fernet().decrypt(ciphertext).decode()
