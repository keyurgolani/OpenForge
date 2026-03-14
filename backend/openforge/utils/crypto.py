# DEPRECATED: This module has moved to openforge.common.crypto
# This re-export is for backward compatibility only.
# Use openforge.common.crypto for new development.

import warnings

warnings.warn(
    "openforge.utils.crypto is deprecated. "
    "Use openforge.common.crypto for new development.",
    DeprecationWarning,
    stacklevel=2,
)

from openforge.common.crypto import encrypt_value, decrypt_value, get_fernet

__all__ = ['encrypt_value', 'decrypt_value', 'get_fernet']
