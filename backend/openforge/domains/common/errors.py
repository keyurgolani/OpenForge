"""
Domain-specific errors.

This module defines error classes used across domain packages.
"""


class DomainError(Exception):
    """Base error for domain operations."""
    
    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.details = details or {}


class EntityNotFoundError(DomainError):
    """Raised when an entity is not found."""
    
    def __init__(self, entity_type: str, entity_id: str):
        super().__init__(
            f"{entity_type} not found: {entity_id}",
            details={"entity_type": entity_type, "entity_id": entity_id}
        )


class EntityAlreadyExistsError(DomainError):
    """Raised when an entity already exists."""
    
    def __init__(self, entity_type: str, identifier: str):
        super().__init__(
            f"{entity_type} already exists: {identifier}",
            details={"entity_type": entity_type, "identifier": identifier}
        )


class ValidationError(DomainError):
    """Raised when validation fails."""
    
    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.field = field


class PermissionDeniedError(DomainError):
    """Raised when permission is denied."""
    
    def __init__(self, action: str, resource_type: str, resource_id: str | None = None):
        super().__init__(
            f"Permission denied: cannot {action} on {resource_type}",
            details={"action": action, "resource_type": resource_type, "resource_id": resource_id}
        )
