"""
Cache infrastructure for OpenForge.

This module provides caching utilities and interfaces.
"""

from typing import Any, Optional


class CacheBackend:
    """Base cache backend interface."""
    
    async def get(self, key: str) -> Optional[Any]:
        """Get a value from cache."""
        raise NotImplementedError
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set a value in cache."""
        raise NotImplementedError
    
    async def delete(self, key: str) -> None:
        """Delete a value from cache."""
        raise NotImplementedError
    
    async def clear(self) -> None:
        """Clear all cache entries."""
        raise NotImplementedError


__all__ = ["CacheBackend"]
