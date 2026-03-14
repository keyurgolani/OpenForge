"""
Shared SQLAlchemy declarative base.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared SQLAlchemy declarative base for the backend."""


__all__ = ["Base"]
